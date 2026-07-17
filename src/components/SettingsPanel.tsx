import { useEffect, useRef, useState } from "react";
import { PROVIDER_MANIFEST, PROVIDER_TYPES, type ProviderType } from "../lib/providers";
import {
  fetchProviderModels,
  providerModelsNeedApiKey,
  providerSupportsLiveModels,
} from "../lib/providerModels";
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
  onClose: () => void;
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
  const modelOptions = PROVIDER_MANIFEST[provider.type].suggestedModels;

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
        <label>
          Model
          <input
            value={model}
            onChange={(e) => setModel(e.currentTarget.value)}
            list={`edit-models-${provider.id}`}
          />
          <datalist id={`edit-models-${provider.id}`}>
            {modelOptions.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>
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

export function SettingsPanel({ providers, onAdd, onRemove, onToggle, onReorder, onEdit, onClose }: Props) {
  const [type, setType] = useState<ProviderType>("groq");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(PROVIDER_MANIFEST["groq"].defaultModel);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [liveModels, setLiveModels] = useState<string[] | null>(null);
  const [modelsStatus, setModelsStatus] = useState<"idle" | "loading" | "loaded" | "unavailable">(
    "idle",
  );

  function handleTypeChange(next: ProviderType) {
    setType(next);
    setModel(PROVIDER_MANIFEST[next].defaultModel);
  }

  const modelsRequestId = useRef(0);

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

  const modelOptions = liveModels ?? PROVIDER_MANIFEST[type].suggestedModels;

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

  return (
    <div className="settings-overlay">
      <div className="settings-panel">
        <div className="settings-header">
          <h2>Providers</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Close
          </button>
        </div>

        <p className="settings-hint">
          Add your own free-tier API keys. When one runs out of free requests, StudyLLM
          automatically switches to the next one in the list.
        </p>

        {formError && <p className="error">{formError}</p>}

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
                  <strong>{p.label}</strong>
                  <span className="provider-model">{p.model}</span>
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
          <h3>Add a provider</h3>
          <label>
            Provider
            <select value={type} onChange={(e) => handleTypeChange(e.currentTarget.value as ProviderType)}>
              {PROVIDER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {PROVIDER_MANIFEST[t].label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Model
            <input
              value={model}
              onChange={(e) => setModel(e.currentTarget.value)}
              list={`models-${type}`}
              placeholder="Type or pick a model id…"
            />
            <datalist id={`models-${type}`}>
              {modelOptions.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>
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
