import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useT } from "../../lib/i18n";

/**
 * Connect the Filesystem tool server to one folder without leaving the lesson. The folder picker is
 * the same native dialog the Tools panel uses; the server only ever sees the folder chosen here.
 */
export function FilesystemSetup({
  running,
  onAddFilesystem,
}: {
  /** The Filesystem server is up right now. */
  running: boolean;
  onAddFilesystem: (scopedPath: string) => Promise<void>;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [folder, setFolder] = useState<string | null>(null);

  async function pick() {
    setError(null);
    try {
      const picked = await open({ directory: true, multiple: false });
      if (!picked) return;
      setBusy(true);
      await onAddFilesystem(picked);
      setFolder(picked);
    } catch (err) {
      setError(t("onboarding.mcpFailed", { error: err instanceof Error ? err.message : String(err) }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="setup">
      <ol className="setup-steps">
        <li>{t("course.setup.fs.make")}</li>
        <li>{t("course.setup.fs.pick")}</li>
        <li>{t("course.setup.fs.wait")}</li>
      </ol>
      <div className="provider-edit-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => void pick()} disabled={busy}>
          {busy ? t("onboarding.adding") : t("onboarding.chooseFolder")}
        </button>
        <span className={`setup-pill${running ? " setup-pill-ok" : ""}`}>
          {running ? t("course.setup.fs.running") : folder ? t("course.setup.fs.starting") : t("course.setup.fs.notYet")}
        </span>
      </div>
      {folder && <p className="settings-hint">{t("course.setup.fs.scoped", { folder })}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
