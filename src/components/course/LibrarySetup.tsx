import { useRef } from "react";
import type { RagDocumentRow } from "../../lib/db";
import { useT } from "../../lib/i18n";

/**
 * Add a document to the Library from inside the lesson: pick a PDF / text file of your own, or use the
 * built-in sample (a made-up club handbook, so there is always something to ask about whose answers a
 * model could not know from memory).
 */
export function LibrarySetup({
  documents,
  busy,
  error,
  onAddFiles,
}: {
  documents: RagDocumentRow[];
  busy: boolean;
  error: string | null;
  onAddFiles: (files: File[]) => Promise<void>;
}) {
  const t = useT();
  const input = useRef<HTMLInputElement | null>(null);

  async function addSample() {
    const file = new File([t("course.sample.doc.body")], t("course.sample.doc.name"), { type: "text/plain" });
    await onAddFiles([file]);
  }

  return (
    <div className="setup">
      <p className="settings-hint">{t("course.setup.lib.needKey")}</p>
      <div className="provider-edit-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => void addSample()} disabled={busy}>
          {busy ? t("course.setup.lib.indexing") : t("course.setup.lib.sample")}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => input.current?.click()} disabled={busy}>
          {t("course.setup.lib.own")}
        </button>
        <input
          ref={input}
          type="file"
          accept=".pdf,.txt,.md,.docx"
          hidden
          onChange={(e) => {
            const files = Array.from(e.currentTarget.files ?? []);
            e.currentTarget.value = "";
            if (files.length > 0) void onAddFiles(files);
          }}
        />
        <span className={`setup-pill${documents.length > 0 ? " setup-pill-ok" : ""}`}>
          {documents.length > 0 ? t("course.setup.lib.count", { n: documents.length }) : t("course.setup.lib.none")}
        </span>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
