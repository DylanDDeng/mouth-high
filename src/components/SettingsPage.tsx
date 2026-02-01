import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { 
  ArrowLeft, Check, Keyboard, Mic, Globe, 
  ToggleLeft, Zap, Command, Star, Key, Clock
} from "lucide-react";

interface SettingsPageProps {
  onBack?: () => void;
}

interface HotkeyConfig {
  modifiers: string[];
  key: string;
}

type RecordingMode = "hold" | "toggle";
type OutputMode = "keyboard" | "clipboard";
type HistoryRetention = "7days" | "30days" | "90days" | "forever";

const PRESETS = [
  { name: "Cmd + R", modifiers: ["cmd"], key: "r", icon: Command },
  { name: "Ctrl + R", modifiers: ["ctrl"], key: "r", icon: Zap },
  { name: "F5", modifiers: [], key: "f5", icon: Star },
  { name: "F8", modifiers: [], key: "f8", icon: Star },
];

const RETENTION_OPTIONS = [
  { value: "7days", label: "7 天" },
  { value: "30days", label: "30 天" },
  { value: "90days", label: "90 天" },
  { value: "forever", label: "永久" },
];

function SettingsPage({ onBack }: SettingsPageProps) {
  const [hotkeyConfig, setHotkeyConfig] = useState<HotkeyConfig>({ modifiers: ["cmd"], key: "r" });
  const [recordingMode, setRecordingMode] = useState<RecordingMode>("hold");
  const [outputMode, setOutputMode] = useState<OutputMode>("keyboard");
  const [retention, setRetention] = useState<HistoryRetention>("forever");
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [showApiInput, setShowApiInput] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [isMac, setIsMac] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setIsMac(navigator.platform.toLowerCase().includes("mac"));
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const [config, recMode, outMode, ret, apiConfigured] = await Promise.all([
        invoke<HotkeyConfig>("get_hotkey_config"),
        invoke<RecordingMode>("get_recording_mode"),
        invoke<OutputMode>("get_output_mode"),
        invoke<HistoryRetention>("get_history_retention"),
        invoke<boolean>("is_api_key_configured"),
      ]);
      setHotkeyConfig(config);
      setRecordingMode(recMode);
      setOutputMode(outMode);
      setRetention(ret);
      setApiKeyConfigured(apiConfigured);
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
  };

  const handleHotkeyChange = async (preset: typeof PRESETS[0]) => {
    const newConfig = { modifiers: preset.modifiers, key: preset.key };
    setHotkeyConfig(newConfig);
    try {
      await invoke("update_hotkey", { config: newConfig });
    } catch (e) {
      console.error("Failed to update hotkey:", e);
    }
  };

  const handleRecordingModeChange = async (mode: RecordingMode) => {
    setRecordingMode(mode);
    try {
      await invoke("set_recording_mode", { mode });
    } catch (e) {
      console.error("Failed to set recording mode:", e);
    }
  };

  const handleOutputModeChange = async (mode: OutputMode) => {
    setOutputMode(mode);
    try {
      await invoke("set_output_mode", { mode });
    } catch (e) {
      console.error("Failed to set output mode:", e);
    }
  };

  const handleRetentionChange = async (newRetention: HistoryRetention) => {
    setRetention(newRetention);
    try {
      await invoke("set_history_retention", { retention: newRetention });
    } catch (e) {
      console.error("Failed to set retention:", e);
    }
  };

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    try {
      await invoke("set_api_key", { apiKey: apiKey.trim() });
      setApiKeyConfigured(true);
      setShowApiInput(false);
      setApiKey("");
    } catch (e) {
      console.error("Failed to save API key:", e);
    } finally {
      setSaving(false);
    }
  };

  const formatHotkey = (config: HotkeyConfig) => {
    if (config.modifiers.length === 0) return config.key.toUpperCase();
    const mods = config.modifiers.map(m => {
      if (!isMac) return m.charAt(0).toUpperCase() + m.slice(1);
      return m === "cmd" ? "⌘" : m === "ctrl" ? "⌃" : m === "shift" ? "⇧" : m === "alt" ? "⌥" : m;
    });
    return [...mods, config.key.toUpperCase()].join(" + ");
  };

  const isActivePreset = (preset: typeof PRESETS[0]) => {
    return hotkeyConfig.key === preset.key && 
      JSON.stringify([...hotkeyConfig.modifiers].sort()) === JSON.stringify([...preset.modifiers].sort());
  };

  return (
    <div className="settings-page-new">
      {/* 头部 */}
      <header className="settings-header-new">
        {onBack && (
          <button className="back-btn-new" onClick={onBack}>
            <ArrowLeft size={20} />
          </button>
        )}
        <h1>设置</h1>
      </header>

      <div className="settings-content-new">
        {/* 快捷键设置 */}
        <section className="setting-card-new">
          <div className="setting-header-new">
            <Keyboard size={18} />
            <h2>快捷键</h2>
          </div>
          <p className="setting-desc-new">选择语音输入的触发方式</p>
          
          <div className="preset-list-new">
            {PRESETS.map((preset) => {
              const Icon = preset.icon;
              const active = isActivePreset(preset);
              return (
                <button
                  key={preset.name}
                  className={`preset-btn-new ${active ? "active" : ""}`}
                  onClick={() => handleHotkeyChange(preset)}
                >
                  <Icon size={16} />
                  <span>{isMac && preset.name.includes("Cmd") ? preset.name : 
                         !isMac && preset.name.includes("Cmd") ? "Ctrl + R" : preset.name}</span>
                  {active && <Check size={14} className="check-icon" />}
                </button>
              );
            })}
          </div>
          
          <div className="current-hotkey-new">
            当前: <kbd>{formatHotkey(hotkeyConfig)}</kbd>
          </div>
        </section>

        {/* 录音模式 */}
        <section className="setting-card-new">
          <div className="setting-header-new">
            <ToggleLeft size={18} />
            <h2>录音模式</h2>
          </div>
          
          <div className="option-list-new">
            <button 
              className={`option-btn-new ${recordingMode === "hold" ? "active" : ""}`}
              onClick={() => handleRecordingModeChange("hold")}
            >
              <div className="option-info-new">
                <span className="option-name-new">按住模式</span>
                <span className="option-desc-new">按住快捷键录音，松开自动停止</span>
              </div>
              {recordingMode === "hold" && <Check size={16} />}
            </button>
            <button 
              className={`option-btn-new ${recordingMode === "toggle" ? "active" : ""}`}
              onClick={() => handleRecordingModeChange("toggle")}
            >
              <div className="option-info-new">
                <span className="option-name-new">切换模式</span>
                <span className="option-desc-new">按一下开始，再按一下或点击指示器停止</span>
              </div>
              {recordingMode === "toggle" && <Check size={16} />}
            </button>
          </div>
        </section>

        {/* 输出方式 */}
        <section className="setting-card-new">
          <div className="setting-header-new">
            <Mic size={18} />
            <h2>输出方式</h2>
          </div>
          
          <div className="option-list-new">
            <button 
              className={`option-btn-new ${outputMode === "keyboard" ? "active" : ""}`}
              onClick={() => handleOutputModeChange("keyboard")}
            >
              <div className="option-info-new">
                <span className="option-name-new">键盘输入</span>
                <span className="option-desc-new">直接输出到当前光标位置</span>
              </div>
              {outputMode === "keyboard" && <Check size={16} />}
            </button>
            <button 
              className={`option-btn-new ${outputMode === "clipboard" ? "active" : ""}`}
              onClick={() => handleOutputModeChange("clipboard")}
            >
              <div className="option-info-new">
                <span className="option-name-new">剪贴板</span>
                <span className="option-desc-new">复制到剪贴板并粘贴</span>
              </div>
              {outputMode === "clipboard" && <Check size={16} />}
            </button>
          </div>
        </section>

        {/* 历史记录保留 */}
        <section className="setting-card-new">
          <div className="setting-header-new">
            <Clock size={18} />
            <h2>历史记录保留</h2>
          </div>
          
          <div className="retention-select-new">
            {RETENTION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`retention-btn-new ${retention === opt.value ? "active" : ""}`}
                onClick={() => handleRetentionChange(opt.value as HistoryRetention)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        {/* API 设置 */}
        <section className="setting-card-new">
          <div className="setting-header-new">
            <Key size={18} />
            <h2>API 设置</h2>
          </div>
          
          {!showApiInput ? (
            <div className="api-display-new">
              <div className="api-status-new">
                <Globe size={16} />
                <span>DashScope API</span>
                {apiKeyConfigured && <Check size={14} className="status-check" />}
              </div>
              <button className="api-action-btn-new" onClick={() => setShowApiInput(true)}>
                {apiKeyConfigured ? "修改" : "配置"}
              </button>
            </div>
          ) : (
            <div className="api-input-new">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="输入 DashScope API Key"
              />
              <div className="api-actions-new">
                <button className="btn-secondary-new" onClick={() => setShowApiInput(false)}>
                  取消
                </button>
                <button 
                  className="btn-primary-new" 
                  onClick={handleSaveApiKey}
                  disabled={!apiKey.trim() || saving}
                >
                  {saving ? "保存中..." : "保存"}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default SettingsPage;
