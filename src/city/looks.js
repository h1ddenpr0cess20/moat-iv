import { unit } from './geometry.js';

/**
 * How the buildings of downtown Grand Rapids look, from free photographs of them (Wikimedia Commons;
 * `public/data/landmark-credits.json` says whose and under what licence) and the USGS aerial photograph.
 *
 * A look says what a building is clad in (`wall`: one of the facades in buildings.js) and the tint on it; what its
 * lowest storeys are (`base`: { wall, h, tint }: a stone base, a row of shop fronts, a glass lobby); the cornice it
 * wears (`cornice`: { h, d, tint }, metres tall and proud of the wall, or `false`); the side of it that is glass
 * (`glass`: { toward: [dx, dz], wall }); and whether its roof carries a penthouse (`penthouse: false` for none).
 *
 *   glass-bronze      the Amway Grand Plaza's tower, Campau Square Plaza
 *   glass-blue        the old National City bank on Monroe, 200 Monroe
 *   glass-teal        the JW Marriott, the Van Andel Institute, CityFlats
 *   glass-dark        the newer towers (20 Monroe, the AC Hotel)
 *   limestone         McKay Tower, the old Federal Building, Ryerson Library
 *   historic          the brick blocks of Monroe Center, Ionia, Pearl and the Pantlind (tinted red, brown or buff)
 *   historic-arched   the same with round-headed windows (the Exhibitors Building, the Italianate rows)
 *   concrete          the Art Museum's board-formed concrete
 *   precast, curtain, terracotta, sandstone: the engine's own (Plaza Towers, the Courthouse, the Trust Building)
 */

const RED = '#d08a70', BROWN = '#a8705c', BUFF = '#fbecc8', CREAM = '#fff6e2', DARKRED = '#b06a58';
const STONE = '#f4ecdc';
/** A cornice of pale stone or pressed metal, as the brick blocks of downtown wear. */
const CORNICE = { h: 1.1, d: 0.7, tint: '#e8e0d0' };

export const LOOKS = {
  // Heartside's entertainment district. The Pyramid Scheme (68 Commerce, the old Maxi's): a two-storey brick block at
  // Commerce and Oakes, painted dark, its windows black, the bar and the stage behind them.
  'Pyramid Scheme': { wall: 'historic', tint: '#6a6466', base: { wall: 'shop', h: 4.4, tint: '#d8d2cc' }, cornice: { h: 0.9, d: 0.5, tint: '#2a2628' }, penthouse: false },
  // Rapid Central Station's terminal (Progressive AE, 2004; its canopy is transit.js's): brick and a great deal of
  // glass, glazed to the bus bays on the east, its roof planted.
  '0e81276c-320e-4d44-bc10-e281b0c9e0df': { wall: 'historic', tint: '#b87a62', base: { wall: 'glass-blue', h: 5 }, glass: { toward: [1, 0], wall: 'glass-blue', spread: 0.6 }, cornice: { h: 0.6, d: 0.5, tint: '#d8dcdf' }, penthouse: false },
  // The Downtown Market's hall (market.js builds the rest): red-brown brick over a ground floor of glass, a dark steel edge.
  'Grand Rapids Downtown Market': { wall: 'historic', tint: '#b8745e', base: { wall: 'glass-dark', h: 4.6 }, cornice: { h: 0.6, d: 0.4, tint: '#3a3f44' }, penthouse: false },
  // Pearl and Monroe: the Amway Grand Plaza (the old Pantlind, 1913: dark red-brown brick over a pale stone base,
  // a deep cornice) and its tower of bronze glass on the river.
  'Amway Grand Hotel': { wall: 'glass-bronze', tint: '#ffffff', base: { wall: 'glass-bronze', h: 8 }, cornice: { h: 0.6, d: 0.3, tint: '#5a4636' } },
  'Amway Grand Plaza': { wall: 'historic', tint: BROWN, base: { wall: 'limestone', h: 8, tint: STONE }, cornice: { h: 1.6, d: 1.1, tint: '#e6dccb' } },
  // The old Furniture Exhibitors Building on Pearl: buff brick, gold terracotta, round-headed windows at the top.
  'Exhibitors Building': { wall: 'historic-arched', tint: BUFF, base: { wall: 'limestone', h: 5, tint: '#efe2c4' }, cornice: { h: 1.3, d: 0.8, tint: '#e8d6aa' } },
  'JW Marriott Grand Rapids': { wall: 'glass-teal', tint: '#ffffff', cornice: { h: 0.5, d: 0.25, tint: '#9aa4a6' } },
  'Plaza Towers apartments': { wall: 'precast', tint: '#fbf3e4' },
  'Courtyard Grand Rapids Downtown': { wall: 'precast', tint: '#fbf3e4' },
  'Windquest Building': { wall: 'glass-blue', tint: '#f4f8ff', base: { wall: 'concrete', h: 5, tint: '#f0f0f0' }, cornice: { h: 0.5, d: 1.6, tint: '#d8dcdf' } },
  'Waters Building': { wall: 'historic', tint: BUFF, base: { wall: 'shop', h: 4.4 }, cornice: CORNICE },
  'Trust Building': { wall: 'sandstone', tint: '#ffffff', cornice: { h: 1.2, d: 0.7, tint: '#b07862' } },
  'Pen Building': { wall: 'historic', tint: RED, base: { wall: 'shop', h: 4.4 }, cornice: CORNICE },
  'The Morton': { wall: 'historic', tint: BUFF, base: { wall: 'limestone', h: 8, tint: STONE }, cornice: { h: 1.4, d: 0.9, tint: '#efe4cc' } },
  '77 Monroe Building': { wall: 'precast', tint: '#f2ece2', base: { wall: 'glass-dark', h: 5 } },
  CityFlatsHotel: { wall: 'glass-teal', tint: '#ffffff', base: { wall: 'shop', h: 4.4 }, cornice: false },
  'The CWD Building': { wall: 'historic', tint: RED, base: { wall: 'shop', h: 4.4 }, cornice: CORNICE },
  'The B.O.B.': { wall: 'historic-arched', tint: DARKRED, base: { wall: 'shop', h: 4.4 }, cornice: CORNICE },
  '20 Monroe': { wall: 'glass-dark', tint: '#ffffff', base: { wall: 'historic', h: 9, tint: BROWN }, cornice: false },
  'AC Hotel': { wall: 'glass-dark', tint: '#ffffff', cornice: { h: 0.6, d: 0.3, tint: '#3a3c40' } },
  'Kent County Courthouse': { wall: 'terracotta', tint: '#ffffff' },
  'Secchia Center': { wall: 'precast', tint: '#f6f0e4' },
  'Van Andel Institute': { wall: 'glass-teal', tint: '#ffffff' },
  // The arena: red-brown brick to the concourse, grey metal panel above it, and a tall glass entrance on its
  // north-west corner, at Fulton and Ottawa.
  'Van Andel Arena': { wall: 'concrete', tint: '#c4c8cc', base: { wall: 'historic', h: 10, tint: BROWN }, glass: { toward: [-1, -1], wall: 'glass-blue', spread: 0.93 }, cornice: { h: 0.8, d: 0.4, tint: '#7c8086' }, penthouse: false },
  // The art museum: board-formed concrete with glass, a great flat canopy over its porch (see landmarks.js).
  'Grand Rapids Art Museum': { wall: 'concrete', tint: '#ffffff', glass: { toward: [-1, -0.4], wall: 'glass-dark' }, cornice: false, penthouse: false },
  // DeVos Place: a long wall of glass to the river, pale precast to the city.
  'DeVos Place Convention Center': { wall: 'precast', tint: '#f4f0e8', glass: { toward: [-1, 0], wall: 'glass-blue' }, cornice: { h: 0.6, d: 0.3, tint: '#cfcac0' }, penthouse: false },
  // The Ford Museum (Marvin DeWinter, 1981): two storeys on a triangle, steel and white precast, its long east side a
  // wall of glass three hundred feet long to the river and the city; a deep white fascia round its flat roof.
  'Gerald R. Ford Presidential Museum': { wall: 'precast', tint: '#fbfbf8', glass: { toward: [1, 0.04], wall: 'glass-blue', spread: 0.85 }, cornice: { h: 1.7, d: 1.0, tint: '#f6f6f3' }, penthouse: false },
  // The Public Museum: buff brick and glass on the river, and the planetarium's dome (landmarks.js).
  'Grand Rapids Public Museum': { wall: 'historic', tint: BUFF, glass: { toward: [1, 0], wall: 'glass-blue' }, cornice: { h: 0.6, d: 0.3, tint: '#d8d0c0' }, penthouse: false },
  'Calder Plaza Building': { wall: 'precast', tint: '#e8e2d6' },
  'Grand Rapids City Hall': { wall: 'precast', tint: '#c8beb0', cornice: false },
  'Kent County Administration': { wall: 'precast', tint: '#d4ccc0', cornice: false },
  'United States District Court for the Western District of Michigan': { wall: 'precast', tint: '#e0d8cc', cornice: false },
  'Historic Federal Building': { wall: 'limestone', tint: '#ffffff', cornice: { h: 1.8, d: 1.0, tint: '#f0e8d8' } },
  'Grand Rapids Public Library': { wall: 'limestone', tint: '#fffaf0', cornice: { h: 1.4, d: 0.9, tint: '#f0e8d8' } },
  "Saint Mark's Church": { wall: 'sandstone', tint: '#e0dcd4', cornice: false },
  'Fountain Street Church': { wall: 'sandstone', tint: '#d8ccc0', cornice: false },
  'L.V. Eberhard Center (EC)': { wall: 'precast', tint: '#fbf6ee', glass: { toward: [1, 0], wall: 'glass-blue' } },
  'Civic Theatre': { wall: 'historic', tint: BUFF, cornice: CORNICE },

  // Newer than the lidar (2016), or missed by it: heights from the list of the city's tallest buildings.
  'The Warner Building': { height: 59, wall: 'glass-blue', tint: '#f4f8ff', base: { wall: 'glass-dark', h: 6 }, cornice: { h: 0.6, d: 0.4, tint: '#e4e6e8' } },
  // River House (2008, 124 m, the tallest in the city) and Bridgewater Place (83 m), on the west bank at Bridge Street: blue-green glass.
  '05c942e6-e474-450a-8e44-daaceb64e888': { height: 124, wall: 'glass-teal', tint: '#eef8ff', base: { wall: 'precast', h: 14, tint: '#e8e2d8' }, cornice: { h: 1.2, d: 0.4, tint: '#a8b4b8' } },
  '68c6241b-faff-49d2-9c22-9770432931f6': { wall: 'glass-teal', tint: '#ffffff', base: { wall: 'precast', h: 8, tint: '#ece6dc' }, cornice: { h: 0.8, d: 0.3, tint: '#9aa8ac' } },
  // Plaza Towers (105 m), with the Courtyard hotel in its foot.
  '61f99372-48e6-4be4-96c5-01c403b8c6b9': { height: 105, wall: 'precast', tint: '#fbf3e4', base: { wall: 'glass-dark', h: 6 } },
  // Those the map leaves unnamed, by their id.
  // McKay Tower: sixteen storeys of cream stone, a colonnade three storeys tall at its foot, a heavy bracketed cornice.
  'e08b0d92-7cad-450c-8a2c-12240e22de18': { height: 79, wall: 'limestone', tint: '#fffaf0', base: { wall: 'limestone', h: 12, tint: '#e8e4dc' }, cornice: { h: 2.2, d: 1.4, tint: '#f2ecdf' } },
  // Campau Square Plaza: a box of bronze glass.
  '0a63640c-1dce-43f7-8de9-bdeb78cc69f4': { wall: 'glass-bronze', tint: '#ffffff', cornice: { h: 0.5, d: 0.2, tint: '#4a3a2c' } },
  // The old National City (PNC) bank at Pearl and Monroe: blue reflective glass.
  'bb0433bc-c1c5-4602-bd69-a2b3bf391fbe': { wall: 'glass-blue', tint: '#ffffff', cornice: { h: 0.5, d: 0.2, tint: '#b8bec6' } },
  '86c0ed36-dc1c-422f-9c64-1b6c394ee3a5': { wall: 'glass-blue', tint: '#ffffff', cornice: false },
  '8c23433b-4e95-4e7e-813c-8ad44fb5f192': { wall: 'glass-blue', tint: '#ffffff', base: { wall: 'concrete', h: 4.5, tint: '#d8d8d4' }, cornice: false },
  // 201 Monroe: red brick over a white stone base, a white cornice.
  '10ba7713-f2f2-4d96-ab51-79bd96c4ae95': { wall: 'historic', tint: RED, base: { wall: 'limestone', h: 8, tint: '#ffffff' }, cornice: { h: 1.5, d: 1.0, tint: '#f6f0e6' } },
  // Monroe Center, east of Rosa Parks Circle: the Italianate rows, red brick, cream paint and stone.
  'b7d31843-0996-46f7-ad7d-210a592b9a3a': { wall: 'historic-arched', tint: CREAM, base: { wall: 'shop', h: 4.4 }, cornice: CORNICE },
  'f418cb36-2247-4057-8be6-fc9848da4ca7': { wall: 'historic', tint: RED, base: { wall: 'shop', h: 4.4 }, cornice: CORNICE },
  '4da2399e-120f-407f-890d-4aef51591ced': { wall: 'historic-arched', tint: BUFF, base: { wall: 'shop', h: 4.4 }, cornice: CORNICE },
};

/** The middle of downtown (metres), and how far round it the buildings are dressed as the real ones are, not as a generic town. */
/**
 * What kind of building this is, in the words the styles below read: the `use` scripts/uses.py wrote (the map's class,
 * the businesses in it, the assessors' parcel, the land use, its shape), else Overture's class, else nothing.
 */
const USE_KIND = {
  house: 'house', townhouse: 'terrace', apartments: 'apartments', office: 'office', shop: 'retail', restaurant: 'retail', bar: 'retail',
  hotel: 'hotel', church: 'church', school: 'school', university: 'university', hospital: 'hospital', civic: 'civic',
  industrial: 'industrial', warehouse: 'warehouse', garage: 'garage', parking: 'parking', shed: 'shed', stadium: 'civic',
  station: 'transportation', mixed: 'commercial',
};
export const kindOf = (b) => USE_KIND[b.use] ?? (b.class || b.subtype);

export const CORE = { centre: [-330, -190], radius: 720 };

/** The palettes the core's brick comes in: mostly red and brown, some buff and cream. */
const BRICKS = [RED, RED, BROWN, DARKRED, BUFF, CREAM, '#c88a6c', '#e0b090'];
const GLASSES = ['glass-dark', 'glass-blue', 'glass-dark', 'glass-teal', 'glass-blue'];

/**
 * A look for a downtown building the table does not name, from its height and what it is: the low and middle
 * blocks are Victorian and Edwardian brick with shop fronts and a cornice; the tall ones are pre-war stone or
 * modern glass and precast.
 */
export function coreLook(b, h, key) {
  const r = unit(`${key}core`), s = unit(`${key}shade`);
  const cls = kindOf(b);
  if (['parking', 'garage', 'garages', 'carport', 'industrial', 'warehouse', 'house', 'detached', 'shed'].includes(cls)) return null;
  if (h < 6) return null;
  const brick = BRICKS[Math.floor(s * BRICKS.length) % BRICKS.length];
  if (h < 30) return { wall: r < 0.3 ? 'historic-arched' : 'historic', tint: brick, base: h > 7 ? { wall: 'shop', h: 4.4 } : null, cornice: CORNICE };
  if (h < 55) {
    if (r < 0.35) return { wall: 'limestone', tint: '#fffaf0', base: { wall: 'limestone', h: 8, tint: '#ece6da' }, cornice: { h: 1.6, d: 1.0, tint: '#f0e8d8' } };
    if (r < 0.6) return { wall: 'historic', tint: brick, base: { wall: 'limestone', h: 8, tint: STONE }, cornice: { h: 1.4, d: 0.9, tint: '#ebe2d0' } };
    if (r < 0.8) return { wall: 'precast', tint: '#f4ede0', base: { wall: 'glass-dark', h: 4.6 } };
    return { wall: GLASSES[Math.floor(s * GLASSES.length) % GLASSES.length], tint: '#ffffff', cornice: { h: 0.5, d: 0.25, tint: '#9aa0a6' } };
  }
  if (r < 0.3) return { wall: 'precast', tint: '#f4ede0', base: { wall: 'glass-dark', h: 6 } };
  return { wall: GLASSES[Math.floor(s * GLASSES.length) % GLASSES.length], tint: '#ffffff', base: { wall: 'glass-dark', h: 6 }, cornice: { h: 0.6, d: 0.3, tint: '#8a9096' } };
}
