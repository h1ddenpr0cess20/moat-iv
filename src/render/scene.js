import * as GFX from 'madness-engine/gfx';
import { createStage } from 'madness-engine/stage';
import { defineView } from 'madness-engine/view';
import { CENTER } from '../config.js';
import { calendar } from '../sim/calendar.js';
import { heightAt } from '../world/world.js';
import { createAtmosphere } from './atmosphere.js';
import { createBuildings } from './buildings.js';
import { createCamera } from './camera.js';
import { createDecals } from './decals.js';
import { createFx } from './effects.js';
import { createGates } from './gates.js';
import { createWalls } from './walls.js';
import { createSnow } from './snow.js';
import { createStreets } from './streets.js';
import { createMaterials } from './materials.js';
import { createLand } from './land.js';
import { createOverlays } from './overlays.js';
import { PARCELS, parcelByType } from '../parcels.js';
import { ZONES } from '../catalog.js';
import { createTraffic } from './traffic.js';
import { useRenderer } from './dispose.js';

/**
 * The picture of the city: the engine's stage with the land, water, trees,
 * roads and fields, buildings and bridges, weather and light all put on it,
 * and the work of keeping them up to date as the game changes the world.
 */

export async function createScene({ host, game, progress = () => {} }) {
  const { world } = game;
  const viewDef = defineView({ home: { yaw: 0.3, pitch: 0.95, zoom: 2.4 }, limits: { pitch: [0.08, 1.5], zoom: [0.22, 48] } });
  const sunDir = new GFX.Vector3(-0.3, 1, 0.6).normalize();
  const stage = await createStage(host, {
    lens: { distance: 12, fov: 34 }, view: viewDef.createView(),
    lights: { key: { from: sunDir }, fill: null }, shadowSize: 2048, label: 'moat',
    // A city seen from high up: the near plane goes out with the camera, and the far past the horizon of the map.
    depth: { ratio: 0.04, most: Infinity, far: 3300, reach: 3 },
  });
  useRenderer(stage.renderer);
  progress(0.04, 'Raising the city');
  const materials = createMaterials(GFX);
  // The land is 3d-city's own (render/land.js): its ground, parks, trees, river and sky, bare.
  const land = await createLand({ GFX, stage, progress });
  const terrain = land.terrainSet;
  const water = { update() {} };
  const domes = { set() {} };
  const decals = createDecals(GFX, world, materials, stage.scene);
  const buildings = createBuildings(GFX, world, materials, stage.scene);
  const gates = createGates(GFX, world, materials, stage.scene);
  const walls = createWalls(GFX, world, stage.scene);
  const snow = createSnow(GFX, stage.scene, world);
  // The founder's streets are laid with 3d-city's road assets, on its ground.
  const streets = createStreets({ GFX, scene: stage.scene, world, terrain: land.city.terrain, bounds: land.bounds, pixels: land.pixels });
  const traffic = createTraffic({ GFX, scene: stage.scene, game, world, materials });
  const fx = createFx(GFX, stage.scene, world);
  const overlays = createOverlays(GFX, world, stage.scene);
  const camera = createCamera({ GFX, stage, world, viewDef, dom: stage.renderer.domElement });
  const atmosphere = createAtmosphere({ GFX, stage, sunDir, materials, terrain, water, domes, fx, seed: world.seed });

  const cal0 = calendar(game.week);
  progress(0.86, 'Raising the towers');
  decals.refreshFields(cal0);
  decals.buildAll();
  buildings.buildAll();
  gates.build();
  progress(1, 'Ready');

  const castleY = () => heightAt(world, CENTER, CENTER);
  const unsubscribe = [
    game.on('week', () => {
      if (game.week % 4 === 0) decals.refreshFields(calendar(game.week));
      buildings.setCastleWork(Boolean(game.castleWork), castleY());
    }),
    game.on('built', ({ building: b }) => {
      fx.dust(b.x + b.w / 2, heightAt(world, b.x + b.w / 2, b.y + b.d / 2), b.y + b.d / 2);
      if (b.type === 'gatehouse') gates.refresh();
    }),
    game.on('placed', ({ building: b }) => { if (b.type === 'gatehouse') gates.refresh(); }),
    game.on('demolished', ({ building: b }) => { if (b.type === 'gatehouse') gates.refresh(); }),
    game.on('fire', ({ at, why }) => { if (why === 'fire') fx.burn(at[0], at[1]); }),
    game.on('annexed', () => gates.refresh()),
    game.on('bridge', () => gates.refresh()),
    game.on('castleStart', () => buildings.setCastleWork(true, castleY())),
  ];
  buildings.setCastleWork(Boolean(game.castleWork), castleY());

  let emitters = [];
  let emitClock = 0;
  let time = 0;
  let lotsAt = -1;
  let lotsOn = false;

  const scene = {
    GFX, stage, camera, viewDef, materials, land, decals, buildings, gates, traffic, fx, overlays, atmosphere,
    /** Where, in the sun's day, the game is: how far through the current week (0 to 1). */
    weekFrac: 0,
    /** Shows or hides the lots of the real buildings that are not built yet. */
    setLots(on) { lotsOn = Boolean(on); },
    /** The game stands still: the world's own motion stops. */
    paused: false,
    focusOn(x, z, opts) { camera.focus(x, z, opts); },
    /** Once a frame. */
    frame(dt) {
      // The world's own motion (the sails, the smoke, the weather, the water, the sun) stops with the game; the camera, the gates and the founder's overlays go on.
      const live = scene.paused ? 0 : dt;
      time += live;
      camera.update(dt);
      const cal = calendar(game.week);
      // The ground, water and trees are 3d-city's, drawn as they were made; the game's own marks on them are the decals.
      for (const k of ['terrain', 'water', 'trees', 'ground']) world.dirty[k].clear();
      decals.sync(cal, 3);
      buildings.sync(1);
      buildings.restage(4);
      land.update(live, stage.target.x, stage.target.z, null);
      land.setNight(atmosphere.state.night);
      emitClock -= dt;
      if (emitClock <= 0) { emitClock = 1.5; emitters = buildings.emitters(); }
      buildings.update(live, 0.6 + 0.4 * Math.sin(time * 0.3));
      gates.update(dt);
      streets.update(dt);
      walls.update(time);
      traffic.update(dt, { live, eye: camera.eye });
      // The lots the real buildings stood on, that the city has not built again: faintly in the color of their zone.
      if (lotsAt !== `${world.bver}:${lotsOn}`) {
        lotsAt = `${world.bver}:${lotsOn}`;
        const taken = new Set();
        for (const b of world.buildings.values()) { const p = parcelByType.get(b.type); if (p) taken.add(p.index); }
        for (const zone of Object.keys(ZONES)) {
          const tiles = [];
          for (const p of PARCELS) if (p.zone === zone && !taken.has(p.index)) for (const t of p.tiles) tiles.push(t);
          overlays.fill(`lots-${zone}`, lotsOn ? tiles : [], { color: ZONES[zone].color, opacity: 0.2 });
        }
      }
      overlays.update(dt);
      const frac = Math.min(1, scene.weekFrac);
      // Snow falls all through the view while it snows.
      snow.update(live, Boolean(atmosphere.state.snowing), { x: stage.target.x, z: stage.target.z, distance: camera.distance });
      atmosphere.update(live, { week: game.week, frac, storm: Boolean(game.hurricane && !game.hurricane.warn) });
      const cold = cal.season === 3 ? 1.7 : cal.season === 2 ? 1.2 : 0.8;
      fx.update(live, { emitters, near: [stage.target.x, stage.target.z], reach: 20 + 4 * camera.distance, rate: 0.5 * cold, wind: [0.35, 0.12], time });
    },
    dispose() { for (const off of unsubscribe) off(); camera.dispose(); },
  };
  return scene;
}
