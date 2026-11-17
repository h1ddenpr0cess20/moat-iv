import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CENTER, GROUND, HOME_WARD, ROAD, SIZE, WARD } from '../src/config.js';
import { newWorld, heightAt, SUB, HV, idx, wardId, wardOfTile, ownedCount, exposedBorders, bordersRealm } from '../src/world/index.js';
import { startGame, completeAnnex, buildRoad, buildZone, rectTiles, lineTiles } from '../src/sim/game.js';
import { network, setRoad } from '../src/world/roads.js';

test('the land is downtown Grand Rapids whatever the seed; the seed names the districts', () => {
  const a = newWorld('oxmere'), b = newWorld('oxmere'), c = newWorld('hollin');
  assert.deepEqual(a.h, b.h);
  assert.deepEqual(a.ground, b.ground);
  assert.deepEqual(a.tree, b.tree);
  assert.deepEqual(a.wards.map((w) => w.name), b.wards.map((w) => w.name));
  assert.deepEqual(a.h, c.h);
  assert.notDeepEqual(a.wards.map((w) => w.name), c.wards.map((w) => w.name));
  // The Grand River runs down the west side of the map.
  let river = 0;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE / 2; x++) if (a.ground[idx(x, y)] === GROUND.WATER) river++;
  assert.ok(river > 1500, `${river} river tiles`);
});

test('the tower stands in its keep, in the middle of the home ward, inside a ring of ice wall', () => {
  const w = newWorld('moat');
  assert.equal(wardOfTile(CENTER, CENTER), wardId(HOME_WARD, HOME_WARD));
  assert.equal(ownedCount(w), 1);
  const castle = w.buildings.get(1);
  assert.equal(castle.type, 'castle');
  // Wall all round the keep, and the home ward is the realm's but for its walls.
  const iced = (x, y) => w.wall[idx(x, y)] === 1;
  assert.ok(iced(CENTER - 4, CENTER) && iced(CENTER + 3, CENTER) && iced(CENTER, CENTER - 4));
  let realm = 0;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (w.realm[idx(x, y)]) realm++;
  assert.ok(realm > WARD * WARD * 0.3 && realm < WARD * WARD * 0.9, `the realm is ${realm} tiles`);
  // Walls stand on the land and cut nothing: the ground is the map's, dry beside the keep.
  assert.ok(heightAt(w, CENTER + 3, CENTER) > 0.12, 'the wall stands on dry ground');
});

test('every border with another ward has a bridge', () => {
  const w = newWorld('moat');
  // (Where the Grand River is the border there is no bridge to build: it is a river, not a moat.)
  const dry = w.gates.filter((g) => !g.wet);
  assert.ok(dry.length >= 3 && dry.length <= 4, `${dry.length} dry gates`);
  for (const g of dry) {
    for (const [x, y] of g.tiles) assert.equal(w.road[idx(x, y)], ROAD.BRIDGE);
  }
  assert.equal(exposedBorders(w).filter((s) => s.beyond !== null).length, 4);
});

test('heightAt agrees with the heights it was made from', () => {
  const w = newWorld('moat');
  for (const [vx, vy] of [[10, 10], [200, 300], [HV - 1, HV - 1], [CENTER * SUB, CENTER * SUB]]) {
    assert.ok(Math.abs(heightAt(w, vx / SUB, vy / SUB) - w.h[vy * HV + vx]) < 1e-4);
  }
});

test('raising the wall out around a ward takes it in, and takes down the old wall between', () => {
  const game = startGame({ seed: 'moat' });
  const { world } = game;
  const home = wardId(HOME_WARD, HOME_WARD);
  const east = wardId(HOME_WARD + 1, HOME_WARD);
  assert.ok(bordersRealm(world, east));
  const border = idx((HOME_WARD + 1) * WARD, CENTER);
  assert.equal(world.wall[border], 1, 'the old wall stands');
  completeAnnex(game, world.wards[east]);
  assert.ok(world.wards[east].owned && world.wards[home].owned);
  assert.equal(ownedCount(world), 3, 'the home district, the one south of it that comes with the tower, and this one');
  assert.equal(world.wall[border], 0, 'the old wall is down');
  assert.equal(world.wall[idx((HOME_WARD + 2) * WARD, CENTER)], 1, 'the new border is a wall');
  assert.ok(world.gates.some((g) => g.ward === east), 'the new ward has a gate of its own');
});

test('roads: not on water, joined to the castle by the network', () => {
  const game = startGame({ seed: 'moat' });
  const { world } = game;
  let wet = null;
  for (let i = 0; i < world.ground.length && !wet; i++) if (world.ground[i] === GROUND.WATER) wet = [i % SIZE, Math.floor(i / SIZE)];
  assert.ok(setRoad(world, wet[0], wet[1], ROAD.DIRT) < 0, 'no road on water');
  const { dist } = network(world);
  // The hamlet's avenue runs from the castle's bridge.
  assert.ok(dist[idx(CENTER, CENTER + 6)] >= 0);
  const out = buildRoad(game, lineTiles(CENTER - 8, CENTER - 8, CENTER + 8, CENTER - 8), 'dirt');
  assert.ok(out.ok && out.placed > 8);
  assert.ok(game.stock.gold < 1200);
});

test('zones cost coin and need open land', () => {
  const game = startGame({ seed: 'moat' });
  const gold = game.stock.gold;
  const r = buildZone(game, rectTiles(CENTER + 8, CENTER + 10, CENTER + 11, CENTER + 12), 'res');
  assert.ok(r.ok);
  assert.equal(game.stock.gold, gold - r.placed);
  const outside = buildZone(game, rectTiles(2, 2, 4, 4), 'res');
  assert.equal(outside.ok, false, 'no zoning outside the moat');
});

test('bridges cross a river inside the realm, but not the moat, and not too far', async () => {
  const { GROUND: G } = await import('../src/config.js');
  const { planRoad, demolish } = await import('../src/sim/game.js');
  const game = startGame({ seed: 'moat' });
  const { world } = game;
  // An open row of eleven tiles in the realm to run a stream across (three tiles wide, in the middle).
  const { roadBlocked } = await import('../src/world/roads.js');
  let y = null, x0 = null;
  for (let yy = CENTER + 33; yy <= CENTER + 40 && y === null; yy++) for (let xx = 99; xx <= 100 && y === null; xx++) {
    if (Array.from({ length: 12 }, (_, k) => roadBlocked(world, xx + k, yy)).every((r) => !r)) { y = yy; x0 = xx; }
  }
  assert.ok(y !== null, 'an open row');
  const wx = x0 + 5;
  for (let x = wx; x <= wx + 2; x++) world.ground[idx(x, y)] = G.WATER;
  game.stock.wood = 100; game.stock.gold = 100;
  assert.equal(planRoad(game, lineTiles(x0, y, x0 + 11, y), 'dirt').tiles.length < 11, true, 'a road cannot cross the water');
  // (Where the row crosses a street already laid, there is nothing to pay for.)
  const laid = Array.from({ length: 12 }, (_, k) => k).filter((k) => k < 5 || k > 7).filter((k) => world.road[idx(x0 + k, y)]).length;
  const over = buildRoad(game, lineTiles(x0, y, x0 + 11, y), 'bridge');
  assert.ok(over.ok, over.reason);
  for (let x = wx; x <= wx + 2; x++) assert.equal(world.road[idx(x, y)], ROAD.SPAN);
  assert.equal(game.stock.gold, 100 - (3 * 6 + 9 - laid), 'three spans at $6k, nine dry tiles at $1k');
  // A bridge needs water, and both ends on land.
  assert.match(planRoad(game, lineTiles(x0, y, x0 + 3, y), 'bridge').reason, /needs water/);
  assert.match(planRoad(game, lineTiles(wx, y, x0 + 11, y), 'bridge').reason, /bank/);
  // Too long a span.
  for (let x = x0 + 1; x <= x0 + 9; x++) world.ground[idx(x, y)] = G.WATER;
  world.road[idx(wx, y)] = 0; world.road[idx(wx + 1, y)] = 0; world.road[idx(wx + 2, y)] = 0;
  assert.match(planRoad(game, lineTiles(x0, y, x0 + 11, y), 'bridge').reason, /Too long/);
  // It can be taken down.
  world.ground[idx(wx, y)] = G.WATER;
  world.road[idx(wx, y)] = ROAD.SPAN;
  assert.equal(demolish(game, wx, y).what, 'Bridge');
  assert.equal(world.road[idx(wx, y)], ROAD.NONE);
  // The moat is crossed only at the gates.
  const moatTile = [CENTER - 4, CENTER];
  assert.equal(planRoad(game, lineTiles(moatTile[0] - 3, moatTile[1], moatTile[0] + 3, moatTile[1]), 'bridge').tiles.length, 0);
});

test('a bridge may start on marshy bank: low ground counts as part of the span', async () => {
  const { GROUND: G } = await import('../src/config.js');
  const { planRoad } = await import('../src/sim/game.js');
  const { roadBlocked } = await import('../src/world/roads.js');
  const game = startGame({ seed: 'moat' });
  const { world } = game;
  let y = null, x0 = null;
  for (let yy = CENTER + 12; yy <= CENTER + 40 && y === null; yy++) for (let xx = 96; xx <= 108 && y === null; xx++) {
    if (Array.from({ length: 12 }, (_, k) => roadBlocked(world, xx + k, yy)).every((r) => !r) && !world.road[idx(xx + 4, yy)] && !world.road[idx(xx + 7, yy)]) { y = yy; x0 = xx; }
  }
  assert.ok(y !== null, 'an open row');
  // Level ground along the row (the map's own has slopes), then the water and the low banks.
  for (let vy = (y - 1) * SUB; vy <= (y + 2) * SUB; vy++) for (let vx = x0 * SUB; vx <= (x0 + 12) * SUB; vx++) world.h[vy * HV + vx] = 0.5;
  for (let x = x0 + 5; x <= x0 + 6; x++) world.ground[idx(x, y)] = G.WATER;
  // The banks either side are low and wet: no road, but a boardwalk.
  for (const bx of [x0 + 4, x0 + 7]) for (let dy = 0; dy <= 2; dy++) for (let dx = 0; dx <= 2; dx++) world.h[(y * SUB + dy) * HV + bx * SUB + dx] = 0.04;
  assert.equal(roadBlocked(world, x0 + 4, y), 'Waterlogged');
  assert.match(planRoad(game, lineTiles(x0 + 4, y, x0 + 4, y), 'dirt').reason, /bridge/, 'a plain road tells you to use a bridge');
  const plan = planRoad(game, lineTiles(x0, y, x0 + 11, y), 'bridge');
  assert.equal(plan.reason, null, plan.reason);
  assert.ok(plan.spans.length >= 4, 'two water tiles and the marshy banks either side');
});

test('no tree stands in a wall, however many wards are walled in', () => {
  const game = startGame({ seed: 'oxmere' });
  const { world } = game;
  const drowned = () => {
    let n = 0;
    for (let i = 0; i < world.tree.length; i++) if (world.tree[i] && world.wall[i] === 1) n++;
    return n;
  };
  assert.equal(drowned(), 0);
  // Woods in the way of the next moat: plant every tile of the ring around the home ward, then take the ward beside it.
  world.tree.fill(1);
  const next = world.wards.find((w) => !w.owned && bordersRealm(world, w.id));
  completeAnnex(game, next);
  assert.equal(drowned(), 0);
});
