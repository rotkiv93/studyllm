import { describe, it, expect } from "vitest";
import { isResearchServer } from "./researchModes";

describe("isResearchServer", () => {
  it("recognizes the keyless curated research servers by name", () => {
    expect(isResearchServer("Web Reader", ["fetch"])).toBe(true);
    expect(isResearchServer("Wikipedia", ["search_wikipedia", "get_article"])).toBe(true);
    expect(isResearchServer("OpenAlex — academic search", ["search_works"])).toBe(true);
    expect(isResearchServer("Brave Search", ["brave_web_search", "brave_local_search"])).toBe(true);
  });

  it("does NOT count personal/workspace connectors whose tools merely contain 'search'", () => {
    // The exact false positive that made Deep Research run with no web capability.
    expect(isResearchServer("Google Drive", ["drive_search_files", "drive_read_file"])).toBe(false);
    expect(isResearchServer("Gmail", ["gmail_search_messages", "gmail_search_threads"])).toBe(false);
    expect(isResearchServer("Filesystem", ["search_files", "read_file"])).toBe(false);
    expect(isResearchServer("Notion", ["API-post-search", "API-retrieve-a-page"])).toBe(false);
    expect(isResearchServer("GitHub", ["search_repositories", "search_code"])).toBe(false);
  });

  it("falls back to a web-research tool-name signal for unrecognized server names", () => {
    expect(isResearchServer("Some Web Tool", ["fetch_url"])).toBe(true);
    expect(isResearchServer("My Reader", ["read_url"])).toBe(true);
    expect(isResearchServer(undefined, ["arxiv_search"])).toBe(true);
    expect(isResearchServer(null, ["read_file", "list_directory"])).toBe(false);
  });

  it("prioritizes the non-web exclusion over any tool-name signal", () => {
    // A Google connector never counts even if a tool name looks web-ish.
    expect(isResearchServer("Google Drive", ["drive_fetch_web"])).toBe(false);
  });
});
