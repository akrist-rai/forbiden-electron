# Architecture Rebuild & Code Cleanup Plan

This document outlines the architectural refactoring and code cleanup plan for the **Forbiden IDE**. It details how to optimize the codebase, align the stack responsibilities, and resolve critical bottlenecks.

---

## 1. Architectural Stack Philosophy
The original design philosophy is restored:
1. **Go Sidecar Backend**: The main driver for all heavy computing, indexing, filesystem walks, git queries, and process spawning.
2. **Rust Tauri Core**: A lightweight native OS bridge for system dialogs, app launch, and secure IPC routing (zero TCP for file access).
3. **JavaScript (React) Frontend**: Strictly a lightweight visual presentation layer. It must not execute heavy sync filesystem walks, regex parsing on large text blocks, or repetitive CPU-expensive git polling.

---

## 2. Critical Bottlenecks & Code Remediations

### ⚠️ Bottleneck A: Zombie Go Engine Sidecar Processes (Resource Leak)
* **File to Modify**: [src-tauri/src/lib.rs](src-tauri/src/lib.rs)
* **Problem**: Spawning the Go engine sidecar process in an asynchronous OS thread using a standard `Command` structure does not kill the child process when the Tauri desktop app exits.
* **Remediation**:
  1. Store the spawned process `Child` handle in a global `static` thread-safe `Mutex`.
  2. Modify `tauri::Builder::run` to capture the exit event (`RunEvent::Exit`) and explicitly invoke `.kill()` on the child handle.

```rust
use std::sync::Mutex;
use std::process::Child;

static ENGINE_CHILD: Mutex<Option<Child>> = Mutex::new(None);

// Inside start_engine:
let mut child = Command::new(&bin_path)
    .stdin(Stdio::null())
    .stdout(Stdio::piped())
    .stderr(Stdio::null())
    .spawn()
    .expect("Failed to spawn sidecar");

if let Ok(mut guard) = ENGINE_CHILD.lock() {
    *guard = Some(child);
}

// Inside run():
let app = tauri::Builder::default()
    .setup(move |app| {
        start_engine(engine_url_clone, resolve_engine_path(app));
        Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application");

app.run(move |_app_handle, event| {
    if let tauri::RunEvent::Exit = event {
        if let Ok(mut guard) = ENGINE_CHILD.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
            }
        }
    }
});
```

---

### ⚠️ Bottleneck B: React Re-render Storms on Editor Keystrokes (Typing Lag)
* **File to Modify**: [src/pages/IDE/index.tsx](src/pages/IDE/index.tsx)
* **Problem**: On every single keystroke in the CodeMirror editor, the callback `updateNodeCode` modifies `nodesRef.current` and triggers a full-page force render (`forceRender({})`). This forces the entire workspace HUD, terminal, list panels, and other graph nodes to reconcile, causing typing lag.
* **Remediation**: Since CodeMirror maintains its own document buffer, React only needs to render when the "modified" status of the node transitions from `false` to `true` (to display the dirty dot in the tab list). Skip triggering `forceRender` on all subsequent keystrokes while the file remains dirty.

```typescript
const updateNodeCode = (id: string, code: string) => {
  let wasModified = false;
  nodesRef.current = nodesRef.current.map(n => {
    if (n.id === id) {
      wasModified = n.modified;
      return { ...n, code, modified: true };
    }
    return n;
  });

  // Only trigger forceRender if transitioning from saved (clean) to modified (dirty)
  if (!wasModified) {
    forceRender({});
  }

  clearTimeout(codeEditTimerRef.current[id]);
  codeEditTimerRef.current[id] = setTimeout(() => {
    const node = nodesRef.current.find(n => n.id === id);
    if (node) addEvent('code-edit', `Edited ${node.label}`, { nodeId: id });
    saveNodeToDisk(id);
  }, 1500);
};
```

---

### ⚠️ Bottleneck C: State Wiping & CodeMirror 6 Re-creation
* **File to Modify**: [src/components/CodeMirrorEditor.tsx](src/components/CodeMirrorEditor.tsx)
* **Problem**: Dynamic settings such as theme change (`palette.id` effect) and word wrap toggle (`wordWrap` effect) completely destroy the `EditorView` or recreate the `EditorState` from scratch. This wipes the editor's cursor position, selection ranges, scroll position, and undo/redo history.
* **Remediation**: Integrate CodeMirror 6's native `Compartment` system to dynamically reconfigure theme extensions and word wrap.

```typescript
import { Compartment } from '@codemirror/state'

// Define compartments at module/component level
const themeCompartment = new Compartment();
const wrapCompartment = new Compartment();

// Include compartments inside the initial extensions array:
const extensions = [
  themeCompartment.of(buildTheme(palette)),
  wrapCompartment.of(wordWrap ? EditorView.lineWrapping : []),
  // other extensions...
]

// To update theme dynamic layout:
view.dispatch({
  effects: themeCompartment.reconfigure(buildTheme(newPalette))
});

// To update word wrapping dynamic status:
view.dispatch({
  effects: wrapCompartment.reconfigure(wordWrap ? EditorView.lineWrapping : [])
});
```

---

### ⚠️ Bottleneck D: Multiple Overlapping 20,000px SVG Elements (GPU Overload)
* **File to Modify**: [src/pages/IDE/index.tsx](src/pages/IDE/index.tsx)
* **Problem**: The group convex hulls are drawn using individual `<svg>` elements per group, each sized at `width={19998} height={19998}` and positioned at `left:-9999px` to support center translation. Multiple overlapping layers of this size exhaust GPU compositor resources, lagging canvas pan and zoom operations.
* **Remediation**: Consolidate group convex hull renderings. Place them inside the single, already-existing background `Edges SVG` canvas container right before the connector paths, eliminating layer redundancy.

```xml
{/* Consolidated SVG Canvas Layer */}
<svg style={{ position: 'absolute', left: -9999, top: -9999, width: 19998, height: 19998, overflow: 'visible', pointerEvents: 'none' }}>
  <g transform="translate(9999,9999)">
    {/* Group convex hulls rendered at the bottom level */}
    {groupsRef.current.map(grp => {
       const pts = visibleNodes.filter(n => grp.nodeIds.includes(n.id)).map(n => [n.x, n.y]);
       const hull = convexHull(pts);
       if (hull.length < 2) return null;
       const expanded = expandHull(hull);
       const pointsStr = expanded.map(p => p.join(',')).join(' ');
       return (
         <polygon key={grp.id} points={pointsStr} fill={grp.color} fillOpacity="0.07" stroke={grp.color} strokeWidth="1.5" />
       );
    })}

    {/* Connection edges rendered on top of hulls */}
    {visibleEdges.map(e => <path key={e.id} ... />)}
  </g>
</svg>
```

---

### ⚠️ Bottleneck E: Physics Loop Complexity of O(E * N) per frame
* **File to Modify**: [src/pages/IDE/index.tsx](src/pages/IDE/index.tsx)
* **Problem**: The physics tick loop runs a double `find` lookup to find the source and target node objects for *each* edge: `nds.find(n => n.id === edge.source)`. This is an $O(N)$ lookup on every edge, resulting in $O(E \times N)$ time complexity. At 50 nodes and 100 edges, this processes ~10,000 checks every tick (30–60 times a second).
* **Remediation**: At the start of the `tick()` function, build a temporary `Map<string, Node>` key-indexed by node ID. This turns node lookup into an $O(1)$ operation, reducing total complexity to $O(E + N)$.

```typescript
const tick = (now: number) => {
  const nds = nodesRef.current, eds = edgesRef.current;
  
  // Build O(1) Lookup Map
  const nodeMap = new Map();
  for (let i = 0; i < nds.length; i++) {
    nodeMap.set(nds[i].id, nds[i]);
  }

  // Optimize Edge Attraction Loop from O(E * N) to O(E)
  eds.forEach(edge => {
    const src = nodeMap.get(edge.source);
    const tgt = nodeMap.get(edge.target);
    if (!src || !tgt) return;
    const dx = tgt.x - src.x, dy = tgt.y - src.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const force = (dist - 110) * 0.05;
    src.vx += (dx / dist) * force;
    src.vy += (dy / dist) * force;
    tgt.vx -= (dx / dist) * force;
    tgt.vy -= (dy / dist) * force;
  });
  
  // Node repulsions and position updates...
};
```

---

### ⚠️ Bottleneck F: Heavy Sync Filesystem Walks in Rust Tauri (IPC Blocking)
* **File to Modify**: [src-tauri/src/lib.rs](src-tauri/src/lib.rs)
* **Problem**: Tauri commands like `fs_tree`, `fs_search`, `fs_list_all`, and `fs_scan_imports` execute recursive directory walks and file reading synchronously on the async Tauri runtime thread pool. This stalls Tauri's backend execution pipeline.
* **Remediation**: Aligning with the backend philosophy, offload directory traversal, imports scanning, and file indexing to the Go sidecar engine, which can handle heavy searches and walks concurrently using Goroutines and push results back.

---

### ⚠️ Bottleneck G: Continuous Git Polling
* **File to Modify**: [src/components/GitPanelV2.tsx](src/components/GitPanelV2.tsx)
* **Problem**: The git panel polls `git status` and `git log` every 5 seconds via `setInterval`. This constantly forks external `git` processes in the background, spiking CPU and Disk I/O when idle.
* **Remediation**: Eliminate the `setInterval` polling loop. Leverage the existing `/ws/watch` file-watcher WebSocket connection. Whenever a filesystem change is detected (or when the window is focused), fire a debounced Git panel status refresh.

---

## 3. Implementation Verification Checklist
1. **Sidecar Cleanup**: Start IDE, close it, and verify in the system monitor (`htop`/`ps`) that `forbiden-engine` processes are terminated.
2. **Editor Performance**: Open a large script file, type continuously, and verify CPU usage is minimal with zero lag. Verify theme switching preserves undo history.
3. **Canvas Performance**: Zoom and pan on the board with groups and hulls enabled. Verify the frame rate is locked at a stable level.
4. **Git Operations**: Verify that editing a file reactively triggers a status change on the Git panel, and the 5-second polling loop process forks are gone.
