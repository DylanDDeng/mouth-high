import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, Check } from "lucide-react";

function RecordingBarWindow() {
  const [waveform, setWaveform] = useState<number[]>(new Array(16).fill(0.4));
  const animationRef = useRef<number | null>(null);

  // 波形动画
  useEffect(() => {
    const animate = () => {
      setWaveform((prev) => {
        const newWaveform = [...prev];
        for (let i = 0; i < newWaveform.length; i++) {
          const targetHeight = 0.2 + Math.random() * 0.9;
          newWaveform[i] = newWaveform[i] * 0.6 + targetHeight * 0.4;
        }
        return newWaveform;
      });
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  // 取消录音
  const handleCancel = async () => {
    try {
      await invoke("stop_recording");
    } catch (error) {
      console.error("Failed to stop recording:", error);
    }
  };

  // 确认完成
  const handleConfirm = async () => {
    try {
      await invoke("stop_recording");
    } catch (error) {
      console.error("Failed to stop recording:", error);
    }
  };

  return (
    <div className="recording-bar-float">
      <div className="recording-bar-content">
        {/* 取消按钮 */}
        <button
          className="recording-cancel-btn"
          onClick={handleCancel}
          title="取消"
        >
          <X size={18} strokeWidth={2.5} />
        </button>

        {/* 波形区域 */}
        <div className="waveform-bars">
          {waveform.map((height, index) => (
            <div
              key={index}
              className="waveform-bar"
              style={{
                height: `${height * 100}%`,
              }}
            />
          ))}
        </div>

        {/* 确认按钮 */}
        <button
          className="recording-confirm-btn"
          onClick={handleConfirm}
          title="完成"
        >
          <Check size={18} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}

export default RecordingBarWindow;
