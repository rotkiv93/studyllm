import { describe, expect, it } from "vitest";
import { chunkText } from "./chunking";
import { fingerprint, fitToView, overlapLength, snippet } from "./ragInsights";

describe("fingerprint", () => {
  it("returns nothing for an empty vector", () => {
    expect(fingerprint([])).toEqual([]);
  });

  it("averages into the requested number of cells, scaled to [-1, 1]", () => {
    const fp = fingerprint([1, 1, -2, -2, 0.5, 0.5], 3);
    expect(fp).toHaveLength(3);
    expect(fp[1]).toBe(-1);
    expect(fp[0]).toBeCloseTo(0.5);
    expect(Math.max(...fp.map(Math.abs))).toBe(1);
  });

  it("never returns more cells than the vector has numbers", () => {
    expect(fingerprint([0.2, 0.4], 48)).toHaveLength(2);
  });

  it("copes with an all-zero vector", () => {
    expect(fingerprint([0, 0, 0, 0], 2)).toEqual([0, 0]);
  });
});

describe("snippet", () => {
  it("collapses whitespace and leaves short text alone", () => {
    expect(snippet("a  b\n\nc")).toBe("a b c");
  });

  it("cuts long text on a word boundary with an ellipsis", () => {
    const out = snippet("word ".repeat(100), 22);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(23);
    expect(out).not.toMatch(/wor…$/);
  });
});

describe("overlapLength", () => {
  it("finds the text a chunk repeats from its predecessor", () => {
    expect(overlapLength("hello brave new world", "new world and more", 50)).toBe("new world".length);
  });

  it("is zero when nothing repeats", () => {
    expect(overlapLength("abc", "xyz", 50)).toBe(0);
  });

  it("agrees with what chunkText really produces", () => {
    const text = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} says something.`).join(" ");
    const chunks = chunkText(text, { size: 200, overlap: 60 });
    expect(chunks.length).toBeGreaterThan(2);
    for (let i = 1; i < chunks.length; i++) {
      const len = overlapLength(chunks[i - 1].text, chunks[i].text, 60);
      expect(len).toBeGreaterThan(0);
      expect(len).toBeLessThanOrEqual(60);
    }
  });
});

describe("fitToView", () => {
  it("centres points inside the padded box with a uniform scale", () => {
    const out = fitToView([[0, 0], [10, 0], [10, 5]], 100, 10);
    for (const p of out) {
      expect(p.x).toBeGreaterThanOrEqual(10 - 1e-9);
      expect(p.x).toBeLessThanOrEqual(90 + 1e-9);
      expect(p.y).toBeGreaterThanOrEqual(10 - 1e-9);
      expect(p.y).toBeLessThanOrEqual(90 + 1e-9);
    }
    expect(out[1].x - out[0].x).toBeCloseTo(80);
  });

  it("flips y and tolerates a single point", () => {
    expect(fitToView([[0, 0], [0, 10]])[1].y).toBeLessThan(fitToView([[0, 0], [0, 10]])[0].y);
    expect(fitToView([[3, 3]])).toEqual([{ x: 50, y: 50 }]);
    expect(fitToView([])).toEqual([]);
  });
});
