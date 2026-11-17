import { Mesher } from 'madness-engine/mesher';
import { buildingIndex } from './geometry.js';
import { blockedBy } from './trees.js';
import { WALKS } from './bridges.js';
import { driveRoads, sampleLine, sideways, widthOf } from './ground.js';
import { createDrive } from '../drive.js';

/**
 * What stands in the streets. The ornamental lamp: a black cast-iron post on a flared base, a curved arm and a
 * globe, as the photographs of downtown show them (metres, y up; the arm points along +x).
 */
function lampTemplate() {
  const m = new Mesher();
  const iron = '#1d1d20';
  m.cylinder('iron', 0, 0, 0, 0.17, 0.2, 0.28, 6, iron, { smooth: true });
  m.cylinder('iron', 0, 0.28, 0, 0.085, 0.14, 0.45, 6, iron, { smooth: true });
  m.cylinder('iron', 0, 0.7, 0, 0.055, 0.08, 3.6, 6, iron, { smooth: true });
  m.cylinder('iron', 0, 4.25, 0, 0.09, 0.06, 0.12, 6, iron, { smooth: true });
  // The arm sweeps out and up over the kerb, ending in a ring that carries the globe.
  m.beam('iron', [0, 4.15, 0], [0.55, 4.5, 0], 0.035, iron);
  m.beam('iron', [0.55, 4.5, 0], [1.05, 4.38, 0], 0.03, iron);
  m.cylinder('iron', 1.05, 4.32, 0, 0.13, 0.13, 0.06, 6, iron, { smooth: true });
  m.sphere('glow', 1.05, 4.6, 0, 0.23, 0.26, 0.23, '#fff4d8', { detail: 0 });
  m.cone('iron', 1.05, 4.8, 0, 0.18, 4.98, 6, iron);
  return m.finish();
}

/** How far apart the lamps stand along each kind of street: the main streets are lit, the side streets only in the heart of downtown. */
const SPACING = { primary: 64, secondary: 64, tertiary: 80, residential: 110, unclassified: 110 };
const bridged = (r) => Array.isArray(r.flags) && r.flags.some((f) => f.values?.some((v) => v === 'is_bridge' || v === 'is_tunnel'));

/** Lamps along the streets, alternating sides, off the roadway and out of the buildings; side streets get them only within `core` metres of `centre`. */
export function lamps(builder, terrain, roads, buildings, { centre = [-316, -163], core = 380, bounds = [-1450, -1090, 1450, 1090] } = {}) {
  const template = lampTemplate();
  const within = buildingIndex(buildings);
  // Not on a pavement or a path: a post there stops the ball (and a walker).
  const onWalk = blockedBy(roads.filter((r) => r.subtype === 'road' && WALKS.has(r.class)), null);
  // Every street's width (a lamp for one street stands in another's at a junction, beside a service lane, on a ramp):
  // not on any of them, whatever street it was set for. Roads on bridges and in tunnels are not on the ground.
  const corridors = createDrive({ slack: 0 });
  corridors.add('roads', driveRoads(roads.filter((r) => !bridged(r)).map((r) => ({ ...r, ctx: false }))));
  let n = 0, side = 1;
  for (const road of roads) {
    const every = SPACING[road.class];
    if (road.ctx || road.subtype !== 'road' || !every || bridged(road)) continue;
    const main = every <= 80;
    const pts = sampleLine(road.line, 2);
    const normals = sideways(pts);
    const set = widthOf(road) / 2 + 2.1;
    let run = 0, next = every * 0.5;
    for (let i = 1; i < pts.length; i++) {
      run += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (run < next) continue;
      next += every;
      side = -side;
      // At the back of the pavement, or failing that at the kerb, wherever the pavement is not, and off every road: at
      // this point of the street, or a few metres along it either way.
      let x = 0, z = 0, nx = 0, nz = 0, found = false;
      for (const dk of [0, 2, -2, 4, -4, 7, -7]) {
        const k = i + dk;
        if (k < 1 || k >= pts.length) continue;
        [nx, nz] = normals[k];
        for (const at of [set, widthOf(road) / 2 + 0.5, set + 2.4]) {
          x = pts[k][0] + nx * at * side; z = pts[k][1] + nz * side * at;
          if (!onWalk(x, z) && !corridors.inside(x, z, -0.5) && !within(x, z, 1.5) && x >= bounds[0] && z >= bounds[1] && x <= bounds[2] && z <= bounds[3]) { found = true; break; }
        }
        if (found) break;
      }
      if (!found) continue;
      if (!main && Math.hypot(x - centre[0], z - centre[1]) > core) continue;
      // The arm reaches back over the road.
      const yaw = Math.atan2(nz * side, -nx * side);
      const y = terrain.heightAt(x, z) + 0.34;
      for (const [name, part] of Object.entries(template)) builder.stamp(`prop:${name}`, part, x, y, z, yaw, 1, 1, null, 'near');
      builder.trunks.push([x, z, 0.1, y, y + 3]);
      // Where its light hangs, out over the street: for the lamps lit at night (main.js).
      (builder.lamps ??= []).push([x - nx * side * 1.05, y + 4.3, z - nz * side * 1.05]);
      n++;
    }
  }
  return n;
}
