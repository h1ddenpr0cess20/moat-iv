/**
 * The greater city, on the page: which tiles are built and shown, round where the ball is. A tile is asked of
 * the workers (metro.worker.js) when the ball comes within `near` metres of it, and let go (its meshes and its
 * piece of the physics) when the ball is `far` from it. The far ground (metro.js `backdrop`) stands in for a
 * tile until it is built.
 */
import { metroShared, tileBox } from './metro.js';
import { cityGroup, cityWorld, chooseLods, dropMaterial, signMaterial } from './scene.js';
import { paintAtlas } from './storefronts.js';
import { fullTrees } from './trees.js';
import { Designs, groundOf } from './rt/buildings.js';
import { BASE, SCALE } from './config.js';

const WORKERS = Math.max(1, Math.min(3, (globalThis.navigator?.hardwareConcurrency ?? 4) - 2));

export async function createMetro({ GFX, scene, World, worlds, bounds, painted, coreLevel, hole, base, near = 900, far = 1700, onTile = null }) {
  const get = (name) => fetch(`${base}${name}.json`).then((r) => (r.ok ? r.json() : null));
  const [index, elevation, waterLevel] = await Promise.all(['index', 'elevation', 'water-level'].map(get));
  if (!index) return null;
  const shared = metroShared({ index, elevation, waterLevel, coreLevel, hole });

  // The far ground and the far city: one group per tile, and one past the edge, made in a worker of their own.
  const backdrops = new Map();
  const farCity = await get('far');
  const maker = new Worker(new URL('./metro.worker.js', import.meta.url), { type: 'module' });
  maker.onmessage = ({ data }) => {
    if (data.error) { console.error('far city:', data.error); return; }
    if (!data.backdrop) return;
    for (const [key, parts] of data.backdrop) {
      const g = cityGroup(GFX, parts, bounds, painted);
      g.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.receiveShadow = true; } });
      g.visible = tiles.get(key)?.state !== 'built';
      scene.add(g);
      backdrops.set(key, g);
    }
    maker.terminate();
  };
  maker.postMessage({ init: { index, elevation, waterLevel, coreLevel, hole } });
  maker.postMessage({ backdrop: true, far: farCity });

  // Every tile but those downtown covers whole.
  const covered = (i, j) => { const [x0, z0, x1, z1] = tileBox(index, i, j); return x0 >= hole[0] - 1 && z0 >= hole[1] - 1 && x1 <= hole[2] + 1 && z1 <= hole[3] + 1; };
  const files = new Map(index.tiles.filter((t) => !covered(t.i, t.j)).map((t) => [`${t.i},${t.j}`, t]));
  const tiles = new Map(); // key -> { state: 'asked' | 'built', group, world, ground, names }
  const queue = [];
  const pool = [];
  for (let n = 0; n < WORKERS; n++) {
    const w = new Worker(new URL('./metro.worker.js', import.meta.url), { type: 'module' });
    const ready = new Promise((resolve) => {
      w.onmessage = ({ data }) => { if (data.ready) resolve(); else if (data.error) console.error('metro worker:', data.error); };
    });
    w.onerror = (e) => console.error('metro worker:', e.message ?? e);
    // The grid and the ground are handed over, not fetched again.
    w.postMessage({ init: { index, elevation, waterLevel, coreLevel, hole } });
    pool.push({ w, busy: false, ready });
  }

  function give(worker) {
    const job = queue.shift();
    if (!job) return;
    const t = tiles.get(job.key);
    if (!t || t.state !== 'asked') { give(worker); return; }
    worker.busy = true;
    worker.w.onmessage = ({ data }) => {
      worker.busy = false;
      // A tile that could not be built is let go, to be asked for again when the ball next comes near.
      if (data.error) { console.error(`tile ${job.key}:`, data.error); if (tiles.get(job.key) === t) tiles.delete(job.key); }
      else if (tiles.get(job.key) === t) place(job.key, t, data.tile);
      give(worker);
    };
    worker.w.postMessage({ i: job.i, j: job.j, file: job.file, base });
  }

  function place(key, t, built) {
    // The names on its shops' boards, painted here (a worker has no fonts to hand), before its meshes ask for them.
    if (built.signs?.length) signMaterial(GFX, key, paintAtlas(built.signs));
    const designs = new Designs({ ground: groundOf(built.ground), streetDir: () => null, creative: true });
    const group = cityGroup(GFX, built.parts, bounds, painted, [
      { cells: new Map(built.trees), make: fullTrees },
      { cells: new Map(built.designs ?? []), make: (entries) => designs.detail(entries), range: 'hi', one: true, shells: built.shells ?? [] },
    ]);
    scene.add(group);
    const world = cityWorld(World, built.solid, bounds, built.trunks, built.reach);
    worlds.add(world);
    Object.assign(t, { state: 'built', group, world, ground: built.ground, names: built.names, lamps: built.lamps ?? [], drive: built.drive ?? [], lots: built.lots ?? [] });
    const b = backdrops.get(key);
    if (b) b.visible = false;
    metro.onTile?.(key, t);
  }

  function drop(key) {
    const t = tiles.get(key);
    tiles.delete(key);
    if (t?.state !== 'built') return;
    metro.onDrop?.(key, t);
    scene.remove(t.group);
    t.group.traverse((m) => m.geometry?.dispose());
    dropMaterial(`sign:${key}`);
    worlds.remove(t.world);
    const b = backdrops.get(key);
    if (b) b.visible = true;
  }

  /** How far (x, z) metres is from tile (i, j)'s box. */
  const distance = (i, j, x, z) => {
    const [x0, z0, x1, z1] = tileBox(index, i, j);
    return Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1));
  };

  const metro = {
    index, shared, onTile, onDrop: null,
    /** Asks for the tiles near (x, z) metres, nearest first, and lets go of the far ones; call as the ball moves. */
    update(x, z) {
      const wanted = [];
      for (const [key, f] of files) {
        const d = distance(f.i, f.j, x, z);
        if (d < near && !tiles.has(key)) wanted.push({ key, d, ...f });
        else if (d > far && tiles.has(key)) drop(key);
      }
      wanted.sort((a, b) => a.d - b.d);
      for (const job of wanted) { tiles.set(job.key, { state: 'asked' }); queue.push(job); }
      if (wanted.length) queue.sort((a, b) => distance(a.i, a.j, x, z) - distance(b.i, b.j, x, z));
      for (const worker of pool) if (!worker.busy) worker.ready.then(() => { if (!worker.busy) give(worker); });
    },
    /** Shows each built tile's trees and lamps by distance from (x, z) tiles. */
    chooseLods(x, z, eye = null) { for (const t of tiles.values()) if (t.group) chooseLods(t.group, x, z, eye); },
    /** Whether the tile under (x, z) metres is built (or there is none, being downtown or off the map). */
    built(x, z) {
      const i = Math.floor((x - index.x0) / index.tile), j = Math.floor((z - index.z0) / index.tile);
      const f = files.get(`${i},${j}`);
      return !f || tiles.get(`${i},${j}`)?.state === 'built';
    },
    /** The ground's height at (x, z) metres where a tile is built there, else the far ground's, else null. */
    heightAt(x, z) {
      for (const t of tiles.values()) {
        const g = t.ground;
        // Each tile's own ground (it reaches on under its neighbours' edges, where theirs is the one drawn).
        if (!g || x < g.box[0] || x > g.box[2] || z < g.box[1] || z > g.box[3]) continue;
        const fx = (x - g.x0) / g.cell, fz = (z - g.z0) / g.cell;
        if (fx < 0 || fz < 0 || fx > g.nx - 1 || fz > g.nz - 1) continue;
        const i = Math.min(g.nx - 2, Math.floor(fx)), j = Math.min(g.nz - 2, Math.floor(fz)), tx = fx - i, tz = fz - j;
        const h = g.h, n = g.nx;
        return (h[j * n + i] * (1 - tx) + h[j * n + i + 1] * tx) * (1 - tz) + (h[(j + 1) * n + i] * (1 - tx) + h[(j + 1) * n + i + 1] * tx) * tz;
      }
      // Not built: the satellite's ground.
      const { x0, z0, step, cols, rows, heights } = elevation;
      const fx = Math.max(0, Math.min(cols - 1.001, (x - x0) / step)), fz = Math.max(0, Math.min(rows - 1.001, (z - z0) / step));
      const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
      return Math.max(coreLevel + 0.3, (heights[j][i] * (1 - tx) + heights[j][i + 1] * tx) * (1 - tz) + (heights[j + 1][i] * (1 - tx) + heights[j + 1][i + 1] * tx) * tz - BASE);
    },
    /** The street lamps of the built tiles: [x, y, z] metres, where each one's light hangs. */
    *lamps() { for (const t of tiles.values()) if (t.lamps) yield* t.lamps; },
    /** The named streets of the built tiles: [{ name, line }]. */
    *streets() { for (const t of tiles.values()) if (t.names) yield* t.names; },
    /** The edge of everything, in metres: [x0, z0, x1, z1]. */
    edge: [index.x0, index.z0, index.x0 + index.ni * index.tile, index.z0 + index.nj * index.tile],
    tiles,
  };
  return metro;
}
