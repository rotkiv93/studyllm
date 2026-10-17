/**
 * Shapes shared by the Course's interactive labs (the chats embedded in lessons) and its calculation
 * tasks. Only structure lives here; every visible string is a locale key built from a prefix.
 */
import type { ChatMessage, StreamEvent } from "../providerRouter";

/**
 * - `chat`    — a normal conversation; the history is re-sent each turn (so the context grows).
 * - `samples` — the same prompt sent several times in parallel, to show the model is sampling.
 * - `compare` — one prompt answered by two different providers, side by side.
 * - `ab`      — two different prompts (A and B) answered side by side, to compare how they were asked.
 */
export type LabMode = "chat" | "samples" | "compare" | "ab";

export interface LabSpec {
  mode: LabMode;
  /**
   * Number of suggested prompts shown as one-click chips. Locale keys `<prefix>.s<k>`; in `ab` mode
   * each suggestion is a pair, `<prefix>.s<k>.a` and `<prefix>.s<k>.b`.
   */
  suggestions: number;
  /** Silent instruction for the model. English, because model-facing text is never localized. */
  system?: string;
  /** Show the instruction in an editable box so the student can rewrite it. */
  editableSystem?: boolean;
  /** Show a temperature slider. */
  temperature?: boolean;
  /** `samples` mode: how many parallel answers per send (default 3). */
  samples?: number;
  /** Completed sends needed before the lab counts as done (default 1). */
  runs?: number;
  /** Ask the student to confirm what they noticed once `runs` is reached (locale key `<prefix>.confirm`). */
  confirm?: boolean;
  /** `chat` mode: show how many tokens the model re-reads each turn. */
  contextMeter?: boolean;
}

/** One model call made on behalf of a lab. */
export interface LabRequest {
  history: ChatMessage[];
  system?: string;
  temperature?: number;
  /** Answer with this provider only (no failover) — used by the comparison lab. */
  providerId?: string;
}

export type RunLab = (
  request: LabRequest,
  onEvent: (e: StreamEvent) => void,
  signal: AbortSignal,
) => Promise<void>;

/** A numeric answer the student works out with the estimators, accepted inside `[min, max]`. */
export interface NumberSpec {
  min: number;
  max: number;
  /** Short unit shown beside the input ("GB", "tokens", "USD"). Not localized — it's a symbol. */
  unit: string;
}

/** Checks a typed number against its range. `low`/`high` tell the student which way to adjust. */
export function judgeNumber(spec: NumberSpec, raw: string): "ok" | "low" | "high" | "invalid" {
  // Accept a decimal comma as well as a point, since the course is in Spanish too.
  const value = Number(raw.trim().replace(",", "."));
  if (raw.trim() === "" || !Number.isFinite(value)) return "invalid";
  if (value < spec.min) return "low";
  if (value > spec.max) return "high";
  return "ok";
}
