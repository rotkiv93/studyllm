import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "./Markdown";
import { buildTranscriptMarkdown, buildTranscriptPlainText } from "../lib/exportChat";

describe("Markdown LaTeX and math rendering", () => {
  it("renders inline math with KaTeX ($E = mc^2$)", () => {
    const html = renderToStaticMarkup(<Markdown text="The formula is $E = mc^2$." />);
    expect(html).toContain("katex");
    expect(html).toContain("math xmlns");
    expect(html).toContain("E = mc^2");
  });

  it("renders display math with KaTeX ($$\\sum_i x_i$$)", () => {
    const html = renderToStaticMarkup(
      <Markdown text={"Here is display math:\n\n$$\n\\sum_i x_i\n$$"} />,
    );
    expect(html).toContain("katex-display");
    expect(html).toContain("katex");
    expect(html).toContain("\\sum_i x_i");
  });

  it("renders code block math with KaTeX (```math)", () => {
    const html = renderToStaticMarkup(
      <Markdown text={"```math\n\\int_0^1 x \\, dx\n```"} />,
    );
    expect(html).toContain("katex-display");
    expect(html).toContain("katex");
  });

  it("handles streaming unclosed inline math without crashing", () => {
    // During streaming, a model may emit '$E = \\frac{1}{2' before sending the closing '$'
    const html = renderToStaticMarkup(
      <Markdown text="The energy is $E = \\frac{1}{2" />,
    );
    // Unclosed $ stays plain text without crashing or flickering
    expect(html).toContain("$E = \\frac{1}{2");
    expect(html).not.toContain("katex-error");
  });

  it("handles streaming unclosed display math without crashing", () => {
    const html = renderToStaticMarkup(
      <Markdown text={"Display formula in progress:\n\n$$\n\\sum_{i=1}^n x_i"} />,
    );
    expect(html).toBeDefined();
  });

  it("handles broken or invalid LaTeX syntax gracefully with throwOnError: false", () => {
    // Malformed LaTeX formula within closed delimiters: should not throw an exception
    expect(() => {
      const html = renderToStaticMarkup(<Markdown text="Invalid: $\\frac{1}{$" />);
      expect(html).toContain("katex-error");
    }).not.toThrow();
  });

  it("leaves single unclosed dollar signs (e.g. $100) as literal text", () => {
    const html = renderToStaticMarkup(<Markdown text="The price is $100 for this book." />);
    expect(html).toContain("$100");
    expect(html).not.toContain("katex");
  });

  it("handles escaped dollar signs (e.g. \\$20 and \\$30) without treating them as math delimiters", () => {
    const html = renderToStaticMarkup(
      <Markdown text={"The prices are \\$20 and \\$30 each."} />,
    );
    expect(html).toContain("$20 and $30");
    expect(html).not.toContain("katex");
  });

  it("preserves standard markdown features like tables, code blocks and links", () => {
    const md = `
[link](https://example.com)

\`inline code\`

\`\`\`typescript
const x: number = 42;
\`\`\`

| Item | Price |
| :--- | :---- |
| Book | $10   |
`;
    const html = renderToStaticMarkup(<Markdown text={md} />);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('class="md-inline-code"');
    expect(html).toContain("table");
    expect(html).toContain("Book");
  });
});

describe("Export and copy transcript with LaTeX source", () => {
  const messages = [
    { role: "user" as const, content: "What is mass-energy equivalence?" },
    {
      role: "assistant" as const,
      content: "It is given by $E = mc^2$, or in general relativity:\n$$\nG_{\\mu\\nu} + \\Lambda g_{\\mu\\nu} = \\kappa T_{\\mu\\nu}\n$$",
    },
  ];

  it("buildTranscriptMarkdown preserves raw LaTeX formulas intact", () => {
    const transcript = buildTranscriptMarkdown("Physics Notes", messages);
    expect(transcript).toContain("$E = mc^2$");
    expect(transcript).toContain("$$\nG_{\\mu\\nu} + \\Lambda g_{\\mu\\nu} = \\kappa T_{\\mu\\nu}\n$$");
  });

  it("buildTranscriptPlainText preserves raw LaTeX formulas intact", () => {
    const plain = buildTranscriptPlainText("Physics Notes", messages);
    expect(plain).toContain("$E = mc^2$");
    expect(plain).toContain("G_{\\mu\\nu}");
  });
});
