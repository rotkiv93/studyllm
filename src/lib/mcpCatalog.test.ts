import { describe, expect, it } from "vitest";
import {
  computeTrustTier,
  sortByTrust,
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

describe("sortByTrust", () => {
  it("orders official, then verified, then community, preserving relative order within a tier", () => {
    const community = entry({ name: "z-community", repositoryUrl: null });
    const officialByName = entry({ name: "io.modelcontextprotocol/fetch", repositoryUrl: null });
    const officialByRepo = entry({
      name: "b-official-by-repo",
      repositoryUrl: "https://github.com/modelcontextprotocol/servers",
    });
    const verified = entry({ name: "c-verified", repositoryUrl: "https://github.com/someone/thing" });

    const sorted = sortByTrust([community, officialByName, officialByRepo, verified]);
    expect(sorted.map((e) => e.name)).toEqual([
      "io.modelcontextprotocol/fetch",
      "b-official-by-repo",
      "c-verified",
      "z-community",
    ]);
  });

  it("does not mutate the input array", () => {
    const input = [entry({ name: "one", repositoryUrl: null })];
    const copy = [...input];
    sortByTrust(input);
    expect(input).toEqual(copy);
  });
});
