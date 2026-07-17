import { streamText, APICallError, isStepCount, type ModelMessage, type ToolSet } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { ProviderType } from "./providers";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

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
  | { kind: "exhausted"; retryInSeconds: number };

export type StreamEvent =
  | { type: "chunk"; text: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; input: unknown }
  | { type: "tool-result"; toolCallId: string; toolName: string; output: string; isError: boolean }
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

export class ProviderRouter {
  private coolingDownUntil = new Map<string, number>();
  private authDisabled = new Set<string>();

  constructor(private providers: ConfiguredProvider[]) {}

  updateProviders(providers: ConfiguredProvider[]) {
    this.providers = providers;
  }

  private candidates(): ConfiguredProvider[] {
    const now = Date.now();
    return [...this.providers]
      .filter((p) => !this.authDisabled.has(p.id))
      .filter((p) => (this.coolingDownUntil.get(p.id) ?? 0) <= now)
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
  ): AsyncGenerator<StreamEvent> {
    const messages: ModelMessage[] = history.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    let attempted = 0;
    const maxAttempts = Math.max(1, this.providers.length);

    while (attempted < maxAttempts) {
      const candidate = this.candidates()[0];
      if (!candidate) {
        const retryInSeconds = this.shortestCooldownRemainingSeconds();
        yield { type: "router", event: { kind: "exhausted", retryInSeconds } };
        return;
      }

      attempted++;
      const client = createOpenAICompatible({
        name: candidate.type,
        baseURL: candidate.baseURL,
        apiKey: candidate.apiKey,
      });

      try {
        const result = streamText({
          model: client(candidate.model),
          messages,
          abortSignal,
          ...(tools && Object.keys(tools).length > 0 ? { tools, stopWhen: isStepCount(8) } : {}),
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
      } catch (error) {
        if (abortSignal?.aborted) {
          yield { type: "done", providerId: candidate.id, providerLabel: candidate.label, model: candidate.model, estimatedTokens: 0 };
          return;
        }

        const statusCode = APICallError.isInstance(error) ? error.statusCode : undefined;

        if (statusCode === 401 || statusCode === 403) {
          this.authDisabled.add(candidate.id);
          yield {
            type: "router",
            event: { kind: "auth-error", providerId: candidate.id, providerLabel: candidate.label },
          };
        } else if (statusCode === 429) {
          this.coolingDownUntil.set(candidate.id, Date.now() + this.retryAfterMs(error));
        } else {
          // Network/5xx/unknown: short cooldown, still eligible for retry later this session.
          this.coolingDownUntil.set(candidate.id, Date.now() + DEFAULT_COOLDOWN_MS);
        }

        const next = this.candidates()[0];
        if (next) {
          yield {
            type: "router",
            event: {
              kind: "switched",
              fromLabel: candidate.label,
              toLabel: next.label,
              reason:
                statusCode === 429
                  ? "rate-limited"
                  : statusCode === 401 || statusCode === 403
                    ? "invalid key"
                    : "request failed",
            },
          };
        }
      }
    }

    const retryInSeconds = this.shortestCooldownRemainingSeconds();
    yield { type: "router", event: { kind: "exhausted", retryInSeconds } };
  }
}
