import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Isolate these tests from the external models.dev catalog — capability here should come
// only from each provider's own /models metadata (or stay undefined).
vi.mock("./modelCatalog", () => ({
  fetchModelCatalog: async () => null,
  lookupToolSupport: () => undefined,
}));

import {
  clearOllamaCapsCache,
  fetchProviderModels,
  pickBestModel,
  providerModelsNeedApiKey,
  providerSupportsLiveModels,
} from "./providerModels";
import { PROVIDER_MANIFEST } from "./providers";

function mockFetchOnce(body: unknown, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      json: async () => body,
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("providerSupportsLiveModels / providerModelsNeedApiKey", () => {
  it("reports which providers have a live catalog and whether it needs a key", () => {
    expect(providerSupportsLiveModels("groq")).toBe(true);
    expect(providerModelsNeedApiKey("groq")).toBe(true);
    expect(providerSupportsLiveModels("openrouter")).toBe(true);
    expect(providerModelsNeedApiKey("openrouter")).toBe(false);
    // Newly-added providers both expose a key-gated live catalog.
    expect(providerSupportsLiveModels("nvidia")).toBe(true);
    expect(providerModelsNeedApiKey("nvidia")).toBe(true);
    expect(providerSupportsLiveModels("cohere")).toBe(true);
    expect(providerModelsNeedApiKey("cohere")).toBe(true);
    // SambaNova was dropped from the live-catalog sources.
    expect(providerSupportsLiveModels("sambanova")).toBe(false);
    // The local router lists models without a key, so it never waits for one.
    expect(providerSupportsLiveModels("omniroute")).toBe(true);
    expect(providerModelsNeedApiKey("omniroute")).toBe(false);
    expect(providerSupportsLiveModels("ollama")).toBe(true);
    expect(providerModelsNeedApiKey("ollama")).toBe(false);
  });
});

describe("fetchProviderModels", () => {
  it("returns null without hitting the network when a key is required but missing", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await fetchProviderModels("groq", "");
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("parses OpenAI-style {data: [{id}]} bodies and filters excluded keywords for groq", async () => {
    mockFetchOnce({
      data: [{ id: "llama-3.1-8b" }, { id: "whisper-large-v3" }, { id: "distil-tts" }],
    });
    const result = await fetchProviderModels("groq", "key");
    expect(result).toEqual([{ id: "llama-3.1-8b" }]);
  });

  it("lists a local OmniRoute's models without a key, from its own base URL", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "auto" }, { id: "gemini/gemini-2.5-flash" }] }),
    });
    vi.stubGlobal("fetch", fetchSpy);
    const result = await fetchProviderModels("omniroute", "", "http://localhost:3000/v1/");
    expect(fetchSpy).toHaveBeenCalledWith("http://localhost:3000/v1/models", { headers: {} });
    expect(result).toEqual([{ id: "auto" }, { id: "gemini/gemini-2.5-flash" }]);
  });

  it("falls back to OmniRoute's default address and returns null when it isn't running", async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchSpy);
    expect(await fetchProviderModels("omniroute", "")).toBeNull();
    expect(fetchSpy).toHaveBeenCalledWith("http://localhost:20128/v1/models", { headers: {} });
  });

  it("lists Ollama's installed models from /api/tags and badges tools via /api/show", async () => {
    const fetchSpy = vi.fn().mockImplementation(async (url: string, init?: { body?: string }) => {
      if (url.endsWith("/api/tags")) {
        return {
          ok: true,
          json: async () => ({ models: [{ name: "llama3.2:latest" }, { name: "gemma:2b" }, { name: "nomic-embed-text:latest" }] }),
        };
      }
      const model = JSON.parse(init?.body ?? "{}").model as string;
      return { ok: true, json: async () => ({ capabilities: model.startsWith("llama") ? ["completion", "tools"] : ["completion"] }) };
    });
    vi.stubGlobal("fetch", fetchSpy);
    const result = await fetchProviderModels("ollama", "", "http://localhost:11434/v1");
    expect(fetchSpy).toHaveBeenCalledWith("http://localhost:11434/api/tags", { headers: {} });
    expect(result).toEqual([
      { id: "gemma:2b", supportsTools: false },
      { id: "llama3.2:latest", supportsTools: true },
    ]);
  });

  it("returns null when Ollama isn't running", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    expect(await fetchProviderModels("ollama", "")).toBeNull();
  });

  it("keeps only :free-suffixed models for openrouter", async () => {
    mockFetchOnce({
      data: [{ id: "acme/model-a:free" }, { id: "acme/model-b" }, { id: "acme/model-c:free" }],
    });
    const result = await fetchProviderModels("openrouter", "");
    expect(result).toEqual([{ id: "acme/model-a:free" }, { id: "acme/model-c:free" }]);
  });

  it("reads openrouter tool support from supported_parameters", async () => {
    mockFetchOnce({
      data: [
        { id: "acme/with-tools:free", supported_parameters: ["tools", "temperature"] },
        { id: "acme/no-tools:free", supported_parameters: ["temperature"] },
      ],
    });
    const result = await fetchProviderModels("openrouter", "");
    expect(result).toEqual([
      { id: "acme/no-tools:free", supportsTools: false },
      { id: "acme/with-tools:free", supportsTools: true },
    ]);
  });

  it("reads mistral tool support from capabilities.function_calling", async () => {
    mockFetchOnce({
      data: [
        { id: "mistral-large", capabilities: { function_calling: true } },
        { id: "mistral-tiny", capabilities: { function_calling: false } },
      ],
    });
    const result = await fetchProviderModels("mistral", "key");
    expect(result).toEqual([
      { id: "mistral-large", supportsTools: true },
      { id: "mistral-tiny", supportsTools: false },
    ]);
  });

  it("dedupes and sorts ids", async () => {
    mockFetchOnce({ data: [{ id: "b-model" }, { id: "a-model" }, { id: "b-model" }] });
    const result = await fetchProviderModels("cerebras", "key");
    expect(result).toEqual([{ id: "a-model" }, { id: "b-model" }]);
  });

  it("returns null on a non-ok response", async () => {
    mockFetchOnce({}, false);
    const result = await fetchProviderModels("cerebras", "key");
    expect(result).toBeNull();
  });

  it("returns null instead of throwing when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const result = await fetchProviderModels("groq", "key");
    expect(result).toBeNull();
  });

  it("drops embedding/rerank ids for cohere", async () => {
    mockFetchOnce({
      data: [{ id: "command-a-03-2025" }, { id: "embed-v4.0" }, { id: "rerank-v3.5" }],
    });
    const result = await fetchProviderModels("cohere", "key");
    expect(result).toEqual([{ id: "command-a-03-2025" }]);
  });

  it("drops embedding/rerank ids for nvidia", async () => {
    mockFetchOnce({
      data: [
        { id: "meta/llama-3.3-70b-instruct" },
        { id: "nvidia/nv-embedqa-e5-v5" },
        { id: "nvidia/rerank-qa-mistral-4b" },
      ],
    });
    const result = await fetchProviderModels("nvidia", "key");
    expect(result).toEqual([{ id: "meta/llama-3.3-70b-instruct" }]);
  });
});

describe("pickBestModel", () => {
  it("matches Ollama's tagged ids and falls back to what is installed", () => {
    expect(pickBestModel("ollama", [{ id: "gemma:2b" }, { id: "llama3.2:latest" }])).toBe("llama3.2:latest");
    expect(pickBestModel("ollama", [{ id: "gemma:2b", supportsTools: false }])).toBe("gemma:2b");
    expect(pickBestModel("ollama", null)).toBe("llama3.2");
  });

  it("prefers a tool-capable model that's also a curated suggestion", () => {
    const result = pickBestModel("groq", [
      { id: "llama-3.1-8b-instant", supportsTools: true },
      { id: "llama-3.3-70b-versatile", supportsTools: true },
    ]);
    expect(result).toBe("llama-3.3-70b-versatile"); // curated over merely-tool-capable
  });

  it("falls back to the first tool-capable model when none are curated", () => {
    const result = pickBestModel("groq", [
      { id: "some-uncurated-model", supportsTools: true },
      { id: "another-model", supportsTools: false },
    ]);
    expect(result).toBe("some-uncurated-model");
  });

  it("falls back to the manifest default when nothing is tool-capable", () => {
    const result = pickBestModel("groq", [{ id: "x", supportsTools: false }]);
    expect(result).toBe(PROVIDER_MANIFEST.groq.defaultModel);
  });

  it("falls back to the manifest default for an empty or null list", () => {
    expect(pickBestModel("groq", [])).toBe(PROVIDER_MANIFEST.groq.defaultModel);
    expect(pickBestModel("groq", null)).toBe(PROVIDER_MANIFEST.groq.defaultModel);
  });
});

describe("Ollama listing hardening", () => {
  function ollamaFetch(names: string[], caps: string[] = ["completion", "tools"]) {
    const spy = vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      json: async () => (url.endsWith("/api/tags") ? { models: names.map((name) => ({ name })) } : { capabilities: caps }),
    }));
    vi.stubGlobal("fetch", spy);
    return spy;
  }
  const showCalls = (spy: ReturnType<typeof vi.fn>) => spy.mock.calls.filter(([u]) => String(u).endsWith("/api/show"));

  beforeEach(() => clearOllamaCapsCache());

  it("never sends Authorization to Ollama, even with the placeholder key", async () => {
    const spy = ollamaFetch(["llama3.2:latest"]);
    await fetchProviderModels("ollama", "local", "http://localhost:11434/v1");
    expect(spy.mock.calls[0][1]).toEqual({ headers: {} });
  });

  it("asks /api/show once per model until the cache is cleared", async () => {
    const spy = ollamaFetch(["llama3.2:latest"]);
    await fetchProviderModels("ollama", "", "http://localhost:11434/v1");
    await fetchProviderModels("ollama", "", "http://localhost:11434/v1");
    expect(showCalls(spy)).toHaveLength(1);
    clearOllamaCapsCache();
    await fetchProviderModels("ollama", "", "http://localhost:11434/v1");
    expect(showCalls(spy)).toHaveLength(2);
  });

  it("only asks /api/show for the first 50 models and leaves the rest unbadged", async () => {
    const names = Array.from({ length: 60 }, (_, i) => `m${String(i).padStart(2, "0")}:latest`);
    const spy = ollamaFetch(names);
    const result = await fetchProviderModels("ollama", "", "http://localhost:11434/v1");
    expect(showCalls(spy)).toHaveLength(50);
    expect(result).toHaveLength(60);
    expect(result!.filter((m) => m.supportsTools === undefined)).toHaveLength(10);
  });

  it("prefers an installed model that can use tools over one that can't", () => {
    expect(
      pickBestModel("ollama", [
        { id: "gemma:2b", supportsTools: false },
        { id: "phi3:mini", supportsTools: undefined },
      ]),
    ).toBe("phi3:mini");
  });
});
