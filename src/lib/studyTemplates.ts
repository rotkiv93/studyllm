/**
 * Curated one-click "study modes" — prompt templates that seed the chat composer so students get a
 * well-crafted starting point instead of a blank box. Selecting one drops its `promptSeed` into the
 * composer input, which the student then edits (fills in the bracketed placeholders / pastes their
 * source) and sends.
 *
 * Shape-first, static data — same pattern as `curatedMcp.ts`. No backend, no network. To add a mode,
 * append an entry; `StudyModes.tsx` groups them by `topic`.
 */

export type StudyTopic = "reading" | "writing" | "research" | "study";

export interface StudyTemplate {
  /** Stable id (also the React key). */
  id: string;
  /** Short label shown on the chip. */
  label: string;
  /** Which topic this belongs to; drives grouping in the UI. */
  topic: StudyTopic;
  /** Plain-language tooltip explaining what the mode does. */
  description: string;
  /** Text dropped into the composer input when the chip is clicked. */
  promptSeed: string;
}

/** Group headings shown above each topic's chips. */
export const STUDY_TOPIC_LABELS: Record<StudyTopic, string> = {
  reading: "Reading & analysis",
  writing: "Writing & drafting",
  research: "Research & citations",
  study: "Study & revision",
};

export const STUDY_TEMPLATES: StudyTemplate[] = [
  // ── Reading & analysis ──────────────────────────────────────────────────────
  {
    id: "summarize",
    label: "Summarize a document",
    topic: "reading",
    description: "Condense a long report, treaty, or reading into structured key points.",
    promptSeed:
      "Summarize the following text. Give me:\n" +
      "1. A 3-sentence overview.\n" +
      "2. The key points as a bullet list.\n" +
      "3. Any important actors, dates, or obligations mentioned.\n\n" +
      "Text:\n[paste the document here]",
  },
  {
    id: "explain-treaty",
    label: "Explain a treaty / agreement",
    topic: "reading",
    description: "Break down what a treaty or agreement actually commits its parties to.",
    promptSeed:
      "Explain the treaty/agreement below in plain language. Cover: who the parties are, what each " +
      "side is obligated to do, the key terms, and any enforcement or exit mechanisms.\n\n" +
      "Text:\n[paste the treaty text or name it here]",
  },
  {
    id: "extract-entities",
    label: "Extract key facts & entities",
    topic: "reading",
    description: "Pull out people, places, dates, and organizations from a source.",
    promptSeed:
      "From the source below, extract and list: People, Places, Organizations, Dates, and any key " +
      "events — each as a bullet list. Then give a one-line note on how they relate.\n\n" +
      "Source:\n[paste the source text here]",
  },
  {
    id: "translate-summarize",
    label: "Translate & summarize a source",
    topic: "reading",
    description: "Translate a foreign-language source into English and summarize it.",
    promptSeed:
      "The source below is in [language]. Translate it into clear English, then give me a short " +
      "summary of its main argument and any key facts. Note anything that's ambiguous in the " +
      "original.\n\n" +
      "Source:\n[paste the foreign-language text here]",
  },

  // ── Writing & drafting ──────────────────────────────────────────────────────
  {
    id: "policy-brief",
    label: "Draft a policy brief",
    topic: "writing",
    description: "Turn your notes into a structured policy brief / position paper.",
    promptSeed:
      "Draft a concise policy brief from my notes below. Use this structure: Issue, Background, " +
      "Options (with pros/cons), and a Recommendation. Keep it neutral and evidence-based.\n\n" +
      "Notes:\n[paste your notes / bullet points here]",
  },
  {
    id: "compare-positions",
    label: "Compare two actors' positions",
    topic: "writing",
    description: "Side-by-side comparison of two countries' or actors' stances on an issue.",
    promptSeed:
      "Compare how [Country/Actor A] and [Country/Actor B] approach [issue]. Give me a side-by-side " +
      "table covering their official position, key interests, main arguments, and points of " +
      "tension. Note where the evidence is uncertain.",
  },

  // ── Research & citations ────────────────────────────────────────────────────
  {
    id: "lit-review-outline",
    label: "Literature-review outline",
    topic: "research",
    description: "Turn a topic and a few sources into a structured literature-review outline.",
    promptSeed:
      "Help me outline a literature review on the topic below. Organize it into themes, note where " +
      "sources agree or disagree, and flag gaps worth researching.\n\n" +
      "Topic: [your topic]\n" +
      "Sources I have so far:\n[list authors / titles, or paste abstracts]",
  },
  {
    id: "bibliography",
    label: "Format a bibliography",
    topic: "research",
    description: "Format references in APA, MLA, or Chicago style.",
    promptSeed:
      "Format the following references as a bibliography in [APA / MLA / Chicago] style, " +
      "alphabetized. Point out anything I'm missing (e.g. a publication year or page range).\n\n" +
      "References:\n[paste your references, one per line]",
  },
  {
    id: "catalog-metadata",
    label: "Catalog a document (metadata)",
    topic: "research",
    description: "Produce descriptive archival metadata for a document.",
    promptSeed:
      "Produce descriptive catalog metadata for the document below. Return these fields: Title, " +
      "Author/Creator, Date, Document type, Language, Summary (2–3 sentences), Subject keywords, " +
      "and Named entities (people, places, organizations). If a field is unknown, say 'not " +
      "stated'.\n\n" +
      "Document:\n[paste the document text here]",
  },

  // ── Study & revision ────────────────────────────────────────────────────────
  {
    id: "flashcards",
    label: "Make flashcards / quiz",
    topic: "study",
    description: "Generate study flashcards or a short quiz from a document or topic.",
    promptSeed:
      "Create [10] study flashcards from the material below, formatted as 'Q: … / A: …'. Then give " +
      "me a 5-question short quiz (no answers until I ask).\n\n" +
      "Material:\n[paste your notes or topic here]",
  },
];
