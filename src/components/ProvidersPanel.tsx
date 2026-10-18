import { useEffect, useRef, useState } from "react";
import {
  providerIcon,
  PROVIDER_MANIFEST,
  SELECTABLE_PROVIDER_TYPES,
  LOCAL_ROUTER_PLACEHOLDER_KEY,
  freeTierNoteKey,
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
import { OmniRouteView, ProviderModeSwitch, type ProviderMode } from "./OmniRouteView";
import { useT } from "../lib/i18n";
import { useEscapeClose } from "../lib/useEscapeClose";

export interface ProviderDraft {
  type: ProviderType;
  label: string;
  model: string;
  apiKey: string;
  /** Only set for a local router (OmniRoute) whose address the student can change. */
  baseURL?: string;
}

export interface ProviderEditDraft {
  label: string;
  model: string;
  /** Empty string means "keep the existing key". */
  apiKey: string;
  /** Only set for a local router; `undefined` leaves the saved address untouched. */
  baseURL?: string;
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
  /** Own provider keys, or OmniRoute handling them — one or the other. */
  mode: ProviderMode;
  onMode: (mode: ProviderMode) => void;
  modeBusy: boolean;
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
  baseURL,
  model,
  onChange,
  idPrefix,
  autoSelect = false,
}: {
  type: ProviderType;
  apiKey: string;
  /** Router address, for the local-router type (its model list lives under it). */
  baseURL?: string;
  model: string;
  onChange: (model: string) => void;
  idPrefix: string;
  /** When true, auto-pick a tool-capable model once the live list loads, until the user picks one. */
  autoSelect?: boolean;
}) {
  const t = useT();
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
      const models = await fetchProviderModels(type, apiKey, baseURL);
      if (modelsRequestId.current !== requestId) return; // superseded by a newer request
      if (models && models.length > 0) {
        setLiveModels(models);
        setModelsStatus("loaded");
      } else {
        setLiveModels(null);
        setModelsStatus("unavailable");
      }
      // A typed router address is debounced like a typed key, so we don't probe on every keystroke.
    }, delay || (PROVIDER_MANIFEST[type].local ? 500 : 0));
    return () => clearTimeout(timer);
  }, [type, apiKey, baseURL]);

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
        {t("model.label")}
        <input
          value={model}
          onChange={(e) => handleUserChange(e.currentTarget.value)}
          list={`models-${idPrefix}`}
          placeholder={t("model.placeholder")}
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
          {t("model.toolCompatibleOnly")}
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
                  <span className="model-badge model-badge-tools">{t("model.badgeTools")}</span>
                )}
                {m.supportsTools === false && (
                  <span className="model-badge model-badge-notools">{t("model.badgeNoTools")}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {providerSupportsLiveModels(type) && (
        <p className="settings-hint">
          {modelsStatus === "loading" && t("model.loading")}
          {modelsStatus === "loaded" &&
            t("model.loaded", {
              count: liveModels?.length ?? 0,
              provider: PROVIDER_MANIFEST[type].label,
            })}
          {modelsStatus === "unavailable" &&
            (type === "ollama"
              ? t("model.unavailableOllama")
              : PROVIDER_MANIFEST[type].local
              ? t("model.unavailableLocal")
              : providerModelsNeedApiKey(type)
                ? t("model.unavailableWithKey")
                : t("model.unavailable"))}
          {modelsStatus === "idle" && providerModelsNeedApiKey(type) && t("model.enterKey")}
        </p>
      )}
    </div>
  );
}

/**
 * Whether a keyless local provider (Ollama) is running and which models it has installed — or, if it
 * isn't, a friendly hint with the link to install it. Re-checked when the type is picked or on demand.
 */
function LocalStatus({ type }: { type: ProviderType }) {
  const t = useT();
  const [state, setState] = useState<{ status: "checking" } | { status: "up"; count: number } | { status: "down" }>({
    status: "checking",
  });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let active = true;
    setState({ status: "checking" });
    void fetchProviderModels(type, "", PROVIDER_MANIFEST[type].baseURL).then((models) => {
      if (!active) return;
      setState(models === null ? { status: "down" } : { status: "up", count: models.length });
    });
    return () => {
      active = false;
    };
  }, [type, nonce]);

  return (
    <p className="settings-hint" role="status">
      {state.status === "checking" && t("ollama.checking")}
      {state.status === "up" &&
        (state.count > 0 ? t("ollama.running", { count: state.count }) : t("ollama.runningEmpty"))}
      {state.status === "down" && (
        <>
          {t("ollama.notRunning")}{" "}
          <a href={PROVIDER_MANIFEST[type].apiKeyUrl} target="_blank" rel="noreferrer">
            {t("ollama.install")}
          </a>
        </>
      )}{" "}
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNonce((n) => n + 1)}>
        {t("ollama.recheck")}
      </button>
    </p>
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
  const t = useT();
  const [label, setLabel] = useState(provider.label);
  const [model, setModel] = useState(provider.model);
  const [apiKey, setApiKey] = useState("");
  const isLocal = !!PROVIDER_MANIFEST[provider.type]?.local;
  const keyless = !!PROVIDER_MANIFEST[provider.type]?.keyless;
  const [baseURL, setBaseURL] = useState(
    provider.base_url_override ?? PROVIDER_MANIFEST[provider.type].baseURL,
  );
  const [busy, setBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setEditError(null);
    try {
      await onSave({
        label: label.trim(),
        model: model.trim(),
        apiKey: apiKey.trim(),
        ...(isLocal ? { baseURL: baseURL.trim() } : {}),
      });
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
          {t("providers.label")}
          <input value={label} onChange={(e) => setLabel(e.currentTarget.value)} />
        </label>
        {isLocal && (
          <label>
            {t("providers.routerUrl")}
            <input value={baseURL} onChange={(e) => setBaseURL(e.currentTarget.value)} />
          </label>
        )}
        <ModelField
          type={provider.type}
          apiKey={apiKey}
          baseURL={isLocal ? baseURL : undefined}
          model={model}
          onChange={setModel}
          idPrefix={`edit-${provider.id}`}
        />
        {!keyless && (
          <label>
            {t("providers.apiKey")}
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.currentTarget.value)}
              placeholder={t("providers.keepCurrentKey")}
            />
          </label>
        )}
        <div className="provider-edit-actions">
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !label.trim() || !model.trim()}>
            {t("common.save")}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} disabled={busy}>
            {t("common.cancel")}
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
  mode,
  onMode,
  modeBusy,
}: Props) {
  const t = useT();
  useEscapeClose(onClose);
  const [type, setType] = useState<ProviderType>("gemini");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [unverified, setUnverified] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  // OmniRoute has its own view; this list is only the providers the student keyed in themselves.
  const own = providers.filter((p) => p.type !== "omniroute");
  // Only providers that aren't on the list yet can be added.
  const addable = SELECTABLE_PROVIDER_TYPES.filter((pt) => pt !== "omniroute" && !own.some((p) => p.type === pt));
  const chosen: ProviderType = addable.includes(type) ? type : (addable[0] ?? type);
  const keyless = !!PROVIDER_MANIFEST[chosen].keyless;

  function describeError(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  async function handleAdd(e: React.FormEvent, skipVerify = false) {
    e.preventDefault();
    const key = keyless ? LOCAL_ROUTER_PLACEHOLDER_KEY : apiKey.trim();
    if (!key) return;
    setBusy(true);
    setFormError(null);
    let model = PROVIDER_MANIFEST[chosen].defaultModel;
    try {
      if (keyless) {
        // No key to verify: use what the student has installed, or the suggested model if Ollama is off.
        model = pickBestModel(chosen, await fetchProviderModels(chosen, "", PROVIDER_MANIFEST[chosen].baseURL));
      }
      // Same check as the first-run wizard: ask the provider for its models with this key, and start
      // from the best tool-capable free one. The model can be changed afterwards with "Edit".
      if (!skipVerify && providerSupportsLiveModels(chosen) && providerModelsNeedApiKey(chosen)) {
        const models = await fetchProviderModels(chosen, key);
        if (!models || models.length === 0) {
          setUnverified(true);
          setFormError(t("onboarding.verifyFailed"));
          return;
        }
        model = pickBestModel(chosen, models);
      }
      await onAdd({
        type: chosen,
        label: PROVIDER_MANIFEST[chosen].label,
        model,
        apiKey: key,
        ...(keyless ? { baseURL: PROVIDER_MANIFEST[chosen].baseURL } : {}),
      });
      setApiKey("");
      setUnverified(false);
    } catch (err) {
      setFormError(t("providers.addFailed", { error: describeError(err) }));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(id: string) {
    setFormError(null);
    try {
      await onRemove(id);
    } catch (err) {
      setFormError(t("providers.removeFailed", { error: describeError(err) }));
    }
  }

  async function handleToggle(id: string, enabled: boolean) {
    setFormError(null);
    try {
      await onToggle(id, enabled);
    } catch (err) {
      setFormError(t("providers.updateFailed", { error: describeError(err) }));
    }
  }

  async function handleReorder(id: string, direction: "up" | "down") {
    setFormError(null);
    try {
      await onReorder(id, direction);
    } catch (err) {
      setFormError(t("providers.reorderFailed", { error: describeError(err) }));
    }
  }

  async function handleEditSave(id: string, draft: ProviderEditDraft) {
    await onEdit(id, draft);
    setEditingId(null);
  }

  return (
    <div className="settings-overlay">
      <div className="settings-panel settings-panel-wide">
        <div className="settings-header">
          <h2>{t("providers.title")}</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>

        <p className="settings-hint">
          {t("providers.hint")}{" "}
          <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenOnboarding}>
            {t("providers.runSetupGuide")}
          </button>
        </p>

        {formError && <p className="error">{formError}</p>}

        <ProviderModeSwitch mode={mode} onChange={onMode} busy={modeBusy} />

        {mode === "omniroute" ? (
          <>
            <p className="settings-hint">{t("omni.pausedOwn")}</p>
            <OmniRouteView />
          </>
        ) : (
          <>
        {addable.length > 0 && (
        <form className="provider-add-compact" onSubmit={handleAdd}>
          <h3 className="mcp-section-title">{t("providers.addProvider")}</h3>
          <div className="omni-add">
            <select
              value={chosen}
              onChange={(e) => {
                setType(e.currentTarget.value as ProviderType);
                setUnverified(false);
                setFormError(null);
              }}
              aria-label={t("lab.provider")}
            >
              {addable.map((pt) => (
                <option key={pt} value={pt}>
                  {providerIcon(pt)} {PROVIDER_MANIFEST[pt].label}
                </option>
              ))}
            </select>
            {!keyless && (
              <input
                type="password"
                value={apiKey}
                autoComplete="off"
                placeholder={t("providers.pasteKey")}
                onChange={(e) => {
                  setApiKey(e.currentTarget.value);
                  setUnverified(false);
                  setFormError(null);
                }}
              />
            )}
            {unverified ? (
              <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={(e) => void handleAdd(e, true)}>
                {t("onboarding.addAnyway")}
              </button>
            ) : (
              <button type="submit" className="btn btn-primary btn-sm" disabled={busy || (!keyless && !apiKey.trim())}>
                {busy ? t("onboarding.verifyingShort") : t("providers.addProviderButton")}
              </button>
            )}
          </div>
          {keyless ? (
            <LocalStatus type={chosen} />
          ) : (
            <a href={PROVIDER_MANIFEST[chosen].apiKeyUrl} target="_blank" rel="noreferrer" className="omni-getkey">
              {t("providers.getKeyLink", { provider: PROVIDER_MANIFEST[chosen].label })}
            </a>
          )}
        </form>
        )}

        <h3 className="mcp-section-title">{t("providers.yourProviders")}</h3>
        <ul className="provider-list">
          {own.map((p, i) =>
            editingId === p.id ? (
              <EditProviderRow
                key={p.id}
                provider={p}
                onSave={(draft) => handleEditSave(p.id, draft)}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <li key={p.id} className={p.enabled ? "" : "provider-disabled"}>
                <div
                  className="provider-row-main"
                  title={PROVIDER_MANIFEST[p.type]?.freeTierNote ? t(freeTierNoteKey(p.type)) : undefined}
                >
                  <strong>
                    <span className="item-icon" aria-hidden="true">{providerIcon(p.type)}</span>
                    {p.label}
                  </strong>
                  <span className="provider-model">{p.model}</span>
                </div>
                <div className="provider-row-actions">
                  <button
                    type="button"
                    className="btn btn-icon btn-secondary btn-sm"
                    onClick={() => handleReorder(p.id, "up")}
                    disabled={i === 0}
                    title={t("providers.moveUp")}
                    aria-label={t("providers.moveUp")}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn-icon btn-secondary btn-sm"
                    onClick={() => handleReorder(p.id, "down")}
                    disabled={i === own.length - 1}
                    title={t("providers.moveDown")}
                    aria-label={t("providers.moveDown")}
                  >
                    ↓
                  </button>
                  <label>
                    <input
                      type="checkbox"
                      checked={!!p.enabled}
                      onChange={(e) => handleToggle(p.id, e.currentTarget.checked)}
                    />
                    {t("providers.enabled")}
                  </label>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setEditingId(p.id)}
                  >
                    {t("common.edit")}
                  </button>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => handleRemove(p.id)}>
                    {t("common.remove")}
                  </button>
                </div>
              </li>
            ),
          )}
          {own.length === 0 && <li className="empty-state">{t("providers.none")}</li>}
        </ul>

          </>
        )}
      </div>
    </div>
  );
}
