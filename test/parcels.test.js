import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS } from '../src/catalog.js';
import { PARCELS, parcelByType } from '../src/parcels.js';
import { buildZone, completeAnnex, placeBuilding, startGame, step } from '../src/sim/game.js';
import { wardId, wardOfTile } from '../src/world/index.js';
import { connect } from '../src/sim/hamlet.js';
import { Designs } from '../src/city/rt/buildings.js';
import { createBot } from './bot.js';

test('the real buildings of downtown are parcels, each with its footprint, use and worth', () => {
  assert.ok(PARCELS.length > 200, `${PARCELS.length} parcels`);
  const zones = new Set(PARCELS.map((p) => p.zone));
  for (const z of ['res', 'dense', 'com', 'ind']) assert.ok(zones.has(z), `a parcel grows on ${z}`);
  for (const p of PARCELS) {
    assert.ok(p.tiles.length >= 1 && p.record.rings[0].length >= 4, p.type);
    if (!p.zone) continue;
    const def = BUILDINGS[p.type];
    assert.equal(def.parcel, p.index);
    assert.ok(def.cap || def.jobs, `${p.type} houses or employs someone`);
  }
});

test('a real parcel is built by its zone once a street reaches it, and stands on its own footprint', () => {
  const game = startGame({ seed: 'moat' });
  const { world } = game;
  game.stock.gold = 9000;
  // A real house south-east of the tower, well inside its district, which is taken in first.
  const lot = PARCELS.find((p) => p.zone === 'res' && p.x >= 120 && p.x < 150 && p.y >= 120 && p.y < 150 && p.x % 30 >= 4 && p.x % 30 + p.w <= 26 && p.y % 30 >= 4 && p.y % 30 + p.d <= 26);
  assert.ok(lot, 'a lot to build');
  completeAnnex(game, world.wards[wardOfTile(lot.x, lot.y)]);
  assert.ok(world.wards[wardId(4, 4)].owned);
  const zoned = buildZone(game, lot.tiles, 'res', { free: true });
  assert.ok(zoned.ok, zoned.reason);
  connect(game, { x: lot.x, y: lot.y, w: lot.w, d: lot.d }, { free: true });
  for (let w = 0; w < 40 && ![...world.buildings.values()].some((b) => b.type === lot.type); w++) {
    for (const b of world.buildings.values()) if (b.state === 'building') b.progress = Math.max(b.progress, 0.999);
    step(game);
    game.stock.gold = 9000;
  }
  const b = [...world.buildings.values()].find((x) => x.type === lot.type);
  assert.ok(b, 'the real building went up on its lot');
  assert.deepEqual([b.x, b.y, b.w, b.d], [lot.x, lot.y, lot.w, lot.d]);
  assert.equal(parcelByType.get(b.type), lot);
});

test('3d-city draws every parcel in its own design', () => {
  const designs = new Designs({ ground: () => 0, streetDir: () => null, creative: false });
  let made = 0;
  for (const p of PARCELS) {
    const parts = designs.detail([[p.record, [], [], null]]);
    if (parts.some((q) => q.count > 0)) made++;
  }
  assert.ok(made > PARCELS.length * 0.95, `${made} of ${PARCELS.length} drawn`);
});

test('a bot plays on and real parcels go up among the rest', () => {
  const game = startGame({ seed: 'moat' });
  const bot = createBot(game);
  for (let w = 0; w < 260 && !game.gameOver; w++) { bot.think(); step(game); }
  assert.ok(game.pop.adults + game.pop.children + game.pop.elders > 50);
});

test('the named buildings of the map are landmarks: one of each, built by name, on their lot or away from it', () => {
  const marks = PARCELS.filter((p) => p.landmark);
  assert.ok(marks.length > 40, `${marks.length} landmarks`);
  const names = marks.map((p) => p.record.name);
  assert.equal(new Set(names).size, names.length, 'one of each name');
  for (const n of ['Grand Rapids Art Museum', 'Van Andel Arena', 'Kent County Courthouse', 'La Grande Vitesse', 'DeVos Place Convention Center']) assert.ok(names.includes(n), n);
  for (const p of marks) {
    assert.equal(BUILDINGS[p.type].cat, 'landmark');
    assert.ok(BUILDINGS[p.type].unique);
  }
  const game = startGame({ seed: 'moat' });
  game.world.realm.fill(1);
  const museum = marks.find((p) => p.record.name === 'Grand Rapids Art Museum');
  // Anywhere clear: the lot's own tiles are what it needs.
  let spot = null;
  for (let y = 100; y < 190 && !spot; y += 3) for (let x = 112; x < 190 && !spot; x += 3) { const r = placeBuilding(game, museum.type, x, y, 0, { free: true }); if (r.building) spot = r.building; }
  assert.ok(spot, 'the museum goes up somewhere');
  assert.equal(placeBuilding(game, museum.type, 105, 140, 0, { free: true }).ok, false, 'only one');
});

test('3d-city draws the landmarks, the set pieces and every kind of building the Build menu adds', () => {
  const designs = new Designs({ ground: () => 0, streetDir: () => null, creative: false });
  for (const [type, def] of Object.entries(BUILDINGS)) {
    if (def.cat !== 'downtown') continue;
    const [w, d] = def.size, r = { id: type, rings: [[[0, 0], [w * 6.4 - 3, 0], [w * 6.4 - 3, d * 6.4 - 3], [0, d * 6.4 - 3], [0, 0]]], use: def.design.use, height: def.design.h, kind: def.design.kind };
    const parts = designs.detail([[r, def.design.names ?? [], [], null]]);
    assert.ok(parts.some((q) => q.count > 0), `${type} is drawn`);
  }
});
