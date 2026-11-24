/**
 * The shops, bars and restaurants of the greater city (Overture's places: scripts/metro.py `places`), each with its
 * name on a board over its door (and, for Yesterdog alone, an awning under it), on the wall of its building that faces the street; and the
 * buildings they are in dressed as the old commercial blocks of a neighborhood's main street: painted brick over
 * a row of shop windows, a cornice along the top.
 *
 * The names are drawn on the page (signAtlas), one canvas a tile: the boards here only say which slot of it is theirs.
 */
import { inside, unit } from './geometry.js';
import { WALKS } from './bridges.js';

/** A slot of the atlas, in pixels: eight to one, as a board is. */
export const SLOT = { w: 256, h: 32, cols: 8 };
/** How high a board is, and how high its middle stands over the pavement, meters. */
const BOARD = 0.8, AT = 3.95;

/** The main street's brick and paint: red and brown brick, cream, and the colors its shops are painted. */
const TINTS = ['#c47a62', '#a8705c', '#d08a70', '#f0e2c4', '#7fa8a2', '#d9b14e', '#9a5a68', '#6f8a66', '#c9744e', '#7a8fae', '#e8d9bd', '#b06a58'];
const CORNICES = ['#efe6d4', '#3f4a4a', '#e2d6bc', '#5a3a34', '#f4efe6'];

/** The look of a building on a main street, for buildings.js. */
export function storefrontLook(key) {
  const r = unit(`${key}front`), s = unit(`${key}paint`), c = unit(`${key}cornice`);
  return {
    wall: r < 0.3 ? 'historic-arched' : 'historic',
    tint: TINTS[Math.floor(s * TINTS.length) % TINTS.length],
    base: { wall: 'shop', h: 4.4 },
    cornice: { h: 0.8, d: 0.45, tint: CORNICES[Math.floor(c * CORNICES.length) % CORNICES.length] },
    penthouse: false,
  };
}

/**
 * Where each business's board goes: on the building it is in (or the nearest, a few meters off), on that building's
 * wall nearest the street, along it where the business is, not over another's. Marks those buildings `storefront`.
 * Returns the boards: [{ name, kind, b, A, B, n, t0, t1, slot, used }].
 */
export function shopfronts(buildings, places, roads) {
  if (!places?.length) return [];
  const CELL = 32, grid = new Map(), streets = new Map();
  const put = (map, x, z, v) => { const k = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`; if (!map.has(k)) map.set(k, []); map.get(k).push(v); };
  buildings.forEach((b, i) => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of b.rings[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    for (let gz = Math.floor(z0 / CELL); gz <= Math.floor(z1 / CELL); gz++) for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++) {
      const k = `${gx},${gz}`;
      if (!grid.has(k)) grid.set(k, new Set());
      grid.get(k).add(i);
    }
  });
  for (const r of roads) {
    if (r.subtype !== 'road' || WALKS.has(r.class) || ['motorway', 'trunk', 'service', 'track'].includes(r.class) || r.line.length < 2) continue;
    for (let k = 0; k + 1 < r.line.length; k++) {
      const [ax, az] = r.line[k], [bx, bz] = r.line[k + 1], n = Math.ceil(Math.hypot(bx - ax, bz - az) / CELL) + 1;
      const seg = [ax, az, bx, bz];
      const seen = new Set();
      for (let s = 0; s <= n; s++) {
        const x = ax + (bx - ax) * s / n, z = az + (bz - az) * s / n, key = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        put(streets, x, z, seg);
      }
    }
  }
  const near = (map, x, z, reach) => {
    const out = new Set(), m = Math.ceil(reach / CELL);
    for (let dz = -m; dz <= m; dz++) for (let dx = -m; dx <= m; dx++) for (const v of map.get(`${Math.floor(x / CELL) + dx},${Math.floor(z / CELL) + dz}`) ?? []) out.add(v);
    return out;
  };
  const toSeg = (x, z, ax, az, bx, bz) => {
    const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l));
    return [ax + dx * t, az + dz * t, Math.hypot(x - ax - dx * t, z - az - dz * t)];
  };

  const taken = new Map(); // `${building},${edge}` -> [[t0, t1]]
  const boards = [];
  // Many businesses under one roof (a market's stalls, an office block's tenants) are one point on the map: one sign
  // for them, the building's own name if one has it, else the first.
  const spots = new Map();
  for (const p of places) {
    const k = `${Math.round(p[1])},${Math.round(p[2])}`;
    const was = spots.get(k);
    const rank = (q) => (/^Downtown Market/.test(q[0]) ? 2 : /Market|Hall|Center|Center/.test(q[0]) ? 1 : 0);
    if (!was || rank(p) > rank(was)) spots.set(k, p);
  }
  for (const [full, px, pz, kind] of spots.values()) {
    const name = full.replace(/,?\s+(Inc\.?|LLC|L\.L\.C\.)$/i, '').replace(/^Downtown Market Grand Rapids$/, 'Downtown Market').trim();
    // Its building: the one it is in, or the nearest within a few meters.
    let best = null;
    for (const i of near(grid, px, pz, 16)) {
      const b = buildings[i];
      if (inside(b.rings, px, pz)) { best = { i, d: 0 }; break; }
      const ring = b.rings[0];
      for (let k = 0; k + 1 < ring.length; k++) {
        const d = toSeg(px, pz, ring[k][0], ring[k][1], ring[k + 1][0], ring[k + 1][1])[2];
        if (d < 14 && (!best || d < best.d)) best = { i, d };
      }
    }
    if (!best) continue;
    const b = buildings[best.i];
    // The street it faces.
    let road = null;
    for (const [ax, az, bx, bz] of near(streets, px, pz, 70)) {
      const [qx, qz, d] = toSeg(px, pz, ax, az, bx, bz);
      if (d < 70 && (!road || d < road.d)) road = { x: qx, z: qz, d };
    }
    if (!road) continue;
    // The wall of it nearest that street, facing it.
    const ring = b.rings[0];
    let wall = null;
    for (let k = 0; k + 1 < ring.length; k++) {
      const A = ring[k], B = ring[k + 1], dx = B[0] - A[0], dz = B[1] - A[1], L = Math.hypot(dx, dz);
      if (L < 3.4) continue;
      let n = [-dz / L, dx / L];
      const mx = (A[0] + B[0]) / 2, mz = (A[1] + B[1]) / 2;
      if (inside(b.rings, mx + n[0] * 0.3, mz + n[1] * 0.3)) n = [-n[0], -n[1]];
      const tx = road.x - mx, tz = road.z - mz, tl = Math.hypot(tx, tz) || 1;
      if ((n[0] * tx + n[1] * tz) / tl < 0.35) continue;
      const d = toSeg(road.x, road.z, A[0], A[1], B[0], B[1])[2];
      if (!wall || d < wall.d) wall = { k, A, B, L, n, d };
    }
    if (!wall || wall.d > 45) continue;
    // As wide as the name wants, as the wall allows; where the business is along it, clear of the other boards.
    const width = Math.min(BOARD * 8, wall.L - 0.6, Math.max(2.4, 0.34 * name.length + 0.9));
    if (width < 2) continue;
    const [ax, az] = wall.A, [bx, bz] = wall.B;
    const along = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (pz - az) * (bz - az)) / (wall.L * wall.L))) * wall.L;
    const key = `${best.i},${wall.k}`;
    const used = taken.get(key) ?? [];
    let t0 = null;
    for (const shift of [0, 1, -1, 2, -2, 3, -3, 4, -4]) {
      const c = Math.max(width / 2 + 0.3, Math.min(wall.L - width / 2 - 0.3, along + shift * (width / 2 + 0.4)));
      const a = c - width / 2, z = c + width / 2;
      if (used.every(([u0, u1]) => z + 0.25 < u0 || a - 0.25 > u1)) { t0 = a; break; }
    }
    if (t0 === null) continue;
    used.push([t0, t0 + width]);
    taken.set(key, used);
    b.storefront = true;
    boards.push({ name, kind, b, A: wall.A, B: wall.B, n: wall.n, t0, t1: t0 + width, L: wall.L, room: wall.d, slot: boards.length, used: Math.min(1, width / BOARD / 8) });
  }
  return boards;
}

/** The boards and their awnings into `builder`, the boards on material `sign:<key>` (the tile's atlas, `rows` slots high). */
export function signs(builder, terrain, boards, key, footOf) {
  const rows = atlasRows(boards.length);
  const W = SLOT.w * SLOT.cols, H = SLOT.h * rows;
  for (const s of boards) {
    const foot = footOf(s.b);
    const [ax, az] = s.A, [bx, bz] = s.B, L = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / L, uz = (bz - az) / L, [nx, nz] = s.n;
    // Seen from the street (looking along -n), its right hand is (nz, -nx): the board reads left to right that way,
    // and wound so, it faces the street.
    const flip = ux * nz - uz * nx < 0;
    const p = (t, out, y) => [ax + ux * t + nx * out, y, az + uz * t + nz * out];
    const [l, r] = flip ? [s.t1, s.t0] : [s.t0, s.t1];
    const y0 = foot + AT - BOARD / 2, y1 = foot + AT + BOARD / 2, out = 0.14;
    const col = s.slot % SLOT.cols, row = Math.floor(s.slot / SLOT.cols);
    const u0 = (col * SLOT.w) / W, u1 = u0 + (s.used * SLOT.w) / W;
    const vTop = 1 - (row * SLOT.h) / H, vBot = 1 - ((row + 1) * SLOT.h) / H;
    const n = [nx, 0, nz];
    builder.quad(`sign:${key}`, p(l, out, y0), p(r, out, y0), p(r, out, y1), p(l, out, y1), [u0, vBot], [u1, vBot], [u1, vTop], [u0, vTop], [1, 1, 1], n);
    // Its edges, back to the wall.
    const frame = [0.16, 0.15, 0.14];
    for (const [y, up] of [[y1, 1], [y0, -1]]) {
      const a = p(l, 0.02, y), b = p(r, 0.02, y), c = p(r, out, y), d = p(l, out, y);
      builder.quad('prop:board', a, b, c, d, [0, 0], [1, 0], [1, 1], [0, 1], frame, [0, up, 0]);
      builder.quad('prop:board', d, c, b, a, [0, 0], [1, 0], [1, 1], [0, 1], frame, [0, up, 0]);
    }
    // The awning under it: cloth on a frame, out over the pavement and down a little. Only Yesterdog has one (and its
    // umbrellas and valance, below); every other board stands on its own on the wall.
    const awned = AWNED.test(s.name);
    const awning = AWNINGS[Math.floor(unit(`${s.name}awning`) * AWNINGS.length) % AWNINGS.length];
    const a0 = foot + 3.35, a1 = foot + 2.7, reach = 1.4, pad = 0.15;
    const al = s.t0 - pad, ar = s.t1 + pad;
    if (awned) {
      const top0 = p(al, 0.02, a0), top1 = p(ar, 0.02, a0), low1 = p(ar, reach, a1), low0 = p(al, reach, a1);
      const slope = [nx * 0.42, 0.91, nz * 0.42];
      builder.quad('prop:cloth', top0, top1, low1, low0, [0, 0], [1, 0], [1, 1], [0, 1], awning, slope);
      builder.quad('prop:cloth', low0, low1, top1, top0, [0, 0], [1, 0], [1, 1], [0, 1], awning.map((v) => v * 0.6), slope.map((v) => -v));
    }
    // A bar's or a club's blade: its name again, up the wall on a sign standing out over the pavement, read from
    // along the street either way.
    if ((s.kind === 'drink' || s.kind === 'venue') && s.L > 0) {
      const at = Math.min(s.L - 0.3, s.t1 + 0.7), tall = Math.max(2, Math.min(4.6, s.t1 - s.t0)), b0 = foot + 3.6, b1 = b0 + tall;
      const w0 = 0.12, w1 = 0.95;
      for (const m of [[ux, uz], [-ux, -uz]]) {
        // Seen from where m points, its right hand is (mz, -mx): which edge of the blade is that.
        const outRight = nx * m[1] - nz * m[0] > 0;
        const [L0, R0] = outRight ? [w0, w1] : [w1, w0];
        const off = m[0] === ux ? 0.04 : -0.04;
        const q = (out, y) => [ax + ux * (at + off) + nx * out, y, az + uz * (at + off) + nz * out];
        builder.quad(`sign:${key}`, q(L0, b0), q(R0, b0), q(R0, b1), q(L0, b1), [u0, vTop], [u0, vBot], [u1, vBot], [u1, vTop], [1, 1, 1], [m[0], 0, m[1]]);
      }
      // Its iron bracket.
      builder.quad('prop:steel', p(at, 0.02, b1 + 0.05), p(at, w1, b1 + 0.05), p(at, w1, b1 + 0.12), p(at, 0.02, b1 + 0.12), [0, 0], [1, 0], [1, 1], [0, 1], [0.2, 0.2, 0.22], n);
    }
    // A restaurant's or a bar's tables out on a wide pavement, under umbrellas.
    if (awned && (s.kind === 'food' || s.kind === 'drink') && s.room > 10.5) {
      const mid = (s.t0 + s.t1) / 2, cloth = UMBRELLAS[Math.floor(unit(`${s.name}umbrella`) * UMBRELLAS.length) % UMBRELLAS.length];
      for (const dt of s.t1 - s.t0 > 4 ? [-1.5, 1.5] : [0]) {
        const [cx, , cz] = p(mid + dt, 2.3, 0);
        const g = terrain.heightAt(cx, cz) + 0.18;
        patio(builder, cx, cz, g, cloth);
      }
    }
    // Its valance: a band hanging at the front.
    if (awned) {
      const [vl, vr] = flip ? [ar, al] : [al, ar];
      builder.quad('prop:cloth', p(vl, reach, a1 - 0.25), p(vr, reach, a1 - 0.25), p(vr, reach, a1), p(vl, reach, a1), [0, 0], [1, 0], [1, 1], [0, 1], awning, n);
    }
  }
}

/** The businesses that keep their awnings and umbrellas. */
const AWNED = /yesterdog/i;
const UMBRELLAS = [[0.92, 0.9, 0.85], [0.55, 0.08, 0.08], [0.1, 0.3, 0.16], [0.08, 0.12, 0.3], [0.8, 0.5, 0.1]];

/** A table under an umbrella at (x, z), on ground at y: a post, a round top, an eight-sided canopy, two stools. */
function patio(builder, x, z, y, cloth) {
  const post = (r, y0, y1, color) => {
    for (let k = 0; k < 4; k++) {
      const a0 = (k / 4) * Math.PI * 2, a1 = ((k + 1) / 4) * Math.PI * 2;
      const A = [x + Math.cos(a0) * r, y0, z + Math.sin(a0) * r], B = [x + Math.cos(a1) * r, y0, z + Math.sin(a1) * r];
      builder.quad('prop:steel', B, A, [A[0], y1, A[2]], [B[0], y1, B[2]], [0, 0], [1, 0], [1, 1], [0, 1], color, [Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)]);
    }
  };
  post(0.04, y, y + 2.45, [0.25, 0.25, 0.27]);
  const disc = (r, h, color, mat, down = false) => {
    for (let k = 0; k < 8; k++) {
      const a0 = (k / 8) * Math.PI * 2, a1 = ((k + 1) / 8) * Math.PI * 2;
      const A = [x + Math.cos(a0) * r, h, z + Math.sin(a0) * r], B = [x + Math.cos(a1) * r, h, z + Math.sin(a1) * r];
      if (down) builder.tri(mat, [x, h, z], A, B, [0.5, 0.5], [0, 0], [1, 0], color, [0, -1, 0]);
      else builder.tri(mat, [x, h, z], B, A, [0.5, 0.5], [0, 0], [1, 0], color, [0, 1, 0]);
    }
  };
  disc(0.45, y + 0.75, [0.18, 0.17, 0.16], 'prop:board');
  disc(0.45, y + 0.72, [0.12, 0.12, 0.12], 'prop:board', true);
  // The canopy: a low cone, both sides.
  const r = 1.25, top = y + 2.5, rim = y + 2.15;
  for (let k = 0; k < 8; k++) {
    const a0 = (k / 8) * Math.PI * 2, a1 = ((k + 1) / 8) * Math.PI * 2;
    const A = [x + Math.cos(a0) * r, rim, z + Math.sin(a0) * r], B = [x + Math.cos(a1) * r, rim, z + Math.sin(a1) * r];
    const am = (a0 + a1) / 2, nrm = [Math.cos(am) * 0.27, 0.96, Math.sin(am) * 0.27];
    builder.tri('prop:cloth', [x, top, z], B, A, [0.5, 1], [0, 0], [1, 0], cloth, nrm);
    builder.tri('prop:cloth', [x, top, z], A, B, [0.5, 1], [0, 0], [1, 0], cloth.map((v) => v * 0.7), nrm.map((v) => -v));
  }
  // Two stools.
  for (const a of [0.6, 0.6 + Math.PI]) {
    const sx = x + Math.cos(a) * 0.8, sz = z + Math.sin(a) * 0.8;
    for (let k = 0; k < 6; k++) {
      const a0 = (k / 6) * Math.PI * 2, a1 = ((k + 1) / 6) * Math.PI * 2;
      builder.tri('prop:board', [sx, y + 0.5, sz], [sx + Math.cos(a1) * 0.2, y + 0.5, sz + Math.sin(a1) * 0.2], [sx + Math.cos(a0) * 0.2, y + 0.5, sz + Math.sin(a0) * 0.2], [0.5, 0.5], [0, 0], [1, 0], [0.3, 0.22, 0.16], [0, 1, 0]);
    }
  }
}

/** Awning cloth: deep red, forest green, navy, black, mustard, teal, striped colors made plain. */
const AWNINGS = [[0.55, 0.08, 0.08], [0.1, 0.3, 0.16], [0.08, 0.12, 0.3], [0.05, 0.05, 0.05], [0.75, 0.55, 0.1], [0.1, 0.38, 0.4], [0.45, 0.12, 0.3], [0.3, 0.3, 0.32]];

/** How many rows of slots a tile's atlas has: enough for `n` boards, a power of two. */
export const atlasRows = (n) => { let r = 4; while (r * SLOT.cols < n) r *= 2; return r; };

/** What each board looks like on the atlas: the colors and the lettering, by the kind of place and its name. */
const STYLES = {
  drink: [['#141418', '#ff6fb0'], ['#16181c', '#ffcf5a'], ['#101820', '#6ff0ff'], ['#2a0f12', '#f6d27a']],
  food: [['#8c1c1c', '#fff4dc'], ['#1f4d2c', '#fff4dc'], ['#d9a62a', '#2a1a10'], ['#1d2c4a', '#ffe6b0'], ['#f4ead2', '#8c1c1c']],
  venue: [['#0c0c0c', '#f2c75c'], ['#2b1240', '#ffd6f4'], ['#0e2430', '#ffffff']],
  shop: [['#f6efe0', '#22201c'], ['#ffffff', '#1d3c5a'], ['#e9dccb', '#5a2a1a'], ['#22303a', '#f6efe0']],
  service: [['#0f3b46', '#ffffff'], ['#f2e8e0', '#3a2a2a'], ['#1a1a1a', '#e8e8e8']],
};
const FONTS = ['bold 22px Georgia, serif', 'bold 22px "Trebuchet MS", sans-serif', 'italic bold 22px Georgia, serif', 'bold 21px Impact, "Arial Black", sans-serif', 'bold 22px "Courier New", monospace', '600 22px "Brush Script MT", cursive'];

/** Paints the boards' names into a canvas (on the page): what a tile's `sign:` material shows. */
export function paintAtlas(boards) {
  const rows = atlasRows(boards.length);
  const canvas = document.createElement('canvas');
  canvas.width = SLOT.w * SLOT.cols; canvas.height = SLOT.h * rows;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#202020';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const s of boards) {
    const x = (s.slot % SLOT.cols) * SLOT.w, y = Math.floor(s.slot / SLOT.cols) * SLOT.h, w = Math.max(8, Math.floor(s.used * SLOT.w));
    const styles = STYLES[s.kind] ?? STYLES.shop;
    const [bg, fg] = styles[Math.floor(unit(`${s.name}sign`) * styles.length) % styles.length];
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, SLOT.h);
    ctx.strokeStyle = fg; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 2.5, y + 2.5, w - 5, SLOT.h - 5);
    ctx.globalAlpha = 1;
    ctx.font = FONTS[Math.floor(unit(`${s.name}font`) * FONTS.length) % FONTS.length];
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const text = s.kind === 'drink' || s.kind === 'venue' ? s.name.toUpperCase() : s.name;
    const m = ctx.measureText(text).width, room = w - 12;
    ctx.save();
    ctx.translate(x + w / 2, y + SLOT.h / 2 + 1);
    if (m > room) ctx.scale(room / m, 1);
    if (s.kind === 'drink') { ctx.shadowColor = fg; ctx.shadowBlur = 6; }
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }
  return canvas;
}
