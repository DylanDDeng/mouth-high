use crate::OutputMode;
use arboard::Clipboard;
use enigo::{Enigo, Keyboard, Settings};
use std::thread;
use std::time::Duration;

pub fn output_text(text: &str, mode: OutputMode) -> Result<(), String> {
    match mode {
        OutputMode::Keyboard => simulate_keyboard_input(text),
        OutputMode::Clipboard => copy_to_clipboard_and_paste(text),
    }
}

fn simulate_keyboard_input(text: &str) -> Result<(), String> {
    // 已经通过 focus::activate_app 恢复了焦点，只需要短暂等待系统响应
    thread::sleep(Duration::from_millis(100));
    
    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("Failed to create Enigo instance: {}", e))?;

    // 短暂等待 Enigo 准备好
    thread::sleep(Duration::from_millis(50));

    // Type the text
    enigo
        .text(text)
        .map_err(|e| format!("Failed to type text: {}", e))?;

    log::info!("Typed {} characters via keyboard simulation", text.len());

    Ok(())
}

fn copy_to_clipboard_and_paste(text: &str) -> Result<(), String> {
    // Copy to clipboard
    let mut clipboard =
        Clipboard::new().map_err(|e| format!("Failed to access clipboard: {}", e))?;

    clipboard
        .set_text(text)
        .map_err(|e| format!("Failed to set clipboard text: {}", e))?;

    log::info!("Copied {} characters to clipboard", text.len());

    // Optionally paste (Cmd+V on macOS)
    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("Failed to create Enigo instance: {}", e))?;

    // Small delay
    thread::sleep(Duration::from_millis(100));

    // Press Cmd+V
    enigo
        .key(enigo::Key::Meta, enigo::Direction::Press)
        .map_err(|e| format!("Failed to press Meta key: {}", e))?;
    enigo
        .key(enigo::Key::Unicode('v'), enigo::Direction::Click)
        .map_err(|e| format!("Failed to press V key: {}", e))?;
    enigo
        .key(enigo::Key::Meta, enigo::Direction::Release)
        .map_err(|e| format!("Failed to release Meta key: {}", e))?;

    log::info!("Pasted from clipboard");

    Ok(())
}
