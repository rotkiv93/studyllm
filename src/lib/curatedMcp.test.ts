import { describe, expect, it } from "vitest";
import { CURATED_ENTRIES, CURATED_META, curatedInDisplayOrder, repairCuratedArgs } from "./curatedMcp";
import { RESEARCH_TOOL_CATALOG_IDS } from "./researchModes";

describe("repairCuratedArgs", () => {
  it("pins the mcp SDK below 2.0 for a Web Reader row installed without the pin", () => {
    expect(repairCuratedArgs("uvx", ["mcp-server-fetch"])).toEqual([
      "--with",
      "mcp<2",
      "mcp-server-fetch",
    ]);
  });

  it("leaves an already-pinned row untouched", () => {
    expect(repairCuratedArgs("uvx", ["--with", "mcp<2", "mcp-server-fetch"])).toBeNull();
  });

  it("ignores other uvx servers and every npx server", () => {
    expect(repairCuratedArgs("uvx", ["wikipedia-mcp"])).toBeNull();
    expect(repairCuratedArgs("npx", ["-y", "openalex-mcp"])).toBeNull();
  });

  it("keeps the curated Web Reader entry in sync with the repair", () => {
    const fetchEntry = CURATED_ENTRIES.find((e) => e.id === "curated:fetch");
    if (fetchEntry?.install.kind !== "uvx") throw new Error("Web Reader must stay a uvx install");
    expect(repairCuratedArgs("uvx", fetchEntry.install.args)).toBeNull();
  });
});

describe("Discover ordering", () => {
  it("describes every curated server, and only those", () => {
    expect(Object.keys(CURATED_META).sort()).toEqual(CURATED_ENTRIES.map((e) => e.id).sort());
  });

  it("puts the no-account servers before the ones that need a key", () => {
    const all = curatedInDisplayOrder();
    expect(all).toHaveLength(CURATED_ENTRIES.length);
    const firstAccount = all.findIndex((e) => CURATED_META[e.id].group === "account");
    expect(all.slice(0, firstAccount).every((e) => CURATED_META[e.id].group === "start")).toBe(true);
    expect(all.slice(firstAccount).every((e) => CURATED_META[e.id].group === "account")).toBe(true);
  });

  it("only calls a server 'start here' when it asks for no key", () => {
    for (const e of curatedInDisplayOrder("start")) {
      expect(e.requiredEnv.filter((v) => v.isRequired)).toEqual([]);
      expect(CURATED_META[e.id].needs).not.toBe("key");
    }
  });

  it("keeps the research toolset keyless and curated", () => {
    for (const id of RESEARCH_TOOL_CATALOG_IDS) expect(CURATED_META[id]?.group).toBe("start");
  });
});
