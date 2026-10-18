import { useEffect, useMemo, useRef, useState } from "react";
import { IconBook, IconTrash, IconLoader, IconPaperclip } from "./icons";
import { QuizPanel } from "./QuizPanel";
import { Fingerprint } from "./viz/Fingerprint";
import { LibraryMap } from "./viz/LibraryMap";
import { formatPages, loadLibraryChunks, type LibraryChunk } from "../lib/rag";
import { snippet } from "../lib/ragInsights";
import { EMBEDDING_CAPABLE, type EmbeddingConfig } from "../lib/embeddings";
import { SUPPORTED_ATTACHMENT_HINT } from "../lib/attachments";
import type { ProviderRow, RagDocumentRow } from "../lib/db";
import { useT } from "../lib/i18n";
import { useEscapeClose } from "../lib/useEscapeClose";

/**
 * The document Library — the RAG surface. Three tabs following the established panel convention
 * (`settings-overlay` > `settings-panel`, `.settings-header`, `.settings-hint`, `.mcp-tabs`):
 *   • Documents — add files (parsed + chunked + embedded by the caller), open one to read its
 *     passages and see each passage's embedding "fingerprint", remove.
 *   • Quiz      — practice questions generated from a document, graded with feedback (QuizPanel).
 *   • Map       — every passage of every document plotted by meaning (PCA), coloured by document.
 *   • Settings  — choose which configured provider + model to embed with.
 *
 * Presentational: ingestion, deletion, and config persistence are handled by the caller (App),
 * which owns the providers list, the keychain, and the DB.
 */

type Tab = "documents" | "quiz" | "map" | "settings";

interface LibraryPanelProps {
  documents: RagDocumentRow[];
  providers: ProviderRow[];
  embeddingConfig: EmbeddingConfig | null;
  onSaveEmbeddingConfig: (config: EmbeddingConfig) => void;
  onAddFiles: (files: File[]) => Promise<void>;
  onDeleteDocument: (id: string) => Promise<void>;
  /** One non-streaming model call (for the practice quiz). */
  onAsk: (system: string, user: string, signal: AbortSignal) => Promise<string>;
  /** True while a file is being ingested (parse → chunk → embed). */
  busy: boolean;
  error: string | null;
  onClose: () => void;
}

export function LibraryPanel({
  documents,
  providers,
  embeddingConfig,
  onSaveEmbeddingConfig,
  onAddFiles,
  onDeleteDocument,
  onAsk,
  busy,
  error,
  onClose,
}: LibraryPanelProps) {
  const t = useT();
  useEscapeClose(onClose);
  const [tab, setTab] = useState<Tab>("documents");
  const [quizDocId, setQuizDocId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Configured providers whose endpoint can serve embeddings.
  const embedProviders = providers.filter((p) => p.enabled && EMBEDDING_CAPABLE[p.type]);
  const configured = !!embeddingConfig && embedProviders.some((p) => p.id === embeddingConfig.providerId);

  // Passages are only read from SQLite when there is something to show them in.
  const [chunks, setChunks] = useState<LibraryChunk[] | null>(null);
  useEffect(() => {
    if (tab === "settings") return;
    let cancelled = false;
    void loadLibraryChunks()
      .then((rows) => !cancelled && setChunks(rows))
      .catch(() => !cancelled && setChunks([]));
    return () => {
      cancelled = true;
    };
  }, [tab, documents]);

  const dims = useMemo(() => chunks?.find((c) => c.vector.length > 0)?.vector.length ?? 0, [chunks]);
  const totalPassages = documents.reduce((n, d) => n + d.chunk_count, 0);
  const models = [...new Set(documents.map((d) => d.embed_model))];
  const documentOrder = documents.map((d) => d.id);

  return (
    <div className="settings-overlay">
      <div className="settings-panel settings-panel-wide settings-panel-tall">
        <div className="settings-header">
          <h2>
            <IconBook size={18} /> {t("library.title")}{" "}
            <span className="settings-header-term">{t("library.titleTerm")}</span>
          </h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>

        <div className="mcp-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "documents"}
            className={`mcp-tab-btn${tab === "documents" ? " mcp-tab-btn-active" : ""}`}
            onClick={() => setTab("documents")}
          >
            {t("library.tab.documents")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "quiz"}
            className={`mcp-tab-btn${tab === "quiz" ? " mcp-tab-btn-active" : ""}`}
            onClick={() => setTab("quiz")}
          >
            {t("library.tab.quiz")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "map"}
            className={`mcp-tab-btn${tab === "map" ? " mcp-tab-btn-active" : ""}`}
            onClick={() => setTab("map")}
          >
            {t("library.tab.map")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "settings"}
            className={`mcp-tab-btn${tab === "settings" ? " mcp-tab-btn-active" : ""}`}
            onClick={() => setTab("settings")}
          >
            {t("library.tab.embedding")}
          </button>
        </div>

        {tab === "documents" ? (
          <>
            <p className="settings-hint">{t("library.documentsHint")}</p>

            {!configured && <p className="notice">{t("library.pickEmbeddingFirst")}</p>}
            {error && <p className="error">{error}</p>}

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.txt,.md,.markdown,.csv,.tsv,.json,.log,.rtf"
              className="composer-file-input"
              onChange={(e) => {
                const files = Array.from(e.currentTarget.files ?? []);
                e.currentTarget.value = "";
                if (files.length > 0) void onAddFiles(files);
              }}
            />
            <button
              type="button"
              className="btn btn-primary btn-sm library-add-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy || !configured}
              title={
                configured
                  ? t("library.addFileTitle", { formats: SUPPORTED_ATTACHMENT_HINT })
                  : t("library.chooseEmbeddingFirst")
              }
            >
              {busy ? <IconLoader size={14} /> : <IconPaperclip size={14} />}
              {busy ? t("library.indexing") : t("library.addDocuments")}
            </button>

            {documents.length === 0 ? (
              <p className="settings-hint library-empty">{t("library.empty")}</p>
            ) : (
              <>
                <div className="library-stats">
                  <LibraryStat value={documents.length} label={t("library.stat.documents")} />
                  <LibraryStat value={totalPassages} label={t("library.stat.passages")} />
                  <LibraryStat value={dims || "—"} label={t("library.stat.dims")} />
                </div>
                <p className="settings-hint">{t("library.statHint")}</p>
                {models.length > 1 && (
                  <p className="notice">{t("library.modelMismatch", { models: models.join(", ") })}</p>
                )}
                <ul className="library-doc-list">
                  {documents.map((d) => (
                    <LibraryDocument
                      key={d.id}
                      doc={d}
                      chunks={chunks?.filter((c) => c.documentId === d.id) ?? null}
                      busy={busy}
                      onQuiz={() => {
                        setQuizDocId(d.id);
                        setTab("quiz");
                      }}
                      onDelete={() => void onDeleteDocument(d.id)}
                    />
                  ))}
                </ul>
              </>
            )}
          </>
        ) : tab === "quiz" ? (
          <QuizPanel
            documents={documents}
            providers={providers}
            chunks={chunks}
            initialDocumentId={quizDocId}
            onAsk={onAsk}
          />
        ) : tab === "map" ? (
          documents.length === 0 ? (
            <p className="settings-hint library-empty">{t("library.mapEmpty")}</p>
          ) : chunks === null ? (
            <p className="settings-hint">{t("library.passagesLoading")}</p>
          ) : (
            <LibraryMap chunks={chunks} documentOrder={documentOrder} />
          )
        ) : (
          <EmbeddingSettings
            embedProviders={embedProviders}
            embeddingConfig={embeddingConfig}
            onSave={onSaveEmbeddingConfig}
          />
        )}
      </div>
    </div>
  );
}

function LibraryStat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="library-stat">
      <span className="library-stat-value">{typeof value === "number" ? value.toLocaleString() : value}</span>
      <span className="library-stat-label">{label}</span>
    </div>
  );
}

/** One document: its numbers, and — opened — every passage with its embedding fingerprint. */
function LibraryDocument({
  doc,
  chunks,
  busy,
  onQuiz,
  onDelete,
}: {
  doc: RagDocumentRow;
  chunks: LibraryChunk[] | null;
  busy: boolean;
  onQuiz: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const avg = doc.chunk_count > 0 ? Math.round(doc.char_count / doc.chunk_count) : 0;
  const dims = chunks?.find((c) => c.vector.length > 0)?.vector.length ?? 0;
  const needsReindex =
    /\.pdf$/i.test(doc.name) && !!chunks && chunks.length > 0 && chunks.every((c) => c.pageStart == null);

  return (
    <li className={`library-doc${open ? " library-doc-open" : ""}`}>
      <div className="library-doc-row">
        <button
          type="button"
          className="library-doc-toggle"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="library-doc-chevron" aria-hidden="true">
            {open ? "▾" : "▸"}
          </span>
          <span className="library-doc-info">
            <span className="library-doc-name">{doc.name}</span>
            <span className="library-doc-meta">
              {t(doc.chunk_count === 1 ? "library.passageOne" : "library.passageOther", { count: doc.chunk_count })} ·{" "}
              {t("library.chars", { count: doc.char_count.toLocaleString() })} · {doc.embed_model}
            </span>
          </span>
          <span className="library-doc-action">{open ? t("library.hidePassages") : t("library.showPassages")}</span>
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onQuiz} title={t("quiz.fromDocument")}>
          {t("library.tab.quiz")}
        </button>
        <button
          type="button"
          className="btn btn-icon btn-ghost"
          title={t("library.removeDocument")}
          onClick={onDelete}
          disabled={busy}
        >
          <IconTrash size={14} />
        </button>
      </div>

      {open && (
        <div className="library-doc-body">
          {chunks === null ? (
            <p className="settings-hint">{t("library.passagesLoading")}</p>
          ) : (
            <>
              <p className="settings-hint">
                {t("library.docDetail", { avg, dims: dims || "—" })} {t("library.fingerprintHint")}
              </p>
              {needsReindex && <p className="settings-hint">{t("library.reindexForPages")}</p>}
              <ol className="library-chunk-list">
                {chunks.map((c) => {
                  const isOpen = expanded === c.id;
                  return (
                    <li key={c.id} className="library-chunk">
                      <button
                        type="button"
                        className="library-chunk-head"
                        aria-expanded={isOpen}
                        onClick={() => setExpanded(isOpen ? null : c.id)}
                      >
                        <span className="library-chunk-tag">
                          #{c.seq}
                          {formatPages(c.pageStart, c.pageEnd) ? ` · ${formatPages(c.pageStart, c.pageEnd)}` : ""}
                        </span>
                        <Fingerprint vector={c.vector} label={t("library.fingerprintLabel", { dims: c.vector.length })} />
                        {!isOpen && <span className="library-chunk-snippet">{snippet(c.text)}</span>}
                      </button>
                      {isOpen && <div className="library-chunk-text">{c.text}</div>}
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </div>
      )}
    </li>
  );
}

function EmbeddingSettings({
  embedProviders,
  embeddingConfig,
  onSave,
}: {
  embedProviders: ProviderRow[];
  embeddingConfig: EmbeddingConfig | null;
  onSave: (config: EmbeddingConfig) => void;
}) {
  const t = useT();
  const [providerId, setProviderId] = useState(
    embeddingConfig?.providerId ?? embedProviders[0]?.id ?? "",
  );
  const selectedProvider = embedProviders.find((p) => p.id === providerId);
  const defaultModel = selectedProvider ? EMBEDDING_CAPABLE[selectedProvider.type] ?? "" : "";
  const [model, setModel] = useState(embeddingConfig?.model ?? defaultModel);

  if (embedProviders.length === 0) {
    return (
      <p className="settings-hint">{t("library.noEmbeddingProvider")}</p>
    );
  }

  return (
    <div className="library-settings">
      <p className="settings-hint">{t("library.embeddingHint")}</p>

      <label className="library-field">
        <span>{t("library.provider")}</span>
        <select
          value={providerId}
          onChange={(e) => {
            const id = e.currentTarget.value;
            setProviderId(id);
            const p = embedProviders.find((x) => x.id === id);
            if (p) setModel(EMBEDDING_CAPABLE[p.type] ?? "");
          }}
        >
          {embedProviders.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      <label className="library-field">
        <span>{t("library.embeddingModel")}</span>
        <input
          type="text"
          value={model}
          onChange={(e) => setModel(e.currentTarget.value)}
          placeholder={defaultModel}
        />
      </label>

      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={!providerId || !model.trim()}
        onClick={() => onSave({ providerId, model: model.trim() })}
      >
        {t("common.save")}
      </button>
      {embeddingConfig && (
        <p className="settings-hint library-current">
          {t("library.current", {
            provider: embedProviders.find((p) => p.id === embeddingConfig.providerId)?.label ?? "—",
            model: embeddingConfig.model,
          })}
        </p>
      )}
    </div>
  );
}
