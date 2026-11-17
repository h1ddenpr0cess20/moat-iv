import { createIce } from 'madness-engine/scenery/ice';
import { GROUND, ROAD } from '../config.js';
import { tileRange } from '../world/world.js';

/**
 * The walls: ice. On every wall tile the engine's ice cube (the block its winter walls are built of: the clear
 * shell and its frost rim, nothing inside), three high, standing on the ground as it lies. The gates are the road
 * tiles through them, which carry no blocks. Rebuilt when the walls change (`world.wver`).
 */

/** Blocks a wall is high. */
const HIGH = 3;

export function createWalls(GFX, world, scene) {
  const group = new GFX.Group();
  group.name = 'ice walls';
  scene.add(group);
  let ices = [];
  let at = -1;

  const clear = () => {
    for (const ice of ices) { group.remove(ice.group); ice.group.traverse((o) => o.geometry?.dispose?.()); }
    ices = [];
  };

  const build = () => {
    clear();
    const floors = new Map();
    for (let y = 0; y < world.size; y++) {
      for (let x = 0; x < world.size; x++) {
        const i = y * world.size + x;
        if (world.wall[i] !== 1 || world.ground[i] === GROUND.WATER || world.road[i] === ROAD.BRIDGE || world.bld[i]) continue;
        floors.set(i, tileRange(world, x, y)[1] - 0.1);
      }
    }
    if (!floors.size) return;
    for (let layer = 0; layer < HIGH; layer++) {
      const grounds = { cols: world.size, rows: world.size, cell: (x, z) => { const f = floors.get(z * world.size + x); return f === undefined ? null : { kind: 'wall', floor: f + layer }; } };
      const ice = createIce(GFX, { grounds });
      group.add(ice.group);
      ices.push(ice);
    }
  };

  return {
    group,
    /** Once a frame: rebuilds if the walls changed, and lets the frost breathe. */
    update(time) {
      if (at !== (world.wver ?? 0)) { at = world.wver ?? 0; build(); }
      for (const ice of ices) ice.update(time);
    },
  };
}
