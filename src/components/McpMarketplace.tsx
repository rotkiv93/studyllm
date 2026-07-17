import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { McpServerRow } from "../lib/db";
import type { CatalogEntry } from "../lib/mcp";
import { clearCatalogCache, computeTrustTier, searchCatalog, trustTierLabel, type TrustTier } from "../lib/mcpCatalog";

export interface ResolvedInstall {
  entry: CatalogEntry;
  /** Final npx args (fixed args + resolved positional values). Empty for remote-http. */
  finalArgs: string[];
  /** requiredEnv resolved to concrete values — process env for npx, headers for remote-http. */
  envValues: { name: string; value: string; isSecret: boolean }[];
  trustTier: TrustTier;
}

interface Props {
  servers: McpServerRow[];
  onInstall: (resolved: ResolvedInstall) => Promise<void>;
  onClose: () => void;
}

function looksLikePath(description: string | null): boolean {
  const d = description?.toLowerCase() ?? "";
  return /path|directory|folder/.test(d);
}

export function McpMarketplace({ servers, onInstall, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<"live" | "cache">("live");
  const [cacheAgeMs, setCacheAgeMs] = useState<number | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [installTarget, setInstallTarget] = useState<CatalogEntry | null>(null);
  const [envInputs, setEnvInputs] = useState<Record<string, string>>({});
  const [positionalInputs, setPositionalInputs] = useState<string[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [installBusy, setInstallBusy] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  const installedNames = new Set(servers.map((s) => s.name.toLowerCase()));

  async function runSearch(q: string) {
    setLoading(true);
    setSearchError(null);
    const result = await searchCatalog(q);
    setEntries(result.entries);
    setSource(result.source);
    setCacheAgeMs(result.cacheAgeMs);
    setSearchError(result.error);
    setLoading(false);
  }

  useEffect(() => {
    runSearch("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openInstall(entry: CatalogEntry) {
    setInstallError(null);
    setInstallTarget(entry);
    setEnvInputs(Object.fromEntries(entry.requiredEnv.map((v) => [v.name, v.default ?? ""])));
    setPositionalInputs(
      entry.install.kind === "npx" || entry.install.kind === "uvx"
        ? entry.install.positionalArgs.map((p) => p.default ?? "")
        : [],
    );
    setAcknowledged(false);
  }

  function closeInstall() {
    setInstallTarget(null);
  }

  async function pickFolder(index: number) {
    const picked = await open({ directory: true, multiple: false });
    if (!picked) return;
    setPositionalInputs((prev) => prev.map((v, i) => (i === index ? picked : v)));
  }

  function missingRequirements(entry: CatalogEntry): boolean {
    const missingEnv = entry.requiredEnv.some((v) => v.isRequired && !envInputs[v.name]?.trim());
    const missingPositional =
      (entry.install.kind === "npx" || entry.install.kind === "uvx") &&
      entry.install.positionalArgs.some((_, i) => !positionalInputs[i]?.trim());
    return missingEnv || missingPositional;
  }

  async function confirmInstall() {
    if (!installTarget) return;
    const entry = installTarget;
    const tier = computeTrustTier(entry);
    if (tier !== "official" && !acknowledged) return;
    if (missingRequirements(entry)) return;

    let finalArgs: string[] = [];
    if (entry.install.kind === "npx" || entry.install.kind === "uvx") {
      finalArgs = [...entry.install.args, ...positionalInputs.map((v) => v.trim()).filter(Boolean)];
    }
    const envValues = entry.requiredEnv.map((v) => ({
      name: v.name,
      value: envInputs[v.name] ?? "",
      isSecret: v.isSecret,
    }));

    setInstallBusy(true);
    setInstallError(null);
    try {
      await onInstall({ entry, finalArgs, envValues, trustTier: tier });
      setInstallTarget(null);
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : String(err));
    } finally {
      setInstallBusy(false);
    }
  }

  return (
    <div className="settings-overlay">
      <div className="settings-panel">
        <div className="settings-header">
          <h2>MCP Marketplace</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Close
          </button>
        </div>

        <p className="settings-hint">
          Browsing the official MCP registry. Community servers can run arbitrary code on this
          computer — check the trust badge before installing, and only add servers you trust.
        </p>

        <form
          className="marketplace-search"
          onSubmit={(e) => {
            e.preventDefault();
            runSearch(query);
          }}
        >
          <input
            placeholder="Search servers…"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
          />
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? "Searching…" : "Search"}
          </button>
        </form>

        {source === "cache" && (
          <p className="notice">
            Registry unreachable{searchError ? ` (${searchError})` : ""} — showing cached results
            {cacheAgeMs != null ? ` from ${Math.round(cacheAgeMs / 60000)} min ago` : ""}.
            {" "}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={async () => {
                await clearCatalogCache();
                runSearch(query);
              }}
            >
              Clear cache
            </button>
          </p>
        )}

        <ul className="provider-list marketplace-list">
          {entries.map((entry) => {
            const tier = computeTrustTier(entry);
            const already = installedNames.has(entry.name.toLowerCase());
            const unsupported = entry.install.kind === "unsupported";
            return (
              <li key={entry.id} className="marketplace-item">
                <div className="provider-row-main">
                  <strong>
                    {entry.name}{" "}
                    <span className={`trust-badge trust-${tier}`}>{trustTierLabel(tier)}</span>
                  </strong>
                  <span className="provider-model">{entry.description}</span>
                  {entry.install.kind === "unsupported" && (
                    <span className="provider-model marketplace-unsupported">
                      {entry.install.reason}
                    </span>
                  )}
                </div>
                <div className="provider-row-actions">
                  {already ? (
                    <span className="settings-hint">Installed</span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={unsupported}
                      onClick={() => openInstall(entry)}
                    >
                      Install
                    </button>
                  )}
                </div>
              </li>
            );
          })}
          {!loading && entries.length === 0 && (
            <li className="empty-state">No servers found.</li>
          )}
        </ul>

        {installTarget && (
          <div className="settings-overlay">
            <div className="settings-panel">
              <div className="settings-header">
                <h2>Install {installTarget.name}</h2>
                <button type="button" className="btn btn-ghost btn-sm" onClick={closeInstall}>
                  Cancel
                </button>
              </div>

              {computeTrustTier(installTarget) !== "official" && (
                <p className={`error marketplace-warning-${computeTrustTier(installTarget)}`}>
                  {computeTrustTier(installTarget) === "community"
                    ? "This is an unverified community server — it can run arbitrary code on this computer with your user account's permissions. Only install it if you trust the publisher."
                    : "This server's publisher has a public repository but hasn't been audited by StudyLLM. Review it before installing."}
                </p>
              )}

              <div className="add-provider-form">
                {(installTarget.install.kind === "npx" || installTarget.install.kind === "uvx") &&
                  installTarget.install.positionalArgs.map((arg, i) => (
                    <label key={i}>
                      {arg.description ?? `Argument ${i + 1}`}
                      <div className="marketplace-path-row">
                        <input
                          value={positionalInputs[i] ?? ""}
                          onChange={(e) =>
                            setPositionalInputs((prev) =>
                              prev.map((v, idx) => (idx === i ? e.currentTarget.value : v)),
                            )
                          }
                        />
                        {looksLikePath(arg.description) && (
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => pickFolder(i)}>
                            Choose folder…
                          </button>
                        )}
                      </div>
                    </label>
                  ))}

                {installTarget.requiredEnv.map((v) => (
                  <label key={v.name}>
                    {v.description ?? v.name}
                    {v.isRequired ? " *" : " (optional)"}
                    <input
                      type={v.isSecret ? "password" : "text"}
                      placeholder={v.name}
                      value={envInputs[v.name] ?? ""}
                      onChange={(e) =>
                        setEnvInputs((prev) => ({ ...prev, [v.name]: e.currentTarget.value }))
                      }
                    />
                  </label>
                ))}
              </div>

              {computeTrustTier(installTarget) !== "official" && (
                <label className="marketplace-ack">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(e) => setAcknowledged(e.currentTarget.checked)}
                  />
                  I understand the risk and want to install this server anyway.
                </label>
              )}

              {installError && <p className="error">{installError}</p>}

              <button
                type="button"
                className="btn btn-primary"
                disabled={
                  installBusy ||
                  missingRequirements(installTarget) ||
                  (computeTrustTier(installTarget) !== "official" && !acknowledged)
                }
                onClick={confirmInstall}
              >
                {installBusy ? "Installing…" : "Install"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
