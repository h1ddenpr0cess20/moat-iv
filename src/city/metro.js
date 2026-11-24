/**
 * The greater city round downtown: Walker and Grandville to East Grand Rapids and Cascade, Comstock Park to
 * Kentwood, in tiles of two kilometers (scripts/metro.py), each built as the ball comes near it and let go
 * when it is left behind. Downtown is a hole in the tiles: its own map is the detailed one.
 *
 * `buildTile` is pure maths on plain objects, like `buildCity`, so it runs in a worker (metro.worker.js).
 */
import { BASE } from './config.js';
import { buildCity } from './world.js';
import { Builder } from './builder.js';
import { driveRoads, driveLots } from './ground.js';

/** What every tile shares: the grid, the ground's heights, the river's surface, the ocean's level, downtown's hole. */
export function metroShared({ index, elevation, waterLevel, coreLevel, hole }) {
  const g = waterLevel;
  // The river's surface: the grid's heights above sea level, as meters above BASE; never below the ocean's.
  const surface = (x, z) => {
    const fx = Math.max(0, Math.min(g.cols - 1.001, (x - g.x0) / g.step)), fz = Math.max(0, Math.min(g.rows - 1.001, (z - g.z0) / g.step));
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, h = g.heights;
    const v = (h[j][i] * (1 - tx) + h[j][i + 1] * tx) * (1 - tz) + (h[j + 1][i] * (1 - tx) + h[j + 1][i + 1] * tx) * tz;
    return Math.max(coreLevel, v - BASE);
  };
  return { index, elevation, surface, level: coreLevel, hole };
}

/** The box of tile (i, j), in meters: [x0, z0, x1, z1]. */
export const tileBox = (index, i, j) => [index.x0 + i * index.tile, index.z0 + j * index.tile, index.x0 + (i + 1) * index.tile, index.z0 + (j + 1) * index.tile];

/**
 * Builds tile (i, j) from its data: the parts to draw (as `Builder.finish` gives them), the solid triangles
 * (Float32Array, meters), the trunks, the full trees by cell, and the named streets (for saying where the ball is).
 */
export function buildTile(data, i, j, shared) {
  const box = tileBox(shared.index, i, j);
  const city = buildCity({
    elevation: shared.elevation, water: data.water, landuse: data.landuse, land: data.land,
    infrastructure: data.infrastructure, roads: data.roads, buildings: data.buildings, green: data.green, places: data.places,
  }, { tile: { box, key: `${i},${j}`, level: shared.level, surface: shared.surface, hole: shared.hole }, alone: false });
  const solid = Float32Array.from(city.builder.solid);
  // How far the solid things reach past the tile (a building or a road whose middle is in it): the physics' patch.
  let x0 = box[0], z0 = box[1], x1 = box[2], z1 = box[3];
  for (let k = 0; k < solid.length; k += 3) {
    const x = solid[k], z = solid[k + 2];
    if (x < x0) x0 = x; else if (x > x1) x1 = x;
    if (z < z0) z0 = z; else if (z > z1) z1 = z;
  }
  const names = data.roads.filter((r) => r.name && r.subtype === 'road' && !r.ctx).map((r) => ({ name: r.name, line: r.line }));
  return {
    i, j, box, reach: [x0, z0, x1, z1],
    parts: city.builder.finish(), solid, trunks: city.builder.trunks,
    trees: [...(city.builder.fullTrees ?? new Map())], names,
    // Its buildings' full detail, made on the page's thread a cell at a time as the camera comes near.
    designs: [...(city.builder.designs?.cells ?? new Map())],
    shells: city.builder.designs?.shells ?? [],
    signs: city.signs,
    lamps: city.builder.lamps ?? [],
    // Its streets, for keeping a player on the roads (drive mode).
    drive: driveRoads(data.roads),
    lots: driveLots(data.infrastructure),
    // The ground's heights, for putting the ball down and pointing the camera.
    ground: { box, x0: city.terrain.x0, z0: city.terrain.z0, cell: city.terrain.cell, nx: city.terrain.nx, nz: city.terrain.nz, h: city.terrain.h },
  };
}

/** The buffers in a built tile, to hand from the worker without copying. */
export function transferables(tile) {
  const out = [tile.solid.buffer, tile.ground.h.buffer];
  for (const p of tile.parts) out.push(p.pos.buffer, p.nor.buffer, p.uv.buffer, p.col.buffer);
  return out;
}

/**
 * The far ground: the whole area's heights in coarse cells, a meter and a half under where a tile's ground will
 * be, so the horizon is land before the tiles there are built; one part per tile, hidden once its tile is.
 * Past the edge of the tiles it carries on for `reach` meters. Returns Map(key -> parts) ('i,j', and 'edge').
 */
export function backdrop(shared, { cell = 50, reach = 3000, far = null } = {}) {
  const { index, elevation, hole } = shared;
  const height = (x, z) => {
    const { x0, z0, step, cols, rows, heights } = elevation;
    const fx = Math.max(0, Math.min(cols - 1.001, (x - x0) / step)), fz = Math.max(0, Math.min(rows - 1.001, (z - z0) / step));
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    const v = (heights[j][i] * (1 - tx) + heights[j][i + 1] * tx) * (1 - tz) + (heights[j + 1][i] * (1 - tx) + heights[j + 1][i + 1] * tx) * tz;
    return Math.max(shared.level + 0.2, v - BASE) - 1.5;
  };
  const green = [[0.95, 1, 0.9], [1.02, 1.04, 0.96], [0.9, 0.95, 0.88]];
  const quad = (b, x, z, size) => {
    const p = (px, pz) => [px, height(px, pz), pz];
    const a = p(x, z), bb = p(x, z + size), c = p(x + size, z + size), d = p(x + size, z);
    const k = Math.abs(Math.round(x / size) * 7 + Math.round(z / size) * 13) % 3;
    b.quad('ground:turf', a, bb, c, d, [a[0] / 6, a[2] / 6], [bb[0] / 6, bb[2] / 6], [c[0] / 6, c[2] / 6], [d[0] / 6, d[2] / 6], green[k], [0, 1, 0]);
  };
  const out = new Map();
  const T = index.tile;
  for (let j = 0; j < index.nj; j++) for (let i = 0; i < index.ni; i++) {
    // One mesh per material for the whole tile: far off, a hundred and more tiles of it are drawn at once.
    const b = new Builder({ chunk: 4000 }), [x0, z0] = tileBox(index, i, j);
    for (let z = z0; z < z0 + T - 1e-6; z += cell) for (let x = x0; x < x0 + T - 1e-6; x += cell) {
      if (x + cell > hole[0] && x < hole[2] && z + cell > hole[1] && z < hole[3]) continue;
      quad(b, x, z, cell);
    }
    const f = far?.[`${i},${j}`];
    if (f) farCity(b, f, height);
    out.set(`${i},${j}`, b.finish());
  }
  const b = new Builder({ chunk: 12000 }), X0 = index.x0, Z0 = index.z0, X1 = X0 + index.ni * T, Z1 = Z0 + index.nj * T, big = cell * 4;
  for (let z = Z0 - reach; z < Z1 + reach; z += big) for (let x = X0 - reach; x < X1 + reach; x += big) {
    if (x >= X0 && x + big <= X1 && z >= Z0 && z + big <= Z1) continue;
    quad(b, x, z, big);
  }
  out.set('edge', b.finish());
  return out;
}

/** What the far city's buildings are: a wall's color and a roof, by kind (houses, flats, shops, works, offices). */
const KINDS = [
  { wall: [0.95, 0.9, 0.82], roof: 'ground:shingles-charcoal' },
  { wall: [0.85, 0.66, 0.55], roof: 'ground:membrane-gray' },
  { wall: [0.9, 0.88, 0.84], roof: 'ground:membrane-white' },
  { wall: [0.78, 0.8, 0.82], roof: 'ground:membrane-gray' },
  { wall: [0.75, 0.82, 0.9], roof: 'ground:gravel-roof' },
];
const ROAD_WIDTH = [12, 10, 8, 6.5];

/**
 * The city as seen from afar (scripts/metro.py `far`): each building a box its size and height on the far ground,
 * each main road a dark strip; few triangles, for the tiles not built yet.
 */
function farCity(b, { b: boxes, r: roads }, height) {
  for (let k = 0; k < boxes.length; k += 7) {
    const [x, z, w, d, a, h, kind] = boxes.slice(k, k + 7);
    const c = Math.cos(a), s = Math.sin(a), y0 = height(x, z), y1 = y0 + 1.5 + h;
    const P = (u, v, y) => [x + c * u - s * v, y, z + s * u + c * v];
    const corners = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
    const { wall, roof } = KINDS[kind] ?? KINDS[1];
    for (let n = 0; n < 4; n++) {
      const [u0, v0] = corners[n], [u1, v1] = corners[(n + 1) % 4];
      const A = P(u0, v0, y0), B = P(u1, v1, y0), C = P(u1, v1, y1), D = P(u0, v0, y1);
      const nx = (v1 - v0), nz = -(u1 - u0), l = Math.hypot(nx, nz) || 1;
      const nrm = [(c * nx - s * nz) / l, 0, (s * nx + c * nz) / l];
      // The rectangle runs counter to the way a footprint's ring does: wound from B to A, it faces out.
      b.quad('wall:stucco', B, A, D, C, [0, 0], [1, 0], [1, 1], [0, 1], wall, nrm.map((v) => -v));
    }
    const [A, B, C, D] = corners.map(([u, v]) => P(u, v, y1));
    b.quad(roof, A, D, C, B, [A[0] / 3, A[2] / 3], [D[0] / 3, D[2] / 3], [C[0] / 3, C[2] / 3], [B[0] / 3, B[2] / 3], [0.9, 0.9, 0.9], [0, 1, 0]);
  }
  for (const [kind, ...xy] of roads) {
    const half = ROAD_WIDTH[kind] / 2;
    for (let k = 0; k + 3 < xy.length; k += 2) {
      const ax = xy[k], az = xy[k + 1], bx = xy[k + 2], bz = xy[k + 3];
      const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, nx = -dz / l * half, nz = dx / l * half;
      const p = (x, z) => [x, height(x, z) + 0.25, z];
      const A = p(ax + nx, az + nz), B = p(bx + nx, bz + nz), C = p(bx - nx, bz - nz), D = p(ax - nx, az - nz);
      b.quad('road:asphalt', A, B, C, D, [A[0] / 4, A[2] / 4], [B[0] / 4, B[2] / 4], [C[0] / 4, C[2] / 4], [D[0] / 4, D[2] / 4], kind === 0 ? [0.8, 0.8, 0.82] : [0.95, 0.95, 0.95], [0, 1, 0]);
    }
  }
}
