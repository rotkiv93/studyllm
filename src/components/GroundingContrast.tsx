import { useRef, useState } from "react";
import { IconSearch, IconLoader, IconStop } from "./icons";
import { Markdown } from "./Markdown";
import {
  resolveEmbedder,
  retrieve,
  buildRagSystemBlock,
  type RetrievedChunk,
} from "../lib/rag";
import type { StreamEvent } from "../lib/providerRouter";
import type { ProviderRow, RagDocumentRow } from "../lib/db";
import { useT } from "../lib/i18n";

/**
 * The "Why does it make things up?" playground — the strongest single argument for RAG.
 *
 * The student asks one question and it's answered *twice, side by side*: once with nothing but the
 * model's own memory, and once grounded in passages retrieved from their library (the real chat
 * path, `retrieve` + `buildRagSystemBlock`). The contrast is the lesson — the plain answer may sound
 * confident but cites nothing (and can be wrong / made up), while the grounded one is tied to real
 * passages with `[Doc #n]` citations, and honestly says so when the library doesn't cover it.
 */

type Phase = "idle" | "plain" | "grounded" | "done";

export function GroundingContrast({
  providers,
  documents,
  onOpenLibrary,
  onRunAnswer,
}: {
  providers: ProviderRow[];
  documents: RagDocumentRow[];
  onOpenLibrary: () => void;
  onRunAnswer: (
    question: string,
    system: string | undefined,
    onEvent: (e: StreamEvent) => void,
    signal: AbortSignal,
  ) => Promise<void>;
}) {
  const t = useT();
  const [question, setQuestion] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [plainText, setPlainText] = useState("");
  const [groundedText, setGroundedText] = useState("");
  const [sources, setSources] = useState<RetrievedChunk[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const hasDocs = documents.length > 0;
  const running = phase === "plain" || phase === "grounded";

  async function run() {
    if (!question.trim() || running) return;
    setError(null);
    setPlainText("");
    setGroundedText("");
    setSources([]);

    const resolved = await resolveEmbedder(providers);
    if ("error" in resolved) {
      setError(resolved.error);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    const q = question.trim();

    try {
      // 1) Plain — the model's own memory, no documents.
      setPhase("plain");
      await onRunAnswer(
        q,
        undefined,
        (e) => {
          if (e.type === "chunk") setPlainText((t) => t + e.text);
          else if (e.type === "error") setError(e.message);
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;

      // 2) Grounded — retrieve from the library, then answer only from those passages.
      const retrieved = await retrieve(q, resolved.embedder);
      setSources(retrieved);
      const system =
        retrieved.length > 0 ? buildRagSystemBlock(retrieved) : undefined;
      setPhase("grounded");
      await onRunAnswer(
        q,
        system,
        (e) => {
          if (e.type === "chunk") setGroundedText((t) => t + e.text);
          else if (e.type === "error") setError(e.message);
        },
        controller.signal,
      );
      setPhase("done");
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : t("grounding.failed"));
      }
      setPhase("done");
    } finally {
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
    setPhase("done");
  }

  return (
    <div className="explore-body">
      <p className="settings-hint">{t("grounding.intro")}</p>

      {!hasDocs && (
        <p className="notice">
          {t("grounding.emptyLibrary")}{" "}
          <button type="button" className="link-btn" onClick={onOpenLibrary}>
            {t("grounding.addDoc")}
          </button>{" "}
          {t("grounding.emptyLibrarySuffix")}
        </p>
      )}

      <div className="explore-query">
        <textarea
          className="explore-query-input"
          placeholder={t("grounding.placeholder")}
          value={question}
          onChange={(e) => setQuestion(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void run();
            }
          }}
          rows={2}
          disabled={!hasDocs || running}
        />
        {running ? (
          <button type="button" className="btn btn-secondary btn-sm explore-run" onClick={stop}>
            <IconStop size={14} /> {t("grounding.stop")}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary btn-sm explore-run"
            onClick={() => void run()}
            disabled={!hasDocs || !question.trim()}
          >
            <IconSearch size={14} /> {t("grounding.compare")}
          </button>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      {(plainText || groundedText || running) && (
        <div className="grounding-grid">
          <div className="grounding-col">
            <div className="grounding-col-head grounding-col-head-plain">
              {t("grounding.memoryOnly")}
              {phase === "plain" && <IconLoader size={13} />}
            </div>
            <div className="grounding-answer">
              {plainText ? <Markdown text={plainText} /> : <span className="grounding-wait">…</span>}
            </div>
            <p className="grounding-note grounding-note-warn">{t("grounding.noSources")}</p>
          </div>

          <div className="grounding-col">
            <div className="grounding-col-head grounding-col-head-grounded">
              {t("grounding.groundedIn")}
              {phase === "grounded" && <IconLoader size={13} />}
            </div>
            <div className="grounding-answer">
              {groundedText ? (
                <Markdown text={groundedText} />
              ) : phase === "grounded" ? (
                <span className="grounding-wait">…</span>
              ) : (
                <span className="grounding-wait">{t("grounding.waiting")}</span>
              )}
            </div>
            {sources.length > 0 && (
              <div className="grounding-sources">
                <span className="grounding-sources-label">{t("grounding.passagesGiven")}</span>
                <ul>
                  {sources.map((s, i) => (
                    <li key={i}>
                      <code>
                        {s.documentName} #{s.seq}
                      </code>{" "}
                      · {t("grounding.matchPercent", { percent: Math.round(s.score * 100) })}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {sources.length === 0 && phase === "done" && (
              <p className="grounding-note">{t("grounding.nothingMatched")}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
