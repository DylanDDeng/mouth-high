import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, Check, Pencil } from "lucide-react";

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

  const isMac = navigator.platform.toLowerCase().includes("mac");

  const formatKey = (key: string) => {
    if (key.length === 1) return key.toUpperCase();
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
  };

  const cancelRecording = () => {
    setIsRecording(false);
    setCaptured(null);
    setError("");
  };

  const saveHotkey = async () => {
    if (!captured) return;

    if (captured.modifiers.length === 0) {
      setError("请至少按住一个修饰键（如 Cmd、Ctrl、Shift）");
      return;
    }

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
    } catch (e: any) {
      let errorMsg = "设置失败";
      if (typeof e === "string" && e.includes("RegisterEventHotKey")) {
        errorMsg = "该快捷键已被系统占用";
      }
      setError(errorMsg);
    }
  };

  // 解析当前快捷键显示为徽章
  const parseHotkey = (hotkey: string) => {
    return hotkey.split(" + ").filter(Boolean);
  };

  return (
    <div className="hotkey-recorder-compact">
        {isRecording && captured ? (
          // 录制中 - 显示新捕获的键
          <div className="captured-keys-row">
            {captured.modifiers.map((mod, i) => (
              <kbd key={i} className="key-badge-new">
                {isMac 
                  ? mod === "cmd" ? "⌘" : mod === "ctrl" ? "⌃" : mod === "shift" ? "⇧" : "⌥"
                  : mod.charAt(0).toUpperCase() + mod.slice(1)}
              </kbd>
            ))}
            <kbd className="key-badge-new">{formatKey(captured.key)}</kbd>
            
            <div className="recorder-actions-inline">
              <button className="action-btn cancel" onClick={cancelRecording}>
                <X size={16} />
              </button>
              <button className="action-btn confirm" onClick={saveHotkey}>
                <Check size={16} />
              </button>
            </div>
          </div>
        ) : isRecording ? (
          // 录制中等待输入
          <div className="recording-placeholder" onClick={cancelRecording}>
            <span className="recording-hint">请在键盘上按下快捷键...</span>
            <button className="action-btn cancel">
              <X size={16} />
            </button>
          </div>
        ) : (
          // 正常显示当前快捷键，点击可编辑
          <div className="current-hotkey-row" onClick={startRecording}>
            <div className="hotkey-badges">
              {parseHotkey(currentHotkey).map((key, i) => (
                <kbd key={i} className="key-badge-new">{key}</kbd>
              ))}
            </div>
            <button className="action-btn edit" onClick={(e) => { e.stopPropagation(); startRecording(); }} title="修改快捷键">
              <Pencil size={14} color="white" />
            </button>
          </div>
        )}

      {/* 错误提示 */}
      {error && <p className="recorder-error-compact">{error}</p>}
    </div>
  );
}

export default HotkeyRecorder;
