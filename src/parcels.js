import parcelData from './data/parcels.json' with { type: 'json' };
import { LOOKS } from './city/rt/looks.js';
import tower from './data/tower.json' with { type: 'json' };
import gr from './data/grand-rapids.json' with { type: 'json' };

/**
 * The parcels: every real building of the mapped stretch of downtown Grand
 * Rapids, as a lot for the city to build on again. Each keeps the footprint,
 * height, use and name the real building has, and is drawn in 3d-city's own
 * design for that kind of building (see render/design.js). A parcel is a
 * building type of its own (`lot0`, `lot1`, ...), so the simulation counts its
 * homes, jobs and shoppers like any other building's.
 *
 * Positions in the data are 3d-city's meters (x east, z south of the middle of
 * its map); the game's tiles are TILE meters and its (0, 0) is ORIGIN.
 */

/** The founder's tower: the real Amway Grand Hotel, on the middle of the map. */
export const TOWER = tower;
export const TILE = gr.tile;
export const ORIGIN = [gr.center[0] - (gr.size * gr.tile) / 2, gr.center[1] - (gr.size * gr.tile) / 2];

/** A point in the data's meters from a point in tiles, and the other way. */
export const toMeters = (x, y) => [ORIGIN[0] + x * TILE, ORIGIN[1] + y * TILE];
export const toTiles = (mx, mz) => [(mx - ORIGIN[0]) / TILE, (mz - ORIGIN[1]) / TILE];

function inside(ring, x, z) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

const HOUSES = ['house', 'townhouse'];
const HOMES = ['apartments'];
const SHOPS = ['shop', 'restaurant', 'bar', 'office', 'hotel', 'parking', 'mixed'];
const WORKS = ['industrial', 'warehouse'];
/** Uses that are the city's own (schools, hospitals, churches, the museums): sites for the Build tool, not zoned growth. */
export const SITE_USES = ['civic', 'church', 'school', 'university', 'hospital', 'stadium', 'station'];

const LABEL = {
  house: 'House', townhouse: 'Townhouses', apartments: 'Apartments', mixed: 'Shops and flats', shop: 'Shop', restaurant: 'Restaurant', bar: 'Tavern',
  office: 'Office building', hotel: 'Hotel', parking: 'Parking ramp', industrial: 'Factory', warehouse: 'Warehouse', civic: 'Civic building',
  church: 'Church', school: 'School', university: 'College building', hospital: 'Hospital', stadium: 'Arena', station: 'Station',
};

const DEFAULT_H = { house: 7, townhouse: 9, apartments: 12, mixed: 12, shop: 6, restaurant: 5, bar: 5, office: 14, hotel: 20, parking: 12, industrial: 9, warehouse: 8, civic: 12, church: 13, school: 9, university: 14, hospital: 18, stadium: 20, station: 8 };

/** A real building's height, as 3d-city's designs read it. */
export function heightOf(b) {
  const m = b.measured;
  if (m && (m.cover ?? 0) >= 0.25 && (m.height ?? 0) >= 2.5) return +m.height;
  if (b.height && b.height > 1.5) return +b.height;
  if (b.floors) return 3.6 * b.floors;
  return DEFAULT_H[b.use] ?? 8;
}

/** The zone a use grows on, or null for the city's own. */
export function zoneOfUse(use, h) {
  if (HOUSES.includes(use)) return 'res';
  if (HOMES.includes(use)) return 'dense';
  if (SHOPS.includes(use)) return 'com';
  if (WORKS.includes(use)) return 'ind';
  void h;
  return null;
}

/**
 * What a named building does for the city that raises it again: the same as the city's own kinds of building did (a
 * school teaches, a hospital heals, a police station keeps the peace, a museum or an arena cheers and draws visitors),
 * and the jobs its size holds. `mass` is its footprint's tiles times its stories.
 */
/** What the city's own building of each kind costs: a named one is priced from it. */
const BASE_COST = { police: 60, fire: 60, library: 40, museum: 90, school: 90, university: 320, hospital: 180, stadium: 420, church: 70, station: 140, hotel: 120, civic: 100 };
function effectsOf(b, h, mass) {
  const name = b.name ?? '', use = b.use;
  const out = { cost: { gold: Math.round(mass * 2.2 + 40) }, weeks: 4 + Math.round(Math.sqrt(mass) / 1.2), crew: mass > 60 ? 5 : 3, jobs: Math.round(mass * 0.3) + 3 };
  let note = '';
  if (/police/i.test(name)) { out.serve = { security: 1, radius: 14 }; out.upkeep = 1.6; note = 'Keeps crime down within fourteen tiles.'; }
  else if (/fire station/i.test(name)) { out.serve = { fire: 1, radius: 14 }; out.upkeep = 1.4; note = 'Fires start less and are put out sooner within fourteen tiles.'; }
  else if (/library/i.test(name)) { out.serve = { education: 0.6, cheer: 0.2, radius: 10 }; out.upkeep = 0.6; note = 'Some of what a school does.'; }
  else if (/museum|art museum|theater|theater/i.test(name)) { out.serve = { cheer: 0.8, radius: 12 }; out.bonus = { tourism: 2 }; out.upkeep = 1; note = 'Cheers the people near it and draws visitors.'; }
  else if (use === 'school') { out.serve = { education: 1, radius: 14 }; out.upkeep = 1.8; note = 'Educated people want better homes and bring better firms.'; }
  else if (use === 'university') { out.serve = { education: 1, radius: 20 }; out.upkeep = 2.5; out.bonus = { tax: { com: 0.04 }, growth: 0.04 }; note = 'Educates a wide circle.'; }
  else if (use === 'hospital') { out.serve = { health: 1, radius: 18 }; out.upkeep = 3; note = 'Healthier people, who live longer and stay.'; }
  else if (use === 'stadium') { out.serve = { cheer: 1, radius: 20 }; out.bonus = { tourism: 4, mood: 3 }; out.upkeep = 3; out.noisy = 0.3; note = 'Cheers a wide circle and fills with visitors on game day.'; }
  else if (use === 'church') { out.serve = { cheer: 0.5, radius: 9 }; out.upkeep = 0.3; out.jobs = 2; note = 'A congregation, and a steeple to see from the street.'; }
  else if (use === 'station') { out.serve = { cheer: 0.2, radius: 8 }; out.bonus = { tourism: 2 }; out.upkeep = 1; note = 'Brings visitors in by train.'; }
  else if (use === 'hotel') { out.bonus = { tourism: 1.5 }; out.upkeep = 0.5; note = 'Visitors stay here and spend in the city.'; }
  else if (use === 'civic') { out.serve = { cheer: 0.4, education: 0.2, radius: 12 }; out.upkeep = 0.8; note = 'A building the city is proud of.'; }
  else if (['office', 'mixed', 'apartments'].includes(use)) { out.shop = Math.min(8, +(out.jobs * 0.15).toFixed(1)); note = use === 'apartments' ? 'People live here.' : 'Firms work here.'; if (use === 'apartments') { out.cap = Math.max(8, Math.round(mass * 0.8)); out.jobs = 2; } }
  else { out.shop = Math.min(4, +(out.jobs * 0.12).toFixed(1)); }
  // A named building does what the city's own kind does, for a premium (not by its footprint: a police headquarters the size of a block is not forty police stations), and a little more of it.
  const kind = /police/i.test(name) ? 'police' : /fire station/i.test(name) ? 'fire' : /library/i.test(name) ? 'library' : /museum|theater|theater/i.test(name) ? 'museum' : ['school', 'university', 'hospital', 'stadium', 'church', 'station', 'hotel', 'civic'].includes(use) ? use : null;
  if (kind) {
    out.cost = { gold: Math.round(BASE_COST[kind] * 1.8 + mass * 0.15) };
    if (out.serve) out.serve = { ...out.serve, radius: Math.round(out.serve.radius * 1.25) };
    if (out.bonus?.tourism) out.bonus = { ...out.bonus, tourism: +(out.bonus.tourism * 1.4).toFixed(1) };
    out.weeks = Math.min(out.weeks, 4 + Math.round(BASE_COST[kind] / 25));
    if (kind !== 'church') note += ' A landmark: a little more than the plain kind, for a good deal more.';
  }
  out.desc = `${b.name ? 'The real ' : 'A real '}${(LABEL[use] ?? 'building').toLowerCase()} of downtown Grand Rapids, ${Math.round(h)} m tall, in 3d-city's design for it. ${note}`.trim();
  return out;
}

/** What the game makes of a real building: where it stands (in tiles) and what it is worth. */
function describe(b, index) {
  const ring = b.rings[0];
  const h = heightOf(b);
  const w = [1e9, 1e9, -1e9, -1e9];
  for (const [x, z] of ring) { w[0] = Math.min(w[0], x); w[1] = Math.min(w[1], z); w[2] = Math.max(w[2], x); w[3] = Math.max(w[3], z); }
  const t0 = toTiles(w[0], w[1]), t1 = toTiles(w[2], w[3]);
  const tiles = [];
  for (let ty = Math.floor(t0[1]); ty <= Math.floor(t1[1]); ty++) {
    for (let tx = Math.floor(t0[0]); tx <= Math.floor(t1[0]); tx++) {
      if (tx < 0 || ty < 0 || tx >= gr.size || ty >= gr.size) continue;
      const [mx, mz] = toMeters(tx + 0.5, ty + 0.5);
      if (inside(ring, mx, mz)) tiles.push([tx, ty]);
    }
  }
  if (!tiles.length) {
    const [cx, cz] = toTiles((w[0] + w[2]) / 2, (w[1] + w[3]) / 2);
    tiles.push([Math.max(0, Math.min(gr.size - 1, Math.floor(cx))), Math.max(0, Math.min(gr.size - 1, Math.floor(cz)))]);
  }
  const x0 = Math.min(...tiles.map((t) => t[0])), y0 = Math.min(...tiles.map((t) => t[1]));
  const x1 = Math.max(...tiles.map((t) => t[0])), y1 = Math.max(...tiles.map((t) => t[1]));
  const zone = zoneOfUse(b.use, h);
  const floors = Math.max(1, Math.round(h / 3.6));
  const mass = tiles.length * floors;
  const tier = h < 12 ? 1 : h < 28 ? 2 : 3;
  const name = b.name ?? LABEL[b.use] ?? 'Building';
  // A named building the city can raise again by name: one 3d-city gives its own look, or a civic one, or a tower.
  const looks = Boolean(b.name && (LOOKS[b.name] || LOOKS[b.id]));
  const landmark = Boolean(b.name && (looks || SITE_USES.includes(b.use) || h >= 35));
  const def = {
    name, cat: landmark ? 'landmark' : zone ? (zone === 'res' || zone === 'dense' ? 'housing' : zone === 'ind' ? 'industry' : 'market') : 'civic',
    size: [x1 - x0 + 1, y1 - y0 + 1], cost: { gold: Math.round(mass * 1.1 + 4) }, weeks: 2 + Math.round(Math.sqrt(mass) / 1.5), crew: mass > 40 ? 4 : 2,
    parcel: index, level: tier, desc: `${b.name ? 'The real one' : `A real ${(LABEL[b.use] ?? 'building').toLowerCase()}`} on its lot in downtown Grand Rapids, ${Math.round(h)} m tall.`,
  };
  if (zone && !landmark) def.auto = zone;
  if (zone === 'res' || zone === 'dense') def.cap = Math.max(b.use === 'house' ? 4 : 2, Math.round(mass * 0.8));
  else if (zone === 'com') { def.jobs = Math.round(mass * 0.45) + 2; def.shop = Math.min(8, +(def.jobs * 0.2).toFixed(1)); }
  else if (zone === 'ind') { def.jobs = Math.round(mass * 0.7) + 3; def.shop = Math.min(4, +(def.jobs * 0.08).toFixed(1)); def.smoky = b.use === 'industrial'; }
  if (landmark) Object.assign(def, effectsOf(b, h, mass), { unique: true, landmark: true, level: 1 });
  return { index, type: `lot${index}`, record: b, use: b.use, zone: landmark ? null : zone, landmark, set: b.name === 'DeVos Place Convention Center' ? 'devosplace' : null, tier, h, x: x0, y: y0, w: def.size[0], d: def.size[1], tiles, def };
}

/** Set pieces the map has that are not buildings with footprints: built here on a lot of a few tiles. */
const PIECES = [
  { name: 'La Grande Vitesse', note: 'Alexander Calder’s vermilion steel stabile, in the middle of Calder Plaza.', set: 'vitesse', tiles: 4, serve: { cheer: 0.9, radius: 16 }, bonus: { tourism: 2 } },
];
const pieceRecord = (piece, i) => {
  const [x0, z0] = toMeters(0, 0), side = piece.tiles * TILE;
  const ring = [[x0, z0], [x0 + side, z0], [x0 + side, z0 + side], [x0, z0 + side], [x0, z0]];
  return { id: `piece-${i}`, name: piece.name, use: 'civic', rings: [ring], height: 13 };
};

export const PARCELS = [
  ...parcelData.map(describe),
  ...PIECES.map((piece, k) => {
    const p = describe(pieceRecord(piece, k), parcelData.length + k);
    Object.assign(p.def, { cat: 'landmark', unique: true, landmark: true, serve: piece.serve, bonus: piece.bonus, cost: { gold: 120 }, weeks: 8, crew: 4, jobs: 2, upkeep: 0.5, desc: piece.note });
    return Object.assign(p, { zone: null, landmark: true, set: piece.set });
  }),
];
// One of each name is a landmark: the biggest of them; the others (the museum's wings) are left to be what they were.
{
  const best = new Map();
  for (const p of PARCELS) if (p.landmark && !p.set?.startsWith?.('vitesse')) { const k = p.record.name; if (!best.has(k) || p.tiles.length > best.get(k).tiles.length) best.set(k, p); }
  for (const p of PARCELS) if (p.landmark && !p.set?.startsWith?.('vitesse') && best.get(p.record.name) !== p) { p.landmark = false; p.def.cat = p.def.auto ? 'housing' : 'civic'; delete p.def.unique; delete p.def.landmark; }
}
export const parcelByType = new Map(PARCELS.map((p) => [p.type, p]));

/** The tiles a parcel stands on when its building's rectangle is put at (x, y): the lot's own, moved. */
export const tilesAt = (p, x, y) => p.tiles.map(([tx, ty]) => [tx + x - p.x, ty + y - p.y]);

/** A real building's record moved to (x, y), in the data's meters: for a landmark raised away from its own lot. */
export function recordAt(p, x, y) {
  const dx = (x - p.x) * TILE, dz = (y - p.y) * TILE;
  if (!dx && !dz) return p.record;
  const mv = (r) => r.map(([px, pz]) => [px + dx, pz + dz]);
  const b = p.record;
  return { ...b, rings: b.rings.map(mv), measured: b.measured ? { ...b.measured, parts: b.measured.parts?.map(([lo, hi, pieces]) => [lo, hi, pieces.map((poly) => poly.map(mv))]) } : b.measured };
}

/** Adds every parcel to the catalog, as a building type of its own (the civic ones are for the Build tool). */
export function registerParcels(buildings) {
  for (const p of PARCELS) {
    if (!p.zone && !p.landmark) continue;
    buildings[p.type] = p.def;
  }
}
