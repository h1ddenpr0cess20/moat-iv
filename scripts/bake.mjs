// Bakes a window of downtown Grand Rapids (from the 3d-city map data) into one small file the game loads:
//   node scripts/bake.mjs <3d-city/public/data> [cx cz] [out dir]   (the middle: the Amway Grand Hotel is at -501 -301)   (writes grand-rapids.json and parcels.json)
// Coordinates are meters from the middle of 3d-city's map (x east, z south). One tile is TILE meters.
import { readFileSync, writeFileSync } from 'node:fs';

const dir = process.argv[2];
const CX = +(process.argv[3] ?? 0), CZ = +(process.argv[4] ?? 0);
const TILE = 6.4, SIZE = 210;
const OUT = process.argv[5] ?? 'src/data';
const X0 = CX - (SIZE * TILE) / 2, Z0 = CZ - (SIZE * TILE) / 2;
const read = (f) => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));

// Point in polygon (rings: first is the outer, the rest holes).
function inside(rings, x, z) {
  let c = false;
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, zi] = r[i], [xj, zj] = r[j];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
    }
  }
  return c;
}
const bbox = (rings) => {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const r of rings) for (const [x, z] of r) { a = Math.min(a, x); b = Math.min(b, z); c = Math.max(c, x); d = Math.max(d, z); }
  return [a, b, c, d];
};
/** Calls f(tx, ty) for each tile whose middle is inside the polygon. */
function fill(rings, f) {
  const [a, b, c, d] = bbox(rings);
  const tx0 = Math.max(0, Math.floor((a - X0) / TILE)), tx1 = Math.min(SIZE - 1, Math.floor((c - X0) / TILE));
  const ty0 = Math.max(0, Math.floor((b - Z0) / TILE)), ty1 = Math.min(SIZE - 1, Math.floor((d - Z0) / TILE));
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) if (inside(rings, X0 + (tx + 0.5) * TILE, Z0 + (ty + 0.5) * TILE)) f(tx, ty);
}

// Water, and what the land is.
const water = Array.from({ length: SIZE }, () => new Array(SIZE).fill('0'));
for (const w of read('water.json')) if (w.rings && w.class !== 'swimming_pool') for (const r of [w.rings]) fill(r, (x, y) => { water[y][x] = '1'; });

const KIND = { park: 'p', grass: 'g', pitch: 's', playground: 's', recreation_ground: 's', track: 's', garden: 'g', dog_park: 'p', university: 'u', school: 'k', schoolyard: 'k', hospital: 'h', pedestrian: 'z', industrial: 'i', residential: 'r', construction: 'c', railway: 'w' };
const land = Array.from({ length: SIZE }, () => new Array(SIZE).fill('.'));
const parks = [];
const order = ['r', 'i', 'c', 'w', 'k', 'u', 'h', 'g', 'z', 's', 'p'];
const lu = read('landuse.json').filter((l) => l.rings && KIND[l.class]).sort((a, b) => order.indexOf(KIND[a.class]) - order.indexOf(KIND[b.class]));
for (const l of lu) {
  const k = KIND[l.class];
  let n = 0, sx = 0, sy = 0;
  fill(l.rings, (x, y) => { if (water[y][x] === '0') { land[y][x] = k; n++; sx += x; sy += y; } });
  if (l.name && n > 6) parks.push({ name: l.name, x: Math.round(sx / n), y: Math.round(sy / n), tiles: n, kind: k });
}

// Parcels: where a building stood, and what it was. Landmarks keep their names.
const USE = { house: 'h', townhouse: 't', apartments: 'a', office: 'o', shop: 's', restaurant: 'r', bar: 'b', hotel: 'H', church: 'c', school: 'k', university: 'u', hospital: 'm', civic: 'v', industrial: 'i', warehouse: 'w', garage: 'g', parking: 'P', shed: 'g', stadium: 'S', station: 'T', mixed: 'x' };
const parcel = Array.from({ length: SIZE }, () => new Array(SIZE).fill('.'));
const landmarks = [];
for (const b of read('buildings.json')) {
  if (!b.rings || !b.rings[0]) continue;
  const [a, bb, c, d] = bbox(b.rings);
  if (c < X0 || a > X0 + SIZE * TILE || d < Z0 || bb > Z0 + SIZE * TILE) continue;
  const u = USE[b.use] ?? 'x';
  let n = 0, sx = 0, sy = 0;
  fill(b.rings, (x, y) => { if (water[y][x] === '0') { parcel[y][x] = u; n++; sx += x; sy += y; } });
  if (n && b.name && (b.height > 30 || n > 40) && !/parking|ramp|garage/i.test(b.name)) landmarks.push({ name: b.name, x: Math.round(sx / n), y: Math.round(sy / n), tiles: n, use: u, h: Math.round(b.height ?? 0) });
}

// Trees, from the lidar's crowns: how many stand on a tile.
const tree = Array.from({ length: SIZE }, () => new Array(SIZE).fill(0));
for (const t of read('trees.json')) {
  const tx = Math.floor((t[0] - X0) / TILE), ty = Math.floor((t[1] - Z0) / TILE);
  if (tx >= 0 && ty >= 0 && tx < SIZE && ty < SIZE) tree[ty][tx]++;
}

const seen = new Set();
const out = {
  note: 'Downtown Grand Rapids, Michigan: Overture Maps (ODbL/CDLA), USGS 3DEP lidar and SRTM, Kent County parcels; baked by scripts/bake.mjs from the 3d-city map.',
  center: [CX, CZ], tile: TILE, size: SIZE,
  water: water.map((r) => r.join('')),
  land: land.map((r) => r.join('')),
  parcel: parcel.map((r) => r.join('')),
  tree: tree.map((r) => r.map((n) => Math.min(9, n)).join('')),
  parks: parks.filter((p) => !seen.has(p.name) && seen.add(p.name)),
  landmarks: landmarks.filter((p) => { const k = p.name + p.x; return !seen.has(k) && seen.add(k); }).sort((a, b) => b.h - a.h).slice(0, 80),
};
writeFileSync(`${OUT}/grand-rapids.json`, JSON.stringify(out));

// The parcels: every real building worth a lot, with what it is, as 3d-city's designs build it. Coordinates stay in
// 3d-city's meters (x east, z south of the middle of its map), which its landmark and district tables are in.
const lidar = read('lidar.json');
const r1 = (n) => Math.round(n * 10) / 10;
const parcels = [];
for (const b of read('buildings.json')) {
  const ring = b.rings?.[0];
  if (!ring || ring.length < 4) continue;
  const [a, bb, c, d] = bbox(b.rings);
  if (a < X0 + TILE || c > X0 + SIZE * TILE - TILE || bb < Z0 + TILE || d > Z0 + SIZE * TILE - TILE) continue;
  if (['garage', 'shed'].includes(b.use) || ['roof', 'carport'].includes(b.class) || b.subtype === 'outbuilding') continue;
  if ((c - a) * (d - bb) < 45) continue;
  // The founder's tower stands in the middle of the map, on its island: the Amway Grand's own lot.
  if (Math.hypot((a + c) / 2 - CX, (bb + d) / 2 - CZ) < 56) continue;
  const m = lidar[b.id];
  const rec = { id: b.id, rings: b.rings.map((r) => r.map(([x, z]) => [r1(x), r1(z)])), use: b.use ?? 'mixed' };
  if (b.height) rec.height = r1(b.height);
  if (b.floors) rec.floors = b.floors;
  if (b.class) rec.class = b.class;
  if (b.subtype) rec.subtype = b.subtype;
  if (b.name) rec.name = b.name;
  if (m) rec.measured = { height: m.height, cover: m.cover, ...(m.parts ? { parts: m.parts.map(([lo, hi, ps]) => [lo, hi, ps.map((p) => p.map((r) => r.map(([x, z]) => [r1(x), r1(z)])))]) } : {}) };
  parcels.push(rec);
}
// The founder's tower: the Amway Grand Hotel, on the middle of the map.
const tower = read('buildings.json').find((b) => b.name === 'Amway Grand Hotel' && Math.hypot(bbox(b.rings)[0] - CX, bbox(b.rings)[1] - CZ) < 60);
if (tower) {
  const m = lidar[tower.id];
  writeFileSync(`${OUT}/tower.json`, JSON.stringify({ id: tower.id, name: tower.name, use: tower.use, height: tower.height, rings: tower.rings.map((r) => r.map(([x, z]) => [r1(x), r1(z)])), measured: m ? { height: m.height, cover: m.cover, ...(m.parts ? { parts: m.parts.map(([lo, hi, ps]) => [lo, hi, ps.map((p) => p.map((r) => r.map(([x, z]) => [r1(x), r1(z)])))]) } : {}) } : undefined, roof: tower.roof, floors: tower.floors }));
}
parcels.sort((p, q) => (p.id < q.id ? -1 : 1));
writeFileSync(`${OUT}/parcels.json`, JSON.stringify(parcels));
console.error(`${parcels.length} parcels`);
