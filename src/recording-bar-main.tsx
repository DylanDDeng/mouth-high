import React from "react";
import ReactDOM from "react-dom/client";
import RecordingBarWindow from "./components/RecordingBarWindow";
import "./recording-bar.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RecordingBarWindow />
  </React.StrictMode>
);
