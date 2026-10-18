/**
 * Practice quiz — generate questions from Library passages, parse the model's JSON, grade answers.
 *
 * Everything here is pure (prompt building + parsing + scoring) so it can be unit-tested; the model
 * call and persistence live in the caller. Prompts are English by the i18n rule (model-facing).
 * The JSON schema is deliberately tiny and the parser tolerant, because the target models are
 * small free-tier ones that wrap JSON in code fences or chatter around it.
 */

export type QuizKind = "choice" | "short" | "mixed";

/** A numbered excerpt handed to the model; questions point back at it by `index`. */
export interface QuizPassage {
  /** 1-based number shown to the model as `[n]`. */
  index: number;
  documentName: string;
  seq: number;
  text: string;
}

export interface QuizQuestion {
  type: "choice" | "short";
  question: string;
  /** Multiple choice only. */
  options?: string[];
  /** Multiple choice: index into `options`. */
  answerIndex?: number;
  /** Short answer: the reference answer the grader compares against. */
  answer?: string;
  explanation: string;
  /** The supporting passage (1-based, as in the prompt). */
  passage: number;
}

export interface QuizResult {
  /** The student's reply: option index as text for choice, free text for short answers. */
  response: string;
  correct: boolean;
  /** Short answers only: the AI grader's comment. */
  feedback?: string;
}

/** Cap per passage and per quiz so the prompt fits small context windows. */
export const QUIZ_MAX_PASSAGES = 8;
const PASSAGE_CHAR_CAP = 1200;

/** Pick up to `max` passages spread evenly across the document so the quiz covers all of it. */
export function selectPassages<T>(items: T[], max: number = QUIZ_MAX_PASSAGES): T[] {
  if (items.length <= max) return items;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(items[Math.floor((i * items.length) / max)]);
  return out;
}

export function numberPassages(
  chunks: { documentName: string; seq: number; text: string }[],
): QuizPassage[] {
  return chunks.map((c, i) => ({
    index: i + 1,
    documentName: c.documentName,
    seq: c.seq,
    text: c.text.length > PASSAGE_CHAR_CAP ? c.text.slice(0, PASSAGE_CHAR_CAP) : c.text,
  }));
}

export function buildQuizSystem(passages: QuizPassage[], count: number, kind: QuizKind): string {
  const typeRule =
    kind === "choice"
      ? 'Every question must have "type":"choice".'
      : kind === "short"
        ? 'Every question must have "type":"short".'
        : 'Mix "type":"choice" and "type":"short" questions.';
  const body = passages.map((p) => `[${p.index}] (${p.documentName} #${p.seq})\n${p.text}`).join("\n\n");
  return (
    "You write practice quiz questions for a student, based ONLY on the passages below. " +
    "Never ask about anything the passages do not say, and never use outside knowledge.\n" +
    `Write exactly ${count} questions. ${typeRule}\n` +
    "Reply with JSON only, no other text, in this shape:\n" +
    '{"questions":[{"type":"choice","question":"...","options":["...","...","...","..."],"answer":0,' +
    '"explanation":"one line","passage":1},' +
    '{"type":"short","question":"...","answer":"reference answer","explanation":"one line","passage":2}]}\n' +
    'For "choice": exactly 4 options and "answer" is the 0-based index of the correct one. ' +
    'For "short": "answer" is a brief reference answer. ' +
    '"passage" is the number of the passage that supports the answer. ' +
    "Write the questions in the same language as the passages.\n\n" +
    "=== Passages ===\n" +
    body
  );
}

export const QUIZ_USER_PROMPT = "Write the quiz now.";

/** Strip ```json fences and surrounding chatter, returning the JSON text (or null). */
export function extractJson(raw: string): string | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = (fenced ? fenced[1] : raw).trim();
  const starts = [text.indexOf("{"), text.indexOf("[")].filter((i) => i >= 0);
  if (starts.length === 0) return null;
  const start = Math.min(...starts);
  const open = text[start];
  const end = text.lastIndexOf(open === "{" ? "}" : "]");
  return end > start ? text.slice(start, end + 1) : null;
}

function asInt(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v.trim()) : v;
  return typeof n === "number" && Number.isInteger(n) ? n : null;
}

/**
 * Parse the model's quiz reply. Invalid questions are dropped (not fatal); a passage number outside
 * the range falls back to the first passage so every question still links to a source.
 */
export function parseQuiz(raw: string, passageCount: number): QuizQuestion[] {
  const json = extractJson(raw);
  if (!json) return [];
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return [];
  }
  const list = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { questions?: unknown }).questions)
      ? (data as { questions: unknown[] }).questions
      : [];
  const out: QuizQuestion[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const q = item as Record<string, unknown>;
    const question = typeof q.question === "string" ? q.question.trim() : "";
    if (!question) continue;
    const explanation = typeof q.explanation === "string" ? q.explanation.trim() : "";
    const p = asInt(q.passage);
    const passage = p !== null && p >= 1 && p <= passageCount ? p : 1;

    const options = Array.isArray(q.options)
      ? q.options.filter((o): o is string => typeof o === "string" && o.trim() !== "").map((o) => o.trim())
      : [];
    if (q.type !== "short" && options.length >= 2) {
      const idx = asInt(q.answer);
      if (idx === null || idx < 0 || idx >= options.length) continue;
      out.push({ type: "choice", question, options, answerIndex: idx, explanation, passage });
    } else {
      const answer = typeof q.answer === "string" ? q.answer.trim() : "";
      if (!answer) continue;
      out.push({ type: "short", question, answer, explanation, passage });
    }
  }
  return out;
}

export function buildGradeSystem(): string {
  return (
    "You grade a student's short answer against a source passage. Judge only by what the passage says; " +
    "accept different wording if the meaning is right. Reply with JSON only: " +
    '{"correct":true,"feedback":"one short sentence"}'
  );
}

export function buildGradePrompt(q: QuizQuestion, passage: QuizPassage, studentAnswer: string): string {
  return (
    `Passage:\n${passage.text}\n\nQuestion: ${q.question}\nReference answer: ${q.answer ?? ""}\n` +
    `Student's answer: ${studentAnswer}`
  );
}

export function parseGrade(raw: string): { correct: boolean; feedback: string } | null {
  const json = extractJson(raw);
  if (!json) return null;
  try {
    const d = JSON.parse(json) as { correct?: unknown; feedback?: unknown };
    const correct = d.correct === true || d.correct === "true";
    if (!correct && d.correct !== false && d.correct !== "false") return null;
    return { correct, feedback: typeof d.feedback === "string" ? d.feedback.trim() : "" };
  } catch {
    return null;
  }
}

export function scoreQuiz(results: (QuizResult | undefined)[]): { correct: number; total: number } {
  return { correct: results.filter((r) => r?.correct).length, total: results.length };
}
