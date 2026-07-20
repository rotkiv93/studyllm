import { IconBook } from "./icons";
import type { RetrievedChunk } from "../lib/rag";
import { useT } from "../lib/i18n";

/**
 * The "Sources from your library" block shown above a RAG-grounded answer. It makes retrieval
 * visible: the student sees exactly which passages (and from which documents) the assistant was
 * given to answer from, each expandable to its full text. Ephemeral — shown for the live turn, not
 * persisted (see PROJECT_STATUS.md).
 */
export function RetrievedSources({ sources }: { sources: RetrievedChunk[] }) {
  const t = useT();
  if (sources.length === 0) return null;
  return (
    <div className="retrieved-sources">
      <div className="retrieved-sources-head">
        <IconBook size={13} />
        <span>
          {t(sources.length === 1 ? "sources.headOne" : "sources.headOther", {
            count: sources.length,
          })}
        </span>
      </div>
      {sources.map((s, i) => (
        <details key={i} className="attachment-details retrieved-source">
          <summary>
            <span className="retrieved-source-tag">
              {s.documentName} #{s.seq}
            </span>
            <span className="retrieved-source-score">
              {t("sources.match", { percent: Math.round(s.score * 100) })}
            </span>
          </summary>
          <pre>{s.text}</pre>
        </details>
      ))}
    </div>
  );
}
