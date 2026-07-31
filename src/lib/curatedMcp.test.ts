import { describe, expect, it } from "vitest";
import { CURATED_ENTRIES, repairCuratedArgs } from "./curatedMcp";

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
