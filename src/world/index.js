import { generate } from './generate.js';
import { placeCastle } from './buildings.js';
import { levelLand, computeWalls, initWards, shapeCastle } from './wards.js';
import { createWorld } from './world.js';

/** A new map from a seed: the land, its wards, the tower in its keep, the first wall. */
export function newWorld(seed = 'moat') {
  const world = createWorld(seed);
  generate(world);
  world.hBase = Float32Array.from(world.h);
  initWards(world);
  computeWalls(world);
  shapeCastle(world);
  levelLand(world);
  placeCastle(world, 0);
  world.netVersion = 0;
  return world;
}

export * from './world.js';
export * from './wards.js';
export * from './roads.js';
export * from './zoning.js';
export * from './buildings.js';
