import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { McpServerRow } from "../lib/db";
import type { CatalogEntry } from "../lib/mcp";
import { clearCatalogCache, computeTrustTier, searchCatalog, trustTierLabel, type TrustTier } from "../lib/mcpCatalog";
import { IconCheck } from "./icons";

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
}

const TRUST_TOOLTIP: Record<TrustTier, string> = {
  official: "Built and maintained by the MCP project itself.",
  verified: "Made by an outside developer whose source code is public, but not audited by StudyLLM.",
  community: "An unverified tool from an independent developer — it can run code on this computer with your permissions.",
};

const AVATAR_CLASSES = ["avatar-c0", "avatar-c1", "avatar-c2"];

function avatarClass(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash + name.charCodeAt(i)) % AVATAR_CLASSES.length;
  return AVATAR_CLASSES[hash];
}

function isPopular(entry: CatalogEntry): boolean {
  return /filesystem|gmail|google[- ]?drive|google/i.test(entry.name);
}

function looksLikePath(description: string | null): boolean {
  const d = description?.toLowerCase() ?? "";
  return /path|directory|folder/.test(d);
}

function MarketplaceCard({
  entry,
  installed,
  onInstall,
}: {
  entry: CatalogEntry;
  installed: boolean;
  onInstall: () => void;
}) {
  const tier = computeTrustTier(entry);
  const unsupported = entry.install.kind === "unsupported";
  return (
    <li className="marketplace-card">
      <div className="marketplace-card-head">
        <span className={`marketplace-card-avatar ${avatarClass(entry.name)}`}>
          {entry.name.trim().charAt(0).toUpperCase() || "?"}
        </span>
        <div className="marketplace-card-title">
          <strong>{entry.name}</strong>
          <span className={`trust-badge trust-${tier}`} title={TRUST_TOOLTIP[tier]}>
            {trustTierLabel(tier)}
          </span>
        </div>
      </div>
      <p className="marketplace-card-desc">{entry.description}</p>
      {entry.install.kind === "unsupported" && (
        <p className="marketplace-unsupported">{entry.install.reason}</p>
      )}
      <div className="marketplace-card-footer">
        {installed ? (
          <span className="marketplace-added">
            <IconCheck size={14} /> Added
          </span>
        ) : (
          <button type="button" className="btn btn-primary btn-sm" disabled={unsupported} onClick={onInstall}>
            Add
          </button>
        )}
      </div>
    </li>
  );
}

export function McpMarketplace({ servers, onInstall }: Props) {
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

  const query_ = query.trim();
  const popular = query_ ? [] : entries.filter(isPopular);
  const popularIds = new Set(popular.map((e) => e.id));
  const rest = entries.filter((e) => !popularIds.has(e.id));

  return (
    <>
      <p className="settings-hint">
        Add extra tools the assistant can use, like reading files or checking your inbox. Only add
        tools from people or projects you trust — check the badge before adding.
      </p>

      <form
        className="marketplace-search"
        onSubmit={(e) => {
          e.preventDefault();
          runSearch(query);
        }}
      >
        <input
          placeholder="Search for a tool…"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {source === "cache" && (
        <p className="notice">
          Couldn't reach the tool directory{searchError ? ` (${searchError})` : ""} — showing what
          was saved{cacheAgeMs != null ? ` from ${Math.round(cacheAgeMs / 60000)} min ago` : ""}.
          {" "}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={async () => {
              await clearCatalogCache();
              runSearch(query);
            }}
          >
            Clear saved results
          </button>
        </p>
      )}

      {popular.length > 0 && (
        <>
          <h3 className="mcp-section-title">Popular</h3>
          <ul className="marketplace-grid">
            {popular.map((entry) => (
              <MarketplaceCard
                key={entry.id}
                entry={entry}
                installed={installedNames.has(entry.name.toLowerCase())}
                onInstall={() => openInstall(entry)}
              />
            ))}
          </ul>
        </>
      )}

      {popular.length > 0 && <h3 className="mcp-section-title">All tools</h3>}
      <ul className="marketplace-grid">
        {rest.map((entry) => (
          <MarketplaceCard
            key={entry.id}
            entry={entry}
            installed={installedNames.has(entry.name.toLowerCase())}
            onInstall={() => openInstall(entry)}
          />
        ))}
        {!loading && entries.length === 0 && <li className="empty-state">No tools found.</li>}
      </ul>

      {installTarget && (
        <div className="settings-overlay">
          <div className="settings-panel">
            <div className="settings-header">
              <h2>Add {installTarget.name}</h2>
              <button type="button" className="btn btn-ghost btn-sm" onClick={closeInstall}>
                Cancel
              </button>
            </div>

            {computeTrustTier(installTarget) !== "official" && (
              <p className={`error marketplace-warning-${computeTrustTier(installTarget)}`}>
                {computeTrustTier(installTarget) === "community"
                  ? "This is an unverified community tool — it can run arbitrary code on this computer with your user account's permissions. Only add it if you trust the publisher."
                  : "This tool's publisher has a public repository but hasn't been audited by StudyLLM. Review it before adding."}
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
                I understand the risk and want to add this tool anyway.
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
              {installBusy ? "Adding…" : "Add"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
