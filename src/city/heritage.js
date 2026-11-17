import { linear } from './builder.js';
import { areaOf, boundingRectangle, unit } from './geometry.js';
import { kindOf } from './looks.js';

/**
 * Heritage Hill: the hill east of downtown (Lafayette to Union, Michigan Street south), one of the largest urban
 * historic districts in the country, some 1,300 houses built from the 1840s to the 1920s. Its houses are built here
 * in the styles that give it its look rather than one by one: their footprints and heights are the map's, their
 * shapes the district's.
 *
 * - Queen Anne: steep cross-gabled roofs, a gable over a front bay, often a round-cornered tower with a conical cap,
 *   a deep porch on turned posts; painted clapboard in the colours of the period (sage, cream, slate blue, oxblood).
 * - Italianate: a low hipped roof on deep eaves carried on brackets, tall windows, often red brick, sometimes a cupola.
 * - Colonial Revival: a side-gabled roof with dormers, a symmetrical front and a porch at its middle, white or yellow.
 * - American Foursquare: a square block under a hipped roof with a hipped dormer, a porch across the whole front.
 *
 * Every house stands on a stone foundation, has a chimney, and faces the street it is nearest.
 */

/** Where Heritage Hill is, in metres: Lafayette Avenue to Union Avenue, Michigan Street to the south edge of the map. */
export const HERITAGE = { x0: 495, x1: 1118, z0: -690, z1: 1110 };
export const inHeritageHill = (x, z) => x > HERITAGE.x0 && x < HERITAGE.x1 && z > HERITAGE.z0 && z < HERITAGE.z1;

const PAINT = ['#d8dcc0', '#a8b494', '#f2e6c4', '#9cb0c0', '#e8d8a8', '#c47060', '#f4f0e6', '#b4a890', '#88a0a4', '#e4c890', '#7c6c88', '#c8b8a0'];
const BRICK = ['#d08a70', '#a8705c', '#b8785e'];
const ROOFS = [['ground:shingles-charcoal', '#ffffff'], ['ground:shingles-charcoal', '#9cb0a0'], ['ground:shingles-brown', '#ffffff'], ['ground:shingles-charcoal', '#c09080'], ['ground:shingles-brown', '#c8b8a8']];
const STYLES = ['queen', 'queen', 'queen', 'italianate', 'colonial', 'foursquare', 'foursquare'];

/** Whether a building is one of the district's houses, to be built here: a house-sized footprint near enough a rectangle. */
export function isHeritageHouse(b, h, area) {
  const [x, z] = b.rings[0][0];
  if (!inHeritageHill(x, z) || b.rings.length > 1) return false;
  const cls = kindOf(b);
  if (cls && !['house', 'detached', 'residential', 'semidetached_house', 'apartments'].includes(cls)) return false;
  if (area < 55 || area > 700 || h > 18) return false;
  const r = boundingRectangle(b.rings[0]);
  return Boolean(r && r.d >= 5 && area / r.area > 0.62);
}

/** A convex polygon `pts`, fanned into triangles, each turned to face `out`; texture coordinates from `uv(p)`. */
export function face(builder, material, pts, color, out, uv) {
  for (let i = 1; i + 1 < pts.length; i++) {
    const a = pts[0], b = pts[i], c = pts[i + 1];
    const n = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])];
    if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] >= 0) builder.tri(material, a, b, c, uv(a), uv(b), uv(c), color);
    else builder.tri(material, a, c, b, uv(a), uv(c), uv(b), color);
  }
}

/** A sloping roof plane (convex, any number of corners), shingled along its eave and up its slope. */
export function roof(builder, material, pts, color, tile = 1.6) {
  const [a, b, c] = pts;
  let n = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])];
  const l = Math.hypot(...n) || 1;
  n = n.map((v) => v / l);
  if (n[1] < 0) n = n.map((v) => -v);
  const eh = Math.hypot(n[0], n[2]) || 1, e = [-n[2] / eh, 0, n[0] / eh];
  let up = [n[1] * e[2] - n[2] * e[1], n[2] * e[0] - n[0] * e[2], n[0] * e[1] - n[1] * e[0]];
  if (up[1] < 0) up = up.map((v) => -v);
  const uv = (p) => { const d = [p[0] - a[0], p[1] - a[1], p[2] - a[2]]; return [(d[0] * e[0] + d[2] * e[2]) / tile, (d[0] * up[0] + d[1] * up[1] + d[2] * up[2]) / tile]; };
  face(builder, material, pts, color, n, uv);
  // The underside of the eave, seen from the street below.
  face(builder, material, pts, color.map((v) => v * 0.45), n.map((v) => -v), uv);
}

/**
 * Builds one of Heritage Hill's houses on footprint `b` (its height `h`), standing at `foot`, its front toward `front`
 * ([dx, dz], the way to its street).
 */
export function heritageHouse(builder, b, h, foot, front, seed, opts = {}) {
  const r = boundingRectangle(b.rings[0]);
  const area = areaOf(b.rings[0]);
  // The house's own frame: `f` toward the street, `s` along the front; W across the front, D deep.
  const A = [r.ax, r.az], P = [-r.az, r.ax];
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1];
  const fd = front ?? [0, 1];
  const alongA = Math.abs(dot(A, fd)) > Math.abs(dot(P, fd));
  let f = alongA ? A : P; if (dot(f, fd) < 0) f = [-f[0], -f[1]];
  const s = [-f[1], f[0]];
  const D = alongA ? r.w : r.d, W = alongA ? r.d : r.w;
  const at = (u, v, y) => [r.x + s[0] * u + f[0] * v, y, r.z + s[1] * u + f[1] * v];

  const style = opts.style ?? STYLES[Math.floor(unit(`${seed}hs`) * STYLES.length) % STYLES.length];
  const brick = opts.brick ?? (style === 'italianate' ? unit(`${seed}br`) < 0.6 : unit(`${seed}br`) < 0.15);
  const paint = linear(opts.paint ?? (brick ? BRICK : PAINT)[Math.floor(unit(`${seed}pc`) * (brick ? BRICK : PAINT).length) % (brick ? BRICK : PAINT).length]);
  const trim = linear(unit(`${seed}tr`) < 0.7 ? '#f4f0e6' : '#4a3a30');
  const [roofMat, roofTint] = ROOFS[Math.floor(unit(`${seed}rf`) * ROOFS.length) % ROOFS.length];
  const roofColor = linear(roofTint);
  const stone = linear('#a49a8c');
  const wallMat = brick ? 'wall:facade:historic' : 'wall:facade:house';
  const storey = brick ? 4.0 : 4.2, ratio = brick ? 0.8 : 1.6;

  // Storeys: two, or three for a big house; the eaves where the map's height (to the ridge) allows.
  const storeys = area > 300 || h > 12 ? 3 : 2;
  const base = foot + 0.9;
  const eave = base + Math.min(storeys * 3.3, Math.max(5.6, h * 0.62));
  const hw = W / 2, hd = D / 2;

  // The foundation: a band of stone all round, and the walls above it.
  const wall = (u0, v0, u1, v1, y0, y1, material, color, rows = null) => {
    const a = at(u0, v0, 0), b2 = at(u1, v1, 0);
    const L = Math.hypot(b2[0] - a[0], b2[2] - a[2]);
    if (L < 0.1) return;
    const m = at((u0 + u1) / 2, (v0 + v1) / 2, 0), o = at(0, 0, 0);
    const out = [m[0] - o[0], 0, m[2] - o[2]];
    const pts = [[a[0], y0, a[2]], [b2[0], y0, b2[2]], [b2[0], y1, b2[2]], [a[0], y1, a[2]]];
    const tH = rows ? (y1 - y0) / rows : 3, tW = rows ? tH / ratio : 3;
    const cols = rows ? Math.max(1, Math.round(L / tW)) : L / tW;
    const uv = (p) => [Math.hypot(p[0] - a[0], p[2] - a[2]) / L * cols, (p[1] - y0) / (rows ? tH : 3)];
    face(builder, material, pts, color, out, uv);
    builder.collide(...[pts[0], pts[1], pts[2]]); builder.collide(pts[0], pts[2], pts[3]);
  };
  const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
  const ring = (fn) => { for (let i = 0; i < 4; i++) { const [u0, v0] = corners[i], [u1, v1] = corners[(i + 1) % 4]; fn(u0, v0, u1, v1); } };
  ring((u0, v0, u1, v1) => {
    wall(u0, v0, u1, v1, foot - 0.3, base, 'road:concrete', stone);
    wall(u0, v0, u1, v1, base, eave, wallMat, paint, Math.max(1, Math.round((eave - base) / storey)));
  });

  // The eaves: a trim band under the roof, deep on an Italianate house (where its brackets stand).
  const eaveDepth = style === 'italianate' ? 0.75 : 0.4;
  const over = style === 'italianate' ? 0.9 : 0.45;
  ring((a0, b0, a1, b1) => {
    wall(a0, b0, a1, b1, eave - eaveDepth, eave, 'road:concrete', trim);
    if (style === 'italianate') {
      // Brackets under the eave, paired, every metre and a half.
      const a = at(a0, b0, 0), c = at(a1, b1, 0), L = Math.hypot(c[0] - a[0], c[2] - a[2]);
      const m = at((a0 + a1) / 2, (b0 + b1) / 2, 0), o = at(0, 0, 0), ml = Math.hypot(m[0] - o[0], m[2] - o[2]) || 1;
      const nx = (m[0] - o[0]) / ml, nz = (m[2] - o[2]) / ml;
      for (let t = 0.8; t < L - 0.5; t += 1.5) {
        const x = a[0] + (c[0] - a[0]) * t / L + nx * over * 0.45, z = a[2] + (c[2] - a[2]) * t / L + nz * over * 0.45;
        const k = 0.12, dx = (c[0] - a[0]) / L * k, dz = (c[2] - a[2]) / L * k, ox = nx * over * 0.45, oz = nz * over * 0.45;
        face(builder, 'road:concrete', [[x - dx - ox, eave - 0.9, z - dz - oz], [x - dx + ox, eave - 0.15, z - dz + oz], [x - dx + ox, eave, z - dz + oz], [x - dx - ox, eave, z - dz - oz]], trim, [-dx, 0, -dz], () => [0, 0]);
        face(builder, 'road:concrete', [[x + dx - ox, eave - 0.9, z + dz - oz], [x + dx + ox, eave - 0.15, z + dz + oz], [x + dx + ox, eave, z + dz + oz], [x + dx - ox, eave, z + dz - oz]], trim, [dx, 0, dz], () => [0, 0]);
      }
    }
  });

  // The roof.
  const R = (u, v, y) => at(u, v, y);
  const ow = hw + over, od = hd + over;
  if (style === 'italianate' || style === 'foursquare') {
    // A hipped roof: low on an Italianate house, steeper on a Foursquare.
    const pitch = style === 'italianate' ? 0.42 : 0.75;
    const ridgeHalf = Math.max(0, (Math.max(ow, od) - Math.min(ow, od)));
    const rise = Math.min(ow, od) * pitch;
    if (ow >= od) {
      const r1 = R(-ridgeHalf, 0, eave + rise), r2 = R(ridgeHalf, 0, eave + rise);
      roof(builder, roofMat, [R(-ow, od, eave), R(ow, od, eave), r2, r1], roofColor);
      roof(builder, roofMat, [R(ow, -od, eave), R(-ow, -od, eave), r1, r2], roofColor);
      roof(builder, roofMat, [R(ow, od, eave), R(ow, -od, eave), r2], roofColor);
      roof(builder, roofMat, [R(-ow, -od, eave), R(-ow, od, eave), r1], roofColor);
    } else {
      const r1 = R(0, -ridgeHalf, eave + rise), r2 = R(0, ridgeHalf, eave + rise);
      roof(builder, roofMat, [R(ow, -od, eave), R(ow, od, eave), r2, r1], roofColor);
      roof(builder, roofMat, [R(-ow, od, eave), R(-ow, -od, eave), r1, r2], roofColor);
      roof(builder, roofMat, [R(-ow, od, eave), R(ow, od, eave), r2], roofColor);
      roof(builder, roofMat, [R(ow, -od, eave), R(-ow, -od, eave), r1], roofColor);
    }
    if (style === 'foursquare') dormer(builder, at, 0, hd * 0.35, eave + rise * 0.35, Math.min(2.6, W * 0.3), rise, paint, trim, roofMat, roofColor, f, s, true);
    if (style === 'italianate' && unit(`${seed}cu`) < 0.4) {
      // A cupola on the ridge: a little square lantern with its own low roof.
      const c = R(0, 0, eave + rise), k = 1.1;
      for (const [u0, v0, u1, v1] of [[-k, -k, k, -k], [k, -k, k, k], [k, k, -k, k], [-k, k, -k, -k]]) {
        const p0 = at(u0, v0, 0), p1 = at(u1, v1, 0);
        face(builder, 'wall:facade:house', [[p0[0], c[1] - 0.3, p0[2]], [p1[0], c[1] - 0.3, p1[2]], [p1[0], c[1] + 1.6, p1[2]], [p0[0], c[1] + 1.6, p0[2]]], paint, [((p0[0] + p1[0]) / 2 - c[0]), 0, ((p0[2] + p1[2]) / 2 - c[2])], (p) => [Math.hypot(p[0] - p0[0], p[2] - p0[2]) / 2, (p[1] - c[1] + 0.3) / 2]);
      }
      const top = R(0, 0, c[1] + 2.4);
      for (const [u0, v0, u1, v1] of [[-k - 0.3, -k - 0.3, k + 0.3, -k - 0.3], [k + 0.3, -k - 0.3, k + 0.3, k + 0.3], [k + 0.3, k + 0.3, -k - 0.3, k + 0.3], [-k - 0.3, k + 0.3, -k - 0.3, -k - 0.3]]) roof(builder, roofMat, [R(u0, v0, c[1] + 1.6), R(u1, v1, c[1] + 1.6), top], roofColor);
    }
  } else {
    // A gabled roof: its ridge along the front for a Colonial (dormers on the front slope), from front to back for a
    // Queen Anne (its gable to the street), steep.
    const sideGable = style === 'colonial';
    const pitch = style === 'queen' ? 1.05 : 0.7;
    if (sideGable) {
      const rise = od * pitch;
      roof(builder, roofMat, [R(-ow, od, eave), R(ow, od, eave), R(ow, 0, eave + rise), R(-ow, 0, eave + rise)], roofColor);
      roof(builder, roofMat, [R(ow, -od, eave), R(-ow, -od, eave), R(-ow, 0, eave + rise), R(ow, 0, eave + rise)], roofColor);
      for (const u of [-hw, hw]) gableEnd(builder, at, u, -hd, hd, eave, rise, paint, Math.sign(u), s, f, 'v');
      const n = W > 11 ? 3 : 2;
      for (let k = 0; k < n; k++) dormer(builder, at, -hw + W * (k + 0.5) / n, hd * 0.4, eave + rise * 0.3, 1.8, rise, paint, trim, roofMat, roofColor, f, s, false);
    } else {
      const rise = ow * pitch;
      roof(builder, roofMat, [R(ow, od, eave), R(ow, -od, eave), R(0, -od, eave + rise), R(0, od, eave + rise)], roofColor);
      roof(builder, roofMat, [R(-ow, -od, eave), R(-ow, od, eave), R(0, od, eave + rise), R(0, -od, eave + rise)], roofColor);
      for (const v of [-hd, hd]) gableEnd(builder, at, v, -hw, hw, eave, rise, paint, Math.sign(v), s, f, 'u');
      // A cross gable on one side, and a round-cornered tower at a front corner on most.
      const side = unit(`${seed}sd`) < 0.5 ? -1 : 1;
      const cg = Math.min(hd * 0.6, 3.5);
      const crossRise = cg * pitch;
            roof(builder, roofMat, [R(side * ow, cg + 0.3, eave), R(side * ow, 0, eave + crossRise), R(side * hw * 0.3, 0, eave + crossRise), R(side * hw * 0.3, cg + 0.3, eave)], roofColor);
      roof(builder, roofMat, [R(side * ow, -cg - 0.3, eave), R(side * ow, 0, eave + crossRise), R(side * hw * 0.3, 0, eave + crossRise), R(side * hw * 0.3, -cg - 0.3, eave)], roofColor);
      gableEnd(builder, at, side * hw, -cg, cg, eave, crossRise, paint, side, s, f, 'side');
      if ((opts.tower ?? unit(`${seed}tw`) < 0.6) && W > 7) tower(builder, at(-side * (hw - 0.4), hd - 0.4, 0), base, eave, Math.min(2, W * 0.16), paint, roofMat, roofColor, foot);
    }
  }

  // The porch: a deck on the front, its roof on turned posts; across the whole front of a Foursquare, part of it otherwise.
  const pw = style === 'foursquare' ? W : style === 'colonial' ? Math.min(W * 0.4, 4.5) : W * 0.7;
  const pu = style === 'queen' ? (unit(`${seed}pu`) - 0.5) * (W - pw) : 0;
  const pd = 2.4, deck = base, proof = base + 3.0;
  const cornersP = [[pu - pw / 2, hd], [pu + pw / 2, hd], [pu + pw / 2, hd + pd], [pu - pw / 2, hd + pd]];
  face(builder, 'road:concrete', cornersP.map(([u, v]) => at(u, v, deck)), linear('#b8a88c'), [0, 1, 0], (p) => [p[0] / 2, p[2] / 2]);
  for (const [u0, v0, u1, v1] of [[pu - pw / 2, hd + pd, pu + pw / 2, hd + pd], [pu + pw / 2, hd, pu + pw / 2, hd + pd], [pu - pw / 2, hd + pd, pu - pw / 2, hd]]) {
    const a = at(u0, v0, 0), c = at(u1, v1, 0), L = Math.hypot(c[0] - a[0], c[2] - a[2]) || 1;
    const m = at((u0 + u1) / 2, (v0 + v1) / 2, 0), o = at(pu, hd + pd / 2, 0);
    face(builder, 'road:concrete', [[a[0], foot - 0.3, a[2]], [c[0], foot - 0.3, c[2]], [c[0], deck, c[2]], [a[0], deck, a[2]]], stone, [m[0] - o[0], 0, m[2] - o[2]], (p) => [Math.hypot(p[0] - a[0], p[2] - a[2]) / L / 2, p[1] / 2]);
  }
  roof(builder, roofMat, [at(pu - pw / 2 - 0.3, hd, proof + 0.5), at(pu + pw / 2 + 0.3, hd, proof + 0.5), at(pu + pw / 2 + 0.3, hd + pd + 0.3, proof), at(pu - pw / 2 - 0.3, hd + pd + 0.3, proof)], roofColor);
  const posts = Math.max(2, Math.round(pw / 2.2) + 1);
  for (let k = 0; k < posts; k++) {
    const u = pu - pw / 2 + 0.15 + (pw - 0.3) * k / (posts - 1);
    post(builder, at(u, hd + pd - 0.15, 0), deck, proof, trim);
  }
  // The rail along the porch's front.
  const ra = at(pu - pw / 2, hd + pd - 0.15, 0), rb = at(pu + pw / 2, hd + pd - 0.15, 0);
  face(builder, 'road:concrete', [[ra[0], deck + 0.85, ra[2]], [rb[0], deck + 0.85, rb[2]], [rb[0], deck + 0.95, rb[2]], [ra[0], deck + 0.95, ra[2]]], trim, [f[0], 0, f[1]], () => [0, 0]);

  // The chimney: brick, through the roof near one end.
  // Its height: a metre and more above the roof where it comes through (about a third of the way down from the ridge).
  const rise = style === 'italianate' ? Math.min(ow, od) * 0.42 : style === 'foursquare' ? Math.min(ow, od) * 0.75 : style === 'colonial' ? od * 0.7 : ow * 1.05;
  const cu = (unit(`${seed}ch`) < 0.5 ? -1 : 1) * hw * 0.3, cv = -hd * 0.25;
  const top = eave + rise * 0.72 + 1.3;
  const brickColor = linear('#a86454');
  for (const [u0, v0, u1, v1] of [[-0.45, -0.35, 0.45, -0.35], [0.45, -0.35, 0.45, 0.35], [0.45, 0.35, -0.45, 0.35], [-0.45, 0.35, -0.45, -0.35]]) {
    const a = at(cu + u0, cv + v0, 0), c = at(cu + u1, cv + v1, 0);
    const mid = at(cu + (u0 + u1) / 2, cv + (v0 + v1) / 2, 0), ctr = at(cu, cv, 0);
    face(builder, 'wall:facade:historic', [[a[0], eave - 1, a[2]], [c[0], eave - 1, c[2]], [c[0], top, c[2]], [a[0], top, a[2]]], brickColor, [mid[0] - ctr[0], 0, mid[2] - ctr[2]], (p) => [Math.hypot(p[0] - a[0], p[2] - a[2]) / 3.6, (p[1] - eave) / 3.6]);
  }
  face(builder, 'road:concrete', [at(cu - 0.5, cv - 0.4, top), at(cu + 0.5, cv - 0.4, top), at(cu + 0.5, cv + 0.4, top), at(cu - 0.5, cv + 0.4, top)], linear('#3a3430'), [0, 1, 0], () => [0, 0]);
}

/** The triangle of wall under a gable's end: at `at0` along the axis named `axis`, from `a` to `b` across it, `rise` high. */
export function gableEnd(builder, at, at0, a, b, eave, rise, color, sign, s, f, axis) {
  const P = (t, y) => (axis === 'u' ? at(t, at0, y) : at(at0, t, y));
  const pts = axis === 'side' ? [at(at0, a, eave), at(at0, b, eave), at(at0, 0, eave + rise)] : [P(a, eave), P(b, eave), P((a + b) / 2, eave + rise)];
  const out = axis === 'u' ? [f[0] * sign, 0, f[1] * sign] : [s[0] * sign, 0, s[1] * sign];
  const o = pts[0];
  // Shingled or clapboarded in the gable: drawn in the house's paint, a little lighter.
  face(builder, 'wall:clapboard', pts, color.map((c) => Math.min(1.2, c * 1.06)), out, (p) => [Math.hypot(p[0] - o[0], p[2] - o[2]) / 3, (p[1] - o[1]) / 3]);
}

/** A dormer in a roof's slope: a little gabled (or hipped) window box, its face toward `f`. */
export function dormer(builder, at, u, v, y, w, rise, color, trim, roofMat, roofColor, f, s, hipped) {
  const h = Math.min(1.8, rise * 0.55), d = 1.8;
  const front = [at(u - w / 2, v, y), at(u + w / 2, v, y), at(u + w / 2, v, y + h), at(u - w / 2, v, y + h)];
  face(builder, 'wall:facade:house', front, color, [f[0], 0, f[1]], (p) => [Math.hypot(p[0] - front[0][0], p[2] - front[0][2]) / w, (p[1] - y) / h * 0.6 + 0.2]);
  for (const k of [-1, 1]) {
    const side = [at(u + k * w / 2, v, y), at(u + k * w / 2, v - d, y + h), at(u + k * w / 2, v, y + h)];
    face(builder, 'road:concrete', side, trim, [s[0] * k, 0, s[1] * k], () => [0, 0]);
  }
  const top = y + h + (hipped ? 0.6 : w * 0.5);
  if (hipped) roof(builder, roofMat, [at(u - w / 2 - 0.2, v + 0.3, y + h), at(u + w / 2 + 0.2, v + 0.3, y + h), at(u, v - d * 0.5, top)], roofColor);
  else {
    roof(builder, roofMat, [at(u - w / 2 - 0.2, v + 0.3, y + h), at(u, v + 0.3, top), at(u, v - d, top), at(u - w / 2 - 0.2, v - d, y + h)], roofColor);
    roof(builder, roofMat, [at(u + w / 2 + 0.2, v + 0.3, y + h), at(u, v + 0.3, top), at(u, v - d, top), at(u + w / 2 + 0.2, v - d, y + h)], roofColor);
    face(builder, 'wall:clapboard', [at(u - w / 2, v + 0.05, y + h), at(u + w / 2, v + 0.05, y + h), at(u, v + 0.05, top - 0.1)], color, [f[0], 0, f[1]], (p) => [p[0] / 3, p[1] / 3]);
  }
}

/** A round-cornered Queen Anne tower: eight sided, a storey above the eaves, with a tall conical cap. */
export function tower(builder, c, base, eave, r, color, roofMat, roofColor, foot) {
  const sides = 8, top = eave + 2.6, cap = top + r * 2.6;
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2, a1 = ((i + 1) / sides) * Math.PI * 2;
    const p0 = [c[0] + Math.cos(a0) * r, c[2] + Math.sin(a0) * r], p1 = [c[0] + Math.cos(a1) * r, c[2] + Math.sin(a1) * r];
    const am = (a0 + a1) / 2, out = [Math.cos(am), 0, Math.sin(am)];
    const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    face(builder, 'road:concrete', [[p0[0], foot - 0.3, p0[1]], [p1[0], foot - 0.3, p1[1]], [p1[0], base, p1[1]], [p0[0], base, p0[1]]], linear('#a49a8c'), out, () => [0, 0]);
    face(builder, 'wall:facade:house', [[p0[0], base, p0[1]], [p1[0], base, p1[1]], [p1[0], top, p1[1]], [p0[0], top, p0[1]]], color, out, (p) => [Math.hypot(p[0] - p0[0], p[2] - p0[1]) / L * 0.6, (p[1] - base) / 4.2]);
    const q0 = [c[0] + Math.cos(a0) * (r + 0.35), top, c[2] + Math.sin(a0) * (r + 0.35)], q1 = [c[0] + Math.cos(a1) * (r + 0.35), top, c[2] + Math.sin(a1) * (r + 0.35)];
    roof(builder, roofMat, [q0, q1, [c[0], cap, c[2]]], roofColor);
  }
  builder.trunks.push([c[0], c[2], r, foot, top]);
}

/** A porch post: a slim square column, from the deck to the porch roof. */
export function post(builder, p, y0, y1, color) {
  const k = 0.1, c = [[-k, -k], [k, -k], [k, k], [-k, k]];
  for (let i = 0; i < 4; i++) {
    const [ax, az] = c[i], [bx, bz] = c[(i + 1) % 4];
    const a = [p[0] + ax, y0, p[2] + az], b = [p[0] + bx, y0, p[2] + bz];
    face(builder, 'road:concrete', [a, b, [b[0], y1, b[2]], [a[0], y1, a[2]]], color, [ax + bx, 0, az + bz], () => [0, 0]);
  }
}
