import { DIRS, ROAD } from '../config.js';
import { TILE, toMetres } from '../parcels.js';
import { Builder } from '../city/builder.js';
import { lay } from '../city/ground.js';
import { cityGroup } from '../city/scene.js';
import { idx, inb } from '../world/world.js';

/**
 * The streets the founder lays, drawn with 3d-city's own road assets: its asphalt and its paint, its sidewalks and its
 * junctions, laid by its own `lay` on its own ground, so they sit on the land, flush at the junctions, with curbs and
 * walks, as the map's streets do. The game's road tiles are turned into the records 3d-city's roads are made of (a line
 * down the middle, a class and a width) and laid again, a moment after the streets change.
 */

const ASPHALT = 5.6, WALK = 1.6;
const PLAIN = new Set([ROAD.DIRT, ROAD.COBBLE, ROAD.AVENUE]);

/** 3d-city's road records for the streets on `world`. */
export function streetRecords(world) {
  const road = (x, y) => inb(x, y) && world.road[idx(x, y)] !== ROAD.NONE;
  const plain = (x, y) => inb(x, y) && PLAIN.has(world.road[idx(x, y)]);
  const at = (x, y) => toMetres(x + 0.5, y + 0.5);
  const records = [];
  const add = (line, cls, width, subclass = null, surface = null) => {
    if (line.length >= 2) records.push({ line, subtype: 'road', class: cls, subclass, surface, flags: null, level: null, width: [{ value: width }], name: null });
  };
  // An avenue is two tiles wide: a strip of two rows (or two columns) is one wide, marked road down its middle. Where it
  // crosses another avenue its tiles are left to be streets of their own.
  const avenue = (x, y) => inb(x, y) && world.road[idx(x, y)] === ROAD.AVENUE;
  const runLen = (x, y, dx, dy) => { let n = 1; for (let k = 1; avenue(x + dx * k, y + dy * k); k++) n++; for (let k = 1; avenue(x - dx * k, y - dy * k); k++) n++; return n; };
  const paired = new Set();
  // How far a line runs on past the tile it ends in (in tiles), when another road lies beyond it: on into the middle of a
  // street that crosses there, so the two meet at its centerline, or only to the edge where the next road runs on in line
  // (another kind of street, a bridge), so they butt end to end. Null when nothing lies beyond.
  const past = (tx, ty, ox, oy) => {
    const nx = tx + ox, ny = ty + oy;
    if (!road(nx, ny)) return null;
    // (The other row of an avenue's strip beside the tile is no street crossing it.)
    const beside = (tx2, ty2) => road(tx2, ty2) && !paired.has(idx(tx2, ty2));
    return beside(nx + oy, ny + ox) || beside(nx - oy, ny - ox) ? 1 : 0.5;
  };
  for (const [dx, dy] of [[1, 0], [0, 1]]) {
    const [px, py] = [dy, dx];
    for (let y = 0; y < world.size; y++) {
      for (let x = 0; x < world.size; x++) {
        if (!avenue(x, y) || avenue(x - dx, y - dy) || paired.has(idx(x, y))) continue;
        // The first tile of a run along (dx, dy), in a strip two tiles across (px, py).
        let n = 0;
        while (avenue(x + dx * n, y + dy * n) && avenue(x + dx * n + px, y + dy * n + py) && !avenue(x + dx * n - px, y + dy * n - py) && !avenue(x + dx * n + 2 * px, y + dy * n + 2 * py)
          && !paired.has(idx(x + dx * n, y + dy * n)) && runLen(x + dx * n, y + dy * n, px, py) === 2) n++;
        if (n < 2) continue;
        for (let k = 0; k < n; k++) { paired.add(idx(x + dx * k, y + dy * k)); paired.add(idx(x + dx * k + px, y + dy * k + py)); }
        const a0 = at(x, y), a1 = at(x + dx * (n - 1), y + dy * (n - 1)), e = TILE * 0.5;
        const lx = x + dx * (n - 1), ly = y + dy * (n - 1);
        // Either row of the strip may be the one a street meets.
        const before = Math.max(past(x, y, -dx, -dy) ?? 0, past(x + px, y + py, -dx, -dy) ?? 0), after = Math.max(past(lx, ly, dx, dy) ?? 0, past(lx + px, ly + py, dx, dy) ?? 0);
        const from = !road(x - dx, y - dy) && !road(x + px - dx, y + py - dy) ? [a0[0] - dx * e + px * e, a0[1] - dy * e + py * e] : [a0[0] - dx * before * TILE + px * e, a0[1] - dy * before * TILE + py * e];
        const to = !road(lx + dx, ly + dy) && !road(lx + px + dx, ly + py + dy) ? [a1[0] + dx * e + px * e, a1[1] + dy * e + py * e] : [a1[0] + dx * after * TILE + px * e, a1[1] + dy * after * TILE + py * e];
        add([from, to], 'primary', 2 * TILE - 0.8);
      }
    }
  }
  // The streets: a line down every run of road tiles of one kind (a street, or the avenue tiles left over), along the row
  // and down the column; it ends at the middle of a tile where another street crosses, and half a tile on where it does not.
  const kindOf = (x, y) => (!plain(x, y) || paired.has(idx(x, y)) ? null : world.road[idx(x, y)] === ROAD.AVENUE ? 'a' : world.road[idx(x, y)] === ROAD.COBBLE ? 'c' : 's');
  for (const axis of [0, 1]) {
    const [dx, dy] = axis === 0 ? [1, 0] : [0, 1];
    const [px, py] = [dy, dx];
    for (let y = 0; y < world.size; y++) {
      for (let x = 0; x < world.size; x++) {
        const kind = kindOf(x, y);
        if (!kind || kindOf(x - dx, y - dy) === kind) continue;
        let n = 0;
        while (kindOf(x + dx * n, y + dy * n) === kind) n++;
        const lastX = x + dx * (n - 1), lastY = y + dy * (n - 1);
        const alone = n === 1 && !road(x + px, y + py) && !road(x - px, y - py);
        if (n === 1 && !alone) continue;
        const open = (tx, ty) => !road(tx + px, ty + py) && !road(tx - px, ty - py);
        const a = at(x, y), b = at(lastX, lastY);
        const e = TILE * 0.5;
        const pb = past(x, y, -dx, -dy), pa = past(lastX, lastY, dx, dy);
        const from = pb !== null ? [a[0] - dx * pb * TILE, a[1] - dy * pb * TILE] : open(x, y) ? [a[0] - dx * e, a[1] - dy * e] : a;
        const to = pa !== null ? [b[0] + dx * pa * TILE, b[1] + dy * pa * TILE] : open(lastX, lastY) ? [b[0] + dx * e, b[1] + dy * e] : b;
        // (The leftover avenue tiles are halves of one, unmarked. A boulevard is paved in stones, as 3d-city's brick streets are.)
        add([from, to], kind === 'a' ? 'unclassified' : 'tertiary', kind === 'a' ? TILE : ASPHALT, null, kind === 'c' ? [{ value: 'paving_stones' }] : null);
      }
    }
  }
  // The walks: along every side of a road tile that has no road beside it.
  const walk = (x, y, side) => {
    const [dx, dy] = DIRS[side];
    if (road(x + dx, y + dy)) return null;
    const [mx, mz] = at(x, y), e = TILE / 2;
    return side === 0 ? [[mx - e, mz - e], [mx + e, mz - e]] : side === 2 ? [[mx - e, mz + e], [mx + e, mz + e]] : side === 1 ? [[mx + e, mz - e], [mx + e, mz + e]] : [[mx - e, mz - e], [mx - e, mz + e]];
  };
  for (let side = 0; side < 4; side++) {
    const along = side === 0 || side === 2 ? [1, 0] : [0, 1];
    for (let y = 0; y < world.size; y++) {
      for (let x = 0; x < world.size; x++) {
        if (!plain(x, y) || !walk(x, y, side) || (plain(x - along[0], y - along[1]) && walk(x - along[0], y - along[1], side))) continue;
        let n = 0, last = null;
        while (plain(x + along[0] * n, y + along[1] * n) && walk(x + along[0] * n, y + along[1] * n, side)) { last = walk(x + along[0] * n, y + along[1] * n, side); n++; }
        add([walk(x, y, side)[0], last[1]], 'footway', WALK, 'sidewalk');
      }
    }
  }
  return records;
}

export function createStreets({ GFX, scene, world, terrain, bounds, pixels }) {
  let group = null;
  let built = -1, wait = 0;
  const clear = () => {
    if (!group) return;
    scene.remove(group);
    group.traverse((o) => o.geometry?.dispose?.());
    group = null;
  };
  const build = () => {
    clear();
    built = world.netVersion ?? 0;
    const records = streetRecords(world);
    if (!records.length) return;
    const builder = new Builder();
    lay(builder, terrain, records);
    group = cityGroup(GFX, builder.finish(), bounds, pixels, []);
    scene.add(group);
  };
  return {
    /** Once a frame: lays the streets again, a moment after they change. */
    update(dt) {
      if (built === (world.netVersion ?? 0)) { wait = 0; return; }
      wait += dt;
      if (wait > 0.35 || built < 0) { wait = 0; build(); }
    },
  };
}
