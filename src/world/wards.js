import { CASTLE, CENTER, DIRS, GROUND, HOME_WARD, WALL_HALF, WALL_VERGE, ROAD, SIZE, WARD, WARDS, WATER_LEVEL } from '../config.js';
import { mulberry32, pick } from '../rng.js';
import { HV, SUB, castleNorm, idx, tileRange, touchAll } from './world.js';

export { castleNorm };

/**
 * The map is a grid of wards, and the realm is the wards that have been
 * walled. A wall of ice runs around the realm, along every ward border that has
 * unwalled land on the far side; where two of the realm's wards meet there is
 * no wall. The tower has a keep wall of its own, which never moves.
 */

// California names: a saint, a Spanish word, or an English one, and a word for the kind of place.
const FIRST = ['Heritage','Belknap','Monroe','Midtown','Westside','Roosevelt','Black Hills','Eastown','John Ball','Creston','Fulton','Oakdale','Garfield','Baxter','Mulick','Kent','Ottawa','Pearl','Ionia','Division','Lyon','Bridge','Leonard','Plainfield','Bostwick','Coldbrook','Straight','Scribner','Wealthy','Cherry'];
const LAST = [' Hill',' Park',' Flats',' Heights',' Yards',' Landing',' Square',' Crossing',' Terrace',' Row',' Commons',' Bluff'];
const TAIL = { wood: ['Woods','Grove','Park'], water: ['Riverfront','Landing','Flats'], rock: ['Bluff','Hill','Heights'], ore: ['Yards','Works','Heights'], fertile: ['Flats','Commons','Gardens'], high: ['Heights','Hill','Ridge'], plain: ['Square','Commons','District'] };

/** The four edges of a ward, as the direction they face. */
export const EDGES = ['north', 'east', 'south', 'west'];

export const wardId = (gx, gy) => gx + gy * WARDS;
export const wardXY = (id) => [id % WARDS, Math.floor(id / WARDS)];
export const wardOfTile = (x, y) => wardId(Math.floor(x / WARD), Math.floor(y / WARD));

/** Makes the wards (districts): their names, what they are like, and which one is the city's. */
export function initWards(world) {
  const rnd = mulberry32(world.seed ^ 0x2545f491);
  const used = new Set();
  const wards = [];
  for (let id = 0; id < WARDS * WARDS; id++) {
    const [gx, gy] = wardXY(id);
    const stats = measureWard(world, gx, gy);
    const trait = pickTrait(stats, gx, gy);
    let name;
    for (let tries = 0; ; tries++) {
      const base = `${pick(rnd, FIRST)}${pick(rnd, LAST)}`;
      name = rnd() < 0.55 ? base : `${pick(rnd, FIRST)} ${pick(rnd, TAIL[trait])}`;
      if (!used.has(name) || tries > 20) break;
    }
    used.add(name);
    wards.push({ id, gx, gy, name, trait, stats, owned: false, dig: null });
  }
  wards[wardId(HOME_WARD, HOME_WARD)].owned = true;
  wards[wardId(HOME_WARD, HOME_WARD)].name = `${pick(rnd, ['Riverfront','Pearl Street','Monroe North','Calder Plaza','Lyon Square','Founders'])} District`;
  world.wards = wards;
  return wards;
}

/** How many of a ward's tiles are of each kind. */
export function measureWard(world, gx, gy) {
  const s = { tiles: WARD * WARD, arable: 0, forest: 0, rock: 0, ore: 0, water: 0, cliff: 0, rubble: 0, fert: 0 };
  let n = 0;
  for (let y = gy * WARD; y < (gy + 1) * WARD; y++) {
    for (let x = gx * WARD; x < (gx + 1) * WARD; x++) {
      const i = idx(x, y);
      const g = world.ground[i];
      if (g === GROUND.WATER) s.water++;
      else if (g === GROUND.CLIFF) s.cliff++;
      else if (g === GROUND.ROCK) s.rock++;
      else if (g === GROUND.ORE) s.ore++;
      else if (world.tree[i]) s.forest++;
      else if (world.fert[i] > 120) { const [lo, hi] = tileRange(world, x, y); if (hi - lo < 0.5) s.arable++; }
      s.fert += world.fert[i];
      n++;
    }
  }
  s.fert = s.fert / n / 255;
  s.hardness = Math.min(1, (s.cliff * 1 + s.rock * 0.5 + s.ore * 0.5 + s.forest * 0.18 + s.water * 0.3) / s.tiles * 1.6);
  return s;
}

function pickTrait(s, gx, gy) {
  const edge = gx === 0 || gy === 0 || gx === WARDS - 1 || gy === WARDS - 1;
  if (s.cliff + s.rock > s.tiles * 0.3 || (edge && s.hardness > 0.3)) return s.ore > 4 ? 'ore' : s.cliff > s.tiles * 0.2 ? 'high' : 'rock';
  if (s.water > s.tiles * 0.18) return 'water';
  if (s.ore > 4) return 'ore';
  if (s.forest > s.tiles * 0.4) return 'wood';
  if (s.arable > s.tiles * 0.45) return 'fertile';
  return 'plain';
}

/** What a ward is good for, in words. */
export function wardTraits(ward) {
  const s = ward.stats;
  const out = [];
  if (s.arable > s.tiles * 0.4) out.push('Wide, flat lots');
  else if (s.arable > s.tiles * 0.2) out.push('Some flat land');
  if (s.forest > s.tiles * 0.4) out.push('Thick woods');
  else if (s.forest > s.tiles * 0.15) out.push('Trees');
  if (s.water > s.tiles * 0.05) out.push(s.water > s.tiles * 0.2 ? 'Lagoon and creek' : 'Waterfront');
  if (s.rock > 6) out.push('Rocky bluffs');
  if (s.cliff > s.tiles * 0.2) out.push('Steep hills');
  return out.length ? out : ['Open, rough ground'];
}

export const ownedWards = (world) => world.wards.filter((w) => w.owned);
export const ownedCount = (world) => ownedWards(world).length;

/** Does the ward touch the realm? */
export function bordersRealm(world, id) {
  const [gx, gy] = wardXY(id);
  return DIRS.some(([dx, dy]) => {
    const x = gx + dx, y = gy + dy;
    return x >= 0 && y >= 0 && x < WARDS && y < WARDS && world.wards[wardId(x, y)].owned;
  });
}

/** The borders between the realm and what is not yet in it: segments, with the ward inside and which way they face. */
export function exposedBorders(world) {
  const out = [];
  for (const w of world.wards) {
    if (!w.owned) continue;
    const x0 = w.gx * WARD, y0 = w.gy * WARD, x1 = x0 + WARD, y1 = y0 + WARD;
    const segs = [[x0, y0, x1, y0], [x1, y0, x1, y1], [x0, y1, x1, y1], [x0, y0, x0, y1]];
    DIRS.forEach(([dx, dy], dir) => {
      const nx = w.gx + dx, ny = w.gy + dy;
      const inside = nx >= 0 && ny >= 0 && nx < WARDS && ny < WARDS;
      if (inside && world.wards[wardId(nx, ny)].owned) return;
      const [ax, ay, bx, by] = segs[dir];
      out.push({ ward: w.id, dir, x0: ax, y0: ay, x1: bx, y1: by, beyond: inside ? wardId(nx, ny) : null });
    });
  }
  return out;
}

const segDist = (s, x, y) => {
  const dx = Math.max(Math.min(s.x0, s.x1) - x, 0, x - Math.max(s.x0, s.x1));
  const dy = Math.max(Math.min(s.y0, s.y1) - y, 0, y - Math.max(s.y0, s.y1));
  return Math.hypot(dx, dy);
};

/** The tiles of the castle's drawbridge: two wide, three long, on the south side. */
export const CASTLE_BRIDGE = Object.freeze({ x: CENTER - 1, y: CENTER + 3, w: 2, d: 3 });
/** Where the town's first road starts: the tiles just beyond the drawbridge. */
export const CASTLE_ROOT = Object.freeze({ x: CENTER - 1, y: CENTER + 6, w: 2 });

/** Is this tile dry, firm land a gate can stand on? Judged on the land as it was made. */
function firmLand(world, x, y) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return false;
  const g = world.ground[idx(x, y)];
  if (g === GROUND.WATER || g === GROUND.CLIFF) return false;
  const vx = Math.min(HV - 1, Math.round((x + 0.5) * SUB)), vy = Math.min(HV - 1, Math.round((y + 0.5) * SUB));
  return (world.hBase ?? world.h)[vy * HV + vx] > WATER_LEVEL + 0.25;
}

/**
 * How far along its border a gate's bridge is slid from the middle, so that both its ends
 * stand on land: the nearest place to the middle where both banks are dry ground and not
 * a river, a lake, the sea or a cliff. Null if there is none: the border is all water, and
 * a gate there would be a bridge to nowhere.
 */
function gateOffset(world, s, horizontal) {
  const base = (horizontal ? s.x0 : s.y0) + WARD / 2;
  const edge = horizontal ? s.y0 : s.x0;
  const reach = Math.max(0, WARD / 2 - 3);
  for (let n = 0; n <= reach * 2; n++) {
    const off = n % 2 ? -(n + 1) / 2 : n / 2;
    let ok = true;
    for (const k of [-3, -2, 1, 2]) {
      for (let a = -1; a < 1 && ok; a++) {
        const along = base + off + a, across = edge + k;
        if (!(horizontal ? firmLand(world, along, across) : firmLand(world, across, along))) ok = false;
      }
    }
    if (ok) return off;
  }
  return null;
}

/**
 * Works out where the wall is from which wards are the realm's: the distance
 * to it from every vertex, which tiles are water, which are bank, and which
 * are the realm's to build on. Also where the gates are, keeping the state of
 * any that were there before.
 */
export function computeWalls(world) {
  const borders = exposedBorders(world);
  world.borders = borders;
  const D = world.wallD;
  D.fill(99);
  const reach = WALL_VERGE + 5;
  for (const s of borders) {
    const vx0 = Math.max(0, Math.floor((Math.min(s.x0, s.x1) - reach) * SUB)), vx1 = Math.min(HV - 1, Math.ceil((Math.max(s.x0, s.x1) + reach) * SUB));
    const vy0 = Math.max(0, Math.floor((Math.min(s.y0, s.y1) - reach) * SUB)), vy1 = Math.min(HV - 1, Math.ceil((Math.max(s.y0, s.y1) + reach) * SUB));
    for (let vy = vy0; vy <= vy1; vy++) {
      for (let vx = vx0; vx <= vx1; vx++) {
        const d = segDist(s, vx / SUB, vy / SUB);
        const i = vy * HV + vx;
        if (d < D[i]) D[i] = d;
      }
    }
  }
  const { wall, realm } = world;
  wall.fill(0);
  realm.fill(0);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = idx(x, y);
      const cx = x + 0.5, cy = y + 0.5;
      let d = 99;
      for (const s of borders) {
        const sd = segDist(s, cx, cy);
        if (sd < d) d = sd;
      }
      const cn = castleNorm(cx, cy);
      if (cn < CASTLE.verge) wall[i] = cn >= CASTLE.wallIn && cn <= CASTLE.wallOut ? 1 : 2;
      else if (d < WALL_HALF) wall[i] = 1;
      else if (d < WALL_VERGE) wall[i] = 2;
      const w = world.wards[wardId(Math.floor(x / WARD), Math.floor(y / WARD))];
      if (w.owned && !wall[i]) realm[i] = 1;
    }
  }
  // Gates: one at the middle of every border that has another ward across it.
  const old = new Map((world.gates ?? []).map((g) => [`${g.ward}:${g.dir}`, g]));
  const gates = [];
  for (const s of borders) {
    if (s.beyond === null) continue;
    const key = `${s.ward}:${s.dir}`;
    const horizontal = s.dir === 0 || s.dir === 2;
    const prev = old.get(key);
    let off = (prev && !prev.wet ? prev.off : undefined) ?? world.gateOffsets?.get(key) ?? gateOffset(world, s, horizontal);
    const wet = off === null;
    if (wet) off = 0;
    const mid = (horizontal ? s.x0 : s.y0) + WARD / 2 + off;
    const tiles = [];
    // Six tiles long through the wall, two wide.
    for (let k = -3; k < 3; k++) {
      for (let a = -1; a < 1; a++) {
        const along = mid + a;
        const across = (horizontal ? s.y0 : s.x0) + k;
        tiles.push(horizontal ? [along, across] : [across, along]);
      }
    }
    // Which end is the inside: the one nearer the ward's own middle.
    const gate = old.get(key) ?? { ward: s.ward, dir: s.dir, open: true, gatehouse: 0 };
    gate.tiles = tiles;
    gate.off = off;
    gate.wet = wet;
    gate.beyond = s.beyond;
    gate.mid = horizontal ? [mid, s.y0] : [s.x0, mid];
    gates.push(gate);
  }
  world.gates = gates;
  for (let i = 0; i < world.road.length; i++) if (world.road[i] === ROAD.BRIDGE) world.road[i] = ROAD.NONE;
  for (const g of gates) if (!g.wet) for (const [x, y] of g.tiles) if (x >= 0 && y >= 0 && x < SIZE && y < SIZE) world.road[idx(x, y)] = ROAD.BRIDGE;
  // And the castle's.
  const b = CASTLE_BRIDGE;
  for (let y = b.y; y < b.y + b.d; y++) for (let x = b.x; x < b.x + b.w; x++) world.road[idx(x, y)] = ROAD.BRIDGE;
  touchAll(world);
  return world;
}

/** The keep stands on the ground as the map has it: nothing is shaped, and the base heights are the land's. Done once. */
export function shapeCastle(world) {
  world.hBase = Float32Array.from(world.h);
  touchAll(world);
}

/** Lays the land out as it is: the walls stand on it and cut nothing, so the heights are the base heights; trees are cleared from under the walls. */
export function levelLand(world) {
  if (!world.hBase) world.hBase = Float32Array.from(world.h);
  world.h.set(world.hBase);
  clearWallTrees(world);
  world.wver = (world.wver ?? 0) + 1;
  touchAll(world);
}

/** Trees do not stand in a wall: the woods a new wall is raised through (the ward's own, or its neighbor's) lose the trees it covers. */
export function clearWallTrees(world) {
  for (let y = 0; y < world.size; y++) {
    for (let x = 0; x < world.size; x++) {
      const i = idx(x, y);
      if (!world.tree[i] || !world.wall[i]) continue;
      if (world.wall[i] === 1) world.tree[i] = 0;
    }
  }
}

/** The ground of a ward the founder has taken is left as the map has it (buildings stand on it as it lies); the walls are what change. */
export function gradeWard(world) {
  levelLand(world);
}

/** The gate whose bridge covers tile (x, y), if any. */
export function gateAt(world, x, y) {
  for (const g of world.gates) if (!g.wet) for (const [tx, ty] of g.tiles) if (tx === x && ty === y) return g;
  return null;
}

export const wardName = (world, id) => world.wards[id]?.name ?? '';
