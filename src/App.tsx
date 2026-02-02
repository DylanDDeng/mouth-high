import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import Status from "./components/Status";
import SettingsPage from "./components/SettingsPage";
import HistoryPage from "./components/History";
import { Mic, Clock, BookOpen, Settings as SettingsIcon } from "lucide-react";

type AppStatus = "idle" | "recording" | "processing";
type NavItem = "home" | "history" | "dictionary" | "settings";

interface TranscriptEvent {
  text: string;
  language?: string;
}

interface UsageStats {
  today_characters: number;
  total_characters: number;
  total_transcriptions: number;
}

interface HotkeyConfig {
  modifiers: string[];
  key: string;
}

type RecordingMode = "hold" | "toggle";

function App() {
  const [status, setStatus] = useState<AppStatus>("idle");
  const [transcript, setTranscript] = useState<string>("");
  const [activeNav, setActiveNav] = useState<NavItem>("home");
  const [stats, setStats] = useState<UsageStats>({
    today_characters: 0,
    total_characters: 0,
    total_transcriptions: 0,
  });
  const [hotkey, setHotkey] = useState<string>("Ctrl + Shift + R");
  const [recordingMode, setRecordingMode] = useState<RecordingMode>("hold");

  useEffect(() => {
    const isMac = navigator.platform.toLowerCase().includes("mac");

    const setupListeners = async () => {
      const unlistenRecording = await listen("recording-started", () => {
        setStatus("recording");
      });

      const unlistenProcessing = await listen("processing-started", () => {
        setStatus("processing");
      });

      const unlistenTranscript = await listen<TranscriptEvent>("transcript", (event) => {
        setStatus("idle");
        setTranscript(event.payload.text);
        // Refresh stats after transcription
        fetchStats();
      });

      const unlistenError = await listen<string>("error", (event) => {
        setStatus("idle");
        console.error("Error:", event.payload);
      });

      const unlistenHotkey = await listen<string>("hotkey-registered", (event) => {
        setHotkey(event.payload);
      });

      // 监听录音模式变化
      const unlistenRecordingMode = await listen<RecordingMode>("recording-mode-changed", (event) => {
        setRecordingMode(event.payload);
      });

      // 获取初始快捷键配置
      const loadHotkeyConfig = async () => {
        try {
          const config = await invoke<HotkeyConfig>("get_hotkey_config");
          setHotkey(formatHotkey(config, isMac));
        } catch (e) {
          console.error("Failed to load hotkey config:", e);
        }
      };

      // 获取录音模式
      const loadRecordingMode = async () => {
        try {
          const mode = await invoke<RecordingMode>("get_recording_mode");
          setRecordingMode(mode);
        } catch (e) {
          console.error("Failed to load recording mode:", e);
        }
      };

      loadHotkeyConfig();
      loadRecordingMode();

      return () => {
        unlistenRecording();
        unlistenProcessing();
        unlistenTranscript();
        unlistenError();
        unlistenHotkey();
        unlistenRecordingMode();
      };
    };

    setupListeners();
    fetchStats();
  }, []);

  const formatHotkey = (config: HotkeyConfig, mac: boolean): string => {
    const parts = [];
    for (const m of config.modifiers) {
      if (mac) {
        parts.push(
          m === "ctrl" ? "⌃" :
          m === "shift" ? "⇧" :
          m === "alt" ? "⌥" :
          m === "cmd" ? "⌘" : m
        );
      } else {
        parts.push(m.charAt(0).toUpperCase() + m.slice(1));
      }
    }
    parts.push(config.key.toUpperCase());
    return parts.join(" + ");
  };

  const fetchStats = async () => {
    try {
      const result = await invoke<UsageStats>("get_usage_stats");
      setStats(result);
    } catch (e) {
      console.error("Failed to fetch stats:", e);
    }
  };

  const navItems: { id: NavItem; label: string; icon: React.ReactNode }[] = [
    { id: "home", label: "首页", icon: <Mic size={18} /> },
    { id: "history", label: "历史记录", icon: <Clock size={18} /> },
    { id: "dictionary", label: "词典", icon: <BookOpen size={18} /> },
  ];

  // 渲染首页内容
  const renderHome = () => (
    <>
      {/* 顶部标题区 */}
      <header className="content-header">
        <div className="header-text">
          <h1>自然说话，完美写作</h1>
          <p className="header-desc">
            {recordingMode === "hold" 
              ? <>按住 <kbd>{hotkey}</kbd> 说话，松开后自动将语音转换为文字</>
              : <>按 <kbd>{hotkey}</kbd> 开始录音，点击指示器或再按一次停止</>
            }
          </p>
        </div>
      </header>

      {/* 统计卡片区域 */}
      <section className="stats-section">
        <div className="stat-card primary">
          <div className="stat-header">
            <div className="stat-icon">
              <Mic size={20} />
            </div>
            <div className="stat-main-value">{stats.total_transcriptions}</div>
          </div>
          <div className="stat-label">总转录次数</div>
          <button className="view-report-btn">查看报告</button>
          <div className="privacy-note">
            <span className="lock-icon">🔒</span>
            <span>您的数据保持私密</span>
          </div>
        </div>

        <div className="stat-grid">
          <div className="stat-card small">
            <div className="stat-header">
              <Clock size={18} className="stat-icon-sm" />
              <span className="stat-value">{stats.today_characters.toLocaleString()}</span>
            </div>
            <div className="stat-label">今日字符数</div>
          </div>

          <div className="stat-card small">
            <div className="stat-header">
              <BookOpen size={18} className="stat-icon-sm" />
              <span className="stat-value">{stats.total_characters.toLocaleString()}</span>
            </div>
            <div className="stat-label">累计字符数</div>
          </div>
        </div>
      </section>

      {/* 主要内容区 */}
      <section className="content-body">
        <div className="panel panel-main" style={{ flex: 1 }}>
          <Status status={status} transcript={transcript} hotkey={hotkey} onClear={() => setTranscript("")} />
        </div>
      </section>

    </>
  );

  // 渲染设置页面
  const renderSettings = () => (
    <SettingsPage onBack={() => setActiveNav("home")} />
  );

  // 渲染历史记录页面
  const renderHistory = () => (
    <HistoryPage onBack={() => setActiveNav("home")} />
  );

  return (
    <div className="app-container">
      {/* 左侧边栏 */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <div className="logo-icon">
              <Mic size={20} />
            </div>
            <span className="logo-text">Mouth High</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${activeNav === item.id ? "active" : ""}`}
              onClick={() => setActiveNav(item.id)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button className="icon-btn" title="用户">
            <span className="avatar">U</span>
          </button>
          <button className="icon-btn" title="设置" onClick={() => setActiveNav("settings")}>
            <SettingsIcon size={16} />
          </button>
          <button className="icon-btn" title="帮助">
            <span>?</span>
          </button>
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="main-content">
        {activeNav === "settings" ? renderSettings() :
         activeNav === "history" ? renderHistory() :
         activeNav === "dictionary" ? (
           <div className="placeholder-page">
             <h1>词典功能</h1>
             <p>即将推出...</p>
             <button onClick={() => setActiveNav("home")}>返回首页</button>
           </div>
         ) : renderHome()}
      </main>
    </div>
  );
}

export default App;
