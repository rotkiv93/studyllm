import { useState } from "react";
import { clearCrashLog, readCrashLog, revealCrashLog } from "../lib/crashlog";

interface Props {
  onClose: () => void;
}

export function AppSettingsPanel({ onClose }: Props) {
  const [crashLogText, setCrashLogText] = useState<string | null>(null);
  const [crashLogBusy, setCrashLogBusy] = useState(false);

  async function handleShowCrashLog() {
    setCrashLogBusy(true);
    try {
      const text = await readCrashLog();
      setCrashLogText(text || "Nothing logged yet.");
    } finally {
      setCrashLogBusy(false);
    }
  }

  async function handleClearCrashLog() {
    await clearCrashLog();
    setCrashLogText("Nothing logged yet.");
  }

  return (
    <div className="settings-overlay">
      <div className="settings-panel">
        <div className="settings-header">
          <h2>Diagnostics</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="add-provider-form">
          <h3>Crash log</h3>
          <p className="settings-hint">
            A local-only log of MCP server errors and app crashes — nothing here ever leaves this
            computer. Useful if something breaks and you want to see what happened.
          </p>
          <div className="provider-edit-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleShowCrashLog} disabled={crashLogBusy}>
              {crashLogBusy ? "Loading…" : "Show log"}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => revealCrashLog().catch(() => {})}>
              Reveal in folder
            </button>
            <button type="button" className="btn btn-danger btn-sm" onClick={handleClearCrashLog}>
              Clear
            </button>
          </div>
          {crashLogText !== null && <pre className="tool-block-pre">{crashLogText}</pre>}
        </div>
      </div>
    </div>
  );
}
