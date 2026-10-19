import { describe, expect, it } from "vitest";
import { prepareMath } from "./mathText";

describe("prepareMath", () => {
  it("keeps inline and display math", () => {
    expect(prepareMath("Energy $E = mc^2$ here")).toBe("Energy $E = mc^2$ here");
    expect(prepareMath("$$\\sum_i x_i$$")).toBe("$$\\sum_i x_i$$");
  });
  it("escapes prices", () => {
    expect(prepareMath("It costs $5 or $10.")).toBe("It costs \\$5 or \\$10.");
    expect(prepareMath("between $5 and $10")).toBe("between \\$5 and \\$10");
  });
  it("converts \\( \\) and \\[ \\]", () => {
    expect(prepareMath("a \\(x+1\\) b")).toBe("a $x+1$ b");
    expect(prepareMath("\\[x^2\\]")).toContain("$$\nx^2\n$$");
  });
  it("leaves code alone", () => {
    expect(prepareMath("`$5` and ```\n$x\n```")).toBe("`$5` and ```\n$x\n```");
  });
  it("escapes an unfinished inline formula while streaming", () => {
    expect(prepareMath("so $x^")).toBe("so \\$x^");
  });
});
