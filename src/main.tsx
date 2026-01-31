import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import RecordingBarWindow from "./components/RecordingBarWindow";
import "./styles.css";
import "./recording-bar.css";

async function init() {
  const window = getCurrentWindow();
  const label = window.label;

  const root = ReactDOM.createRoot(
    document.getElementById("root") as HTMLElement
  );

  if (label === "recording-bar") {
    // 录音浮窗
    root.render(
      <React.StrictMode>
        <RecordingBarWindow />
      </React.StrictMode>
    );
  } else {
    // 主窗口
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  }
}

init();
