import { useCallback, useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  OMNI_DASHBOARD_URL,
  OMNI_PROVIDER_IDS,
  OmniAuthError,
  addOmniConnection,
  deriveOmniState,
  listOmniConnections,
  omniStart,
  omniStatus,
  omniStop,
  probeOmniRoute,
  removeOmniConnection,
  setOmniConnectionActive,
  setOmniPassword,
  testOmniConnection,
  type OmniConnection,
  type OmniState,
  type OmniStatus,
} from "../lib/omniroute";
import { PROVIDER_MANIFEST, type ProviderType } from "../lib/providers";
import { IconLoader } from "./icons";
import { useT, type MessageKey } from "../lib/i18n";

/**
 * OmniRoute mode: the app runs the router and manages the keys *inside* it, so the student never opens a
 * terminal or a second window. The panel says plainly whether the router is starting or running, shows
 * the keys it holds (add, test, switch off, remove), and warns when it has none — without a key OmniRoute
 * has nothing to forward requests to, and chat would fail.
 */

export type ProviderMode = "own" | "omniroute";

const STATE_KEY: Record<OmniState, MessageKey> = {
  off: "omni.state.off",
  starting: "omni.state.starting",
  running: "omni.state.running",
  external: "omni.state.external",
  error: "omni.state.error",
};

/** Polls the process status and the router's own answer. Faster while it is starting up. */
export function useOmniRoute(enabled = true) {
  const [status, setStatus] = useState<OmniStatus | null>(null);
  const [models, setModels] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [s, m] = await Promise.all([omniStatus(), probeOmniRoute()]);
      setStatus(s);
      setModels(m);
    } catch {
      /* the next tick tries again */
    }
  }, []);

  const state = deriveOmniState(status, models !== null);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const id = window.setInterval(() => void refresh(), state === "starting" ? 1200 : 3000);
    return () => window.clearInterval(id);
  }, [enabled, refresh, state]);

  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setStatus(await omniStart());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const stop = useCallback(async () => {
    setBusy(true);
    try {
      setStatus(await omniStop());
      setModels(null);
    } finally {
      setBusy(false);
    }
  }, []);

  return { status, models, state, busy, error, start, stop, refresh };
}

/** The either/or choice: your own provider keys, or OmniRoute handling them. */
export function ProviderModeSwitch({
  mode,
  onChange,
  busy,
}: {
  mode: ProviderMode;
  onChange: (mode: ProviderMode) => void;
  busy: boolean;
}) {
  const t = useT();
  const options: { id: ProviderMode; label: MessageKey; hint: MessageKey }[] = [
    { id: "own", label: "mode.own", hint: "mode.ownHint" },
    { id: "omniroute", label: "mode.omni", hint: "mode.omniHint" },
  ];
  return (
    <div className="provider-mode" role="group" aria-label={t("mode.providers")}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={`provider-mode-btn${mode === o.id ? " provider-mode-btn-on" : ""}`}
          aria-pressed={mode === o.id}
          disabled={busy}
          onClick={() => mode !== o.id && onChange(o.id)}
        >
          <strong>{t(o.label)}</strong>
          <span>{t(o.hint)}</span>
        </button>
      ))}
    </div>
  );
}

export function OmniRouteView() {
  const t = useT();
  const omni = useOmniRoute();
  const [connections, setConnections] = useState<OmniConnection[] | null>(null);
  const [needPassword, setNeedPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState<ProviderType>("gemini");
  const [apiKey, setApiKey] = useState("");
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; message?: string }>>({});
  const [showLog, setShowLog] = useState(false);

  const up = omni.state === "running" || omni.state === "external";
  const types = (Object.keys(OMNI_PROVIDER_IDS) as ProviderType[]).filter((p) => PROVIDER_MANIFEST[p]);
  const lastLine = omni.status?.logTail[omni.status.logTail.length - 1];

  const load = useCallback(async () => {
    try {
      setConnections(await listOmniConnections());
      setNeedPassword(false);
    } catch (e) {
      if (e instanceof OmniAuthError) setNeedPassword(true);
      else setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    if (up) void load();
  }, [up, load]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (e) {
      if (e instanceof OmniAuthError) setNeedPassword(true);
      else setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function openDashboard() {
    try {
      await openUrl(OMNI_DASHBOARD_URL);
    } catch {
      window.open(OMNI_DASHBOARD_URL, "_blank");
    }
  }

  const label = (provider: string) => {
    const match = types.find((p) => OMNI_PROVIDER_IDS[p] === provider);
    return match ? PROVIDER_MANIFEST[match].label : provider;
  };

  return (
    <div className={`omni-card omni-${omni.state}`}>
      <div className="omni-head">
        <span className={`omni-dot omni-dot-${omni.state}`} aria-hidden="true" />
        <div className="omni-title">
          <strong>{t("omni.title")}</strong>
          <span className="omni-state">{t(STATE_KEY[omni.state])}</span>
        </div>
        {(omni.state === "off" || omni.state === "error") && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void omni.start()} disabled={omni.busy}>
            {t("omni.start")}
          </button>
        )}
        {up && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void openDashboard()}>
            {t("omni.dashboard")}
          </button>
        )}
      </div>

      {omni.state === "starting" && (
        <>
          <p className="omni-using">{t("omni.starting")}</p>
          <p className="omni-log">
            <IconLoader size={12} /> {lastLine ?? "…"}
          </p>
        </>
      )}
      {omni.state === "error" && (
        <p className="error">
          {t("omni.crashed")} {omni.status?.exited}
        </p>
      )}
      {omni.error && <p className="error">{omni.error}</p>}
      {(omni.state === "starting" || omni.state === "error") && (
        <div className="omni-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowLog((v) => !v)}>
            {t("omni.log")}
          </button>
        </div>
      )}
      {showLog && omni.status && <pre className="omni-logbox">{omni.status.logTail.join("\n") || "…"}</pre>}

      {up && (
        <>
          {needPassword ? (
            <div className="omni-password">
              <p className="settings-hint">{t("omni.password")}</p>
              <div className="provider-edit-actions">
                <input
                  type="password"
                  value={password}
                  autoComplete="off"
                  onChange={(e) => setPassword(e.currentTarget.value)}
                  aria-label={t("omni.passwordLabel")}
                />
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={!password}
                  onClick={() => void run(async () => setOmniPassword(password))}
                >
                  {t("omni.signIn")}
                </button>
              </div>
            </div>
          ) : (
            <>
              <h4 className="omni-sub">{t("omni.keys")}</h4>
              {connections && connections.length === 0 && <p className="notice">{t("omni.noKeys")}</p>}
              <ul className="omni-keys">
                {(connections ?? []).map((c) => (
                  <li key={c.id} className="omni-key">
                    <div className="omni-key-main">
                      <strong>{label(c.provider)}</strong>
                      <span className="omni-key-masked">{c.apiKey ?? ""}</span>
                      {testResult[c.id] && (
                        <span className={testResult[c.id].ok ? "omni-key-ok" : "omni-key-bad"}>
                          {testResult[c.id].ok ? t("omni.keyOk") : (testResult[c.id].message ?? t("omni.keyBad"))}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={testing === c.id}
                      onClick={async () => {
                        setTesting(c.id);
                        try {
                          const r = await testOmniConnection(c.id);
                          setTestResult((prev) => ({ ...prev, [c.id]: r }));
                        } catch (e) {
                          setTestResult((prev) => ({
                            ...prev,
                            [c.id]: { ok: false, message: e instanceof Error ? e.message : String(e) },
                          }));
                        } finally {
                          setTesting(null);
                        }
                      }}
                    >
                      {testing === c.id ? <IconLoader size={12} /> : t("omni.test")}
                    </button>
                    <label className="provider-toggle">
                      <input
                        type="checkbox"
                        checked={c.isActive}
                        onChange={(e) => {
                          const next = e.currentTarget.checked;
                          void run(() => setOmniConnectionActive(c.id, next));
                        }}
                      />
                      {t("providers.enabled")}
                    </label>
                    <button type="button" className="btn btn-ghost btn-sm provider-remove" onClick={() => void run(() => removeOmniConnection(c.id))}>
                      {t("common.remove")}
                    </button>
                  </li>
                ))}
              </ul>

              <h4 className="omni-sub">{t("omni.addKey")}</h4>
              <div className="omni-add">
                <select value={type} onChange={(e) => setType(e.currentTarget.value as ProviderType)} aria-label={t("lab.provider")}>
                  {types.map((p) => (
                    <option key={p} value={p}>
                      {PROVIDER_MANIFEST[p].label}
                    </option>
                  ))}
                </select>
                <input
                  type="password"
                  value={apiKey}
                  autoComplete="off"
                  placeholder={t("onboarding.pasteKey")}
                  onChange={(e) => setApiKey(e.currentTarget.value)}
                />
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={busy || !apiKey.trim()}
                  onClick={() =>
                    void run(async () => {
                      await addOmniConnection(OMNI_PROVIDER_IDS[type]!, PROVIDER_MANIFEST[type].label, apiKey.trim());
                      setApiKey("");
                    })
                  }
                >
                  {busy ? t("onboarding.verifyingShort") : t("omni.add")}
                </button>
              </div>
              <a href={PROVIDER_MANIFEST[type].apiKeyUrl} target="_blank" rel="noreferrer" className="omni-getkey">
                {t("onboarding.getKeyLink", { provider: PROVIDER_MANIFEST[type].label })}
              </a>
              {error && <p className="error">{error}</p>}
            </>
          )}
        </>
      )}
    </div>
  );
}
