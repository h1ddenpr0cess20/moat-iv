import { linear, scale } from './builder.js';
import { sampleLine, subdivide, triangulate } from './geometry.js';
import { WALKS, profiles, tunnelled } from './bridges.js';
import { BLUE_BRIDGE } from './config.js';

export { sampleLine };

/**
 * The flat things laid over the ground (grass, streets, pavements, car parks,
 * crossings) as draped triangles: each point sits on the terrain, lifted by
 * the layer's `lift`, so one thing lies over another without flickering (the layers a few centimeters apart, which the depth buffer tells apart as the near plane goes out with the camera: lawns 0.08, car parks and ballast 0.12, pavements 0.16, streets 0.19 to 0.25, their center lines and crossings 0.04 above (3 cm is the least a layer may stand over the one it lies on, or the paint flickers away): flush, with no kerb wall between).
 * Textures are laid in world space (`tile` meters to a repeat) so two pieces
 * of the same street line up wherever they meet.
 */

const uvAt = (p, tile) => [p[0] / tile, p[2] / tile];

/**
 * What scripts/audit-roadwork.mjs listens to: while its lists are set, the road work records what it lays (each
 * road's strip, every wall, every painted piece, every embankment) with the road it belongs to, so the geometry can
 * be checked without looking at it. Null, and free, otherwise.
 */
export const probes = { strips: null, walls: null, paint: null, banks: null, drapes: null, road: null };

/** A polygon (outer ring, holes) draped over the terrain. */
export function drape(builder, terrain, material, rings, { lift = 0.08, tile = 6, color = [1, 1, 1], most = 10, collide = false, snug = 0.08 } = {}) {
  const mesh = subdivide(triangulate(rings), most);
  // (A lawn's extra lift on a slope stays under a street's, so on a bank the grass does not stand up through the asphalt beside it.)
  const over = terrain.over ? (x, z) => terrain.over(x, z, lift, snug) : (x, z) => terrain.heightAt(x, z) + lift;
  const at = (i) => [mesh.points[i * 2], over(mesh.points[i * 2], mesh.points[i * 2 + 1]), mesh.points[i * 2 + 1]];
  for (let k = 0; k < mesh.index.length; k += 3) {
    const a = at(mesh.index[k]), b = at(mesh.index[k + 1]), c = at(mesh.index[k + 2]);
    if (probes.drapes) probes.drapes.push({ material, a, b, c });
    builder.tri(material, a, b, c, uvAt(a, tile), uvAt(b, tile), uvAt(c, tile), color, [0, 1, 0]);
    if (collide) builder.collide(a, b, c);
  }
}

/** For each point of a line, the unit sideways direction (mitred where it bends), as [nx, nz]. */
export function sideways(pts) {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    return [-dz, dx];
  });
}

/**
 * A strip of `width` meters along a line, draped on the terrain, or, with a bridge's `deck` (its profile, from
 * bridges.js), held at the heights that gives it wherever it is raised over the ground. Returns the strip's
 * edges as [[x, y, z]] left and right, and for each point whether it is raised, for what goes along them.
 */
export function ribbon(builder, terrain, material, line, width, { lift = 0.08, deckLift = 0, tile = 6, color = [1, 1, 1], deck = null, collide = false, step = 5, snug = 0.45, ends = null, slabs = 0 } = {}) {
  // Off a bridge, a strip follows the ground closely: points every `step` meters, lifted at most `snug` more on a slope
  // so it does not sink into the ground between them (the closer the points, the less it needs).
  const pts = deck ? deck.pts : sampleLine(line, step);
  if (pts.length < 2) return null;
  const side = sideways(pts);
  // Where the road carries straight on as the map's next road (`ends`: that road's heading, as this one runs, at the
  // start and at the end), its end is cut on the bisector of the two, mitred, so the corners of the two strips meet
  // and no wedge of ground shows between them, nor one laps over the other.
  if (ends) {
    for (const [i, j, v] of [[0, 1, ends[0]], [pts.length - 1, pts.length - 2, ends[1]]]) {
      if (!v) continue;
      let ux = i ? pts[i][0] - pts[j][0] : pts[j][0] - pts[i][0], uz = i ? pts[i][1] - pts[j][1] : pts[j][1] - pts[i][1];
      const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
      let tx = ux + v[0], tz = uz + v[1];
      const tl = Math.hypot(tx, tz);
      if (tl < 1e-6) continue;
      tx /= tl; tz /= tl;
      const k = 1 / Math.max(0.6, tx * ux + tz * uz);
      side[i] = [-tz * k, tx * k];
    }
  }
  const left = [], right = [], raised = [];
  pts.forEach((p, i) => {
    const [nx, nz] = side[i], h = width / 2;
    const lx = p[0] + nx * h, lz = p[1] + nz * h, rx = p[0] - nx * h, rz = p[1] - nz * h;
    const up = deck && deck.y[i] - deck.ground[i] > 0.25;
    raised.push(Boolean(up));
    if (up) {
      // A deck only just off the ground (a ramp coming down, a viaduct's foot) is held at its height at the middle of the
      // strip; the ground between its points, and out to its edges, is higher on a slope, and would stand up through it
      // in ragged wedges. Where it is, the strip lies on the ground as a street does.
      const low = deck.y[i] - deck.ground[i] < 1.2;
      left.push([lx, low ? Math.max(deck.y[i] + deckLift, terrain.over(lx, lz, lift, snug)) : deck.y[i] + deckLift, lz]);
      right.push([rx, low ? Math.max(deck.y[i] + deckLift, terrain.over(rx, rz, lift, snug)) : deck.y[i] + deckLift, rz]);
    } else {
      left.push([lx, terrain.over(lx, lz, lift, snug), lz]); right.push([rx, terrain.over(rx, rz, lift, snug), rz]);
    }
  });
  // A wide strip's two edges are far apart: on a hillside or a bluff the ground between them can bulge up through the
  // strip, in ragged wedges. Each cross-section of it is lifted, level with its slope, just enough to clear the ground
  // a quarter, half and three quarters of the way across.
  if (width >= 8) {
    for (let i = 0; i < pts.length; i++) {
      if (deck && deck.y[i] - deck.ground[i] > 1.2) continue;
      let lift_ = 0;
      for (const f of [0.25, 0.5, 0.75]) {
        const x = left[i][0] + (right[i][0] - left[i][0]) * f, z = left[i][2] + (right[i][2] - left[i][2]) * f;
        const y = left[i][1] + (right[i][1] - left[i][1]) * f;
        lift_ = Math.max(lift_, terrain.heightAt(x, z) + lift + 0.02 - y);
      }
      if (lift_ > 0) { left[i][1] += lift_; right[i][1] += lift_; }
    }
  }
  // A pavement poured in slabs (`slabs` meters along): its texture runs along it, a whole number of slabs across its
  // width, the joints square across it, as a sidewalk is laid, not a grid at an angle to it.
  const along = [0];
  for (let i = 1; i < pts.length; i++) along.push(along[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const across = slabs ? Math.max(1, Math.round(width / slabs)) * slabs : 0;
  const uvL = (i) => (slabs ? [0, along[i] / tile] : uvAt(left[i], tile)), uvR = (i) => (slabs ? [across / tile, along[i] / tile] : uvAt(right[i], tile));
  for (let i = 0; i < pts.length - 1; i++) {
    const a = left[i], b = left[i + 1], c = right[i + 1], d = right[i];
    builder.quad(material, a, b, c, d, uvL(i), uvL(i + 1), uvR(i + 1), uvR(i), color, [0, 1, 0]);
    // The ball rolls on a deck, and on the ramps up to it; on the ground it rolls on the ground (or on this, where asked). The physics' triangles are one-sided and wound counter-clockwise seen from above, to face up.
    if (collide || raised[i] || raised[i + 1]) { builder.collide(a, b, c); builder.collide(a, c, d); }
  }
  return { left, right, raised };
}

/** A vertical wall along a run of points [[x, y, z]], from each point down (or up, for a negative `drop`) by `drop` meters, facing away from the strip it borders. */
export function skirt(builder, material, edge, drop, { tile = 3, color = [1, 1, 1], flip = false, collide = false, draw = true, kind = null } = {}) {
  let run = 0;
  const drops = Array.isArray(drop) ? drop : null;
  for (let i = 0; i < edge.length - 1; i++) {
    let a = edge[i], b = edge[i + 1];
    const l = Math.hypot(b[0] - a[0], b[2] - a[2]);
    if (flip) [a, b] = [b, a];
    const dx = b[0] - a[0], dz = b[2] - a[2], k = Math.hypot(dx, dz) || 1;
    const n = [-dz / k, 0, dx / k];
    // A `drop` given for every point of the edge lets a wall reach down to the ground as it rises.
    const da = drops ? drops[flip ? i + 1 : i] : drop, db = drops ? drops[flip ? i : i + 1] : drop;
    const a2 = [a[0], a[1] - da, a[2]], b2 = [b[0], b[1] - db, b[2]];
    const u0 = run / tile, u1 = (run + l) / tile, v = Math.abs(da) / tile;
    drop = da;
    if (probes.walls && kind) probes.walls.push({ kind, road: probes.road, a, b, da, db, collide, draw });
    // Either way round it is wound to face `n`, the left of a to b seen from above.
    if (draw) {
      if (drop > 0) builder.quad(material, b, a, a2, b2, [u1, v], [u0, v], [u0, 0], [u1, 0], color, n);
      else builder.quad(material, a, b, b2, a2, [u0, 0], [u1, 0], [u1, v], [u0, v], color, n);
    }
    if (collide) {
      if (drop > 0) { builder.collide(b, a, a2); builder.collide(b, a2, b2); } else { builder.collide(a, b, b2); builder.collide(a, b2, a2); }
    }
    run += l;
  }
}

/** The widths of a road, in meters, by its class. */
const WIDTH = { motorway: 11, trunk: 10, primary: 10, secondary: 9, tertiary: 8, residential: 7, living_street: 5.5, unclassified: 7, service: 4.5, pedestrian: 5, track: 3, unknown: 6, bridleway: 2, cycleway: 2, path: 1.6, steps: 1.8, footway: 1.7 };

/** How high a skywalk is carried over the street, in meters. */
const SKY = 7;

const valueOf = (rules) => (Array.isArray(rules) && rules.length ? rules[0].value : null);

export const widthOf = (road) => valueOf(road.width) ?? WIDTH[road.class] ?? 5;

/**
 * The roads a vehicle may be on, for drive mode (src/drive.js): the streets laid on the ground and on bridges, with
 * their widths. Not the pavements and paths, the neighbors' (`ctx`), or those under the ground.
 */
export const driveRoads = (roads) => roads
  .filter((r) => r.subtype === 'road' && !r.ctx && r.line?.length > 1 && !WALKS.has(r.class) && r.class !== 'fill' && r.subclass !== 'crosswalk' && !tunnelled(r))
  .map((r) => ({ line: r.line, width: widthOf(r) }));

/** The surface parking lots, as rings of [x, z]: open ground that is driven on like a road (drive.js). */
export const driveLots = (infrastructure) => infrastructure
  .filter((p) => p.rings?.[0]?.length > 2 && p.subtype === 'transit' && p.class === 'parking' && !p.ctx)
  .map((p) => p.rings[0]);

/** An enclosed walkway held up over the street: a floor, two walls and a roof of gray metal along `line`, seven meters up. For looking at, not for rolling on. */
function tube(builder, terrain, line) {
  const pts = sampleLine(line, 4), side = sideways(pts);
  const steel = [0.5, 0.54, 0.58], glass = [0.16, 0.22, 0.28], inside = [0.36, 0.37, 0.4];
  const at = (i, k, h) => [pts[i][0] + side[i][0] * k, terrain.heightAt(pts[i][0], pts[i][1]) + SKY + h, pts[i][1] + side[i][1] * k];
  const w = 1.7, top = 3.2, sill = 1.0, head = 2.5;
  /**
   * A panel of it, facing `n` outward (wound counter-clockwise seen from that side, whichever way round its corners
   * come), and its inside facing in: the walkway is seen from the street and from within.
   */
  const panel = (a, b, c, d, color, n) => {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const out = (e1[1] * e2[2] - e1[2] * e2[1]) * n[0] + (e1[2] * e2[0] - e1[0] * e2[2]) * n[1] + (e1[0] * e2[1] - e1[1] * e2[0]) * n[2] > 0;
    const [p, q, r, t] = out ? [a, b, c, d] : [a, d, c, b];
    builder.quad('prop:steel', p, q, r, t, [0, 0], [1, 0], [1, 1], [0, 1], color, n);
    builder.quad('prop:steel', t, r, q, p, [0, 0], [1, 0], [1, 1], [0, 1], color === glass ? glass : inside, n.map((v) => -v));
  };
  for (let i = 0; i + 1 < pts.length; i++) {
    const nl = [side[i][0], 0, side[i][1]], nr = [-side[i][0], 0, -side[i][1]];
    panel(at(i, -w, 0), at(i + 1, -w, 0), at(i + 1, w, 0), at(i, w, 0), steel, [0, -1, 0]); // underside
    panel(at(i, w, top), at(i + 1, w, top), at(i + 1, -w, top), at(i, -w, top), steel, [0, 1, 0]); // roof
    for (const [k, n] of [[w, nl], [-w, nr]]) {
      panel(at(i, k, 0), at(i + 1, k, 0), at(i + 1, k, sill), at(i, k, sill), steel, n); // the solid band below the windows
      panel(at(i, k, sill), at(i + 1, k, sill), at(i + 1, k, head), at(i, k, head), glass, n); // the window
      panel(at(i, k, head), at(i + 1, k, head), at(i + 1, k, top), at(i, k, top), steel, n);
    }
  }
}

/**
 * A painted line along a strip laid by `ribbon`: `f` of the way from its left edge to its right, `width` meters wide,
 * a little above it, solid or dashed (`dash`: [paint, gap] meters), and stopped `trim` meters short of each end.
 */
function stripe(builder, { left, right }, f, { width = 0.15, color = [1.7, 1.7, 1.65], dash = null, trim = 0, lift = 0.04, clear = null } = {}) {
  const [trim0, trim1] = Array.isArray(trim) ? trim : [trim, trim];
  const pts = left.map((l, i) => [l[0] + (right[i][0] - l[0]) * f, l[1] + (right[i][1] - l[1]) * f + lift, l[2] + (right[i][2] - l[2]) * f]);
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]));
  const total = s[s.length - 1];
  if (total < trim0 + trim1 + 2) return;
  const at = (d) => {
    let i = 1;
    while (i < s.length - 1 && s[i] < d) i++;
    const t = (d - s[i - 1]) / (s[i] - s[i - 1] || 1), a = pts[i - 1], b = pts[i];
    return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], dir: [b[0] - a[0], b[2] - a[2]] };
  };
  // Rivertown's paint: in pieces of 1.5 m, so it follows the street's curve and slope closely; a piece is left out
  // where it would cross another road (`clear`), and so is what is left of the line between two such places if it is
  // shorter than 4 m (a stub between a junction and a crosswalk). Then dashed, if it is.
  const STEP = 1.5, d0 = trim0, d1 = total - trim1;
  const cuts = [];
  for (let d = d0; d < d1 - 0.01; d += STEP) cuts.push([d, Math.min(d1, d + STEP)]);
  const ok = cuts.map(([e0, e1]) => {
    if (!clear) return true;
    const a = at(e0).p, b = at(e1).p;
    return ![a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], b].some((q) => clear(q[0], q[2], q[1]));
  });
  for (let i = 0; i < cuts.length;) {
    if (!ok[i]) { i++; continue; }
    let j = i;
    while (j < cuts.length && ok[j]) j++;
    if (cuts[j - 1][1] - cuts[i][0] < 4) for (let k = i; k < j; k++) ok[k] = false;
    i = j;
  }
  const [on, off] = dash ?? [Infinity, 0];
  const material = color[2] < 0.6 ? 'road:paint-yellow' : 'road:paint-white';
  cuts.forEach(([e0, e1], i) => {
    if (!ok[i]) return;
    // Dashed: the parts of the piece within a painted stretch.
    const period = on + off;
    let a0 = e0;
    while (a0 < e1 - 0.01) {
      const phase = dash ? (a0 - d0) % period : 0;
      if (phase >= on) { a0 += period - phase; continue; }
      const a1 = Math.min(e1, a0 + (on - phase));
      const a = at(a0), b = at(a1);
      const quad = [];
      for (const { p, dir } of [a, b]) {
        const l = Math.hypot(dir[0], dir[1]) || 1, nx = -dir[1] / l * width / 2, nz = dir[0] / l * width / 2;
        quad.push([p[0] + nx, p[1], p[2] + nz], [p[0] - nx, p[1], p[2] - nz]);
      }
      const [al, ar, bl, br] = quad;
      if (probes.paint) probes.paint.push({ road: probes.road, a: a.p, b: b.p, width, color });
      builder.quad(material, al, bl, br, ar, [0, 0], [0, 1], [1, 1], [1, 0], [1, 1, 1], [0, 1, 0]);
      a0 = a1;
    }
  });
}

/** The streets that are painted, by class: their rank (Rivertown's: the main streets 6 and up). */
const MARKED = { motorway: 9, trunk: 8, primary: 7, secondary: 6, tertiary: 5 };
const WHITE = [1.7, 1.7, 1.65], YELLOW = [1.6, 1.25, 0.15];

/**
 * A street's lane lines as American streets are painted (MUTCD): lanes about 3.4 m, as many as the asphalt holds;
 * dashed white between lanes going the same way (3 m painted, 9 m gap); a double yellow down the middle of a two-way
 * street; on a freeway, a divided street's carriageway or a one-way street, yellow on its left and white on its
 * right; solid white edge lines on the main streets. Stopped short of a junction (not of where the street only runs
 * on as the map's next piece), of a crosswalk and of another road's surface.
 */
function markings(builder, road, edges, width, clear, [t0, t1], isDivided) {
  const rank = MARKED[road.class], LANE = 3.4, EDGE = 0.3, DASH = [3, 9];
  const edge = width / 2 - EDGE, at = (o) => 0.5 + o / width;
  const trim = [t0 ? 9 : 0, t1 ? 9 : 0];
  const line = (o, color, w, dash = null) => stripe(builder, edges, at(o), { width: w, color, dash, trim, clear });
  if (((road.class === 'motorway' || road.class === 'trunk') && road.subclass !== 'link') || isDivided || /One Way/.test(road.name ?? '')) {
    // One way, drawn in the direction of travel: yellow on the left (by the median), white on the right.
    const n = Math.max(rank >= 6 ? 2 : 1, Math.floor((2 * edge) / LANE));
    line(-edge, YELLOW, 0.13);
    line(edge, WHITE, 0.15);
    for (let i = 1; i < n; i++) line(-edge + (2 * edge * i) / n, WHITE, 0.12, DASH);
    return;
  }
  // Two-way: the double yellow, then each half's lanes (two each way on the main streets).
  line(0.1, YELLOW, 0.1);
  line(-0.1, YELLOW, 0.1);
  const n = Math.max(rank >= 6 ? 2 : 1, Math.floor(edge / LANE));
  for (let i = 1; i < n; i++) for (const sg of [1, -1]) line((sg * edge * i) / n, WHITE, 0.12, DASH);
  if (rank >= 6) { line(edge, WHITE, 0.15); line(-edge, WHITE, 0.15); }
}

/** Each road -> [whether its start, its end is at a junction]: not when it only runs on into one other road there. */
function junctionEnds(roads, miters) {
  const key = (p) => `${Math.round(p[0] * 2)},${Math.round(p[1] * 2)}`;
  const count = new Map();
  const driven = roads.filter((r) => r.subtype === 'road' && !r.ctx && r.line?.length > 1 && !WALKS.has(r.class) && r.subclass !== 'crosswalk');
  for (const r of driven) for (const p of [r.line[0], r.line.at(-1)]) count.set(key(p), (count.get(key(p)) ?? 0) + 1);
  return (r) => {
    const m = miters.get(r);
    return [r.line[0], r.line.at(-1)].map((p, i) => !(count.get(key(p)) === 2 && m?.[i]));
  };
}

/** Whether a road is one carriageway of a divided street: the same street beside it, 4 to 30 m off, running the other way. */
function dividedOf(roads) {
  const byName = new Map();
  for (const r of roads) if (r.name && r.subtype === 'road' && r.line?.length > 1) {
    if (!byName.has(r.name)) byName.set(r.name, []);
    byName.get(r.name).push(r);
  }
  const memo = new Map();
  return (r) => {
    if (memo.has(r)) return memo.get(r);
    let found = false;
    const same = r.name ? byName.get(r.name) : null;
    if (same && same.length > 1) {
      const i = Math.max(1, r.line.length >> 1), a = r.line[i - 1], b = r.line[i];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, hx = (b[0] - a[0]) / L, hz = (b[1] - a[1]) / L;
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      for (const o of same) {
        if (o === r || found) continue;
        for (let k = 1; k < o.line.length && !found; k++) {
          const p = o.line[k - 1], q = o.line[k], dx = q[0] - p[0], dz = q[1] - p[1], l2 = dx * dx + dz * dz || 1;
          const t = Math.max(0, Math.min(1, ((mx - p[0]) * dx + (mz - p[1]) * dz) / l2));
          const d = Math.hypot(p[0] + dx * t - mx, p[1] + dz * t - mz);
          if (d >= 4 && d <= 30 && (dx * hx + dz * hz) / Math.sqrt(l2) < -0.9) found = true;
        }
      }
    }
    memo.set(r, found);
    return found;
  };
}

/** (x, z) -> whether it is within 2.5 m of a crosswalk (the lane lines stop short of its stripes). */
function crosswalks(roads) {
  const C = 16, grid = new Map();
  for (const r of roads) if (r.subclass === 'crosswalk' && r.line?.length > 1) for (let k = 1; k < r.line.length; k++) {
    const a = r.line[k - 1], b = r.line[k];
    for (let i = Math.floor(Math.min(a[0], b[0]) / C) - 1; i <= Math.floor(Math.max(a[0], b[0]) / C) + 1; i++)
      for (let j = Math.floor(Math.min(a[1], b[1]) / C) - 1; j <= Math.floor(Math.max(a[1], b[1]) / C) + 1; j++) {
        const key = `${i},${j}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push([a, b]);
      }
  }
  return (x, z) => {
    for (const [a, b] of grid.get(`${Math.floor(x / C)},${Math.floor(z / C)}`) ?? []) {
      const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
      if (Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z) < 2.5) return true;
    }
    return false;
  };
}

/**
 * The streets paved in brick: those the map says are laid in paving stones or setts (most of their length) - Cherry
 * Street in East Hills, Ionia Avenue in Heartside, Monroe Center, the side streets by them - and Wealthy Street
 * through Uptown and Eastown, from Eastern Avenue past Diamond, Fuller and Lake Drive to Plymouth Avenue, more of
 * it than the map knows of.
 */
const STONE = new Set(['paving_stones', 'sett', 'brick', 'bricks', 'cobblestone', 'unhewn_cobblestone']);
const BRICK = [{ name: /^Monroe Center/ }, { name: /^Wealthy Street Southeast/, x: [1520, 3513] }];
/** A brick street that carries traffic through its junctions (not a mall, a lane or a car park's way). */
const through = (road) => paved(road) && !/^Monroe Center/.test(road.name ?? '') && !['service', 'unknown', 'pedestrian', 'living_street'].includes(road.class);

export const paved = (road) => {
  const laid = Array.isArray(road.surface) ? road.surface.reduce((sum, s) => sum + (STONE.has(s.value) ? (s.between ? s.between[1] - s.between[0] : 1) : 0), 0) : 0;
  if (laid >= 0.5) return true;
  return BRICK.some(({ name, x }) => {
    if (!name.test(road.name ?? '')) return false;
    if (!x) return true;
    const mid = road.line.reduce((sum, p) => sum + p[0], 0) / road.line.length;
    return mid > x[0] && mid < x[1];
  });
};

/**
 * The through joints: where one driven road ends and the map's next begins, heading on (within about 45 degrees),
 * through a junction or not. Each road's [start, end] gets the other's heading there as this one runs, or null.
 */
function throughJoints(roads, sky) {
  const key = (x, z) => `${Math.round(x)},${Math.round(z)}`;
  const nodes = new Map();
  for (const r of roads) {
    if (r.subtype !== 'road' || r.ctx || r.line.length < 2 || WALKS.has(r.class) || sky.has(r) || tunnelled(r) || r.subclass === 'crosswalk') continue;
    const n = r.line.length;
    for (const end of [0, 1]) {
      const p = r.line[end ? n - 1 : 0], q = r.line[end ? n - 2 : 1];
      const dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz) || 1;
      const k = key(p[0], p[1]);
      if (!nodes.has(k)) nodes.set(k, []);
      nodes.get(k).push({ r, end, away: [dx / l, dz / l] });
    }
  }
  const out = new Map();
  for (const list of nodes.values()) {
    if (list.length < 2) continue;
    // The pairs that head on through the joint (A's way in is B's way out), the straightest first; each road end in one pair.
    const pairs = [];
    for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
      const along = -(list[a].away[0] * list[b].away[0] + list[a].away[1] * list[b].away[1]);
      if (along >= 0.7) pairs.push([along, list[a], list[b]]);
    }
    pairs.sort((p, q) => q[0] - p[0]);
    const used = new Set();
    for (const [, A, B] of pairs) {
    if (used.has(A) || used.has(B)) continue;
    used.add(A); used.add(B);
    for (const [me, other] of [[A, B], [B, A]]) {
      // The other road's heading, in this road's direction of running: out of the joint if this one ends there, into it if this one starts there.
      const v = me.end ? other.away : [-other.away[0], -other.away[1]];
      if (!out.has(me.r)) out.set(me.r, [null, null]);
      out.get(me.r)[me.end] = v;
    }
    }
  }
  return out;
}

/** A builder that keeps nothing: for working out where a strip would lie without drawing it. */
const GHOST = { quad() {}, tri() {}, collide() {} };

/** Lays every road: streets, pavements, paths, crossings, rails, with bridges held up over what they cross and skywalks over the streets. */
export function lay(builder, terrain, roads, { sky = new Set() } = {}) {
  const asphalt = 'road:asphalt', pavement = 'road:sidewalk', stone = 'road:concrete';
  const order = (r) => (r.subtype === 'rail' ? 0 : r.class === 'footway' || r.class === 'path' || r.class === 'steps' || r.class === 'cycleway' ? 2 : 1);
  const decks = profiles(roads, terrain, sky);
  const bridges = [];
  const paint = [];
  const laid = surfaces();
  const miters = throughJoints(roads, sky);
  // Where each road's ends meet another (a junction: the paint stops short of it) or only the map's next piece of
  // the same street (it carries on).
  const ends = junctionEnds(roads, miters);
  const divided = dividedOf(roads);
  const walks = crosswalks(roads);
  for (const road of [...roads].sort((a, b) => order(a) - order(b))) {
    const line = road.line;
    probes.road = road;
    if (line.length < 2) continue;
    // A neighbor's road (`ctx`, from a tile of a bigger map next to this one): not drawn here, but known, so a deck
    // that meets it at the seam has no wall across it.
    if (road.ctx) {
      if (road.subtype === 'road' && !tunnelled(road) && !sky.has(road) && road.subclass !== 'crosswalk') {
        laid.add(road, ribbon(GHOST, terrain, '', line, widthOf(road), { lift: order(road) === 2 ? 0.36 : 0.22, deckLift: order(road) === 2 ? 0.1 : 0, deck: decks.get(road) ?? null }));
      }
      continue;
    }
    if (road.subtype === 'rail') {
      ribbon(builder, terrain, 'ground:ballast', line, 4, { lift: 0.12, tile: 2, color: [1, 1, 1] });
      continue;
    }
    if (road.subtype === 'water') continue;
    const walk = order(road) === 2;
    if (tunnelled(road)) continue;
    if (sky.has(road)) { tube(builder, terrain, line); continue; }
    const width = widthOf(road);
    if (walk && road.subclass === 'crosswalk') {
      // Zebra bars, along the road, one every meter of the way across.
      const pts = sampleLine(line, 1);
      const side = sideways(pts);
      for (let i = 0; i < pts.length; i += 1) {
        const [nx, nz] = side[i], [px, pz] = pts[i];
        const wide = 1.6;
        const a = [px + nx * wide, 0, pz + nz * wide], b = [px - nx * wide, 0, pz - nz * wide];
        const tx = nz * 0.22, tz = -nx * 0.22;
        // On the street it crosses (a bridge's deck where that is up off the ground), a few centimeters over its
        // surface; only over the street itself: not where the crosswalk runs on over a pavement or the ground.
        const corners = [[a[0] - tx, a[2] - tz], [a[0] + tx, a[2] + tz], [b[0] + tx, b[2] + tz], [b[0] - tx, b[2] - tz]].map(([x, z]) => [x, laid.top(x, z), z]);
        if (corners.some((c) => c[1] === null)) continue;
        for (const c of corners) c[1] += 0.04;
        builder.quad('road:paint-white', corners[0], corners[1], corners[2], corners[3], uvAt(corners[0], 3), uvAt(corners[1], 3), uvAt(corners[2], 3), uvAt(corners[3], 3), [1, 1, 1], [0, 1, 0]);
      }
      continue;
    }
    const deck = decks.get(road) ?? null;
    if (walk) {
      // Flush with the street (a few centimeters under it, so where the two overlap or cross the street is what is
      // seen, and the ball rolls from one to the other without a step) and with the lawn.
      const edges = ribbon(builder, terrain, pavement, line, width, {
        lift: 0.16, deckLift: 0.1, tile: 3, color: [1.0, 0.98, 0.94], deck, collide: true, step: 2.5, snug: 0.08, slabs: 1.5,
      });
      laid.add(road, edges);
      if (probes.strips && edges) probes.strips.push({ road, ...edges, width, deck, walk: true });
      if (deck && edges?.raised.some(Boolean)) bridges.push({ ...edges, deck, width, walk: true, sidewalk: road.subclass === 'sidewalk', road });
      continue;
    }
    const tone = road.class === 'service' || road.class === 'unknown' ? [0.85, 0.85, 0.88] : road.class === 'motorway' || road.class === 'trunk' ? [0.78, 0.78, 0.8] : [1, 1, 1];
    const brick = paved(road);
    // A highway is wide, and lies across the cuts and banks beside it: its points are closer, and it follows the ground more on a slope.
    const wide = road.class === 'motorway' || road.class === 'trunk';
    // Where streets cross, the more important is laid over the lesser (6 cm, which the depth buffer can tell apart), so a
    // junction is one surface and not two that flicker through each other.
    // A brick street that carries traffic (Wealthy, Cherry) runs on through its junctions, over the streets that meet
    // it; Monroe Center, once a pedestrian mall, lies under the streets that cross it.
    const minor = (brick && !through(road)) || road.class === 'service' || road.class === 'unknown';
    const lift = brick && through(road) ? 0.25 : minor ? 0.19 : 0.22;
    const edges = brick
      ? ribbon(builder, terrain, 'ground:pavers', line, width, { lift, tile: 1.6, color: [0.86, 0.66, 0.6], deck, collide: true, step: 3, snug: 0.08, ends: miters.get(road) })
      : ribbon(builder, terrain, asphalt, line, width, { lift, tile: 2, color: tone, deck, collide: true, step: wide ? 2.5 : 3, snug: wide ? 0.15 : 0.08, ends: miters.get(road) });
    laid.add(road, edges);
    if (probes.strips && edges) probes.strips.push({ road, ...edges, width, deck });
    if (deck && edges?.raised.some(Boolean)) bridges.push({ ...edges, deck, width, road });
    if (!edges) continue;
    // The paint: a highway's lanes (solid edge lines, dashed lines between the lanes), and the yellow center line on the
    // streets that carry both ways, stopped short of the junctions at either end so it does not run across the street it meets.
    // Laid once every road is down (`paint`, below), so each line can tell where another road lies over it.
    if (MARKED[road.class] && !brick) paint.push({ road, edges, run: (clear) => markings(builder, road, edges, width, clear, ends(road), divided(road)) });
  }
  // The paint: a highway's lanes (solid edge lines, dashed lines between the lanes), and the yellow center line on the
  // streets that carry both ways, stopped short of the junctions at either end so it does not run across the street it
  // meets, and not run across another road that lies over it at its height (a ramp merging, a road crossing).
  for (const { road, run } of paint) {
    probes.road = road;
    run((x, z, y) => walks(x, z) || laid.over(x, z, road, 0.3).some((h) => Math.abs(h - y) < 1.0));
  }
  probes.road = null;
  junctions(builder, terrain, roads, decks, sky);
  fill(builder, bridges, laid);
  // Of the footbridges over the river, one is the Blue Bridge: the one nearest where it stands.
  let blue = null;
  for (const b of bridges) {
    if (!b.walk || b.sidewalk || terrain.waterLevel === null) continue;
    const run = longestRun(b);
    if (!run) continue;
    const mid = b.left[Math.floor((run[0] + run[1]) / 2)];
    const d = Math.hypot(mid[0] - BLUE_BRIDGE[0], mid[2] - BLUE_BRIDGE[1]);
    if (d < 120 && terrain.heightAt(mid[0], mid[2]) < terrain.waterLevel + 0.6 && (!blue || d < blue.d)) blue = { d, bridge: b, run };
  }
  if (blue) { blue.bridge.blue = blue.run; }
  bridges.decks = decks;
  bridges.joined = laid.joined;
  bridges.over = laid.over;
  return bridges;
}

/**
 * The deck between a bridge's roadway and its pavements: the map draws a pavement where it is, meters out from the
 * middle of the street, and the street only as wide as its lanes, so on a bridge the two would stand apart with a
 * gap between them. Wherever a pavement on a deck runs beside a road's deck at its height, the gap is decked over.
 */
function fill(builder, bridges, laid) {
  const walks = bridges.filter((b) => b.walk);
  if (!walks.length) return;
  const filled = { class: 'fill', subtype: 'road' };
  const CELLSIZE = 16, grid = new Map();
  for (const w of walks) {
    w.left.forEach((l, i) => {
      if (!w.raised[i]) return;
      const r = w.right[i], x = (l[0] + r[0]) / 2, z = (l[2] + r[2]) / 2;
      const k = `${Math.floor(x / CELLSIZE)},${Math.floor(z / CELLSIZE)}`;
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push({ w, i, x, z, y: (l[1] + r[1]) / 2 });
    });
  }
  for (const b of bridges) {
    if (b.walk) continue;
    const { left, right, raised } = b;
    for (const [edge, other, flip] of [[left, right, false], [right, left, true]]) {
      // For each point of this edge: how far out the pavement beside it begins, if one does.
      const reach = edge.map((p, i) => {
        if (!raised[i]) return null;
        const ox = p[0] - other[i][0], oz = p[2] - other[i][2], ol = Math.hypot(ox, oz) || 1, ux = ox / ol, uz = oz / ol;
        let best = null;
        for (let gz = -1; gz <= 1; gz++) for (let gx = -1; gx <= 1; gx++) for (const q of grid.get(`${Math.floor(p[0] / CELLSIZE) + gx},${Math.floor(p[2] / CELLSIZE) + gz}`) ?? []) {
          const dx = q.x - p[0], dz = q.z - p[2], out = dx * ux + dz * uz, along = Math.abs(dx * uz - dz * ux);
          if (out < 0.3 || out > 9 || along > 3 || Math.abs(q.y - p[1]) > 1.6) continue;
          const half = Math.hypot(q.w.left[q.i][0] - q.w.right[q.i][0], q.w.left[q.i][2] - q.w.right[q.i][2]) / 2;
          const gap = out - half + 0.1;
          if (gap > 0.05 && (!best || gap < best.gap)) best = { gap, y: q.y };
        }
        return best && { ...best, ux, uz };
      });
      for (let i = 0; i + 1 < edge.length; i++) {
        const a = reach[i], c = reach[i + 1];
        if (!a || !c) continue;
        const p = edge[i], q = edge[i + 1];
        // Sloping from the road's edge up (or down) to the pavement's, which may stand a little off the road's own deck.
        const pa = [p[0] + a.ux * a.gap, a.y, p[2] + a.uz * a.gap], qa = [q[0] + c.ux * c.gap, c.y, q[2] + c.uz * c.gap];
        // Wound to face up either side of the road.
        const [A, B, C, D] = flip ? [p, pa, qa, q] : [p, q, qa, pa];
        builder.quad('road:sidewalk', A, B, C, D, uvAt(A, 3), uvAt(B, 3), uvAt(C, 3), uvAt(D, 3), [0.92, 0.9, 0.86], [0, 1, 0]);
        // (Faced up whichever way the road runs: a face stops a ball only from the front, and these were wound down for one of the two sides.)
        collideUp(builder, A, B, C); collideUp(builder, A, C, D);
        // Under it, the soffit, so the gap does not show the sky from below.
        builder.quad('surface:concrete', D, C, B, A, [0, 0], [1, 0], [1, 1], [0, 1], [0.58, 0.57, 0.55], [0, -1, 0]);
        // Known to the parapets: none along the road's edge here, nor along the pavement's.
        laid.add(filled, { left: [pa, qa], right: [p, q] });
      }
    }
  }
}

/** A collision triangle (a, b, c) wound to face up, whatever order it was given in. */
function collideUp(builder, a, b, c) {
  const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
  if (ny >= 0) builder.collide(a, b, c); else builder.collide(a, c, b);
}

/**
 * Every strip laid, as segments of its middle line with their heights and half-widths, by 16 m cell, so a deck can
 * ask whether another road's surface carries on past its edge (a ramp merging, a street joining a bridge, the
 * pavement beside it): there it has no parapet and no fence, or the ball could not get on.
 */
function surfaces() {
  const CELLSIZE = 16, grid = new Map();
  const add = (road, edges) => {
    if (!edges) return;
    const { left, right } = edges;
    for (let i = 0; i + 1 < left.length; i++) {
      const mid = (k) => [(left[k][0] + right[k][0]) / 2, (left[k][1] + right[k][1]) / 2, (left[k][2] + right[k][2]) / 2];
      const a = mid(i), b = mid(i + 1), half = Math.hypot(left[i][0] - right[i][0], left[i][2] - right[i][2]) / 2;
      const seg = { road, a, b, half };
      const pad = half + 1;
      for (let gz = Math.floor((Math.min(a[2], b[2]) - pad) / CELLSIZE); gz <= Math.floor((Math.max(a[2], b[2]) + pad) / CELLSIZE); gz++) {
        for (let gx = Math.floor((Math.min(a[0], b[0]) - pad) / CELLSIZE); gx <= Math.floor((Math.max(a[0], b[0]) + pad) / CELLSIZE); gx++) {
          const k = `${gx},${gz}`;
          if (!grid.has(k)) grid.set(k, []);
          grid.get(k).push(seg);
        }
      }
    }
  };
  /** Whether a surface other than `self`'s is at (x, z) within `tol` meters of height `y`. */
  const joined = (x, z, y, self, tol = 1.2) => {
    for (const { road, a, b, half } of grid.get(`${Math.floor(x / CELLSIZE)},${Math.floor(z / CELLSIZE)}`) ?? []) {
      if (road === self) continue;
      const dx = b[0] - a[0], dz = b[2] - a[2], l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[2]) * dz) / l2));
      const px = a[0] + dx * t, pz = a[2] + dz * t;
      if (Math.hypot(x - px, z - pz) > half + 0.2) continue;
      if (Math.abs(a[1] + (b[1] - a[1]) * t - y) < tol) return true;
    }
    return false;
  };
  /**
   * The heights of the other roads' surfaces at (x, z), well inside them (`margin` meters from their edges): the
   * places where a wall, a line or a bank of this road would run through another street. Pavements and the decks
   * laid between a bridge and its pavement are not counted.
   */
  const over = (x, z, self, margin = 0.3) => {
    const out = [];
    for (const { road, a, b, half } of grid.get(`${Math.floor(x / CELLSIZE)},${Math.floor(z / CELLSIZE)}`) ?? []) {
      if (road === self || WALKS.has(road.class) || road.class === 'fill') continue;
      const dx = b[0] - a[0], dz = b[2] - a[2], l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[2]) * dz) / l2));
      if (Math.hypot(x - a[0] - dx * t, z - a[2] - dz * t) > half - margin) continue;
      out.push(a[1] + (b[1] - a[1]) * t);
    }
    return out;
  };
  /** The height of the highest road laid at (x, z), or null: what a crossing's paint lies on. */
  const top = (x, z) => {
    let best = null;
    for (const { road, a, b, half } of grid.get(`${Math.floor(x / CELLSIZE)},${Math.floor(z / CELLSIZE)}`) ?? []) {
      if (WALKS.has(road.class)) continue;
      const dx = b[0] - a[0], dz = b[2] - a[2], l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[2]) * dz) / l2));
      if (Math.hypot(x - a[0] - dx * t, z - a[2] - dz * t) > half) continue;
      const y = a[1] + (b[1] - a[1]) * t;
      if (best === null || y > best) best = y;
    }
    return best;
  };
  return { add, joined, over, top };
}

/**
 * The middle of each junction, filled: where streets meet, their strips end square and leave the corners between
 * them bare; a disc of the main street's asphalt, as wide as the widest of them, covers it. Not on a bridge's deck.
 */
function junctions(builder, terrain, roads, decks, sky) {
  const key = (x, z) => `${Math.round(x)},${Math.round(z)}`;
  const nodes = new Map();
  for (const r of roads) {
    if (r.subtype !== 'road' || r.line.length < 2 || WALKS.has(r.class) || sky.has(r) || tunnelled(r)) continue;
    const deck = decks.get(r);
    for (const end of [0, 1]) {
      const [x, z] = r.line[end ? r.line.length - 1 : 0];
      // A junction up on the decks (a ramp meeting the highway, a street meeting a bridge) is filled at the decks' height.
      let up = null;
      if (deck) { const k = end ? deck.y.length - 1 : 0; if (deck.y[k] - deck.ground[k] > 0.25) up = deck.y[k]; }
      const k = key(x, z);
      if (!nodes.has(k)) nodes.set(k, { x, z, roads: [], up: null });
      const node = nodes.get(k);
      node.roads.push(r);
      if (up !== null) node.up = Math.max(node.up ?? -Infinity, up);
    }
  }
  for (const { x, z, roads: here, up } of nodes.values()) {
    if (here.length < 2 || here.every((r) => r.ctx)) continue;
    const major = here.find((r) => !(r.class === 'service' || r.class === 'unknown' || paved(r)));
    // Where a brick street runs through, the junction is its brick, as wide as it is, over the streets that meet it.
    const bricked = here.filter(through);
    const top = bricked[0] ?? major ?? here[0];
    const brick = bricked.length > 0 || (!major && here.every(paved));
    const radius = Math.max(...(bricked.length ? bricked : here).map(widthOf)) / 2 * 1.04;
    const lift = bricked.length ? 0.25 : major ? 0.22 : 0.19, seg = 18;
    const tone = top.class === 'service' || top.class === 'unknown' ? [0.85, 0.85, 0.88] : top.class === 'motorway' || top.class === 'trunk' ? [0.78, 0.78, 0.8] : [1, 1, 1];
    const material = brick ? 'ground:pavers' : 'road:asphalt', tile = brick ? 1.6 : 2, color = brick ? [0.86, 0.66, 0.6] : tone;
    const at = (px, pz) => (up !== null ? up : terrain.over(px, pz, lift));
    const c = [x, at(x, z), z];
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const p0 = [x + Math.cos(a1) * radius, 0, z + Math.sin(a1) * radius], p1 = [x + Math.cos(a0) * radius, 0, z + Math.sin(a0) * radius];
      p0[1] = at(p0[0], p0[2]); p1[1] = at(p1[0], p1[2]);
      builder.tri(material, c, p0, p1, uvAt(c, tile), uvAt(p0, tile), uvAt(p1, tile), color, [0, 1, 0]);
      builder.collide(c, p0, p1);
    }
  }
}

/** The longest stretch of points of a bridge that are raised, as [first, last] indices. */
function longestRun({ raised }) {
  let best = null, start = -1;
  for (let i = 0; i <= raised.length; i++) {
    if (raised[i]) { if (start < 0) start = i; } else if (start >= 0) { if (!best || i - 1 - start > best[1] - best[0]) best = [start, i - 1]; start = -1; }
  }
  return best && best[1] - best[0] >= 3 ? best : null;
}

/** A square steel member from a to b, `t` meters across: four faces. */
function member(builder, material, a, b, t, color) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const l = Math.hypot(...d) || 1;
  const u = d.map((c) => c / l);
  // Any direction not along the member, to build the square round it.
  const ref = Math.abs(u[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
  let s = cross(u, ref); const sl = Math.hypot(...s) || 1; s = s.map((c) => (c * t) / (2 * sl));
  let w = cross(u, s); const wl = Math.hypot(...w) || 1; w = w.map((c) => (c * t) / (2 * wl));
  const corner = (p, ks, kw) => [p[0] + s[0] * ks + w[0] * kw, p[1] + s[1] * ks + w[1] * kw, p[2] + s[2] * ks + w[2] * kw];
  const ring = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  for (let i = 0; i < 4; i++) {
    const [k0s, k0w] = ring[i], [k1s, k1w] = ring[(i + 1) % 4];
    builder.quad(material, corner(a, k0s, k0w), corner(a, k1s, k1w), corner(b, k1s, k1w), corner(b, k0s, k0w), [0, 0], [1, 0], [1, 1], [0, 1], color);
  }
}

/**
 * The Blue Bridge (1892), as in the photographs: a run of through-truss spans of bright blue steel over the deck,
 * parallel chords some 6 m up on inclined end posts, a vertical at every panel and crossed diagonals in each, the
 * two trusses tied over head by struts and X-bracing, and a latticed portal at each end of every span; stone piers
 * between the spans where the water is deep.
 */
function truss(builder, terrain, { left, right }, { H = 6.2, panel = 5.2, spanLength = 36 } = {}) {
  const blue = [0.03, 0.17, 0.62];
  const stone = [0.7, 0.68, 0.64];
  const up = (p, h) => [p[0], p[1] + h, p[2]];
  const n = left.length;
  // Distance along the middle of the deck, to place panel points on both edges at the same place.
  const along = [0];
  for (let i = 1; i < n; i++) {
    const m0 = [(left[i - 1][0] + right[i - 1][0]) / 2, (left[i - 1][2] + right[i - 1][2]) / 2];
    const m1 = [(left[i][0] + right[i][0]) / 2, (left[i][2] + right[i][2]) / 2];
    along.push(along[i - 1] + Math.hypot(m1[0] - m0[0], m1[1] - m0[1]));
  }
  const L = along[n - 1];
  const at = (edge, s) => {
    let i = 1;
    while (i < n - 1 && along[i] < s) i++;
    const t = Math.max(0, Math.min(1, (s - along[i - 1]) / ((along[i] - along[i - 1]) || 1)));
    return [0, 1, 2].map((k) => edge[i - 1][k] + (edge[i][k] - edge[i - 1][k]) * t);
  };
  const spans = Math.max(1, Math.round(L / spanLength));
  const piers = [];
  for (let sp = 0; sp < spans; sp++) {
    const s0 = (L * sp) / spans + (sp ? 0.4 : 0), s1 = (L * (sp + 1)) / spans - (sp < spans - 1 ? 0.4 : 0);
    if (sp) piers.push(L * sp / spans);
    const panels = Math.max(3, Math.round((s1 - s0) / panel));
    const node = (edge, k) => at(edge, s0 + ((s1 - s0) * k) / panels);
    for (const edge of [left, right]) {
      const lo = (k) => up(node(edge, k), 0.15), hi = (k) => up(node(edge, k), H);
      member(builder, 'prop:steel', lo(0), lo(panels), 0.32, blue); // bottom chord
      member(builder, 'prop:steel', up(node(edge, 0), 1.1), up(node(edge, panels), 1.1), 0.08, [0.85, 0.86, 0.86]); // the white rail inside
      member(builder, 'prop:steel', hi(1), hi(panels - 1), 0.4, blue); // top chord
      member(builder, 'prop:steel', lo(0), hi(1), 0.4, blue); // the inclined end posts
      member(builder, 'prop:steel', lo(panels), hi(panels - 1), 0.4, blue);
      for (let k = 1; k < panels; k++) member(builder, 'prop:steel', lo(k), hi(k), 0.26, blue); // verticals
      for (let k = 1; k < panels - 1; k++) {
        member(builder, 'prop:steel', lo(k), hi(k + 1), 0.14, blue); // crossed diagonals
        member(builder, 'prop:steel', hi(k), lo(k + 1), 0.14, blue);
      }
    }
    // Over head: a strut at every panel point, X-bracing between them.
    for (let k = 1; k < panels; k++) {
      member(builder, 'prop:steel', up(node(left, k), H), up(node(right, k), H), 0.18, blue);
      if (k < panels - 1) {
        member(builder, 'prop:steel', up(node(left, k), H), up(node(right, k + 1), H), 0.1, blue);
        member(builder, 'prop:steel', up(node(right, k), H), up(node(left, k + 1), H), 0.1, blue);
      }
    }
    // The portals: a lattice girder across each end, below the first strut.
    for (const k of [1, panels - 1]) {
      const a = node(left, k), b = node(right, k);
      member(builder, 'prop:steel', up(a, H - 1.3), up(b, H - 1.3), 0.16, blue);
      const m = 6;
      for (let j = 0; j < m; j++) {
        const p = (t, h) => up([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], h);
        member(builder, 'prop:steel', p(j / m, H - 1.3), p((j + 0.5) / m, H), 0.08, blue);
        member(builder, 'prop:steel', p((j + 0.5) / m, H), p((j + 1) / m, H - 1.3), 0.08, blue);
      }
    }
  }
  // Piers: stone, between the spans, where the water is deep.
  for (const s of piers) {
    const l = at(left, s), r = at(right, s);
    const c = [(l[0] + r[0]) / 2, (l[1] + r[1]) / 2, (l[2] + r[2]) / 2];
    const bed = terrain.heightAt(c[0], c[2]) - 1;
    if (c[1] - bed < 2.5) continue;
    const half = Math.hypot(l[0] - r[0], l[2] - r[2]) / 2 + 0.6;
    const ux = (l[0] - r[0]) / (2 * half - 1.2 || 1), uz = (l[2] - r[2]) / (2 * half - 1.2 || 1);
    const a = [c[0] - ux * half, bed, c[2] - uz * half], b = [c[0] + ux * half, bed, c[2] + uz * half];
    member(builder, 'road:concrete', up(a, 0), up(a, c[1] - bed - 0.3), 1.5, stone);
    member(builder, 'road:concrete', up(b, 0), up(b, c[1] - bed - 0.3), 1.5, stone);
  }
}

function oldPiers(builder, terrain, left, right, n, up, stone) {
  // Piers: a stone pier every third of the span where the water is deep.
  for (const f of [0.33, 0.66]) {
    const i = Math.round((n - 1) * f);
    const c = [(left[i][0] + right[i][0]) / 2, (left[i][1] + right[i][1]) / 2, (left[i][2] + right[i][2]) / 2];
    const bed = terrain.heightAt(c[0], c[2]) - 1;
    if (c[1] - bed < 2.5) continue;
    const half = Math.hypot(left[i][0] - right[i][0], left[i][2] - right[i][2]) / 2 + 0.6;
    const ux = (left[i][0] - right[i][0]) / (2 * half - 1.2 || 1), uz = (left[i][2] - right[i][2]) / (2 * half - 1.2 || 1);
    const a = [c[0] - ux * half, bed, c[2] - uz * half], b = [c[0] + ux * half, bed, c[2] + uz * half];
    member(builder, 'road:concrete', up(a, 0), up(a, c[1] - bed - 0.3), 1.5, stone);
    member(builder, 'road:concrete', up(b, 0), up(b, c[1] - bed - 0.3), 1.5, stone);
    member(builder, 'road:concrete', up([c[0], bed, c[2]], 0), up([c[0], bed, c[2]], c[1] - bed - 0.3), 1.8, stone);
  }
}

/** A round column from `y0` up to `y1` at (x, z), `r` meters across the middle, with `sides` faces. */
function column(builder, material, x, z, y0, y1, r, color, sides = 10) {
  for (let k = 0; k < sides; k++) {
    const a0 = (k / sides) * Math.PI * 2, a1 = ((k + 1) / sides) * Math.PI * 2, am = (a0 + a1) / 2;
    const p0 = [x + Math.cos(a0) * r, z + Math.sin(a0) * r], p1 = [x + Math.cos(a1) * r, z + Math.sin(a1) * r];
    const u0 = (k / sides) * 3, u1 = ((k + 1) / sides) * 3;
    builder.quad(material, [p0[0], y0, p0[1]], [p0[0], y1, p0[1]], [p1[0], y1, p1[1]], [p1[0], y0, p1[1]], [u0, 0], [u0, (y1 - y0) / 3], [u1, (y1 - y0) / 3], [u1, 0], color, [Math.cos(am), 0, Math.sin(am)]);
  }
}

/**
 * Whether there is a street, a railway or a building at ground level at (x, z), within `pad` meters of its edge:
 * where a pier must not stand. `decks` (from `profiles`) says which stretches of the bridged roads are up in the air.
 */
export function groundRoads(roads, decks, within = null) {
  const CELLSIZE = 24, grid = new Map();
  const add = (x, z, half) => {
    const k = `${Math.floor(x / CELLSIZE)},${Math.floor(z / CELLSIZE)}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push([x, z, half]);
  };
  for (const r of roads) {
    if (r.subtype === 'water' || r.line.length < 2 || r.class === 'footway' || r.class === 'path' || r.class === 'steps') continue;
    const half = r.subtype === 'rail' ? 2.4 : widthOf(r) / 2;
    const deck = decks.get(r);
    if (deck) deck.pts.forEach(([x, z], i) => { if (deck.y[i] - deck.ground[i] < 2) add(x, z, half); });
    else for (const [x, z] of sampleLine(r.line, 3)) add(x, z, half);
  }
  return (x, z, pad) => {
    const gx = Math.floor(x / CELLSIZE), gz = Math.floor(z / CELLSIZE);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) for (const [px, pz, half] of grid.get(`${gx + dx},${gz + dz}`) ?? []) {
      if (Math.hypot(px - x, pz - z) < half + pad) return true;
    }
    return within ? within(x, z, pad) : false;
  };
}

/**
 * An embankment from a deck's edge `seg` (two points) down to the ground, outward (away from the deck's middle),
 * at about 1 in 2.6 (1 in 1.4 where something stands at its foot), turfed, drawn and rolled on.
 */
function bank(builder, terrain, seg, across, blocked, over = null) {
  const [l, r] = across;
  const mid = [(l[0] + r[0]) / 2, (l[2] + r[2]) / 2];
  const foot = (p) => {
    let ox = p[0] - mid[0], oz = p[2] - mid[1];
    const ol = Math.hypot(ox, oz) || 1;
    ox /= ol; oz /= ol;
    const h = Math.max(0, p[1] - terrain.heightAt(p[0], p[2]));
    let w = Math.max(1, h * 2.6);
    if (blocked && blocked(p[0] + ox * w, p[2] + oz * w, 0.5)) w = Math.max(1, h * 1.4);
    const x = p[0] + ox * w, z = p[2] + oz * w;
    return [x, terrain.heightAt(x, z) - 0.05, z];
  };
  const [a, b] = seg, c = foot(b), d = foot(a);
  // Not over a street: where another road's surface lies on the slope (at about its height, or the ball and the eye
  // would take the bank for a heap on the road), the road carries on and the bank is left out.
  if (over) {
    const center = [(a[0] + b[0] + c[0] + d[0]) / 4, (a[1] + b[1] + c[1] + d[1]) / 4, (a[2] + b[2] + c[2] + d[2]) / 4];
    const foots = [[(c[0] + d[0]) / 2, (c[1] + d[1]) / 2, (c[2] + d[2]) / 2], center, [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2], [(b[0] + d[0]) / 2, (b[1] + d[1]) / 2, (b[2] + d[2]) / 2]];
    if (foots.some(([x, y, z]) => over(x, z).some((h) => Math.abs(h - y) < 1.4))) return;
  }
  // Wound to face up whichever way the edge runs.
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
  const ny = uz * vx - ux * vz;
  const n = [uy * vz - uz * vy, ny, ux * vy - uy * vx], nl = Math.hypot(...n) || 1;
  const quad = ny > 0 ? [a, b, c, d] : [a, d, c, b];
  const N = n.map((v) => (v * Math.sign(ny || 1)) / nl);
  const uv = (q) => [q[0] / 1.5, q[2] / 1.5];
  if (probes.banks) probes.banks.push({ road: probes.road, quad });
  builder.quad('ground:turf', ...quad, ...quad.map(uv), [0.95, 1, 0.9], N);
  builder.collide(quad[0], quad[1], quad[2]);
  builder.collide(quad[0], quad[2], quad[3]);
}

/**
 * Round a bridge's deck, wherever it stands above the ground: a girder face under its edges and the deck's
 * underside, a parapet (for a road; an unseen rail, for a footbridge), and, under it, either piers, where it is
 * high enough to pass beneath (the viaducts, and over a street or the river), or a solid retaining wall down to
 * the ground, where a ramp is too low to go under.
 * `blocked(x, z, pad)` says where a pier cannot stand (a street or railway at ground level, a building).
 */
export function dress(builder, bridges, terrain = null, blocked = null) {
  const concrete = 'surface:concrete';
  const pale = [0.8, 0.78, 0.74], soffit = [0.58, 0.57, 0.55];
  for (const bridge of bridges) {
    const { left, right, walk, deck, blue } = bridge;
    probes.road = bridge.road;
    const n = left.length;
    // Other roads' surfaces at (x, z) (the heights of them), without this road's own.
    const over = bridges.over ? (x, z) => bridges.over(x, z, bridge.road, 0.3) : null;
    const lift = (i) => Math.min(left[i][1], right[i][1]) - deck.ground[i];
    const high = (i) => lift(i) > 0.8;
    // Room to pass under: the river, a crossing, or high enough to walk or roll beneath.
    const under = (i) => deck.open[i] || deck.over?.[i] || lift(i) > 4.2;
    if (blue && terrain) {
      truss(builder, terrain, { left: left.slice(blue[0], blue[1] + 1), right: right.slice(blue[0], blue[1] + 1) });
    }
    const girder = walk ? 0.7 : 1.5;
    // The stretches of each edge (left, right) with no parapet, for the cap on top of it to leave out too.
    const crossed = [new Set(), new Set()];
    for (let i = 0; i + 1 < n; i++) {
      if (!high(i) || !high(i + 1)) {
        // A little off the ground (a ramp's foot, a deck coming down): banked up to it on both sides, so its edge is
        // not a lip the ball cannot climb; but not where another surface carries on past it.
        if (!walk && terrain && Math.max(lift(i), lift(i + 1)) > 0.3 && !under(i) && !under(i + 1)) {
          for (const [edge, other] of [[left, right], [right, left]]) {
            if (bridges.joined) {
              const out = (k) => {
                const ox = edge[k][0] - other[k][0], oz = edge[k][2] - other[k][2], ol = Math.hypot(ox, oz) || 1;
                return [edge[k][0] + ox / ol * 0.9, edge[k][2] + oz / ol * 0.9, edge[k][1]];
              };
              const [ax, az, ay] = out(i), [bx, bz, by] = out(i + 1);
              if (bridges.joined(ax, az, ay, bridge.road) || bridges.joined(bx, bz, by, bridge.road)) continue;
            }
            bank(builder, terrain, [edge[i], edge[i + 1]], [left[i], right[i]], blocked, over);
          }
        }
        continue;
      }
      // The underside, seen from beneath: the deck's soffit, a girder's depth down.
      const down = (p, d) => [p[0], p[1] - d, p[2]];
      builder.quad(concrete, down(left[i], girder), down(right[i], girder), down(right[i + 1], girder), down(left[i + 1], girder), [0, 0], [1, 0], [1, 1], [0, 1], soffit, [0, -1, 0]);
      for (const [edge, flip] of [[left, false], [right, true]]) {
        const seg = [edge[i], edge[i + 1]];
        // Where another road's surface carries on past this edge (a ramp merging, a street meeting the bridge, its pavement), no wall.
        const other = flip ? left : right;
        const past = (k) => {
          const ox = edge[k][0] - other[k][0], oz = edge[k][2] - other[k][2], ol = Math.hypot(ox, oz) || 1;
          return [edge[k][0] + ox / ol * 0.9, edge[k][2] + oz / ol * 0.9, edge[k][1]];
        };
        const opens = under(i) || under(i + 1);
        const drop = (k) => (opens ? girder : Math.max(girder, edge[k][1] - deck.ground[k] + 0.3));
        // Where another road runs through this edge (a street crossing the deck at its height, a ramp over it or under
        // it), no wall stands in its way: not the parapet, not the unseen fence above it, and not a girder's face
        // (which would show through a road below). Checked at both ends and the middle of the stretch.
        let flush = false, upper = false, lower = false;
        if (over) {
          for (const t of [0, 0.5, 1]) {
            const x = edge[i][0] + (edge[i + 1][0] - edge[i][0]) * t, z = edge[i][2] + (edge[i + 1][2] - edge[i][2]) * t, y = edge[i][1] + (edge[i + 1][1] - edge[i][1]) * t;
            for (const h of over(x, z)) {
              const rel = h - y;
              if (rel >= -0.15 && rel <= 1.05) flush = true;
              else if (rel > 1.05 && rel <= 2.9) upper = true;
              else if (rel < -0.15 && rel > -(drop(i) + 0.1)) lower = true;
            }
          }
        }
        if (bridges.joined) {
          // Five points along the stretch, a little way out (and a little further), at a looser height: a ramp's mouth is
          // narrower than a stretch of the edge, and meets it at a slope.
          const [ax, az, ay] = past(i), [bx, bz, by] = past(i + 1);
          let meets = false;
          for (let t = 0; t <= 1 && !meets; t += 0.25) {
            const px = ax + (bx - ax) * t, pz = az + (bz - az) * t, py = ay + (by - ay) * t;
            meets = bridges.joined(px, pz, py, bridge.road, 3);
            if (!meets) {
              const ex = edge[i][0] + (edge[i + 1][0] - edge[i][0]) * t, ez = edge[i][2] + (edge[i + 1][2] - edge[i][2]) * t;
              const ox = ex - (other[i][0] + (other[i + 1][0] - other[i][0]) * t), oz = ez - (other[i][2] + (other[i + 1][2] - other[i][2]) * t), ol = Math.hypot(ox, oz) || 1;
              meets = bridges.joined(ex + ox / ol * 2.2, ez + oz / ol * 2.2, py, bridge.road, 3);
            }
          }
          if (meets) {
            if (!lower) skirt(builder, concrete, seg, [girder, girder], { tile: 3, color: pale, flip, kind: 'girder' });
            crossed[flip ? 1 : 0].add(i);
            continue;
          }
        }
        if (walk) {
          if (!lower) skirt(builder, concrete, seg, [girder, girder], { tile: 3, color: pale, flip, kind: 'girder' });
          // A footbridge's rail: drawn as a thin steel band where it is not the Blue Bridge's truss, and unseen to the ball.
          if (!blue || i < blue[0] || i > blue[1]) skirt(builder, 'prop:steel', seg, -1.05, { tile: 3, color: [0.22, 0.24, 0.26], flip });
          // (A face stops a ball only from the front: faced both ways, the rail holds it from the deck as from the water.)
          skirt(builder, concrete, seg, -2.4, { flip, collide: true, draw: false, kind: 'footrail' });
          skirt(builder, concrete, seg, -2.4, { flip: !flip, collide: true, draw: false });
          continue;
        }
        if (flush) {
          if (!lower) skirt(builder, concrete, seg, [girder, girder], { tile: 3, color: pale, flip, kind: 'girder' });
          crossed[flip ? 1 : 0].add(i);
          continue;
        }
        // Too low to pass under, over nothing: not a wall but a bank of earth, sloping down to the ground as a
        // highway's embankment does, that the ball can roll up and over onto the road (no parapet).
        if (!opens && terrain) {
          bank(builder, terrain, [edge[i], edge[i + 1]], [left[i], right[i]], blocked, over);
          crossed[flip ? 1 : 0].add(i);
          continue;
        }
        if (!lower) skirt(builder, concrete, seg, [drop(i), drop(i + 1)], { tile: 3, color: pale, flip, collide: !opens, kind: 'girder' });
        // The parapet: a concrete barrier, faced both ways, that keeps the ball on the deck.
        skirt(builder, concrete, seg, -1.0, { tile: 3, color: [0.85, 0.83, 0.8], flip, kind: 'parapet' });
        skirt(builder, concrete, seg, -1.0, { tile: 3, color: [0.85, 0.83, 0.8], flip: !flip });
        // The ball is wider than the parapet is tall: an unseen fence above it keeps the ball on a high deck.
        if (!upper) {
          skirt(builder, concrete, seg, -2.8, { flip, collide: true, draw: false, kind: 'fence' });
          skirt(builder, concrete, seg, -2.8, { flip: !flip, collide: true, draw: false });
        }
      }
      if (!walk) {
        // The top of the parapet, so it reads as a wall and not a sheet.
        for (const [edge, sideOf, side] of [[left, right, 0], [right, left, 1]]) {
          if (crossed[side].has(i)) continue;
          const inset = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + 1.0, p[2] + (q[2] - p[2]) * t];
          const w = Math.hypot(edge[i][0] - sideOf[i][0], edge[i][2] - sideOf[i][2]) || 1, t = 0.35 / w;
          const a = inset(edge[i], sideOf[i], 0), b = inset(edge[i + 1], sideOf[i + 1], 0), c = inset(edge[i + 1], sideOf[i + 1], t), d = inset(edge[i], sideOf[i], t);
          builder.tri(concrete, a, b, c, [0, 0], [1, 0], [1, 1], [0.86, 0.84, 0.81]);
          builder.tri(concrete, a, c, d, [0, 0], [1, 1], [0, 1], [0.86, 0.84, 0.81]);
          builder.tri(concrete, a, c, b, [0, 0], [1, 1], [1, 0], [0.86, 0.84, 0.81]);
          builder.tri(concrete, a, d, c, [0, 0], [0, 1], [1, 1], [0.86, 0.84, 0.81]);
        }
      }
    }
    // The piers, where the deck is high and open beneath: a column (two, under a wide deck) and a cap beam across, every bay.
    const bay = walk ? 4 : 6;
    let last = -Infinity;
    for (let i = 1; i + 1 < n; i++) {
      if (i - last < bay || lift(i) < (walk ? 2.6 : 3.6) || !under(i)) continue;
      const c = [(left[i][0] + right[i][0]) / 2, (left[i][2] + right[i][2]) / 2];
      const across = [right[i][0] - left[i][0], right[i][2] - left[i][2]], width = Math.hypot(...across) || 1;
      const ux = across[0] / width, uz = across[1] / width;
      const r = walk ? 0.32 : 0.65;
      const feet = walk || width < 9 ? [0] : [-width * 0.28, width * 0.28];
      const spots = feet.map((o) => [c[0] + ux * o, c[1] + uz * o]);
      if (blocked && spots.some(([x, z]) => blocked(x, z, r + 0.8))) continue;
      last = i;
      const topY = (left[i][1] + right[i][1]) / 2 - girder;
      for (const [x, z] of spots) {
        const foot = (terrain ? terrain.heightAt(x, z) : deck.ground[i]) - 0.6;
        column(builder, concrete, x, z, foot, topY, r, pale);
        builder.trunks.push([x, z, r, foot, topY]);
      }
      if (!walk) {
        // The cap beam: a block across under the girders.
        const h = 1.1, half = width / 2 - 0.4, t = 0.9;
        const along = [-uz * t, ux * t];
        const P = (o, a, y) => [c[0] + ux * o + along[0] * a, y, c[1] + uz * o + along[1] * a];
        const y0 = topY - h, y1 = topY;
        const box = [[P(-half, -1, y0), P(half, -1, y0), P(half, -1, y1), P(-half, -1, y1)], [P(half, 1, y0), P(-half, 1, y0), P(-half, 1, y1), P(half, 1, y1)],
          [P(-half, 1, y0), P(-half, -1, y0), P(-half, -1, y1), P(-half, 1, y1)], [P(half, -1, y0), P(half, 1, y0), P(half, 1, y1), P(half, -1, y1)],
          [P(-half, -1, y0), P(-half, 1, y0), P(half, 1, y0), P(half, -1, y0)]];
        for (const [a, b, cc, d] of box) {
          builder.quad(concrete, a, b, cc, d, [0, 0], [1, 0], [1, 1], [0, 1], pale);
          builder.quad(concrete, d, cc, b, a, [0, 1], [1, 1], [1, 0], [0, 0], pale);
        }
      }
    }
  }
}
