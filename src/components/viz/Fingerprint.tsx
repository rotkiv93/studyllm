import { useMemo } from "react";
import { fingerprint } from "../../lib/ragInsights";

/**
 * An embedding drawn as a strip of cells: the colour says positive vs. negative, the strength says
 * how large. It is the vector's "fingerprint" — passages about the same thing get similar strips.
 */
export function Fingerprint({ vector, label, bins = 48 }: { vector: number[]; label: string; bins?: number }) {
  const cells = useMemo(() => fingerprint(vector, bins), [vector, bins]);
  if (cells.length === 0) return null;
  return (
    <span className="fingerprint" role="img" aria-label={label} title={label}>
      {cells.map((v, i) => (
        <span
          key={i}
          className={`fingerprint-cell${v < 0 ? " fingerprint-cell-neg" : ""}`}
          style={{ opacity: 0.12 + Math.abs(v) * 0.88 }}
        />
      ))}
    </span>
  );
}
