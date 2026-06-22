use std::io::BufRead;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{Manager, State};

// ── Engine state ───────────────────────────────────────────────

struct EngineState {
    url: Arc<Mutex<Option<String>>>,
}

static ENGINE_CHILD: Mutex<Option<std::process::Child>> = Mutex::new(None);

// ── Tauri commands ─────────────────────────────────────────────

#[tauri::command]
fn get_engine_url(state: State<EngineState>) -> String {
    state.url.lock().unwrap().clone().unwrap_or_else(|| "http://127.0.0.1:49373".to_string())
}

#[tauri::command]
fn get_home_dir() -> String {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| "/".to_string())
}

#[tauri::command]
fn get_platform() -> String {
    std::env::consts::OS.to_string()
}

// ── Engine path resolution (desktop only) ─────────────────────

fn resolve_engine_path(app: &tauri::App) -> PathBuf {
    let bin_name = if cfg!(target_os = "windows") { "sanction-engine.exe" } else { "sanction-engine" };

    if cfg!(debug_assertions) {
        let exe = std::env::current_exe().unwrap_or_default();
        let mut dir = exe.parent().map(|p| p.to_path_buf()).unwrap_or_default();
        for _ in 0..6 {
            let candidate = dir.join("engine").join(bin_name);
            if candidate.exists() { return candidate; }
            if let Some(p) = dir.parent() { dir = p.to_path_buf(); } else { break; }
        }
        return PathBuf::from("engine").join(bin_name);
    }

    let target = std::env::var("TAURI_ENV_TARGET_TRIPLE").unwrap_or_else(|_| {
        format!("{}-{}-{}", std::env::consts::ARCH, "unknown", std::env::consts::OS)
    });
    let sidecar = format!("{}-{}", bin_name, target);
    if let Ok(res) = app.path().resource_dir() {
        let p = res.join(&sidecar);
        if p.exists() { return p; }
        let p2 = res.join(bin_name);
        if p2.exists() { return p2; }
    }
    let exe_dir = std::env::current_exe()
        .ok().and_then(|e| e.parent().map(|p| p.to_path_buf())).unwrap_or_default();
    let p = exe_dir.join(&sidecar);
    if p.exists() { return p; }
    exe_dir.join(bin_name)
}

// ── Start engine process ───────────────────────────────────────

fn start_engine(engine_url: Arc<Mutex<Option<String>>>, bin_path: PathBuf) {
    std::thread::spawn(move || {
        if !bin_path.exists() {
            eprintln!("[engine] not found: {:?}", bin_path);
            return;
        }
        let mut child = match Command::new(&bin_path)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
        {
            Ok(c) => c,
            Err(e) => { eprintln!("[engine] spawn error: {e}"); return; }
        };
        let stdout = child.stdout.take();
        if let Ok(mut g) = ENGINE_CHILD.lock() { *g = Some(child); }
        if let Some(stdout) = stdout {
            for line in std::io::BufReader::new(stdout).lines().flatten() {
                if let Some(port) = line.strip_prefix("READY:") {
                    let url = format!("http://127.0.0.1:{}", port.trim());
                    *engine_url.lock().unwrap() = Some(url.clone());
                    println!("[engine] ready at {url}");
                    break;
                }
            }
        }
    });
}

// ── Entry point ────────────────────────────────────────────────

pub fn run() {
    let engine_url: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
    let engine_url_clone = engine_url.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .manage(EngineState { url: engine_url })
        .setup(move |app| {
            start_engine(engine_url_clone, resolve_engine_path(app));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_engine_url,
            get_home_dir,
            get_platform,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(move |_app_handle, event| {
            match event {
                tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit => {
                    if let Ok(mut g) = ENGINE_CHILD.lock() {
                        if let Some(mut child) = g.take() {
                            println!("[engine] shutting down");
                            let _ = child.kill();
                            let _ = child.wait();
                        }
                    }
                }
                _ => {}
            }
        });
}
