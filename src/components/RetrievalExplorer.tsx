import { useEffect, useRef, useState } from "react";
import { IconSearch, IconLoader } from "./icons";
import { SimilarityRanking } from "./viz/SimilarityRanking";
import { EmbeddingMap } from "./viz/EmbeddingMap";
import { resolveEmbedder, retrieveExplained, type RetrievalExplanation } from "../lib/rag";
import type { ProviderRow, RagDocumentRow } from "../lib/db";
import { useT, type TranslateFn } from "../lib/i18n";

/**
 * The RAG tab of the Explore panel — a retrieval playground. The student types a question, hits Run,
 * and watches the real pipeline execute against their own library: embed the query → score every
 * passage → rank → keep the top-k. The result is shown two ways (a similarity ranking and a 2D
 * embedding map) that cross-highlight, turning "retrieval" from a black box into something you can
 * poke at. It runs the *actual* retrieval (`retrieveExplained`) — same embeddings the chat path uses.
 */

interface Stage {
  labelKey: "retrieval.stage1.label" | "retrieval.stage2.label" | "retrieval.stage3.label" | "retrieval.stage4.label";
  detail: (t: TranslateFn, e: RetrievalExplanation) => string;
}

const STAGES: Stage[] = [
  {
    labelKey: "retrieval.stage1.label",
    detail: (t, e) => t("retrieval.stage1.detail", { count: e.queryVector.length }),
  },
  {
    labelKey: "retrieval.stage2.label",
    detail: (t, e) => t("retrieval.stage2.detail", { count: e.scored.length }),
  },
  {
    labelKey: "retrieval.stage3.label",
    detail: (t) => t("retrieval.stage3.detail"),
  },
  {
    labelKey: "retrieval.stage4.label",
    detail: (t, e) => t("retrieval.stage4.detail", { count: Math.min(e.k, e.scored.length) }),
  },
];

const REVEAL_MS = 320;

export function RetrievalExplorer({
  providers,
  documents,
  onOpenLibrary,
}: {
  providers: ProviderRow[];
  documents: RagDocumentRow[];
  onOpenLibrary: () => void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RetrievalExplanation | null>(null);
  const [revealed, setRevealed] = useState(0); // how many pipeline stages are shown so far
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null); // opens the passage dialog
  const timers = useRef<number[]>([]);

  const hasDocs = documents.length > 0;

  useEffect(() => {
    return () => timers.current.forEach((t) => window.clearTimeout(t));
  }, []);

  // Let Escape close the passage dialog, matching the app's other modals.
  useEffect(() => {
    if (selectedIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedIndex(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedIndex]);

  async function run() {
    if (!query.trim() || running) return;
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    setError(null);
    setResult(null);
    setRevealed(0);
    setHoveredIndex(null);
    setSelectedIndex(null);
    setRunning(true);

    const resolved = await resolveEmbedder(providers);
    if ("error" in resolved) {
      setError(resolved.error);
      setRunning(false);
      return;
    }

    try {
      const explanation = await retrieveExplained(query.trim(), resolved.embedder);
      setResult(explanation);
      // Staged reveal so the (fast) pipeline is legible — each step lands in turn.
      for (let s = 1; s <= STAGES.length; s++) {
        timers.current.push(window.setTimeout(() => setRevealed(s), s * REVEAL_MS));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("retrieval.failed"));
    } finally {
      setRunning(false);
    }
  }

  const selectedChunk =
    result && selectedIndex !== null ? result.scored[selectedIndex] ?? null : null;
  const showViz = result && result.scored.length > 0 && revealed >= STAGES.length;

  const stepSelection = (delta: number) => {
    if (!result || selectedIndex === null) return;
    const next = selectedIndex + delta;
    if (next >= 0 && next < result.scored.length) setSelectedIndex(next);
  };

  return (
    <div className="explore-body">
      <p className="settings-hint">{t("retrieval.intro")}</p>

      {!hasDocs && (
        <p className="notice">
          {t("retrieval.emptyLibrary")}{" "}
          <button type="button" className="link-btn" onClick={onOpenLibrary}>
            {t("retrieval.addDocs")}
          </button>{" "}
          {t("retrieval.emptyLibrarySuffix")}
        </p>
      )}

      <div className="explore-query">
        <textarea
          className="explore-query-input"
          placeholder={t("retrieval.placeholder")}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void run();
            }
          }}
          rows={2}
          disabled={!hasDocs}
        />
        <button
          type="button"
          className="btn btn-primary btn-sm explore-run"
          onClick={() => void run()}
          disabled={!hasDocs || !query.trim() || running}
        >
          {running ? <IconLoader size={14} /> : <IconSearch size={14} />}
          {running ? t("retrieval.running") : t("retrieval.run")}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {result && result.scored.length === 0 && !error && (
        <p className="notice">{t("retrieval.noPassages")}</p>
      )}

      {result && result.scored.length > 0 && (
        <ol className="explore-pipeline">
          {STAGES.map((stage, i) => (
            <li
              key={i}
              className={`explore-stage${i < revealed ? " explore-stage-on" : ""}`}
            >
              <span className="explore-stage-num">{i + 1}</span>
              <span className="explore-stage-body">
                <span className="explore-stage-label">{t(stage.labelKey)}</span>
                <span className="explore-stage-detail">{stage.detail(t, result)}</span>
              </span>
            </li>
          ))}
        </ol>
      )}

      {showViz && result && (
        <>
          <div className="explore-viz-grid">
            <SimilarityRanking
              scored={result.scored}
              k={result.k}
              hoveredIndex={hoveredIndex}
              onHover={setHoveredIndex}
              onSelect={setSelectedIndex}
            />
            <EmbeddingMap
              queryVector={result.queryVector}
              scored={result.scored}
              k={result.k}
              hoveredIndex={hoveredIndex}
              onHover={setHoveredIndex}
              onSelect={setSelectedIndex}
            />
          </div>

          <p className="explore-detail-hint">
            {t("retrieval.vizHint")} <strong>{t("retrieval.vizHintStrong")}</strong>.
          </p>
        </>
      )}

      {result && selectedChunk && selectedIndex !== null && (
        <div
          className="settings-overlay passage-dialog-overlay"
          onClick={() => setSelectedIndex(null)}
        >
          <div
            className="settings-panel settings-panel-wide passage-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={t("retrieval.passageAria", {
              name: selectedChunk.documentName,
              seq: selectedChunk.seq,
            })}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="settings-header passage-dialog-header">
              <div className="passage-dialog-title">
                <span className="passage-dialog-tag">
                  {selectedChunk.documentName} #{selectedChunk.seq}
                </span>
                <span
                  className={`passage-dialog-score${selectedIndex < result.k ? " passage-dialog-score-kept" : ""}`}
                >
                  {t("retrieval.match", { percent: Math.round(selectedChunk.score * 100) })}
                  <span className="passage-dialog-score-note">
                    {selectedIndex < result.k
                      ? t("retrieval.retrieved")
                      : t("retrieval.notRetrieved")}
                  </span>
                </span>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setSelectedIndex(null)}
              >
                {t("common.close")}
              </button>
            </div>

            <p className="passage-dialog-caption">
              {t("retrieval.passageCaption", {
                rank: selectedIndex + 1,
                total: result.scored.length,
              })}
            </p>

            <div className="passage-dialog-body">{selectedChunk.text}</div>

            <div className="passage-dialog-nav">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => stepSelection(-1)}
                disabled={selectedIndex === 0}
              >
                {t("retrieval.previous")}
              </button>
              <span className="passage-dialog-nav-pos">
                {selectedIndex + 1} / {result.scored.length}
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => stepSelection(1)}
                disabled={selectedIndex === result.scored.length - 1}
              >
                {t("retrieval.next")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
