/**
 * Drive mode: the player is kept on the roads. Every drivable street is a corridor (its centerline and half its width on
 * each side, as ground.js lays it); after each step of the physics a ball that has left every corridor is put back on
 * the edge of the nearest one and loses the part of its speed that was carrying it out, so it slides along the kerb as
 * along a wall. Where corridors meet (a junction, a ramp, a street under a bridge) the ball may be in any of them.
 *
 * The roads of the tiles come and go as the tiles are built and let go, each under a key (`add(key, roads)`,
 * `remove(key)`). All distances are in meters, on the map (x east, z south), as the data is.
 *
 *     const drive = createDrive();
 *     drive.add('core', [{ line: [[x, z], ...], width: 8 }]);
 *     const fix = drive.keep(x, z, radius);   // null if it is on a road (or there is no road near); else { x, z, nx, nz }
 *
 * `nx, nz` is the way out (from the road, toward where the ball was): take that much of its velocity away.
 */

const CELL = 64;

export function createDrive({ slack = 0.25 } = {}) {
  /** cell key -> segments; source key -> the cells it is in. */
  const cells = new Map();
  const sources = new Map();
  /** cell key -> open areas (parking lots); an area is { ring, source }. */
  const areas = new Map();
  let reach = 0;
  const key = (i, j) => i * 100003 + j;

  function remove(source) {
    const held = sources.get(source);
    if (!held) return;
    for (const k of held) {
      const list = cells.get(k)?.filter((s) => s.source !== source);
      if (list?.length) cells.set(k, list); else cells.delete(k);
      const lots = areas.get(k)?.filter((a) => a.source !== source);
      if (lots?.length) areas.set(k, lots); else areas.delete(k);
    }
    sources.delete(source);
  }

  /** `roads`: [{ line: [[x, z], ...], width }] (meters). A road's segments are indexed under `source`. */
  function add(source, roads, lots = []) {
    remove(source);
    const held = new Set();
    for (const road of roads) {
      const hw = Math.max(1, (road.width ?? 6) / 2 - slack);
      reach = Math.max(reach, hw);
      const line = road.line;
      for (let n = 1; n < line.length; n++) {
        const ax = line[n - 1][0], az = line[n - 1][1], bx = line[n][0], bz = line[n][1];
        const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
        if (!(len2 > 1e-6)) continue;
        const seg = { ax, az, dx, dz, len2, hw, source };
        const i0 = Math.floor((Math.min(ax, bx) - hw) / CELL), i1 = Math.floor((Math.max(ax, bx) + hw) / CELL);
        const j0 = Math.floor((Math.min(az, bz) - hw) / CELL), j1 = Math.floor((Math.max(az, bz) + hw) / CELL);
        for (let i = i0; i <= i1; i++) {
          for (let j = j0; j <= j1; j++) {
            const k = key(i, j);
            let list = cells.get(k);
            if (!list) cells.set(k, list = []);
            list.push(seg);
            held.add(k);
          }
        }
      }
    }
    // Open ground that is driven on as a road is: the parking lots (a ring of [x, z] each).
    for (const ring of lots) {
      if (!ring || ring.length < 3) continue;
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const [x, z] of ring) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
      const area = { ring, source };
      for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) {
        for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
          const k = key(i, j);
          let list = areas.get(k);
          if (!list) areas.set(k, list = []);
          list.push(area);
          held.add(k);
        }
      }
    }
    sources.set(source, held);
  }

  /** Whether (x, z) is inside the ring. */
  function within(ring, x, z) {
    let in_ = false;
    for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) {
      const [ax, az] = ring[a], [bx, bz] = ring[b];
      if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) in_ = !in_;
    }
    return in_;
  }

  /** The nearest point on the ring's edge to (x, z) and how far: { px, pz, d }. */
  function edgeOf(ring, x, z) {
    let best = { px: x, pz: z, d: Infinity };
    for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) {
      const ax = ring[b][0], az = ring[b][1], dx = ring[a][0] - ax, dz = ring[a][1] - az, l2 = dx * dx + dz * dz;
      const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
      const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
      if (d < best.d) best = { px, pz, d };
    }
    return best;
  }

  /** Inside a lot by `margin` (negative: the lot widened by that much). */
  function inLot(x, z, margin = 0) {
    for (const a of areas.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? []) {
      const e = edgeOf(a.ring, x, z);
      if (within(a.ring, x, z) ? e.d >= margin : -margin >= e.d) return true;
    }
    return false;
  }

  /** The closest point of `seg` to (x, z), and how much road is left there: the corridor's half width less the distance. */
  const probe = (seg, x, z, margin) => {
    const t = Math.max(0, Math.min(1, ((x - seg.ax) * seg.dx + (z - seg.az) * seg.dz) / seg.len2));
    const px = seg.ax + seg.dx * t, pz = seg.az + seg.dz * t;
    const d = Math.hypot(x - px, z - pz);
    return { px, pz, d, room: seg.hw - margin - d, hw: seg.hw };
  };

  /**
   * Where (x, z) must be moved to stay on a road: null if it is on one, or there is none near; else `{ x, z, nx, nz }`.
   * `margin` is what the ball reaches past its middle (its radius, less what may hang over the kerb).
   */
  function keep(x, z, margin = 0) {
    const list = cells.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? [];
    const lots = areas.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? [];
    if (!list.length && !lots.length) return null;
    // On a lot (a little in from its edge): on a road. Off it, the nearest lot's edge competes with the nearest road's.
    let lot = null, lotOut = Infinity;
    for (const a of lots) {
      const e = edgeOf(a.ring, x, z), inn = within(a.ring, x, z);
      if (inn && e.d >= margin) return null;
      const out = inn ? margin - e.d : e.d + margin;
      if (out < lotOut) { lotOut = out; lot = { ...e, inn }; }
    }
    let best = null, bestRoom = -Infinity;
    for (const seg of list) {
      const p = probe(seg, x, z, margin);
      if (p.room >= 0) return null;
      if (p.room > bestRoom) { bestRoom = p.room; best = p; best.seg = seg; }
    }
    // Only roads that were within a little of the ball count: a ball far from any (in a field, in the air) is left alone.
    if (lot && (!best || lotOut < -bestRoom || bestRoom < -40)) {
      // The lot's edge is the nearer wall: back to just inside it, along the way out.
      const nx0 = lot.inn ? lot.px - x : x - lot.px, nz0 = lot.inn ? lot.pz - z : z - lot.pz, l = Math.hypot(nx0, nz0) || 1;
      const nx = nx0 / l, nz = nz0 / l;
      return { x: lot.px - nx * margin, z: lot.pz - nz * margin, nx, nz };
    }
    if (!best || bestRoom < -40) return null;
    const out = best.d > 1e-6 ? [(x - best.px) / best.d, (z - best.pz) / best.d] : [0, 0];
    const at = Math.max(0, best.hw - margin);
    return { x: best.px + out[0] * at, z: best.pz + out[1] * at, nx: out[0], nz: out[1] };
  }

  /** Whether (x, z) is within some corridor, `margin` meters further in (0: anywhere on a road's width). */
  function inside(x, z, margin = 0) {
    for (const seg of cells.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? []) if (probe(seg, x, z, margin).room >= 0) return true;
    return inLot(x, z, margin);
  }

  /** The nearest point on any road to (x, z) within `within` meters, or null: to put a player down on a road. */
  function nearest(x, z, within = 300) {
    const r = Math.ceil(within / CELL);
    const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL);
    let best = null, bd = within;
    for (let i = ci - r; i <= ci + r; i++) {
      for (let j = cj - r; j <= cj + r; j++) {
        for (const seg of cells.get(key(i, j)) ?? []) {
          const p = probe(seg, x, z, 0);
          if (p.d < bd) { bd = p.d; best = { x: p.px, z: p.pz, d: p.d }; }
        }
      }
    }
    return best;
  }

  /**
   * The way the road runs at (x, z): a unit vector [dx, dz] (either of its two senses), or null if none is near. Given
   * `heading` (a unit [dx, dz], the way the player goes), of the roads it is on it is the one most along that way, so at
   * a junction it is the street being driven and not the one crossing it; on none, the nearest.
   */
  function along(x, z, within = 40, heading = null) {
    let best = null, bd = within, on = null, onScore = -1;
    for (const seg of cells.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? []) {
      const p = probe(seg, x, z, 0);
      if (p.d < bd) { bd = p.d; best = seg; }
      if (heading && p.room >= 0) {
        const score = Math.abs(seg.dx * heading[0] + seg.dz * heading[1]) / Math.sqrt(seg.len2);
        if (score > onScore) { onScore = score; on = seg; }
      }
    }
    if (on) best = on;
    if (!best) return null;
    const l = Math.sqrt(best.len2);
    return [best.dx / l, best.dz / l];
  }

  return { add, remove, keep, inside, nearest, along, get sources() { return sources.size; } };
}
