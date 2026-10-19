import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "./Markdown";

describe("Markdown math", () => {
  it("renders inline and display math with KaTeX", () => {
    const html = renderToStaticMarkup(createElement(Markdown, { text: "Inline $E=mc^2$\n\n$$\\sum_i x_i$$" }));
    expect(html).toContain('class="katex"');
    expect(html).toContain("katex-display");
  });
  it("does not throw on a broken formula", () => {
    const html = renderToStaticMarkup(createElement(Markdown, { text: "bad $\\frac{1$ ok" }));
    expect(html).toBeTruthy();
  });
  it("leaves prices alone", () => {
    const html = renderToStaticMarkup(createElement(Markdown, { text: "It costs $5 or $10." }));
    expect(html).not.toContain("katex");
    expect(html).toContain("$5 or $10");
  });
});
