import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { appendCrashLog } from "./lib/crashlog";

window.addEventListener("error", (e) => {
  appendCrashLog(`frontend error: ${e.message} (${e.filename}:${e.lineno}:${e.colno})`).catch(() => {});
});
window.addEventListener("unhandledrejection", (e) => {
  const reason = e.reason instanceof Error ? e.reason.stack || e.reason.message : String(e.reason);
  appendCrashLog(`unhandled rejection: ${reason}`).catch(() => {});
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
