/**
 * "Deep Research" modes — the orchestration layer that turns a plain chat turn into a multi-step,
 * cited investigation. A mode is essentially a **system prompt + a step budget**: it instructs the
 * model to decompose the question, use the connected web-search / page-reader / academic-search MCP
 * tools across several steps, and synthesize a sourced answer. It rides the existing agentic tool
 * loop in `providerRouter.ts` (each search/read shows up live as a `ToolCallBlock`), so there's no
 * new execution engine — only guidance and a higher `maxSteps`.
 *
 * Shape-first static data, same discipline as `studyTemplates.ts`. To add a mode, append an entry.
 */

export interface ResearchMode {
  /** Stable id / React key. */
  id: string;
  /** Short label for the picker. */
  label: string;
  /** Plain-language description of when a student would pick this. */
  description: string;
  /** System directive prepended to the turn (never persisted to the conversation). */
  systemPrompt: string;
  /** Agentic tool-loop budget for this mode (search + read + synthesize steps). */
  maxSteps: number;
}

/** Shared instructions every mode inherits — the "how to do research honestly" spine. */
const COMMON = [
  "You are in Deep Research mode. Work in visible steps using the connected tools (web search, web",
  "page reader, Wikipedia, academic search) — do not answer from memory alone.",
  "Process: (1) break the question into 2–5 focused sub-questions; (2) search the web for each;",
  "(3) open and read the most relevant/credible sources before relying on them; (4) cross-check",
  "claims across sources; (5) synthesize a clear, well-structured answer.",
  "Cite every non-obvious claim inline with the source URL, and finish with a '## Sources' list of",
  "the pages you actually used. If sources conflict or evidence is thin, say so rather than",
  "papering over it. Prefer primary and recent sources.",
].join(" ");

export const RESEARCH_MODES: ResearchMode[] = [
  {
    id: "auto",
    label: "Auto",
    description: "General multi-step research: plan, search, read, and write a cited answer.",
    systemPrompt: COMMON,
    maxSteps: 14,
  },
  {
    id: "compare",
    label: "Compare",
    description: "Weigh two or more options, positions, or actors side by side.",
    systemPrompt:
      COMMON +
      " This is a COMPARISON: identify the items being compared, research each on the same set of" +
      " criteria, and present the result as a side-by-side table followed by a short bottom-line" +
      " verdict noting where the evidence is uncertain.",
    maxSteps: 16,
  },
  {
    id: "howto",
    label: "How-to",
    description: "Build a reliable, step-by-step guide grounded in current sources.",
    systemPrompt:
      COMMON +
      " This is a HOW-TO: research the current recommended approach and produce clear numbered" +
      " steps, prerequisites, common pitfalls, and links to authoritative documentation.",
    maxSteps: 14,
  },
  {
    id: "factcheck",
    label: "Fact-check",
    description: "Verify a specific claim against multiple independent sources.",
    systemPrompt:
      COMMON +
      " This is a FACT-CHECK: state the exact claim, gather multiple INDEPENDENT sources, and give" +
      " a verdict (True / Partly true / False / Unverifiable) with the evidence and any important" +
      " nuance or context that changes the picture.",
    maxSteps: 14,
  },
  {
    id: "litreview",
    label: "Literature review",
    description: "Survey the scholarship on a topic, organized by theme.",
    systemPrompt:
      COMMON +
      " This is a LITERATURE REVIEW: lean on academic search (OpenAlex) alongside the web. Organize" +
      " findings by theme, note where sources agree or disagree, flag open gaps worth researching," +
      " and list full references at the end.",
    maxSteps: 18,
  },
];

export const DEFAULT_RESEARCH_MODE = RESEARCH_MODES[0];

/** Curated keyless MCP servers that power Deep Research (installable with no API key). */
export const RESEARCH_TOOL_CATALOG_IDS = ["curated:fetch", "curated:wikipedia", "curated:openalex"];

/**
 * Heuristic: does a running tool look like a research capability (search / fetch / reference)?
 * Used to decide whether Deep Research has anything to work with, or the student should install the
 * keyless research toolset first.
 */
export function isResearchTool(toolName: string): boolean {
  return /search|fetch|wiki|scholar|openalex|browse|web|url|http/i.test(toolName);
}
