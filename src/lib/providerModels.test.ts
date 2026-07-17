import { afterEach, describe, expect, it, vi } from "vitest";

// Isolate these tests from the external models.dev catalog — capability here should come
// only from each provider's own /models metadata (or stay undefined).
vi.mock("./modelCatalog", () => ({
  fetchModelCatalog: async () => null,
  lookupToolSupport: () => undefined,
}));

import {
  fetchProviderModels,
  providerModelsNeedApiKey,
  providerSupportsLiveModels,
} from "./providerModels";

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
});
