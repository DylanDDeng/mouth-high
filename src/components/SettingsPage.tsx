import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { 
  Key, Keyboard, Globe, Check, ChevronRight, 
  Command, Zap, Star, Info, ArrowLeft, Mic, ToggleLeft
} from "lucide-react";

interface SettingsPageProps {
  onBack?: () => void;
}

interface HotkeyConfig {
  modifiers: string[];
  key: string;
}

const MODIFIER_OPTIONS = [
  { value: "ctrl", label: "Ctrl", macLabel: "⌃ Ctrl" },
  { value: "shift", label: "Shift", macLabel: "⇧ Shift" },
  { value: "alt", label: "Alt", macLabel: "⌥ Option" },
  { value: "cmd", label: "Cmd", macLabel: "⌘ Command" },
];

const KEY_OPTIONS = [
  { value: "a", label: "A" }, { value: "b", label: "B" },
  { value: "c", label: "C" }, { value: "d", label: "D" },
  { value: "e", label: "E" }, { value: "f", label: "F" },
  { value: "g", label: "G" }, { value: "h", label: "H" },
  { value: "i", label: "I" }, { value: "j", label: "J" },
  { value: "k", label: "K" }, { value: "l", label: "L" },
  { value: "m", label: "M" }, { value: "n", label: "N" },
  { value: "o", label: "O" }, { value: "p", label: "P" },
  { value: "q", label: "Q" }, { value: "r", label: "R" },
  { value: "s", label: "S" }, { value: "t", label: "T" },
  { value: "u", label: "U" }, { value: "v", label: "V" },
  { value: "w", label: "W" }, { value: "x", label: "X" },
  { value: "y", label: "Y" }, { value: "z", label: "Z" },
];

const FUNCTION_KEYS = [
  { value: "f1", label: "F1" }, { value: "f2", label: "F2" },
  { value: "f3", label: "F3" }, { value: "f4", label: "F4" },
  { value: "f5", label: "F5" }, { value: "f6", label: "F6" },
  { value: "f7", label: "F7" }, { value: "f8", label: "F8" },
  { value: "f9", label: "F9" }, { value: "f10", label: "F10" },
  { value: "f11", label: "F11" }, { value: "f12", label: "F12" },
];

const PRESET_HOTKEYS = [
  { name: "Ctrl + R", modifiers: ["ctrl"], key: "r", icon: <Zap size={16} />, desc: "简单易按" },
  { name: "Cmd + R", modifiers: ["cmd"], key: "r", icon: <Command size={16} />, desc: "Mac 风格" },
  { name: "F5", modifiers: [], key: "f5", icon: <Star size={16} />, desc: "单手操作" },
  { name: "F8", modifiers: [], key: "f8", icon: <Star size={16} />, desc: "单手操作" },
];

function SettingsPage({ onBack }: SettingsPageProps) {
  const [hotkeyConfig, setHotkeyConfig] = useState<HotkeyConfig>({ modifiers: ["ctrl", "shift"], key: "r" });
  const [currentHotkeyDisplay, setCurrentHotkeyDisplay] = useState<string>("Ctrl + Shift + R");
  const [isMac, setIsMac] = useState<boolean>(false);
  const [hotkeyError, setHotkeyError] = useState<string>("");
  const [isUpdatingHotkey, setIsUpdatingHotkey] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string>("");

  // API Key 状态
  const [apiKey, setApiKey] = useState<string>("");
  const [apiKeyConfigured, setApiKeyConfigured] = useState<boolean>(false);
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  // 输出方式
  const [outputMode, setOutputMode] = useState<"keyboard" | "clipboard">("keyboard");

  // 录音模式
  const [recordingMode, setRecordingMode] = useState<"hold" | "toggle">("hold");

  useEffect(() => {
    setIsMac(navigator.platform.toLowerCase().includes("mac"));
    
    const loadConfigs = async () => {
      try {
        // 加载快捷键配置
        const config = await invoke<HotkeyConfig>("get_hotkey_config");
        setHotkeyConfig(config);
        setCurrentHotkeyDisplay(formatHotkey(config, navigator.platform.toLowerCase().includes("mac")));
        
        // 加载 API Key 状态
        const configured = await invoke<boolean>("is_api_key_configured");
        setApiKeyConfigured(configured);
        
        // 加载输出方式
        const mode = await invoke<"keyboard" | "clipboard">("get_output_mode");
        setOutputMode(mode);
        
        // 加载录音模式
        const recMode = await invoke<"hold" | "toggle">("get_recording_mode");
        setRecordingMode(recMode);
      } catch (e) {
        console.error("Failed to load configs:", e);
      }
    };
    
    loadConfigs();

    const unlisten = listen<string>("hotkey-registered", (event) => {
      setCurrentHotkeyDisplay(event.payload);
      setHotkeyError("");
      setSuccessMessage("快捷键已更新");
      setTimeout(() => setSuccessMessage(""), 3000);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const formatHotkey = (config: HotkeyConfig, mac: boolean): string => {
    const parts = [];
    for (const m of config.modifiers) {
      if (mac) {
        parts.push(
          m === "ctrl" ? "⌃" :
          m === "shift" ? "⇧" :
          m === "alt" ? "⌥" :
          m === "cmd" ? "⌘" : m
        );
      } else {
        parts.push(m.charAt(0).toUpperCase() + m.slice(1));
      }
    }
    parts.push(config.key.toUpperCase());
    return parts.join(" + ");
  };

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

  const handleOutputModeChange = async (mode: "keyboard" | "clipboard") => {
    setOutputMode(mode);
    try {
      await invoke("set_output_mode", { mode });
    } catch (error) {
      console.error("Failed to set output mode:", error);
    }
  };

  const handleRecordingModeChange = async (mode: "hold" | "toggle") => {
    setRecordingMode(mode);
    try {
      await invoke("set_recording_mode", { mode });
    } catch (error) {
      console.error("Failed to set recording mode:", error);
    }
  };

  const toggleModifier = (modifier: string) => {
    setHotkeyConfig(prev => {
      const exists = prev.modifiers.includes(modifier);
      const newModifiers = exists
        ? prev.modifiers.filter(m => m !== modifier)
        : [...prev.modifiers, modifier];
      return { ...prev, modifiers: newModifiers };
    });
    setHotkeyError("");
    setSuccessMessage("");
  };

  const selectKey = (key: string) => {
    setHotkeyConfig(prev => ({ ...prev, key }));
    setHotkeyError("");
    setSuccessMessage("");
  };

  const applyHotkey = async () => {
    if (hotkeyConfig.modifiers.length === 0) {
      setHotkeyError("请至少选择一个修饰键（如 Ctrl、Shift、Cmd）");
      return;
    }
    
    if (hotkeyConfig.key === "space") {
      setHotkeyError("Space 键可能被系统限制，建议使用字母键或 F 键");
      return;
    }
    
    setIsUpdatingHotkey(true);
    setHotkeyError("");
    setSuccessMessage("");
    
    try {
      await invoke("update_hotkey", { config: hotkeyConfig });
      setCurrentHotkeyDisplay(formatHotkey(hotkeyConfig, isMac));
    } catch (e: any) {
      console.error("Failed to update hotkey:", e);
      let errorStr = typeof e === "string" ? e : JSON.stringify(e);
      let errorMsg = errorStr;
      if (errorStr.includes("RegisterEventHotKey failed") || errorStr.includes("os error")) {
        errorMsg = "该快捷键已被系统或其他应用占用，请尝试：\n• 使用不同的字母键或 F 键\n• 添加更多修饰键组合\n• 检查系统偏好设置 > 键盘 > 快捷键";
      } else if (errorStr.includes("Space")) {
        errorMsg = "Space 键被系统保留，请选择其他按键";
      }
      setHotkeyError(errorMsg);
    } finally {
      setIsUpdatingHotkey(false);
    }
  };

  const applyPreset = (preset: typeof PRESET_HOTKEYS[0]) => {
    const newConfig = { modifiers: preset.modifiers, key: preset.key };
    setHotkeyConfig(newConfig);
    setHotkeyError("");
    setSuccessMessage("");
  };

  return (
    <div className="settings-page">
      {/* 头部 */}
      <header className="settings-page-header">
        {onBack && (
          <button className="back-btn" onClick={onBack}>
            <ArrowLeft size={20} />
          </button>
        )}
        <div>
          <h1>设置</h1>
          <p className="header-subtitle">自定义您的 Mouth High 体验</p>
        </div>
      </header>

      <div className="settings-content-grid">
        {/* 左侧：快捷键设置 */}
        <section className="settings-section">
          <div className="section-header">
            <div className="section-icon">
              <Keyboard size={20} />
            </div>
            <div>
              <h2>快捷键设置</h2>
              <p className="section-desc">自定义您的语音输入快捷键</p>
            </div>
          </div>

          <div className="settings-card">
            {/* 当前快捷键显示 */}
            <div className="current-hotkey-display">
              <span className="hotkey-label">当前快捷键</span>
              <div className="hotkey-value-large">
                {currentHotkeyDisplay}
              </div>
              {successMessage && (
                <span className="success-badge">{successMessage}</span>
              )}
            </div>

            {/* 预设快捷键 */}
            <div className="preset-section">
              <h3>推荐组合</h3>
              <div className="preset-grid">
                {PRESET_HOTKEYS.map(preset => (
                  <button
                    key={preset.name}
                    className={`preset-card ${
                      hotkeyConfig.key === preset.key && 
                      JSON.stringify([...hotkeyConfig.modifiers].sort()) === JSON.stringify([...preset.modifiers].sort())
                        ? "active"
                        : ""
                    }`}
                    onClick={() => applyPreset(preset)}
                  >
                    <div className="preset-icon">{preset.icon}</div>
                    <div className="preset-info">
                      <span className="preset-name">{preset.name}</span>
                      <span className="preset-desc">{preset.desc}</span>
                    </div>
                    {hotkeyConfig.key === preset.key && 
                     JSON.stringify([...hotkeyConfig.modifiers].sort()) === JSON.stringify([...preset.modifiers].sort()) && (
                      <Check size={16} className="preset-check" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* 自定义快捷键 */}
            <div className="custom-hotkey-section">
              <h3>自定义</h3>
              
              {/* 修饰键 */}
              <div className="modifiers-grid">
                {MODIFIER_OPTIONS.map(modifier => (
                  <button
                    key={modifier.value}
                    className={`modifier-toggle ${hotkeyConfig.modifiers.includes(modifier.value) ? "active" : ""}`}
                    onClick={() => toggleModifier(modifier.value)}
                  >
                    {isMac ? modifier.macLabel : modifier.label}
                  </button>
                ))}
              </div>

              {/* 按键选择 */}
              <div className="key-selection">
                <div className="key-group">
                  <span className="key-group-label">字母</span>
                  <div className="key-grid">
                    {KEY_OPTIONS.map(key => (
                      <button
                        key={key.value}
                        className={`key-btn ${hotkeyConfig.key === key.value ? "active" : ""}`}
                        onClick={() => selectKey(key.value)}
                      >
                        {key.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="key-group">
                  <span className="key-group-label">功能键</span>
                  <div className="key-grid">
                    {FUNCTION_KEYS.map(key => (
                      <button
                        key={key.value}
                        className={`key-btn ${hotkeyConfig.key === key.value ? "active" : ""}`}
                        onClick={() => selectKey(key.value)}
                      >
                        {key.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 应用按钮和错误提示 */}
              <div className="hotkey-actions">
                <button
                  className="apply-btn"
                  onClick={applyHotkey}
                  disabled={isUpdatingHotkey}
                >
                  {isUpdatingHotkey ? "应用中..." : "应用快捷键"}
                </button>
                
                {hotkeyError && (
                  <div className="error-message">
                    {hotkeyError.split('\n').map((line, i) => (
                      <div key={i}>{line}</div>
                    ))}
                  </div>
                )}
              </div>

              <div className="hotkey-tip">
                <Info size={14} />
                <span>建议选择不常用的组合，避免与其他软件冲突。Space、Enter 等特殊键可能被系统限制。</span>
              </div>
            </div>
          </div>
        </section>

        {/* 右侧：其他设置 */}
        <aside className="settings-sidebar">
          {/* API Key 设置 */}
          <section className="settings-subsection">
            <div className="subsection-header">
              <Key size={18} />
              <h3>API 设置</h3>
            </div>
            
            <div className="mini-card">
              <div className="mini-card-row">
                <span>DashScope API Key</span>
                {apiKeyConfigured ? (
                  <span className="badge success">已配置</span>
                ) : (
                  <span className="badge warning">未配置</span>
                )}
              </div>
              
              {!showApiKey ? (
                <button 
                  className="text-btn-full"
                  onClick={() => setShowApiKey(true)}
                >
                  {apiKeyConfigured ? "修改 API Key" : "配置 API Key"}
                  <ChevronRight size={16} />
                </button>
              ) : (
                <div className="api-input-group">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="输入 DashScope API Key"
                  />
                  <div className="api-actions">
                    <button className="btn-text" onClick={() => setShowApiKey(false)}>取消</button>
                    <button 
                      className="btn-primary-sm"
                      onClick={handleSaveApiKey}
                      disabled={!apiKey.trim() || saving}
                    >
                      {saving ? "保存中..." : "保存"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* 录音模式 */}
          <section className="settings-subsection">
            <div className="subsection-header">
              <ToggleLeft size={18} />
              <h3>录音模式</h3>
            </div>
            
            <div className="mini-card">
              <div className="output-options">
                <button
                  className={`output-option ${recordingMode === "hold" ? "active" : ""}`}
                  onClick={() => handleRecordingModeChange("hold")}
                >
                  <div className="option-content">
                    <span className="option-name">按住模式</span>
                    <span className="option-desc">按住快捷键录音，松开自动停止</span>
                  </div>
                  {recordingMode === "hold" && <Check size={16} />}
                </button>
                <button
                  className={`output-option ${recordingMode === "toggle" ? "active" : ""}`}
                  onClick={() => handleRecordingModeChange("toggle")}
                >
                  <div className="option-content">
                    <span className="option-name">切换模式</span>
                    <span className="option-desc">按一下开始录音，再按一下或点击指示器停止</span>
                  </div>
                  {recordingMode === "toggle" && <Check size={16} />}
                </button>
              </div>
            </div>
          </section>

          {/* 输出方式 */}
          <section className="settings-subsection">
            <div className="subsection-header">
              <Mic size={18} />
              <h3>输出方式</h3>
            </div>
            
            <div className="mini-card">
              <div className="output-options">
                <button
                  className={`output-option ${outputMode === "keyboard" ? "active" : ""}`}
                  onClick={() => handleOutputModeChange("keyboard")}
                >
                  <div className="option-content">
                    <span className="option-name">键盘输入</span>
                    <span className="option-desc">直接模拟键盘输入到当前光标位置</span>
                  </div>
                  {outputMode === "keyboard" && <Check size={16} />}
                </button>
                <button
                  className={`output-option ${outputMode === "clipboard" ? "active" : ""}`}
                  onClick={() => handleOutputModeChange("clipboard")}
                >
                  <div className="option-content">
                    <span className="option-name">剪贴板</span>
                    <span className="option-desc">复制识别结果到剪贴板</span>
                  </div>
                  {outputMode === "clipboard" && <Check size={16} />}
                </button>
              </div>
            </div>
          </section>

          {/* 语言设置 */}
          <section className="settings-subsection">
            <div className="subsection-header">
              <Globe size={18} />
              <h3>语言</h3>
            </div>
            <div className="mini-card">
              <div className="lang-info">
                <span className="lang-current">自动检测</span>
                <span className="lang-support">支持中文、英文等多种语言</span>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

export default SettingsPage;
