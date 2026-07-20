import { useState } from "react";
import { clearCrashLog, readCrashLog, revealCrashLog } from "../lib/crashlog";
import { useI18n, LANGUAGE_LABELS, type Lang } from "../lib/i18n";

interface Props {
  onClose: () => void;
}

export function AppSettingsPanel({ onClose }: Props) {
  const { t, lang, setLang } = useI18n();
  const [crashLogText, setCrashLogText] = useState<string | null>(null);
  const [crashLogBusy, setCrashLogBusy] = useState(false);

  async function handleShowCrashLog() {
    setCrashLogBusy(true);
    try {
      const text = await readCrashLog();
      setCrashLogText(text || t("diagnostics.nothingLogged"));
    } finally {
      setCrashLogBusy(false);
    }
  }

  async function handleClearCrashLog() {
    await clearCrashLog();
    setCrashLogText(t("diagnostics.nothingLogged"));
  }

  return (
    <div className="settings-overlay">
      <div className="settings-panel">
        <div className="settings-header">
          <h2>{t("diagnostics.title")}</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>

        <div className="add-provider-form">
          <h3>{t("language.title")}</h3>
          <p className="settings-hint">{t("language.hint")}</p>
          <label className="field-label" htmlFor="app-language-select">
            {t("language.label")}
          </label>
          <select
            id="app-language-select"
            value={lang}
            onChange={(e) => setLang(e.target.value as Lang)}
          >
            {(Object.keys(LANGUAGE_LABELS) as Lang[]).map((code) => (
              <option key={code} value={code}>
                {LANGUAGE_LABELS[code]}
              </option>
            ))}
          </select>
        </div>

        <div className="add-provider-form">
          <h3>{t("diagnostics.crashLog")}</h3>
          <p className="settings-hint">{t("diagnostics.crashLogHint")}</p>
          <div className="provider-edit-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleShowCrashLog} disabled={crashLogBusy}>
              {crashLogBusy ? t("common.loading") : t("diagnostics.showLog")}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => revealCrashLog().catch(() => {})}>
              {t("diagnostics.revealInFolder")}
            </button>
            <button type="button" className="btn btn-danger btn-sm" onClick={handleClearCrashLog}>
              {t("diagnostics.clear")}
            </button>
          </div>
          {crashLogText !== null && <pre className="tool-block-pre">{crashLogText}</pre>}
        </div>
      </div>
    </div>
  );
}
