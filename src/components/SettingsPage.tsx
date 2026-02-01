import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { 
  ArrowLeft, Check, Mic, Globe, 
  ToggleLeft, Key, Clock, ChevronDown, Keyboard
} from "lucide-react";
import HotkeyRecorder from "./HotkeyRecorder";

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

const RETENTION_OPTIONS = [
  { value: "7days", label: "7 天" },
  { value: "30days", label: "30 天" },
  { value: "90days", label: "90 天" },
  { value: "forever", label: "永久" },
];

const RECORDING_MODE_LABELS: Record<RecordingMode, string> = {
  hold: "按住模式",
  toggle: "切换模式",
};

const OUTPUT_MODE_LABELS: Record<OutputMode, string> = {
  keyboard: "键盘输入",
  clipboard: "剪贴板",
};

function SettingsPage({ onBack }: SettingsPageProps) {
  const [hotkeyDisplay, setHotkeyDisplay] = useState("⌘ + R");
  const [recordingMode, setRecordingMode] = useState<RecordingMode>("hold");
  const [outputMode, setOutputMode] = useState<OutputMode>("keyboard");
  const [retention, setRetention] = useState<HistoryRetention>("forever");
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [showApiInput, setShowApiInput] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  
  // 下拉菜单显示状态
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const [showOutputDropdown, setShowOutputDropdown] = useState(false);
  const [showRetentionDropdown, setShowRetentionDropdown] = useState(false);

  const isMac = navigator.platform.toLowerCase().includes("mac");

  useEffect(() => {
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
      
      const mods = config.modifiers.map(m => {
        if (!isMac) return m.charAt(0).toUpperCase() + m.slice(1);
        switch (m) {
          case "cmd": return "⌘";
          case "ctrl": return "⌃";
          case "shift": return "⇧";
          case "alt": return "⌥";
          default: return m;
        }
      });
      const key = config.key.toUpperCase();
      setHotkeyDisplay([...mods, key].join(" + "));
      
      setRecordingMode(recMode);
      setOutputMode(outMode);
      setRetention(ret);
      setApiKeyConfigured(apiConfigured);
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
  };

  const handleRecordingModeChange = async (mode: RecordingMode) => {
    setRecordingMode(mode);
    setShowModeDropdown(false);
    try {
      await invoke("set_recording_mode", { mode });
    } catch (e) {
      console.error("Failed to set recording mode:", e);
    }
  };

  const handleOutputModeChange = async (mode: OutputMode) => {
    setOutputMode(mode);
    setShowOutputDropdown(false);
    try {
      await invoke("set_output_mode", { mode });
    } catch (e) {
      console.error("Failed to set output mode:", e);
    }
  };

  const handleRetentionChange = async (newRetention: HistoryRetention) => {
    setRetention(newRetention);
    setShowRetentionDropdown(false);
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

  return (
    <div className="settings-page-v2">
      {/* 头部 */}
      <header className="settings-header-v2">
        {onBack && (
          <button className="back-btn-v2" onClick={onBack}>
            <ArrowLeft size={20} />
          </button>
        )}
        <h1>设置</h1>
      </header>

      <div className="settings-content-v2">
        {/* 快捷键设置 */}
        <section className="setting-section-v2">
          <div className="section-title-v2">
            <Keyboard size={18} />
            <span>快捷键</span>
          </div>
          <HotkeyRecorder 
            currentHotkey={hotkeyDisplay} 
            onHotkeyChange={setHotkeyDisplay}
          />
        </section>

        {/* 录音模式 */}
        <section className="setting-section-v2">
          <div className="section-title-v2">
            <ToggleLeft size={18} />
            <span>录音模式</span>
          </div>
          
          <div className="setting-row-v2">
            <div className="setting-info-v2">
              <span className="setting-label-v2">当前模式</span>
            </div>
            <div className="dropdown-wrapper-v2">
              <button 
                className="dropdown-trigger-v2"
                onClick={() => setShowModeDropdown(!showModeDropdown)}
              >
                <span>{RECORDING_MODE_LABELS[recordingMode]}</span>
                <ChevronDown size={16} className={showModeDropdown ? "open" : ""} />
              </button>
              
              {showModeDropdown && (
                <div className="dropdown-menu-v2">
                  <button 
                    className={`dropdown-item-v2 ${recordingMode === "hold" ? "active" : ""}`}
                    onClick={() => handleRecordingModeChange("hold")}
                  >
                    <div className="item-info-v2">
                      <span className="item-name-v2">按住模式</span>
                      <span className="item-desc-v2">按住快捷键录音，松开自动停止</span>
                    </div>
                    {recordingMode === "hold" && <Check size={16} />}
                  </button>
                  <button 
                    className={`dropdown-item-v2 ${recordingMode === "toggle" ? "active" : ""}`}
                    onClick={() => handleRecordingModeChange("toggle")}
                  >
                    <div className="item-info-v2">
                      <span className="item-name-v2">切换模式</span>
                      <span className="item-desc-v2">按一下开始，再按一下停止</span>
                    </div>
                    {recordingMode === "toggle" && <Check size={16} />}
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 输出方式 */}
        <section className="setting-section-v2">
          <div className="section-title-v2">
            <Mic size={18} />
            <span>输出方式</span>
          </div>
          
          <div className="setting-row-v2">
            <div className="setting-info-v2">
              <span className="setting-label-v2">当前输出</span>
            </div>
            <div className="dropdown-wrapper-v2">
              <button 
                className="dropdown-trigger-v2"
                onClick={() => setShowOutputDropdown(!showOutputDropdown)}
              >
                <span>{OUTPUT_MODE_LABELS[outputMode]}</span>
                <ChevronDown size={16} className={showOutputDropdown ? "open" : ""} />
              </button>
              
              {showOutputDropdown && (
                <div className="dropdown-menu-v2">
                  <button 
                    className={`dropdown-item-v2 ${outputMode === "keyboard" ? "active" : ""}`}
                    onClick={() => handleOutputModeChange("keyboard")}
                  >
                    <div className="item-info-v2">
                      <span className="item-name-v2">键盘输入</span>
                      <span className="item-desc-v2">直接输出到当前光标位置</span>
                    </div>
                    {outputMode === "keyboard" && <Check size={16} />}
                  </button>
                  <button 
                    className={`dropdown-item-v2 ${outputMode === "clipboard" ? "active" : ""}`}
                    onClick={() => handleOutputModeChange("clipboard")}
                  >
                    <div className="item-info-v2">
                      <span className="item-name-v2">剪贴板</span>
                      <span className="item-desc-v2">复制到剪贴板并粘贴</span>
                    </div>
                    {outputMode === "clipboard" && <Check size={16} />}
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 历史记录保留 */}
        <section className="setting-section-v2">
          <div className="section-title-v2">
            <Clock size={18} />
            <span>历史记录保留</span>
          </div>
          
          <div className="setting-row-v2">
            <div className="setting-info-v2">
              <span className="setting-label-v2">保留时间</span>
            </div>
            <div className="dropdown-wrapper-v2">
              <button 
                className="dropdown-trigger-v2"
                onClick={() => setShowRetentionDropdown(!showRetentionDropdown)}
              >
                <span>{RETENTION_OPTIONS.find(o => o.value === retention)?.label}</span>
                <ChevronDown size={16} className={showRetentionDropdown ? "open" : ""} />
              </button>
              
              {showRetentionDropdown && (
                <div className="dropdown-menu-v2 retention-menu-v2">
                  {RETENTION_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      className={`dropdown-item-v2 ${retention === opt.value ? "active" : ""}`}
                      onClick={() => handleRetentionChange(opt.value as HistoryRetention)}
                    >
                      <span className="item-name-v2">{opt.label}</span>
                      {retention === opt.value && <Check size={16} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* API 设置 */}
        <section className="setting-section-v2">
          <div className="section-title-v2">
            <Key size={18} />
            <span>API 设置</span>
          </div>
          
          {!showApiInput ? (
            <div className="api-row-v2">
              <div className="api-info-v2">
                <Globe size={16} />
                <div className="api-text-v2">
                  <span className="api-name-v2">DashScope API</span>
                  <span className="api-model-v2">通义千问 3.0 ASR</span>
                </div>
                {apiKeyConfigured && <Check size={16} className="api-check-v2" />}
              </div>
              <button className="api-edit-btn-v2" onClick={() => setShowApiInput(true)}>
                {apiKeyConfigured ? "修改" : "配置"}
              </button>
            </div>
          ) : (
            <div className="api-input-v2">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="输入 DashScope API Key"
              />
              <div className="api-actions-v2">
                <button className="btn-secondary-v2" onClick={() => setShowApiInput(false)}>
                  取消
                </button>
                <button 
                  className="btn-primary-v2" 
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
