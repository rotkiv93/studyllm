import { useState } from "react";
import { PROVIDER_MANIFEST, PROVIDER_TYPES, type ProviderType } from "../lib/providers";
import type { ProviderRow } from "../lib/db";

export interface ProviderDraft {
  type: ProviderType;
  label: string;
  model: string;
  apiKey: string;
}

interface Props {
  providers: ProviderRow[];
  onAdd: (draft: ProviderDraft) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onToggle: (id: string, enabled: boolean) => Promise<void>;
  onReorder: (id: string, direction: "up" | "down") => Promise<void>;
  onClose: () => void;
}

export function SettingsPanel({ providers, onAdd, onRemove, onToggle, onReorder, onClose }: Props) {
  const [type, setType] = useState<ProviderType>("groq");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(PROVIDER_MANIFEST["groq"].defaultModel);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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
          {providers.map((p, i) => (
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
                <button type="button" className="btn btn-danger btn-sm" onClick={() => handleRemove(p.id)}>
                  Remove
                </button>
              </div>
            </li>
          ))}
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
            />
            <datalist id={`models-${type}`}>
              {PROVIDER_MANIFEST[type].suggestedModels.map((m) => (
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
