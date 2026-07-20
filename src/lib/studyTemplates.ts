/**
 * Curated one-click "study modes" — prompt templates that seed the chat composer so students get a
 * well-crafted starting point instead of a blank box. Selecting one drops its `promptSeed` into the
 * composer input, which the student then edits (fills in the bracketed placeholders / pastes their
 * source) and sends.
 *
 * Shape-first, static data — same pattern as `curatedMcp.ts`. No backend, no network. To add a mode,
 * append an entry here **and** add its two localized UI strings (`study.tpl.<id>.label`,
 * `.description`) to `locales/es.ts` + `locales/en.ts`; `StudyModes.tsx` groups them by `topic`.
 *
 * **`promptSeed` deliberately lives here and is NOT localized.** It's model-facing text: it lands in
 * the composer and is sent to the LLM. i18n in this app is interface-level only — chip labels and
 * tooltips translate, the prompt itself does not. The student is free to rewrite the seed in any
 * language before sending; the model follows whatever they write.
 */

import type { MessageKey } from "./i18n";

export type StudyTopic = "reading" | "writing" | "research" | "study";

export interface StudyTemplate {
  /** Stable id (also the React key, and the prefix of its i18n keys). */
  id: string;
  /** Which topic this belongs to; drives grouping in the UI. */
  topic: StudyTopic;
  /** Text dropped into the composer input when the chip is clicked. Never translated — see above. */
  promptSeed: string;
  /** Shown in the compact starter row on the empty screen; the rest live behind "Browse all". */
  featured?: boolean;
}

/** i18n key for a topic group heading. */
export function topicLabelKey(topic: StudyTopic): MessageKey {
  return `study.topic.${topic}` as MessageKey;
}

/** i18n keys for a template's *UI* text. The prompt seed is not among them — it stays untranslated. */
export function templateKeys(id: string): { label: MessageKey; description: MessageKey } {
  return {
    label: `study.tpl.${id}.label` as MessageKey,
    description: `study.tpl.${id}.description` as MessageKey,
  };
}

export const STUDY_TEMPLATES: StudyTemplate[] = [
  // ── Reading & analysis ──────────────────────────────────────────────────────
  {
    id: "summarize",
    topic: "reading",
    featured: true,
    promptSeed:
      "Summarize the following text. Give me:\n" +
      "1. A 3-sentence overview.\n" +
      "2. The key points as a bullet list.\n" +
      "3. Any important actors, dates, or obligations mentioned.\n\n" +
      "Text:\n[paste the document here]",
  },
  {
    id: "explain-treaty",
    topic: "reading",
    promptSeed:
      "Explain the treaty/agreement below in plain language. Cover: who the parties are, what each " +
      "side is obligated to do, the key terms, and any enforcement or exit mechanisms.\n\n" +
      "Text:\n[paste the treaty text or name it here]",
  },
  {
    id: "extract-entities",
    topic: "reading",
    promptSeed:
      "From the source below, extract and list: People, Places, Organizations, Dates, and any key " +
      "events — each as a bullet list. Then give a one-line note on how they relate.\n\n" +
      "Source:\n[paste the source text here]",
  },
  {
    id: "translate-summarize",
    topic: "reading",
    promptSeed:
      "The source below is in [language]. Translate it into clear English, then give me a short " +
      "summary of its main argument and any key facts. Note anything that's ambiguous in the " +
      "original.\n\n" +
      "Source:\n[paste the foreign-language text here]",
  },

  // ── Writing & drafting ──────────────────────────────────────────────────────
  {
    id: "policy-brief",
    topic: "writing",
    featured: true,
    promptSeed:
      "Draft a concise policy brief from my notes below. Use this structure: Issue, Background, " +
      "Options (with pros/cons), and a Recommendation. Keep it neutral and evidence-based.\n\n" +
      "Notes:\n[paste your notes / bullet points here]",
  },
  {
    id: "compare-positions",
    topic: "writing",
    promptSeed:
      "Compare how [Country/Actor A] and [Country/Actor B] approach [issue]. Give me a side-by-side " +
      "table covering their official position, key interests, main arguments, and points of " +
      "tension. Note where the evidence is uncertain.",
  },

  // ── Research & citations ────────────────────────────────────────────────────
  {
    id: "lit-review-outline",
    topic: "research",
    featured: true,
    promptSeed:
      "Help me outline a literature review on the topic below. Organize it into themes, note where " +
      "sources agree or disagree, and flag gaps worth researching.\n\n" +
      "Topic: [your topic]\n" +
      "Sources I have so far:\n[list authors / titles, or paste abstracts]",
  },
  {
    id: "bibliography",
    topic: "research",
    promptSeed:
      "Format the following references as a bibliography in [APA / MLA / Chicago] style, " +
      "alphabetized. Point out anything I'm missing (e.g. a publication year or page range).\n\n" +
      "References:\n[paste your references, one per line]",
  },
  {
    id: "catalog-metadata",
    topic: "research",
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
    topic: "study",
    featured: true,
    promptSeed:
      "Create [10] study flashcards from the material below, formatted as 'Q: … / A: …'. Then give " +
      "me a 5-question short quiz (no answers until I ask).\n\n" +
      "Material:\n[paste your notes or topic here]",
  },
];
