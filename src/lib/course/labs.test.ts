import { describe, expect, it } from "vitest";
import { judgeNumber } from "./labs";

const spec = { min: 14, max: 17.5, unit: "GB" };

describe("judgeNumber", () => {
  it("accepts anything inside the range, with a point or a decimal comma", () => {
    expect(judgeNumber(spec, "15.6")).toBe("ok");
    expect(judgeNumber(spec, "15,6")).toBe("ok");
    expect(judgeNumber(spec, " 14 ")).toBe("ok");
    expect(judgeNumber(spec, "17.5")).toBe("ok");
  });

  it("says which way to adjust", () => {
    expect(judgeNumber(spec, "13.9")).toBe("low");
    expect(judgeNumber(spec, "17.6")).toBe("high");
  });

  it("rejects blanks and text", () => {
    expect(judgeNumber(spec, "")).toBe("invalid");
    expect(judgeNumber(spec, "  ")).toBe("invalid");
    expect(judgeNumber(spec, "about 15")).toBe("invalid");
  });
});
