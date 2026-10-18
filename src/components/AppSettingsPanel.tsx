import { useEffect, useState } from "react";
import { clearCrashLog, readCrashLog, revealCrashLog } from "../lib/crashlog";
import { useI18n, LANGUAGE_LABELS, type Lang } from "../lib/i18n";
import {
  checkForUpdate,
  getVersion,
  installUpdate,
  progressPercent,
  type DownloadProgress,
  type Update,
} from "../lib/updater";
import { useEscapeClose } from "../lib/useEscapeClose";

type UpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "upToDate" }
  | { kind: "available"; update: Update }
  | { kind: "installing"; progress: DownloadProgress }
  | { kind: "error"; message: string };

interface Props {
  onClose: () => void;
}

export function AppSettingsPanel({ onClose }: Props) {
  useEscapeClose(onClose);
  const { t, lang, setLang } = useI18n();
  const [crashLogText, setCrashLogText] = useState<string | null>(null);
  const [crashLogBusy, setCrashLogBusy] = useState(false);

  const [version, setVersion] = useState<string | null>(null);
  const [updateState, setUpdateState] = useState<UpdateState>({ kind: "idle" });

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);

  async function handleCheckUpdate() {
    setUpdateState({ kind: "checking" });
    try {
      const update = await checkForUpdate();
      setUpdateState(update ? { kind: "available", update } : { kind: "upToDate" });
    } catch (e) {
      setUpdateState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleInstallUpdate(update: Update) {
    setUpdateState({ kind: "installing", progress: { downloaded: 0, total: null } });
    try {
      await installUpdate(update, (progress) => setUpdateState({ kind: "installing", progress }));
    } catch (e) {
      setUpdateState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

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
          <h3>{t("updates.title")}</h3>
          <p className="settings-hint">{t("updates.hint")}</p>
          {version && <p className="settings-hint">{t("updates.currentVersion", { version })}</p>}
          {import.meta.env.DEV ? (
            <p className="settings-hint">{t("updates.devBuild")}</p>
          ) : (
            <>
              <div className="provider-edit-actions">
                {updateState.kind === "available" ? (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => handleInstallUpdate(updateState.update)}
                  >
                    {t("updates.install")}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleCheckUpdate}
                    disabled={updateState.kind === "checking" || updateState.kind === "installing"}
                  >
                    {updateState.kind === "checking" ? t("updates.checking") : t("updates.check")}
                  </button>
                )}
              </div>
              {updateState.kind === "upToDate" && <p className="settings-hint">{t("updates.upToDate")}</p>}
              {updateState.kind === "available" && (
                <>
                  <p className="settings-hint">{t("updates.available", { version: updateState.update.version })}</p>
                  {updateState.update.body && <pre className="tool-block-pre">{updateState.update.body}</pre>}
                </>
              )}
              {updateState.kind === "installing" && (
                <p className="settings-hint" role="status">
                  {(() => {
                    const percent = progressPercent(updateState.progress);
                    return percent === null
                      ? t("updates.installingUnknown")
                      : t("updates.installing", { percent });
                  })()}
                </p>
              )}
              {updateState.kind === "error" && (
                <p className="settings-hint" role="alert">
                  {t("updates.error", { error: updateState.message })}
                </p>
              )}
            </>
          )}
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
