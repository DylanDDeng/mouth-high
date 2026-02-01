use crate::{audio::AudioRecorderHandle, AppState, HotkeyConfig};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

pub struct RecorderState {
    pub recorder: Mutex<Option<AudioRecorderHandle>>,
}

// 存储当前快捷键以便后续注销
pub struct CurrentShortcut {
    pub shortcut: Mutex<Option<Shortcut>>,
}

// 将配置转换为 Shortcut
fn config_to_shortcut(config: &HotkeyConfig) -> Result<(Shortcut, String), String> {
    let mut modifiers = Modifiers::empty();
    
    for m in &config.modifiers {
        match m.as_str() {
            "ctrl" => modifiers |= Modifiers::CONTROL,
            "shift" => modifiers |= Modifiers::SHIFT,
            "alt" => modifiers |= Modifiers::ALT,
            "cmd" | "super" => modifiers |= Modifiers::SUPER,
            _ => {}
        }
    }
    
    // 将 key 字符串转换为 Code
    let code = match config.key.to_lowercase().as_str() {
        "a" => Code::KeyA,
        "b" => Code::KeyB,
        "c" => Code::KeyC,
        "d" => Code::KeyD,
        "e" => Code::KeyE,
        "f" => Code::KeyF,
        "g" => Code::KeyG,
        "h" => Code::KeyH,
        "i" => Code::KeyI,
        "j" => Code::KeyJ,
        "k" => Code::KeyK,
        "l" => Code::KeyL,
        "m" => Code::KeyM,
        "n" => Code::KeyN,
        "o" => Code::KeyO,
        "p" => Code::KeyP,
        "q" => Code::KeyQ,
        "r" => Code::KeyR,
        "s" => Code::KeyS,
        "t" => Code::KeyT,
        "u" => Code::KeyU,
        "v" => Code::KeyV,
        "w" => Code::KeyW,
        "x" => Code::KeyX,
        "y" => Code::KeyY,
        "z" => Code::KeyZ,
        "0" => Code::Digit0,
        "1" => Code::Digit1,
        "2" => Code::Digit2,
        "3" => Code::Digit3,
        "4" => Code::Digit4,
        "5" => Code::Digit5,
        "6" => Code::Digit6,
        "7" => Code::Digit7,
        "8" => Code::Digit8,
        "9" => Code::Digit9,
        "f1" => Code::F1,
        "f2" => Code::F2,
        "f3" => Code::F3,
        "f4" => Code::F4,
        "f5" => Code::F5,
        "f6" => Code::F6,
        "f7" => Code::F7,
        "f8" => Code::F8,
        "f9" => Code::F9,
        "f10" => Code::F10,
        "f11" => Code::F11,
        "f12" => Code::F12,
        "space" => Code::Space,
        "enter" => Code::Enter,
        "tab" => Code::Tab,
        "escape" | "esc" => Code::Escape,
        "backspace" => Code::Backspace,
        "delete" => Code::Delete,
        "home" => Code::Home,
        "end" => Code::End,
        "pageup" => Code::PageUp,
        "pagedown" => Code::PageDown,
        "up" => Code::ArrowUp,
        "down" => Code::ArrowDown,
        "left" => Code::ArrowLeft,
        "right" => Code::ArrowRight,
        _ => return Err(format!("Unsupported key: {}", config.key)),
    };
    
    let shortcut = if modifiers.is_empty() {
        Shortcut::new(None, code)
    } else {
        Shortcut::new(Some(modifiers), code)
    };
    
    let name = config.to_display_string();
    Ok((shortcut, name))
}

pub fn setup_hotkey(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    // Initialize recorder
    let recorder = AudioRecorderHandle::new()
        .map_err(|e| format!("Failed to create audio recorder: {}", e))?;

    app.manage(RecorderState {
        recorder: Mutex::new(Some(recorder)),
    });

    // 管理当前快捷键状态
    app.manage(CurrentShortcut {
        shortcut: Mutex::new(None),
    });

    // 尝试从配置读取快捷键
    let config = crate::get_hotkey_config().unwrap_or_else(|_| HotkeyConfig {
        modifiers: vec!["ctrl".to_string(), "shift".to_string()],
        key: "r".to_string(),
    });

    // 尝试注册配置的快捷键
    if let Err(e) = register_hotkey_with_config(app, &config) {
        log::warn!("Failed to register configured hotkey: {}, falling back to defaults", e);
        
        // 尝试默认快捷键列表
        let defaults = vec![
            HotkeyConfig { modifiers: vec!["ctrl".to_string(), "shift".to_string()], key: "r".to_string() },
            HotkeyConfig { modifiers: vec!["cmd".to_string(), "shift".to_string()], key: "r".to_string() },
            HotkeyConfig { modifiers: vec!["alt".to_string(), "shift".to_string()], key: "r".to_string() },
            HotkeyConfig { modifiers: vec![], key: "f5".to_string() },
            HotkeyConfig { modifiers: vec!["ctrl".to_string()], key: "r".to_string() },
            HotkeyConfig { modifiers: vec!["cmd".to_string()], key: "r".to_string() },
        ];
        
        let mut registered = false;
        for default_config in defaults {
            if let Ok(_) = register_hotkey_with_config(app, &default_config) {
                // 保存成功注册的默认配置
                let _ = crate::set_hotkey_config(default_config);
                registered = true;
                break;
            }
        }
        
        if !registered {
            log::error!("Could not register any global hotkey. Please grant Accessibility permissions in System Settings > Privacy & Security > Accessibility");
            let _ = app.emit("error", "无法注册全局快捷键。请在 系统设置 > 隐私与安全性 > 辅助功能 中授予权限。".to_string());
        }
    }

    Ok(())
}

// 使用配置注册快捷键
fn register_hotkey_with_config(app: &AppHandle, config: &HotkeyConfig) -> Result<(), String> {
    let (shortcut, name) = config_to_shortcut(config)?;
    
    log::info!("Registering shortcut: {:?}, name: {}", shortcut, name);

    // 保存当前快捷键到状态
    {
        let current = app.state::<CurrentShortcut>();
        let mut current_shortcut = current.shortcut.lock().map_err(|e| e.to_string())?;
        *current_shortcut = Some(shortcut.clone());
    }

    let handle = app.clone();
    let shortcut_for_handler = shortcut.clone();

    // on_shortcut() 同时完成：注册快捷键 + 绑定处理器
    app.global_shortcut()
        .on_shortcut(shortcut, move |_app, _shortcut, event| {
            // 检查当前注册的快捷键是否匹配
            let current = handle.state::<CurrentShortcut>();
            let current_shortcut = current.shortcut.lock().unwrap();
            
            if let Some(ref registered) = *current_shortcut {
                if registered != &shortcut_for_handler {
                    log::warn!("Stale handler triggered! Expected: {:?}, Got: {:?}", registered, shortcut_for_handler);
                    return;
                }
            } else {
                log::warn!("Handler triggered but no shortcut registered");
                return;
            }
            
            let recording_mode = {
                let state = handle.state::<crate::AppState>();
                let mode = *state.recording_mode.lock().unwrap();
                mode
            };

            match recording_mode {
                crate::RecordingMode::Hold => {
                    // Hold 模式：按住开始，松开停止
                    match event.state {
                        ShortcutState::Pressed => {
                            log::info!("Hotkey pressed (Hold mode) - starting recording");
                            start_recording(&handle);
                        }
                        ShortcutState::Released => {
                            log::info!("Hotkey released (Hold mode) - stopping recording");
                            stop_recording_and_process(&handle);
                        }
                    }
                }
                crate::RecordingMode::Toggle => {
                    // Toggle 模式：按一下切换录音状态
                    if matches!(event.state, ShortcutState::Pressed) {
                        let is_recording = {
                            let state = handle.state::<crate::AppState>();
                            let is_rec = *state.is_recording.lock().unwrap();
                            is_rec
                        };
                        
                        if is_recording {
                            log::info!("Hotkey pressed (Toggle mode) - stopping recording");
                            stop_recording_and_process(&handle);
                        } else {
                            log::info!("Hotkey pressed (Toggle mode) - starting recording");
                            start_recording(&handle);
                        }
                    }
                }
            }
        })
        .map_err(|e| format!("Failed to register hotkey: {:?}", e))?;

    log::info!("Global hotkey registered: {}", name);
    let _ = app.emit("hotkey-registered", name);
    Ok(())
}

// 更新快捷键（供前端调用）
pub fn update_hotkey(app: &AppHandle, config: &HotkeyConfig) -> Result<(), String> {
    log::info!("Updating hotkey to: {:?}", config);
    
    // 先获取并清空当前快捷键状态
    {
        let current = app.state::<CurrentShortcut>();
        let mut current_shortcut = current.shortcut.lock().map_err(|e| e.to_string())?;
        if let Some(ref shortcut) = *current_shortcut {
            log::info!("Unregistering previous shortcut: {:?}", shortcut);
        }
        *current_shortcut = None;
    }
    
    // 注销所有快捷键和处理器
    match app.global_shortcut().unregister_all() {
        Ok(_) => log::info!("Successfully unregistered all shortcuts"),
        Err(e) => log::warn!("Failed to unregister shortcuts: {:?}", e),
    }

    // 增加延迟确保系统完全释放快捷键
    std::thread::sleep(std::time::Duration::from_millis(300));

    // 重新注册
    log::info!("Registering new shortcut...");
    register_hotkey_with_config(app, config)?;

    // 保存配置
    crate::set_hotkey_config(config.clone())?;

    log::info!("Hotkey successfully updated to: {}", config.to_display_string());
    Ok(())
}

fn start_recording(app: &AppHandle) {
    let state = app.state::<AppState>();
    let recorder_state = app.state::<RecorderState>();

    // Check if already recording
    {
        let is_recording = state.is_recording.lock().unwrap();
        if *is_recording {
            log::warn!("Already recording");
            return;
        }
    }

    // Start recording with app_handle for amplitude monitoring
    let result = {
        let recorder = recorder_state.recorder.lock().unwrap();
        if let Some(ref rec) = *recorder {
            rec.start_recording(Some(app.clone()))
        } else {
            Err("Recorder not initialized".to_string())
        }
    };

    match result {
        Ok(()) => {
            // Update state
            {
                let mut is_recording = state.is_recording.lock().unwrap();
                *is_recording = true;
            }

            // 获取录音模式
            let recording_mode = {
                let mode = *state.recording_mode.lock().unwrap();
                mode
            };

            // Toggle 模式下，保存当前焦点应用，然后显示浮动波纹条窗口
            if recording_mode == crate::RecordingMode::Toggle {
                // 保存当前焦点应用
                if let Some(bundle_id) = crate::focus::get_frontmost_app() {
                    let mut prev = state.previous_app.lock().unwrap();
                    *prev = Some(bundle_id.clone());
                    log::info!("Saved previous app: {}", bundle_id);
                }

                if let Some(window) = app.get_webview_window("recording-bar") {
                    let _ = window.center();
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }

            let _ = app.emit("recording-started", ());
            log::info!("Recording started");
        }
        Err(e) => {
            log::error!("Failed to start recording: {}", e);
            let _ = app.emit("error", format!("Failed to start recording: {}", e));
        }
    }
}

fn stop_recording_and_process(app: &AppHandle) {
    let state = app.state::<AppState>();
    let recorder_state = app.state::<RecorderState>();

    // Check if recording
    {
        let is_recording = state.is_recording.lock().unwrap();
        if !*is_recording {
            log::warn!("Not recording");
            return;
        }
    }

    // Stop recording and get audio file path
    let audio_path = {
        let recorder = recorder_state.recorder.lock().unwrap();
        if let Some(ref rec) = *recorder {
            match rec.stop_recording() {
                Ok(path) => Some(path),
                Err(e) => {
                    log::error!("Failed to stop recording: {}", e);
                    let _ = app.emit("error", format!("Failed to stop recording: {}", e));
                    None
                }
            }
        } else {
            None
        }
    };

    // Update state
    {
        let mut is_recording = state.is_recording.lock().unwrap();
        *is_recording = false;
    }

    // 获取录音模式
    let recording_mode = {
        let mode = *state.recording_mode.lock().unwrap();
        mode
    };

    // Toggle 模式下：先隐藏录音条窗口，再恢复焦点
    if recording_mode == crate::RecordingMode::Toggle {
        // 1. 先隐藏录音条窗口（避免它干扰焦点）
        if let Some(window) = app.get_webview_window("recording-bar") {
            let _ = window.hide();
        }
        
        // 2. 给系统时间处理隐藏窗口
        std::thread::sleep(std::time::Duration::from_millis(50));
        
        // 3. 恢复焦点到之前的应用
        let prev = state.previous_app.lock().unwrap();
        if let Some(ref bundle_id) = *prev {
            log::info!("Restoring focus to: {}", bundle_id);
            if let Err(e) = crate::focus::activate_app(bundle_id) {
                log::warn!("Failed to restore focus: {}", e);
            }
            // 给系统更多时间完成焦点切换
            std::thread::sleep(std::time::Duration::from_millis(200));
        }
    } else {
        // Hold 模式下只需隐藏窗口
        if let Some(window) = app.get_webview_window("recording-bar") {
            let _ = window.hide();
        }
    }

    // Process audio if we have it
    if let Some(path) = audio_path {
        let _ = app.emit("processing-started", ());
        log::info!("Processing audio: {:?}", path);

        let handle = app.clone();
        std::thread::spawn(move || {
            process_audio(&handle, path);
        });
    }
}

fn process_audio(app: &AppHandle, audio_path: std::path::PathBuf) {
    let state = app.state::<AppState>();

    // Send to sidecar for ASR
    let result = {
        let sidecar = state.sidecar_manager.lock().unwrap();
        if let Some(ref manager) = *sidecar {
            manager.transcribe(&audio_path)
        } else {
            Err("Sidecar not initialized".to_string())
        }
    };

    match result {
        Ok(transcript) => {
            log::info!("Transcription: {}", transcript.text);

            // Update usage stats
            let char_count = transcript.text.chars().count();
            if let Err(e) = crate::update_usage_stats(char_count) {
                log::warn!("Failed to update usage stats: {}", e);
            }

            // Save to history
            if let Err(e) = crate::add_history_item(&transcript.text) {
                log::warn!("Failed to add history item: {}", e);
            }

            // 获取录音模式，如果是 Toggle 模式，再次确保焦点正确
            let recording_mode = *state.recording_mode.lock().unwrap();
            if recording_mode == crate::RecordingMode::Toggle {
                // 再次恢复焦点到之前的应用（ASR 处理期间焦点可能改变）
                let prev = state.previous_app.lock().unwrap();
                if let Some(ref bundle_id) = *prev {
                    log::info!("Re-restoring focus to: {}", bundle_id);
                    let _ = crate::focus::activate_app(bundle_id);
                    std::thread::sleep(std::time::Duration::from_millis(150));
                }
            }

            // Output the text
            let output_mode = {
                let mode = state.output_mode.lock().unwrap();
                *mode
            };

            if let Err(e) = crate::input::output_text(&transcript.text, output_mode) {
                log::error!("Failed to output text: {}", e);
                let _ = app.emit("error", format!("Failed to output text: {}", e));
            }

            let _ = app.emit("transcript", &transcript);
        }
        Err(e) => {
            log::error!("Transcription failed: {}", e);
            let _ = app.emit("error", format!("Transcription failed: {}", e));
        }
    }

    // Clean up audio file
    if let Err(e) = std::fs::remove_file(&audio_path) {
        log::warn!("Failed to remove temp audio file: {}", e);
    }
}

// 公共函数：停止录音（供前端调用）
pub fn stop_recording_manually(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<crate::AppState>();
    
    // Check if recording
    {
        let is_recording = state.is_recording.lock().unwrap();
        if !*is_recording {
            return Err("Not recording".to_string());
        }
    }
    
    stop_recording_and_process(app);
    Ok(())
}
