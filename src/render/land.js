import { createOcean } from 'madness-engine/ocean';
import { riverOf } from 'madness-engine/river';
import { MAP, groundOfMap } from '../map.js';
import { ORIGIN } from '../parcels.js';
import { buildCity } from '../city/world.js';
import { fullTrees } from '../city/trees.js';
import { cityGroup, chooseLods } from '../city/scene.js';
import { SURFACES, paintSurfaces } from '../city/surfaces.js';
import { setNight } from '../city/night.js';

/**
 * The land: 3d-city's own, as 3d-city draws it (src/city, copied from it): the ground draped over the satellite's heights
 * in its painted surfaces, the parks and lawns, the lidar's trees, and the Grand River as the engine's ocean, a river's
 * waves and a current. Built bare: no streets and no buildings, which the game puts back. The map's metres are the
 * game's tiles (`SCALE` metres each), with the first tile at `ORIGIN` and the river's surface at height 0.
 */

export async function createLand({ GFX, stage, progress = () => {} }) {
  const { scene } = stage;
  let painted = 0;
  const painting = paintSurfaces(() => progress(0.1 + 0.4 * (++painted / Object.keys(SURFACES).length), 'Painting the lawns and the snow'));
  // 3d-city's ground first: the game's heights are read from it too.
  const { terrain } = groundOfMap();
  progress(0.08, 'Reading the map');
  const city = buildCity(MAP, { alone: true, bare: true });
  const parts = city.builder.finish();
  city.builder.parts.clear();

  // The sky and the river: the engine's ocean, at the river's level.
  const river = riverOf(0.32);
  const ocean = createOcean(GFX, { sea: { ...river.sea }, sky: 'noon', reach: 900 });
  scene.add(ocean.group);
  ocean.dress(stage);
  ocean.group.position.y = -0.02;
  // A river's ripples do not run on their own: the current carries them.
  ocean.sea.run = 0;
  ocean.sea.current = [0, 0.55];

  const pixels = await painting;
  progress(0.55, 'Laying the ground');
  const bounds = { x0: ORIGIN[0], z0: ORIGIN[1], y0: terrain.waterLevel ?? 0, x1: city.bounds.x1, z1: city.bounds.z1 };
  const group = cityGroup(GFX, parts, bounds, pixels, [{ cells: city.builder.fullTrees, make: fullTrees }].filter(Boolean));
  scene.add(group);
  city.builder.solid = [];

  // Snow: the ground's own materials whitened (the map is of a winter day).
  const snowed = new Set();
  const snow = (k) => {
    group.traverse((o) => {
      const m = o.material;
      if (!m || snowed.has(m) || !/^(ground:(turf|lawn)|surface:dirt)/.test(m.name ?? '')) return;
      snowed.add(m);
      m.color.lerp(new GFX.Color('#f2f6fb'), k);
    });
  };

  let sky = 'noon';
  return {
    group, ocean, terrain, city,
    /** The ground's tint for a season (3 is winter) and the snow lying on it, 0 to 1. */
    terrainSet: { setSeason(season, k, lying) { if (lying > 0) snow(0.78 * lying); } },
    /** Once a frame, with the camera's target in tiles from the map's corner. */
    update(dt, x, z, eye) {
      ocean.update(dt);
      chooseLods(group, x, z, eye);
    },
    /** 0 by day, 1 by night: the windows and lamps, and the sky. */
    setNight(n) {
      setNight(n);
      const want = n > 0.5 ? 'night' : 'noon';
      if (want !== sky) { sky = want; ocean.setSky(want, 5); }
    },
  };
}
