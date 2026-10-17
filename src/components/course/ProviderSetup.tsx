import { useState } from "react";
import {
  providerIcon,
  ONBOARDING_PROVIDER_TYPES,
  PROVIDER_MANIFEST,
  freeTierNoteKey,
  type ProviderType,
} from "../../lib/providers";
import {
  fetchProviderModels,
  pickBestModel,
  providerModelsNeedApiKey,
  providerSupportsLiveModels,
} from "../../lib/providerModels";
import type { ProviderRow } from "../../lib/db";
import type { ProviderDraft } from "../ProvidersPanel";
import { OmniRouteView, ProviderModeSwitch, type ProviderMode } from "../OmniRouteView";
import { useT } from "../../lib/i18n";

/**
 * Add a free provider without leaving the lesson. Same checks as the first-run wizard: when the
 * provider can list its models, the key is verified by asking for them, and the best tool-capable free
 * model is picked automatically. The cards of providers already connected are disabled, so a second
 * key always means a *different* provider (that is what makes failover possible).
 */

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function ProviderSetup({
  providers,
  onAddProvider,
}: {
  providers: ProviderRow[];
  onAddProvider: (draft: ProviderDraft) => Promise<void>;
}) {
  const t = useT();
  const [picked, setPicked] = useState<ProviderType>("gemini");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [justAdded, setJustAdded] = useState<string | null>(null);

  const have = new Set(providers.map((p) => p.type));
  const free = ONBOARDING_PROVIDER_TYPES.filter((pt) => !have.has(pt));
  const type = free.includes(picked) ? picked : (free[0] ?? picked);
  const manifest = PROVIDER_MANIFEST[type];
  const connected = providers.filter((p) => p.enabled);

  async function add(skipVerify: boolean) {
    const key = apiKey.trim();
    if (!key) return;
    setBusy(true);
    setError(null);
    setJustAdded(null);
    let model = manifest.defaultModel;

    if (!skipVerify && providerSupportsLiveModels(type) && providerModelsNeedApiKey(type)) {
      const models = await fetchProviderModels(type, key);
      if (models && models.length > 0) {
        model = pickBestModel(type, models);
      } else {
        setUnverified(true);
        setError(t("onboarding.verifyFailed"));
        setBusy(false);
        return;
      }
    }

    try {
      await onAddProvider({ type, label: manifest.label, model, apiKey: key });
      setApiKey("");
      setUnverified(false);
      setJustAdded(manifest.label);
    } catch (err) {
      setError(t("onboarding.saveFailed", { error: describeError(err) }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="setup">
      <div className="setup-status">
        {connected.length === 0 ? (
          <span className="setup-pill">{t("course.setup.noneYet")}</span>
        ) : (
          <>
            <span className="setup-status-label">{t("course.setup.connected")}</span>
            {connected.map((p) => (
              <span key={p.id} className="setup-pill setup-pill-ok">
                ✓ {p.label}
              </span>
            ))}
          </>
        )}
      </div>

      {free.length === 0 ? (
        <p className="notice">{t("course.setup.allAdded")}</p>
      ) : (
        <>
          <div className="onboarding-provider-grid">
            {free.map((pt) => (
              <button
                key={pt}
                type="button"
                className={`onboarding-provider-choice${pt === type ? " onboarding-provider-choice-active" : ""}`}
                onClick={() => {
                  setPicked(pt);
                  setError(null);
                  setUnverified(false);
                }}
              >
                <span className="onboarding-provider-name">
                  {providerIcon(pt)} {PROVIDER_MANIFEST[pt].label}
                  {PROVIDER_MANIFEST[pt].recommended && (
                    <span className="provider-badge-recommended">{t("onboarding.recommended")}</span>
                  )}
                </span>
                <span className="provider-free-note">{t(freeTierNoteKey(pt))}</span>
              </button>
            ))}
          </div>

          <ol className="setup-steps">
            <li>
              <a href={manifest.apiKeyUrl} target="_blank" rel="noreferrer">
                {t("onboarding.getKeyLink", { provider: manifest.label })}
              </a>
            </li>
            <li>
              <label className="setup-field">
                {t("onboarding.apiKey")}
                <input
                  type="password"
                  value={apiKey}
                  autoComplete="off"
                  placeholder={t("onboarding.pasteKey")}
                  onChange={(e) => {
                    setApiKey(e.currentTarget.value);
                    setError(null);
                    setUnverified(false);
                  }}
                />
              </label>
            </li>
          </ol>

          {error && <p className="error">{error}</p>}
          <div className="provider-edit-actions">
            {unverified ? (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void add(true)} disabled={busy}>
                {t("onboarding.addAnyway")}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => void add(false)}
                disabled={busy || !apiKey.trim()}
              >
                {busy ? t("onboarding.verifyingShort") : t("course.setup.verifyAdd", { provider: manifest.label })}
              </button>
            )}
          </div>
        </>
      )}
      {justAdded && <p className="notice">{t("course.setup.added", { provider: justAdded })}</p>}
    </div>
  );
}

/**
 * The either/or choice between your own provider keys and OmniRoute, right in the lesson: switching to
 * OmniRoute starts it and shows the keys it holds; switching back stops it.
 */
export function RouterSetup({
  mode,
  onMode,
  modeBusy,
}: {
  mode: ProviderMode;
  onMode: (mode: ProviderMode) => void;
  modeBusy: boolean;
}) {
  return (
    <div className="setup">
      <ProviderModeSwitch mode={mode} onChange={onMode} busy={modeBusy} />
      {mode === "omniroute" && <OmniRouteView />}
    </div>
  );
}
