import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { PROVIDER_MANIFEST, PROVIDER_TYPES, type ProviderType } from "../lib/providers";
import { fetchProviderModels, providerModelsNeedApiKey, providerSupportsLiveModels } from "../lib/providerModels";
import type { ProviderDraft } from "./ProvidersPanel";

interface Props {
  onAddProvider: (draft: ProviderDraft) => Promise<void>;
  onAddFilesystem: (scopedPath: string) => Promise<void>;
  onClose: () => void;
}

type Step = "provider" | "key" | "mcp" | "done";

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function OnboardingWizard({ onAddProvider, onAddFilesystem, onClose }: Props) {
  const [step, setStep] = useState<Step>("provider");
  const [type, setType] = useState<ProviderType>("groq");
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
        model = models[0];
      } else {
        setVerifyStatus("unverified");
        setBusy(false);
        setError(
          "Couldn't verify this key against the live model list — double-check it, or continue anyway if you're sure it's correct.",
        );
        return;
      }
    }

    try {
      await onAddProvider({ type, label: manifest.label, model, apiKey: apiKey.trim() });
      setStep("mcp");
    } catch (err) {
      setError(`Couldn't save this provider: ${describeError(err)}`);
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
      setError(`Couldn't save this provider: ${describeError(err)}`);
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
      setStep("done");
    } catch (err) {
      setError(`Couldn't add filesystem access: ${describeError(err)}`);
    } finally {
      setMcpBusy(false);
    }
  }

  return (
    <div className="settings-overlay">
      <div className="settings-panel onboarding-panel">
        <div className="settings-header">
          <h2>Welcome to StudyLLM</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Skip setup
          </button>
        </div>

        {step === "provider" && (
          <>
            <p className="settings-hint">
              StudyLLM works with your own free-tier API keys — no subscription needed. Pick a
              provider to get started; you can add more later in Settings.
            </p>
            <div className="onboarding-provider-grid">
              {PROVIDER_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`onboarding-provider-choice${t === type ? " onboarding-provider-choice-active" : ""}`}
                  onClick={() => setType(t)}
                >
                  {PROVIDER_MANIFEST[t].label}
                </button>
              ))}
            </div>
            <div className="provider-edit-actions">
              <button type="button" className="btn btn-primary" onClick={() => setStep("key")}>
                Continue with {manifest.label}
              </button>
            </div>
          </>
        )}

        {step === "key" && (
          <>
            <p className="settings-hint">
              Get a free API key from {manifest.label}, paste it below, and we'll verify it works.
            </p>
            <a href={manifest.apiKeyUrl} target="_blank" rel="noreferrer">
              Get a free {manifest.label} API key
            </a>
            <label>
              API key
              <input
                type="password"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.currentTarget.value);
                  setVerifyStatus("idle");
                  setError(null);
                }}
                placeholder="Paste key…"
                autoFocus
              />
            </label>
            {verifyStatus === "checking" && <p className="settings-hint">Verifying key…</p>}
            {verifyStatus === "verified" && <p className="notice">Key verified — found live models.</p>}
            {error && <p className="error">{error}</p>}
            <div className="provider-edit-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep("provider")} disabled={busy}>
                Back
              </button>
              {verifyStatus === "unverified" ? (
                <button type="button" className="btn btn-secondary btn-sm" onClick={handleAddAnyway} disabled={busy}>
                  Add anyway
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleVerifyAndAdd}
                  disabled={busy || !apiKey.trim()}
                >
                  {busy ? "Verifying…" : "Verify & continue"}
                </button>
              )}
            </div>
          </>
        )}

        {step === "mcp" && (
          <>
            <p className="settings-hint">
              Want the assistant to read and write files in a folder on this computer? You can
              scope it to any folder you choose, and change or remove it later.
            </p>
            {error && <p className="error">{error}</p>}
            <div className="provider-edit-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep("done")} disabled={mcpBusy}>
                Skip
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={handlePickFolder} disabled={mcpBusy}>
                {mcpBusy ? "Adding…" : "Choose folder…"}
              </button>
            </div>
          </>
        )}

        {step === "done" && (
          <>
            <p className="settings-hint">You're all set! Start chatting whenever you're ready.</p>
            <div className="provider-edit-actions">
              <button type="button" className="btn btn-primary" onClick={onClose}>
                Start chatting
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
