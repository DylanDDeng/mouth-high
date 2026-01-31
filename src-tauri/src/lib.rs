mod audio;
mod hotkey;
mod input;
mod sidecar;
mod tray;

use std::sync::Mutex;
use std::path::PathBuf;
use std::fs;
use serde_json::json;
use chrono::Local;
use tauri::Emitter;

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize, Default)]
pub struct UsageStats {
    pub total_characters: u64,
    pub total_transcriptions: u64,
    pub today_characters: u64,
    pub today_date: String,
}

// 历史记录项
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct HistoryItem {
    pub id: String,
    pub text: String,
    pub timestamp: i64,  // Unix timestamp in seconds
    pub date: String,    // YYYY-MM-DD format for grouping
    pub char_count: usize,
}

// 历史记录保留设置
#[derive(Clone, Copy, Debug, serde::Serialize, serde::Deserialize, PartialEq)]
pub enum HistoryRetention {
    #[serde(rename = "7days")]
    SevenDays,
    #[serde(rename = "30days")]
    ThirtyDays,
    #[serde(rename = "90days")]
    NinetyDays,
    #[serde(rename = "forever")]
    Forever,
}

impl Default for HistoryRetention {
    fn default() -> Self {
        HistoryRetention::Forever
    }
}

#[derive(Clone, Copy, Debug, serde::Serialize, serde::Deserialize)]
pub enum OutputMode {
    #[serde(rename = "keyboard")]
    Keyboard,
    #[serde(rename = "clipboard")]
    Clipboard,
}

impl Default for OutputMode {
    fn default() -> Self {
        OutputMode::Keyboard
    }
}

// 录音模式
#[derive(Clone, Copy, Debug, serde::Serialize, serde::Deserialize, PartialEq)]
pub enum RecordingMode {
    #[serde(rename = "hold")]
    Hold,    // 按住录音，松开停止
    #[serde(rename = "toggle")]
    Toggle,  // 按一下开始，再按一下停止
}

impl Default for RecordingMode {
    fn default() -> Self {
        RecordingMode::Hold
    }
}

pub struct AppState {
    pub output_mode: Mutex<OutputMode>,
    pub is_recording: Mutex<bool>,
    pub recording_mode: Mutex<RecordingMode>,
    pub sidecar_manager: Mutex<Option<sidecar::SidecarManager>>,
}

// 快捷键配置
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize, Default)]
pub struct HotkeyConfig {
    pub modifiers: Vec<String>,  // ["ctrl", "shift", "alt", "cmd"]
    pub key: String,             // "r", "f5", "space", etc.
}

impl HotkeyConfig {
    pub fn to_display_string(&self) -> String {
        let mut parts = Vec::new();
        for m in &self.modifiers {
            parts.push(match m.as_str() {
                "ctrl" => "Ctrl",
                "shift" => "Shift",
                "alt" => "Alt",
                "cmd" | "super" => "Cmd",
                _ => m,
            }.to_string());
        }
        parts.push(self.key.to_uppercase());
        parts.join(" + ")
    }
}

#[tauri::command]
fn set_output_mode(state: tauri::State<'_, AppState>, mode: OutputMode) -> Result<(), String> {
    let mut output_mode = state.output_mode.lock().map_err(|e| e.to_string())?;
    *output_mode = mode;
    log::info!("Output mode set to: {:?}", mode);
    Ok(())
}

#[tauri::command]
fn get_output_mode(state: tauri::State<'_, AppState>) -> Result<OutputMode, String> {
    let output_mode = state.output_mode.lock().map_err(|e| e.to_string())?;
    Ok(*output_mode)
}

#[tauri::command]
fn get_recording_mode(state: tauri::State<'_, AppState>) -> Result<RecordingMode, String> {
    let recording_mode = state.recording_mode.lock().map_err(|e| e.to_string())?;
    Ok(*recording_mode)
}

#[tauri::command]
fn set_recording_mode(app_handle: tauri::AppHandle, state: tauri::State<'_, AppState>, mode: RecordingMode) -> Result<(), String> {
    let mut recording_mode = state.recording_mode.lock().map_err(|e| e.to_string())?;
    *recording_mode = mode;
    log::info!("Recording mode set to: {:?}", mode);
    
    // 通知前端录音模式已更改
    let _ = app_handle.emit("recording-mode-changed", mode);
    
    Ok(())
}

#[tauri::command]
fn stop_recording(app_handle: tauri::AppHandle) -> Result<(), String> {
    hotkey::stop_recording_manually(&app_handle)
}

fn get_config_path() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join(".mouth-high").join("config.json")
}

#[tauri::command]
fn get_api_key() -> Result<Option<String>, String> {
    let config_path = get_config_path();
    if !config_path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config: {}", e))?;

    let config: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse config: {}", e))?;

    Ok(config.get("dashscope_api_key")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string()))
}

#[tauri::command]
fn set_api_key(api_key: String) -> Result<(), String> {
    let config_path = get_config_path();

    // Create directory if needed
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }

    // Read existing config or create new
    let mut config: serde_json::Value = if config_path.exists() {
        let content = fs::read_to_string(&config_path).unwrap_or_else(|_| "{}".to_string());
        serde_json::from_str(&content).unwrap_or_else(|_| json!({}))
    } else {
        json!({})
    };

    // Update API key
    config["dashscope_api_key"] = json!(api_key);

    // Write back
    let content = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    fs::write(&config_path, content)
        .map_err(|e| format!("Failed to write config: {}", e))?;

    log::info!("API key saved to {:?}", config_path);
    Ok(())
}

#[tauri::command]
fn is_api_key_configured() -> bool {
    match get_api_key() {
        Ok(Some(key)) => !key.is_empty(),
        _ => false,
    }
}

// 获取快捷键配置
#[tauri::command]
fn get_hotkey_config() -> Result<HotkeyConfig, String> {
    let config_path = get_config_path();
    if !config_path.exists() {
        // 返回默认配置
        return Ok(HotkeyConfig {
            modifiers: vec!["ctrl".to_string(), "shift".to_string()],
            key: "r".to_string(),
        });
    }

    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config: {}", e))?;

    let config: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse config: {}", e))?;

    let hotkey_config: HotkeyConfig = config.get("hotkey")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_else(|| HotkeyConfig {
            modifiers: vec!["ctrl".to_string(), "shift".to_string()],
            key: "r".to_string(),
        });

    Ok(hotkey_config)
}

// 设置快捷键配置
#[tauri::command]
fn set_hotkey_config(config: HotkeyConfig) -> Result<(), String> {
    let config_path = get_config_path();

    // Create directory if needed
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }

    // Read existing config or create new
    let mut full_config: serde_json::Value = if config_path.exists() {
        let content = fs::read_to_string(&config_path).unwrap_or_else(|_| "{}".to_string());
        serde_json::from_str(&content).unwrap_or_else(|_| json!({}))
    } else {
        json!({})
    };

    // Update hotkey config
    full_config["hotkey"] = serde_json::to_value(&config)
        .map_err(|e| format!("Failed to serialize hotkey config: {}", e))?;

    // Write back
    let content = serde_json::to_string_pretty(&full_config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    fs::write(&config_path, content)
        .map_err(|e| format!("Failed to write config: {}", e))?;

    log::info!("Hotkey config saved: {}", config.to_display_string());
    Ok(())
}

// 更新快捷键并重新注册
#[tauri::command]
fn update_hotkey(app_handle: tauri::AppHandle, config: HotkeyConfig) -> Result<(), String> {
    hotkey::update_hotkey(&app_handle, &config)
}

#[tauri::command]
fn get_usage_stats() -> Result<UsageStats, String> {
    let config_path = get_config_path();
    if !config_path.exists() {
        return Ok(UsageStats::default());
    }

    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config: {}", e))?;

    let config: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse config: {}", e))?;

    let mut stats: UsageStats = config.get("stats")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    // Check if we need to reset today's stats
    let today = Local::now().format("%Y-%m-%d").to_string();
    if stats.today_date != today {
        stats.today_characters = 0;
        stats.today_date = today;
    }

    Ok(stats)
}

pub fn update_usage_stats(char_count: usize) -> Result<(), String> {
    let config_path = get_config_path();

    // Create directory if needed
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }

    // Read existing config or create new
    let mut config: serde_json::Value = if config_path.exists() {
        let content = fs::read_to_string(&config_path).unwrap_or_else(|_| "{}".to_string());
        serde_json::from_str(&content).unwrap_or_else(|_| json!({}))
    } else {
        json!({})
    };

    // Get current stats
    let mut stats: UsageStats = config.get("stats")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    // Check if we need to reset today's stats
    let today = Local::now().format("%Y-%m-%d").to_string();
    if stats.today_date != today {
        stats.today_characters = 0;
        stats.today_date = today;
    }

    // Update stats
    stats.total_characters += char_count as u64;
    stats.total_transcriptions += 1;
    stats.today_characters += char_count as u64;

    // Save back
    config["stats"] = serde_json::to_value(&stats)
        .map_err(|e| format!("Failed to serialize stats: {}", e))?;

    let content = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    fs::write(&config_path, content)
        .map_err(|e| format!("Failed to write config: {}", e))?;

    log::info!("Usage stats updated: {} chars, total {} chars, {} transcriptions",
        char_count, stats.total_characters, stats.total_transcriptions);

    Ok(())
}

// 添加历史记录
pub fn add_history_item(text: &str) -> Result<(), String> {
    let config_path = get_config_path();
    
    // Create directory if needed
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }
    
    // Read existing config or create new
    let mut config: serde_json::Value = if config_path.exists() {
        let content = fs::read_to_string(&config_path).unwrap_or_else(|_| "{}".to_string());
        serde_json::from_str(&content).unwrap_or_else(|_| json!({}))
    } else {
        json!({})
    };
    
    let now = Local::now();
    let item = HistoryItem {
        id: format!("{}", now.timestamp_millis()),
        text: text.to_string(),
        timestamp: now.timestamp(),
        date: now.format("%Y-%m-%d").to_string(),
        char_count: text.chars().count(),
    };
    
    // Get existing history or create new
    let mut history: Vec<HistoryItem> = config.get("history")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();
    
    // Add new item at the beginning
    history.insert(0, item);
    
    // Clean up old records based on retention setting
    let retention: HistoryRetention = config.get("history_retention")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();
    
    let cutoff_timestamp = match retention {
        HistoryRetention::SevenDays => now.timestamp() - 7 * 24 * 60 * 60,
        HistoryRetention::ThirtyDays => now.timestamp() - 30 * 24 * 60 * 60,
        HistoryRetention::NinetyDays => now.timestamp() - 90 * 24 * 60 * 60,
        HistoryRetention::Forever => 0,
    };
    
    if cutoff_timestamp > 0 {
        history.retain(|item| item.timestamp >= cutoff_timestamp);
    }
    
    // Save back
    config["history"] = serde_json::to_value(&history)
        .map_err(|e| format!("Failed to serialize history: {}", e))?;
    
    let content = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    
    fs::write(&config_path, content)
        .map_err(|e| format!("Failed to write config: {}", e))?;
    
    log::info!("History item added: {} chars", text.chars().count());
    Ok(())
}

// 获取历史记录
#[tauri::command]
fn get_history() -> Result<Vec<HistoryItem>, String> {
    let config_path = get_config_path();
    if !config_path.exists() {
        return Ok(Vec::new());
    }
    
    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config: {}", e))?;
    
    let config: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse config: {}", e))?;
    
    let history: Vec<HistoryItem> = config.get("history")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();
    
    Ok(history)
}

// 删除历史记录项
#[tauri::command]
fn delete_history_item(id: String) -> Result<(), String> {
    let config_path = get_config_path();
    
    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config: {}", e))?;
    
    let mut config: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse config: {}", e))?;
    
    let mut history: Vec<HistoryItem> = config.get("history")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();
    
    history.retain(|item| item.id != id);
    
    config["history"] = serde_json::to_value(&history)
        .map_err(|e| format!("Failed to serialize history: {}", e))?;
    
    let content = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    
    fs::write(&config_path, content)
        .map_err(|e| format!("Failed to write config: {}", e))?;
    
    log::info!("History item deleted: {}", id);
    Ok(())
}

// 清空历史记录
#[tauri::command]
fn clear_history() -> Result<(), String> {
    let config_path = get_config_path();
    
    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config: {}", e))?;
    
    let mut config: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse config: {}", e))?;
    
    config["history"] = json!([]);
    
    let content = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    
    fs::write(&config_path, content)
        .map_err(|e| format!("Failed to write config: {}", e))?;
    
    log::info!("History cleared");
    Ok(())
}

// 获取历史记录保留设置
#[tauri::command]
fn get_history_retention() -> Result<HistoryRetention, String> {
    let config_path = get_config_path();
    if !config_path.exists() {
        return Ok(HistoryRetention::default());
    }
    
    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config: {}", e))?;
    
    let config: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse config: {}", e))?;
    
    let retention: HistoryRetention = config.get("history_retention")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();
    
    Ok(retention)
}

// 设置历史记录保留设置
#[tauri::command]
fn set_history_retention(retention: HistoryRetention) -> Result<(), String> {
    let config_path = get_config_path();
    
    // Create directory if needed
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }
    
    // Read existing config or create new
    let mut config: serde_json::Value = if config_path.exists() {
        let content = fs::read_to_string(&config_path).unwrap_or_else(|_| "{}".to_string());
        serde_json::from_str(&content).unwrap_or_else(|_| json!({}))
    } else {
        json!({})
    };
    
    config["history_retention"] = serde_json::to_value(&retention)
        .map_err(|e| format!("Failed to serialize retention: {}", e))?;
    
    // Clean up old records based on new retention setting
    if retention != HistoryRetention::Forever {
        let now = Local::now();
        let cutoff_timestamp = match retention {
            HistoryRetention::SevenDays => now.timestamp() - 7 * 24 * 60 * 60,
            HistoryRetention::ThirtyDays => now.timestamp() - 30 * 24 * 60 * 60,
            HistoryRetention::NinetyDays => now.timestamp() - 90 * 24 * 60 * 60,
            HistoryRetention::Forever => 0,
        };
        
        let mut history: Vec<HistoryItem> = config.get("history")
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or_default();
        
        history.retain(|item| item.timestamp >= cutoff_timestamp);
        
        config["history"] = serde_json::to_value(&history)
            .map_err(|e| format!("Failed to serialize history: {}", e))?;
    }
    
    let content = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    
    fs::write(&config_path, content)
        .map_err(|e| format!("Failed to write config: {}", e))?;
    
    log::info!("History retention set to: {:?}", retention);
    Ok(())
}

pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            output_mode: Mutex::new(OutputMode::default()),
            is_recording: Mutex::new(false),
            recording_mode: Mutex::new(RecordingMode::default()),
            sidecar_manager: Mutex::new(None),
        })
        .setup(|app| {
            let handle = app.handle().clone();

            // Initialize sidecar
            sidecar::init_sidecar(&handle)?;

            // Setup tray
            tray::setup_tray(&handle)?;

            // Setup hotkey
            hotkey::setup_hotkey(&handle)?;

            log::info!("Mouth High initialized successfully");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
                set_output_mode, get_output_mode, 
                get_recording_mode, set_recording_mode, stop_recording,
                get_api_key, set_api_key, is_api_key_configured, get_usage_stats,
                get_hotkey_config, set_hotkey_config, update_hotkey,
                get_history, delete_history_item, clear_history,
                get_history_retention, set_history_retention
            ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
