/**
 * Small pure helpers that make the RAG data legible to a student: what an embedding "looks like",
 * where one chunk starts overlapping the previous one, and how to lay 2D points out in a square
 * viewport. UI-free and unit-tested in `ragInsights.test.ts`.
 */

/**
 * Squash an embedding vector into `bins` averaged cells, each scaled to [-1, 1] by the largest
 * magnitude. It is a "fingerprint" of the vector: two passages about the same thing get a similar
 * pattern, and the shape makes "a list of hundreds of numbers" something you can see.
 */
export function fingerprint(vec: number[], bins = 48): number[] {
  if (vec.length === 0 || bins <= 0) return [];
  const cells = Math.min(bins, vec.length);
  const out = new Array<number>(cells).fill(0);
  const counts = new Array<number>(cells).fill(0);
  for (let i = 0; i < vec.length; i++) {
    const cell = Math.min(cells - 1, Math.floor((i / vec.length) * cells));
    out[cell] += vec[i];
    counts[cell] += 1;
  }
  const means = out.map((sum, i) => (counts[i] ? sum / counts[i] : 0));
  const peak = Math.max(...means.map((m) => Math.abs(m)), 1e-12);
  return means.map((m) => m / peak);
}

/** A one-line preview of a passage: whitespace collapsed, cut on a word boundary with an ellipsis. */
export function snippet(text: string, max = 140): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * How many leading characters of `current` repeat the end of `previous` — i.e. the overlap the
 * chunker carries between neighbours. Looks only at the first `maxOverlap` characters.
 */
export function overlapLength(previous: string, current: string, maxOverlap: number): number {
  const limit = Math.min(maxOverlap, previous.length, current.length);
  for (let len = limit; len > 0; len--) {
    if (previous.endsWith(current.slice(0, len))) return len;
  }
  return 0;
}

/**
 * Fit projected points into a `view`×`view` box with `pad` margin, keeping the aspect ratio (a
 * uniform scale keeps distances honest). SVG y grows downward, so y is flipped.
 */
export function fitToView(points: [number, number][], view = 100, pad = 10): { x: number; y: number }[] {
  if (points.length === 0) return [];
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const scale = (view - 2 * pad) / span;
  const mid = view / 2;
  return points.map(([x, y]) => ({ x: mid + (x - cx) * scale, y: mid - (y - cy) * scale }));
}
