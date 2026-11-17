import earcut from 'earcut';

/** Twice the signed area of a ring of [x, z] points, positive when it runs clockwise seen from above (x east, z south). */
export function area2(ring) {
  let a = 0;
  for (let i = 0, n = ring.length - 1; i < n; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return a;
}

export const areaOf = (ring) => Math.abs(area2(ring)) / 2;

/** A copy of the ring without the point that closes it. */
export const open = (ring) => (ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1] ? ring.slice(0, -1) : ring);

/**
 * Triangles for a polygon (outer ring, then holes) as flat [x, z, ...] points
 * and indices, every triangle wound the same way (seen from above, x east and
 * z south, the way round that faces up).
 */
export function triangulate(rings) {
  const flat = [], holes = [];
  rings.forEach((ring, i) => {
    const r = open(ring);
    if (i) holes.push(flat.length / 2);
    for (const [x, z] of r) flat.push(x, z);
  });
  const index = earcut(flat, holes, 2);
  // Earcut's winding follows the input's; make each one face up (+y).
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i] * 2, b = index[i + 1] * 2, c = index[i + 2] * 2;
    const up = (flat[b + 1] - flat[a + 1]) * (flat[c] - flat[a]) - (flat[b] - flat[a]) * (flat[c + 1] - flat[a + 1]);
    if (up < 0) { const t = index[i + 1]; index[i + 1] = index[i + 2]; index[i + 2] = t; }
  }
  return { points: flat, index };
}

/**
 * Splits triangles (flat points, indices) until no edge is longer than `most`,
 * so they can be draped over uneven ground. Returns new points and indices.
 */
export function subdivide({ points, index }, most) {
  const pts = points.slice();
  const out = [];
  const mid = new Map();
  const midpoint = (a, b) => {
    const key = a < b ? a * 1e7 + b : b * 1e7 + a;
    let m = mid.get(key);
    if (m === undefined) {
      m = pts.length / 2;
      pts.push((pts[a * 2] + pts[b * 2]) / 2, (pts[a * 2 + 1] + pts[b * 2 + 1]) / 2);
      mid.set(key, m);
    }
    return m;
  };
  const len = (a, b) => Math.hypot(pts[a * 2] - pts[b * 2], pts[a * 2 + 1] - pts[b * 2 + 1]);
  const stack = [];
  for (let i = 0; i < index.length; i += 3) stack.push([index[i], index[i + 1], index[i + 2]]);
  while (stack.length) {
    const [a, b, c] = stack.pop();
    const ab = len(a, b), bc = len(b, c), ca = len(c, a);
    const longest = Math.max(ab, bc, ca);
    if (longest <= most) { out.push(a, b, c); continue; }
    if (longest === ab) { const m = midpoint(a, b); stack.push([a, m, c], [m, b, c]); }
    else if (longest === bc) { const m = midpoint(b, c); stack.push([a, b, m], [a, m, c]); }
    else { const m = midpoint(c, a); stack.push([a, b, m], [m, b, c]); }
  }
  return { points: pts, index: out };
}

/** Whether (x, z) is inside the polygon (outer ring then holes). */
export function inside(rings, x, z) {
  let c = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, zi] = ring[i], [xj, zj] = ring[j];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
    }
  }
  return c;
}

/** How far (x, z) is from the nearest edge of the rings. */
export function edgeDistance(rings, x, z) {
  let best = Infinity;
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) {
      const [ax, az] = ring[i], [bx, bz] = ring[i + 1];
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
      const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
      const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
      if (d < best) best = d;
    }
  }
  return best;
}

/**
 * The smallest rectangle round a ring, by trying the way each edge runs:
 * its middle, the unit vector along its long side, and its two sizes.
 */
export function boundingRectangle(ring) {
  const pts = open(ring);
  let best = null;
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
    const l = Math.hypot(bx - ax, bz - az);
    if (l < 1e-6) continue;
    const ux = (bx - ax) / l, uz = (bz - az) / l;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [x, z] of pts) {
      const u = x * ux + z * uz, v = -x * uz + z * ux;
      if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v;
    }
    const size = (u1 - u0) * (v1 - v0);
    if (!best || size < best.size) best = { size, ux, uz, u0, u1, v0, v1 };
  }
  if (!best) return null;
  const { ux, uz, u0, u1, v0, v1 } = best;
  const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
  let w = u1 - u0, d = v1 - v0, ax = ux, az = uz;
  // The long side first.
  if (d > w) { [w, d] = [d, w]; ax = -uz; az = ux; }
  return { x: cu * ux - cv * uz, z: cu * uz + cv * ux, ax, az, w, d, area: w * d };
}

/** A tiny, stable hash of a string or number to [0, 1). */
export function unit(seed) {
  let h = 2166136261;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13;
  return ((h >>> 0) % 100000) / 100000;
}

/** The points of a line with none further apart than `most`. */
export function sampleLine(line, most = 5) {
  const out = [line[0]];
  for (let i = 1; i < line.length; i++) {
    const [ax, az] = line[i - 1], [bx, bz] = line[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / most));
    for (let k = 1; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  return out;
}

/** A spatial index of the buildings, to ask whether a point is inside one. */
export function buildingIndex(buildings, cell = 32) {
  const grid = new Map();
  buildings.forEach((b, i) => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of b.rings[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    for (let gz = Math.floor(z0 / cell); gz <= Math.floor(z1 / cell); gz++) for (let gx = Math.floor(x0 / cell); gx <= Math.floor(x1 / cell); gx++) {
      const k = `${gx},${gz}`;
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(i);
    }
  });
  return (x, z, margin = 0) => {
    for (const dz of [0, margin, -margin]) for (const dx of [0, margin, -margin]) {
      for (const i of grid.get(`${Math.floor((x + dx) / cell)},${Math.floor((z + dz) / cell)}`) ?? []) if (inside(buildings[i].rings, x + dx, z + dz)) return true;
    }
    return false;
  };
}
