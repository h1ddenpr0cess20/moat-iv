import { offsetRing } from './mesh.js';

/**
 * Walls with modeled openings (ported from Rivertown's Blender generator, citygen/facade.py): recessed windows with
 * reveals, frames, mullions, sills and lintels; storefronts with bulkheads, doors and sign bands; curtain walls with
 * spandrels and protruding mullions.
 *
 * A wall runs along a footprint edge from a to b (Blender XY, counter-clockwise, so the outside is on the right).
 * `t` is along the edge, `n` the outward normal, depth `k` goes into the building.
 */
export class Edge {
  constructor(a, b) {
    this.a = a; this.b = b;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    this.L = Math.hypot(dx, dy);
    this.t = this.L > 0 ? [dx / this.L, dy / this.L, 0] : [1, 0, 0];
    this.n = [this.t[1], -this.t[0], 0];
    this.yaw = Math.atan2(this.t[1], this.t[0]);
  }
  P(u, z, k = 0) {
    return [this.a[0] + this.t[0] * u - this.n[0] * k, this.a[1] + this.t[1] * u - this.n[1] * k, z];
  }
  negN() { return [-this.n[0], -this.n[1], 0]; }
}

/** Bay boundaries along an edge: plain piers of `margin` at each end, the rest split into even bays. */
export function bays(L, bay, margin) {
  const use = L - 2 * margin;
  if (use < bay * 0.6) return null;
  const n = Math.max(1, Math.round(use / bay)), w = use / n;
  return Array.from({ length: n + 1 }, (_, i) => margin + i * w);
}

export function plain(M, e, u0, u1, z0, z1, mat) {
  if (u1 - u0 > 1e-3 && z1 - z0 > 1e-3) M.poly([e.P(u0, z0), e.P(u1, z0), e.P(u1, z1), e.P(u0, z1)], mat, e.n);
}

/** A cell of wall (u0..u1, z0..z1) with a hole (wx0..wx1, wy0..wy1) `depth` deep, closed at the back by `back`. */
export function opening(M, e, u0, u1, z0, z1, wx0, wx1, wy0, wy1, depth, wall, back, reveal = null) {
  reveal = reveal || wall;
  plain(M, e, u0, u1, z0, wy0, wall);
  plain(M, e, u0, u1, wy1, z1, wall);
  plain(M, e, u0, wx0, wy0, wy1, wall);
  plain(M, e, wx1, u1, wy0, wy1, wall);
  if (M.coarse) {
    // From afar: the glass flush in the wall, no reveals.
    M.poly([e.P(wx0, wy0), e.P(wx1, wy0), e.P(wx1, wy1), e.P(wx0, wy1)], back, e.n);
    return;
  }
  const d = depth;
  M.poly([e.P(wx0, wy0), e.P(wx0, wy1), e.P(wx0, wy1, d), e.P(wx0, wy0, d)], reveal, e.t);
  M.poly([e.P(wx1, wy0), e.P(wx1, wy1), e.P(wx1, wy1, d), e.P(wx1, wy0, d)], reveal, [-e.t[0], -e.t[1], 0]);
  M.poly([e.P(wx0, wy0), e.P(wx1, wy0), e.P(wx1, wy0, d), e.P(wx0, wy0, d)], reveal, [0, 0, 1]);
  M.poly([e.P(wx0, wy1), e.P(wx1, wy1), e.P(wx1, wy1, d), e.P(wx0, wy1, d)], reveal, [0, 0, -1]);
  M.poly([e.P(wx0, wy0, d), e.P(wx1, wy0, d), e.P(wx1, wy1, d), e.P(wx0, wy1, d)], back, e.n);
}

/** A box on the wall: base center at (u, z) `k` deep (negative = proud of the wall); its back is left out. */
export function bar(M, e, u, z, k, sx, sy, sz, mat, { top = true, bottom = false, ends = true } = {}) {
  if (M.coarse && Math.min(sx, sz) < 0.35) return; // sills, lintels, mullions, rails: too thin to see from afar
  M.box(e.P(u, z, k), [sx, sy, sz], mat, { yaw: e.yaw, top, bottom, cull: k + sy / 2 >= -0.01 ? e.n : null, ends });
}

/** A flat strip on the wall's plane `k` deep, bottom center at (u, z): a frame bar, a mullion, a shutter. */
export function plate(M, e, u, z, k, sx, sz, mat) {
  if (M.coarse) return; // frames, mullions, shutters
  const a = u - sx / 2, b = u + sx / 2;
  M.poly([e.P(a, z, k), e.P(b, z, k), e.P(b, z + sz, k), e.P(a, z + sz, k)], mat, e.n);
}

/** A punched window in a bay of one story. */
export function window(M, e, u0, u1, z0, z1, st, wall = null) {
  const w = u1 - u0, h = z1 - z0;
  const [fw, , head] = st.win;
  const ww = w * fw;
  const wx0 = u0 + (w - ww) / 2, wx1 = u0 + (w + ww) / 2;
  const wy0 = z0 + Math.min(0.95, (h - head) * 0.75 + 0.3);
  const wy1 = Math.min(z1 - 0.3, wy0 + head);
  if (wy1 - wy0 < 0.6) { plain(M, e, u0, u1, z0, z1, wall || st.wall); return; }
  const d = st.depth;
  wall = wall || st.wall;
  opening(M, e, u0, u1, z0, z1, wx0, wx1, wy0, wy1, d, wall, st.glass);
  const frame = st.frame;
  if (frame && !M.coarse) {
    // Halfway into the opening: well in front of the glass (3 cm flickered against it from afar).
    const f = 0.06, k = d / 2;
    plate(M, e, (wx0 + wx1) / 2, wy0, k, ww, f, frame);
    plate(M, e, (wx0 + wx1) / 2, wy1 - f, k, ww, f, frame);
    plate(M, e, wx0 + f / 2, wy0, k, f, wy1 - wy0, frame);
    plate(M, e, wx1 - f / 2, wy0, k, f, wy1 - wy0, frame);
    const nm = st.mullions ?? 0;
    for (let i = 0; i < nm; i++) plate(M, e, wx0 + (ww * (i + 1)) / (nm + 1), wy0, k - 0.02, 0.05, wy1 - wy0, frame);
    if (st.transom) plate(M, e, (wx0 + wx1) / 2, wy0 + (wy1 - wy0) * 0.68, k - 0.04, ww, 0.05, frame);
    if ((st.sash ?? true) && ww < 1.6 && !st.mullions) plate(M, e, (wx0 + wx1) / 2, wy0 + (wy1 - wy0) * 0.5, k - 0.04, ww, 0.05, frame);
  }
  if (st.sill) bar(M, e, (wx0 + wx1) / 2, wy0 - 0.08, -0.06, ww + 0.16, 0.12, 0.08, st.lintel || 'M_Limestone', { ends: false });
  if (st.lintel) {
    bar(M, e, (wx0 + wx1) / 2, wy1, -0.02, ww + 0.24, 0.06, 0.22, st.lintel, { top: false, bottom: true, ends: false });
    if (st.keystone) plate(M, e, (wx0 + wx1) / 2, wy1, -0.08, 0.22, 0.3, st.lintel);
  }
}

/**
 * A story of punched windows across the bays `xs` (u0..u1 each), on `wall`. `own(k, u0, u1)` may draw bay k itself
 * (a door) and return true. From afar the windows of a run share one band of wall above and below them.
 */
export function windowRow(M, e, xs, z0, z1, st, wall = null, own = null) {
  wall = wall || st.wall;
  if (!M.coarse) {
    for (let k = 0; k < xs.length - 1; k++) if (!own?.(k, xs[k], xs[k + 1])) window(M, e, xs[k], xs[k + 1], z0, z1, st, wall);
    return;
  }
  const h = z1 - z0, [fw, , head] = st.win;
  const wy0 = z0 + Math.min(0.95, (h - head) * 0.75 + 0.3), wy1 = Math.min(z1 - 0.3, wy0 + head);
  let k = 0;
  while (k < xs.length - 1) {
    if (own?.(k, xs[k], xs[k + 1])) { k++; continue; }
    let k1 = k;
    while (k1 < xs.length - 1 && !(k1 > k && own && ownProbe(own, k1))) k1++;
    // Bays k .. k1-1 are windows: one sheet of wall, the glass on it (a few centimeters proud, drawn in front).
    const u0 = xs[k], u1 = xs[k1];
    plain(M, e, u0, u1, z0, z1, wall);
    if (wy1 - wy0 >= 0.6) for (let b = k; b < k1; b++) {
      const w = xs[b + 1] - xs[b], ww = w * fw, wx0 = xs[b] + (w - ww) / 2;
      M.poly([e.P(wx0, wy0, -0.03), e.P(wx0 + ww, wy0, -0.03), e.P(wx0 + ww, wy1, -0.03), e.P(wx0, wy1, -0.03)], st.glass, e.n);
    }
    k = k1;
  }
}
// Whether `own` would draw bay k (asked without drawing: it is called again for real when the run reaches it).
const ownProbe = (own, k) => own.probe?.(k) ?? false;

/** Shop windows across the bays, a door every few, a bulkhead below and a sign band above. */
export function storefront(M, e, xs, z0, z1, st, signMat, doorEvery = 3, awning = null) {
  const base = st.base || st.wall;
  const band0 = z1 - 1.05;
  for (let i = 0; i < xs.length - 1; i++) {
    const u0 = xs[i], u1 = xs[i + 1];
    const door = i % doorEvery === Math.floor(doorEvery / 2);
    const wx0 = u0 + 0.18, wx1 = u1 - 0.18;
    const wy0 = z0 + (door ? 0.02 : 0.5), wy1 = band0 - 0.1;
    opening(M, e, u0, u1, z0, z1, wx0, wx1, wy0, wy1, 0.35, base, 'M_StoreGlass', 'M_Fascia');
    const k = 0.25, mid = (wx0 + wx1) / 2; // 10 cm in front of the glass (2 cm flickered)
    plate(M, e, mid, wy1 - 0.08, k, wx1 - wx0, 0.08, 'M_Fascia');
    plate(M, e, mid, wy0, k, wx1 - wx0, 0.08, 'M_Fascia');
    plate(M, e, wx0 + 0.04, wy0, k, 0.08, wy1 - wy0, 'M_Fascia');
    plate(M, e, wx1 - 0.04, wy0, k, 0.08, wy1 - wy0, 'M_Fascia');
    plate(M, e, mid, wy0 + (wy1 - wy0) * 0.78, k - 0.02, wx1 - wx0, 0.06, 'M_Fascia');
    if (door) {
      const dw = Math.min(1.0, (wx1 - wx0) / 2);
      plate(M, e, mid - dw / 2, wy0, k - 0.04, 0.07, 2.3, 'M_Fascia');
      plate(M, e, mid + dw / 2, wy0, k - 0.04, 0.07, 2.3, 'M_Fascia');
      plate(M, e, mid, wy0 + 2.3, k - 0.04, dw, 0.07, 'M_Fascia');
      plate(M, e, mid + dw * 0.35, wy0 + 1.0, k - 0.06, 0.03, 0.4, 'M_Mullion_Silver');
    } else {
      plate(M, e, mid, wy0 + (wy1 - wy0) * 0.45, k - 0.02, 0.05, (wy1 - wy0) * 0.33, 'M_Fascia');
    }
  }
  plain(M, e, 0, xs[0], z0, z1, base);
  plain(M, e, xs.at(-1), e.L, z0, z1, base);
  // The sign band: a panel proud of the wall, across the shop front.
  const u0 = xs[0] + 0.1, u1 = xs.at(-1) - 0.1;
  if (signMat) bar(M, e, (u0 + u1) / 2, band0 + 0.1, -0.12, u1 - u0, 0.24, 0.75, signMat); // (the wall behind it is the openings')
  if (awning && !M.coarse) {
    // A fabric awning over the windows, sloping out and down.
    const top = band0 - 0.05, out = 1.4;
    for (let i = 0; i < xs.length - 1; i++) {
      const a0 = xs[i] + 0.12, a1 = xs[i + 1] - 0.12;
      const p = [e.P(a0, top), e.P(a1, top), e.P(a1, top - 0.85, -out), e.P(a0, top - 0.85, -out)];
      M.poly(p, awning, [e.n[0], e.n[1], 1.0]);
      M.poly(p, awning, [-e.n[0], -e.n[1], -1.0]); // its underside, facing down
      M.poly([e.P(a0, top - 0.85, -out), e.P(a1, top - 0.85, -out), e.P(a1, top - 1.1, -out), e.P(a0, top - 1.1, -out)], awning, e.n);
    }
  }
}

/** A glass curtain wall: spandrel and vision glass each floor, mullions proud of the glass every bay. */
export function curtainWall(M, e, z0, z1, floors, st) {
  for (const [f0, f1] of floors) {
    const sp = Math.min(1.0, (f1 - f0) * 0.28);
    plain(M, e, 0, e.L, f0, f0 + sp, st.spandrel);
    plain(M, e, 0, e.L, f0 + sp, f1, st.glass);
    bar(M, e, e.L / 2, f0 - 0.06, -0.14, e.L, 0.28, 0.12, st.mullion, { ends: false });
  }
  if (M.coarse) return;
  const n = Math.max(1, Math.round(e.L / st.bay));
  for (let i = 0; i <= n; i++) {
    const deep = i % 4 === 0, half = (deep ? 0.12 : 0.07) / 2 + 0.01;
    // Kept on its own wall: at a corner it stood into the next wall's glass.
    const u = Math.min(e.L - half, Math.max(half, (e.L * i) / n));
    bar(M, e, u, z0, deep ? -0.25 : -0.12, deep ? 0.12 : 0.07, deep ? 0.5 : 0.24, z1 - z0, st.mullion, { top: false });
  }
}

/** A band round a footprint: a cornice, a belt course or a parapet cap, `out` meters proud of the wall. */
export function ringSlab(M, ring, out, z0, z1, mat, inner = 0) {
  const o = offsetRing(ring, out);
  const ir = inner ? offsetRing(ring, -inner) : ring;
  const n = ring.length;
  for (let k = 0; k < n; k++) {
    const j = (k + 1) % n, a = o[k], b = o[j];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    M.poly([[a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]], mat, [dy, -dx, 0]);
    M.poly([[ir[k][0], ir[k][1], z1], [ir[j][0], ir[j][1], z1], [b[0], b[1], z1], [a[0], a[1], z1]], mat, [0, 0, 1]);
    M.poly([[ir[k][0], ir[k][1], z0], [ir[j][0], ir[j][1], z0], [b[0], b[1], z0], [a[0], a[1], z0]], mat, [0, 0, -1]);
  }
}

/** A stepped cornice whose top is at `top`: bands, each further out. */
export function cornice(M, ring, top, mat, s) {
  if (M.coarse) { ringSlab(M, ring, 0.6 * s, top - 0.9 * s, top, mat); return; } // one band, the same outline
  ringSlab(M, ring, 0.12 * s, top - 0.9 * s, top - 0.6 * s, mat);
  ringSlab(M, ring, 0.32 * s, top - 0.6 * s, top - 0.35 * s, mat);
  ringSlab(M, ring, 0.6 * s, top - 0.35 * s, top - 0.12 * s, mat);
  ringSlab(M, ring, 0.7 * s, top - 0.12 * s, top, mat);
}

/** A parapet `parH` above the roof deck, its cap, its inner face and the deck; returns the deck's ring. */
export function parapetAndRoof(M, ring, roofZ, parH, wall, roofMat, cap = 'M_Limestone') {
  const inner = offsetRing(ring, -0.3), top = roofZ + parH, n = ring.length;
  for (let k = 0; k < n; k++) {
    const j = (k + 1) % n, a = inner[k], b = inner[j];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    M.poly([[a[0], a[1], roofZ], [b[0], b[1], roofZ], [b[0], b[1], top], [a[0], a[1], top]], wall, [-dy, dx, 0]);
    M.poly([[ring[k][0], ring[k][1], top], [ring[j][0], ring[j][1], top], [b[0], b[1], top], [a[0], a[1], top]], cap, [0, 0, 1]);
  }
  M.poly(inner.map((p) => [p[0], p[1], roofZ]), roofMat, [0, 0, 1]);
  return inner;
}
