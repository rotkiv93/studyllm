import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { I18nProvider } from "./lib/i18n";
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
  // Pressing Stop aborts the stream on purpose; the SDK rejects a promise nobody awaits. Not a crash.
  if (e.reason instanceof Error && e.reason.name === "AbortError") return;
  // A provider that errored mid-stream (the router then fails over) leaves the SDK's unread result
  // promises rejecting with this; the router already reports the real error.
  if (e.reason instanceof Error && e.reason.name === "AI_NoOutputGeneratedError") return;
  appendCrashLog(`unhandled rejection: ${describeError(e.reason)}`).catch(() => {});
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>,
);
