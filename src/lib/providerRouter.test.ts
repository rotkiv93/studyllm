import { beforeEach, describe, expect, it, vi } from "vitest";

const { streamTextMock } = vi.hoisted(() => ({ streamTextMock: vi.fn() }));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, streamText: streamTextMock };
});

import { APICallError } from "ai";
import { ProviderRouter, type ChatMessage, type ConfiguredProvider, type StreamEvent } from "./providerRouter";

function provider(overrides: Partial<ConfiguredProvider> & Pick<ConfiguredProvider, "id" | "label" | "priority">): ConfiguredProvider {
  return {
    type: "groq",
    apiKey: "key",
    baseURL: "https://example.com",
    model: "test-model",
    ...overrides,
  };
}

function textOnlyStream(text: string, totalTokens = 1) {
  return {
    stream: (async function* () {
      yield { type: "text-delta", text };
      yield { type: "finish", totalUsage: { totalTokens } };
    })(),
  };
}

function rateLimitError(retryAfterSeconds?: string) {
  return new APICallError({
    message: "rate limited",
    url: "https://example.com",
    requestBodyValues: {},
    statusCode: 429,
    responseHeaders: retryAfterSeconds ? { "retry-after": retryAfterSeconds } : undefined,
  });
}

function authError() {
  return new APICallError({
    message: "invalid key",
    url: "https://example.com",
    requestBodyValues: {},
    statusCode: 401,
  });
}

async function collect(gen: AsyncGenerator<StreamEvent>): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

const history: ChatMessage[] = [{ role: "user", content: "hello" }];

beforeEach(() => {
  streamTextMock.mockReset();
});

describe("ProviderRouter.streamReply", () => {
  it("streams chunks and yields a done event for a single healthy provider", async () => {
    streamTextMock.mockReturnValueOnce(textOnlyStream("hi there", 5));
    const router = new ProviderRouter([provider({ id: "p1", label: "P1", priority: 0 })]);

    const events = await collect(router.streamReply(history));

    expect(events).toEqual([
      { type: "chunk", text: "hi there" },
      { type: "done", providerId: "p1", providerLabel: "P1", model: "test-model", estimatedTokens: 5 },
    ]);
  });

  it("fails over to the next provider on a 429 and reports why it switched", async () => {
    streamTextMock
      .mockImplementationOnce(() => {
        throw rateLimitError("1");
      })
      .mockReturnValueOnce(textOnlyStream("from p2"));
    const router = new ProviderRouter([
      provider({ id: "p1", label: "P1", priority: 0 }),
      provider({ id: "p2", label: "P2", priority: 1 }),
    ]);

    const events = await collect(router.streamReply(history));

    expect(events[0]).toEqual({
      type: "router",
      event: { kind: "switched", fromLabel: "P1", toLabel: "P2", reason: "rate-limited" },
    });
    expect(events[events.length - 1]).toEqual({
      type: "done",
      providerId: "p2",
      providerLabel: "P2",
      model: "test-model",
      estimatedTokens: 1,
    });
  });

  it("permanently disables a provider on 401/403 rather than just cooling it down", async () => {
    streamTextMock.mockImplementationOnce(() => {
      throw authError();
    });
    const router = new ProviderRouter([provider({ id: "p1", label: "P1", priority: 0 })]);

    const events = await collect(router.streamReply(history));

    expect(events[0]).toEqual({
      type: "router",
      event: { kind: "auth-error", providerId: "p1", providerLabel: "P1" },
    });
    expect(router.isAuthDisabled("p1")).toBe(true);
  });

  it("reports exhausted with a retry estimate when every provider is rate-limited", async () => {
    streamTextMock.mockImplementation(() => {
      throw rateLimitError("30");
    });
    const router = new ProviderRouter([
      provider({ id: "p1", label: "P1", priority: 0 }),
      provider({ id: "p2", label: "P2", priority: 1 }),
    ]);

    const events = await collect(router.streamReply(history));

    const last = events[events.length - 1];
    expect(last?.type).toBe("router");
    if (last?.type === "router") {
      expect(last.event.kind).toBe("exhausted");
      if (last.event.kind === "exhausted") {
        expect(last.event.retryInSeconds).toBeGreaterThan(0);
      }
    }
  });

  it("skips a provider that is still cooling down and re-enables it via reenable()", async () => {
    streamTextMock
      .mockImplementationOnce(() => {
        throw rateLimitError("60");
      })
      .mockReturnValueOnce(textOnlyStream("second try"));
    const router = new ProviderRouter([provider({ id: "p1", label: "P1", priority: 0 })]);

    // First call cools p1 down for 60s (clamped to the 60s max cooldown).
    await collect(router.streamReply(history));
    router.reenable("p1");

    const events = await collect(router.streamReply(history));
    expect(events[events.length - 1]).toMatchObject({ type: "done", providerId: "p1" });
  });
});
