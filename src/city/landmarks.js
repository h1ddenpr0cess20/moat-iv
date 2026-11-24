import { linear } from './builder.js';
import { areaOf, inside, open, unit } from './geometry.js';
import { heightOf } from './buildings.js';

/**
 * The places downtown that are more than a footprint and a height, built as their photographs and the USGS aerial
 * photograph show them:
 *
 * - Rosa Parks Circle (Maya Lin's "Ecliptic", 2001): a round plaza of pale concrete some 35 m across, set with the
 *   fiber-optic stars of the night sky over Grand Rapids at the turn of the millennium, that floods to be the city's
 *   ice rink in winter; round it, concentric steps of granite curb and stone dust that rise to the lawns and the
 *   birches; on its south-west edge the stage, a flat round steel canopy held up on a concrete core; tall light masts
 *   and cafe tables about it.
 * - The Grand Rapids Art Museum's porch: the great flat canopy of its roof carried out over the entrance on concrete
 *   piers, facing the circle.
 * - The Public Museum's planetarium domes, and the Calder's red stabile, La Grande Vitesse, on Calder Plaza.
 */

/** Where Rosa Parks Circle's plaza is (its center, meters) and how big: from the aerial photograph. */
export const ROSA_PARKS = { center: [-290.4, -177.5], radius: 17.5, rings: 4, tread: 1.35, rise: 0.15, stage: [-306, -161] };
/** The map's footprint of the stage canopy, built here and not as a building. */
export const STAGE_ID = '9587c289-6bfc-4e87-8c6d-342742867449';
/** Where La Grande Vitesse stands on Calder Plaza (from the aerial photograph). */
export const VITESSE = [-254, -590];

const TAU = Math.PI * 2;

/** A flat ring (or disc, `r0` = 0) at height `y`, from `a0` to `a1` round the circle, facing up. */
function annulus(builder, material, [cx, cz], r0, r1, y, color, { tile = 3, collide = true, seg = 72, a0 = 0, a1 = TAU } = {}) {
  const n = Math.max(6, Math.ceil(seg * (a1 - a0) / TAU));
  const P = (r, a) => [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r];
  const uv = (p) => [p[0] / tile, p[2] / tile];
  for (let i = 0; i < n; i++) {
    const t0 = a0 + (a1 - a0) * i / n, t1 = a0 + (a1 - a0) * (i + 1) / n;
    // Seen from above, counter-clockwise: the outer edge from t1 back to t0, then in.
    const a = P(r1, t1), b = P(r1, t0), c = P(r0, t0), d = P(r0, t1);
    if (r0 > 0.01) builder.quad(material, a, b, c, d, uv(a), uv(b), uv(c), uv(d), color, [0, 1, 0]);
    else builder.tri(material, a, b, c, uv(a), uv(b), uv(c), color, [0, 1, 0]);
    if (collide) { builder.collide(a, b, c); if (r0 > 0.01) builder.collide(a, c, d); }
  }
}

/** The upright face of a circle of radius `r`, from y0 to y1, facing out (or in, with `inward`). */
function drum(builder, material, [cx, cz], r, y0, y1, color, { tile = 3, collide = true, seg = 72, inward = false, a0 = 0, a1 = TAU } = {}) {
  const n = Math.max(6, Math.ceil(seg * (a1 - a0) / TAU));
  for (let i = 0; i < n; i++) {
    let t0 = a0 + (a1 - a0) * i / n, t1 = a0 + (a1 - a0) * (i + 1) / n;
    if (inward) [t0, t1] = [t1, t0];
    const p0 = [cx + Math.cos(t0) * r, cz + Math.sin(t0) * r], p1 = [cx + Math.cos(t1) * r, cz + Math.sin(t1) * r];
    const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const a = [p0[0], y0, p0[1]], b = [p1[0], y0, p1[1]], c = [p1[0], y1, p1[1]], d = [p0[0], y1, p0[1]];
    // Walls run so that, seen from outside, the way round is to the right: here clockwise seen from above.
    builder.quad(material, b, a, d, c, [L / tile, 0], [0, 0], [0, (y1 - y0) / tile], [L / tile, (y1 - y0) / tile], color);
    if (collide) { builder.collide(b, a, d); builder.collide(b, d, c); }
  }
}

/** A box: four walls and a lid, centerd on (x, z), `w` along (ax, az), `d` across, from y0 to y1. */
function block(builder, material, x, z, ax, az, w, d, y0, y1, color, { collide = false, lid = true } = {}) {
  const px = -az, pz = ax;
  const P = (s, t, y) => [x + ax * s * w / 2 + px * t * d / 2, y, z + az * s * w / 2 + pz * t * d / 2];
  const c = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  for (let i = 0; i < 4; i++) {
    const [s0, t0] = c[(i + 1) % 4], [s1, t1] = c[i];
    const a = P(s0, t0, y0), b = P(s1, t1, y0), cc = P(s1, t1, y1), dd = P(s0, t0, y1);
    builder.quad(material, a, b, cc, dd, [0, 0], [1, 0], [1, 1], [0, 1], color);
    if (collide) { builder.collide(a, b, cc); builder.collide(a, cc, dd); }
  }
  if (lid) builder.quad(material, P(1, 1, y1), P(1, -1, y1), P(-1, -1, y1), P(-1, 1, y1), [0, 0], [1, 0], [1, 1], [0, 1], color, [0, 1, 0]);
}

/**
 * Where President and Mrs. Ford are buried, on the museum's grounds above the river: a low curved wall of granite
 * round paving, open to the east, their two stones before it. It stands on the NORTH side of the museum, inside the
 * D of sidewalk on the lawn there (the footway from (-712, -582) round the west to (-714, -549), closed on the east
 * by the path along x -713: some 18 m by 33 m), in the middle of it. Not south of the building. Small enough that the
 * paths go on round it.
 */
export const FORD_GRAVE = [-721, -565];
export function fordGrave(builder, terrain) {
  const [cx, cz] = FORD_GRAVE;
  const g = terrain.heightAt(cx, cz) + 0.1;
  const granite = [0.62, 0.6, 0.58], R = 5.2, seg = 12;
  // The wall: an arc round the west, open east to the river, rising toward its middle.
  for (let i = 0; i < seg; i++) {
    const a0 = Math.PI * (0.62 + 0.76 * (i / seg)), a1 = Math.PI * (0.62 + 0.76 * ((i + 1) / seg)), am = (a0 + a1) / 2;
    const x = cx + Math.cos(am) * R, z = cz + Math.sin(am) * R;
    const h = 0.9 + 0.8 * Math.sin(Math.PI * (i + 0.5) / seg);
    const w = 2 * R * Math.sin((a1 - a0) / 2) + 0.05;
    block(builder, 'wall:block', x, z, -Math.sin(am), Math.cos(am), w, 0.7, g - 0.3, g + h, granite, { collide: true });
  }
  // The paving inside it and the two stones, side by side, facing the river.
  block(builder, 'wall:block', cx, cz, 0, 1, 7, 7, g - 0.2, g + 0.06, [0.78, 0.76, 0.72]);
  for (const dz of [-0.9, 0.9]) block(builder, 'wall:block', cx - 2.2, cz + dz, 0, 1, 1.5, 0.8, g + 0.06, g + 0.28, [0.42, 0.4, 0.4]);
}

/** Rosa Parks Circle: the plaza, its rings of steps, the stage, the stars, the masts and the tables. */
export function rosaParks(builder, terrain) {
  const { center: C, radius: R, rings, tread, rise, stage: S } = ROSA_PARKS;
  const base = terrain.heightAt(C[0], C[1]) + 0.12;
  const pale = [1.06, 1.05, 1.0], curb = linear('#e4e0d8'), dust = [1.0, 0.92, 0.82];
  // The plaza: a disc of pale concrete, a little sunk below its rings.
  annulus(builder, 'road:concrete', C, 0, R, base, pale, { tile: 3 });
  // The rings: a granite curb, then a band of stone dust, each a step up from the last.
  let r = R, y = base;
  for (let k = 0; k < rings; k++) {
    const up = y + rise;
    // Each riser faces the plaza (the rings step up away from it): seen from the plaza, outward faces were not drawn.
    drum(builder, 'road:concrete', C, r, y - 0.3, up, curb, { tile: 1, inward: true });
    annulus(builder, 'road:concrete', C, r, r + 0.4, up, curb, { tile: 1 });
    // The seat: plain stone, not slabs.
    annulus(builder, 'ground:stone', C, r + 0.4, r + tread, up, dust, { tile: 2 });
    r += tread; y = up;
  }
  // The outermost curb, and the ground beyond it brought up to meet it: a skirt down to the terrain round about.
  drum(builder, 'road:concrete', C, r, y - 0.3, y + 0.12, curb, { tile: 1 });
  annulus(builder, 'road:concrete', C, r, r + 0.45, y + 0.12, curb, { tile: 1 });
  const edge = [];
  for (let i = 0; i <= 96; i++) { const a = TAU * i / 96; edge.push([C[0] + Math.cos(a) * (r + 0.45), y + 0.12, C[1] + Math.sin(a) * (r + 0.45)]); }
  for (let i = 0; i < 96; i++) {
    const a = edge[i], b = edge[i + 1];
    const ga = terrain.heightAt(a[0], a[2]), gb = terrain.heightAt(b[0], b[2]);
    if (a[1] - ga < 0.02 && b[1] - gb < 0.02) continue;
    builder.quad('road:concrete', a, b, [b[0], Math.min(gb, b[1]) - 0.2, b[2]], [a[0], Math.min(ga, a[1]) - 0.2, a[2]], [0, 0], [1, 0], [1, 1], [0, 1], curb);
  }

  // The stars: points of fiber-optic light set in the plaza, the constellations of the night of the millennium.
  for (let k = 0; k < 150; k++) {
    const a = unit(`star${k}a`) * TAU, d = Math.sqrt(unit(`star${k}d`)) * (R - 0.6);
    const x = C[0] + Math.cos(a) * d, z = C[1] + Math.sin(a) * d, s = 0.05 + unit(`star${k}s`) * 0.06;
    builder.quad('prop:glow', [x - s, base + 0.015, z + s], [x + s, base + 0.015, z + s], [x + s, base + 0.015, z - s], [x - s, base + 0.015, z - s], [0, 0], [1, 0], [1, 1], [0, 1], [1, 1, 1], [0, 1, 0]);
  }

  // The stage: a raised round platform under a flat round canopy of steel, held up from behind on a concrete core.
  const out = [S[0] - C[0], S[1] - C[1]], ol = Math.hypot(...out);
  const ux = out[0] / ol, uz = out[1] / ol;
  const sy = terrain.heightAt(S[0], S[1]);
  const deck = Math.max(base + 0.7, sy + 0.6);
  drum(builder, 'road:concrete', S, 5.2, Math.min(sy, base) - 0.3, deck, curb, { tile: 1 });
  annulus(builder, 'road:concrete', S, 0, 5.2, deck, [0.86, 0.85, 0.82], { tile: 2 });
  const core = [S[0] + ux * 3.2, S[1] + uz * 3.2];
  const canopy = deck + 4.6;
  drum(builder, 'road:concrete', core, 1.5, deck, canopy, linear('#cfccc4'), { tile: 2, seg: 24 });
  const steel = linear('#c8ccd0'), dark = linear('#6c7076');
  const cc = [S[0] + ux * 0.6, S[1] + uz * 0.6];
  annulus(builder, 'prop:steel', cc, 0, 6.4, canopy + 0.32, steel, { collide: false, seg: 64 });
  drum(builder, 'prop:steel', cc, 6.4, canopy, canopy + 0.32, steel, { collide: false, seg: 64 });
  // Its underside: a disc facing down, and the ribs that run out from the core to the rim.
  for (let i = 0; i < 64; i++) {
    const t0 = TAU * i / 64, t1 = TAU * (i + 1) / 64;
    builder.tri('prop:steel', [cc[0], canopy, cc[1]], [cc[0] + Math.cos(t0) * 6.4, canopy, cc[1] + Math.sin(t0) * 6.4], [cc[0] + Math.cos(t1) * 6.4, canopy, cc[1] + Math.sin(t1) * 6.4], [0, 0], [1, 0], [1, 1], dark, [0, -1, 0]);
  }
  for (let i = 0; i < 16; i++) {
    const a = TAU * i / 16, dx = Math.cos(a), dz = Math.sin(a);
    block(builder, 'prop:steel', cc[0] + dx * 3.2, cc[1] + dz * 3.2, dx, dz, 6.2, 0.12, canopy - 0.35, canopy, dark, { lid: false });
  }

  // The light masts: tall black poles with a ring of floodlights, about the plaza's east side.
  for (const [x, z] of [[-283.5, -191], [-272, -177.5], [-277, -162.5], [-303, -192]]) {
    const g = terrain.heightAt(x, z);
    block(builder, 'prop:iron', x, z, 1, 0, 0.32, 0.32, g, g + 10.5, [0.08, 0.08, 0.09]);
    block(builder, 'prop:iron', x, z, 1, 0, 1.3, 1.3, g + 10.5, g + 10.9, [0.08, 0.08, 0.09]);
    block(builder, 'prop:glow', x, z, 1, 0, 1.1, 1.1, g + 10.35, g + 10.5, [1, 1, 1], { lid: false });
    builder.trunks.push([x, z, 0.25, g, g + 10]);
  }

  // Cafe tables and chairs of pale steel on the plaza, as they stand there in summer.
  const chair = linear('#c4c8cc');
  for (let k = 0; k < 14; k++) {
    const a = unit(`table${k}a`) * TAU, d = 4 + unit(`table${k}d`) * (R - 6);
    const x = C[0] + Math.cos(a) * d, z = C[1] + Math.sin(a) * d;
    block(builder, 'prop:steel', x, z, 1, 0, 0.08, 0.08, base, base + 0.72, chair);
    block(builder, 'prop:steel', x, z, 1, 0, 0.75, 0.75, base + 0.72, base + 0.75, chair);
    for (let c = 0; c < 3; c++) {
      const b = a + c * TAU / 3 + unit(`chair${k}${c}`) * 0.5, cx = x + Math.cos(b) * 0.75, cz = z + Math.sin(b) * 0.75;
      const fx = Math.cos(b), fz = Math.sin(b);
      block(builder, 'prop:steel', cx, cz, fx, fz, 0.45, 0.45, base + 0.42, base + 0.46, chair);
      block(builder, 'prop:steel', cx + fx * 0.22, cz + fz * 0.22, fx, fz, 0.04, 0.45, base + 0.46, base + 0.9, chair, { lid: false });
      for (const [s, t] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) block(builder, 'prop:steel', cx + fx * s * 0.2 - fz * t * 0.2, cz + fz * s * 0.2 + fx * t * 0.2, 1, 0, 0.03, 0.03, base, base + 0.42, chair, { lid: false });
    }
  }
}

/** Whether (x, z) is somewhere in Rosa Parks Circle's plaza, its rings or its stage: where no tree may stand. */
export function inRosaParks(x, z) {
  const { center: C, radius: R, rings, tread, stage: S } = ROSA_PARKS;
  return Math.hypot(x - C[0], z - C[1]) < R + rings * tread + 1.2 || Math.hypot(x - S[0], z - S[1]) < 7.5;
}

/**
 * The art museum's porch: its roof carried out as a great flat canopy over the entrance, on the side toward Rosa Parks
 * Circle, held up at its outer edge on two tall concrete piers.
 */
export function museumPorch(builder, terrain, buildings) {
  const gram = buildings.find((b) => b.name === 'Grand Rapids Art Museum');
  if (!gram) return;
  const ring = open(gram.rings[0]);
  const [tx, tz] = ROSA_PARKS.center;
  let cx = 0, cz = 0;
  for (const [x, z] of ring) { cx += x / ring.length; cz += z / ring.length; }
  // The longest wall that looks toward the circle.
  let best = null;
  for (let i = 0; i < ring.length; i++) {
    const A = ring[i], B = ring[(i + 1) % ring.length], L = Math.hypot(B[0] - A[0], B[1] - A[1]);
    if (L < 12) continue;
    let nx = -(B[1] - A[1]) / L, nz = (B[0] - A[0]) / L;
    const mx = (A[0] + B[0]) / 2, mz = (A[1] + B[1]) / 2;
    if (inside(gram.rings, mx + nx * 0.5, mz + nz * 0.5)) { nx = -nx; nz = -nz; }
    const toward = ((tx - mx) * nx + (tz - mz) * nz) / Math.hypot(tx - mx, tz - mz);
    if (toward > 0.5 && (!best || L * toward > best.score)) best = { A, B, L, nx, nz, score: L * toward };
  }
  if (!best) return;
  const { A, B, L, nx, nz } = best;
  const ground = Math.min(terrain.heightAt(A[0], A[1]), terrain.heightAt(B[0], B[1]));
  const y0 = ground + 12.4, y1 = y0 + 1.1, depth = 10;
  const ux = (B[0] - A[0]) / L, uz = (B[1] - A[1]) / L;
  const mx = (A[0] + B[0]) / 2 + nx * depth / 2, mz = (A[1] + B[1]) / 2 + nz * depth / 2;
  const concrete = linear('#dcdad4');
  block(builder, 'road:concrete', mx, mz, ux, uz, Math.min(L, 34), depth, y0, y1, concrete);
  // Its underside, lit soft from below.
  for (const s of [-1, 1]) {
    const px = mx + ux * s * Math.min(L, 34) * 0.32 + nx * (depth / 2 - 1.2), pz = mz + uz * s * Math.min(L, 34) * 0.32 + nz * (depth / 2 - 1.2);
    block(builder, 'road:concrete', px, pz, ux, uz, 3.2, 1.4, ground - 0.3, y0, concrete, { collide: true });
  }
}

/** A dome on each round wing of the Public Museum: the planetarium and its twin. */
export function museumDomes(builder, terrain, buildings, lidar = {}) {
  const gray = linear('#b4b8bc');
  for (const b of buildings) {
    if (b.name !== 'Grand Rapids Public Museum') continue;
    const ring = open(b.rings[0]), area = areaOf(b.rings[0]);
    let cx = 0, cz = 0;
    for (const [x, z] of ring) { cx += x / ring.length; cz += z / ring.length; }
    const r = Math.sqrt(area / Math.PI);
    // Round: every corner about as far from the middle as the radius its area gives.
    if (ring.some(([x, z]) => Math.abs(Math.hypot(x - cx, z - cz) - r) > r * 0.15)) continue;
    let low = Infinity;
    for (const [x, z] of ring) low = Math.min(low, terrain.heightAt(x, z));
    const h = Math.min(heightOf({ ...b, measured: lidar[b.id] }), 13) * 0.7;
    const top = low + h;
    const bands = 10, seg = 40;
    for (let k = 0; k < bands; k++) {
      const p0 = (k / bands) * Math.PI / 2, p1 = ((k + 1) / bands) * Math.PI / 2;
      const r0 = r * Math.cos(p0), r1 = r * Math.cos(p1), y0 = top + r * 0.85 * Math.sin(p0), y1 = top + r * 0.85 * Math.sin(p1);
      for (let i = 0; i < seg; i++) {
        const t0 = TAU * i / seg, t1 = TAU * (i + 1) / seg;
        const a = [cx + Math.cos(t1) * r0, y0, cz + Math.sin(t1) * r0], bb = [cx + Math.cos(t0) * r0, y0, cz + Math.sin(t0) * r0];
        const c = [cx + Math.cos(t0) * r1, y1, cz + Math.sin(t0) * r1], d = [cx + Math.cos(t1) * r1, y1, cz + Math.sin(t1) * r1];
        builder.tri('prop:steel', a, bb, c, [0, 0], [1, 0], [1, 1], gray);
        if (r1 > 0.01) builder.tri('prop:steel', a, c, d, [0, 0], [1, 1], [0, 1], gray);
      }
    }
  }
}

/**
 * La Grande Vitesse: Calder's stabile of red-painted steel plate, some 13 m tall and 17 m long: sweeping legs that
 * rise and fold into arching fins. Each plate is a few triangles, seen from both sides.
 */
export function vitesse(builder, terrain, [x, z] = VITESSE) {
  const red = linear('#c8201a');
  const g = terrain.heightAt(x, z) + 0.05;
  const yaw = 0.35, c = Math.cos(yaw), s = Math.sin(yaw);
  const P = ([px, py, pz]) => [x + px * c - pz * s, g + py, z + px * s + pz * c];
  const plate = (pts) => {
    const q = pts.map(P);
    for (let i = 1; i + 1 < q.length; i++) {
      builder.tri('prop:steel', q[0], q[i], q[i + 1], [0, 0], [1, 0], [1, 1], red);
      builder.tri('prop:steel', q[0], q[i + 1], q[i], [0, 0], [1, 1], [1, 0], red);
    }
  };
  // Five legs, each a broad plate folded along a crease, leaning in and rising into the fins.
  plate([[-8.5, 0, -3.5], [-5, 0, -4.2], [-2.2, 9.5, -1.2], [-4.4, 11, 0]]);
  plate([[-8.5, 0, -3.5], [-8.2, 0, 0.5], [-4.4, 11, 0]]);
  plate([[8, 0, -4], [4.6, 0, -4.4], [1.2, 9, -1.4], [3, 12, -0.4]]);
  plate([[8, 0, -4], [8.4, 0, -0.4], [3, 12, -0.4]]);
  plate([[-4.5, 0, 4.6], [-0.6, 0, 5.4], [0.6, 8, 1.2], [-2.6, 10, 0.4]]);
  plate([[3.4, 0, 4.8], [6.6, 0, 3], [2.8, 8.6, 0.4], [0.8, 9.2, 1.4]]);
  plate([[-1.2, 0, -0.8], [1.6, 0, -1.4], [0.8, 7.5, -0.6]]);
  // The fins along the top: great arcs of plate, one high and broad, two lower, curling as they go.
  const arc = (x0, x1, h0, h1, zc, w, depth) => {
    const pts = [];
    for (let i = 0; i <= 14; i++) { const t = i / 14, y = h0 + Math.sin(t * Math.PI) * (h1 - h0); pts.push([x0 + (x1 - x0) * t, y, zc + Math.sin(t * Math.PI * 1.5) * w]); }
    for (let i = 0; i < 14; i++) plate([[pts[i][0], pts[i][1] - depth, pts[i][2] * 0.6], [pts[i + 1][0], pts[i + 1][1] - depth, pts[i + 1][2] * 0.6], pts[i + 1], pts[i]]);
  };
  arc(-5.5, 4, 8.8, 13.4, -0.4, 1.2, 3.2);
  arc(-1, 7.5, 7.6, 11.2, 0.8, 1, 2.6);
  arc(-8, -1.5, 7.5, 10.4, 0.2, 0.8, 2.4);
  builder.trunks.push([x, z, 3.5, g, g + 9]);
}
