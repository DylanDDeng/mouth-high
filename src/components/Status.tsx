import { Mic, Loader2, Volume2 } from "lucide-react";

interface StatusProps {
  status: "idle" | "recording" | "processing";
  transcript: string;
  hotkey: string;
}

function Status({ status, transcript, hotkey }: StatusProps) {

  const getStatusConfig = () => {
    switch (status) {
      case "recording":
        return {
          icon: <Mic size={24} className="status-icon recording" />,
          title: "正在录音...",
          desc: "松开快捷键结束录音",
          color: "#ef4444",
        };
      case "processing":
        return {
          icon: <Loader2 size={24} className="status-icon processing" />,
          title: "识别中...",
          desc: "正在将语音转换为文字",
          color: "#f59e0b",
        };
      default:
        return {
          icon: <Volume2 size={24} className="status-icon idle" />,
          title: "准备就绪",
          desc: `按住 ${hotkey} 开始说话`,
          color: "#10b981",
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div className="status-card">
      <div className="status-card-header">
        <h3>语音转录</h3>
        <span className={`status-badge ${status}`}>
          {status === "recording" ? "录音中" : status === "processing" ? "处理中" : "就绪"}
        </span>
      </div>

      <div className="status-display">
        <div 
          className="status-ring"
          style={{ 
            borderColor: config.color,
            boxShadow: status !== "idle" ? `0 0 30px ${config.color}40` : "none"
          }}
        >
          {config.icon}
        </div>
        <div className="status-info">
          <div className="status-title">{config.title}</div>
          <div className="status-desc">{config.desc}</div>
        </div>
      </div>

      <div className="transcript-section">
        <div className="transcript-header">
          <span className="transcript-label">识别结果</span>
          {transcript && (
            <button 
              className="clear-btn"
              onClick={() => {}}
            >
              清空
            </button>
          )}
        </div>
        <div className="transcript-area">
          {transcript ? (
            <p className="transcript-text">{transcript}</p>
          ) : (
            <div className="transcript-placeholder">
              <Mic size={32} className="placeholder-icon" />
              <p>按住快捷键说话，识别结果将显示在这里</p>
            </div>
          )}
        </div>
      </div>

      <div className="quick-tips">
        <div className="tip-item">
          <kbd>{hotkey}</kbd>
          <span>按住说话</span>
        </div>
        <div className="tip-divider" />
        <div className="tip-item">
          <kbd>松开</kbd>
          <span>自动识别</span>
        </div>
      </div>
    </div>
  );
}

export default Status;
