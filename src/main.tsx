import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { appendCrashLog } from "./lib/crashlog";

window.addEventListener("error", (e) => {
  appendCrashLog(`frontend error: ${e.message} (${e.filename}:${e.lineno}:${e.colno})`).catch(() => {});
});
function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  let text = error.stack || error.message;
  let cause: unknown = (error as { cause?: unknown }).cause;
  while (cause) {
    text += `\ncaused by: ${cause instanceof Error ? cause.stack || cause.message : String(cause)}`;
    cause = cause instanceof Error ? (cause as { cause?: unknown }).cause : undefined;
  }
  return text;
}

window.addEventListener("unhandledrejection", (e) => {
  appendCrashLog(`unhandled rejection: ${describeError(e.reason)}`).catch(() => {});
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
