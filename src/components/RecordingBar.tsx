import { useState, useEffect, useRef } from "react";
import { Mic, Square } from "lucide-react";

interface RecordingBarProps {
  onStop: () => void;
}

function RecordingBar({ onStop }: RecordingBarProps) {
  const [waveform, setWaveform] = useState<number[]>(new Array(40).fill(0.3));
  const animationRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 模拟波形动画
  useEffect(() => {
    const animate = () => {
      setWaveform((prev) => {
        const newWaveform = [...prev];
        // 随机更新波形高度，模拟真实音频波动
        for (let i = 0; i < newWaveform.length; i++) {
          const targetHeight = 0.2 + Math.random() * 0.8;
          // 平滑过渡
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

  return (
    <div className="recording-bar-overlay" ref={containerRef}>
      <div className="recording-bar">
        {/* 麦克风图标 */}
        <div className="recording-bar-icon">
          <Mic size={20} />
        </div>

        {/* 波形区域 */}
        <div className="waveform-container">
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
          onClick={onStop}
          title="点击完成录音"
        >
          <Square size={16} fill="currentColor" />
        </button>

        {/* 提示文字 */}
        <div className="recording-hint">点击完成</div>
      </div>
    </div>
  );
}

export default RecordingBar;
