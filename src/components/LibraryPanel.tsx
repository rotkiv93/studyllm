import { useRef, useState } from "react";
import { IconBook, IconTrash, IconLoader, IconPaperclip } from "./icons";
import { EMBEDDING_CAPABLE, type EmbeddingConfig } from "../lib/embeddings";
import { SUPPORTED_ATTACHMENT_HINT } from "../lib/attachments";
import type { ProviderRow, RagDocumentRow } from "../lib/db";

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
            <IconBook size={18} /> Your documents <span className="settings-header-term">(library)</span>
          </h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Close
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
            Documents
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "settings"}
            className={`mcp-tab-btn${tab === "settings" ? " mcp-tab-btn-active" : ""}`}
            onClick={() => setTab("settings")}
          >
            Embedding model
          </button>
        </div>

        {tab === "documents" ? (
          <>
            <p className="settings-hint">
              Add your notes, PDFs, or papers. Each document is split into passages and turned into
              searchable “meaning” data so the assistant can pull the most relevant parts when you
              turn on “Chat with your documents” in the composer. Answers cite the passages they used.
            </p>

            {!configured && (
              <p className="notice">
                Pick an embedding model in the “Embedding model” tab first — that’s how documents get
                indexed.
              </p>
            )}
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
              title={configured ? `Add a file (${SUPPORTED_ATTACHMENT_HINT})` : "Choose an embedding model first"}
            >
              {busy ? <IconLoader size={14} /> : <IconPaperclip size={14} />}
              {busy ? "Indexing…" : "Add documents"}
            </button>

            {documents.length === 0 ? (
              <p className="settings-hint library-empty">No documents yet.</p>
            ) : (
              <ul className="library-doc-list">
                {documents.map((d) => (
                  <li key={d.id} className="library-doc">
                    <div className="library-doc-info">
                      <span className="library-doc-name">{d.name}</span>
                      <span className="library-doc-meta">
                        {d.chunk_count} passage{d.chunk_count === 1 ? "" : "s"} ·{" "}
                        {d.char_count.toLocaleString()} chars · {d.embed_model}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-icon btn-ghost"
                      title="Remove document"
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
  const [providerId, setProviderId] = useState(
    embeddingConfig?.providerId ?? embedProviders[0]?.id ?? "",
  );
  const selectedProvider = embedProviders.find((p) => p.id === providerId);
  const defaultModel = selectedProvider ? EMBEDDING_CAPABLE[selectedProvider.type] ?? "" : "";
  const [model, setModel] = useState(embeddingConfig?.model ?? defaultModel);

  if (embedProviders.length === 0) {
    return (
      <p className="settings-hint">
        No embedding-capable provider is set up. Add a <strong>Google Gemini</strong> or{" "}
        <strong>Mistral</strong> provider in Providers — both offer free embedding models — then come
        back here to select it.
      </p>
    );
  }

  return (
    <div className="library-settings">
      <p className="settings-hint">
        Embeddings turn your documents into searchable vectors. Choose a provider you’ve set up and
        the embedding model to use. This runs on the provider’s free tier, same as chat.
      </p>

      <label className="library-field">
        <span>Provider</span>
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
        <span>Embedding model</span>
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
        Save
      </button>
      {embeddingConfig && (
        <p className="settings-hint library-current">
          Current: {embedProviders.find((p) => p.id === embeddingConfig.providerId)?.label ?? "—"} ·{" "}
          {embeddingConfig.model}
        </p>
      )}
    </div>
  );
}
