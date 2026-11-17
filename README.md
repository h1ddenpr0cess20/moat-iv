# Moat IV: Ice Moat

A city builder on the real map of downtown Grand Rapids, Michigan, built on the [Madness Engine](https://github.com/h1ddenpr0cess20/madness-engine). It is Moat III's game on [3d-city](https://github.com/h1ddenpr0cess20/3d-city)'s own map and buildings.

You own the tallest tower downtown, the real Amway Grand Hotel, on the east bank of the Grand River, inside a keep wall of ice. Zone the land, lay the streets, run the police, fire stations, schools, parks and hospitals, and raise the ice wall wider to take in more districts. The best way to lay out a neighborhood is still the **donut block**.

The map starts empty: the real land, the real river, the parks and trees, and none of the buildings or streets. The real buildings come back as you build.

## Run it

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # a static site in dist/
npm test
npm run lint
```

Node 22.12 or later. The game needs a browser with WebGPU or WebGL 2. The controls and rules are Moat III's: WASD to slide the map, Q E to turn, the wheel to zoom, 1 look · 2 streets · 3 zones · 4 blocks · 5 build · 6 bulldoze, Space to pause.

## Winter, and the ice walls

It is winter in Ice Moat all year (the game opens in the middle of November): snow on the ground and the roofs, the Grand River frozen, snow falling in three-week spells, the deciduous trees bare, and a blizzard now and then where Moat III had hurricanes. The walls are ice. Each wall tile carries the engine's ice cube (`madness-engine/scenery/ice`, the block its winter walls are built of: the clear shell and its frost rim, no core or bubbles), three high, drawn by `src/render/walls.js`. A district's border is a wall, with a gate (an asphalt road through it, and an iron portcullis once there is a gatehouse) where a street may cross; taking a district in builds the wall round it and takes the old one down. The river is crossed with a Bridge; nothing is dug and no canal holds water.

## The map and the parcels

- **The land is 3d-city's, as 3d-city draws it.** `src/city` is 3d-city's own city code (its ground, terrain, trees, surfaces, designs), copied from it, and `src/data/map` is its map data (Overture Maps, USGS lidar, SRTM, the NAIP aerial) unchanged. `buildCity(MAP, { bare: true })` draws the map without its buildings and streets: the satellite's heights with the river's bed cut in, the parks and lawns, the lidar's trees, the Grand River as the engine's ocean, the painted ground. The only change to 3d-city's code is that option (and `makeTerrain`, split out so the game reads its heights from the same ground). The game's map is a 1.34 km window of it (210 tiles of 6.4 m, seven districts of 30 tiles, about 28% of the whole) centered on the Amway Grand Hotel; the rest of the map shows beyond its edge. A tile is 6.4 m, heights are at true scale, and the river's surface is height 0. `scripts/bake.mjs` bakes the rest from 3d-city's `public/data` into `src/data/`: the river and land use by tile, the parcels and the tower.
- **Parcels** are the real buildings of the map (about 280 in the window: shops, offices, flats, hotels, the few houses that are left, factories, and the civic ones). Each keeps its footprint, height, use and name, and shows on the ground as a faint lot in the color of the zone it grows on, shown while you are zoning. Zone a lot, bring a street to it, and when the city wants that kind of building the real one goes up on its lot, in 3d-city's own design for it (`src/city/rt`, ported from its Blender-derived generator, with its scanned textures in `public/scans`). Tall ones wait for land value and a big enough city. `src/parcels.js` turns each into a building type (`lot0`, `lot1`...) with its homes, jobs and cost worked out from its footprint and height. A lot that crosses a district's moat cannot be built until the moat is filled in.
- **Everywhere else** the zones grow lots of the same kinds (a house, townhouses, flats, an apartment block, a corner shop, a Main Street block, an office tower, a warehouse, a furniture factory...) as rectangles of a given use and height, drawn by the same designs. The police and fire stations, hospital, school, library, clinic, university, freight yard, data center and arena are drawn in them too; only the airport, marina, parks and plazas are still the engine's models.
- **Your tower** is the real hotel in its design, however high it is raised.

## Where it comes from

Buildings, streets and water: [Overture Maps](https://overturemaps.org) (ODbL / CDLA). Heights: USGS 3DEP lidar and SRTM (public domain). Parcels' uses: Kent County and City of Grand Rapids public records. Textures: Poly Haven scans (CC0), see `public/scans/credits.json`. The designs: 3d-city's `src/city/rt`.

## How it is made

* `src/world/`: the land (`generate.js` reads the baked map), districts and canals, streets, zones, lots, and the traffic's rules of the road. Pure JS.
* `src/sim/`: the weekly simulation: taxes and budgets, demand, jobs, mood, growth (`growth.js` raises parcels first), services, events, blocks. Pure JS.
* `src/render/`: the picture. `land.js` draws 3d-city's land; `design.js` draws buildings with 3d-city's designs, merged a material to a cell; the roads and zones are decals on the ground, and the traffic is Moat III's.
* `src/audio/`, `src/ui/`: sound and the interface.

See `docs/next.md` for what is left.
