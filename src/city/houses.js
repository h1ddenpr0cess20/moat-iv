import { linear } from './builder.js';
import { areaOf, boundingRectangle, unit } from './geometry.js';
import { dormer, face, gableEnd, heritageHouse, post, roof } from './heritage.js';

/**
 * The houses of Grand Rapids and its suburbs, built as the kinds the region has rather than as boxes under hip roofs:
 * the postwar ranch (one storey, a low hipped roof, brick or siding, a garage door at one end), the two-storey
 * traditional of the subdivisions (side-gabled, siding, an attached garage, a gabled porch over the door), the Cape Cod
 * (a storey and a half under a steep side gable, two dormers), the Craftsman bungalow (a low front gable with a deep
 * overhang and a wide porch on brick piers), the front-gabled cottage of the old neighbourhoods (narrow, steep, a small
 * porch), the Dutch Colonial's gambrel (the West Michigan Dutch settlers' barn roof, as a house's), and the Foursquare.
 * (Heritage Hill's own houses are heritage.js's; the Jenison Museum, an old house with a turret, is one of those.)
 *
 * What a house is comes from its footprint, its height (a one-storey ranch is under 5.4 m to its ridge, a two-storey
 * 8 m and more) and its size; which of the kinds it is, where they overlap, from its id, so a street of them is mixed.
 * They are lean (a few dozen triangles) because there are 160 000 of them: no foundation band, no eaves trim, a chimney
 * of four faces. Each faces the street it is nearest.
 */

const SIDING = ['#e8e2d2', '#d9d4c4', '#c9c4b6', '#b8c4c8', '#a8b8a0', '#d6c9a8', '#f2f0ea', '#8f9aa6', '#b9a58a', '#c3b39c', '#cdb8a0', '#9aa8a0'];
const BRICKS = ['#e0b090', '#cf9474', '#e6c8a6', '#bf8a70', '#dcc9b0', '#b09484', '#d4a080'];
const ROOFS = [['ground:shingles-charcoal', '#ffffff'], ['ground:shingles-brown', '#ffffff'], ['ground:shingles-charcoal', '#c8b8a8'], ['ground:shingles-brown', '#c8b8a8'], ['ground:shingles-charcoal', '#9cb0a0']];

/**
 * Each kind: its eave height above the floor (m), its roof (`hip`, `side` gable, `front` gable, `gambrel`) and the pitch
 * (rise over run), how far the eaves overhang, its porch, its dormers, whether the garage door shows, how often it has a
 * chimney and a brick front.
 */
export const KINDS = {
  ranch: { eave: 2.7, roof: 'hip', pitch: 0.4, over: 0.65, porch: 'stoop', dormers: 0, garage: true, chimney: 0.55, brick: 0.5 },
  traditional: { eave: 5.5, roof: 'side', pitch: 0.55, over: 0.45, porch: 'portico', dormers: 0, garage: true, chimney: 0.5, brick: 0.3 },
  cape: { eave: 3.1, roof: 'side', pitch: 1.0, over: 0.35, porch: 'stoop', dormers: 2, garage: false, chimney: 0.9, brick: 0.1 },
  bungalow: { eave: 3.3, roof: 'front', pitch: 0.6, over: 0.8, porch: 'bungalow', dormers: 0, garage: false, chimney: 0.7, brick: 0.25 },
  gablefront: { eave: 4.4, roof: 'front', pitch: 1.05, over: 0.4, porch: 'small', dormers: 0, garage: false, chimney: 0.6, brick: 0.05 },
  dutch: { eave: 3.4, roof: 'gambrel', pitch: 0, over: 0.45, porch: 'small', dormers: 2, garage: false, chimney: 0.7, brick: 0.1 },
};

/** Whether a building is a house to be built as one of these: tagged a house, house-sized, a footprint near a rectangle. */
export function isTypicalHouse(b, h, area) {
  if (b.use !== 'house' || b.rings.length > 1 || area < 50 || area > 420 || h > 13.5) return false;
  const r = boundingRectangle(b.rings[0]);
  return Boolean(r && r.d >= 4.5 && area / r.area > 0.66);
}

/** Which kind of house, from its height to the ridge (m), its footprint (m²) and a key that varies from house to house. */
export function pickKind(h, area, seed) {
  const r = unit(`${seed}kind`);
  if (area < 70) return r < 0.55 ? 'gablefront' : 'bungalow';
  if (h <= 5.4) return area > 105 ? (r < 0.82 ? 'ranch' : 'bungalow') : 'bungalow';
  if (h <= 7.6) return r < 0.34 ? 'cape' : r < 0.58 ? 'gablefront' : r < 0.78 ? 'bungalow' : r < 0.9 ? 'dutch' : 'ranch';
  return r < 0.5 ? 'traditional' : r < 0.68 ? 'foursquare' : r < 0.84 ? 'dutch' : 'gablefront';
}

const pick = (list, key) => list[Math.floor(unit(key) * list.length) % list.length];

/** Builds a house of `kind` on footprint `b` (height `h` to its ridge) standing at `foot`, its front toward `front` ([dx, dz]). */
export function typicalHouse(builder, b, h, foot, front, seed, kind) {
  if (kind === 'foursquare') return heritageHouse(builder, b, h, foot, front, seed, { style: 'foursquare', brick: unit(`${seed}fb`) < 0.2 });
  const P = KINDS[kind];
  const r = boundingRectangle(b.rings[0]);
  const area = areaOf(b.rings[0]);
  // The house's own frame: `f` toward the street, `s` along the front; W across the front, D deep.
  const A = [r.ax, r.az], Q = [-r.az, r.ax];
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1];
  const fd = front ?? [0, 1];
  const alongA = Math.abs(dot(A, fd)) > Math.abs(dot(Q, fd));
  let f = alongA ? A : Q; if (dot(f, fd) < 0) f = [-f[0], -f[1]];
  const s = [-f[1], f[0]];
  const D = alongA ? r.w : r.d, W = alongA ? r.d : r.w;
  const at = (u, v, y) => [r.x + s[0] * u + f[0] * v, y, r.z + s[1] * u + f[1] * v];
  const hw = W / 2, hd = D / 2;

  const brick = unit(`${seed}br`) < P.brick;
  const paint = linear(brick ? pick(BRICKS, `${seed}bc`) : pick(SIDING, `${seed}pc`));
  const trim = linear(unit(`${seed}tr`) < 0.8 ? '#f4f0e6' : '#4a3a30');
  const [roofMat, roofTint] = pick(ROOFS, `${seed}rf`) ;
  const roofColor = linear(roofTint);
  const wallMat = brick ? 'wall:facade:brick' : 'wall:facade:house';
  const storey = brick ? 3.9 : 4.2, ratio = brick ? 1.2 : 1.6;

  const base = foot + 0.3;
  const eave = base + Math.min(P.eave, Math.max(2.4, h * 0.74));
  const rows = Math.max(1, Math.round((eave - base) / storey));

  // The walls, four faces, with their collision.
  const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
  const o = at(0, 0, 0);
  for (let i = 0; i < 4; i++) {
    const [u0, v0] = corners[i], [u1, v1] = corners[(i + 1) % 4];
    const a = at(u0, v0, 0), c = at(u1, v1, 0);
    const L = Math.hypot(c[0] - a[0], c[2] - a[2]);
    const m = at((u0 + u1) / 2, (v0 + v1) / 2, 0);
    const out = [m[0] - o[0], 0, m[2] - o[2]];
    const pts = [[a[0], foot - 0.3, a[2]], [c[0], foot - 0.3, c[2]], [c[0], eave, c[2]], [a[0], eave, a[2]]];
    const tH = (eave - foot + 0.3) / rows, tW = tH / ratio, cols = Math.max(1, Math.round(L / tW));
    face(builder, wallMat, pts, paint, out, (p) => [Math.hypot(p[0] - a[0], p[2] - a[2]) / L * cols, (p[1] - pts[0][1]) / tH]);
    builder.collide(pts[0], pts[1], pts[2]); builder.collide(pts[0], pts[2], pts[3]);
  }

  // The roof.
  const R = (u, v, y) => at(u, v, y);
  const ow = hw + P.over, od = hd + P.over;
  let ridge = eave;
  if (P.roof === 'hip') {
    const rise = Math.min(ow, od) * P.pitch, half = Math.abs(ow - od);
    ridge = eave + rise;
    if (ow >= od) {
      const r1 = R(-half, 0, ridge), r2 = R(half, 0, ridge);
      roof(builder, roofMat, [R(-ow, od, eave), R(ow, od, eave), r2, r1], roofColor);
      roof(builder, roofMat, [R(ow, -od, eave), R(-ow, -od, eave), r1, r2], roofColor);
      roof(builder, roofMat, [R(ow, od, eave), R(ow, -od, eave), r2], roofColor);
      roof(builder, roofMat, [R(-ow, -od, eave), R(-ow, od, eave), r1], roofColor);
    } else {
      const r1 = R(0, -half, ridge), r2 = R(0, half, ridge);
      roof(builder, roofMat, [R(ow, -od, eave), R(ow, od, eave), r2, r1], roofColor);
      roof(builder, roofMat, [R(-ow, od, eave), R(-ow, -od, eave), r1, r2], roofColor);
      roof(builder, roofMat, [R(-ow, od, eave), R(ow, od, eave), r2], roofColor);
      roof(builder, roofMat, [R(ow, -od, eave), R(-ow, -od, eave), r1], roofColor);
    }
  } else if (P.roof === 'side') {
    const rise = od * P.pitch;
    ridge = eave + rise;
    roof(builder, roofMat, [R(-ow, od, eave), R(ow, od, eave), R(ow, 0, ridge), R(-ow, 0, ridge)], roofColor);
    roof(builder, roofMat, [R(ow, -od, eave), R(-ow, -od, eave), R(-ow, 0, ridge), R(ow, 0, ridge)], roofColor);
    for (const u of [-hw, hw]) gableEnd(builder, at, u, -hd, hd, eave, rise, paint, Math.sign(u), s, f, 'v');
  } else if (P.roof === 'front') {
    const rise = ow * P.pitch;
    ridge = eave + rise;
    roof(builder, roofMat, [R(ow, od, eave), R(ow, -od, eave), R(0, -od, ridge), R(0, od, ridge)], roofColor);
    roof(builder, roofMat, [R(-ow, -od, eave), R(-ow, od, eave), R(0, od, ridge), R(0, -od, ridge)], roofColor);
    for (const v of [-hd, hd]) gableEnd(builder, at, v, -hw, hw, eave, rise, paint, Math.sign(v), s, f, 'u');
  } else {
    // The gambrel: steep below, shallow above, along the width.
    const runLow = od * 0.46, riseLow = runLow * 1.9, riseUp = (od - runLow) * 0.42;
    ridge = eave + riseLow + riseUp;
    const lowY = eave + riseLow, vMid = od - runLow;
    for (const k of [1, -1]) {
      roof(builder, roofMat, k > 0 ? [R(-ow, od, eave), R(ow, od, eave), R(ow, vMid, lowY), R(-ow, vMid, lowY)] : [R(ow, -od, eave), R(-ow, -od, eave), R(-ow, -vMid, lowY), R(ow, -vMid, lowY)], roofColor);
      roof(builder, roofMat, k > 0 ? [R(-ow, vMid, lowY), R(ow, vMid, lowY), R(ow, 0, ridge), R(-ow, 0, ridge)] : [R(ow, -vMid, lowY), R(-ow, -vMid, lowY), R(-ow, 0, ridge), R(ow, 0, ridge)], roofColor);
    }
    // The gable ends: five-sided.
    const sc = hd / od;
    for (const u of [-hw, hw]) {
      const pts = [at(u, -hd, eave), at(u, hd, eave), at(u, hd - runLow * sc, eave + riseLow), at(u, 0, ridge), at(u, -hd + runLow * sc, eave + riseLow)];
      const out = [s[0] * Math.sign(u), 0, s[1] * Math.sign(u)];
      face(builder, 'wall:clapboard', pts, paint.map((c) => Math.min(1.2, c * 1.06)), out, (p) => [p[0] / 3, p[1] / 3]);
    }
    for (let k = 0; k < P.dormers; k++) dormer(builder, at, -hw + W * (k + 0.5) / P.dormers, hd * 0.55, eave + riseLow * 0.3, 1.6, riseLow, paint, trim, roofMat, roofColor, f, s, false);
  }
  if (P.dormers && P.roof === 'side') {
    const rise = od * P.pitch;
    const n = W > 11 ? 3 : 2;
    for (let k = 0; k < n; k++) dormer(builder, at, -hw + W * (k + 0.5) / n, hd * 0.4, eave + rise * 0.3, 1.7, rise, paint, trim, roofMat, roofColor, f, s, false);
  }

  // The door end: a garage door under the roof's edge at one end of a wide house, else the porch.
  const wide = W >= 12;
  const end = unit(`${seed}ge`) < 0.5 ? -1 : 1;
  if (P.garage && wide) {
    const gw = Math.min(5.0, W * 0.4), gu = end * (hw - gw / 2 - 0.7), v = hd + 0.04;
    const pts = [at(gu - gw / 2, v, foot + 0.1), at(gu + gw / 2, v, foot + 0.1), at(gu + gw / 2, v, foot + 2.15), at(gu - gw / 2, v, foot + 2.15)];
    face(builder, 'wall:facade:garage', pts, [1, 1, 1], [f[0], 0, f[1]], (p) => [Math.hypot(p[0] - pts[0][0], p[2] - pts[0][2]) / 3, (p[1] - pts[0][1]) / 3]);
  }
  const doorU = P.garage && wide ? -end * (hw - Math.min(3.2, W * 0.3)) : (unit(`${seed}du`) - 0.5) * Math.max(0, W - 5) * 0.6;
  const deck = base, posts = (u, w) => { post(builder, at(u - w / 2 + 0.1, hd + 1.7, 0), deck, deck + 2.6, trim); post(builder, at(u + w / 2 - 0.1, hd + 1.7, 0), deck, deck + 2.6, trim); };
  if (P.porch === 'portico') {
    // A gabled hood over the door on two posts.
    const w = 3.4, d = 2.0, y = deck + 2.7, top = y + 1.0;
    posts(doorU, w);
    roof(builder, roofMat, [at(doorU - w / 2 - 0.2, hd + d + 0.2, y), at(doorU, hd + d + 0.2, top), at(doorU, hd - 0.05, top + 0.4), at(doorU - w / 2 - 0.2, hd - 0.05, y + 0.4)], roofColor);
    roof(builder, roofMat, [at(doorU + w / 2 + 0.2, hd + d + 0.2, y), at(doorU + w / 2 + 0.2, hd - 0.05, y + 0.4), at(doorU, hd - 0.05, top + 0.4), at(doorU, hd + d + 0.2, top)], roofColor);
    face(builder, 'wall:clapboard', [at(doorU - w / 2 - 0.2, hd + d + 0.2, y), at(doorU + w / 2 + 0.2, hd + d + 0.2, y), at(doorU, hd + d + 0.2, top)], trim, [f[0], 0, f[1]], (p) => [p[0] / 3, p[1] / 3]);
  } else if (P.porch === 'small') {
    // A shallow porch with a shed roof on two posts.
    const w = Math.min(4.2, W * 0.5), d = 1.9, y = deck + 2.6;
    posts(doorU, w);
    roof(builder, roofMat, [at(doorU - w / 2 - 0.2, hd + d + 0.2, y), at(doorU + w / 2 + 0.2, hd + d + 0.2, y), at(doorU + w / 2 + 0.2, hd - 0.05, y + 0.55), at(doorU - w / 2 - 0.2, hd - 0.05, y + 0.55)], roofColor);
  } else if (P.porch === 'bungalow') {
    // The wide porch under the gable's overhang, on stout tapered posts over brick piers.
    const w = Math.min(W * 0.78, 9), d = 2.3, y = eave - 0.1;
    const pier = linear('#a8705c');
    const px = unit(`${seed}bp`) < 0.5 ? -1 : 1, cu = px * (W - w) / 2 * 0.5;
    for (const u of [cu - w / 2 + 0.3, cu + w / 2 - 0.3]) {
      const c = at(u, hd + d - 0.3, 0);
      for (let i = 0; i < 4; i++) {
        const [ax, az] = [[-1, -1], [1, -1], [1, 1], [-1, 1]][i], [bx, bz] = [[-1, -1], [1, -1], [1, 1], [-1, 1]][(i + 1) % 4];
        face(builder, 'wall:facade:brick', [[c[0] + ax * 0.32, deck - 0.1, c[2] + az * 0.32], [c[0] + bx * 0.32, deck - 0.1, c[2] + bz * 0.32], [c[0] + bx * 0.32, deck + 1.0, c[2] + bz * 0.32], [c[0] + ax * 0.32, deck + 1.0, c[2] + az * 0.32]], pier, [ax + bx, 0, az + bz], () => [0, 0]);
      }
      post(builder, [c[0], 0, c[2]], deck + 1.0, y, trim);
    }
    roof(builder, roofMat, [at(cu - w / 2 - 0.3, hd + d + 0.3, y - 0.3), at(cu + w / 2 + 0.3, hd + d + 0.3, y - 0.3), at(cu + w / 2 + 0.3, hd - 0.05, y + 0.7), at(cu - w / 2 - 0.3, hd - 0.05, y + 0.7)], roofColor);
  }

  // The chimney: four faces of brick through the roof, a little up the slope from its end.
  if (unit(`${seed}ch`) < P.chimney) {
    const cu = (unit(`${seed}cu`) < 0.5 ? -1 : 1) * hw * 0.45, cv = P.roof === 'front' ? 0 : -hd * 0.3;
    const top = Math.max(eave + 1.2, ridge - (P.roof === 'hip' ? 0.2 : 0.1)) + 0.9;
    const brickColor = linear('#a86454');
    for (const [u0, v0, u1, v1] of [[-0.4, -0.3, 0.4, -0.3], [0.4, -0.3, 0.4, 0.3], [0.4, 0.3, -0.4, 0.3], [-0.4, 0.3, -0.4, -0.3]]) {
      const a = at(cu + u0, cv + v0, 0), c = at(cu + u1, cv + v1, 0), m = at(cu + (u0 + u1) / 2, cv + (v0 + v1) / 2, 0), ctr = at(cu, cv, 0);
      face(builder, 'wall:facade:brick', [[a[0], eave - 0.5, a[2]], [c[0], eave - 0.5, c[2]], [c[0], top, c[2]], [a[0], top, a[2]]], brickColor, [m[0] - ctr[0], 0, m[2] - ctr[2]], () => [0, 0]);
    }
  }
}
