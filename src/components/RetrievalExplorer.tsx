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
    label: "Embed your question",
    detail: (e) => `Turned into a ${e.queryVector.length}-number vector`,
  },
  {
    label: "Score every passage",
    detail: (e) => `Compared against ${e.scored.length} passage${e.scored.length === 1 ? "" : "s"}`,
  },
  { label: "Rank by closeness", detail: () => "Sorted by cosine similarity (meaning, not keywords)" },
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
  const timers = useRef<number[]>([]);

  const hasDocs = documents.length > 0;

  useEffect(() => {
    return () => timers.current.forEach((t) => window.clearTimeout(t));
  }, []);

  async function run() {
    if (!query.trim() || running) return;
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    setError(null);
    setResult(null);
    setRevealed(0);
    setHoveredIndex(null);
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

  const activeChunk =
    result && hoveredIndex !== null ? result.scored[hoveredIndex] ?? null : null;
  const showViz = result && result.scored.length > 0 && revealed >= STAGES.length;

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
            />
            <EmbeddingMap
              queryVector={result.queryVector}
              scored={result.scored}
              k={result.k}
              hoveredIndex={hoveredIndex}
              onHover={setHoveredIndex}
            />
          </div>

          <div className="explore-detail">
            {activeChunk ? (
              <>
                <div className="explore-detail-head">
                  <span className="explore-detail-tag">
                    {activeChunk.documentName} #{activeChunk.seq}
                  </span>
                  <span className="explore-detail-score">
                    {Math.round(activeChunk.score * 100)}% match
                  </span>
                </div>
                <pre className="explore-detail-text">{activeChunk.text}</pre>
              </>
            ) : (
              <p className="explore-detail-hint">
                Hover a bar or a dot to read that passage and see its exact score.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
