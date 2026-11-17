# Moat IV: Furniture City

A city builder on the real map of downtown Grand Rapids, Michigan, built on the [Madness Engine](https://github.com/h1ddenpr0cess20/madness-engine). It is Moat III's game on [3d-city](https://github.com/h1ddenpr0cess20/3d-city)'s land and buildings.

You own the tallest tower downtown, the real Amway Grand Hotel, on the east bank of the Grand River, with a canal dug round it. Zone the land, lay the streets, run the police, fire stations, schools, parks and hospitals, and dig the canals wider to take in more districts. The best way to lay out a neighborhood is still the **donut block**.

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

## The map and the parcels

- **The land** is a 1.34 km square (about 28% of 3d-city's map: 210 tiles of 6.4 m, seven districts of 30 tiles) centered on the Amway Grand Hotel. Heights are USGS lidar and SRTM, the Grand River, parks and campus lawns are Overture Maps, the trees are the lidar's crowns. `scripts/bake.mjs` bakes it from 3d-city's `public/data` into `src/data/` (`node scripts/bake.mjs <3d-city/public/data> -501 -301`); `scripts/preview.py` draws what it made. The river runs down the west side and counts as open water for the Freight Yard and the Marina.
- **Parcels** are the real buildings of the map (about 280 in the window: shops, offices, flats, hotels, the few houses that are left, factories, and the civic ones). Each keeps its footprint, height, use and name, and shows on the ground as a faint lot in the color of the zone it grows on. Zone a lot, bring a street to it, and when the city wants that kind of building the real one goes up on its lot, in 3d-city's own design for it (`src/city/rt`, ported from its Blender-derived generator, with its scanned textures in `public/scans`). Tall ones wait for land value and a big enough city. `src/parcels.js` turns each into a building type (`lot0`, `lot1`...) with its homes, jobs and cost worked out from its footprint and height. A lot that crosses a district's moat cannot be built until the moat is filled in.
- **Everywhere else** the zones grow lots of the same kinds (a house, townhouses, flats, an apartment block, a corner shop, a Main Street block, an office tower, a warehouse, a furniture factory...) as rectangles of a given use and height, drawn by the same designs. The police and fire stations, hospital, school, library, clinic, university, freight yard, data center and arena are drawn in them too; only the airport, marina, parks and plazas are still the engine's models.
- **Your tower** is the real hotel in its design, however high it is raised.

## Where it comes from

Buildings, streets and water: [Overture Maps](https://overturemaps.org) (ODbL / CDLA). Heights: USGS 3DEP lidar and SRTM (public domain). Parcels' uses: Kent County and City of Grand Rapids public records. Textures: Poly Haven scans (CC0), see `public/scans/credits.json`. The designs: 3d-city's `src/city/rt`.

## How it is made

* `src/world/`: the land (`generate.js` reads the baked map), districts and canals, streets, zones, lots, and the traffic's rules of the road. Pure JS.
* `src/sim/`: the weekly simulation: taxes and budgets, demand, jobs, mood, growth (`growth.js` raises parcels first), services, events, blocks. Pure JS.
* `src/render/`: the picture. `design.js` draws buildings with 3d-city's designs, merged a material to a cell; the terrain, water, trees and traffic are Moat III's.
* `src/audio/`, `src/ui/`: sound and the interface.

See `docs/next.md` for what is left.
