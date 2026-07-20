import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  PROVIDER_MANIFEST,
  SELECTABLE_PROVIDER_TYPES,
  freeTierNoteKey,
  type ProviderType,
} from "../lib/providers";
import {
  fetchProviderModels,
  pickBestModel,
  providerModelsNeedApiKey,
  providerSupportsLiveModels,
} from "../lib/providerModels";
import type { ProviderDraft } from "./ProvidersPanel";
import { useT } from "../lib/i18n";

interface Props {
  onAddProvider: (draft: ProviderDraft) => Promise<void>;
  onAddFilesystem: (scopedPath: string) => Promise<void>;
  onClose: () => void;
  onOpenExplore: () => void;
}

type Step = "provider" | "key" | "mcp" | "features" | "done";

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function OnboardingWizard({ onAddProvider, onAddFilesystem, onClose, onOpenExplore }: Props) {
  const t = useT();
  const [step, setStep] = useState<Step>("provider");
  const [type, setType] = useState<ProviderType>("gemini");
  const [apiKey, setApiKey] = useState("");
  const [verifyStatus, setVerifyStatus] = useState<"idle" | "checking" | "verified" | "unverified">("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mcpBusy, setMcpBusy] = useState(false);

  const manifest = PROVIDER_MANIFEST[type];

  async function handleVerifyAndAdd() {
    if (!apiKey.trim()) return;
    setBusy(true);
    setError(null);
    let model = manifest.defaultModel;

    if (providerSupportsLiveModels(type) && providerModelsNeedApiKey(type)) {
      setVerifyStatus("checking");
      const models = await fetchProviderModels(type, apiKey);
      if (models && models.length > 0) {
        setVerifyStatus("verified");
        // Seed the best tool-capable free model we can identify.
        model = pickBestModel(type, models);
      } else {
        setVerifyStatus("unverified");
        setBusy(false);
        setError(t("onboarding.verifyFailed"));
        return;
      }
    }

    try {
      await onAddProvider({ type, label: manifest.label, model, apiKey: apiKey.trim() });
      setStep("mcp");
    } catch (err) {
      setError(t("onboarding.saveFailed", { error: describeError(err) }));
    } finally {
      setBusy(false);
    }
  }

  async function handleAddAnyway() {
    setBusy(true);
    setError(null);
    try {
      await onAddProvider({ type, label: manifest.label, model: manifest.defaultModel, apiKey: apiKey.trim() });
      setStep("mcp");
    } catch (err) {
      setError(t("onboarding.saveFailed", { error: describeError(err) }));
    } finally {
      setBusy(false);
    }
  }

  async function handlePickFolder() {
    const picked = await open({ directory: true, multiple: false });
    if (!picked) return;
    setMcpBusy(true);
    setError(null);
    try {
      await onAddFilesystem(picked);
      setStep("features");
    } catch (err) {
      setError(t("onboarding.mcpFailed", { error: describeError(err) }));
    } finally {
      setMcpBusy(false);
    }
  }

  return (
    <div className="settings-overlay">
      <div className="settings-panel onboarding-panel">
        <div className="settings-header">
          <h2>{t("onboarding.title")}</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            {t("onboarding.skipSetup")}
          </button>
        </div>

        {step === "provider" && (
          <>
            <p className="settings-hint">{t("onboarding.providerHint")}</p>
            <div className="onboarding-provider-grid">
              {SELECTABLE_PROVIDER_TYPES.map((pt) => (
                <button
                  key={pt}
                  type="button"
                  className={`onboarding-provider-choice${pt === type ? " onboarding-provider-choice-active" : ""}`}
                  onClick={() => setType(pt)}
                >
                  <span className="onboarding-provider-name">
                    {PROVIDER_MANIFEST[pt].label}
                    {PROVIDER_MANIFEST[pt].recommended && (
                      <span className="provider-badge-recommended">{t("onboarding.recommended")}</span>
                    )}
                  </span>
                  <span className="provider-free-note">{t(freeTierNoteKey(pt))}</span>
                </button>
              ))}
            </div>
            <div className="provider-edit-actions">
              <button type="button" className="btn btn-primary" onClick={() => setStep("key")}>
                {t("onboarding.continueWith", { provider: manifest.label })}
              </button>
            </div>
          </>
        )}

        {step === "key" && (
          <>
            <p className="settings-hint">
              {t("onboarding.keyHint", { provider: manifest.label })}
            </p>
            <a href={manifest.apiKeyUrl} target="_blank" rel="noreferrer">
              {t("onboarding.getKeyLink", { provider: manifest.label })}
            </a>
            <label>
              {t("onboarding.apiKey")}
              <input
                type="password"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.currentTarget.value);
                  setVerifyStatus("idle");
                  setError(null);
                }}
                placeholder={t("onboarding.pasteKey")}
                autoFocus
              />
            </label>
            {verifyStatus === "checking" && <p className="settings-hint">{t("onboarding.verifying")}</p>}
            {verifyStatus === "verified" && <p className="notice">{t("onboarding.verified")}</p>}
            {error && <p className="error">{error}</p>}
            <div className="provider-edit-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep("provider")} disabled={busy}>
                {t("common.back")}
              </button>
              {verifyStatus === "unverified" ? (
                <button type="button" className="btn btn-secondary btn-sm" onClick={handleAddAnyway} disabled={busy}>
                  {t("onboarding.addAnyway")}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleVerifyAndAdd}
                  disabled={busy || !apiKey.trim()}
                >
                  {busy ? t("onboarding.verifyingShort") : t("onboarding.verifyAndContinue")}
                </button>
              )}
            </div>
          </>
        )}

        {step === "mcp" && (
          <>
            <p className="settings-hint">{t("onboarding.mcpHint")}</p>
            {error && <p className="error">{error}</p>}
            <div className="provider-edit-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep("features")} disabled={mcpBusy}>
                {t("common.skip")}
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={handlePickFolder} disabled={mcpBusy}>
                {mcpBusy ? t("onboarding.adding") : t("onboarding.chooseFolder")}
              </button>
            </div>
          </>
        )}

        {step === "features" && (
          <>
            <p className="settings-hint">{t("onboarding.featuresHint")}</p>
            <ul className="onboarding-features">
              <li>
                <strong>{t("onboarding.featureResearch")}</strong> — {t("onboarding.featureResearchDesc")}
              </li>
              <li>
                <strong>{t("onboarding.featureDocs")}</strong> — {t("onboarding.featureDocsDesc")}
              </li>
            </ul>
            <div className="provider-edit-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenExplore}>
                {t("onboarding.seeHowItWorks")}
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setStep("done")}>
                {t("onboarding.continue")}
              </button>
            </div>
          </>
        )}

        {step === "done" && (
          <>
            <p className="settings-hint">{t("onboarding.doneHint")}</p>
            <div className="provider-edit-actions">
              <button type="button" className="btn btn-primary" onClick={onClose}>
                {t("onboarding.startChatting")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
