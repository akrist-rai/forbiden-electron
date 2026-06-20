use std::io::BufRead;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{Manager, State};

// ── App state ──────────────────────────────────────────────────

struct EngineState {
    url: Arc<Mutex<Option<String>>>,
}

// ── Helpers ────────────────────────────────────────────────────

fn config_dir() -> PathBuf {
    dirs_from_env().join("forbiden")
}

fn dirs_from_env() -> PathBuf {
    if let Ok(d) = std::env::var("XDG_CONFIG_HOME") {
        return PathBuf::from(d);
    }
    if let Ok(h) = std::env::var("HOME") {
        return PathBuf::from(h).join(".config");
    }
    PathBuf::from("/tmp")
}

fn extended_path() -> String {
    let home = std::env::var("HOME").unwrap_or_default();
    let extras = vec![
        "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin",
        "/snap/bin", "/opt/homebrew/bin",
    ];
    let mut parts: Vec<String> = std::env::var("PATH")
        .unwrap_or_default()
        .split(':')
        .map(|s| s.to_string())
        .collect();
    for e in &extras { parts.push(e.to_string()); }
    parts.push(format!("{home}/go/bin"));
    parts.push(format!("{home}/.cargo/bin"));
    parts.push(format!("{home}/.bun/bin"));
    parts.push(format!("{home}/.local/bin"));
    let mut seen = std::collections::HashSet::new();
    let deduped: Vec<_> = parts.into_iter().filter(|p| !p.is_empty() && seen.insert(p.clone())).collect();
    deduped.join(":")
}

fn run_git(args: &[&str], cwd: &str) -> Result<String, String> {
    let mut cmd = Command::new("git");
    cmd.args(args).current_dir(cwd)
       .env("PATH", extended_path());
    let out = cmd.output().map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

static IGNORE_DIRS: &[&str] = &[
    "node_modules", ".git", "dist", "build", ".next", "__pycache__",
    ".venv", "venv", ".cache", "coverage", "target", "out", "vendor",
];

fn should_ignore(name: &str) -> bool {
    IGNORE_DIRS.contains(&name) || name.starts_with('.')
}

// ── Already-existing commands (keep) ──────────────────────────

#[tauri::command]
fn get_engine_url(state: State<EngineState>) -> String {
    state.url.lock().unwrap().clone().unwrap_or_else(|| "http://127.0.0.1:49373".to_string())
}

#[tauri::command]
fn get_home_dir() -> String {
    std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")).unwrap_or_else(|_| "/".to_string())
}

#[tauri::command]
fn get_platform() -> String {
    std::env::consts::OS.to_string()
}

#[tauri::command]
async fn terminal_exec(cmd: String, cwd: String) -> Result<serde_json::Value, String> {
    let effective_cwd = if cwd.is_empty() {
        std::env::current_dir().unwrap_or_default().to_string_lossy().to_string()
    } else { cwd };
    let output = tokio::process::Command::new("sh")
        .arg("-c").arg(&cmd)
        .current_dir(&effective_cwd)
        .env("PATH", extended_path())
        .output().await.map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "stdout": String::from_utf8_lossy(&output.stdout),
        "stderr": String::from_utf8_lossy(&output.stderr),
    }))
}

// ── FS commands ────────────────────────────────────────────────

#[derive(serde::Serialize)]
struct FsNode {
    name: String,
    path: String,
    #[serde(rename = "type")]
    kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    ext: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    children: Option<Vec<FsNode>>,
}

fn build_tree(p: &Path, depth: u32, max_depth: u32) -> FsNode {
    let name = p.file_name().unwrap_or_default().to_string_lossy().to_string();
    let ext = p.extension().map(|e| e.to_string_lossy().to_lowercase());
    if !p.is_dir() {
        return FsNode { name, path: p.to_string_lossy().to_string(), kind: "file".into(), ext, children: None };
    }
    let mut children = vec![];
    if depth < max_depth {
        if let Ok(entries) = std::fs::read_dir(p) {
            let mut dirs = vec![];
            let mut files = vec![];
            for entry in entries.flatten() {
                let n = entry.file_name().to_string_lossy().to_string();
                if should_ignore(&n) { continue; }
                if entry.path().is_dir() { dirs.push(entry.path()); } else { files.push(entry.path()); }
            }
            dirs.sort(); files.sort();
            for d in dirs { children.push(build_tree(&d, depth + 1, max_depth)); }
            for f in files { children.push(build_tree(&f, depth + 1, max_depth)); }
        }
    }
    FsNode { name, path: p.to_string_lossy().to_string(), kind: "dir".into(), ext: None, children: Some(children) }
}

#[tauri::command]
async fn fs_tree(root_path: String, max_depth: Option<u32>) -> serde_json::Value {
    let tree = build_tree(Path::new(&root_path), 0, max_depth.unwrap_or(6));
    serde_json::json!({ "success": true, "tree": tree })
}

#[tauri::command]
async fn fs_read(file_path: String) -> serde_json::Value {
    match std::fs::read_to_string(&file_path) {
        Ok(c) => serde_json::json!({ "success": true, "content": c }),
        Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
    }
}

#[tauri::command]
async fn fs_write(file_path: String, content: String) -> serde_json::Value {
    if let Some(p) = Path::new(&file_path).parent() {
        let _ = std::fs::create_dir_all(p);
    }
    match std::fs::write(&file_path, content.as_bytes()) {
        Ok(_) => serde_json::json!({ "success": true }),
        Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
    }
}

#[tauri::command]
async fn fs_create_file(file_path: String) -> serde_json::Value {
    if Path::new(&file_path).exists() {
        return serde_json::json!({ "success": false, "error": "File already exists" });
    }
    if let Some(p) = Path::new(&file_path).parent() { let _ = std::fs::create_dir_all(p); }
    match std::fs::write(&file_path, b"") {
        Ok(_) => serde_json::json!({ "success": true }),
        Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
    }
}

#[tauri::command]
async fn fs_create_dir(folder_path: String) -> serde_json::Value {
    match std::fs::create_dir_all(&folder_path) {
        Ok(_) => serde_json::json!({ "success": true }),
        Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
    }
}

#[tauri::command]
async fn fs_delete(item_path: String) -> serde_json::Value {
    let r = if Path::new(&item_path).is_dir() {
        std::fs::remove_dir_all(&item_path)
    } else {
        std::fs::remove_file(&item_path)
    };
    match r {
        Ok(_) => serde_json::json!({ "success": true }),
        Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
    }
}

#[tauri::command]
async fn fs_rename(old_path: String, new_path: String) -> serde_json::Value {
    match std::fs::rename(&old_path, &new_path) {
        Ok(_) => serde_json::json!({ "success": true }),
        Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
    }
}

#[tauri::command]
async fn fs_copy_file(src_path: String, dest_path: String) -> serde_json::Value {
    match std::fs::copy(&src_path, &dest_path) {
        Ok(_) => serde_json::json!({ "success": true }),
        Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
    }
}

#[tauri::command]
async fn fs_copy_folder(src_path: String, dest_path: String) -> serde_json::Value {
    fn copy_dir(src: &Path, dst: &Path) -> std::io::Result<()> {
        std::fs::create_dir_all(dst)?;
        for e in std::fs::read_dir(src)?.flatten() {
            let dst_p = dst.join(e.file_name());
            if e.path().is_dir() { copy_dir(&e.path(), &dst_p)?; } else { std::fs::copy(e.path(), dst_p)?; }
        }
        Ok(())
    }
    match copy_dir(Path::new(&src_path), Path::new(&dest_path)) {
        Ok(_) => serde_json::json!({ "success": true }),
        Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
    }
}

#[tauri::command]
async fn fs_list_all(root_path: String, max_files: Option<usize>) -> serde_json::Value {
    let limit = max_files.unwrap_or(5000);
    let mut results = vec![];
    fn walk(dir: &Path, rel: &str, results: &mut Vec<serde_json::Value>, limit: usize) {
        if results.len() >= limit { return; }
        if let Ok(entries) = std::fs::read_dir(dir) {
            for e in entries.flatten() {
                let n = e.file_name().to_string_lossy().to_string();
                if n.starts_with('.') || IGNORE_DIRS.contains(&&*n) { continue; }
                let full = e.path().to_string_lossy().to_string();
                let rel_p = if rel.is_empty() { n.clone() } else { format!("{rel}/{n}") };
                if e.path().is_dir() { walk(&e.path(), &rel_p, results, limit); }
                else { results.push(serde_json::json!({"path":full,"rel":rel_p,"name":n})); }
            }
        }
    }
    walk(Path::new(&root_path), "", &mut results, limit);
    serde_json::Value::Array(results)
}

#[tauri::command]
async fn fs_search(root_path: String, query: String, max_results: Option<usize>) -> serde_json::Value {
    if query.len() < 2 { return serde_json::json!([]); }
    let limit = max_results.unwrap_or(300);
    let lower = query.to_lowercase();
    let text_exts = &[".js",".ts",".tsx",".jsx",".py",".go",".c",".cpp",".h",".md",".json",".css",".html",".txt",".yaml",".yml",".toml",".rs",".sh"];
    let mut results = vec![];
    fn walk(dir: &Path, rel: &str, lower: &str, text_exts: &[&str], results: &mut Vec<serde_json::Value>, limit: usize) {
        if results.len() >= limit { return; }
        if let Ok(entries) = std::fs::read_dir(dir) {
            for e in entries.flatten() {
                let n = e.file_name().to_string_lossy().to_string();
                if n.starts_with('.') || IGNORE_DIRS.contains(&&*n) { continue; }
                let rel_p = if rel.is_empty() { n.clone() } else { format!("{rel}/{n}") };
                if e.path().is_dir() { walk(&e.path(), &rel_p, lower, text_exts, results, limit); }
                else {
                    let ext = e.path().extension().map(|x| format!(".{}", x.to_string_lossy().to_lowercase())).unwrap_or_default();
                    if !text_exts.contains(&&*ext) { continue; }
                    if let Ok(content) = std::fs::read_to_string(e.path()) {
                        for (i, line) in content.lines().enumerate() {
                            let ll = line.to_lowercase();
                            if let Some(col) = ll.find(lower) {
                                let text = line.trim().chars().take(200).collect::<String>();
                                results.push(serde_json::json!({"file":rel_p,"fullPath":e.path().to_string_lossy(),"line":i+1,"text":text,"col":col}));
                                if results.len() >= limit { return; }
                            }
                        }
                    }
                }
            }
        }
    }
    walk(Path::new(&root_path), "", &lower, text_exts, &mut results, limit);
    serde_json::Value::Array(results)
}

#[tauri::command]
async fn fs_get_scripts(root_path: String) -> serde_json::Value {
    let pkg = Path::new(&root_path).join("package.json");
    if let Ok(data) = std::fs::read_to_string(&pkg) {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&data) {
            if let Some(scripts) = v["scripts"].as_object() {
                let list: Vec<_> = scripts.iter().map(|(k,v)| serde_json::json!({"name":k,"cmd":v,"source":"npm"})).collect();
                let name = v["name"].as_str().unwrap_or("").to_string();
                return serde_json::json!({"success":true,"scripts":list,"type":"npm","name":name});
            }
        }
    }
    serde_json::json!({"success":false,"scripts":[],"type":"none"})
}

#[tauri::command]
async fn fs_format_code(code: String, lang: String) -> serde_json::Value {
    let ext = match lang.as_str() {
        "go" => "go", "py" => "py", "js"|"jsx" => "js", "ts"|"tsx" => "ts",
        "css" => "css", "json" => "json", "html" => "html",
        _ => return serde_json::json!({"success":false,"error":"No formatter"}),
    };
    let mut tmp = std::env::temp_dir();
    tmp.push(format!("forbiden_fmt_{}.{ext}", std::process::id()));
    let _ = std::fs::write(&tmp, code.as_bytes());
    let cmd_str = match lang.as_str() {
        "go" => format!("gofmt -w {}", tmp.display()),
        "py" => format!("black {} 2>&1 || autopep8 --in-place {}", tmp.display(), tmp.display()),
        _ => format!("npx --yes prettier --write {}", tmp.display()),
    };
    let out = Command::new("sh").arg("-c").arg(&cmd_str).env("PATH", extended_path()).output();
    let result = match out {
        Ok(o) if o.status.success() => std::fs::read_to_string(&tmp).ok(),
        _ => None,
    };
    let _ = std::fs::remove_file(&tmp);
    match result {
        Some(c) => serde_json::json!({"success":true,"code":c}),
        None => serde_json::json!({"success":false,"error":"Format failed"}),
    }
}

// ── Workspace ──────────────────────────────────────────────────

fn workspace_file() -> PathBuf { config_dir().join("workspace.json") }
fn recent_file() -> PathBuf { config_dir().join("recent-workspaces.json") }

#[tauri::command]
async fn workspace_get() -> serde_json::Value {
    match std::fs::read_to_string(workspace_file()) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_else(|_| serde_json::json!({"path":null})),
        Err(_) => serde_json::json!({"path":null}),
    }
}

#[tauri::command]
async fn workspace_save(workspace_path: String) -> serde_json::Value {
    let _ = std::fs::create_dir_all(config_dir());
    let data = serde_json::json!({"path": workspace_path}).to_string();
    match std::fs::write(workspace_file(), data.as_bytes()) {
        Ok(_) => serde_json::json!({"success":true}),
        Err(e) => serde_json::json!({"success":false,"error":e.to_string()}),
    }
}

#[tauri::command]
async fn workspace_recent_get() -> serde_json::Value {
    let list: Vec<String> = std::fs::read_to_string(recent_file())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    serde_json::json!(list)
}

#[tauri::command]
async fn workspace_recent_add(workspace_path: String) -> serde_json::Value {
    let mut list: Vec<String> = std::fs::read_to_string(recent_file())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    list.retain(|p| p != &workspace_path);
    list.insert(0, workspace_path);
    list.truncate(10);
    let _ = std::fs::create_dir_all(config_dir());
    let _ = std::fs::write(recent_file(), serde_json::json!(list).to_string().as_bytes());
    serde_json::json!({"success":true})
}

#[tauri::command]
async fn workspace_ensure_default() -> serde_json::Value {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    let docs = PathBuf::from(&home).join("Documents");
    let base = if docs.is_dir() { docs } else { PathBuf::from(&home) };
    let ws = base.join("FORBIDEN");
    let _ = std::fs::create_dir_all(&ws);
    let main_js = ws.join("main.js");
    if !main_js.exists() {
        let _ = std::fs::write(main_js, b"// FORBIDEN entry point\nconsole.log('ready')\n");
    }
    serde_json::json!({"success":true,"path":ws.to_string_lossy()})
}

// ── Git commands ───────────────────────────────────────────────

#[tauri::command]
async fn git_status(cwd: String) -> serde_json::Value {
    let porcelain = run_git(&["status","--porcelain"], &cwd).unwrap_or_default();
    let branch = run_git(&["branch","--show-current"], &cwd).unwrap_or_else(|_| "main".into());
    let files: Vec<_> = porcelain.lines().filter(|l| l.len() > 2)
        .map(|l| serde_json::json!({"state":l[..2].trim(),"path":l[3..].trim()}))
        .collect();
    serde_json::json!({"branch":branch,"files":files,"raw":porcelain})
}

#[tauri::command]
async fn git_log(cwd: String) -> serde_json::Value {
    let out = run_git(&["log","--oneline","--decorate","-30"], &cwd).unwrap_or_default();
    let commits: Vec<_> = out.lines().filter(|l| !l.is_empty()).filter_map(|l| {
        let mut p = l.splitn(2, ' ');
        Some(serde_json::json!({"hash":p.next()?,"message":p.next().unwrap_or("")}))
    }).collect();
    serde_json::json!(commits)
}

#[tauri::command]
async fn git_log_graph(cwd: String, limit: Option<u32>) -> serde_json::Value {
    let n = format!("-{}", limit.unwrap_or(60));
    let fmt = "--pretty=format:%H|%P|%D|%s|%an|%ar";
    let out = match run_git(&["log", fmt, &n, "--all"], &cwd) {
        Ok(o) => o,
        Err(e) => return serde_json::json!({"success":false,"error":e,"commits":[]}),
    };
    let commits: Vec<_> = out.lines().filter(|l| !l.is_empty()).map(|l| {
        let p: Vec<&str> = l.splitn(6, '|').collect();
        let parents: Vec<&str> = p.get(1).unwrap_or(&"").split_whitespace().filter(|s| !s.is_empty()).collect();
        let refs: Vec<&str> = p.get(2).unwrap_or(&"").split(',').map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
        serde_json::json!({"hash":p.get(0).unwrap_or(&""),"parents":parents,"refs":refs,"subject":p.get(3).unwrap_or(&""),"author":p.get(4).unwrap_or(&""),"reltime":p.get(5).unwrap_or(&"")})
    }).collect();
    serde_json::json!({"success":true,"commits":commits})
}

#[tauri::command] async fn git_branch(cwd: String) -> serde_json::Value { serde_json::json!(run_git(&["branch","--show-current"],&cwd).unwrap_or_else(|_|"main".into())) }

#[tauri::command]
async fn git_branches(cwd: String) -> serde_json::Value {
    let out = run_git(&["branch","-a"], &cwd).unwrap_or_default();
    let b: Vec<_> = out.lines().map(|l| l.trim_start_matches('*').trim()).filter(|l| !l.is_empty()).map(|l| serde_json::json!(l)).collect();
    serde_json::json!(b)
}

#[tauri::command]
async fn git_commit(cwd: String, message: String) -> serde_json::Value {
    if let Err(e) = run_git(&["add","-A"], &cwd) { return serde_json::json!({"success":false,"error":e}); }
    match run_git(&["commit","-m",&message], &cwd) {
        Ok(o) => serde_json::json!({"success":true,"output":o}),
        Err(e) => serde_json::json!({"success":false,"error":e}),
    }
}

#[tauri::command]
async fn git_stage(cwd: String, files: Vec<String>) -> serde_json::Value {
    let mut args = vec!["add","--"];
    let refs: Vec<&str> = files.iter().map(|s| s.as_str()).collect();
    args.extend_from_slice(&refs);
    match run_git(&args, &cwd) {
        Ok(_) => serde_json::json!({"success":true}),
        Err(e) => serde_json::json!({"success":false,"error":e}),
    }
}

#[tauri::command]
async fn git_unstage(cwd: String, files: Vec<String>) -> serde_json::Value {
    let mut args = vec!["restore","--staged","--"];
    let refs: Vec<&str> = files.iter().map(|s| s.as_str()).collect();
    args.extend_from_slice(&refs);
    match run_git(&args, &cwd) {
        Ok(_) => serde_json::json!({"success":true}),
        Err(e) => serde_json::json!({"success":false,"error":e}),
    }
}

#[tauri::command]
async fn git_checkout(cwd: String, branch: String) -> serde_json::Value {
    match run_git(&["checkout",&branch], &cwd) {
        Ok(_) => serde_json::json!({"success":true}),
        Err(e) => serde_json::json!({"success":false,"error":e}),
    }
}

#[tauri::command]
async fn git_push(cwd: String) -> serde_json::Value {
    match run_git(&["push"], &cwd) {
        Ok(o) => serde_json::json!({"success":true,"output":o}),
        Err(e) => serde_json::json!({"success":false,"error":e}),
    }
}

#[tauri::command]
async fn git_pull(cwd: String) -> serde_json::Value {
    match run_git(&["pull"], &cwd) {
        Ok(o) => serde_json::json!({"success":true,"output":o}),
        Err(e) => serde_json::json!({"success":false,"error":e}),
    }
}

#[tauri::command] async fn git_stash(cwd: String) -> serde_json::Value { match run_git(&["stash"],&cwd){Ok(_)=>serde_json::json!({"success":true}),Err(e)=>serde_json::json!({"success":false,"error":e})} }
#[tauri::command] async fn git_stash_pop(cwd: String) -> serde_json::Value { match run_git(&["stash","pop"],&cwd){Ok(_)=>serde_json::json!({"success":true}),Err(e)=>serde_json::json!({"success":false,"error":e})} }
#[tauri::command] async fn git_init(cwd: String) -> serde_json::Value { match run_git(&["init"],&cwd){Ok(_)=>serde_json::json!({"success":true}),Err(e)=>serde_json::json!({"success":false,"error":e})} }

#[tauri::command]
async fn git_discard(cwd: String, file: String) -> serde_json::Value {
    match run_git(&["restore","--",&file], &cwd) {
        Ok(_) => serde_json::json!({"success":true}),
        Err(_) => match run_git(&["checkout","--",&file], &cwd) {
            Ok(_) => serde_json::json!({"success":true}),
            Err(e) => serde_json::json!({"success":false,"error":e}),
        }
    }
}

#[tauri::command]
async fn git_diff(cwd: String, file: String) -> serde_json::Value {
    // file param handled below
    // simplified - just pass file if not empty
    let result = if file.is_empty() {
        run_git(&["diff","HEAD"], &cwd).or_else(|_| run_git(&["diff"], &cwd))
    } else {
        run_git(&["diff","HEAD","--",&file], &cwd).or_else(|_| run_git(&["diff","--",&file], &cwd))
    };
    match result {
        Ok(d) => serde_json::json!({"success":true,"diff":d}),
        Err(e) => serde_json::json!({"success":false,"error":e,"diff":""}),
    }
}

#[tauri::command]
async fn git_blame(cwd: String, file: String) -> serde_json::Value {
    match run_git(&["blame","--line-porcelain",&file], &cwd) {
        Ok(o) => serde_json::json!({"success":true,"raw":o}),
        Err(e) => serde_json::json!({"success":false,"error":e,"lines":[]}),
    }
}

// ── Run code ───────────────────────────────────────────────────

fn build_run_cmd(lang: &str, file: &str) -> Option<String> {
    match lang {
        "js"|"jsx" => {
            if Command::new("bun").arg("--version").output().is_ok() { return Some(format!("bun run {file}")); }
            if Command::new("node").arg("--version").output().is_ok() { return Some(format!("node {file}")); }
            None
        }
        "ts"|"tsx" => {
            if Command::new("bun").arg("--version").output().is_ok() { return Some(format!("bun run {file}")); }
            None
        }
        "py" => {
            for b in &["python3","python"] {
                if Command::new(b).arg("--version").output().is_ok() { return Some(format!("{b} {file}")); }
            }
            None
        }
        "go" => Some(format!("go run {file}")),
        "c" => {
            let out = file.trim_end_matches('.').to_string() + ".out";
            for cc in &["gcc","clang","cc"] {
                if Command::new(cc).arg("--version").output().is_ok() {
                    return Some(format!("{cc} -o {out} {file} -lm && {out}"));
                }
            }
            None
        }
        "cpp" => {
            let out = file.trim_end_matches('.').to_string() + ".out";
            for cc in &["g++","clang++","c++"] {
                if Command::new(cc).arg("--version").output().is_ok() {
                    return Some(format!("{cc} -o {out} {file} && {out}"));
                }
            }
            None
        }
        _ => None,
    }
}

#[tauri::command]
async fn run_code(lang: String, code: String, stdin: Option<String>, cwd: Option<String>) -> serde_json::Value {
    let ext = match lang.as_str() { "js" => "js","jsx"=>"jsx","ts"=>"ts","tsx"=>"tsx","py"=>"py","go"=>"go","c"=>"c","cpp"=>"cpp",_=>"txt" };
    let mut tmp = std::env::temp_dir();
    tmp.push(format!("forbiden_{}_{}.{ext}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_nanos()));
    let _ = std::fs::write(&tmp, code.as_bytes());
    let cmd_str = match build_run_cmd(&lang, &tmp.to_string_lossy()) {
        Some(c) => c,
        None => {
            let _ = std::fs::remove_file(&tmp);
            return serde_json::json!({"logs":[{"type":"error","val":format!("no runtime for {lang}"),"ts":0}],"error":"unsupported","ms":0});
        }
    };
    let t0 = std::time::Instant::now();
    let mut cmd = Command::new("sh");
    cmd.arg("-c").arg(&cmd_str).env("PATH", extended_path());
    if let Some(d) = &cwd { cmd.current_dir(d); }
    // If no stdin provided, use Stdio::null() so programs that read stdin
    // (cin, input(), scanf) get immediate EOF instead of hanging forever.
    if let Some(ref s) = stdin {
        use std::io::Write;
        cmd.stdin(Stdio::piped());
        let mut child = match cmd.stdout(Stdio::piped()).stderr(Stdio::piped()).spawn() {
            Ok(c) => c,
            Err(e) => return serde_json::json!({"logs":[],"error":e.to_string(),"ms":0}),
        };
        if let Some(mut si) = child.stdin.take() {
            let _ = si.write_all(s.as_bytes());
            // stdin closes when si drops here → EOF
        }
        let out = child.wait_with_output();
        let ms = t0.elapsed().as_millis() as u64;
        let _ = std::fs::remove_file(&tmp);
        return match out {
            Ok(o) => {
                let mut logs = vec![];
                for l in String::from_utf8_lossy(&o.stdout).lines() {
                    if !l.is_empty() { logs.push(serde_json::json!({"type":"log","val":l,"ts":0})); }
                }
                for l in String::from_utf8_lossy(&o.stderr).lines() {
                    if !l.is_empty() { logs.push(serde_json::json!({"type":"error","val":l,"ts":0})); }
                }
                serde_json::json!({"logs":logs,"error":null,"ms":ms})
            }
            Err(e) => serde_json::json!({"logs":[],"error":e.to_string(),"ms":ms}),
        };
    } else {
        // No stdin → send EOF immediately, program never blocks
        cmd.stdin(Stdio::null());
    }
    let out = cmd.output();
    let ms = t0.elapsed().as_millis() as u64;
    let _ = std::fs::remove_file(&tmp);
    match out {
        Ok(o) => {
            let mut logs = vec![];
            for l in String::from_utf8_lossy(&o.stdout).lines() {
                if !l.is_empty() { logs.push(serde_json::json!({"type":"log","val":l,"ts":0})); }
            }
            for l in String::from_utf8_lossy(&o.stderr).lines() {
                if !l.is_empty() { logs.push(serde_json::json!({"type":"error","val":l,"ts":0})); }
            }
            serde_json::json!({"logs":logs,"error":null,"ms":ms})
        }
        Err(e) => serde_json::json!({"logs":[],"error":e.to_string(),"ms":ms}),
    }
}

// ── Scan imports ───────────────────────────────────────────────

#[tauri::command]
async fn fs_scan_imports(root_path: String) -> serde_json::Value {
    let code_exts = &["js","jsx","ts","tsx","py","go","c","cpp","h","hpp","rs","rb","java","kt","swift","cs"];
    let ignore = IGNORE_DIRS;
    let mut files = vec![];
    fn collect(dir: &Path, files: &mut Vec<PathBuf>, code_exts: &[&str], ignore: &[&str]) {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for e in entries.flatten() {
                let n = e.file_name().to_string_lossy().to_string();
                if n.starts_with('.') || ignore.contains(&&*n) { continue; }
                if e.path().is_dir() { collect(&e.path(), files, code_exts, ignore); }
                else if let Some(ext) = e.path().extension() {
                    if code_exts.contains(&&*ext.to_string_lossy().to_lowercase()) { files.push(e.path()); }
                }
            }
        }
    }
    collect(Path::new(&root_path), &mut files, code_exts, ignore);
    let n = files.len();
    let nodes: Vec<_> = files.iter().enumerate().map(|(i, f)| {
        let rel = f.strip_prefix(&root_path).unwrap_or(f).to_string_lossy().to_string();
        let ext = f.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
        let angle = (i as f64) / (n.max(1) as f64) * std::f64::consts::TAU;
        let r = 200.0_f64;
        serde_json::json!({"id":format!("fi{i}"),"label":rel,"path":f.to_string_lossy(),"ext":ext,"type":"function","themeIdx":i%16,"x":r*angle.cos(),"y":r*angle.sin()})
    }).collect();
    serde_json::json!({"success":true,"nodes":nodes,"edges":[],"rootPath":root_path,"fileCount":n})
}

// ── AI chat (proxy) ────────────────────────────────────────────

#[tauri::command]
async fn ai_chat(
    provider: String, api_key: String, model: String,
    system: String, messages: serde_json::Value,
) -> serde_json::Value {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build().unwrap();

    let (url, body, headers) = match provider.as_str() {
        "anthropic" | "" => {
            if api_key.is_empty() { return serde_json::json!({"success":false,"error":"No API key"}); }
            let m = if model.is_empty() { "claude-haiku-4-5-20251001" } else { &model };
            let mut b = serde_json::json!({"model":m,"max_tokens":4096,"messages":messages});
            if !system.is_empty() { b["system"] = serde_json::json!(system); }
            (
                "https://api.anthropic.com/v1/messages".to_string(),
                b,
                vec![("x-api-key", api_key.clone()), ("anthropic-version", "2023-06-01".to_string())],
            )
        }
        "openai" | "openrouter" => {
            if api_key.is_empty() { return serde_json::json!({"success":false,"error":"No API key"}); }
            let base = if provider == "openrouter" { "https://openrouter.ai/api/v1" } else { "https://api.openai.com/v1" };
            let m = if model.is_empty() { "gpt-4o-mini" } else { &model };
            (
                format!("{base}/chat/completions"),
                serde_json::json!({"model":m,"messages":messages}),
                vec![("Authorization", format!("Bearer {api_key}"))],
            )
        }
        "gemini" => {
            if api_key.is_empty() { return serde_json::json!({"success":false,"error":"No API key"}); }
            let m = if model.is_empty() { "gemini-2.0-flash" } else { &model };
            let contents = messages.as_array().map(|arr| {
                arr.iter().map(|msg| {
                    let role = if msg["role"] == "assistant" { "model" } else { "user" };
                    serde_json::json!({"role":role,"parts":[{"text":msg["content"]}]})
                }).collect::<Vec<_>>()
            }).unwrap_or_default();
            let mut b = serde_json::json!({"contents":contents});
            if !system.is_empty() { b["systemInstruction"] = serde_json::json!({"parts":[{"text":system}]}); }
            (format!("https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent?key={api_key}"), b, vec![])
        }
        _ => return serde_json::json!({"success":false,"error":"Unknown provider"}),
    };

    let mut req = client.post(&url).json(&body);
    for (k, v) in headers { req = req.header(k, v); }
    match req.send().await {
        Ok(resp) => {
            let data: serde_json::Value = resp.json().await.unwrap_or_default();
            let content = match provider.as_str() {
                "anthropic"|"" => data["content"][0]["text"].as_str().unwrap_or("").to_string(),
                "openai"|"openrouter" => data["choices"][0]["message"]["content"].as_str().unwrap_or("").to_string(),
                "gemini" => data["candidates"][0]["content"]["parts"][0]["text"].as_str().unwrap_or("").to_string(),
                _ => "".to_string(),
            };
            serde_json::json!({"success":true,"content":content})
        }
        Err(e) => serde_json::json!({"success":false,"error":e.to_string()}),
    }
}

// ── Engine path resolver ───────────────────────────────────────

fn resolve_engine_path(app: &tauri::App) -> PathBuf {
    let bin_name = if cfg!(target_os = "windows") { "forbiden-engine.exe" } else { "forbiden-engine" };
    if cfg!(debug_assertions) {
        let exe = std::env::current_exe().unwrap_or_default();
        let mut dir = exe.parent().map(|p| p.to_path_buf()).unwrap_or_default();
        for _ in 0..6 {
            let c = dir.join("engine").join(bin_name);
            if c.exists() { return c; }
            if let Some(p) = dir.parent() { dir = p.to_path_buf(); } else { break; }
        }
        PathBuf::from("engine").join(bin_name)
    } else {
        let target = std::env::var("TAURI_ENV_TARGET_TRIPLE")
            .unwrap_or_else(|_| format!("{}-{}-{}", std::env::consts::ARCH, "unknown", std::env::consts::OS));
        let sidecar = format!("{bin_name}-{target}");
        if let Ok(res) = app.path().resource_dir() {
            let p = res.join(&sidecar); if p.exists() { return p; }
            let p2 = res.join(bin_name); if p2.exists() { return p2; }
        }
        let exe_dir = std::env::current_exe()
            .ok().and_then(|e| e.parent().map(|p| p.to_path_buf())).unwrap_or_default();
        let p = exe_dir.join(&sidecar); if p.exists() { return p; }
        exe_dir.join(bin_name)
    }
}

fn start_engine(engine_url: Arc<Mutex<Option<String>>>, bin_path: PathBuf) {
    std::thread::spawn(move || {
        if !bin_path.exists() { eprintln!("[engine] not found: {:?}", bin_path); return; }
        let mut child = match Command::new(&bin_path)
            .stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null()).spawn()
        {
            Ok(c) => c,
            Err(e) => { eprintln!("[engine] spawn error: {e}"); return; }
        };
        if let Some(stdout) = child.stdout.take() {
            for line in std::io::BufReader::new(stdout).lines().flatten() {
                if let Some(port) = line.strip_prefix("READY:") {
                    let url = format!("http://127.0.0.1:{}", port.trim());
                    *engine_url.lock().unwrap() = Some(url.clone());
                    println!("[engine] PTY ready at {url}");
                    break;
                }
            }
        }
        let _ = child.wait();
    });
}

// ── Entry point ────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
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
            get_engine_url, get_home_dir, get_platform, terminal_exec,
            fs_tree, fs_read, fs_write, fs_create_file, fs_create_dir,
            fs_delete, fs_rename, fs_copy_file, fs_copy_folder,
            fs_list_all, fs_search, fs_get_scripts, fs_format_code,
            fs_scan_imports,
            workspace_get, workspace_save, workspace_recent_get,
            workspace_recent_add, workspace_ensure_default,
            git_status, git_log, git_log_graph, git_branch, git_branches,
            git_commit, git_stage, git_unstage, git_checkout,
            git_push, git_pull, git_stash, git_stash_pop, git_init,
            git_discard, git_diff, git_blame,
            run_code, ai_chat,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
