import { useEffect, useRef, useState } from "react";
import { IconSearch, IconLoader } from "./icons";
import { SimilarityRanking } from "./viz/SimilarityRanking";
import { EmbeddingMap } from "./viz/EmbeddingMap";
import { resolveEmbedder, retrieveExplained, type RetrievalExplanation } from "../lib/rag";
import type { ProviderRow, RagDocumentRow } from "../lib/db";

/**
 * The RAG tab of the Explore panel — a retrieval playground. The student types a question, hits Run,
 * and watches the real pipeline execute against their own library: embed the query → score every
 * passage → rank → keep the top-k. The result is shown two ways (a similarity ranking and a 2D
 * embedding map) that cross-highlight, turning "retrieval" from a black box into something you can
 * poke at. It runs the *actual* retrieval (`retrieveExplained`) — same embeddings the chat path uses.
 */

interface Stage {
  label: string;
  detail: (e: RetrievalExplanation) => string;
}

const STAGES: Stage[] = [
  {
    label: "Turn your question into numbers",
    detail: (e) =>
      `Turned into a list of ${e.queryVector.length} numbers (a “vector”) that captures its meaning`,
  },
  {
    label: "Score every passage",
    detail: (e) => `Compared against ${e.scored.length} passage${e.scored.length === 1 ? "" : "s"}`,
  },
  {
    label: "Rank by closeness in meaning",
    detail: () => "Sorted by how close in meaning they are (“cosine similarity”), not keyword overlap",
  },
  {
    label: "Keep the closest",
    detail: (e) =>
      `The top ${Math.min(e.k, e.scored.length)} become the answer's cited sources`,
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
      setError(e instanceof Error ? e.message : "Retrieval failed. Check your embedding provider.");
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
      <p className="settings-hint">
        Type a question and watch how “chat with your documents” actually finds the right passages —
        no chatting needed. It runs the real search over your library.
      </p>

      {!hasDocs && (
        <p className="notice">
          Your library is empty.{" "}
          <button type="button" className="link-btn" onClick={onOpenLibrary}>
            Add some documents
          </button>{" "}
          first, then come back to explore how retrieval picks passages from them.
        </p>
      )}

      <div className="explore-query">
        <textarea
          className="explore-query-input"
          placeholder="e.g. What obligations does the treaty place on member states?"
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
          {running ? "Running…" : "Run retrieval"}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {result && result.scored.length === 0 && !error && (
        <p className="notice">
          No passages were found in your library. If you just added documents, give indexing a moment
          and try again.
        </p>
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
                <span className="explore-stage-label">{stage.label}</span>
                <span className="explore-stage-detail">{stage.detail(result)}</span>
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
            Hover a bar or dot to compare them — <strong>click any one to read the full passage</strong>.
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
            aria-label={`Passage ${selectedChunk.documentName} #${selectedChunk.seq}`}
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
                  {Math.round(selectedChunk.score * 100)}% match
                  <span className="passage-dialog-score-note">
                    {selectedIndex < result.k ? "retrieved for the answer" : "not retrieved"}
                  </span>
                </span>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setSelectedIndex(null)}
              >
                Close
              </button>
            </div>

            <p className="passage-dialog-caption">
              This is one of the passages from your library, ranked #{selectedIndex + 1} of{" "}
              {result.scored.length} by how close it is in meaning to your question.
            </p>

            <div className="passage-dialog-body">{selectedChunk.text}</div>

            <div className="passage-dialog-nav">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => stepSelection(-1)}
                disabled={selectedIndex === 0}
              >
                ← Previous
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
                Next →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
