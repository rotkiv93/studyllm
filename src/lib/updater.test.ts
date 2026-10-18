import { describe, expect, it } from "vitest";
import { progressPercent } from "./updater";

describe("progressPercent", () => {
  it("rounds downloaded/total to a percentage", () => {
    expect(progressPercent({ downloaded: 1, total: 3 })).toBe(33);
    expect(progressPercent({ downloaded: 50, total: 100 })).toBe(50);
  });

  it("clamps to 100", () => {
    expect(progressPercent({ downloaded: 120, total: 100 })).toBe(100);
  });

  it("is null when the total size is unknown", () => {
    expect(progressPercent({ downloaded: 10, total: null })).toBeNull();
    expect(progressPercent({ downloaded: 10, total: 0 })).toBeNull();
  });
});
