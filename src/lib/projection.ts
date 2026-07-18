/**
 * Tiny PCA → 2D projection, used to *show* embeddings in space in the retrieval playground.
 *
 * Embedding vectors live in hundreds of dimensions (e.g. 768 for text-embedding-004). To draw them
 * on a flat scatter we project onto the two directions of greatest variance (the top-2 principal
 * components). This is a faithful-enough lens for teaching — "passages close here are close in
 * meaning" — not a precise metric; it's an approximation (see PROJECT_STATUS.md).
 *
 * Pure + unit-tested. We never form the d×d covariance matrix (d can be ~1k). Instead we power-
 * iterate the implicit covariance Cᵥ = Xᵀ(Xv) directly, which is O(n·d) per step and needs no
 * dependency.
 */

const ITERATIONS = 64;

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function norm(a: number[]): number {
  return Math.sqrt(dot(a, a));
}

/** A deterministic, non-degenerate seed direction (avoids random flicker between runs). */
function seedVector(dim: number, salt: number): number[] {
  const v = new Array<number>(dim);
  for (let i = 0; i < dim; i++) {
    // Cheap deterministic spread; any non-constant vector works as a power-iteration seed.
    v[i] = Math.sin((i + 1) * 12.9898 + salt * 78.233);
  }
  return v;
}

/** Power-iterate the top principal component of the mean-centered rows, deflating `avoid`. */
function principalComponent(centered: number[][], dim: number, avoid: number[][], salt: number): number[] {
  let v = seedVector(dim, salt);
  let vn = norm(v);
  if (vn === 0) return new Array<number>(dim).fill(0);
  v = v.map((x) => x / vn);

  for (let iter = 0; iter < ITERATIONS; iter++) {
    // next = Xᵀ(X v)  — accumulate the covariance action without materializing it.
    const next = new Array<number>(dim).fill(0);
    for (const row of centered) {
      const proj = dot(row, v);
      for (let i = 0; i < dim; i++) next[i] += proj * row[i];
    }
    // Deflate previously found components so this one is orthogonal to them.
    for (const u of avoid) {
      const c = dot(next, u);
      for (let i = 0; i < dim; i++) next[i] -= c * u[i];
    }
    vn = norm(next);
    if (vn === 0) return new Array<number>(dim).fill(0);
    v = next.map((x) => x / vn);
  }
  return v;
}

/**
 * Project each input vector to 2D via PCA. Returns one `[x, y]` per input, in the same order.
 * Degenerate inputs (empty, <2 points, or zero-variance) fall back to sensible zeros so callers
 * never have to special-case them.
 */
export function projectTo2D(vectors: number[][]): [number, number][] {
  const n = vectors.length;
  if (n === 0) return [];
  // Use the widest row as the dimension and normalize every row to it — a chunk whose stored
  // embedding failed to parse arrives as `[]`, and ragged rows would otherwise produce NaNs.
  const dim = vectors.reduce((m, v) => Math.max(m, v.length), 0);
  if (dim === 0) return vectors.map(() => [0, 0]);
  if (n === 1) return [[0, 0]];
  const rows = vectors.map((v) => {
    const r = new Array<number>(dim);
    for (let i = 0; i < dim; i++) r[i] = v[i] ?? 0;
    return r;
  });

  // Mean-center.
  const mean = new Array<number>(dim).fill(0);
  for (const v of rows) for (let i = 0; i < dim; i++) mean[i] += v[i];
  for (let i = 0; i < dim; i++) mean[i] /= n;
  const centered = rows.map((v) => v.map((x, i) => x - mean[i]));

  const pc1 = principalComponent(centered, dim, [], 1);
  const pc2 = principalComponent(centered, dim, [pc1], 2);

  return centered.map((row) => [dot(row, pc1), dot(row, pc2)]);
}
