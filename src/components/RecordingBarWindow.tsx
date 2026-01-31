import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { X, Check } from "lucide-react";

function RecordingBarWindow() {
  const BAR_COUNT = 20;
  const [waveform, setWaveform] = useState<number[]>(new Array(BAR_COUNT).fill(0.12));
  const amplitudeRef = useRef(0.0);
  const lastAmplitudeRef = useRef(0.0);
  const phaseRef = useRef(0.0);
  const lastTimeRef = useRef(performance.now());

  // 监听真实音频振幅数据
  useEffect(() => {
    const currentWebview = getCurrentWebviewWindow();

    const setupListener = async () => {
      // Note: backend emits from `WebviewWindow`, so we must listen on `WebviewWindow`.
      const unlisten = await currentWebview.listen<number>("audio-amplitude", (event) => {
        const raw = typeof event.payload === "number" ? event.payload : Number(event.payload);
        const clamped = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0;

        // Smooth amplitude to avoid jitter; keep "small sounds" visible with a non-linear curve.
        amplitudeRef.current += (clamped - amplitudeRef.current) * 0.25;
        const visualAmp = Math.min(1, Math.sqrt(amplitudeRef.current) * 1.25);

        // Drive a moving waveform even when amplitude is steady.
        const now = performance.now();
        const dt = now - lastTimeRef.current;
        lastTimeRef.current = now;

        const delta = Math.abs(clamped - lastAmplitudeRef.current);
        lastAmplitudeRef.current = clamped;

        // Faster motion when amplitude changes rapidly (speech tends to be "busier").
        const speed = 0.08 + delta * 0.9 + visualAmp * 0.12;
        phaseRef.current += (dt / 16.6667) * speed;

        setWaveform((prev) => {
          const t = phaseRef.current;
          const next = new Array<number>(BAR_COUNT);

          for (let i = 0; i < BAR_COUNT; i++) {
            // Center bars a bit taller, like typical voice indicators.
            const x = (i - (BAR_COUNT - 1) / 2) / ((BAR_COUNT - 1) / 2); // [-1, 1]
            const envelope = Math.exp(-x * x * 1.2);

            // Two layered sines gives a "wave" feel without flickery randomness.
            const wave =
              Math.sin(t * 1.1 + i * 0.55) * 0.35 +
              Math.sin(t * 1.9 - i * 0.25) * 0.2;

            // Keep a tiny breathing motion so it never looks like a frozen picture.
            const idle = Math.sin(t * 0.7 + i * 0.4) * 0.03 * envelope;

            const base = 0.10 + envelope * (0.10 + visualAmp * 0.78);
            let target = base + envelope * wave * (0.12 + visualAmp * 0.25) + idle;

            target = Math.max(0.1, Math.min(1.0, target));
            next[i] = prev[i] * 0.6 + target * 0.4;
          }

          return next;
        });
      });

      return unlisten;
    };

    const unlistenPromise = setupListener();

    return () => {
      unlistenPromise.then((fn) => fn());
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
