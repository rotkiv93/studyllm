import { IconBook } from "./icons";
import type { RetrievedChunk } from "../lib/rag";

/**
 * The "Sources from your library" block shown above a RAG-grounded answer. It makes retrieval
 * visible: the student sees exactly which passages (and from which documents) the assistant was
 * given to answer from, each expandable to its full text. Ephemeral — shown for the live turn, not
 * persisted (see PROJECT_STATUS.md).
 */
export function RetrievedSources({ sources }: { sources: RetrievedChunk[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="retrieved-sources">
      <div className="retrieved-sources-head">
        <IconBook size={13} />
        <span>
          Sources from your library ({sources.length} passage{sources.length === 1 ? "" : "s"})
        </span>
      </div>
      {sources.map((s, i) => (
        <details key={i} className="attachment-details retrieved-source">
          <summary>
            <span className="retrieved-source-tag">
              {s.documentName} #{s.seq}
            </span>
            <span className="retrieved-source-score">{Math.round(s.score * 100)}% match</span>
          </summary>
          <pre>{s.text}</pre>
        </details>
      ))}
    </div>
  );
}
