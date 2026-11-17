/**
 * The two venues built since the map's data was gathered, made from what has been published about them:
 *
 * - Amway Stadium (230 Winter Ave NW; 8,500 seats, opening 2027): on the old surface lots of the west side between
 *   Blumrich St, Mt Vernon Ave, Pearl St and Winter Ave, north of the YMCA. A soccer pitch running north and south,
 *   stands all round, the long sides under roofs cantilevered over them with no column in the seating, a base of
 *   red-brown brick (the builders' town) and silver panels above.
 * - Acrisure Amphitheater (201 Market Ave SW; 12,000, opened 2026): on the old city yard between Market Ave and the
 *   Grand River, under US-131. A stage house at the north-east end, facing down the river; a fan of fixed seats and a
 *   sloped lawn for 5,000 at the back; over the stage and most of the seats an elliptical steel canopy the size of a
 *   football field, shaped like one, held up by two pillars at its sides.
 *
 * Positions are metres from the middle of the map (x east, z south), placed from the aerial photograph of the sites.
 */
import { inside } from './geometry.js';

const TAU = Math.PI * 2;
/** The middle of the stadium's pitch, and the front of the amphitheater's stage, metres. */
export const STADIUM = [-990, -434], AMPHITHEATER = [-742, 455];
const DOWNRIVER = [-0.494, 0.869];

/** Each stands on level ground: called before the ground is drawn. */
export function levelVenues(terrain) {
  terrain.level(STADIUM[0], STADIUM[1], 92, 18);
  terrain.level(AMPHITHEATER[0] + DOWNRIVER[0] * 40, AMPHITHEATER[1] + DOWNRIVER[1] * 40, 85, 18);
}

/** The ground each takes: nothing the map has there (lots, sheds, the yard's buildings) is built or planted. */
export const SITES = [
  // Amway Stadium: Blumrich St to the YMCA, Winter Ave to Mt Vernon Ave.
  [[-1082, -520], [-905, -520], [-905, -350], [-1082, -350]],
  // Acrisure Amphitheater: Market Ave SW to the river bank, US-131 to the end of the yard.
  [[-772, 326], [-618, 346], [-690, 640], [-905, 600]],
];
export const inVenue = (x, z) => SITES.some((ring) => inside([ring], x, z));
/** Whether a footprint stands on a venue's site (by its first corner and its middle). */
export function onVenue(rings) {
  const r = rings[0];
  let cx = 0, cz = 0;
  for (const [x, z] of r) { cx += x / r.length; cz += z / r.length; }
  return inVenue(cx, cz);
}

/** A frame on the ground: `o` its origin, `f` its forward (a unit [x, z]); P(a, b, y) is a forward and b to the left. */
function frame(o, f) {
  const s = [-f[1], f[0]];
  return (a, b, y) => [o[0] + f[0] * a + s[0] * b, y, o[1] + f[1] * a + s[1] * b];
}

/** A quad drawn both ways round, for what may be seen from either side (a roof's edge, a canopy, a post). */
function both(builder, material, a, b, c, d, color, tile = 3) {
  const uv = (p) => [(p[0] + p[2]) / tile, p[1] / tile];
  builder.quad(material, a, b, c, d, uv(a), uv(b), uv(c), uv(d), color);
  builder.quad(material, d, c, b, a, uv(d), uv(c), uv(b), uv(a), color);
}

/** A flat-ish quad seen from above, wound to face up whichever way its corners were given, and rolled on if `solid`. */
function top(builder, material, a, b, c, d, color, { tile = 3, solid = true } = {}) {
  const up = (p, q, r) => (q[2] - p[2]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[2] - p[2]) > 0;
  if (!up(a, b, c)) [a, b, c, d] = [d, c, b, a];
  const uv = (p) => [p[0] / tile, p[2] / tile];
  builder.quad(material, a, b, c, d, uv(a), uv(b), uv(c), uv(d), color);
  if (solid) { builder.collide(a, b, c); builder.collide(a, c, d); }
}

/** A wall between two points on the ground from y0 to y1, both faces drawn, solid. */
function wall(builder, material, p, q, y0, y1, color, tile = 3) {
  const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
  const a = [p[0], y0, p[1]], b = [q[0], y0, q[1]], c = [q[0], y1, q[1]], d = [p[0], y1, p[1]];
  builder.quad(material, a, b, c, d, [0, y0 / tile], [L / tile, y0 / tile], [L / tile, y1 / tile], [0, y1 / tile], color);
  builder.quad(material, b, a, d, c, [L / tile, y0 / tile], [0, y0 / tile], [0, y1 / tile], [L / tile, y1 / tile], color);
  builder.collide(a, b, c); builder.collide(a, c, d); builder.collide(b, a, d); builder.collide(b, d, c);
}

/** A round column at (x, z), solid to the ball. */
function column(builder, material, x, z, r, y0, y1, color, sides = 12) {
  for (let k = 0; k < sides; k++) {
    const a0 = k / sides * TAU, a1 = (k + 1) / sides * TAU;
    const p = [x + Math.cos(a0) * r, z + Math.sin(a0) * r], q = [x + Math.cos(a1) * r, z + Math.sin(a1) * r];
    builder.quad(material, [p[0], y0, p[1]], [p[0], y1, p[1]], [q[0], y1, q[1]], [q[0], y0, q[1]], [0, 0], [0, 1], [1, 1], [1, 0], color, [Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)]);
  }
  builder.trunks.push([x, z, r, y0, y1]);
}

const BRICK = [0.62, 0.36, 0.28], PANEL = [0.78, 0.8, 0.83], CONCRETE = [0.74, 0.73, 0.7], WHITE = [0.95, 0.95, 0.93];

/**
 * A bank of seats: rows stepping up from `near` to `far` metres out from an edge, along it from `b0` to `b1`, in the
 * frame P. Drawn as treads and risers, the seats a band of colour on each tread; rolled on as one smooth rake.
 */
function stand(builder, P, { near, far, b0, b1, y0, rise, rows, seat, end = true }) {
  const depth = (far - near) / rows;
  for (let r = 0; r < rows; r++) {
    const a0 = near + r * depth, a1 = a0 + depth, y = y0 + (r + 1) * rise;
    // The riser, facing the pitch, and the tread: concrete, with a row of seats on it.
    both(builder, 'road:concrete', P(a0, b0, y - rise), P(a0, b1, y - rise), P(a0, b1, y), P(a0, b0, y), CONCRETE);
    top(builder, 'road:concrete', P(a0, b0, y), P(a0, b1, y), P(a1, b1, y), P(a1, b0, y), CONCRETE, { solid: false });
    const k = 0.9 + 0.1 * ((r * 7) % 3) / 2;
    top(builder, 'wall:stucco', P(a0 + depth * 0.25, b0, y + 0.45), P(a0 + depth * 0.25, b1, y + 0.45), P(a0 + depth * 0.7, b1, y + 0.45), P(a0 + depth * 0.7, b0, y + 0.45), seat.map((c) => c * k), { solid: false, tile: 2 });
    both(builder, 'wall:stucco', P(a0 + depth * 0.7, b0, y), P(a0 + depth * 0.7, b1, y), P(a0 + depth * 0.7, b1, y + 0.9), P(a0 + depth * 0.7, b0, y + 0.9), seat.map((c) => c * k * 0.85), 2);
  }
  // The rake the ball rolls on, from the front row to the back.
  const yb = y0 + rows * rise;
  const a = P(near, b0, y0 + rise), b = P(near, b1, y0 + rise), c = P(far, b1, yb), d = P(far, b0, yb);
  const up = (p, q, r) => (q[2] - p[2]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[2] - p[2]) > 0;
  if (up(a, b, c)) { builder.collide(a, b, c); builder.collide(a, c, d); } else { builder.collide(d, c, b); builder.collide(d, b, a); }
  // The ends of the bank, closed.
  if (end) {
    for (const bb of [b0, b1]) {
      const p0 = P(near, bb, y0), p1 = P(far, bb, y0), p2 = P(far, bb, yb), p3 = P(near, bb, y0 + rise);
      both(builder, 'road:concrete', p0, p1, p2, p3, CONCRETE);
    }
  }
  return yb;
}

/** Amway Stadium. */
export function amwayStadium(builder, terrain) {
  const C = STADIUM;
  const y0 = terrain.heightAt(C[0], C[1]) + 0.05;
  // The pitch runs north and south: forward is south (+z), left is east (+x).
  const P = frame(C, [0, 1]);
  const L = 105 / 2, W = 68 / 2, runL = L + 7, runW = W + 6;
  // The grass, mown in stripes across, and its lines.
  for (let k = 0; k < 14; k++) {
    const a0 = -runL + (2 * runL) * k / 14, a1 = -runL + (2 * runL) * (k + 1) / 14;
    top(builder, 'ground:turf', P(a0, -runW, y0), P(a0, runW, y0), P(a1, runW, y0), P(a1, -runW, y0), k % 2 ? [0.82, 1.0, 0.78] : [0.95, 1.12, 0.88], { tile: 1.5 });
  }
  const line = (a0, b0, a1, b1, w = 0.12) => {
    const da = a1 - a0, db = b1 - b0, l = Math.hypot(da, db) || 1, na = -db / l * w, nb = da / l * w;
    top(builder, 'road:concrete', P(a0 + na, b0 + nb, y0 + 0.03), P(a1 + na, b1 + nb, y0 + 0.03), P(a1 - na, b1 - nb, y0 + 0.03), P(a0 - na, b0 - nb, y0 + 0.03), [1.7, 1.7, 1.65], { solid: false });
  };
  line(-L, -W, L, -W); line(-L, W, L, W); line(-L, -W, -L, W); line(L, -W, L, W); line(0, -W, 0, W);
  for (let k = 0; k < 36; k++) line(9.15 * Math.cos(k / 36 * TAU), 9.15 * Math.sin(k / 36 * TAU), 9.15 * Math.cos((k + 1) / 36 * TAU), 9.15 * Math.sin((k + 1) / 36 * TAU));
  for (const e of [-1, 1]) {
    const g = e * L;
    line(g, -20.16, g - e * 16.5, -20.16); line(g - e * 16.5, -20.16, g - e * 16.5, 20.16); line(g - e * 16.5, 20.16, g, 20.16);
    line(g, -9.16, g - e * 5.5, -9.16); line(g - e * 5.5, -9.16, g - e * 5.5, 9.16); line(g - e * 5.5, 9.16, g, 9.16);
    // The goal: white posts and bar, a net behind.
    const post = (b) => { const p = P(g + e * 0.1, b, 0); column(builder, 'prop:steel', p[0], p[2], 0.07, y0, y0 + 2.44, WHITE, 6); };
    post(-3.66); post(3.66);
    both(builder, 'prop:steel', P(g + e * 0.05, -3.7, y0 + 2.36), P(g + e * 0.05, 3.7, y0 + 2.36), P(g + e * 0.05, 3.7, y0 + 2.48), P(g + e * 0.05, -3.7, y0 + 2.48), WHITE);
    both(builder, 'prop:steel', P(g + e * 2, -3.66, y0), P(g + e * 2, 3.66, y0), P(g + e * 0.1, 3.66, y0 + 2.44), P(g + e * 0.1, -3.66, y0 + 2.44), [0.85, 0.85, 0.85]);
  }

  // The stands: the long sides deep, the ends shallower, the corners filled lower.
  const seat = [0.12, 0.26, 0.55];
  const sideTop = stand(builder, (a, b, y) => P(b, -a, y), { near: runW, far: runW + 19, b0: -runL, b1: runL, y0, rise: 0.48, rows: 22, seat }); // west
  stand(builder, (a, b, y) => P(-b, a, y), { near: runW, far: runW + 19, b0: -runL, b1: runL, y0, rise: 0.48, rows: 22, seat }); // east
  const endTop = stand(builder, (a, b, y) => P(a, b, y), { near: runL, far: runL + 12, b0: -runW, b1: runW, y0, rise: 0.48, rows: 14, seat }); // south
  stand(builder, (a, b, y) => P(-a, -b, y), { near: runL, far: runL + 12, b0: -runW, b1: runW, y0, rise: 0.48, rows: 14, seat }); // north
  const outL = runL + 12, outW = runW + 19;
  // The corners: a concourse deck at the end stands' height, and the scoreboard over the north-west one.
  for (const [ea, eb] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    top(builder, 'road:concrete', P(ea * runL, eb * runW, endTop), P(ea * outL, eb * runW, endTop), P(ea * outL, eb * outW, endTop), P(ea * runL, eb * outW, endTop), CONCRETE);
  }
  // The outside: brick to the concourse, silver panels above to the top of the stands, walled all round.
  const ring = [P(-outL, -outW, 0), P(outL, -outW, 0), P(outL, outW, 0), P(-outL, outW, 0)].map((p) => [p[0], p[2]]);
  for (let i = 0; i < 4; i++) {
    const p = ring[i], q = ring[(i + 1) % 4];
    const long = i % 2 === 1;
    const h = long ? sideTop : endTop;
    wall(builder, 'wall:block', p, q, y0 - 1, y0 + 6, BRICK, 2.4);
    wall(builder, 'wall:corrugated', p, q, y0 + 6, h + 2.2, PANEL, 3);
  }
  // The parapet's lid, and a glazed entrance at the north-west corner, the way in from Pearl and Winter.
  for (let i = 0; i < 4; i++) {
    const p = ring[i], q = ring[(i + 1) % 4], h = (i % 2 === 1 ? sideTop : endTop) + 2.2;
    const cx = C[0], cz = C[1];
    const inP = [p[0] + (cx - p[0]) * 0.012, p[1] + (cz - p[1]) * 0.012], inQ = [q[0] + (cx - q[0]) * 0.012, q[1] + (cz - q[1]) * 0.012];
    top(builder, 'road:concrete', [p[0], h, p[1]], [q[0], h, q[1]], [inQ[0], h, inQ[1]], [inP[0], h, inP[1]], CONCRETE, { solid: false });
  }
  const nw = P(-outL, outW, 0);
  for (let k = 0; k < 3; k++) {
    both(builder, 'wall:facade:glass-dark', [nw[0] - 14 + k * 9, y0, nw[2] - 0.6], [nw[0] - 6 + k * 9, y0, nw[2] - 0.6], [nw[0] - 6 + k * 9, y0 + 9, nw[2] - 0.6], [nw[0] - 14 + k * 9, y0 + 9, nw[2] - 0.6], WHITE, 3.9);
  }

  // The roofs over the long sides: from a truss on the back of the stand, out over three-quarters of the seats with
  // nothing under them (cantilevered), the tip a little higher than the root, white beneath and grey on top.
  for (const side of [-1, 1]) {
    const Q = (a, b, y) => P(b, side * a, y);
    const root = sideTop + 7, tip = sideTop + 8.2, a0 = outW + 0.5, a1 = runW + 4.5, t = 1.4;
    const seg = 10;
    for (let k = 0; k < seg; k++) {
      const b0 = -outL + (2 * outL) * k / seg, b1 = -outL + (2 * outL) * (k + 1) / seg;
      top(builder, 'ground:membrane-white', Q(a0, b0, root), Q(a0, b1, root), Q(a1, b1, tip), Q(a1, b0, tip), [0.85, 0.86, 0.88], { solid: false });
      // The underside, seen from the seats and the pitch.
      const u = [Q(a0, b0, root - t), Q(a0, b1, root - t), Q(a1, b1, tip - t), Q(a1, b0, tip - t)];
      builder.quad('surface:concrete', u[3], u[2], u[1], u[0], [0, 0], [1, 0], [1, 1], [0, 1], [0.9, 0.9, 0.9]);
      builder.quad('surface:concrete', u[0], u[1], u[2], u[3], [0, 0], [1, 0], [1, 1], [0, 1], [0.9, 0.9, 0.9]);
      // The roof's ribs, and the lights along its front edge.
      both(builder, 'prop:steel', Q(a0, b0, root - t), Q(a1, b0, tip - t), Q(a1, b0, tip - t - 1.6), Q(a0, b0, root - t - 3), [0.7, 0.72, 0.75]);
    }
    both(builder, 'prop:steel', Q(a1, -outL, tip), Q(a1, outL, tip), Q(a1, outL, tip - t), Q(a1, -outL, tip - t), [0.92, 0.92, 0.94]);
    for (let k = 0; k < 8; k++) {
      const b = -outL + 8 + k * (2 * outL - 16) / 7;
      both(builder, 'prop:glow', Q(a1 - 0.3, b - 2, tip - t - 0.1), Q(a1 - 0.3, b + 2, tip - t - 0.1), Q(a1 - 0.9, b + 2, tip - t - 0.6), Q(a1 - 0.9, b - 2, tip - t - 0.6), [1, 1, 1]);
    }
    // The back truss the roof hangs from, standing on the outside wall.
    both(builder, 'wall:corrugated', Q(a0, -outL, sideTop + 2.2), Q(a0, outL, sideTop + 2.2), Q(a0, outL, root), Q(a0, -outL, root), PANEL);
  }
  // The scoreboard over the north end.
  const sb = P(-outL + 3, 0, 0);
  for (const b of [-7, 7]) { const p = P(-outL + 3, b, 0); column(builder, 'prop:steel', p[0], p[2], 0.35, endTop, endTop + 12, [0.3, 0.32, 0.35], 8); }
  both(builder, 'prop:steel', [sb[0] - 10, endTop + 9, sb[2] - 0.6], [sb[0] + 10, endTop + 9, sb[2] - 0.6], [sb[0] + 10, endTop + 16, sb[2] - 0.6], [sb[0] - 10, endTop + 16, sb[2] - 0.6], [0.08, 0.09, 0.1]);
}

/** Acrisure Amphitheater. */
export function acrisureAmphitheater(builder, terrain) {
  // Forward: from the stage down the river toward the lawn (south-west).
  const f = (() => { const [x, z] = DOWNRIVER, l = Math.hypot(x, z); return [x / l, z / l]; })();
  const O = AMPHITHEATER; // the front of the stage
  const y0 = terrain.heightAt(AMPHITHEATER[0] + DOWNRIVER[0] * 40, AMPHITHEATER[1] + DOWNRIVER[1] * 40) + 0.05;
  const P = frame(O, f);
  const spread = 1.15; // how far round either side the seats reach, radians
  const polar = (r, t, y) => P(r * Math.cos(t), r * Math.sin(t), y);

  // The floor in front of the stage, and the fixed seats in a fan: rows of a metre, rising half a metre each.
  const pit = 14, seats = 60, rows = 40, rise = 0.24;
  const seg = 28;
  for (let k = 0; k < seg; k++) {
    const t0 = -spread + 2 * spread * k / seg, t1 = -spread + 2 * spread * (k + 1) / seg;
    top(builder, 'road:concrete', P(0, 0, y0), polar(pit, t0, y0), polar(pit, t1, y0), polar(pit, t1, y0), CONCRETE);
    for (let r = 0; r < rows; r++) {
      const r0 = pit + (seats - pit) * r / rows, r1 = pit + (seats - pit) * (r + 1) / rows, y = y0 + (r + 1) * rise;
      // Every tenth row an aisle walk; the rest seats, in the venue's blue.
      const walk = r % 10 === 9;
      top(builder, walk ? 'road:concrete' : 'wall:stucco', polar(r0, t0, y), polar(r0, t1, y), polar(r1, t1, y), polar(r1, t0, y), walk ? CONCRETE : [0.16, 0.24, 0.42], { solid: false, tile: 2 });
      both(builder, 'road:concrete', polar(r0, t0, y - rise), polar(r0, t1, y - rise), polar(r0, t1, y), polar(r0, t0, y), CONCRETE);
    }
    // The rake rolled on.
    const a = polar(pit, t0, y0 + rise), b = polar(pit, t1, y0 + rise), c = polar(seats, t1, y0 + rows * rise), d = polar(seats, t0, y0 + rows * rise);
    builder.collide(a, d, c); builder.collide(a, c, b);
    builder.collide(a, b, c); builder.collide(a, c, d);
  }
  // The concourse across the back of the seats, and the lawn rising behind it: grass, open to the sky.
  const yc = y0 + rows * rise, lawn = 92, yl = yc + 3.5;
  for (let k = 0; k < seg; k++) {
    const t0 = -spread + 2 * spread * k / seg, t1 = -spread + 2 * spread * (k + 1) / seg;
    top(builder, 'road:concrete', polar(seats, t0, yc), polar(seats, t1, yc), polar(seats + 6, t1, yc), polar(seats + 6, t0, yc), CONCRETE);
    top(builder, 'ground:turf', polar(seats + 6, t0, yc), polar(seats + 6, t1, yc), polar(lawn, t1, yl), polar(lawn, t0, yl), [0.92, 1.05, 0.85], { tile: 1.5 });
    // The berm's back, down to the ground by the river.
    top(builder, 'ground:turf', polar(lawn, t0, yl), polar(lawn, t1, yl), polar(lawn + 16, t1, y0 - 0.5), polar(lawn + 16, t0, y0 - 0.5), [0.9, 1.0, 0.82], { tile: 1.5 });
  }
  // The sides of the bowl: concrete walls from the ground up to the seats' edge.
  for (const t of [-spread, spread]) {
    for (let r = 0; r < rows; r++) {
      const r0 = pit + (seats - pit) * r / rows, r1 = pit + (seats - pit) * (r + 1) / rows;
      both(builder, 'road:concrete', polar(r0, t, y0), polar(r1, t, y0), polar(r1, t, y0 + (r + 1) * rise), polar(r0, t, y0 + (r + 1) * rise), CONCRETE);
    }
    both(builder, 'road:concrete', polar(seats, t, y0), polar(lawn, t, y0), polar(lawn, t, yl), polar(seats, t, yc), CONCRETE);
  }

  // The stage: a deck two metres up, and the stage house behind it, its back to Market Ave.
  const sw = 22, sd = 16;
  top(builder, 'road:concrete', P(0, -sw, y0 + 2), P(0, sw, y0 + 2), P(-sd, sw, y0 + 2), P(-sd, -sw, y0 + 2), [0.25, 0.25, 0.27]);
  both(builder, 'road:concrete', P(0, -sw, y0), P(0, sw, y0), P(0, sw, y0 + 2), P(0, -sw, y0 + 2), [0.2, 0.2, 0.22]);
  const house = [P(-sd, -sw - 4, 0), P(-sd, sw + 4, 0), P(-sd - 24, sw + 4, 0), P(-sd - 24, -sw - 4, 0)].map((p) => [p[0], p[2]]);
  for (let i = 0; i < 4; i++) wall(builder, i === 0 ? 'wall:stucco' : 'wall:corrugated', house[i], house[(i + 1) % 4], y0, y0 + 21, i === 0 ? [0.12, 0.12, 0.13] : [0.32, 0.34, 0.37], 3);
  top(builder, 'ground:membrane-grey', [house[0][0], y0 + 21, house[0][1]], [house[1][0], y0 + 21, house[1][1]], [house[2][0], y0 + 21, house[2][1]], [house[3][0], y0 + 21, house[3][1]], [0.9, 0.9, 0.9]);
  // The proscenium's sides, the screens either side of it.
  for (const s of [-1, 1]) {
    both(builder, 'wall:stucco', P(-1, s * (sw + 1), y0 + 2), P(-sd, s * (sw + 1), y0 + 2), P(-sd, s * (sw + 1), y0 + 19), P(-1, s * (sw + 1), y0 + 19), [0.14, 0.14, 0.15]);
    both(builder, 'prop:steel', P(1, s * (sw + 3), y0 + 7), P(1, s * (sw + 13), y0 + 7), P(1, s * (sw + 13), y0 + 14), P(1, s * (sw + 3), y0 + 14), [0.05, 0.06, 0.08]);
  }

  // The canopy: a lens the size of a football field, pointed at both ends like one, domed a little, silver above and
  // ribbed beneath; over the stage and three-quarters of the seats, on two great pillars at its sides.
  const cA = 20, half = 56, wide = 41, base = y0 + 21, dome = 5;
  const n = 24, m = 10;
  const at = (i, j, under) => {
    const u = -1 + 2 * i / n, v = -1 + 2 * j / m;
    const w = wide * Math.pow(Math.max(0, 1 - u * u), 0.75);
    const y = base + dome * (1 - u * u) * (1 - v * v) - (under ? 1.1 : 0) + 3 * (u + 1) / 2;
    return P(cA + u * half, v * w, y);
  };
  const silver = [0.66, 0.68, 0.71], under = [0.5, 0.52, 0.56];
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    top(builder, 'prop:steel', at(i, j, false), at(i + 1, j, false), at(i + 1, j + 1, false), at(i, j + 1, false), silver, { solid: false });
    const a = at(i, j, true), b = at(i + 1, j, true), c = at(i + 1, j + 1, true), d = at(i, j + 1, true);
    builder.quad('prop:steel', a, b, c, d, [0, 0], [1, 0], [1, 1], [0, 1], under);
    builder.quad('prop:steel', d, c, b, a, [0, 0], [1, 0], [1, 1], [0, 1], under);
  }
  // Its rim, and the ribs across beneath it.
  for (let i = 0; i < n; i++) {
    for (const j of [0, m]) both(builder, 'prop:steel', at(i, j, false), at(i + 1, j, false), at(i + 1, j, true), at(i, j, true), silver);
    if (i % 2 === 0) {
      for (let j = 0; j < m; j++) {
        const a = at(i, j, true), b = at(i, j + 1, true);
        both(builder, 'prop:steel', a, b, [b[0], b[1] - 1.4, b[2]], [a[0], a[1] - 1.4, a[2]], [0.45, 0.47, 0.5]);
      }
    }
  }
  // The two pillars, outside the seats at either side, with a brace up into the canopy's edge.
  for (const s of [-1, 1]) {
    const foot = P(cA - 6, s * (wide + 6), 0), edge = at(n / 2 - 2, s > 0 ? m : 0, true);
    column(builder, 'prop:steel', foot[0], foot[2], 1.3, y0, edge[1], silver, 14);
    both(builder, 'prop:steel', [foot[0] - 1, edge[1], foot[2]], [foot[0] + 1, edge[1], foot[2]], [edge[0] + 1, edge[1] + 0.5, edge[2]], [edge[0] - 1, edge[1] + 0.5, edge[2]], silver);
  }
  // The plaza from Market Ave to the gates, paved.
  top(builder, 'ground:plaza', P(-sd - 26, -sw - 30, y0 + 0.02), P(-sd - 26, sw + 30, y0 + 0.02), P(-sd - 46, sw + 30, y0 + 0.02), P(-sd - 46, -sw - 30, y0 + 0.02), [0.9, 0.84, 0.78], { tile: 1.6 });
}
