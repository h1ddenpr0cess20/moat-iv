import { GROUND, SIZE } from '../config.js';
import { clamp, fbm } from '../rng.js';
import { HV, SUB, idx, tileRange, touchAll } from './world.js';
import { groundOfMap, SCALE } from '../map.js';
import { ORIGIN, TILE } from '../parcels.js';
import gr from '../data/grand-rapids.json' with { type: 'json' };

/**
 * The land is downtown Grand Rapids, Michigan, as 3d-city has it: its ground (the satellite's heights with the river's
 * bed cut in, built by 3d-city's own code: `src/city/terrain.js`), taken at the game's height vertices, at true scale,
 * with the river's surface the game's water level. Nothing is built: no streets, no buildings. What the game keeps
 * beside it, baked by scripts/bake.mjs from the same map, is the river and land use by tile, the footprints the
 * real buildings stood on (parcels, see parcels.js) and how many trees the lidar saw.
 */

export const GR = gr;

const N = gr.size;
const toMetres = (vx, vy) => [ORIGIN[0] + (vx / SUB) * TILE, ORIGIN[1] + (vy / SUB) * TILE];

/** The ground's height at tile coordinates (x, z), in the game's units: 0 is the river's surface, a unit is a tile (SCALE metres). */
export function baseHeight(seed, x, z) {
  const { terrain } = groundOfMap();
  const [mx, mz] = [ORIGIN[0] + x * TILE, ORIGIN[1] + z * TILE];
  return (terrain.heightAt(mx, mz) - terrain.waterLevel) / SCALE;
}

/** Fills `world` from the map. */
export function generate(world) {
  const seed = world.seed;
  if (SIZE !== N) throw new Error(`the map is ${N} tiles and the game ${SIZE}`);

  // The ground: 3d-city's, at every height vertex.
  const { terrain } = groundOfMap();
  for (let vy = 0; vy < HV; vy++) {
    for (let vx = 0; vx < HV; vx++) {
      const [mx, mz] = toMetres(vx, vy);
      world.h[vy * HV + vx] = (terrain.heightAt(mx, mz) - terrain.waterLevel) / SCALE;
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
      let g = GROUND.GRASS;
      if (gr.water[y][x] === '1') g = GROUND.WATER;
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
      if (near && world.parcel[i] === 46 && world.h[(y * SUB + 1) * HV + x * SUB + 1] < 0.25) ground[i] = GROUND.SAND;
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
