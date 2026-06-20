use std::io::BufRead;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{Manager, State};

// ── App state ─────────────────────────────────────────────────────────────────

struct EngineState {
    url: Arc<Mutex<Option<String>>>,
}

// ── Engine sidecar ────────────────────────────────────────────────────────────

fn start_engine(engine_url: Arc<Mutex<Option<String>>>, bin_path: std::path::PathBuf) {
    std::thread::spawn(move || {
        if !bin_path.exists() {
            eprintln!("[engine] binary not found: {:?}", bin_path);
            return;
        }

        let mut child = match Command::new(&bin_path)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
        {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[engine] failed to spawn: {}", e);
                return;
            }
        };

        if let Some(stdout) = child.stdout.take() {
            let reader = std::io::BufReader::new(stdout);
            for line in reader.lines() {
                if let Ok(line) = line {
                    if let Some(port) = line.strip_prefix("READY:") {
                        let url = format!("http://127.0.0.1:{}", port.trim());
                        *engine_url.lock().unwrap() = Some(url.clone());
                        println!("[engine] ready at {}", url);
                        break;
                    }
                }
            }
        }

        let _ = child.wait();
        println!("[engine] process exited");
    });
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
fn get_engine_url(state: State<EngineState>) -> String {
    state
        .url
        .lock()
        .unwrap()
        .clone()
        .unwrap_or_else(|| "http://127.0.0.1:49373".to_string())
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

#[tauri::command]
async fn terminal_exec(cmd: String, cwd: String) -> Result<serde_json::Value, String> {
    let (shell, flag) = if cfg!(target_os = "windows") {
        ("cmd", "/C")
    } else {
        ("sh", "-c")
    };

    let effective_cwd = if cwd.is_empty() {
        std::env::current_dir()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string()
    } else {
        cwd
    };

    let output = tokio::process::Command::new(shell)
        .arg(flag)
        .arg(&cmd)
        .current_dir(&effective_cwd)
        .output()
        .await
        .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "stdout": String::from_utf8_lossy(&output.stdout),
        "stderr": String::from_utf8_lossy(&output.stderr),
    }))
}

// ── Entry point ───────────────────────────────────────────────────────────────

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
            let bin_name = if cfg!(target_os = "windows") {
                "forbiden-engine.exe"
            } else {
                "forbiden-engine"
            };

            let bin_path = if cfg!(debug_assertions) {
                // Dev: binary in engine/ directory next to project root
                app.path()
                    .app_config_dir()
                    .unwrap_or_default()
                    .parent()
                    .unwrap_or(&std::path::Path::new("/"))
                    .parent()
                    .unwrap_or(&std::path::Path::new("/"))
                    .parent()
                    .unwrap_or(&std::path::Path::new("/"))
                    .parent()
                    .unwrap_or(&std::path::Path::new("/"))
                    .to_path_buf()
                    // Fallback: resolve from current working dir
                    .join("engine")
                    .join(bin_name)
            } else {
                // Packaged: binary is in the resources bundle
                app.path()
                    .resource_dir()
                    .expect("resource_dir not available")
                    .join(bin_name)
            };

            // In dev, resolve from cwd which is the project root
            let final_path = if cfg!(debug_assertions) {
                std::env::current_dir()
                    .unwrap_or_default()
                    .join("engine")
                    .join(bin_name)
            } else {
                bin_path
            };

            start_engine(engine_url_clone, final_path);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_engine_url,
            get_home_dir,
            get_platform,
            terminal_exec,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
