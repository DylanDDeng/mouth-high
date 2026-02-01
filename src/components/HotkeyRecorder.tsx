import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Keyboard, X, Check, Mic } from "lucide-react";

interface HotkeyRecorderProps {
  currentHotkey: string;
  onHotkeyChange: (hotkey: string) => void;
}

interface CapturedKey {
  modifiers: string[];
  key: string;
}

function HotkeyRecorder({ currentHotkey, onHotkeyChange }: HotkeyRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [captured, setCaptured] = useState<CapturedKey | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const isMac = navigator.platform.toLowerCase().includes("mac");

  const formatKey = (key: string) => {
    if (key.length === 1) return key.toUpperCase();
    // 处理功能键
    return key.replace(/^f(\d+)$/i, "F$1");
  };

  const formatDisplay = (captured: CapturedKey) => {
    const mods = captured.modifiers.map(m => {
      if (!isMac) return m.charAt(0).toUpperCase() + m.slice(1);
      switch (m) {
        case "cmd": return "⌘";
        case "ctrl": return "⌃";
        case "shift": return "⇧";
        case "alt": return "⌥";
        default: return m;
      }
    });
    return [...mods, formatKey(captured.key)].join(" + ");
  };

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isRecording) return;

    e.preventDefault();
    e.stopPropagation();

    // 忽略单独的修饰键
    const modifierKeys = ["Control", "Shift", "Alt", "Meta", "Cmd"];
    if (modifierKeys.includes(e.key)) return;

    // 捕获修饰键
    const modifiers: string[] = [];
    if (e.metaKey) modifiers.push("cmd");
    if (e.ctrlKey) modifiers.push("ctrl");
    if (e.altKey) modifiers.push("alt");
    if (e.shiftKey) modifiers.push("shift");

    // 捕获普通键
    let key = e.key.toLowerCase();
    
    // 处理功能键
    if (key.startsWith("f") && key.length <= 3) {
      key = key.toLowerCase();
    } else if (key.length === 1) {
      key = key.toLowerCase();
    } else {
      // 忽略其他特殊键
      return;
    }

    setCaptured({ modifiers, key });
  }, [isRecording]);

  useEffect(() => {
    if (isRecording) {
      window.addEventListener("keydown", handleKeyDown, true);
      return () => window.removeEventListener("keydown", handleKeyDown, true);
    }
  }, [isRecording, handleKeyDown]);

  const startRecording = () => {
    setIsRecording(true);
    setCaptured(null);
    setError("");
    setSuccess(false);
  };

  const cancelRecording = () => {
    setIsRecording(false);
    setCaptured(null);
    setError("");
  };

  const saveHotkey = async () => {
    if (!captured) return;

    // 验证至少有一个修饰键（避免纯字母键）
    if (captured.modifiers.length === 0) {
      setError("请至少按住一个修饰键（如 Cmd、Ctrl、Shift）");
      return;
    }

    // Space 键检查
    if (captured.key === "space") {
      setError("Space 键可能被系统限制，建议使用字母键");
      return;
    }

    try {
      await invoke("update_hotkey", { 
        config: { 
          modifiers: captured.modifiers, 
          key: captured.key 
        } 
      });
      
      onHotkeyChange(formatDisplay(captured));
      setIsRecording(false);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (e: any) {
      let errorMsg = "设置失败";
      if (typeof e === "string" && e.includes("RegisterEventHotKey")) {
        errorMsg = "该快捷键已被系统占用，请尝试其他组合";
      }
      setError(errorMsg);
    }
  };

  return (
    <div className="hotkey-recorder">
      <div className="recorder-header">
        <Keyboard size={18} />
        <h3>快捷键</h3>
      </div>

      <div className="recorder-content">
        <div className="recorder-main">
          <div className="recorder-info">
            <div className="recorder-title">
              <Mic size={16} />
              <span>开始录音</span>
            </div>
            <p className="recorder-desc">
              {isRecording 
                ? "请在键盘上按下想要的组合键..." 
                : "按住快捷键开始说话，松开后自动识别"}
            </p>
          </div>

          <div className="recorder-display">
            {isRecording && captured ? (
              <div className="captured-keys">
                {captured.modifiers.map((mod, i) => (
                  <kbd key={i} className="key-badge">
                    {isMac 
                      ? mod === "cmd" ? "⌘" : mod === "ctrl" ? "⌃" : mod === "shift" ? "⇧" : "⌥"
                      : mod.charAt(0).toUpperCase() + mod.slice(1)}
                  </kbd>
                ))}
                <kbd className="key-badge">{formatKey(captured.key)}</kbd>
              </div>
            ) : (
              <div className="current-hotkey">{currentHotkey}</div>
            )}

            {isRecording && (
              <button className="cancel-btn" onClick={cancelRecording} title="取消">
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        {isRecording && captured && (
          <div className="recorder-actions">
            <button className="save-btn" onClick={saveHotkey}>
              <Check size={16} />
              确认保存
            </button>
          </div>
        )}

        {!isRecording && (
          <button className="record-btn" onClick={startRecording}>
            {success ? "已保存 ✓" : "点击记录新快捷键"}
          </button>
        )}

        {error && <p className="recorder-error">{error}</p>}
      </div>
    </div>
  );
}

export default HotkeyRecorder;
