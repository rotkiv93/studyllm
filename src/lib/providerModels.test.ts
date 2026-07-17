import { afterEach, describe, expect, it, vi } from "vitest";
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
    expect(result).toEqual(["llama-3.1-8b"]);
  });

  it("keeps only :free-suffixed models for openrouter", async () => {
    mockFetchOnce({
      data: [{ id: "acme/model-a:free" }, { id: "acme/model-b" }, { id: "acme/model-c:free" }],
    });
    const result = await fetchProviderModels("openrouter", "");
    expect(result).toEqual(["acme/model-a:free", "acme/model-c:free"]);
  });

  it("dedupes and sorts ids", async () => {
    mockFetchOnce({ data: [{ id: "b-model" }, { id: "a-model" }, { id: "b-model" }] });
    const result = await fetchProviderModels("cerebras", "key");
    expect(result).toEqual(["a-model", "b-model"]);
  });

  it("returns null on a non-ok response", async () => {
    mockFetchOnce({}, false);
    const result = await fetchProviderModels("cerebras", "key");
    expect(result).toBeNull();
  });

  it("returns null instead of throwing when fetch rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("offline")),
    );
    const result = await fetchProviderModels("groq", "key");
    expect(result).toBeNull();
  });
});
