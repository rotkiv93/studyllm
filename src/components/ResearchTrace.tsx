import { useRef, useState } from "react";
import { IconSearch, IconLoader, IconCheck, IconX, IconStop } from "./icons";
import { Markdown } from "./Markdown";
import {
  RESEARCH_MODES,
  DEFAULT_RESEARCH_MODE,
  type ResearchMode,
} from "../lib/researchModes";
import type { StreamEvent } from "../lib/providerRouter";

/**
 * The Research-process tab of the Explore panel — a live trace of a Deep Research run. The student
 * asks a big question and *watches* the assistant work: break it into parts, search, read sources,
 * and synthesize a cited answer. It reuses the exact `streamReply` machinery chat uses (via the
 * `onRun` prop) — no separate engine — and maps the streamed events onto a six-stage research
 * pipeline (sub-questions → search → read → synthesize → cited report), plus a step-budget progress
 * bar and a live "sources consulted" list (the structured source view the chat transcript lacks).
 */

interface ResearchTraceProps {
  hasResearchTools: boolean;
  installingTools: boolean;
  onInstallTools: () => Promise<void>;
  onRun: (
    question: string,
    mode: ResearchMode,
    onEvent: (e: StreamEvent) => void,
    signal: AbortSignal,
  ) => Promise<void>;
}

const STAGES = [
  "Your question",
  "Sub-questions",
  "Search the web",
  "Read sources",
  "Synthesize",
  "Cited report",
];

interface TraceSource {
  id: string;
  tool: string;
  label: string;
  status: "pending" | "done" | "error";
  chars: number;
}

/** Decode the sanitized `t{serverId}_{tool}` key back to a readable tool name. */
function readableTool(key: string): string {
  const withoutPrefix = key.startsWith("t") ? key.slice(1) : key;
  const sep = withoutPrefix.indexOf("_");
  return sep === -1 ? key : withoutPrefix.slice(sep + 1);
}

/** Pull a short human label out of a tool-call input (the search query or URL it's fetching). */
function describeInput(input: unknown): string {
  if (typeof input === "string") return input.slice(0, 120);
  if (input && typeof input === "object") {
    const o = input as Record<string, unknown>;
    for (const key of ["query", "q", "search_query", "title", "topic", "url", "link"]) {
      const v = o[key];
      if (typeof v === "string" && v.trim()) return v.slice(0, 120);
    }
    try {
      return JSON.stringify(input).slice(0, 120);
    } catch {
      return "…";
    }
  }
  return "…";
}

export function ResearchTrace({
  hasResearchTools,
  installingTools,
  onInstallTools,
  onRun,
}: ResearchTraceProps) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<ResearchMode>(DEFAULT_RESEARCH_MODE);
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState(0);
  const [toolSteps, setToolSteps] = useState(0);
  const [sources, setSources] = useState<TraceSource[]>([]);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [switched, setSwitched] = useState<string | null>(null);
  const [done, setDone] = useState<{ providerLabel: string; model: string } | null>(null);

  const sawResult = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const advance = (to: number) => setStage((s) => Math.max(s, to));

  function handleEvent(e: StreamEvent) {
    switch (e.type) {
      case "chunk":
        setAnswer((a) => a + e.text);
        advance(sawResult.current ? 4 : 1);
        break;
      case "tool-call":
        setToolSteps((n) => n + 1);
        setSources((prev) => [
          ...prev,
          { id: e.toolCallId, tool: readableTool(e.toolName), label: describeInput(e.input), status: "pending", chars: 0 },
        ]);
        advance(2);
        break;
      case "tool-result":
        sawResult.current = true;
        setSources((prev) =>
          prev.map((s) =>
            s.id === e.toolCallId
              ? { ...s, status: e.isError ? "error" : "done", chars: e.output.length }
              : s,
          ),
        );
        advance(3);
        break;
      case "router":
        if (e.event.kind === "switched") {
          setSwitched(`Switched to ${e.event.toLabel} — restarting the research`);
          setStage(0);
          setToolSteps(0);
          setSources([]);
          setAnswer("");
          sawResult.current = false;
        } else if (e.event.kind === "auth-error") {
          setError(`${e.event.providerLabel} key looks invalid — check Providers.`);
        } else if (e.event.kind === "exhausted") {
          setError(
            e.event.toolsUnsupported
              ? "None of your models can use tools. Pick a tool-capable model in Providers."
              : "All providers are rate-limited or failing. Try again shortly.",
          );
        }
        break;
      case "error":
        setError(e.message);
        break;
      case "done":
        advance(STAGES.length); // mark every stage complete, including "Cited report"
        setDone({ providerLabel: e.providerLabel, model: e.model });
        break;
    }
  }

  async function run() {
    if (!query.trim() || running || !hasResearchTools) return;
    setStage(0);
    setToolSteps(0);
    setSources([]);
    setAnswer("");
    setError(null);
    setSwitched(null);
    setDone(null);
    sawResult.current = false;
    setRunning(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await onRun(query.trim(), mode, handleEvent, ctrl.signal);
    } catch (e) {
      if (!ctrl.signal.aborted) {
        setError(e instanceof Error ? e.message : "Research run failed.");
      }
    } finally {
      setRunning(false);
    }
  }

  const pct = Math.min(100, Math.round((toolSteps / Math.max(1, mode.maxSteps)) * 100));

  return (
    <div className="explore-body">
      <p className="settings-hint">
        Ask a big question and watch Deep Research work — decompose it, search, read sources, and
        synthesize a cited answer, step by step. It runs the real research loop over your web tools.
      </p>

      {!hasResearchTools && (
        <p className="notice">
          No research tools are running yet.{" "}
          <button
            type="button"
            className="link-btn"
            onClick={() => void onInstallTools()}
            disabled={installingTools}
          >
            {installingTools ? "Setting up…" : "Set up the free research tools"}
          </button>{" "}
          (Web Reader, Wikipedia, OpenAlex) — no account needed.
        </p>
      )}

      <div className="explore-query">
        <textarea
          className="explore-query-input"
          placeholder="e.g. How do the EU and US approaches to regulating AI compare?"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void run();
            }
          }}
          rows={2}
          disabled={!hasResearchTools || running}
        />
        <div className="research-controls">
          <select
            className="composer-mode-select"
            value={mode.id}
            onChange={(e) => setMode(RESEARCH_MODES.find((r) => r.id === e.currentTarget.value) ?? DEFAULT_RESEARCH_MODE)}
            disabled={running}
            title={mode.description}
          >
            {RESEARCH_MODES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
          {running ? (
            <button type="button" className="btn btn-secondary btn-sm explore-run" onClick={() => abortRef.current?.abort()}>
              <IconStop size={13} /> Stop
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-sm explore-run"
              onClick={() => void run()}
              disabled={!hasResearchTools || !query.trim()}
            >
              <IconSearch size={14} /> Run research
            </button>
          )}
        </div>
      </div>

      {switched && <p className="notice">{switched}</p>}
      {error && <p className="error">{error}</p>}

      {(running || toolSteps > 0 || answer) && (
        <>
          {/* Pipeline stepper */}
          <ol className="explore-pipeline research-pipeline">
            {STAGES.map((label, i) => {
              const state = i < stage ? "done" : i === stage ? "current" : "todo";
              return (
                <li key={i} className={`explore-stage${state !== "todo" ? " explore-stage-on" : ""}`}>
                  <span className={`explore-stage-num research-stage-${state}`}>
                    {state === "done" ? <IconCheck size={12} /> : i + 1}
                  </span>
                  <span className="explore-stage-body">
                    <span className="explore-stage-label">{label}</span>
                  </span>
                </li>
              );
            })}
          </ol>

          {/* Step-budget progress */}
          <div className="research-progress">
            <div className="research-progress-head">
              <span>Research steps</span>
              <span>
                {toolSteps} of up to {mode.maxSteps}
              </span>
            </div>
            <div className="research-progress-track">
              <div className="research-progress-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>

          {/* Sources consulted */}
          {sources.length > 0 && (
            <div className="viz-block">
              <div className="viz-title">Sources consulted ({sources.length})</div>
              <ul className="research-source-list">
                {sources.map((s) => (
                  <li key={s.id} className="research-source">
                    <span className={`research-source-status research-source-${s.status}`}>
                      {s.status === "pending" ? (
                        <IconLoader size={12} />
                      ) : s.status === "error" ? (
                        <IconX size={12} />
                      ) : (
                        <IconCheck size={12} />
                      )}
                    </span>
                    <span className="research-source-tool">{s.tool}</span>
                    <span className="research-source-label" title={s.label}>
                      {s.label}
                    </span>
                    {s.status === "done" && s.chars > 0 && (
                      <span className="research-source-chars">{s.chars.toLocaleString()} chars</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Live report */}
          {answer && (
            <div className="viz-block research-answer">
              <div className="viz-title">
                {done ? "Cited report" : "Writing…"}
                {done && (
                  <span className="research-answer-meta">
                    {" "}
                    · via {done.providerLabel} · {done.model}
                  </span>
                )}
              </div>
              <Markdown text={answer} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
