/**
 * Pure prompt assembly for the Course's Prompt Builder.
 *
 * i18n note: the scaffolding (`Role:`, `Task:`…) and the tone/format phrasing are **model-facing**, so
 * they stay English like every other prompt in the app (research modes, RAG grounding, chat-lab
 * presets). The student's own text is inserted untouched, in whatever language they wrote it.
 */

export const PROMPT_TONES = ["informative", "professional", "friendly", "persuasive"] as const;
export const PROMPT_FORMATS = ["paragraph", "bullets", "table", "steps"] as const;

export type PromptTone = (typeof PROMPT_TONES)[number];
export type PromptFormat = (typeof PROMPT_FORMATS)[number];

const TONE_PHRASE: Record<PromptTone, string> = {
  informative: "informative and neutral",
  professional: "professional",
  friendly: "friendly and approachable",
  persuasive: "persuasive",
};

const FORMAT_PHRASE: Record<PromptFormat, string> = {
  paragraph: "a short paragraph",
  bullets: "a bulleted list",
  table: "a table",
  steps: "numbered step-by-step instructions",
};

export interface PromptParts {
  role: string;
  audience: string;
  task: string;
  tone: PromptTone;
  format: PromptFormat;
  example: string;
  rules: string;
}

/** Joins the filled-in parts, skipping empty optional ones. Tone and format always appear. */
export function composePrompt(parts: PromptParts): string {
  const lines: string[] = [];
  if (parts.role.trim()) lines.push(`Role: ${parts.role.trim()}`);
  if (parts.audience.trim()) lines.push(`Audience: ${parts.audience.trim()}`);
  if (parts.task.trim()) lines.push(`Task: ${parts.task.trim()}`);
  lines.push(`Tone: ${TONE_PHRASE[parts.tone]}`);
  lines.push(`Output format: ${FORMAT_PHRASE[parts.format]}`);
  if (parts.rules.trim()) lines.push(`Rules: ${parts.rules.trim()}`);
  if (parts.example.trim()) lines.push(`Example of what I want:\n${parts.example.trim()}`);
  return lines.join("\n");
}
