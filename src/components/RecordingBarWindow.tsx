import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Mic, Square } from "lucide-react";

function RecordingBarWindow() {
  const [waveform, setWaveform] = useState<number[]>(new Array(32).fill(0.3));
  const animationRef = useRef<number | null>(null);

  // 模拟波形动画
  useEffect(() => {
    const animate = () => {
      setWaveform((prev) => {
        const newWaveform = [...prev];
        for (let i = 0; i < newWaveform.length; i++) {
          const targetHeight = 0.2 + Math.random() * 0.8;
          newWaveform[i] = newWaveform[i] * 0.7 + targetHeight * 0.3;
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

  const handleStop = async () => {
    try {
      await invoke("stop_recording");
    } catch (error) {
      console.error("Failed to stop recording:", error);
    }
  };

  return (
    <div className="recording-bar-float">
      <div className="recording-bar-content">
        {/* 麦克风图标 */}
        <div className="recording-bar-mic">
          <Mic size={20} />
        </div>

        {/* 波形区域 */}
        <div className="waveform-bars">
          {waveform.map((height, index) => (
            <div
              key={index}
              className="waveform-bar"
              style={{
                height: `${height * 100}%`,
                opacity: 0.4 + height * 0.6,
              }}
            />
          ))}
        </div>

        {/* 停止按钮 */}
        <button
          className="recording-stop-btn"
          onClick={handleStop}
          title="点击完成录音"
        >
          <Square size={16} fill="currentColor" />
        </button>

        {/* 提示文字 */}
        <span className="recording-hint-text">点击完成</span>
      </div>
    </div>
  );
}

export default RecordingBarWindow;
