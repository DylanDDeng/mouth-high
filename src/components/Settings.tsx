import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Key, Keyboard, Globe, Check, ChevronDown, ExternalLink } from "lucide-react";

interface SettingsProps {
  outputMode: "keyboard" | "clipboard";
  onOutputModeChange: (mode: "keyboard" | "clipboard") => void;
}

function Settings({ outputMode, onOutputModeChange }: SettingsProps) {
  const [apiKey, setApiKey] = useState<string>("");
  const [apiKeyConfigured, setApiKeyConfigured] = useState<boolean>(false);
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [expanded, setExpanded] = useState<boolean>(false);

  useEffect(() => {
    invoke<boolean>("is_api_key_configured").then((configured) => {
      setApiKeyConfigured(configured);
    });
  }, []);

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    try {
      await invoke("set_api_key", { apiKey: apiKey.trim() });
      setApiKeyConfigured(true);
      setApiKey("");
      setShowApiKey(false);
    } catch (e) {
      console.error("Failed to save API key:", e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-card">
      <div 
        className="settings-header"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="settings-title">
          <div className="settings-icon">
            <Key size={18} />
          </div>
          <span>快速设置</span>
        </div>
        <ChevronDown 
          size={18} 
          className={`expand-icon ${expanded ? "expanded" : ""}`}
        />
      </div>

      <div className={`settings-content ${expanded ? "expanded" : ""}`}>
        {/* API Key 设置 */}
        <div className="setting-group">
          <div className="setting-label-row">
            <Key size={14} />
            <span>API Key</span>
            {apiKeyConfigured && <Check size={14} className="check-icon" />}
          </div>
          
          {!showApiKey ? (
            <div className="api-key-display">
              <span className={`api-status ${apiKeyConfigured ? "configured" : "not-configured"}`}>
                {apiKeyConfigured ? "已配置" : "未配置"}
              </span>
              <button 
                className="text-btn"
                onClick={() => setShowApiKey(true)}
              >
                {apiKeyConfigured ? "修改" : "配置"}
              </button>
            </div>
          ) : (
            <div className="api-key-input-group">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="输入 DashScope API Key"
                className="api-key-input"
              />
              <div className="api-key-actions">
                <button 
                  className="btn-secondary"
                  onClick={() => setShowApiKey(false)}
                >
                  取消
                </button>
                <button 
                  className="btn-primary"
                  onClick={handleSaveApiKey}
                  disabled={!apiKey.trim() || saving}
                >
                  {saving ? "保存中..." : "保存"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 输出方式 */}
        <div className="setting-group">
          <div className="setting-label-row">
            <Keyboard size={14} />
            <span>输出方式</span>
          </div>
          <div className="setting-options">
            <button
              className={`option-btn ${outputMode === "keyboard" ? "active" : ""}`}
              onClick={() => onOutputModeChange("keyboard")}
            >
              <span className="option-title">键盘输入</span>
              <span className="option-desc">直接模拟键盘输入</span>
            </button>
            <button
              className={`option-btn ${outputMode === "clipboard" ? "active" : ""}`}
              onClick={() => onOutputModeChange("clipboard")}
            >
              <span className="option-title">剪贴板</span>
              <span className="option-desc">复制到剪贴板</span>
            </button>
          </div>
        </div>

        {/* 语言 */}
        <div className="setting-group">
          <div className="setting-label-row">
            <Globe size={14} />
            <span>语言</span>
          </div>
          <div className="lang-display">
            <span>自动检测</span>
            <span className="lang-note">支持中文、英文等多种语言</span>
          </div>
        </div>
      </div>

      {/* 帮助链接 */}
      <div className="settings-footer">
        <a href="#" className="help-link">
          <ExternalLink size={14} />
          <span>完整设置在左侧"设置"菜单</span>
        </a>
      </div>
    </div>
  );
}

export default Settings;
