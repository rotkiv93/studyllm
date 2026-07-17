import { useEffect, useRef, useState } from "react";
import {
  PROVIDER_MANIFEST,
  SELECTABLE_PROVIDER_TYPES,
  type ProviderType,
} from "../lib/providers";
import {
  fetchProviderModels,
  pickBestModel,
  providerModelsNeedApiKey,
  providerSupportsLiveModels,
  type ModelInfo,
} from "../lib/providerModels";
import { fetchModelCatalog, lookupToolSupport, type ModelCatalog } from "../lib/modelCatalog";
import type { ProviderRow } from "../lib/db";

export interface ProviderDraft {
  type: ProviderType;
  label: string;
  model: string;
  apiKey: string;
}

export interface ProviderEditDraft {
  label: string;
  model: string;
  /** Empty string means "keep the existing key". */
  apiKey: string;
}

interface Props {
  providers: ProviderRow[];
  onAdd: (draft: ProviderDraft) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onToggle: (id: string, enabled: boolean) => Promise<void>;
  onReorder: (id: string, direction: "up" | "down") => Promise<void>;
  onEdit: (id: string, draft: ProviderEditDraft) => Promise<void>;
  onOpenOnboarding: () => void;
  onClose: () => void;
}

/**
 * Model picker shared by the add form and the per-provider edit row. Loads the live
 * model list (falling back to the manifest's suggestions), enriches each model with
 * tool-calling support from the provider's own metadata and the models.dev catalog,
 * badges tool-capable models, and offers a "Tool-compatible only" filter. The model is
 * always a free-text `<input>` too, so any id can still be typed.
 */
function ModelField({
  type,
  apiKey,
  model,
  onChange,
  idPrefix,
  autoSelect = false,
}: {
  type: ProviderType;
  apiKey: string;
  model: string;
  onChange: (model: string) => void;
  idPrefix: string;
  /** When true, auto-pick a tool-capable model once the live list loads, until the user picks one. */
  autoSelect?: boolean;
}) {
  const [liveModels, setLiveModels] = useState<ModelInfo[] | null>(null);
  const [modelsStatus, setModelsStatus] = useState<"idle" | "loading" | "loaded" | "unavailable">(
    "idle",
  );
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
  const [toolOnly, setToolOnly] = useState(true);
  const modelsRequestId = useRef(0);
  // Once the user manually picks/types a model we stop auto-overriding their choice.
  const userTouched = useRef(false);

  // A change coming from the user (typing or clicking an option) locks out auto-selection.
  function handleUserChange(next: string) {
    userTouched.current = true;
    onChange(next);
  }

  // Switching providers resets the "touched" flag so the new provider auto-selects afresh.
  useEffect(() => {
    userTouched.current = false;
  }, [type]);

  // Auto-pick a sensible tool-capable model once the live list loads (add flow only).
  useEffect(() => {
    if (!autoSelect || userTouched.current) return;
    if (modelsStatus === "loaded" && liveModels) {
      onChange(pickBestModel(type, liveModels));
    }
  }, [autoSelect, liveModels, modelsStatus, type, onChange]);

  useEffect(() => {
    let active = true;
    fetchModelCatalog().then((c) => {
      if (active) setCatalog(c);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!providerSupportsLiveModels(type)) {
      setLiveModels(null);
      setModelsStatus("idle");
      return;
    }
    if (providerModelsNeedApiKey(type) && !apiKey.trim()) {
      setLiveModels(null);
      setModelsStatus("idle");
      return;
    }

    setModelsStatus("loading");
    const requestId = ++modelsRequestId.current;
    const delay = providerModelsNeedApiKey(type) ? 500 : 0;
    const timer = setTimeout(async () => {
      const models = await fetchProviderModels(type, apiKey);
      if (modelsRequestId.current !== requestId) return; // superseded by a newer request
      if (models && models.length > 0) {
        setLiveModels(models);
        setModelsStatus("loaded");
      } else {
        setLiveModels(null);
        setModelsStatus("unavailable");
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [type, apiKey]);

  const baseOptions: ModelInfo[] =
    liveModels ?? PROVIDER_MANIFEST[type].suggestedModels.map((id) => ({ id }));

  // Enrich anything still unknown with the catalog (covers manifest suggestions and
  // providers whose /models endpoint carries no capability metadata).
  const options: ModelInfo[] = baseOptions.map((m) =>
    m.supportsTools === undefined
      ? { ...m, supportsTools: lookupToolSupport(catalog, type, m.id) }
      : m,
  );

  const hasCapabilityInfo = options.some((m) => m.supportsTools !== undefined);
  const visible =
    toolOnly && hasCapabilityInfo
      ? options.filter((m) => m.supportsTools !== false || m.id === model)
      : options;

  return (
    <div className="model-field">
      <label>
        Model
        <input
          value={model}
          onChange={(e) => handleUserChange(e.currentTarget.value)}
          list={`models-${idPrefix}`}
          placeholder="Type or pick a model id…"
        />
        <datalist id={`models-${idPrefix}`}>
          {visible.map((m) => (
            <option key={m.id} value={m.id} />
          ))}
        </datalist>
      </label>

      {hasCapabilityInfo && (
        <label className="model-tool-filter">
          <input
            type="checkbox"
            checked={toolOnly}
            onChange={(e) => setToolOnly(e.currentTarget.checked)}
          />
          Tool-compatible only
        </label>
      )}

      {visible.length > 0 && (
        <ul className="model-option-list">
          {visible.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className={`model-option${m.id === model ? " model-option-selected" : ""}`}
                onClick={() => handleUserChange(m.id)}
              >
                <span className="model-option-id">{m.id}</span>
                {m.supportsTools === true && (
                  <span className="model-badge model-badge-tools">✓ tools</span>
                )}
                {m.supportsTools === false && (
                  <span className="model-badge model-badge-notools">no tools</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {providerSupportsLiveModels(type) && (
        <p className="settings-hint">
          {modelsStatus === "loading" && "Loading live model list…"}
          {modelsStatus === "loaded" &&
            `Loaded ${liveModels?.length ?? 0} live models from ${PROVIDER_MANIFEST[type].label}.`}
          {modelsStatus === "unavailable" &&
            (providerModelsNeedApiKey(type)
              ? "Couldn't load live models with this key — showing suggestions. You can still type any model id."
              : "Couldn't reach the live model list — showing suggestions. You can still type any model id.")}
          {modelsStatus === "idle" &&
            providerModelsNeedApiKey(type) &&
            "Enter an API key to load this provider's live model list."}
        </p>
      )}
    </div>
  );
}

function EditProviderRow({
  provider,
  onSave,
  onCancel,
}: {
  provider: ProviderRow;
  onSave: (draft: ProviderEditDraft) => Promise<void>;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(provider.label);
  const [model, setModel] = useState(provider.model);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setEditError(null);
    try {
      await onSave({ label: label.trim(), model: model.trim(), apiKey: apiKey.trim() });
    } catch (err) {
      setEditError(err instanceof Error ? err.message : String(err));
      setBusy(false);
      return;
    }
    setBusy(false);
  }

  return (
    <li className="provider-edit-row">
      <form onSubmit={handleSave}>
        {editError && <p className="error">{editError}</p>}
        <label>
          Label
          <input value={label} onChange={(e) => setLabel(e.currentTarget.value)} />
        </label>
        <ModelField
          type={provider.type}
          apiKey={apiKey}
          model={model}
          onChange={setModel}
          idPrefix={`edit-${provider.id}`}
        />
        <label>
          API key
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.currentTarget.value)}
            placeholder="Leave blank to keep current key"
          />
        </label>
        <div className="provider-edit-actions">
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !label.trim() || !model.trim()}>
            Save
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        </div>
      </form>
    </li>
  );
}

export function ProvidersPanel({
  providers,
  onAdd,
  onRemove,
  onToggle,
  onReorder,
  onEdit,
  onOpenOnboarding,
  onClose,
}: Props) {
  const [type, setType] = useState<ProviderType>("gemini");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(PROVIDER_MANIFEST["gemini"].defaultModel);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  function handleTypeChange(next: ProviderType) {
    setType(next);
    setModel(PROVIDER_MANIFEST[next].defaultModel);
  }

  function describeError(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKey.trim()) return;
    setBusy(true);
    setFormError(null);
    try {
      await onAdd({
        type,
        label: PROVIDER_MANIFEST[type].label,
        model: model.trim(),
        apiKey: apiKey.trim(),
      });
      setApiKey("");
    } catch (err) {
      setFormError(`Couldn't add provider: ${describeError(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(id: string) {
    setFormError(null);
    try {
      await onRemove(id);
    } catch (err) {
      setFormError(`Couldn't remove provider: ${describeError(err)}`);
    }
  }

  async function handleToggle(id: string, enabled: boolean) {
    setFormError(null);
    try {
      await onToggle(id, enabled);
    } catch (err) {
      setFormError(`Couldn't update provider: ${describeError(err)}`);
    }
  }

  async function handleReorder(id: string, direction: "up" | "down") {
    setFormError(null);
    try {
      await onReorder(id, direction);
    } catch (err) {
      setFormError(`Couldn't reorder providers: ${describeError(err)}`);
    }
  }

  async function handleEditSave(id: string, draft: ProviderEditDraft) {
    await onEdit(id, draft);
    setEditingId(null);
  }

  const installedTypes = new Set(providers.map((p) => p.type));

  return (
    <div className="settings-overlay">
      <div className="settings-panel settings-panel-wide">
        <div className="settings-header">
          <h2>Providers</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Close
          </button>
        </div>

        <p className="settings-hint">
          Add your own free-tier API keys. When one runs out of free requests, StudyLLM
          automatically switches to the next one in the list.{" "}
          <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenOnboarding}>
            Run setup guide
          </button>
        </p>

        {formError && <p className="error">{formError}</p>}

        <h3 className="mcp-section-title">Your providers</h3>
        <ul className="provider-list">
          {providers.map((p, i) =>
            editingId === p.id ? (
              <EditProviderRow
                key={p.id}
                provider={p}
                onSave={(draft) => handleEditSave(p.id, draft)}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <li key={p.id} className={p.enabled ? "" : "provider-disabled"}>
                <div className="provider-row-main">
                  <span className="provider-row-name">
                    <strong>{p.label}</strong>
                    {PROVIDER_MANIFEST[p.type]?.recommended && (
                      <span className="provider-badge-recommended">Recommended</span>
                    )}
                  </span>
                  <span className="provider-model">{p.model}</span>
                  {PROVIDER_MANIFEST[p.type]?.freeTierNote && (
                    <span className="provider-free-note">{PROVIDER_MANIFEST[p.type].freeTierNote}</span>
                  )}
                </div>
                <div className="provider-row-actions">
                  <button
                    type="button"
                    className="btn btn-icon btn-secondary btn-sm"
                    onClick={() => handleReorder(p.id, "up")}
                    disabled={i === 0}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn-icon btn-secondary btn-sm"
                    onClick={() => handleReorder(p.id, "down")}
                    disabled={i === providers.length - 1}
                  >
                    ↓
                  </button>
                  <label>
                    <input
                      type="checkbox"
                      checked={!!p.enabled}
                      onChange={(e) => handleToggle(p.id, e.currentTarget.checked)}
                    />
                    enabled
                  </label>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setEditingId(p.id)}
                  >
                    Edit
                  </button>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => handleRemove(p.id)}>
                    Remove
                  </button>
                </div>
              </li>
            ),
          )}
          {providers.length === 0 && <li className="empty-state">No providers added yet.</li>}
        </ul>

        <form className="add-provider-form" onSubmit={handleAdd}>
          <h3 className="mcp-section-title">Add a provider</h3>
          <ul className="provider-type-grid">
            {SELECTABLE_PROVIDER_TYPES.map((t) => (
              <li key={t}>
                <button
                  type="button"
                  className={`provider-type-card${type === t ? " provider-type-card-selected" : ""}`}
                  onClick={() => handleTypeChange(t)}
                  aria-pressed={type === t}
                >
                  <span className="provider-type-card-name">
                    {PROVIDER_MANIFEST[t].label}
                    {PROVIDER_MANIFEST[t].recommended && (
                      <span className="provider-badge-recommended">Recommended</span>
                    )}
                  </span>
                  {PROVIDER_MANIFEST[t].freeTierNote && (
                    <span className="provider-type-card-note">{PROVIDER_MANIFEST[t].freeTierNote}</span>
                  )}
                  {installedTypes.has(t) && (
                    <span className="provider-type-card-configured">✓ Configured</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          <ModelField
            type={type}
            apiKey={apiKey}
            model={model}
            onChange={setModel}
            idPrefix={`add-${type}`}
            autoSelect
          />
          <label>
            API key
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.currentTarget.value)}
              placeholder="Paste key…"
            />
          </label>
          <a href={PROVIDER_MANIFEST[type].apiKeyUrl} target="_blank" rel="noreferrer">
            Get a free {PROVIDER_MANIFEST[type].label} API key
          </a>
          <button type="submit" className="btn btn-primary" disabled={busy || !apiKey.trim()}>
            Add provider
          </button>
        </form>
      </div>
    </div>
  );
}
