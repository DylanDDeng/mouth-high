use std::process::Command;

/// 获取当前焦点应用的 bundle identifier
pub fn get_frontmost_app() -> Option<String> {
    let output = Command::new("osascript")
        .args(["-e", r#"tell application "System Events" to get bundle identifier of (first process whose frontmost is true)"#])
        .output()
        .ok()?;

    if output.status.success() {
        let bundle_id = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !bundle_id.is_empty() {
            return Some(bundle_id);
        }
    }
    None
}

/// 激活指定 bundle identifier 的应用
pub fn activate_app(bundle_id: &str) -> Result<(), String> {
    let script = format!(
        r#"tell application id "{}" to activate"#,
        bundle_id
    );

    let output = Command::new("osascript")
        .args(["-e", &script])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}
