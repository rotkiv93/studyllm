import { describe, expect, it } from "vitest";
import {
  computeTrustTier,
  rankCatalog,
  trustTierLabelKey,
  trustTierTooltipKey,
} from "./mcpCatalog";
import type { CatalogEntry } from "./mcp";

function entry(overrides: Partial<CatalogEntry> & { name: string; repositoryUrl: string | null }): CatalogEntry {
  return {
    id: overrides.name,
    description: "",
    version: null,
    install: { kind: "unsupported", reason: "test" },
    requiredEnv: [],
    ...overrides,
  };
}

describe("computeTrustTier", () => {
  it("treats io.modelcontextprotocol* names as official", () => {
    expect(computeTrustTier({ name: "io.modelcontextprotocol/fetch", repositoryUrl: null })).toBe("official");
  });

  it("treats the modelcontextprotocol/servers repo as official regardless of name", () => {
    expect(
      computeTrustTier({
        name: "some-server",
        repositoryUrl: "https://github.com/modelcontextprotocol/servers",
      }),
    ).toBe("official");
  });

  it("treats other github/gitlab repos as verified", () => {
    expect(
      computeTrustTier({ name: "acme-server", repositoryUrl: "https://github.com/acme/mcp-server" }),
    ).toBe("verified");
    expect(
      computeTrustTier({ name: "acme-server", repositoryUrl: "https://gitlab.com/acme/mcp-server" }),
    ).toBe("verified");
  });

  it("falls back to community for anything else", () => {
    expect(computeTrustTier({ name: "mystery-server", repositoryUrl: null })).toBe("community");
    expect(
      computeTrustTier({ name: "mystery-server", repositoryUrl: "https://example.com/repo" }),
    ).toBe("community");
  });
});

describe("trustTierLabelKey", () => {
  it("maps each tier to its i18n key", () => {
    expect(trustTierLabelKey("official")).toBe("trust.official");
    expect(trustTierLabelKey("verified")).toBe("trust.verified");
    expect(trustTierLabelKey("community")).toBe("trust.community");
  });

  it("maps each tier to its tooltip key", () => {
    expect(trustTierTooltipKey("official")).toBe("trust.tooltip.official");
    expect(trustTierTooltipKey("verified")).toBe("trust.tooltip.verified");
    expect(trustTierTooltipKey("community")).toBe("trust.tooltip.community");
  });
});

describe("rankCatalog", () => {
  const installable: CatalogEntry["install"] = { kind: "npx", args: ["-y", "pkg"], positionalArgs: [] };

  it("orders official, then verified, then community, preserving relative order within a tier", () => {
    const community = entry({ name: "z-community", repositoryUrl: null });
    const officialByName = entry({ name: "io.modelcontextprotocol/fetch-ish", repositoryUrl: null });
    const officialByRepo = entry({
      name: "b-official-by-repo",
      repositoryUrl: "https://github.com/modelcontextprotocol/servers",
    });
    const verified = entry({ name: "c-verified", repositoryUrl: "https://github.com/someone/thing" });

    const sorted = rankCatalog([community, officialByName, officialByRepo, verified]);
    expect(sorted.map((e) => e.name)).toEqual([
      "io.modelcontextprotocol/fetch-ish",
      "b-official-by-repo",
      "c-verified",
      "z-community",
    ]);
  });

  it("puts well-known servers before obscure ones, even when the obscure one sorts first alphabetically", () => {
    const obscure = entry({ name: "aaa-obscure", repositoryUrl: "https://github.com/x/aaa", install: installable });
    const popular = entry({ name: "zzz/playwright-mcp", repositoryUrl: "https://github.com/x/playwright", install: installable });
    expect(rankCatalog([obscure, popular]).map((e) => e.name)).toEqual(["zzz/playwright-mcp", "aaa-obscure"]);
  });

  it("ranks the more useful well-known server first", () => {
    const a = entry({ name: "sqlite-server", repositoryUrl: "https://github.com/x/a", install: installable });
    const b = entry({ name: "github-server", repositoryUrl: "https://github.com/x/b", install: installable });
    expect(rankCatalog([a, b])[0].name).toBe("github-server");
  });

  it("pins a featured official server above other popular ones", () => {
    const lookalike = entry({ name: "ai.smithery/someone-notion-fork", repositoryUrl: "https://github.com/x/notion", install: installable });
    const official = entry({ name: "com.notion/mcp", repositoryUrl: null, install: installable });
    expect(rankCatalog([lookalike, official])[0].name).toBe("com.notion/mcp");
  });

  it("does not treat every io.github.* publisher as the github server", () => {
    const random = entry({ name: "io.github.someone/tiny-tool", repositoryUrl: "https://github.com/someone/tiny-tool", install: installable });
    const sqlite = entry({ name: "io.github.other/sqlite-helper", repositoryUrl: "https://github.com/other/sqlite-helper", install: installable });
    expect(rankCatalog([random, sqlite])[0].name).toBe("io.github.other/sqlite-helper");
  });

  it("pushes entries that cannot be installed to the bottom", () => {
    const broken = entry({ name: "a-broken", repositoryUrl: "https://github.com/x/a" });
    const working = entry({ name: "b-working", repositoryUrl: "https://github.com/x/b", install: installable });
    expect(rankCatalog([broken, working]).map((e) => e.name)).toEqual(["b-working", "a-broken"]);
  });

  it("prefers servers that need no key over ones that do", () => {
    const keyed = entry({
      name: "a-keyed",
      repositoryUrl: "https://github.com/x/a",
      install: installable,
      requiredEnv: [{ name: "K", description: "", isRequired: true, isSecret: true, default: null }],
    });
    const free = entry({ name: "b-free", repositoryUrl: "https://github.com/x/b", install: installable });
    expect(rankCatalog([keyed, free])[0].name).toBe("b-free");
  });

  it("does not mutate the input array", () => {
    const input = [entry({ name: "one", repositoryUrl: null })];
    const copy = [...input];
    rankCatalog(input);
    expect(input).toEqual(copy);
  });
});
