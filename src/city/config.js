/**
 * The city is built in metres and shown in the engine's tiles: one tile is
 * `SCALE` metres, so a street is a couple of tiles across and a ball a few
 * metres wide. Heights are metres above `BASE`, so the numbers stay small.
 */
export const SCALE = 6.4;
export const BASE = 180;
/** The side of a chunk of the city, in metres: what is drawn, culled and loaded together. */
export const CHUNK = 640;
/** Where the Blue Bridge is, in metres from the middle of the map: the footbridge over the Grand River, between the Pearl Street and Fulton Street bridges. */
export const BLUE_BRIDGE = [-612, -67];
