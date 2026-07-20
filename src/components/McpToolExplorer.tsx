import { useRef, useState } from "react";
import { IconSearch, IconLoader, IconStop, IconCheck, IconX } from "./icons";
import type { McpToolInfo } from "../lib/mcp";
import { routerReasonKey, type StreamEvent } from "../lib/providerRouter";
import { useT } from "../lib/i18n";

/**
 * The "How does it use tools? (MCP)" playground — gives MCP the same glass-box treatment RAG got.
 *
 * Two halves:
 *   1. A plain-language *schema* view of a connected tool — what it's called, what it does, and what
 *      inputs it needs — so a student sees a tool is just "a function the model is allowed to ask
 *      for, with a name and some blanks to fill in." This needs no API key.
 *   2. A live "watch the model decide" run: the student asks something, and the trace shows the
 *      model choosing a tool, the exact request it sends (the blanks it filled in), and the raw
 *      result that comes back — the request/response loop that MCP actually is.
 */

export interface ExplorerServer {
  id: string;
  name: string;
  tools: McpToolInfo[];
}

type TraceItem =
  | { kind: "text"; text: string }
  | { kind: "call"; id: string; tool: string; input: unknown; output?: string; isError?: boolean }
  | { kind: "note"; text: string };

/** Pull a readable {name, type, required} list out of a JSON-Schema `inputSchema`. */
function describeParams(
  schema: Record<string, unknown>,
): { name: string; type: string; required: boolean; description?: string }[] {
  const props = (schema?.properties as Record<string, Record<string, unknown>> | undefined) ?? {};
  const required = new Set((schema?.required as string[] | undefined) ?? []);
  return Object.entries(props).map(([name, spec]) => ({
    name,
    type: typeof spec.type === "string" ? spec.type : "any",
    required: required.has(name),
    description: typeof spec.description === "string" ? spec.description : undefined,
  }));
}

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function McpToolExplorer({
  servers,
  hasProviders,
  onRunToolProbe,
}: {
  servers: ExplorerServer[];
  hasProviders: boolean;
  onRunToolProbe: (
    question: string,
    serverId: string,
    onEvent: (e: StreamEvent) => void,
    signal: AbortSignal,
  ) => Promise<void>;
}) {
  const t = useT();
  const [selectedId, setSelectedId] = useState<string>(servers[0]?.id ?? "");
  const [question, setQuestion] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trace, setTrace] = useState<TraceItem[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const selected = servers.find((s) => s.id === selectedId) ?? servers[0];

  if (servers.length === 0) {
    return (
      <div className="explore-body">
        <p className="notice">{t("toolExplorer.noServers")}</p>
      </div>
    );
  }

  async function run() {
    if (!question.trim() || running || !selected) return;
    setError(null);
    setTrace([]);
    setRunning(true);
    const controller = new AbortController();
    abortRef.current = controller;

    const append = (item: TraceItem) => setTrace((prev) => mergeTrace(prev, item));

    try {
      await onRunToolProbe(
        question.trim(),
        selected.id,
        (e) => {
          if (e.type === "chunk") append({ kind: "text", text: e.text });
          else if (e.type === "tool-call")
            append({ kind: "call", id: e.toolCallId, tool: e.toolName, input: e.input });
          else if (e.type === "tool-result")
            append({ kind: "call", id: e.toolCallId, tool: e.toolName, input: undefined, output: e.output, isError: e.isError });
          else if (e.type === "router" && e.event.kind === "switched")
            append({
              kind: "note",
              text: t("toolExplorer.switched", {
                reason: t(routerReasonKey(e.event.reason)),
              }),
            });
          else if (e.type === "error") setError(e.message);
        },
        controller.signal,
      );
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : t("toolExplorer.runFailed"));
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
    setRunning(false);
  }

  return (
    <div className="explore-body">
      <p className="settings-hint">{t("toolExplorer.intro")}</p>

      {servers.length > 1 && (
        <div className="tool-explorer-picker">
          <span className="token-examples-label">{t("toolExplorer.server")}</span>
          {servers.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`btn btn-sm ${s.id === selectedId ? "btn-secondary" : "btn-ghost"}`}
              onClick={() => setSelectedId(s.id)}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      <div className="tool-schema-list">
        {selected?.tools.map((tool) => {
          const params = describeParams(tool.inputSchema);
          return (
            <div key={tool.name} className="tool-schema-card">
              <div className="tool-schema-name">{tool.name}</div>
              {tool.description && <p className="tool-schema-desc">{tool.description}</p>}
              {params.length > 0 ? (
                <ul className="tool-schema-params">
                  {params.map((p) => (
                    <li key={p.name} className="tool-schema-param">
                      <code>{p.name}</code>
                      <span className="tool-schema-type">{p.type}</span>
                      {p.required && (
                        <span className="tool-schema-required">{t("toolExplorer.required")}</span>
                      )}
                      {p.description && <span className="tool-schema-param-desc">{p.description}</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="tool-schema-desc tool-schema-noargs">{t("toolExplorer.noInputs")}</p>
              )}
            </div>
          );
        })}
      </div>

      {!hasProviders ? (
        <p className="notice">{t("toolExplorer.needProvider")}</p>
      ) : (
        <>
          <div className="explore-query">
            <textarea
              className="explore-query-input"
              placeholder={t("toolExplorer.placeholder", { name: selected?.name ?? "" })}
              value={question}
              onChange={(e) => setQuestion(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void run();
                }
              }}
              rows={2}
              disabled={running}
            />
            {running ? (
              <button type="button" className="btn btn-secondary btn-sm explore-run" onClick={stop}>
                <IconStop size={14} /> {t("toolExplorer.stop")}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-sm explore-run"
                onClick={() => void run()}
                disabled={!question.trim()}
              >
                <IconSearch size={14} /> {t("toolExplorer.run")}
              </button>
            )}
          </div>

          {error && <p className="error">{error}</p>}

          {trace.length > 0 && (
            <div className="tool-trace">
              {trace.map((item, i) => {
                if (item.kind === "text") {
                  return item.text.trim() ? (
                    <p key={i} className="tool-trace-text">
                      {item.text}
                    </p>
                  ) : null;
                }
                if (item.kind === "note") {
                  return (
                    <p key={i} className="tool-trace-note">
                      {item.text}
                    </p>
                  );
                }
                const done = item.output !== undefined;
                return (
                  <div key={i} className="tool-trace-call">
                    <div className="tool-trace-call-head">
                      <span className={`tool-trace-status${item.isError ? " tool-trace-status-err" : done ? " tool-trace-status-ok" : ""}`}>
                        {done ? item.isError ? <IconX size={12} /> : <IconCheck size={12} /> : <IconLoader size={12} />}
                      </span>
                      <span className="tool-trace-call-name">
                        {t("toolExplorer.modelAsked")} <code>{item.tool}</code>
                      </span>
                    </div>
                    {item.input !== undefined && (
                      <div className="tool-trace-io">
                        <span className="tool-trace-io-label">{t("toolExplorer.itSent")}</span>
                        <pre className="tool-trace-pre">{prettyJson(item.input)}</pre>
                      </div>
                    )}
                    {done && (
                      <div className="tool-trace-io">
                        <span className="tool-trace-io-label">
                          {item.isError
                            ? t("toolExplorer.toolError")
                            : t("toolExplorer.toolAnswered")}
                        </span>
                        <pre className="tool-trace-pre">{item.output}</pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Fold a streamed item into the trace. A `tool-call` and its later `tool-result` share a
 * `toolCallId`, so the result is merged onto the existing call item (input + output shown together)
 * rather than appended as a separate block.
 */
function mergeTrace(prev: TraceItem[], item: TraceItem): TraceItem[] {
  if (item.kind === "call") {
    const idx = prev.findIndex((p) => p.kind === "call" && p.id === item.id);
    if (idx >= 0) {
      const existing = prev[idx] as Extract<TraceItem, { kind: "call" }>;
      const merged: TraceItem = {
        kind: "call",
        id: item.id,
        tool: item.tool || existing.tool,
        input: item.input !== undefined ? item.input : existing.input,
        output: item.output !== undefined ? item.output : existing.output,
        isError: item.isError !== undefined ? item.isError : existing.isError,
      };
      const next = [...prev];
      next[idx] = merged;
      return next;
    }
  }
  // Merge consecutive text chunks into one paragraph so streaming doesn't create one node per token.
  if (item.kind === "text") {
    const last = prev[prev.length - 1];
    if (last && last.kind === "text") {
      return [...prev.slice(0, -1), { kind: "text", text: last.text + item.text }];
    }
  }
  return [...prev, item];
}
