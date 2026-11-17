import { CENTER, GROUND, SIZE } from '../config.js';
import { clamp, fbm, lerp, smoothstep } from '../rng.js';
import { HV, SUB, idx, tileRange, touchAll } from './world.js';
import gr from '../data/grand-rapids.json' with { type: 'json' };

/**
 * The land is downtown Grand Rapids, Michigan, as it lies: the Grand River
 * running down the west side, the east bank rising away from it, the parks
 * and the lawns of the campuses. It is read from `src/data/grand-rapids.json`
 * (baked by scripts/bake.mjs from the 3d-city map: heights from USGS
 * lidar and SRTM, water and land use from Overture Maps, the trees from the
 * lidar's crowns). Nothing is built: no streets, no buildings. The footprints
 * the real buildings stand on are kept as parcels (see parcels.js) that say
 * what the lot has been good for.
 */

export const GR = gr;
/** The height the town's ground is level at, near the home ward. */
export const PLATEAU = 0.9;
/** Metres of the real city to a unit of height, and the deepest the river goes. */
const RISE = 0.05;
const RIVER_BED = -1.35;
const BANK_MIN = 0.42;

const N = gr.size;
const V = N + 1;
const metres = (vx, vy) => gr.heights.data[vy * V + vx] / 10;

/** Real height in metres at tile coordinates (x, z), bilinear, held at the edge. */
function realAt(x, z) {
  const gx = clamp(x, 0, N - 0.001), gz = clamp(z, 0, N - 0.001);
  const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j;
  return metres(i, j) * (1 - fx) * (1 - fz) + metres(i + 1, j) * fx * (1 - fz) + metres(i, j + 1) * (1 - fx) * fz + metres(i + 1, j + 1) * fx * fz;
}
const HOME_M = realAt(CENTER, CENTER);

/** The land's height with no water cut into it, at world (x, z); beyond the map it climbs gently into the hills round the town. */
export function baseHeight(seed, x, z) {
  const out = Math.hypot(Math.max(0, -x, x - SIZE), Math.max(0, -z, z - SIZE));
  const h = PLATEAU + (realAt(x, z) - HOME_M) * RISE;
  return Math.max(BANK_MIN, h) + smoothstep(0, 40, out) * 1.2 + out * 0.012;
}

/** A tile's water, 0 or 1; off the map it is whatever the nearest edge tile is. */
const wet = (x, y) => gr.water[clamp(y, 0, N - 1)][clamp(x, 0, N - 1)] === '1';

/** Fills `world` from the map. */
export function generate(world) {
  const seed = world.seed;
  if (SIZE !== N) throw new Error(`the map is ${N} tiles and the game ${SIZE}`);

  // How wet each height vertex is: the water of the tiles round it, blurred so the banks come out round.
  let field = new Float32Array(HV * HV);
  for (let vy = 0; vy < HV; vy++) for (let vx = 0; vx < HV; vx++) field[vy * HV + vx] = wet(Math.floor(vx / SUB - 0.01), Math.floor(vy / SUB - 0.01)) ? 1 : 0;
  for (let pass = 0; pass < 3; pass++) {
    const next = new Float32Array(HV * HV);
    for (let vy = 0; vy < HV; vy++) for (let vx = 0; vx < HV; vx++) {
      let s = 0, n = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const x = vx + dx, y = vy + dy;
        s += field[clamp(y, 0, HV - 1) * HV + clamp(x, 0, HV - 1)]; n++;
      }
      next[vy * HV + vx] = s / n;
    }
    field = next;
  }
  for (let vy = 0; vy < HV; vy++) {
    for (let vx = 0; vx < HV; vx++) {
      const x = vx / SUB, z = vy / SUB;
      const land = Math.max(BANK_MIN, baseHeight(seed, x, z));
      const w = smoothstep(0.3, 0.72, field[vy * HV + vx]);
      world.h[vy * HV + vx] = lerp(land, RIVER_BED, w);
    }
  }

  // What each tile is.
  const { ground, tree, fert, amount } = world;
  world.land = new Uint8Array(N * N);
  world.parcel = new Uint8Array(N * N);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = idx(x, y);
      const [lo, hi] = tileRange(world, x, y);
      let under = 0;
      for (let j = 0; j <= SUB; j++) for (let k = 0; k <= SUB; k++) if (world.h[(y * SUB + j) * HV + x * SUB + k] < 0.02) under++;
      let g = GROUND.GRASS;
      if (under >= 5) g = GROUND.WATER;
      else if (hi - lo > 1.15) g = GROUND.CLIFF;
      ground[i] = g;
      amount[i] = 0;
      world.land[i] = gr.land[y].charCodeAt(x);
      world.parcel[i] = gr.parcel[y].charCodeAt(x);
      const park = 'pgs'.includes(gr.land[y][x]);
      fert[i] = Math.round(clamp(0.5 + (fbm(x / 14 - 20, y / 14 + 40, seed + 47, 3) - 0.5) * 0.5 + (park ? 0.3 : 0), 0.05, 1) * 255);
    }
  }

  // The narrow strip of sand along the water's edge.
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = idx(x, y);
      if (ground[i] !== GROUND.GRASS) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < SIZE && ny < SIZE && ground[idx(nx, ny)] === GROUND.WATER) { near = true; break; }
      }
      if (near && world.h[(y * SUB + 1) * HV + x * SUB + 1] < BANK_MIN + 0.06 && world.parcel[i] === 46) ground[i] = GROUND.SAND;
    }
  }

  // Trees: the lidar's crowns, kept off the water, and the parks given a few where the lidar saw none.
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = idx(x, y);
      if (ground[i] !== GROUND.GRASS && ground[i] !== GROUND.SAND) continue;
      const n = +gr.tree[y][x];
      if (world.parcel[i] !== 46) continue; // where a building stood, the lidar's "tree" is more likely its roof edge
      tree[i] = n >= 4 ? 2 : n >= 1 ? 1 : 0;
    }
  }
  touchAll(world);
  return world;
}
