use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager};

use crate::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptResult {
    pub text: String,
    pub language: Option<String>,
}

pub struct SidecarManager {
    process: Arc<Mutex<Option<Child>>>,
    script_path: PathBuf,
    python_path: PathBuf,
}

impl SidecarManager {
    pub fn new(script_path: PathBuf, python_path: PathBuf) -> Self {
        Self {
            process: Arc::new(Mutex::new(None)),
            script_path,
            python_path,
        }
    }

    pub fn start(&self) -> Result<(), String> {
        let mut process_guard = self.process.lock().map_err(|e| e.to_string())?;

        if process_guard.is_some() {
            return Ok(()); // Already running
        }

        log::info!("Starting Python ASR service:");
        log::info!("  Python: {:?}", self.python_path);
        log::info!("  Script: {:?}", self.script_path);

        let child = Command::new(&self.python_path)
            .arg(&self.script_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit()) // Show Python errors in console
            .spawn()
            .map_err(|e| format!("Failed to spawn Python ASR service: {}", e))?;

        *process_guard = Some(child);

        // Wait for "ready" signal
        log::info!("Waiting for ASR service to initialize...");

        Ok(())
    }

    pub fn transcribe(&self, audio_path: &Path) -> Result<TranscriptResult, String> {
        let mut process_guard = self.process.lock().map_err(|e| e.to_string())?;

        let process = process_guard
            .as_mut()
            .ok_or("ASR service not running")?;

        // Send audio path to service
        let stdin = process
            .stdin
            .as_mut()
            .ok_or("Failed to get stdin")?;

        let path_str = audio_path.to_string_lossy();
        writeln!(stdin, "{}", path_str)
            .map_err(|e| format!("Failed to write to ASR service: {}", e))?;
        stdin.flush().map_err(|e| format!("Failed to flush stdin: {}", e))?;

        // Read response from service
        let stdout = process
            .stdout
            .as_mut()
            .ok_or("Failed to get stdout")?;

        let mut reader = BufReader::new(stdout);
        let mut line = String::new();
        reader
            .read_line(&mut line)
            .map_err(|e| format!("Failed to read from ASR service: {}", e))?;

        log::debug!("ASR response: {}", line.trim());

        // Parse JSON response
        let result: TranscriptResult = serde_json::from_str(&line)
            .map_err(|e| format!("Failed to parse ASR response '{}': {}", line.trim(), e))?;

        Ok(result)
    }

    pub fn stop(&self) -> Result<(), String> {
        let mut process_guard = self.process.lock().map_err(|e| e.to_string())?;

        if let Some(ref mut process) = *process_guard {
            // Try to send quit command
            if let Some(ref mut stdin) = process.stdin {
                let _ = writeln!(stdin, "quit");
                let _ = stdin.flush();
            }

            // Give it a moment to quit gracefully
            std::thread::sleep(std::time::Duration::from_millis(100));

            // Then kill if still running
            let _ = process.kill();
            let _ = process.wait();
        }

        *process_guard = None;
        log::info!("ASR service stopped");

        Ok(())
    }
}

impl Drop for SidecarManager {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}

pub fn init_sidecar(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let state = app.state::<AppState>();

    // Find the Python script and venv paths
    // Working directory is src-tauri when running in dev mode, so go up one level
    let current_dir = std::env::current_dir()?;
    log::info!("Current working directory: {:?}", current_dir);

    // Try current dir first, then parent dir (for dev mode where cwd is src-tauri)
    let src_python_dir = if current_dir.join("src-python").exists() {
        current_dir.join("src-python")
    } else if current_dir.parent().map(|p| p.join("src-python").exists()).unwrap_or(false) {
        current_dir.parent().unwrap().join("src-python")
    } else {
        current_dir.join("src-python") // fallback
    };

    let script_path = src_python_dir.join("asr_service.py");
    let venv_python = src_python_dir.join(".venv").join("bin").join("python3");

    log::info!("Using src-python dir: {:?}", src_python_dir);
    log::info!("Looking for script at: {:?}", script_path);
    log::info!("Looking for venv Python at: {:?}", venv_python);

    // Check if script exists
    if !script_path.exists() {
        log::warn!(
            "Python ASR script not found at {:?}. Please ensure src-python/asr_service.py exists.",
            script_path
        );
        let manager = SidecarManager::new(script_path, venv_python);
        let mut sidecar = state.sidecar_manager.lock().map_err(|e| e.to_string())?;
        *sidecar = Some(manager);
        return Ok(());
    }

    // Check if venv Python exists
    let python_path = if venv_python.exists() {
        log::info!("Using virtual environment Python: {:?}", venv_python);
        venv_python
    } else {
        log::warn!(
            "Virtual environment not found at {:?}. Using system Python. \
             Please run: cd src-python && python3 -m venv .venv && source .venv/bin/activate && pip install mlx-audio-plus",
            venv_python
        );
        PathBuf::from("python3")
    };

    let manager = SidecarManager::new(script_path, python_path);
    manager.start()?;

    let mut sidecar = state.sidecar_manager.lock().map_err(|e| e.to_string())?;
    *sidecar = Some(manager);

    log::info!("ASR sidecar initialized successfully");
    Ok(())
}
