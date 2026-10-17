import { describe, expect, it } from "vitest";
import {
  conversationCost,
  estimateVramGb,
  formatUsd,
  hardwareTierFor,
  requestCost,
} from "./estimates";

describe("estimateVramGb", () => {
  it("matches the class slide's figures at 4-bit", () => {
    expect(estimateVramGb(7, 4)).toBeCloseTo(4.2, 1);
    expect(estimateVramGb(13, 4)).toBeCloseTo(7.8, 1);
    expect(estimateVramGb(70, 4)).toBeCloseTo(42, 1);
  });

  it("doubles with each step up in precision", () => {
    expect(estimateVramGb(7, 8)).toBeCloseTo(estimateVramGb(7, 4) * 2, 1);
    expect(estimateVramGb(7, 16)).toBeCloseTo(estimateVramGb(7, 4) * 4, 1);
  });

  it("returns 0 for nonsense input rather than NaN", () => {
    expect(estimateVramGb(0, 4)).toBe(0);
    expect(estimateVramGb(-3, 4)).toBe(0);
    expect(estimateVramGb(Number.NaN, 4)).toBe(0);
  });
});

describe("hardwareTierFor", () => {
  it("buckets by memory", () => {
    expect(hardwareTierFor(4)).toBe("laptop");
    expect(hardwareTierFor(16)).toBe("gamingGpu");
    expect(hardwareTierFor(42)).toBe("workstation");
    expect(hardwareTierFor(200)).toBe("datacenter");
  });
});

describe("requestCost", () => {
  it("charges input and output at their own per-million prices", () => {
    // 1M in at $3 + 1M out at $15.
    expect(requestCost(1_000_000, 1_000_000, { input: 3, output: 15 })).toBe(18);
    expect(requestCost(1000, 500, { input: 3, output: 15 })).toBeCloseTo(0.0105, 6);
  });
});

describe("conversationCost", () => {
  const price = { input: 1, output: 1 };

  it("re-sends the growing history every turn", () => {
    // 3 turns, 100-token questions, 200-token answers:
    // turn1 100, turn2 200+200, turn3 300+400 → 1200 in; 600 out.
    const c = conversationCost(3, 100, 200, price);
    expect(c.inputTokens).toBe(1200);
    expect(c.outputTokens).toBe(600);
  });

  it("grows faster than linearly with the number of turns", () => {
    const ten = conversationCost(10, 100, 200, price).inputTokens;
    const twenty = conversationCost(20, 100, 200, price).inputTokens;
    expect(twenty).toBeGreaterThan(ten * 3);
  });

  it("is zero for no turns", () => {
    expect(conversationCost(0, 100, 200, price)).toEqual({ inputTokens: 0, outputTokens: 0, cost: 0 });
  });
});

describe("formatUsd", () => {
  it("keeps tiny amounts readable", () => {
    expect(formatUsd(0)).toBe("$0");
    expect(formatUsd(0.0042)).toBe("$0.0042");
    expect(formatUsd(1.234)).toBe("$1.23");
  });
});
