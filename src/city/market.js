/**
 * The Downtown Market on Ionia (Hugh A. Boyd Architects, 2013): a hall of brick and glass three stories high, the
 * greenhouse on its roof under three glass pyramids (lit at night, seen from US-131), and the long open shed of the
 * outdoor market along its south side. Its shape is the lidar's: the shed is the low part of the footprint, the
 * hall the middle, the greenhouse the top.
 */
import { building, canopy } from './buildings.js';
import { open } from './geometry.js';

export const MARKET = 'Grand Rapids Downtown Market';

export function downtownMarket(builder, terrain, b, measured, index) {
  const parts = measured?.parts;
  if (!parts || parts.length < 2) { building(builder, terrain, { ...b, measured }, index); return; }
  const [, , low] = parts[0], [, hallTop, hall] = parts[1], top = parts[2];
  // The hall: its own footprint, its own height, as the table of looks dresses it.
  for (const piece of hall) building(builder, terrain, { ...b, rings: piece, measured: null, height: hallTop }, index);
  const hallZ = Math.min(...hall.flatMap((p) => p[0].map((q) => q[1])));
  // The shed: what of the footprint is south of the hall, a roof on posts the ball rolls under.
  const ring = open(low[0][0]).map(([x, z]) => [x, Math.min(z, hallZ)]);
  let foot = Infinity;
  for (const [x, z] of ring) foot = Math.min(foot, terrain.heightAt(x, z));
  canopy(builder, [ring], foot, 6.2, 'market-shed');
  // The greenhouse on the roof: three pyramids of glass in a row over the top part, on a band of glass.
  if (!top) return;
  const [, , pieces] = top;
  const pts = pieces[0][0];
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  let hallFoot = Infinity;
  for (const [x, z] of open(hall[0][0])) hallFoot = Math.min(hallFoot, terrain.heightAt(x, z));
  const y0 = hallFoot + hallTop, band = 2.2, rise = 5.5;
  const glass = [0.62, 0.8, 0.78], frame = [0.3, 0.32, 0.34];
  const quad = (a, bb, c, d, n, color = glass, mat = 'prop:glass') => builder.quad(mat, a, bb, c, d, [0, 0], [1, 0], [1, 1], [0, 1], color, n);
  // The band of upright glass round it.
  const corners = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 4];
    const n = [bz - az === 0 ? 0 : Math.sign(bz - az), 0, ax - bx === 0 ? 0 : Math.sign(ax - bx)];
    quad([ax, y0, az], [bx, y0, bz], [bx, y0 + band, bz], [ax, y0 + band, az], n.map((v) => -v));
    builder.collide([ax, y0, az], [bx, y0, bz], [bx, y0 + band, bz]); builder.collide([ax, y0, az], [bx, y0 + band, bz], [ax, y0 + band, az]);
  }
  // Three pyramids along its length.
  const w = (x1 - x0) / 3, yb = y0 + band;
  for (let k = 0; k < 3; k++) {
    const a = x0 + k * w, c = a + w, apex = [(a + c) / 2, yb + rise, (z0 + z1) / 2];
    const base = [[a, yb, z0], [c, yb, z0], [c, yb, z1], [a, yb, z1]];
    for (let i = 0; i < 4; i++) {
      const p = base[i], q = base[(i + 1) % 4];
      const e1 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], e2 = [apex[0] - p[0], apex[1] - p[1], apex[2] - p[2]];
      let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      // Out and up, whichever way round the base runs.
      if (n[1] < 0) n = n.map((v) => -v);
      const l = Math.hypot(...n);
      const up = n[1] > 0 && (n[0] * (p[0] - apex[0]) + n[2] * (p[2] - apex[2])) >= 0;
      const [s, t] = up ? [p, q] : [q, p];
      builder.tri('prop:glass', s, t, apex, [0, 0], [1, 0], [0.5, 1], glass, n.map((v) => v / l));
      builder.tri('prop:glass', t, s, apex, [0, 0], [1, 0], [0.5, 1], glass.map((v) => v * 0.7), n.map((v) => -v / l));
      builder.collide(s, t, apex);
      // The steel of its hips.
      quad([p[0], p[1], p[2]], [p[0], p[1] + 0.25, p[2]], [apex[0], apex[1] + 0.25, apex[2]], [apex[0], apex[1], apex[2]], [0, 1, 0], frame, 'prop:steel');
    }
  }
}
