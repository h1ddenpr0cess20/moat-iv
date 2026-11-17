# Next

- **Civic parcels as sites.** The real schools, hospitals, churches, colleges, civic buildings, the arena and the station are parcels (`SITE_USES` in `src/parcels.js`) with no zone, so nothing builds them yet. Give them to the Build tool: pick "Grand Rapids Art Museum" or "Van Andel Arena" from a Landmarks tab, click its lot, and it goes up there with the service effect of its kind.
- **The rest of the map.** `scripts/bake.mjs` takes a center and a size: more of 3d-city's map (Heritage Hill's houses are east of this window), or the whole of it, is a matter of `SIZE` and more wards. Low Residential has few real houses in this window and mostly grows generic lots.
- **Streets.** The real street grid is not drawn. A "ghost" of it for tracing, and parcels that fix the front of a lot to the real street, would fit the lots better.
- **Night.** `src/city/rt/look.js` has `setGlow(night)` for lit windows and signs; it is not hooked to the game's sky yet.
- **Level of detail.** Every finished building is full detail. A far version (`Designs.build` with `lod: 'far'`) for a big city would save triangles.
- **Terrain skirt.** The land past the edge of the map is Moat III's hazy mountain ring, drawn from the real heights; it could be the real surroundings.
- **Winter all year.** The calendar still runs through twelve months (it starts mid-November), but the look is always winter. A real seasonal cycle (`atmosphere.js` has the pieces) would let the river thaw in summer and the walls drip.
- **Ice walls.** The wall is three blocks high and two thick on every border tile. A thinner wall, towers at the corners and the gatehouse built into it, and walls that stand in the river (they stop at the banks now), would suit it.
