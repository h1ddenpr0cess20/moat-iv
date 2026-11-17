import { sampleLine } from './geometry.js';

export const WALKS = new Set(['footway', 'path', 'cycleway', 'steps', 'pedestrian', 'bridleway']);

/**
 * How the bridges stand. The map says which stretches of a road are a bridge (`is_bridge`, as fractions of its
 * length) and at what level; it does not say how high. So each bridge's deck is worked out here: it rides
 * between its two banks, and wherever it passes over another road, a railway or a path it is raised to clear
 * it, rising to that height and coming down again at the grade of a road, along the approaches too.
 */

/** The steepest a road climbs onto a bridge: rise per metre. */
const GRADE = 0.065;
/** The clearance under a bridge, in metres: over a street, and over a path. */
const OVER_ROAD = 5.6, OVER_WALK = 3.6;
/** How high a highway's viaduct stands over the ground it crosses, by its level: the S-curve of US-131 and the ramps of I-196 stand on piers, not on the ground. */
const VIADUCT = { 1: 6.8, 2: 12.6, 3: 18 };
/** The roads that ride a viaduct wherever the map says they are a bridge, not only where they cross something. */
export const HIGHWAY = new Set(['motorway', 'trunk']);

/**
 * The skywalks: the walkways held up between buildings, named so or running into them. They stay at one height
 * above the street, in an enclosed tube, and are no ramp for the ball.
 */
export function skywalks(roads, within) {
  const out = new Set();
  for (const r of roads) {
    if (!WALKS.has(r.class) || r.subclass === 'sidewalk' || r.subclass === 'crosswalk' || !rangesOf(r).length) continue;
    if (/sky/i.test(r.name ?? '') || sampleLine(r.line, 4).some(([x, z]) => within(x, z, 0))) out.add(r);
  }
  return out;
}

/** The stretches of `road`, as fractions of its length, that carry `flag` (a bridge, a tunnel). */
export const rangesOf = (road, flag = 'is_bridge') => (Array.isArray(road.flags) ? road.flags.filter((f) => f.values?.includes(flag)).map((f) => f.between ?? [0, 1]) : []);
/** Whether most of `road` runs in a tunnel: it is not drawn at all (a short tunnel in a long road is just road). */
export const tunnelled = (road) => rangesOf(road, 'is_tunnel').reduce((n, [a, b]) => n + (b - a), 0) >= 0.5;
const within = (ranges, t, margin = 0) => ranges.some(([a, b]) => t >= a + margin && t <= b - margin);

/** The level a road is at a fraction `t` of the way along: 0 on the ground, 1 on a bridge over it, -1 in a tunnel. */
export function levelAt(road, t) {
  let v = 0;
  if (Array.isArray(road.level)) for (const r of road.level) if (!r.between || (t >= r.between[0] && t <= r.between[1])) v = Math.max(v, r.value);
  return v;
}

const measure = (line) => {
  const cum = [0];
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
  return { cum, total: cum[cum.length - 1] };
};

/** Where segment a-b crosses segment c-d, as how far along each (0 to 1), or null. */
function cross(ax, az, bx, bz, cx, cz, dx, dz) {
  const rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz, den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * sz - (cz - az) * sx) / den, u = ((cx - ax) * rz - (cz - az) * rx) / den;
  return t < 0 || t > 1 || u < 0 || u > 1 ? null : [t, u];
}

/**
 * The deck of every road that has a bridge: a Map from the road to { pts, s, y, ground, open }, where for each
 * point (every 5 m along it) `y` is the height the road runs at, `ground` the terrain beneath, and `open`
 * whether there is a way through under it (over a street or the river), so nothing may wall it in.
 */
export function profiles(roads, terrain, skip = new Set()) {
  const info = roads.map((r) => measure(r.line));
  // Every segment of every road, by 64 m cell, to find what a bridge crosses.
  const CELL = 64, grid = new Map();
  roads.forEach((r, qi) => {
    if (r.subtype === 'water' || skip.has(r)) return;
    for (let k = 0; k + 1 < r.line.length; k++) {
      const [ax, az] = r.line[k], [bx, bz] = r.line[k + 1];
      for (let gz = Math.floor(Math.min(az, bz) / CELL); gz <= Math.floor(Math.max(az, bz) / CELL); gz++) for (let gx = Math.floor(Math.min(ax, bx) / CELL); gx <= Math.floor(Math.max(ax, bx) / CELL); gx++) {
        const key = `${gx},${gz}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(qi * 4096 + k);
      }
    }
  });
  const bridged = [];
  roads.forEach((r, i) => { if (r.subtype === 'road' && r.line.length > 1 && !skip.has(r) && rangesOf(r).length) bridged.push(i); });
  // The lowest first, so what a bridge crosses is already at its height when it is asked.
  const top = (i) => Math.max(0, ...(Array.isArray(roads[i].level) ? roads[i].level.map((l) => l.value) : [0]));
  bridged.sort((a, b) => top(a) - top(b));

  // Where roads meet: each end of every road, by its position, to tell an end that comes down to a street from one that carries on as a bridge.
  const key = (x, z) => `${Math.round(x * 2)},${Math.round(z * 2)}`;
  const nodes = new Map();
  roads.forEach((r, i) => {
    if (r.subtype !== 'road' || r.line.length < 2 || skip.has(r) || tunnelled(r)) return;
    for (const end of [0, 1]) {
      const [x, z] = r.line[end ? r.line.length - 1 : 0], k = key(x, z);
      if (!nodes.has(k)) nodes.set(k, []);
      nodes.get(k).push({ road: r, end, x, z });
    }
  });
  /** Whether a road's end comes down to the ground: some other road meets it there and none of them is a bridge at that end. */
  const grounded = (road, end) => {
    const [x, z] = road.line[end ? road.line.length - 1 : 0];
    const others = (nodes.get(key(x, z)) ?? []).filter((e) => e.road !== road);
    return others.length > 0 && !others.some((e) => within(rangesOf(e.road), e.end ? 1 : 0));
  };

  const out = new Map();
  const wet = (x, z) => terrain.waterLevel !== null && terrain.heightAt(x, z) < terrain.waterLevel + 0.6;
  for (const ri of bridged) {
    const road = roads[ri], { cum, total } = info[ri], ranges = rangesOf(road);
    const crossings = [];
    for (let k = 0; k + 1 < road.line.length; k++) {
      const [ax, az] = road.line[k], [bx, bz] = road.line[k + 1], seen = new Set();
      for (let gz = Math.floor(Math.min(az, bz) / CELL); gz <= Math.floor(Math.max(az, bz) / CELL); gz++) for (let gx = Math.floor(Math.min(ax, bx) / CELL); gx <= Math.floor(Math.max(ax, bx) / CELL); gx++) {
        for (const code of grid.get(`${gx},${gz}`) ?? []) {
          if (seen.has(code)) continue;
          seen.add(code);
          const qi = Math.floor(code / 4096), qk = code % 4096;
          if (qi === ri) continue;
          const q = roads[qi], [cx, cz] = q.line[qk], [dx, dz] = q.line[qk + 1];
          const h = cross(ax, az, bx, bz, cx, cz, dx, dz);
          if (!h) continue;
          const s = cum[k] + h[0] * (cum[k + 1] - cum[k]), qs = info[qi].cum[qk] + h[1] * (info[qi].cum[qk + 1] - info[qi].cum[qk]);
          const t = s / total, qt = qs / info[qi].total;
          // On the span itself, not at an end of it, and not where the other road simply begins or ends at this one.
          if (!within(ranges, t, 4 / total) || qs < 3 || qs > info[qi].total - 3 || s < 3 || s > total - 3) continue;
          if (within(rangesOf(q, 'is_tunnel'), qt)) continue;
          if (within(rangesOf(q), qt) && levelAt(q, qt) >= levelAt(road, t)) continue;
          const x = ax + (bx - ax) * h[0], z = az + (bz - az) * h[0];
          const below = out.get(q);
          let yq = terrain.heightAt(x, z) + 0.3;
          if (below) yq = below.y[Math.min(below.y.length - 1, Math.round(qs / (below.total / (below.y.length - 1))))];
          crossings.push({ s, y: yq + (WALKS.has(q.class) ? OVER_WALK : OVER_ROAD) });
        }
      }
    }
    const pts = sampleLine(road.line, 5), n = pts.length;
    const s = new Float64Array(n);
    for (let i = 1; i < n; i++) s[i] = s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const sTotal = s[n - 1] || 1;
    const ground = pts.map(([x, z]) => terrain.heightAt(x, z));
    // Each span rides between its banks (where the land was before the river was cut), never under the ground.
    const base = ground.slice();
    // The spans over water, from bank to bank: the deck there is held straight between the abutments, whatever the valley
    // does under it (`limit`, below, brings a deck down only at road grade, and would hold it up over a river's far wall).
    const span = new Uint8Array(n);
    for (const [a, b] of ranges) {
      if ((b - a) * total < 6) continue;
      let ia = 0, ib = n - 1;
      while (ia < n - 1 && s[ia] / sTotal < a) ia++;
      while (ib > 0 && s[ib] / sTotal > b) ib--;
      if (ib <= ia) continue;
      // Over water: out to the top of each bank (where the ground stops climbing, within 70 m), not just to where the map's bridge begins.
      let first = -1, last = -1;
      for (let i = ia; i <= ib; i++) if (wet(pts[i][0], pts[i][1])) { if (first < 0) first = i; last = i; }
      // (A highway's viaduct stands at its own clearance, and comes down at road grade: it is not a span between banks.)
      if (first >= 0 && HIGHWAY.has(road.class)) first = -1;
      if (first >= 0) {
        const top = (from, step) => {
          let i = from;
          for (let k = 0; k < 14; k++) {
            const j = i + step;
            if (j < 0 || j >= n || ground[j] - ground[i] < 0.25) break;
            i = j;
          }
          return i;
        };
        ia = Math.min(ia, top(first, -1));
        ib = Math.max(ib, top(last, 1));
      }
      const bank = (i) => Math.max(terrain.rawAt(pts[i][0], pts[i][1]), ground[i]) + 0.3;
      const ya = bank(ia), yb = bank(ib);
      const surface = terrain.waterLevel;
      for (let i = ia; i <= ib; i++) {
        base[i] = Math.max(ya + (yb - ya) * ((s[i] - s[ia]) / (s[ib] - s[ia] || 1)), ground[i] + 0.2);
        // Clear of the water by a boat's height, where there is water under it.
        if (first >= 0 && surface !== null && wet(pts[i][0], pts[i][1])) base[i] = Math.max(base[i], surface + 2.8);
        if (first >= 0) span[i] = 1;
      }
      // A highway's bridge is a viaduct: held its clearance over the land all along, coming down at road grade only toward an end that meets the streets.
      if (HIGHWAY.has(road.class)) {
        const down0 = grounded(road, 0), down1 = grounded(road, 1);
        for (let i = ia; i <= ib; i++) {
          if (wet(pts[i][0], pts[i][1])) continue;
          const clear = VIADUCT[Math.max(1, Math.min(3, levelAt(road, s[i] / sTotal) || 1))];
          const toEnd = Math.min(down0 ? s[i] : Infinity, down1 ? sTotal - s[i] : Infinity);
          base[i] = Math.max(base[i], ground[i] + Math.min(clear, Math.max(0.2, toEnd * GRADE)));
        }
      }
    }
    const y = new Float64Array(n), open = new Array(n).fill(false), over = new Array(n).fill(false);
    for (let i = 0; i < n; i++) {
      let h = base[i];
      for (const c of crossings) {
        const d = Math.abs(s[i] - c.s);
        h = Math.max(h, c.y - GRADE * d);
        if (d < 18) open[i] = over[i] = true;
      }
      y[i] = h;
      if (wet(pts[i][0], pts[i][1])) open[i] = true;
    }
    out.set(road, { pts, s, y, ground, open, over, span, total: sTotal });
  }
  const deckOf = (road) => {
    let p = out.get(road);
    if (!p) {
      const pts = sampleLine(road.line, 5), s = new Float64Array(pts.length);
      for (let i = 1; i < pts.length; i++) s[i] = s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      const ground = pts.map(([x, z]) => terrain.heightAt(x, z));
      p = { pts, s, y: Float64Array.from(ground), ground, open: new Array(pts.length).fill(false), over: new Array(pts.length).fill(false), total: s[pts.length - 1] || 1, ramp: true };
    }
    return p;
  };
  // A pavement on a bridge keeps level with the road beside it: along its own span, and on along the ramps up to it,
  // where the map does not call it a bridge but the road beside it has risen off the ground (or the two come apart).
  const decks = new Map();
  for (const [road, p] of out) {
    if (WALKS.has(road.class)) continue;
    p.pts.forEach(([x, z], i) => {
      if (p.y[i] - p.ground[i] <= 0.25) return;
      const a = p.pts[Math.max(0, i - 1)], b = p.pts[Math.min(p.pts.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const k = `${Math.floor(x / 12)},${Math.floor(z / 12)}`;
      if (!decks.has(k)) decks.set(k, []);
      decks.get(k).push([x, z, p.y[i], (b[0] - a[0]) / l, (b[1] - a[1]) / l, p, i, HIGHWAY.has(road.class)]);
    });
  }
  for (const road of roads) {
    if (!WALKS.has(road.class) || road.subtype !== 'road' || road.subclass === 'crosswalk' || road.line.length < 2 || skip.has(road) || tunnelled(road)) continue;
    const mine = rangesOf(road);
    let p = out.get(road) ?? null, changed = false;
    const pts = p ? p.pts : sampleLine(road.line, 5);
    const ys = p ? p.y : null;
    const lifted = [];
    pts.forEach(([x, z], i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const dx = (b[0] - a[0]) / l, dz = (b[1] - a[1]) / l;
      const here = ys ? ys[i] : terrain.heightAt(x, z);
      // On its own span a bridge may stand a storey over it; off it, only a ramp's rise: more is another road above.
      const span = p && within(mine, p.s[i] / p.total), most = span ? 9 : 3;
      let best = null;
      for (let gz = -1; gz <= 1; gz++) for (let gx = -1; gx <= 1; gx++) for (const q of decks.get(`${Math.floor(x / 12) + gx},${Math.floor(z / 12) + gz}`) ?? []) {
        // Beside it and running the same way: not a bridge that crosses over it.
        if (Math.abs(q[3] * dx + q[4] * dz) < 0.85) continue;
        // A highway has no pavement but on its bridges: a path beside its viaduct, off a span of its own, is on the ground under it.
        if (q[7] && !span) continue;
        const d = Math.hypot(q[0] - x, q[1] - z);
        if (d < 16 && (!best || d < best.d)) best = { d, y: q[2], q };
      }
      // The pavement on a bridge that the map has rise higher than its road (its own crossing worked out apart): the road comes up to it.
      if (best && p && here - best.y > 0.25 && here - best.y < 9) {
        const [, , , , , rp, ri] = best.q;
        rp.y[ri] = Math.max(rp.y[ri], here);
      }
      lifted.push(best && best.y - here > 0.25 && best.y - here < most ? best.y : null);
    });
    if (!lifted.some((v) => v !== null)) continue;
    if (!p) { p = deckOf(road); out.set(road, p); }
    lifted.forEach((y, i) => { if (y !== null && y > p.y[i]) { p.y[i] = y; changed = true; } });
    if (changed) p.walkway = true;
  }
  // The map cuts a highway into many roads: where two meet they must meet at one height, so a deck that has risen
  // to cross a street carries on at that height into the next road, which then comes down at road grade.
  // The rise over the ground changes at a road's grade, not the height: on a hill the deck comes down with the
  // hillside and does not hang over a street that climbs faster than a ramp may.
  // Steps come down as stairs do, and a path as a ramp for walking may (1 in 12): neither carries a bridge's height
  // far out along the ground the way a street's ramp must.
  // (A road's ramp comes down a step for each point along it, every 5 m or less.)
  const limit = (p, road) => {
    const walk = WALKS.has(road.class), grade = road.class === 'steps' ? 0.7 : 1 / 12, g = p.ground, s = p.s;
    const drop = (i, j) => (walk ? grade * Math.abs(s[j] - s[i]) : GRADE * 5);
    // (Not along a span over water: there the deck is straight between the banks, the valley beneath it or not.)
    const free = (i, j) => p.span && p.span[i] && p.span[j];
    for (let i = 1; i < p.y.length; i++) if (!free(i - 1, i)) p.y[i] = Math.max(p.y[i], g[i] + (p.y[i - 1] - g[i - 1]) - drop(i - 1, i));
    for (let i = p.y.length - 2; i >= 0; i--) if (!free(i, i + 1)) p.y[i] = Math.max(p.y[i], g[i] + (p.y[i + 1] - g[i + 1]) - drop(i, i + 1));
  };
  for (const [road, p] of out) limit(p, road);
  for (let round = 0; round < 40; round++) {
    let changed = false;
    for (const ends of nodes.values()) {
      if (ends.length < 2) continue;
      // The highest any of the roads here stands at this point.
      let top = -Infinity;
      for (const e of ends) { const p = out.get(e.road); top = Math.max(top, p ? p.y[e.end ? p.y.length - 1 : 0] : terrain.heightAt(e.x, e.z)); }
      for (const e of ends) {
        const g = terrain.heightAt(e.x, e.z);
        let p = out.get(e.road);
        const here = p ? p.y[e.end ? p.y.length - 1 : 0] : g;
        if (top - here < 0.05 || (!p && top - g < 0.25)) continue;
        if (!p) { p = deckOf(e.road); out.set(e.road, p); }
        p.y[e.end ? p.y.length - 1 : 0] = top;
        limit(p, e.road);
        changed = true;
      }
    }
    if (!changed) break;
  }
  // Last, a pavement beside a road's deck is laid at the deck's height, whatever its own ends were raised to: the
  // two are one bridge, and a step or a gap between them is what the eye catches first.
  const beside = new Map();
  for (const [road, p] of out) {
    if (WALKS.has(road.class)) continue;
    p.pts.forEach(([x, z], i) => {
      const a = p.pts[Math.max(0, i - 1)], b = p.pts[Math.min(p.pts.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const k = `${Math.floor(x / 12)},${Math.floor(z / 12)}`;
      if (!beside.has(k)) beside.set(k, []);
      beside.get(k).push([x, z, p.y[i], (b[0] - a[0]) / l, (b[1] - a[1]) / l, HIGHWAY.has(road.class)]);
    });
  }
  for (const [road, p] of out) {
    if (!WALKS.has(road.class) || road.subclass === 'crosswalk') continue;
    p.pts.forEach(([x, z], i) => {
      const a = p.pts[Math.max(0, i - 1)], b = p.pts[Math.min(p.pts.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const dx = (b[0] - a[0]) / l, dz = (b[1] - a[1]) / l;
      const span = within(rangesOf(road), p.s[i] / p.total);
      let best = null;
      for (let gz = -1; gz <= 1; gz++) for (let gx = -1; gx <= 1; gx++) for (const q of beside.get(`${Math.floor(x / 12) + gx},${Math.floor(z / 12) + gz}`) ?? []) {
        if (Math.abs(q[3] * dx + q[4] * dz) < 0.85 || (q[5] && !span)) continue;
        const d = Math.hypot(q[0] - x, q[1] - z);
        if (d < 16 && (!best || d < best.d)) best = { d, y: q[2], highway: q[5] };
      }
      // On its own span, or beside a street's bridge, the deck beside it is its road's; beside a highway and off its
      // own span it is not (a highway has no pavement but on its bridges: what runs beside its viaduct is under it).
      if (!best) return;
      if (Math.abs(best.y - p.y[i]) < 8) p.y[i] = Math.max(best.y, p.ground[i]);
    });
    // Where it was brought down beside a lower road and not just past it, it comes down at a grade, not a step.
    limit(p, road);
  }
  return out;
}
