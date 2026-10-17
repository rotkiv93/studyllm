import { afterEach, describe, it, expect, vi } from "vitest";
import { cosineSimilarity, EMBEDDING_CAPABLE, loadEmbeddingConfig, saveEmbeddingConfig } from "./embeddings";

describe("cosineSimilarity", () => {
  it("is 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
  });

  it("is 1 for parallel vectors regardless of magnitude", () => {
    expect(cosineSimilarity([1, 0, 0], [5, 0, 0])).toBeCloseTo(1, 6);
  });

  it("is 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });

  it("is -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 2], [-1, -2])).toBeCloseTo(-1, 6);
  });

  it("returns 0 for degenerate (zero-norm or mismatched-length) inputs", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([1, 2, 3], [1, 2])).toBe(0);
  });

  it("ranks a closer vector above a farther one", () => {
    const query = [1, 1, 0];
    const near = cosineSimilarity(query, [1, 0.9, 0.1]);
    const far = cosineSimilarity(query, [-1, 0.2, 1]);
    expect(near).toBeGreaterThan(far);
  });
});

describe("EMBEDDING_CAPABLE", () => {
  it("maps supported providers to a default embedding model", () => {
    expect(EMBEDDING_CAPABLE.gemini).toBeTruthy();
    expect(EMBEDDING_CAPABLE.mistral).toBeTruthy();
  });
});

describe("loadEmbeddingConfig", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubLocalStorage() {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
  }

  it("moves a saved config off the retired Gemini embedding model", () => {
    stubLocalStorage();
    saveEmbeddingConfig({ providerId: "p1", model: "text-embedding-004" });
    expect(loadEmbeddingConfig()).toEqual({ providerId: "p1", model: "gemini-embedding-001" });
  });

  it("leaves other models alone", () => {
    stubLocalStorage();
    saveEmbeddingConfig({ providerId: "p2", model: "mistral-embed" });
    expect(loadEmbeddingConfig()?.model).toBe("mistral-embed");
  });

  it("defaults Gemini to a model the API still serves", () => {
    expect(EMBEDDING_CAPABLE.gemini).toBe("gemini-embedding-001");
  });
});
