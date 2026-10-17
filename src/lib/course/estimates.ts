/**
 * Back-of-the-envelope maths behind two Course demos. They're teaching aids with labelled
 * approximations — the point is the *shape* of the numbers (model size → memory, long chats → cost),
 * not billing-grade accuracy.
 */

export type Quantization = 16 | 8 | 4;

/** Rule of thumb: weights take `bits/8` bytes per parameter, plus ~20% for the working memory. */
const VRAM_OVERHEAD = 1.2;

/**
 * Approximate GPU memory (GB) to run a model of `paramsBillions` at the given precision. At 4-bit this
 * lands on the class slide's figures: 7B ≈ 4 GB, 13B ≈ 8 GB, 70B ≈ 42 GB.
 */
export function estimateVramGb(paramsBillions: number, bits: Quantization): number {
  if (!Number.isFinite(paramsBillions) || paramsBillions <= 0) return 0;
  return Math.round(paramsBillions * (bits / 8) * VRAM_OVERHEAD * 10) / 10;
}

export type HardwareTier = "laptop" | "gamingGpu" | "workstation" | "datacenter";

/** Typical memory ceilings, used to say what kind of machine a model realistically needs. */
export function hardwareTierFor(vramGb: number): HardwareTier {
  if (vramGb <= 8) return "laptop";
  if (vramGb <= 24) return "gamingGpu";
  if (vramGb <= 80) return "workstation";
  return "datacenter";
}

/** Price per **million** tokens, in dollars. */
export interface TokenPrice {
  input: number;
  output: number;
}

/** Cost in dollars of one request. */
export function requestCost(inputTokens: number, outputTokens: number, price: TokenPrice): number {
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

export interface ConversationCost {
  /** Everything sent to the model across all turns (the history is re-sent each time). */
  inputTokens: number;
  /** Everything the model wrote. */
  outputTokens: number;
  cost: number;
}

/**
 * Cost of a chat of `turns` exchanges where each question is `promptTokens` and each answer
 * `answerTokens`. The model re-reads the whole history every turn, so turn *i* sends *i* questions and
 * *i − 1* answers — the reason long chats get expensive (and, per the slides, less sharp).
 */
export function conversationCost(
  turns: number,
  promptTokens: number,
  answerTokens: number,
  price: TokenPrice,
): ConversationCost {
  const n = Math.max(0, Math.floor(turns));
  let inputTokens = 0;
  for (let i = 1; i <= n; i++) inputTokens += i * promptTokens + (i - 1) * answerTokens;
  const outputTokens = n * answerTokens;
  return { inputTokens, outputTokens, cost: requestCost(inputTokens, outputTokens, price) };
}

/** Formats a dollar amount, keeping tiny costs readable instead of rounding them to $0.00. */
export function formatUsd(amount: number): string {
  if (amount === 0) return "$0";
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}
