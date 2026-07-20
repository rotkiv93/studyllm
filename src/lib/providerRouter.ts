import { streamText, APICallError, RetryError, isStepCount, type ModelMessage, type ToolSet } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { ProviderType } from "./providers";
import type { MessageKey } from "./i18n";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Per-turn options that don't belong in the persisted conversation. `system` carries transient
 * instructions/context (a Deep Research directive, a RAG grounding block) that steer this one reply
 * without polluting saved history or the conversation title. `maxSteps` raises the agentic
 * tool-loop budget for multi-step research (default 8).
 */
export interface StreamOptions {
  system?: string;
  maxSteps?: number;
  /** Sampling temperature (typically 0–2). Undefined leaves the provider/model default untouched. */
  temperature?: number;
  /** Nucleus-sampling top-p (0–1). Undefined leaves the provider/model default untouched. */
  topP?: number;
  /** Hard cap on the tokens the model may generate this turn. Undefined = provider/model default. */
  maxOutputTokens?: number;
}

const DEFAULT_MAX_STEPS = 8;

export interface ConfiguredProvider {
  id: string;
  type: ProviderType;
  label: string;
  apiKey: string;
  baseURL: string;
  model: string;
  priority: number;
}

export type RouterEvent =
  | { kind: "switched"; fromLabel: string; toLabel: string; reason: string }
  | { kind: "auth-error"; providerId: string; providerLabel: string }
  | { kind: "exhausted"; retryInSeconds: number; toolsUnsupported: boolean };

export type StreamEvent =
  | { type: "chunk"; text: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; input: unknown }
  | { type: "tool-result"; toolCallId: string; toolName: string; output: string; isError: boolean }
  | { type: "error"; message: string }
  | { type: "router"; event: RouterEvent }
  | {
      type: "done";
      providerId: string;
      providerLabel: string;
      model: string;
      estimatedTokens: number;
    };

const DEFAULT_COOLDOWN_MS = 30_000;
const MAX_COOLDOWN_MS = 60_000;

/** Reason string carried on a "switched" event when a model rejected tool calls. */
const TOOLS_UNSUPPORTED_REASON = "model can't use tools";

/**
 * The fixed set of `switched` fail-over reasons. These are emitted as English strings on the
 * `StreamEvent` (they're also what the crash log records); the UI maps them to a localized label
 * via `routerReasonKey` rather than showing them raw.
 */
export const ROUTER_REASONS = {
  toolsUnsupported: TOOLS_UNSUPPORTED_REASON,
  invalidKey: "invalid key",
  rateLimited: "rate-limited",
  requestFailed: "request failed",
} as const;

/** Maps a `switched` event's `reason` to its i18n key, falling back to a generic failure. */
export function routerReasonKey(reason: string): MessageKey {
  switch (reason) {
    case ROUTER_REASONS.toolsUnsupported:
      return "router.reason.toolsUnsupported";
    case ROUTER_REASONS.invalidKey:
      return "router.reason.invalidKey";
    case ROUTER_REASONS.rateLimited:
      return "router.reason.rateLimited";
    default:
      return "router.reason.requestFailed";
  }
}

/**
 * True when a failed request looks like the model rejecting tool/function calls (rather
 * than a rate limit, auth, or network problem). Only meaningful when tools were actually
 * attached, so tool-free turns are never misclassified.
 */
function isToolsUnsupportedError(error: unknown, toolsAttached: boolean): boolean {
  if (!toolsAttached || !APICallError.isInstance(error)) return false;
  if (error.statusCode !== 400 && error.statusCode !== 422) return false;
  return messageIndicatesToolIssue(`${error.message} ${error.responseBody ?? ""}`);
}

function messageIndicatesToolIssue(text: string): boolean {
  // A capability gap: the model/endpoint doesn't do tool/function calling at all.
  if (!/tool|function.?call/i.test(text)) return false;
  // …but a 400 about a *specific* tool's JSON Schema (malformed parameters from some MCP server) is
  // a bad-tool problem, not a model-capability one — don't let it blacklist every provider as
  // "can't use tools" (which surfaces the misleading "None of your models can use tools"). Let it
  // fall through to a generic request failure instead.
  if (/schema|parameters|does not validate|jsonschema|not valid|invalid.*(schema|parameter)|properties\//i.test(text)) {
    return false;
  }
  return true;
}

const MAX_MALFORMED_TOOL_CALL_RETRIES = 2;

/**
 * True when the model attempted a tool call but garbled its own output format badly enough
 * that the provider's parser rejected it (Groq's `tool_use_failed`, seen from Llama 3.3: the
 * model emits a near-miss like `<function=name,{...}>` instead of well-formed JSON). This is
 * empirically a one-off generation flake, not a capability gap — the identical request often
 * succeeds immediately on retry — so it's handled as a same-candidate retry rather than being
 * misclassified as "tools unsupported" or burning the provider's cooldown.
 * Delivered as a plain `{message, type, code}` object (not an `Error`/`APICallError` instance)
 * on at least the Groq/OpenAI-compatible transport, so this checks duck-typed fields.
 */
function isMalformedToolCallError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  if (code === "tool_use_failed") return true;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && /tool_use_failed|failed to call a function/i.test(message);
}

/**
 * The AI SDK retries retryable transport errors (429/5xx) internally and, once exhausted,
 * throws a `RetryError` wrapping the underlying attempts rather than the original
 * `APICallError` — so a raw `APICallError.isInstance()`/`statusCode` check misses it entirely
 * and every retry-exhausted rate limit gets misclassified as a generic "request failed".
 * Unwrap to the last real attempt before classifying.
 */
function unwrapError(error: unknown): unknown {
  if (RetryError.isInstance(error)) return error.lastError;
  return error;
}

export class ProviderRouter {
  private coolingDownUntil = new Map<string, number>();
  private authDisabled = new Set<string>();
  /** `${providerId}:${model}` pairs a model rejected tool calls for, this session. */
  private toolIncompatible = new Set<string>();

  constructor(private providers: ConfiguredProvider[]) {}

  updateProviders(providers: ConfiguredProvider[]) {
    this.providers = providers;
  }

  private candidates(toolsAttached: boolean): ConfiguredProvider[] {
    const now = Date.now();
    return [...this.providers]
      .filter((p) => !this.authDisabled.has(p.id))
      .filter((p) => (this.coolingDownUntil.get(p.id) ?? 0) <= now)
      // Skip models known to reject tools, but only on turns that actually need tools.
      .filter((p) => !(toolsAttached && this.toolIncompatible.has(`${p.id}:${p.model}`)))
      .sort((a, b) => a.priority - b.priority);
  }

  isAuthDisabled(providerId: string): boolean {
    return this.authDisabled.has(providerId);
  }

  reenable(providerId: string) {
    this.authDisabled.delete(providerId);
    this.coolingDownUntil.delete(providerId);
  }

  private shortestCooldownRemainingSeconds(): number {
    const now = Date.now();
    const remaining = this.providers
      .filter((p) => !this.authDisabled.has(p.id))
      .map((p) => (this.coolingDownUntil.get(p.id) ?? 0) - now)
      .filter((ms) => ms > 0);
    if (remaining.length === 0) return 0;
    return Math.ceil(Math.min(...remaining) / 1000);
  }

  private retryAfterMs(error: unknown): number {
    if (APICallError.isInstance(error) && error.responseHeaders?.["retry-after"]) {
      const seconds = Number(error.responseHeaders["retry-after"]);
      if (Number.isFinite(seconds) && seconds > 0) {
        return Math.min(seconds * 1000, MAX_COOLDOWN_MS);
      }
    }
    return DEFAULT_COOLDOWN_MS;
  }

  async *streamReply(
    history: ChatMessage[],
    tools?: ToolSet,
    abortSignal?: AbortSignal,
    options?: StreamOptions,
  ): AsyncGenerator<StreamEvent> {
    const messages: ModelMessage[] = history.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    // Transient per-turn steering (research directive / RAG context) is passed to `streamText` as
    // its dedicated `system` instruction below — never as a `role:"system"` entry in `messages`
    // (the AI SDK v5+ rejects that) and never persisted to the conversation (the caller passes
    // `history` without it). `streamText` reapplies it on every step of the agentic loop.
    const systemInstruction = options?.system;
    const maxSteps = Math.max(1, options?.maxSteps ?? DEFAULT_MAX_STEPS);
    // Optional decoding knobs (from the chat "lab" controls). Each is forwarded only when set so an
    // untouched control never overrides a provider/model default. `streamText` reapplies them on
    // every step of the agentic loop, same as the system instruction.
    const { temperature, topP, maxOutputTokens } = options ?? {};

    const toolsAttached = !!tools && Object.keys(tools).length > 0;
    let attempted = 0;
    let toolsUnsupportedSeen = false;
    const maxAttempts = Math.max(1, this.providers.length);

    while (attempted < maxAttempts) {
      const candidate = this.candidates(toolsAttached)[0];
      if (!candidate) {
        const retryInSeconds = this.shortestCooldownRemainingSeconds();
        yield {
          type: "router",
          event: { kind: "exhausted", retryInSeconds, toolsUnsupported: toolsUnsupportedSeen },
        };
        return;
      }

      attempted++;
      const client = createOpenAICompatible({
        name: candidate.type,
        baseURL: candidate.baseURL,
        apiKey: candidate.apiKey,
      });

      let malformedToolCallRetries = 0;

      try {
        // Inner retry loop: only re-entered in place for a malformed-tool-call flake (same
        // candidate, no cooldown, no "switched" event) — every other failure path below
        // returns/breaks out to the outer provider-selection loop instead.
        retryCandidate: while (true) {
          const result = streamText({
            model: client(candidate.model),
            messages,
            ...(systemInstruction ? { system: systemInstruction } : {}),
            ...(temperature != null ? { temperature } : {}),
            ...(topP != null ? { topP } : {}),
            ...(maxOutputTokens != null ? { maxOutputTokens } : {}),
            abortSignal,
            ...(toolsAttached ? { tools, stopWhen: isStepCount(maxSteps) } : {}),
          });

          let estimatedTokens = 0;
          for await (const part of result.stream) {
            if (abortSignal?.aborted) {
              yield { type: "done", providerId: candidate.id, providerLabel: candidate.label, model: candidate.model, estimatedTokens };
              return;
            }
            if (part.type === "text-delta") {
              estimatedTokens += Math.ceil(part.text.length / 4);
              yield { type: "chunk", text: part.text };
            } else if (part.type === "tool-call") {
              yield {
                type: "tool-call",
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                input: part.input,
              };
            } else if (part.type === "tool-result") {
              yield {
                type: "tool-result",
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                output: typeof part.output === "string" ? part.output : JSON.stringify(part.output),
                isError: false,
              };
            } else if (part.type === "tool-error") {
              yield {
                type: "tool-result",
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                output: part.error instanceof Error ? part.error.message : String(part.error),
                isError: true,
              };
            } else if (part.type === "finish") {
              estimatedTokens = part.totalUsage?.totalTokens ?? estimatedTokens;
            } else if (part.type === "error") {
              if (isMalformedToolCallError(part.error) && malformedToolCallRetries < MAX_MALFORMED_TOOL_CALL_RETRIES) {
                malformedToolCallRetries++;
                continue retryCandidate;
              }
              // A step-level failure (e.g. the AI SDK's own retries against a rate limit or
              // transient 5xx exhausted and it gave up mid-stream). Rethrow so the same
              // classify-and-failover logic in the catch block below handles it — same as a
              // thrown pre-stream error — instead of surfacing an unrecoverable dead end that
              // skips cooldown/failover to other configured providers entirely.
              throw part.error;
            }
          }

          yield {
            type: "done",
            providerId: candidate.id,
            providerLabel: candidate.label,
            model: candidate.model,
            estimatedTokens,
          };
          return;
        }
      } catch (error) {
        if (abortSignal?.aborted) {
          yield { type: "done", providerId: candidate.id, providerLabel: candidate.label, model: candidate.model, estimatedTokens: 0 };
          return;
        }

        const effectiveError = unwrapError(error);
        const statusCode = APICallError.isInstance(effectiveError) ? effectiveError.statusCode : undefined;
        let reason: string;

        if (isToolsUnsupportedError(effectiveError, toolsAttached)) {
          // It's the model, not the provider — don't cool it down (it stays usable for
          // tool-free turns), just remember it can't do tools this session.
          this.toolIncompatible.add(`${candidate.id}:${candidate.model}`);
          toolsUnsupportedSeen = true;
          reason = TOOLS_UNSUPPORTED_REASON;
        } else if (statusCode === 401 || statusCode === 403) {
          this.authDisabled.add(candidate.id);
          yield {
            type: "router",
            event: { kind: "auth-error", providerId: candidate.id, providerLabel: candidate.label },
          };
          reason = ROUTER_REASONS.invalidKey;
        } else if (statusCode === 429) {
          this.coolingDownUntil.set(candidate.id, Date.now() + this.retryAfterMs(effectiveError));
          reason = ROUTER_REASONS.rateLimited;
        } else {
          // Network/5xx/unknown: short cooldown, still eligible for retry later this session.
          this.coolingDownUntil.set(candidate.id, Date.now() + DEFAULT_COOLDOWN_MS);
          reason = ROUTER_REASONS.requestFailed;
        }

        const next = this.candidates(toolsAttached)[0];
        if (next) {
          yield {
            type: "router",
            event: {
              kind: "switched",
              fromLabel: candidate.label,
              toLabel: next.label,
              reason,
            },
          };
        }
      }
    }

    const retryInSeconds = this.shortestCooldownRemainingSeconds();
    yield {
      type: "router",
      event: { kind: "exhausted", retryInSeconds, toolsUnsupported: toolsUnsupportedSeen },
    };
  }
}
