import { useRef, useState } from "react";
import { IconBook, IconTrash, IconLoader, IconPaperclip } from "./icons";
import { EMBEDDING_CAPABLE, type EmbeddingConfig } from "../lib/embeddings";
import { SUPPORTED_ATTACHMENT_HINT } from "../lib/attachments";
import type { ProviderRow, RagDocumentRow } from "../lib/db";
import { useT } from "../lib/i18n";

/**
 * The document Library — the RAG surface. Two tabs following the established panel convention
 * (`settings-overlay` > `settings-panel`, `.settings-header`, `.settings-hint`, `.mcp-tabs`):
 *   • Documents — add files (parsed + chunked + embedded by the caller), see chunk counts, remove.
 *   • Settings  — choose which configured provider + model to embed with.
 *
 * Presentational: ingestion, deletion, and config persistence are handled by the caller (App),
 * which owns the providers list, the keychain, and the DB.
 */

type Tab = "documents" | "settings";

interface LibraryPanelProps {
  documents: RagDocumentRow[];
  providers: ProviderRow[];
  embeddingConfig: EmbeddingConfig | null;
  onSaveEmbeddingConfig: (config: EmbeddingConfig) => void;
  onAddFiles: (files: File[]) => Promise<void>;
  onDeleteDocument: (id: string) => Promise<void>;
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
  busy,
  error,
  onClose,
}: LibraryPanelProps) {
  const t = useT();
  const [tab, setTab] = useState<Tab>("documents");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Configured providers whose endpoint can serve embeddings.
  const embedProviders = providers.filter((p) => p.enabled && EMBEDDING_CAPABLE[p.type]);
  const configured = !!embeddingConfig && embedProviders.some((p) => p.id === embeddingConfig.providerId);

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
              <ul className="library-doc-list">
                {documents.map((d) => (
                  <li key={d.id} className="library-doc">
                    <div className="library-doc-info">
                      <span className="library-doc-name">{d.name}</span>
                      <span className="library-doc-meta">
                        {t(d.chunk_count === 1 ? "library.passageOne" : "library.passageOther", {
                          count: d.chunk_count,
                        })}{" "}
                        · {t("library.chars", { count: d.char_count.toLocaleString() })} ·{" "}
                        {d.embed_model}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-icon btn-ghost"
                      title={t("library.removeDocument")}
                      onClick={() => void onDeleteDocument(d.id)}
                      disabled={busy}
                    >
                      <IconTrash size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
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
