import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { X, Check } from "lucide-react";

function RecordingBarWindow() {
  const [waveform, setWaveform] = useState<number[]>(new Array(20).fill(0.3));
  const animationRef = useRef<number | null>(null);
  const amplitudeRef = useRef(0.3);
  const targetAmplitudeRef = useRef(0.3);

  // 监听真实音频振幅数据
  useEffect(() => {
    const setupListener = async () => {
      const unlisten = await listen<number>("audio-amplitude", (event) => {
        // 接收到的振幅值是 0-1 范围
        targetAmplitudeRef.current = event.payload;
      });
      return unlisten;
    };

    const unlistenPromise = setupListener();

    return () => {
      unlistenPromise.then((fn) => fn());
    };
  }, []);

  // 波形动画 - 使用真实音频数据
  useEffect(() => {
    const animate = () => {
      // 平滑过渡当前振幅到目标振幅
      amplitudeRef.current += (targetAmplitudeRef.current - amplitudeRef.current) * 0.3;
      
      setWaveform((prev) => {
        const newWaveform = [...prev];
        for (let i = 0; i < newWaveform.length; i++) {
          // 根据实际振幅生成波形，添加一些随机性模拟真实音频
          const baseHeight = 0.15 + amplitudeRef.current * 0.75;
          const randomVariation = (Math.random() - 0.5) * 0.3 * amplitudeRef.current;
          const noise = Math.sin(Date.now() / 100 + i * 0.5) * 0.1 * amplitudeRef.current;
          
          let newHeight = baseHeight + randomVariation + noise;
          newHeight = Math.max(0.1, Math.min(1.0, newHeight));
          
          // 平滑过渡
          newWaveform[i] = newWaveform[i] * 0.6 + newHeight * 0.4;
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
