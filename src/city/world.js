import { Builder } from './builder.js';
import { footOf } from './buildings.js';
import { Designs } from './rt/buildings.js';
import { devosHall, devosPlace, vitesse as designVitesse } from './rt/landmarks.js';
import { shopfronts, signs } from './storefronts.js';
import { MARKET, downtownMarket } from './market.js';
import { STATION, stationCanopy } from './transit.js';
import { dress, drape, groundRoads, lay, skirt, widthOf } from './ground.js';
import { Terrain } from './terrain.js';
import { areaOf, buildingIndex, inside, sampleLine, unit } from './geometry.js';
import { rangesOf, skywalks } from './bridges.js';
import { blockedBy, plant } from './trees.js';
import { lamps } from './furniture.js';
import { inHeritageHill } from './heritage.js';
import { ROSA_PARKS, STAGE_ID, VITESSE, FORD_GRAVE, fordGrave, inRosaParks, museumDomes, museumPorch, rosaParks } from './landmarks.js';
import { SITES, acrisureAmphitheater, amwayStadium, inVenue, levelVenues, onVenue } from './venues.js';

/** What a patch of land-use is laid as: the engine's floor surface and a tint. */
// (A park's or a lawn's grass is `ground:lawn`: grass as the ground's is, told apart so it can be checked; see dropFloating.)
const LAND = {
  park: ['ground:lawn', [0.95, 1.0, 0.9]],
  grass: ['ground:lawn', [0.9, 0.98, 0.85]],
  pitch: ['ground:lawn', [0.8, 1.0, 0.75]],
  recreation_ground: ['ground:lawn', [0.9, 1.0, 0.85]],
  dog_park: ['ground:lawn', [0.9, 1.0, 0.85]],
  playground: ['ground:path', [1, 1, 1]],
  // Plain square concrete slabs, not brick: the brick pavers are the brick streets'.
  pedestrian: ['ground:plaza', [1, 1, 1]],
  plaza: ['ground:plaza', [1, 1, 1]],
  construction: ['surface:dirt', [0.9, 0.9, 0.9]],
  industrial: ['road:concrete', [0.9, 0.9, 0.9]],
  railway: ['ground:ballast', [1, 1, 1]],
  school: ['ground:lawn', [0.85, 0.95, 0.8]],
  university: ['ground:lawn', [0.85, 0.95, 0.8]],
  hospital: ['road:concrete', [1, 1, 1]],
};

/** How much of the ground round a point is under buildings, from a coarse count of their footprints. */
function density(buildings, terrain, cell = 24, radius = 2) {
  const nx = Math.ceil(terrain.width / cell) + 1, nz = Math.ceil(terrain.depth / cell) + 1;
  const sum = new Float32Array(nx * nz);
  for (const b of buildings) {
    const [x, z] = b.rings[0][0];
    const i = Math.floor((x - terrain.x0) / cell), j = Math.floor((z - terrain.z0) / cell);
    if (i >= 0 && j >= 0 && i < nx && j < nz) sum[j * nx + i] += areaOf(b.rings[0]);
  }
  const blurred = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    let s = 0, n = 0;
    for (let dj = -radius; dj <= radius; dj++) for (let di = -radius; di <= radius; di++) {
      const a = i + di, c = j + dj;
      if (a >= 0 && c >= 0 && a < nx && c < nz) { s += sum[c * nx + a]; n++; }
    }
    blurred[j * nx + i] = s / (n * cell * cell);
  }
  return (x, z) => {
    const i = Math.max(0, Math.min(nx - 1, Math.floor((x - terrain.x0) / cell))), j = Math.max(0, Math.min(nz - 1, Math.floor((z - terrain.z0) / cell)));
    return blurred[j * nx + i];
  };
}

/**
 * How much of the ground round each point is open (not under a street, its pavements or a building), in `step` m
 * cells over the terrain: the aerial photo's green is a share of everything in its cell, roofs and asphalt too, and
 * read as it is it paves every cell a street runs through.
 */
function openness(data, terrain, step = 4) {
  const nx = Math.ceil(terrain.width / step) + 1, nz = Math.ceil(terrain.depth / step) + 1, x0 = terrain.x0, z0 = terrain.z0;
  const shut = new Uint8Array(nx * nz);
  for (const road of data.roads) {
    if (!road.line || road.line.length < 2) continue;
    const r = widthOf(road) / 2 + 2, k = Math.ceil(r / step);
    for (let s = 1; s < road.line.length; s++) {
      const [ax, az] = road.line[s - 1], [bx, bz] = road.line[s], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 2));
      for (let t = 0; t <= n; t++) {
        const x = ax + ((bx - ax) * t) / n, z = az + ((bz - az) * t) / n;
        const ci = Math.floor((x - x0) / step), cj = Math.floor((z - z0) / step);
        for (let j = cj - k; j <= cj + k; j++) for (let i = ci - k; i <= ci + k; i++) {
          if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
          if (Math.hypot(x0 + (i + 0.5) * step - x, z0 + (j + 0.5) * step - z) <= r) shut[j * nx + i] = 1;
        }
      }
    }
  }
  for (const b of data.buildings) {
    const ring = b.rings?.[0];
    if (!ring) continue;
    let a = Infinity, c = -Infinity, d = Infinity, e = -Infinity;
    for (const [x, z] of ring) { a = Math.min(a, x); c = Math.max(c, x); d = Math.min(d, z); e = Math.max(e, z); }
    for (let j = Math.max(0, Math.floor((d - z0) / step)); j <= Math.min(nz - 1, Math.floor((e - z0) / step)); j++) {
      for (let i = Math.max(0, Math.floor((a - x0) / step)); i <= Math.min(nx - 1, Math.floor((c - x0) / step)); i++) {
        if (inside(b.rings, x0 + (i + 0.5) * step, z0 + (j + 0.5) * step)) shut[j * nx + i] = 1;
      }
    }
  }
  /** The open share of the `size` m square round (x, z). */
  return (x, z, size) => {
    const h = size / 2, i0 = Math.max(0, Math.floor((x - h - x0) / step)), i1 = Math.min(nx - 1, Math.floor((x + h - x0) / step) - (((x + h - x0) / step) % 1 === 0 ? 1 : 0));
    const j0 = Math.max(0, Math.floor((z - h - z0) / step)), j1 = Math.min(nz - 1, Math.floor((z + h - z0) / step) - (((z + h - z0) / step) % 1 === 0 ? 1 : 0));
    let open = 0, all = 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { all++; if (!shut[j * nx + i]) open++; }
    return all ? open / all : 1;
  };
}

/** For a footprint, the way to the street nearest its middle, as a unit [dx, dz]: the way a house faces. */
/** Buildings built as a house whatever their use says (buildings.js `FEATURED`): they too face their street. */
const FEATURED_HOUSES = new Set(['Jenison Museum']);

function streetward(roads) {
  const CELLSIZE = 40, grid = new Map();
  for (const r of roads) {
    if (r.subtype !== 'road' || ['footway', 'path', 'steps', 'cycleway', 'service'].includes(r.class)) continue;
    for (const [x, z] of sampleLine(r.line, 4)) {
      const k = `${Math.floor(x / CELLSIZE)},${Math.floor(z / CELLSIZE)}`;
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push([x, z]);
    }
  }
  return (ring) => {
    let cx = 0, cz = 0;
    for (const [x, z] of ring) { cx += x / ring.length; cz += z / ring.length; }
    let best = null;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) for (const [x, z] of grid.get(`${Math.floor(cx / CELLSIZE) + dx},${Math.floor(cz / CELLSIZE) + dz}`) ?? []) {
      const d = Math.hypot(x - cx, z - cz);
      if (!best || d < best.d) best = { d, x, z };
    }
    return best ? [(best.x - cx) / (best.d || 1), (best.z - cz) / (best.d || 1)] : null;
  };
}

/**
 * The height of what `materials` lay at (x, z) (the top one), or null where they lay nothing. Brick pavers count
 * only where they are a brick street's (their colour), not a plaza's.
 */
function surfaceOf(builder, materials) {
  const C = 8, grid = new Map(), tris = [];
  for (const p of builder.parts.values()) {
    if (!materials.includes(p.material)) continue;
    const pos = p.pos.data, col = p.col.data, n = p.pos.length;
    for (let k = 0; k < n; k += 9) {
      if (p.material === 'ground:pavers' && col[k / 3] - col[k / 3 + 2] <= 0.15) continue;
      const t = [pos[k], pos[k + 1], pos[k + 2], pos[k + 3], pos[k + 4], pos[k + 5], pos[k + 6], pos[k + 7], pos[k + 8]];
      const id = tris.push(t) - 1;
      for (let i = Math.floor(Math.min(t[0], t[3], t[6]) / C); i <= Math.floor(Math.max(t[0], t[3], t[6]) / C); i++)
        for (let j = Math.floor(Math.min(t[2], t[5], t[8]) / C); j <= Math.floor(Math.max(t[2], t[5], t[8]) / C); j++) {
          const key = `${i},${j}`;
          if (!grid.has(key)) grid.set(key, []);
          grid.get(key).push(id);
        }
    }
  }
  return (x, z) => {
    let best = null;
    for (const id of grid.get(`${Math.floor(x / C)},${Math.floor(z / C)}`) ?? []) {
      const [ax, ay, az, bx, by, bz, cx, cy, cz] = tris[id];
      const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(d) < 1e-9) continue;
      const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
      if (u < 0 || v < 0 || u + v > 1) continue;
      const y = u * ay + v * by + (1 - u - v) * cy;
      best = best === null ? y : Math.max(best, y);
    }
    return best;
  };
}

/**
 * A park's or a lawn's grass is draped over the ground with few points: between them it can rise over a road, a
 * car park or a pavement beside it, or float where the ground falls away. Where it does it is left out (what lies
 * there shows: the road, or the ground's own grass).
 */
function dropFloating(builder, terrain) {
  const paved = surfaceOf(builder, ['road:asphalt', 'road:lot', 'ground:pavers', 'road:sidewalk', 'road:concrete']);
  for (const p of builder.parts.values()) {
    if (p.material !== 'ground:lawn') continue;
    const pos = p.pos.data, n = p.pos.length, keep = [];
    for (let k = 0; k < n; k += 9) {
      const v = [0, 3, 6].map((o) => [pos[k + o], pos[k + o + 1], pos[k + o + 2]]);
      const probes = [...v, v.reduce((s, q) => [s[0] + q[0] / 3, s[1] + q[1] / 3, s[2] + q[2] / 3], [0, 0, 0]),
        ...[0, 1, 2].map((i) => v[i].map((c, j) => (c + v[(i + 1) % 3][j]) / 2))];
      const floats = probes.some(([x, y, z]) => {
        if (y - terrain.heightAt(x, z) > 0.25 + 0.08) return true;
        const r = paved(x, z);
        return r !== null && y > r - 0.05;
      });
      if (!floats) keep.push(k);
    }
    if (keep.length === n / 9) continue;
    for (const [name, size] of [['pos', 9], ['nor', 9], ['uv', 6], ['col', 9]]) {
      const src = p[name].data, out = new Float32Array(keep.length * size);
      keep.forEach((k, i) => out.set(src.subarray((k / 9) * size, (k / 9) * size + size), i * size));
      p[name].data = out;
      p[name].length = out.length;
    }
  }
}

/** (x, y) in Blender's frame -> a unit vector toward the nearest street within 80 m, or null (Rivertown's street_dir). */
function towardStreet(roads) {
  const C = 40, grid = new Map();
  for (const r of roads) {
    if (r.subtype !== 'road' || ['footway', 'path', 'steps', 'cycleway', 'pedestrian', 'track', 'bridleway'].includes(r.class)) continue;
    for (const [x, z] of sampleLine(r.line, 3)) {
      const k = `${Math.floor(x / C)},${Math.floor(-z / C)}`;
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push([x, -z]);
    }
  }
  return (x, y) => {
    let best = null;
    const i0 = Math.floor(x / C), j0 = Math.floor(y / C);
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) for (const [px, py] of grid.get(`${i0 + di},${j0 + dj}`) ?? []) {
      const d = Math.hypot(px - x, py - y);
      if (!best || d < best[0]) best = [d, px, py];
    }
    if (!best || best[0] > 80 || best[0] < 1e-6) return null;
    return [(best[1] - x) / best[0], (best[2] - y) / best[0]];
  };
}

/** A footprint ([x, z] ring) -> [the businesses inside it, those within 80 m], lower case. */
function placeIndex(places) {
  const C = 100, grid = new Map();
  for (const [name, x, z] of places) {
    const k = `${Math.floor(x / C)},${Math.floor(z / C)}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push([String(name).toLowerCase(), x, z]);
  }
  return (ring) => {
    let cx = 0, cz = 0;
    for (const [x, z] of ring) { cx += x / ring.length; cz += z / ring.length; }
    const names = [], near = [];
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) for (const [n, x, z] of grid.get(`${Math.floor(cx / C) + di},${Math.floor(cz / C) + dj}`) ?? []) {
      if ((x - cx) ** 2 + (z - cz) ** 2 < 80 ** 2) near.push(n);
      if (inside([ring], x, z)) names.push(n);
    }
    return [names, near];
  };
}

/**
 * Everything the data says, built into triangles: the ground, the water, the
 * streets, the buildings. Pure maths on plain objects, so it runs in a test
 * as well as in the page.
 */
/**
 * The ground as the map has it: the satellite's heights with the river's bed cut in, Rosa Parks Circle levelled, the low
 * hill in the park, the Riverwalk's bank built up. `bare`: a map with no buildings, so the grounds the venues stood on are
 * left as the land lies. Both the city's builder and a game's simulation read the ground from here, so they agree.
 */
export function makeTerrain(data, { tile = null, outer = null, bare = false } = {}) {
  const e = data.elevation;
  const own = tile ? tile.box : [e.x0, e.z0, e.x0 + Math.floor((e.cols - 1) * e.step / 8) * 8, e.z0 + Math.floor((e.rows - 1) * e.step / 8) * 8];
  const reach = tile || outer ? padOf(data, own) : 0;
  const terrain = tile
    ? new Terrain(data.elevation, data.water, { box: [own[0] - reach, own[1] - reach, own[2] + reach, own[3] + reach], level: tile.level, surface: tile.surface, floor: tile.level })
    : new Terrain(data.elevation, data.water, { outer, pad: reach });
  // What this ground draws (and the ball's tiles are counted from): the tile, or downtown's own patch.
  terrain.drawn = own;
  // Rosa Parks Circle stands on level ground, and so do the stadium and the amphitheater.
  if (!tile) {
    terrain.level(ROSA_PARKS.centre[0], ROSA_PARKS.centre[1], 32, 14);
    // The low grass hill in the park, between the circle and the corner where Monroe Avenue meets Monroe Center.
    terrain.mound(-303, -128, 14, 1.6);
    // The Riverwalk downtown is a promenade on the flood wall, level with the land behind it, well over the water (the map's
    // ground has it at the water's edge): the bank under it built up, and riverwalkWall draws the wall.
    if (terrain.waterLevel !== null) {
      for (const r of data.roads) {
        if (!/Riverwalk/i.test(r.name ?? '') || rangesOf(r).length) continue;
        for (let i = 1; i < r.line.length; i++) {
          const [ax, az] = r.line[i - 1], [bx, bz] = r.line[i], L = Math.hypot(bx - ax, bz - az);
          if (L < 0.5) continue;
          const nx = -(bz - az) / L, nz = (bx - ax) / L;
          for (let t = 0; t <= L; t += 4) {
            const x = ax + (bx - ax) * (t / L), z = az + (bz - az) * (t / L);
            // The land behind it: the higher side, 14 m off.
            const behind = Math.max(terrain.heightAt(x + nx * 14, z + nz * 14), terrain.heightAt(x - nx * 14, z - nz * 14));
            terrain.embank(x, z, 5, Math.max(behind - 0.3, terrain.waterLevel + 3.5));
          }
        }
      }
    }
    if (!bare) levelVenues(terrain);
  }
  return { terrain, own, reach };
}

export function buildCity(data, { tile = null, alone = true, outer = null, bare = false } = {}) {
  let boards = [];
  // A tile of the greater city is drawn in bigger pieces than downtown: fewer meshes, as several are shown at once.
  const builder = new Builder(tile ? { chunk: 1000 } : {});
  // Downtown, or a tile of the greater city round it (`tile`: its `box`, the river's `level` and `surface`, and the
  // `hole` downtown leaves in it). `alone`: downtown with nothing round it, walled in, its edge carried out as ground.
  // A tile's ground reaches past its edge as far as what it draws does (a street whose middle is in it runs on into
  // the next), so that lies on the ground there too and not at the height of its edge; it is drawn only to its edge.
  // Downtown's does too, where the greater area's heights (`outer`) are given for past its edge.
  const { terrain, own, reach } = makeTerrain(data, { tile, outer, bare });
  if (bare) data = { ...data, roads: [], buildings: [], lidar: {}, roofs: {}, places: null };
  else if (!tile) {
    // What the map had where they now stand (car parks, the city's yard and its sheds, the yard's lanes) is gone.
    const gone = (r) => r.rings && onVenue(r.rings);
    data = {
      ...data,
      buildings: data.buildings.filter((b) => !onVenue(b.rings)),
      landuse: data.landuse.filter((l) => !gone(l) && l.name !== 'Amway Stadium'),
      infrastructure: data.infrastructure.filter((i) => !gone(i)),
      roads: data.roads.filter((r) => {
        if (!['service', 'unknown', 'footway', 'path', 'steps'].includes(r.class)) return true;
        const [x, z] = r.line[Math.floor(r.line.length / 2)];
        return !inVenue(x, z);
      }),
      trees: data.trees?.filter(([x, z]) => !inVenue(x, z)),
    };
  }
  // Where the buildings stand thick the ground between them is paved, not lawn.
  // The aerial photo says where it is green; failing that, where buildings stand thick.
  const built = density(data.buildings, terrain);
  const green = data.green ? ((g) => (x, z) => (g.green[Math.max(0, Math.min(g.rows - 1, Math.floor((z - g.z0) / g.step)))]?.[Math.max(0, Math.min(g.cols - 1, Math.floor((x - g.x0) / g.step)))] ?? 0) / 100)(data.green) : null;
  const hole = tile?.hole;
  // Paved where the open ground (what is not street or roof) is mostly not green: a yard, a lot the map has no shape
  // for. Where a cell is nearly all street and roof, what is left of it (the verges, the gaps between) is lawn.
  let paved = (x, z) => built(x, z) > 0.16;
  if (green) {
    const open = openness(data, terrain), size = data.green.step;
    // A cell by itself: bare where its open ground is mostly not green. Paved only in a patch of such cells (a lot,
    // a yard): one bare cell alone, among lawns, is a square of concrete that reads as a mistake, and is lawn.
    const memo = new Map();
    const bare = (ci, cj) => {
      const k = ci * 100003 + cj;
      if (!memo.has(k)) {
        const cx = data.green.x0 + (ci + 0.5) * size, cz = data.green.z0 + (cj + 0.5) * size, o = open(cx, cz, size);
        memo.set(k, o > 0.3 && green(cx, cz) / o < 0.25);
      }
      return memo.get(k);
    };
    paved = (x, z) => {
      const ci = Math.floor((x - data.green.x0) / size), cj = Math.floor((z - data.green.z0) / size);
      if (!bare(ci, cj)) return false;
      return bare(ci - 1, cj) + bare(ci + 1, cj) + bare(ci, cj - 1) + bare(ci, cj + 1) >= 2;
    };
  }
  terrain.mesh(builder, {
    grass: 'ground:turf', paved: 'road:concrete', built: paved,
    skip: tile || reach ? (x, z) => x < own[0] || x > own[2] || z < own[1] || z > own[3] || (hole && x > hole[0] && x < hole[2] && z > hole[1] && z < hole[3]) : null,
  });
  if (alone && !tile) terrain.skirt(builder, 'ground:turf');

  // Land use: parks and lawns, plazas, the big ones first so the small lie over them.
  const layers = [...data.landuse, ...data.land].filter((l) => l.rings).sort((a, b) => areaOf(b.rings[0]) - areaOf(a.rings[0]));
  for (const l of layers) {
    const [material, color] = LAND[l.subtype] ?? LAND[l.class] ?? [];
    if (material) drape(builder, terrain, material, l.rings, { lift: 0.08, tile: material === 'ground:lawn' ? 1.5 : material === 'ground:pavers' ? 1.6 : material === 'ground:plaza' ? 3 : 2, color, most: 12 });
  }
  // The riverfront round the amphitheater, where the city's yard was: lawn (the Green Ribbon along the river).
  if (!tile && !bare) drape(builder, terrain, 'ground:turf', [SITES[1]], { lift: 0.1, tile: 1.5, color: [0.92, 1.02, 0.86], most: 12 });
  for (const p of data.infrastructure) {
    if (!p.rings || p.subtype !== 'transit' || p.class !== 'parking') continue;
    // Calder Plaza is a garage's roof, and the map calls it parking; on top it is a plaza of pale concrete.
    if (inside(p.rings, VITESSE[0], VITESSE[1])) drape(builder, terrain, 'road:sidewalk', p.rings, { lift: 0.14, tile: 3, color: [1.04, 1.02, 0.98], most: 12 });
    else drape(builder, terrain, 'road:lot', p.rings, { lift: 0.12, tile: 2, color: [1, 1, 1], most: 12 });
  }
  // Walls that hold the ground up.
  for (const w of data.infrastructure) {
    if (!w.line || w.class !== 'retaining_wall') continue;
    const edge = w.line.map(([x, z]) => [x, terrain.heightAt(x, z) + 1.0, z]);
    skirt(builder, 'road:concrete', edge, 1.2, { tile: 3, color: [0.8, 0.78, 0.74], collide: true });
    skirt(builder, 'road:concrete', edge, 1.2, { tile: 3, color: [0.8, 0.78, 0.74], flip: true, collide: true });
  }

  // The streets.
  // The skywalks (walkways held up between buildings) are known by running into buildings.
  // A footbridge's span over a street is mapped as a crosswalk that is a bridge: it is laid as the footbridge it is
  // (its deck over the street, between its ramps), not as zebra stripes on the street under it.
  data = { ...data, roads: data.roads.map((r) => (r.subclass === 'crosswalk' && rangesOf(r).length ? { ...r, subclass: 'footbridge' } : r)) };
  // The Riverwalk is a broad walk (the map gives it a footpath's width, 1.6 m), and so is a footbridge over the river
  // (the Gillett Bridge's long span): both laid 3.5 m wide.
  const RIVERWALK = /Riverwalk/i;
  // (Over the river: the middle of one of its bridged stretches is over water. A path, not a footway: a footway over the
  // river is a bridge's sidewalk, beside its road.)
  const pointAt = (line, f) => {
    let L = 0; for (let i = 1; i < line.length; i++) L += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
    let want = f * L;
    for (let i = 1; i < line.length; i++) {
      const l = Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
      if (want <= l) return [line[i - 1][0] + (line[i][0] - line[i - 1][0]) * (want / l), line[i - 1][1] + (line[i][1] - line[i - 1][1]) * (want / l)];
      want -= l;
    }
    return line.at(-1);
  };
  const overRiver = (r) => terrain.waterLevel !== null && rangesOf(r).some(([a, b]) => { const [x, z] = pointAt(r.line, (a + b) / 2); return terrain.heightAt(x, z) < terrain.waterLevel; });
  data = { ...data, roads: data.roads.map((r) => ((r.class === 'footway' || r.class === 'path') && !r.width && (RIVERWALK.test(r.name ?? '') || (r.class === 'path' && overRiver(r))) ? { ...r, width: [{ value: 3.5 }] } : r)) };
  // A footbridge over the river whose end meets nothing (the map stops the Gillett Bridge at the water's edge, its deck
  // high over the walk beneath) goes on the way it was going, up the bank until it is about to meet a building or
  // 25 m on, so it comes down onto the ground there instead of stopping in the air. Its bridged stretches, as fractions
  // of its length, are kept where they were.
  {
    const ends = [];
    for (const r of data.roads) if (r.line.length > 1) ends.push(r.line[0], r.line.at(-1));
    const met = (p, self) => ends.some((q) => q !== self && Math.hypot(q[0] - p[0], q[1] - p[1]) < 6);
    const near = (x, z) => data.buildings.some((b) => { const o = b.rings?.[0]; return o && Math.abs(o[0][0] - x) < 400 && Math.abs(o[0][1] - z) < 400 && inside(b.rings, x, z); });
    const lengthOf = (line) => { let L = 0; for (let i = 1; i < line.length; i++) L += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]); return L; };
    data = { ...data, roads: data.roads.map((r) => {
      if (r.class !== 'path' || !overRiver(r)) return r;
      let line = r.line.slice();
      const L0 = lengthOf(line);
      let head = 0;
      for (const atEnd of [false, true]) {
        const p = atEnd ? line.at(-1) : line[0], q = atEnd ? line.at(-2) : line[1];
        if (met(p, atEnd ? r.line.at(-1) : r.line[0])) continue;
        const l = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1, ux = (p[0] - q[0]) / l, uz = (p[1] - q[1]) / l;
        let d = 0;
        while (d < 25 && !near(p[0] + ux * (d + 2.5), p[1] + uz * (d + 2.5))) d += 1;
        if (d < 2) continue;
        const e = [p[0] + ux * d, p[1] + uz * d];
        if (atEnd) line.push(e); else { line.unshift(e); head = d; }
      }
      const L1 = lengthOf(line);
      if (L1 === L0) return r;
      const map = (f) => (head + f * L0) / L1;
      const remap = (rules) => (Array.isArray(rules) ? rules.map((x) => (x.between ? { ...x, between: x.between.map(map) } : x)) : rules);
      return { ...r, line, flags: remap(r.flags), level: remap(r.level), surface: remap(r.surface) };
    }) };
  }
  const sky = skywalks(data.roads, buildingIndex(data.buildings));
  const bridges = lay(builder, terrain, data.roads, { sky });
  if (terrain.waterLevel !== null) riverwalkWall(builder, terrain, data.roads.filter((r) => RIVERWALK.test(r.name ?? '')));
  dress(builder, bridges, terrain, groundRoads(data.roads, bridges.decks, buildingIndex(data.buildings)));

  // In a tile, the water that stands higher than the river downtown (the ocean's level): a lake on a hill, the river
  // above a dam. Each is a plane at its own level, or, for a river, on its surface as it falls.
  if (tile) {
    for (const w of data.water) {
      if (!w.own?.length || w.subtype === 'swimming_pool' || w.class === 'swimming_pool') continue;
      const at = w.level != null ? () => w.level : terrain.surface;
      for (const rings of w.own) {
        const [x, z] = rings[0][0];
        if (at(x, z) < terrain.waterLevel + 0.4) continue;
        drape(builder, { heightAt: (px, pz) => at(px, pz) - 0.15 }, 'water', rings, { lift: 0, tile: 8, color: [1, 1, 1], most: 40 });
      }
    }
  }
  // The river, as a flat plane, when the engine's ocean is not the water (`flatWater`).
  if (terrain.waterLevel !== null && data.flatWater) {
    for (const w of data.water) {
      if (!w.rings || w.subtype === 'swimming_pool') continue;
      drape(builder, { heightAt: () => terrain.waterLevel }, 'water', w.rings, { lift: -0.1, tile: 8, color: [1, 1, 1], most: 40 });
    }
  }

  // The buildings; in a tile, those with a shop, a bar or a restaurant in them dressed as a main street's, with signs.
  if (data.places) boards = shopfronts(data.buildings, data.places, data.roads);
  // Every other footprint is built as its kind of building in Rivertown's designs (rt/buildings.js), on 3d-city's
  // ground; they work in Blender's frame (x east, y north), so a point (x, z) here is (x, -z) there.
  // Their full detail is made a cell at a time as the camera comes near (builder.designs, for scene.js): here now
  // only their far versions.
  const designs = new Designs({ ground: (x, y) => terrain.heightAt(x, -y), streetDir: towardStreet(data.roads), creative: Boolean(tile), lazy: new Map() });
  builder.designs = { cells: designs.lazy, make: (entries) => designs.detail(entries), range: 'hi', one: true, shells: designs.shells };
  const placesAt = placeIndex(data.places ?? []);
  const boarded = new Set(boards.map((s) => s.b));
  data.buildings.forEach((b, i) => {
    if (b.id === STAGE_ID) return;
    if (b.name === MARKET) { downtownMarket(builder, terrain, b, data.lidar?.[b.id], i); return; }
    if (b.id === STATION.canopy) { stationCanopy(builder, terrain, b); return; }
    if (b.name === 'DeVos Place Convention Center' && b.rings?.[0]) { devosPlace(builder, (x, y) => terrain.heightAt(x, -y), b.rings[0]); return; }
    const outer = b.rings?.[0];
    if (!outer || outer.length < 3) return;
    if (!b.id) b = { ...b, id: `${tile?.key ?? 'core'}_${i}` };
    const [names, near] = placesAt(outer);
    designs.build(builder, { ...b, measured: data.lidar?.[b.id], boarded: boarded.has(data.buildings[i]), greenRoof: b.id === STATION.terminal }, names, near);
  });
  if (boards.length) signs(builder, terrain, boards, tile?.key ?? 'core', (b) => footOf(terrain, b));

  // The places that are more than a footprint: Rosa Parks Circle, the art museum's porch, the planetarium, the Calder.
  if (!tile && !bare) {
    rosaParks(builder, terrain);
    museumPorch(builder, terrain, data.buildings);
    museumDomes(builder, terrain, data.buildings, data.lidar);
    fordGrave(builder, terrain);
    // La Grande Vitesse and DeVos Place's river hall as Rivertown modeled them (rt/landmarks.js).
    const groundAt = (x, y) => terrain.heightAt(x, -y);
    designVitesse(builder, groundAt);
    devosHall(builder, groundAt);
    amwayStadium(builder, terrain);
    acrisureAmphitheater(builder, terrain);
  }

  const [x0, z0, x1, z1] = own;

  // The lamps along the streets.
  lamps(builder, terrain, data.roads, data.buildings, tile ? { bounds: [x0, z0, x1, z1], core: 0 } : {});

  // The trees, standing about Rosa Parks Circle and everywhere else the lidar saw a crown; in a tile, where trees
  // would grow there: thick in the parks and the woods, along the streets and in the yards, few where it is paved.
  // Nor on a drawn road, car park or brick street (kept off the roads' lines by their width alone, a tree still
  // stood where the asphalt reaches further, at junctions, and on car parks and brick streets).
  dropFloating(builder, terrain);
  const onPavement = surfaceOf(builder, ['road:asphalt', 'road:lot', 'ground:pavers']);
  const roadsBlock = blockedBy(data.roads, buildingIndex(data.buildings));
  const blocked = (x, z) => roadsBlock(x, z) || onPavement(x, z) !== null;
  if (data.trees) {
    plant(builder, terrain, data.trees, { near: ROSA_PARKS.centre, blocked: (x, z) => inRosaParks(x, z) || Math.hypot(x - FORD_GRAVE[0], z - FORD_GRAVE[1]) < 8 || blocked(x, z) });
  } else if (tile) {
    plant(builder, terrain, scatterTrees(terrain, data, built, hole, tile.box), { blocked });
  }

  // The edge of the world: a wall all the way round, so the ball stays in (when there is nothing round it).
  if (alone) {
    const wall = (ax, az, bx, bz) => {
      const lo = -20, hi = 120;
      builder.collide([ax, lo, az], [bx, lo, bz], [bx, hi, bz]);
      builder.collide([ax, lo, az], [bx, hi, bz], [ax, hi, az]);
    };
    wall(x0, z0, x1, z0); wall(x1, z0, x1, z1); wall(x1, z1, x0, z1); wall(x0, z1, x0, z0);
  }

  // What the tile's sign atlas is to say: each board's name, kind and slot.
  const signed = boards.map(({ name, kind, slot, used }) => ({ name, kind, slot, used }));
  return { builder, terrain, bridges, bounds: { x0, x1, z0, z1 }, signs: signed };
}

/** How far past a tile's `box` its streets, paths and buildings reach, in whole 8 m cells (at most 1.2 km). */
function padOf(data, [x0, z0, x1, z1]) {
  let out = 0;
  const see = (x, z) => { out = Math.max(out, x0 - x, x - x1, z0 - z, z - z1); };
  for (const r of data.roads) if (r.line) for (const [x, z] of r.line) see(x, z);
  for (const b of data.buildings) for (const [x, z] of b.rings[0]) see(x, z);
  return Math.ceil(Math.min(1200, out + 16) / 8) * 8;
}

/** How likely a tree is on a patch of each kind of land, per point of a 16 m grid. */
const WOODED = { forest: 0.85, wood: 0.85, park: 0.32, cemetery: 0.3, golf_course: 0.12, nature_reserve: 0.7, recreation_ground: 0.1, grass: 0.12, meadow: 0.05, wetland: 0.3, scrub: 0.4 };

/**
 * Trees for ground the lidar was not flown over: on a jittered grid, more in the parks and woods (the map's land
 * use and land cover), a fair few in the yards of the houses, few in the car parks and the fields. In the
 * format scripts/trees.py writes: [x, z, height, crown radius, conifer?, r, g, b].
 */
function scatterTrees(terrain, data, built, hole, [ax0, az0, ax1, az1]) {
  const g = data.green;
  const greenAt = g ? (x, z) => (g.green[Math.max(0, Math.min(g.rows - 1, Math.floor((z - g.z0) / g.step)))]?.[Math.max(0, Math.min(g.cols - 1, Math.floor((x - g.x0) / g.step)))] ?? 0) / 100 : null;
  const step = 16, out = [];
  const patches = [...data.landuse, ...data.land].filter((l) => l.rings && WOODED[l.class ?? l.subtype] !== undefined).map((l) => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of l.rings[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    return { l, p: WOODED[l.class] ?? WOODED[l.subtype], x0, x1, z0, z1 };
  });
  const water = data.water.filter((w) => w.rings);
  for (let z = az0 + step / 2; z < az1; z += step) {
    for (let x = ax0 + step / 2; x < ax1; x += step) {
      const seed = `${Math.round(x)},${Math.round(z)}`;
      const px = x + (unit(`${seed}x`) - 0.5) * step, pz = z + (unit(`${seed}z`) - 0.5) * step;
      if (hole && px > hole[0] && px < hole[2] && pz > hole[1] && pz < hole[3]) continue;
      let p = null;
      for (const q of patches) if (px >= q.x0 && px <= q.x1 && pz >= q.z0 && pz <= q.z1 && inside(q.l.rings, px, pz)) p = Math.max(p ?? 0, q.p);
      const density = built(px, pz);
      // The yards of a neighbourhood of houses are full of trees; downtown and the industrial parks are not.
      if (p === null) p = density > 0.02 && density < 0.2 ? 0.22 : density >= 0.2 ? 0.04 : 0.08;
      // The aerial photo, where it is to hand: few trees where it shows paving, more where it shows green.
      if (greenAt) { const g = greenAt(px, pz); p = g < 0.2 ? p * 0.15 : g > 0.6 ? Math.max(p, 0.26) : p; }
      if (unit(`${seed}t`) > p) continue;
      if (terrain.heightAt(px, pz) < terrain.waterLevel + 0.5 || water.some((w) => inside(w.rings, px, pz))) continue;
      const conifer = unit(`${seed}c`) < 0.18 ? 1 : 0;
      const h = 8 + unit(`${seed}h`) * 13, rad = conifer ? 2 + unit(`${seed}r`) * 1.5 : 2.6 + unit(`${seed}r`) * 3.2;
      const g = 104 + unit(`${seed}g`) * 30;
      out.push([px, pz, h, rad, conifer, 84 + unit(`${seed}rr`) * 20, g, 66 + unit(`${seed}bb`) * 14]);
    }
  }
  return out;
}

/**
 * The Riverwalk's flood wall: where the walk runs along the river (not on its own piers, which ground.js dresses), it is
 * paved out from its edge to the water, and there a white concrete wall drops into the river under a steel rail. (The map
 * draws the walk a few metres up the bank; downtown it is a promenade on the wall.)
 *
 * Built whole along each unbroken run of the walk, not a piece at a time: the walk is sampled every 2 m, the distance
 * from each sample to the water found (gaps filled from the samples either side, then smoothed), and one paving strip,
 * one wall and one rail laid along the run, so there is no gap between pieces and the edge does not zigzag.
 */
function riverwalkWall(builder, terrain, roads) {
  const water = terrain.waterLevel, wet = (x, z) => terrain.heightAt(x, z) < water + 0.3;
  const pale = [0.93, 0.92, 0.9], steel = [0.22, 0.24, 0.26];
  const STEP = 2, FAR = 30;
  const smooth = (v, k) => v.map((_, i) => {
    let sum = 0, n = 0;
    for (let j = Math.max(0, i - k); j <= Math.min(v.length - 1, i + k); j++) { sum += v[j]; n++; }
    return sum / n;
  });
  const median = (v, k) => v.map((_, i) => {
    const w = v.slice(Math.max(0, i - k), Math.min(v.length, i + k + 1)).sort((a, b) => a - b);
    return w[w.length >> 1];
  });
  for (const r of roads) {
    const hw = widthOf(r) / 2, ranges = rangesOf(r);
    const pts = sampleLine(r.line, STEP);
    let total = 0;
    const along = [0];
    for (let i = 1; i < pts.length; i++) { total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); along.push(total); }
    if (total < 6) continue;
    // The unbroken runs: not on a bridge's span, and not in the water.
    const ok = pts.map(([x, z], i) => !wet(x, z) && !ranges.some(([p, q]) => along[i] / total >= p - 0.004 && along[i] / total <= q + 0.004));
    for (let i = 0; i < pts.length;) {
      if (!ok[i]) { i++; continue; }
      let j = i;
      while (j + 1 < pts.length && ok[j + 1]) j++;
      if (j - i >= 3) riverRun(pts.slice(i, j + 1), hw);
      i = j + 1;
    }
  }

  /** One unbroken run of the walk: its paving, its wall and its rail. */
  function riverRun(raw, hw) {
    const n = raw.length;
    // The walk's line with its kinks eased (its ends kept), so its edges do not leave wedges at the corners.
    const run = raw.map((p, i) => {
      if (i === 0 || i === n - 1) return p;
      let x = 0, z = 0, c = 0;
      for (let j = Math.max(0, i - 2); j <= Math.min(n - 1, i + 2); j++) { x += raw[j][0]; z += raw[j][1]; c++; }
      return [x / c, z / c];
    });
    const tan = run.map((p, i) => {
      const a = run[Math.max(0, i - 1)], b = run[Math.min(n - 1, i + 1)];
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      return [dx / l, dz / l];
    });
    // How far out the water is, on each side, from every sample (null if none within FAR).
    const reach = (sgn) => run.map(([x, z], i) => {
      const nx = -tan[i][1] * sgn, nz = tan[i][0] * sgn;
      for (let d = hw; d <= hw + FAR; d += 0.5) if (wet(x + nx * d, z + nz * d)) return d;
      return null;
    });
    const sides = [1, -1].map((sgn) => ({ sgn, d: reach(sgn) }));
    // The river's side is the one that finds the water at more of the samples (and, then, nearer).
    sides.sort((p, q) => q.d.filter((v) => v !== null).length - p.d.filter((v) => v !== null).length);
    const { sgn, d: found } = sides[0];
    if (found.filter((v) => v !== null).length < n * 0.4) return;
    // Gaps filled from the nearest found distance either side, then the run's distances evened out.
    const dist = found.slice();
    for (let i = 0; i < n; i++) {
      if (dist[i] !== null) continue;
      let lo = i - 1, hi = i + 1;
      while (lo >= 0 && found[lo] === null) lo--;
      while (hi < n && found[hi] === null) hi++;
      dist[i] = lo >= 0 && hi < n ? found[lo] + (found[hi] - found[lo]) * ((i - lo) / (hi - lo)) : found[lo >= 0 ? lo : hi];
    }
    // The wall stands at the water, never inland of it (a wedge of bank would show outside): the distances are spread
    // outward to cover a jag, then evened out, and never less than what was found.
    const reachOut = median(dist, 4).map((_, i, v) => Math.max(...v.slice(Math.max(0, i - 4), i + 5)));
    const smoothed = smooth(smooth(reachOut, 5), 4);
    const out = dist.map((d, i) => Math.max(hw + 0.6, smoothed[i], d) + 0.3);
    const norm = (i) => [-tan[i][1] * sgn, tan[i][0] * sgn];
    const inner = [], outer = [], walk = [];
    const top = run.map(([x, z], i) => {
      const [nx, nz] = norm(i);
      inner.push([x - nx * hw, 0, z - nz * hw]);
      outer.push([x + nx * out[i], 0, z + nz * out[i]]);
      // Where the walk's own edge is, and the highest ground (over the mesh's triangles) from there out to the wall: the deck is one
      // level right across, over all of it.
      const edgeY = terrain.over(x - nx * hw, z - nz * hw, 0.16, 0.08);
      walk.push(edgeY);
      let y = edgeY;
      for (let d = -hw; d <= out[i]; d += 1) for (const o of [-1, 0, 1]) y = Math.max(y, terrain.over(x + nx * d + tan[i][0] * o, z + nz * d + tan[i][1] * o, 0.3, 0.08));
      return y;
    });
    // Changes only gently along the run: never lowered to follow a dip, raised to clear a hump.
    const rail = smooth(smooth(top, 2), 2).map((y, i) => Math.max(y, top[i]));
    for (let i = 0; i < n; i++) { inner[i][1] = rail[i]; outer[i][1] = rail[i]; }
    let u = 0;
    for (let i = 0; i < n - 1; i++) {
      const a = inner[i], b = inner[i + 1], c = outer[i + 1], d = outer[i];
      const l = Math.hypot(b[0] - a[0], b[2] - a[2]);
      // Faced up whichever side it is on.
      const up = ((b[0] - a[0]) * (d[2] - a[2]) - (b[2] - a[2]) * (d[0] - a[0])) < 0;
      const q = up ? [a, b, c, d] : [a, d, c, b];
      builder.quad('road:sidewalk', q[0], q[1], q[2], q[3], [q[0][0] / 3, q[0][2] / 3], [q[1][0] / 3, q[1][2] / 3], [q[2][0] / 3, q[2][2] / 3], [q[3][0] / 3, q[3][2] / 3], [1, 1, 1], [0, 1, 0]);
      builder.collide(q[0], q[1], q[2]); builder.collide(q[0], q[2], q[3]);
      u += l;
    }
    // The wall at the water, faced out over it (skirt faces the left of its edge), and its rail.
    const edge = outer, drops = rail.map((y) => y - water + 1);
    const flip = (-(edge[n - 1][2] - edge[0][2]) * norm(0)[0] + (edge[n - 1][0] - edge[0][0]) * norm(0)[1]) < 0;
    skirt(builder, 'M_Precast', edge, drops, { tile: 3, color: pale, flip });
    skirt(builder, 'prop:steel', edge, -1.05, { tile: 3, color: steel, flip });
    skirt(builder, 'prop:steel', edge, -1.05, { tile: 3, color: steel, flip: !flip });
    // Where the deck stands above the walk's own edge, a curb down to it, facing the walk.
    const step = rail.map((y, i) => Math.max(0, y - walk[i] + 0.05));
    if (step.some((d) => d > 0.06)) skirt(builder, 'road:sidewalk', inner, step, { tile: 3, color: [0.92, 0.9, 0.86], flip: !flip, collide: true });
  }
}
