import { describe, it, expect } from "vitest";
import { projectTo2D } from "./projection";

describe("projectTo2D", () => {
  it("returns [] for no vectors and [0,0] for a single vector", () => {
    expect(projectTo2D([])).toEqual([]);
    expect(projectTo2D([[1, 2, 3]])).toEqual([[0, 0]]);
  });

  it("keeps one point per input, in order", () => {
    const out = projectTo2D([
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
    expect(out).toHaveLength(4);
    for (const p of out) expect(p).toHaveLength(2);
  });

  it("spreads variance along the dominant axis (first coordinate)", () => {
    // Points strung out along a line: the principal component captures that spread, so the
    // first projected coordinate should be monotonic (up to an overall sign flip).
    const out = projectTo2D([
      [-3, 0, 0],
      [-1, 0, 0],
      [1, 0, 0],
      [3, 0, 0],
    ]);
    const xs = out.map((p) => p[0]);
    const ascending = xs.every((x, i) => i === 0 || x >= xs[i - 1]);
    const descending = xs.every((x, i) => i === 0 || x <= xs[i - 1]);
    expect(ascending || descending).toBe(true);
    // And the endpoints are the extremes (the projection preserves the ordering of the spread).
    const spread = Math.abs(xs[3] - xs[0]);
    expect(spread).toBeGreaterThan(0);
  });

  it("places a near-duplicate close to its twin and far from a distant point", () => {
    const out = projectTo2D([
      [0, 0, 0],
      [0.01, 0, 0],
      [10, 10, 10],
    ]);
    const d = (a: [number, number], b: [number, number]) =>
      Math.hypot(a[0] - b[0], a[1] - b[1]);
    expect(d(out[0], out[1])).toBeLessThan(d(out[0], out[2]));
  });

  it("tolerates a ragged/empty row (a chunk whose embedding failed to parse) without NaNs", () => {
    const out = projectTo2D([
      [1, 2, 3],
      [], // failed-to-parse embedding
      [3, 2, 1],
    ]);
    expect(out).toHaveLength(3);
    for (const [x, y] of out) {
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
    }
  });

  it("does not throw on zero-variance (identical) input", () => {
    expect(() =>
      projectTo2D([
        [1, 1],
        [1, 1],
        [1, 1],
      ]),
    ).not.toThrow();
  });
});
