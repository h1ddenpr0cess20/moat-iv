import elevation from './data/map/elevation.json' with { type: 'json' };
import water from './data/map/water.json' with { type: 'json' };
import landuse from './data/map/landuse.json' with { type: 'json' };
import land from './data/map/land.json' with { type: 'json' };
import infrastructure from './data/map/infrastructure.json' with { type: 'json' };
import roads from './data/map/roads.json' with { type: 'json' };
import trees from './data/map/trees.json' with { type: 'json' };
import green from './data/map/green.json' with { type: 'json' };
import { BASE, SCALE } from './city/config.js';
import { makeTerrain } from './city/world.js';

/**
 * The map: 3d-city's own data for downtown Grand Rapids (Overture Maps, USGS lidar, SRTM, the NAIP aerial), copied
 * unchanged into `src/data/map`. `terrain()` is 3d-city's ground, built by 3d-city's own code; the game's heights and
 * the picture of the land both come from it.
 */
export const MAP = { elevation, water, landuse, land, infrastructure, roads, trees, green, buildings: [], lidar: {}, roofs: {}, places: null };
export { BASE, SCALE };

let made = null;
/** 3d-city's ground for this map (made once): { terrain, own }. */
export function groundOfMap() {
  made ??= makeTerrain(MAP, { bare: true });
  return made;
}
