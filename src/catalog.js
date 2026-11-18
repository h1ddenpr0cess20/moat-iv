import { registerParcels } from './parcels.js';
/**
 * Everything the game knows by name: the zones, the buildings, City Hall's
 * tiers and the ranks a city rises through. The simulation and the interface
 * both read this; nothing here does anything by itself.
 *
 * A week is a tick. Money is in thousands of dollars.
 */

/** The one good: the city's funds. */
export const RESOURCES = Object.freeze({
  gold: { name: 'Funds', store: null, spoil: 0 },
});
export const GOODS = Object.keys(RESOURCES);

/** Zones: land set aside for people and firms to build on themselves. */
export const ZONES = Object.freeze({
  res: { id: 'res', name: 'Low Residential', short: 'R', color: '#59b35f', cost: 1, desc: 'Frame houses and townhouses on their own lots, in the way of the neighborhoods round downtown, and the few real houses the map has left.' },
  dense: { id: 'dense', name: 'High Residential', short: 'R+', color: '#2f8a3a', cost: 2, desc: 'Flats, apartment blocks and residential towers. Many more people to a lot, but they want services close.' },
  com: { id: 'com', name: 'Commercial', short: 'C', color: '#4f8fd6', cost: 2, desc: 'Corner shops, Main Street blocks and, once the city is big, office towers; the real stores, hotels and offices of downtown. They want customers: people nearby.' },
  ind: { id: 'ind', name: 'Industrial', short: 'I', color: '#d6b24f', cost: 1, industry: true, desc: 'Warehouses, furniture factories and business parks: jobs, but noise and smoke. Keep them back from the homes.' },
});
export const ZONE_LIST = Object.keys(ZONES);
/** Zone numbers as they are stored on the map: 0 is none. */
export const ZONE_ID = Object.freeze(Object.fromEntries(ZONE_LIST.map((z, i) => [z, i + 1])));
export const ZONE_NAME = [null, ...ZONE_LIST];
/** There are no fields in this city. */
export const FARM_ZONES = [];
/** The zones industry grows on. */
export const INDUSTRY_ZONES = ['ind'];
/** The zones people live on. */
export const HOME_ZONES = ['res', 'dense'];

/** How many tiles a lot reaches back from the street before the block's core begins. */
export const PLOT_DEPTH = 3;
/** Kept for the tools: nothing in this city needs a farm. */
export const FARM_RADIUS = 0;

/**
 * The buildings. `size` is [width along the street, depth]; `cost` is what
 * they cost; `weeks` how long they take; `jobs` how many work there; `cap`
 * how many live there. `auto` ones grow by themselves on zoned land. `serve`
 * is what a civic building gives the tiles around it; `upkeep` its weekly
 * budget. `bonus` is what it does for the whole city (see sim/bonus.js);
 * `noisy` how loud it is to the homes around it; `where` the ground it needs.
 */
export const BUILDINGS = {
  // Grown on the zones.
  bungalow: { name: 'House', cat: 'housing', size: [2, 2], cost: { gold: 8 }, weeks: 3, crew: 2, cap: 4, auto: 'res', level: 1, desc: 'A frame house with a porch and a lawn, the way the neighborhoods round downtown are built.', design: { use: 'house', h: 7 } },
  ranchhouse: { name: 'Townhouses', cat: 'housing', size: [2, 2], cost: { gold: 14 }, weeks: 3, crew: 2, cap: 5, auto: 'res', level: 2, desc: 'A row of brick townhouses with stoops.', design: { use: 'townhouse', h: 9 } },
  beachhouse: { name: 'Walk-up Flats', cat: 'housing', size: [2, 2], cost: { gold: 24 }, weeks: 4, crew: 2, cap: 6, auto: 'res', level: 3, desc: 'Three storeys of flats over a shared porch.', design: { use: 'apartments', h: 11 } },
  dingbat: { name: 'Flats', cat: 'housing', size: [2, 2], cost: { gold: 16 }, weeks: 3, crew: 2, cap: 12, auto: 'dense', level: 1, desc: 'Brick flats, four floors, a fire escape down the side.', design: { use: 'apartments', h: 14 } },
  aptblock: { name: 'Apartment Block', cat: 'housing', size: [2, 3], cost: { gold: 36 }, weeks: 5, crew: 3, cap: 30, auto: 'dense', level: 2, desc: 'Six storeys of brick and glass.', design: { use: 'apartments', h: 22 } },
  condotower: { name: 'Residential Tower', cat: 'housing', size: [2, 3], cost: { gold: 80 }, weeks: 8, crew: 4, cap: 70, auto: 'dense', level: 3, desc: 'Glass and precast, a balcony on every floor, the river at the top.', design: { use: 'apartments', h: 48 } },
  stripmall: { name: 'Corner Shop', cat: 'market', size: [2, 2], cost: { gold: 12 }, weeks: 2, crew: 2, jobs: 6, shop: 1.2, auto: 'com', level: 1, desc: 'A shop front with a sign, a flat roof, and a regular or two.', design: { use: 'shop', h: 6 } },
  boutique: { name: 'Main Street Block', cat: 'market', size: [2, 2], cost: { gold: 26 }, weeks: 4, crew: 2, jobs: 14, shop: 2.8, auto: 'com', level: 2, desc: 'Brick shop fronts below, offices upstairs, a cornice on top.', design: { use: 'mixed', h: 12 } },
  officetower: { name: 'Office Tower', cat: 'market', size: [2, 3], cost: { gold: 90 }, weeks: 10, crew: 4, jobs: 60, shop: 7, auto: 'com', level: 3, desc: 'Forty floors of glass and precast. Wants a big city around it.', design: { use: 'office', h: 50 } },
  warehouse: { name: 'Warehouse', cat: 'industry', size: [2, 3], cost: { gold: 12 }, weeks: 3, crew: 2, jobs: 10, shop: 0.8, auto: 'ind', level: 1, desc: 'Grey block, loading docks and a lot behind.', design: { use: 'warehouse', h: 8 } },
  factory: { name: 'Furniture Factory', cat: 'industry', size: [2, 3], cost: { gold: 28 }, weeks: 4, crew: 3, jobs: 22, shop: 1.6, auto: 'ind', level: 2, smoky: true, desc: 'Sawtooth roof, a stack, and the smell of varnish. Good jobs, and nobody wants to live next door.', design: { use: 'industrial', h: 11 } },
  techpark: { name: 'Business Park', cat: 'industry', size: [2, 3], cost: { gold: 70 }, weeks: 6, crew: 3, jobs: 40, shop: 4, auto: 'ind', level: 3, desc: 'A low glass office campus on a green. Wants schools.', design: { use: 'office', h: 14 } },

  // The city's own.
  police: { name: 'Police Station', cat: 'safety', size: [2, 2], cost: { gold: 60 }, weeks: 6, crew: 3, jobs: 8, upkeep: 1.6, serve: { security: 1, radius: 14 }, desc: 'Keeps crime down within fourteen tiles.', design: { use: 'civic', h: 10 } },
  firehouse: { name: 'Fire Station', cat: 'safety', size: [2, 3], cost: { gold: 60 }, weeks: 6, crew: 3, jobs: 8, upkeep: 1.4, serve: { fire: 1, radius: 14 }, desc: 'Fires start less and are put out sooner within fourteen tiles.', design: { use: 'civic', h: 10 } },
  hospital: { name: 'Hospital', cat: 'safety', size: [3, 4], cost: { gold: 180 }, weeks: 12, crew: 4, jobs: 30, upkeep: 3, serve: { health: 1, radius: 20 }, rank: 1, desc: 'Healthier people, who live longer and stay.', design: { use: 'hospital', h: 24 } },
  school: { name: 'School', cat: 'civic', size: [3, 3], cost: { gold: 90 }, weeks: 8, crew: 3, jobs: 12, upkeep: 1.8, serve: { education: 1, radius: 14 }, desc: 'Educated people want better homes and bring better firms.', design: { use: 'school', h: 10 } },
  park: { name: 'Park', cat: 'civic', size: [3, 3], cost: { gold: 20 }, weeks: 2, crew: 2, upkeep: 0.3, serve: { cheer: 0.7, radius: 9 }, desc: 'Trees, a lawn, a fountain. Raises the land around it.' },
  plaza: { name: 'Plaza', cat: 'civic', size: [3, 3], cost: { gold: 45 }, weeks: 3, crew: 2, upkeep: 0.5, serve: { cheer: 1, radius: 11 }, desc: 'Pavers, cypresses and café umbrellas. The best heart for a donut block.' },
  clinic: { name: 'Urgent Care', cat: 'safety', size: [2, 2], cost: { gold: 50 }, weeks: 4, crew: 2, jobs: 6, upkeep: 0.8, serve: { health: 0.6, radius: 10 }, desc: 'A walk-in clinic in a brick storefront. Not a hospital, but close by.', design: { use: 'office', h: 8 } },
  library: { name: 'Public Library', cat: 'civic', size: [2, 2], cost: { gold: 40 }, weeks: 4, crew: 2, jobs: 4, upkeep: 0.6, serve: { education: 0.6, cheer: 0.2, radius: 10 }, desc: 'A glass reading room under a butterfly roof. Some of what a school does, for a corner lot.', design: { use: 'civic', h: 11 } },
  university: { name: 'University', cat: 'civic', size: [4, 4], cost: { gold: 320 }, weeks: 16, crew: 5, jobs: 40, upkeep: 4, serve: { education: 1, radius: 24 }, rank: 2, bonus: { tax: { com: 0.08, ind: 0.12 }, growth: 0.1 }, desc: 'Red tile, a bell tower and a quad. Educates a wide circle, and its graduates found startups: shops and industry pay more, and firms grow up sooner.', design: { use: 'university', h: 18 } },

  // Getting to the city, and getting things out of it.
  freightyard: { name: 'Freight Yard', cat: 'transport', size: [4, 4], cost: { gold: 260 }, weeks: 14, crew: 5, jobs: 30, upkeep: 2.4, rank: 1, noisy: 0.6, bonus: { demand: { ind: 0.25 }, tax: { ind: 0.2 }, pull: 'ind' }, desc: 'Rail sidings, a gantry crane and stacks of boxes. Ships what the city makes: industry wants more land and pays more, and grows toward the yard. Noisy.', design: { use: 'warehouse', h: 13 } },

  airport: { name: 'Airport', cat: 'transport', size: [6, 10], cost: { gold: 900 }, weeks: 30, crew: 8, jobs: 60, upkeep: 6, rank: 2, noisy: 1, bonus: { demand: { com: 0.2, res: 0.1 }, tax: { com: 0.15 }, tourism: 4, tourismK: 0.5, growth: 0.2, pull: 'com' }, desc: 'A runway, a glass terminal and a control tower. Brings tourists and business: shops want more land and pay more, every attraction draws half as many visitors again, and towers go up sooner. Very loud: keep it away from the homes.' },

  // The cloud.
  datacenter: { name: 'Data Center', cat: 'transport', size: [3, 4], cost: { gold: 380 }, weeks: 14, crew: 5, jobs: 12, upkeep: 2, rank: 1, noisy: 0.3, bonus: { tax: { com: 0.1, ind: 0.06 }, demand: { com: 0.1, ind: 0.05 }, growth: 0.08 }, desc: 'Windowless halls of servers, a yard of chillers on the roof and backup generators out back. The city’s startups run on it: shops and industry want more land and pay more, and firms grow up sooner. Its fans hum all night.', design: { use: 'warehouse', h: 12 } },

  // Somewhere to go on a Saturday.
  stadium: { name: 'Stadium', cat: 'leisure', size: [5, 5], cost: { gold: 420 }, weeks: 20, crew: 6, jobs: 20, upkeep: 3, rank: 2, noisy: 0.4, serve: { cheer: 1, radius: 22 }, bonus: { tourism: 4, mood: 3 }, desc: 'A bowl of seats under the lights, for the city’s own team. Cheers half the city, lifts the mood, and fills with visitors on game day.', design: { use: 'stadium', h: 24 } },
  // Downtown: the other kinds of building 3d-city draws, to set down where the city needs them.
  church: { name: 'Church', cat: 'downtown', size: [3, 4], cost: { gold: 70 }, weeks: 6, crew: 3, jobs: 2, upkeep: 0.3, serve: { cheer: 0.5, radius: 9 }, desc: 'A brick church with a steeple. Cheers the people near it.', design: { use: 'church', h: 14, kind: 'church' } },
  hotel: { name: 'Hotel', cat: 'downtown', size: [3, 3], cost: { gold: 120 }, weeks: 8, crew: 4, jobs: 20, upkeep: 0.5, bonus: { tourism: 1.5 }, desc: 'Visitors stay here and spend in the city.', design: { use: 'hotel', h: 26, kind: 'hotel' } },
  parkingramp: { name: 'Parking Ramp', cat: 'downtown', size: [3, 3], cost: { gold: 40 }, weeks: 4, crew: 3, jobs: 2, upkeep: 0.3, shop: 1.5, bonus: { tourism: 0.6 }, desc: 'A concrete deck of cars above the street. Downtown shoppers and visitors have somewhere to leave the car.', design: { use: 'parking', h: 12, kind: 'parking' } },
  trainstation: { name: 'Train Station', cat: 'downtown', size: [4, 3], cost: { gold: 140 }, weeks: 8, crew: 4, jobs: 8, upkeep: 1, serve: { cheer: 0.2, radius: 8 }, bonus: { tourism: 2 }, desc: 'Brings visitors in by train.', design: { use: 'station', h: 9, kind: 'station' } },
  fastfood: { name: 'Fast-Food Restaurant', cat: 'downtown', size: [2, 2], cost: { gold: 14 }, weeks: 2, crew: 2, jobs: 6, shop: 1.2, desc: 'A drive-through, a sign and a few booths.', design: { use: 'restaurant', h: 5, kind: 'fastfood', names: ['burger'] } },
  gasstation: { name: 'Gas Station', cat: 'downtown', size: [2, 3], cost: { gold: 16 }, weeks: 2, crew: 2, jobs: 4, shop: 1, desc: 'Pumps under a canopy and a little store.', design: { use: 'shop', h: 5, kind: 'mart', names: ['gas station'] } },
  bigbox: { name: 'Big-Box Store', cat: 'downtown', size: [5, 4], cost: { gold: 60 }, weeks: 5, crew: 3, jobs: 24, shop: 3.5, noisy: 0.1, desc: 'A wide low store and a car park.', design: { use: 'shop', h: 9, kind: 'bigbox' } },
  heritagehouse: { name: 'Heritage Hill House', cat: 'downtown', size: [2, 2], cost: { gold: 30 }, weeks: 4, crew: 2, cap: 6, desc: 'A Queen Anne, Italianate, colonial or foursquare house, as Heritage Hill has them.', design: { use: 'house', h: 10, kind: 'heritage' } },
  mainstreet: { name: 'Main Street Shops', cat: 'downtown', size: [3, 2], cost: { gold: 24 }, weeks: 3, crew: 2, jobs: 12, shop: 2.4, desc: 'Brick shop fronts with awnings, offices over them.', design: { use: 'shop', h: 12, kind: 'mainstreet' } },
  collegehall: { name: 'College Hall', cat: 'downtown', size: [3, 3], cost: { gold: 110 }, weeks: 7, crew: 3, jobs: 12, upkeep: 1.2, serve: { education: 0.7, radius: 12 }, desc: 'Lecture halls and a lawn.', design: { use: 'university', h: 18, kind: 'college' } },
  civichall: { name: 'Civic Hall', cat: 'downtown', size: [3, 3], cost: { gold: 100 }, weeks: 7, crew: 3, jobs: 10, upkeep: 0.8, serve: { cheer: 0.4, education: 0.2, radius: 12 }, desc: 'A portico, a flag and the city’s business.', design: { use: 'civic', h: 16, kind: 'civic' } },
};
registerParcels(BUILDINGS);

/** The order the build menu shows them in. */
export const CATEGORIES = Object.freeze([
  { id: 'safety', name: 'Safety' },
  { id: 'civic', name: 'Civic' },
  { id: 'transport', name: 'Infrastructure' },
  { id: 'leisure', name: 'Leisure' },
  { id: 'downtown', name: 'Downtown' },
  { id: 'landmark', name: 'Landmarks' },
]);

/** The buildings the zones grow, by zone and level. */
export const GROWN = Object.freeze({
  res: ['bungalow', 'ranchhouse', 'beachhouse'],
  dense: ['dingbat', 'aptblock', 'condotower'],
  com: ['stripmall', 'boutique', 'officetower'],
  ind: ['warehouse', 'factory', 'techpark'],
});

/** The founder's tower beside the river, the company's HQ, as it grows: what the work costs, how many districts the city may keep, and the staff. */
export const CASTLE_LEVELS = Object.freeze([
  { name: 'Company Offices', cost: null, weeks: 0, wards: 3, jobs: 4, rank: 0, desc: 'Your company’s first tower, and your penthouse on top. Glass and white stone on a plaza by the river.' },
  { name: 'Corporate Headquarters', cost: { gold: 600 }, weeks: 16, wards: 6, jobs: 8, rank: 1, desc: 'A company this size deserves a third setback and a taller spire.' },
  { name: 'Grand Plaza', cost: { gold: 1800 }, weeks: 28, wards: 12, jobs: 14, rank: 2, desc: 'A gold crown you can see from the river, and a helipad for the board.' },
  { name: 'Ice Moat Tower', cost: { gold: 5000 }, weeks: 48, wards: 49, jobs: 24, rank: 3, desc: 'The tallest tower in Michigan, lit gold all night. You have made Grand Rapids the Furniture Capital of the World.' },
]);

/** The ranks, and what a city needs to be called one. */
export const RANKS = Object.freeze([
  { name: 'Rapids Village', short: 'Rapids Village', need: {} },
  { name: 'Furniture Town', short: 'Furniture Town', need: { pop: 300, wards: 2 } },
  { name: 'Market City', short: 'Market City', need: { pop: 1500, wards: 4, building: 'school' } },
  { name: 'Great Lakes City', short: 'Great Lakes City', need: { pop: 5000, wards: 8, castle: 3 } },
  { name: 'Furniture Capital of the World', short: 'Furniture Capital', need: { pop: 12000, wards: 12, building: 'hospital' } },
]);

/** Roads, and what they cost a tile. */
export const ROADS = Object.freeze({
  dirt: { name: 'Street', cost: { gold: 1 }, desc: 'Two lanes of asphalt.' },
  avenue: { name: 'Avenue', cost: { gold: 2 }, desc: 'Four lanes, two tiles wide, with a double yellow line down the middle. Drag along the ground: it is laid on the tiles you drag over and the row beside them.' },
  bridge: { name: 'Bridge', cost: { gold: 6 }, desc: 'A bridge over the river: drag from one bank to the other, up to six tiles of water, in a straight line. The ice wall is crossed only at its gates.' },
  cobble: { name: 'Boulevard', cost: { gold: 3 }, desc: 'Trees down the median. Land along it is worth more.' },
});

/** The cost of raising an ice wall around a new district: it grows with the city and with how hard the ground is. */
export function annexCost(owned, hardness = 0) {
  const k = 1 + hardness * 0.8;
  return { gold: Math.round((300 + owned * 180) * k / 10) * 10 };
}

/** How many weeks the wall takes, and how many hands it wants. */
export function annexWork(owned) {
  return { weeks: 10 + owned * 2, crew: Math.min(24, 8 + owned * 2) };
}

/** What the city starts with. */
export const START = Object.freeze({
  stock: { gold: 1200 },
  pop: { children: 3, adults: 10, elders: 1 },
});

/** Money as people write it: the books are kept in thousands, so 450 is $450,000 and 1,250 is $1.25M. */
export function money(n) {
  const sign = n < 0 ? '−' : '';
  const k = Math.abs(n);
  const short = (x, unit) => `${sign}$${(+x.toFixed(x >= 100 ? 0 : x >= 10 ? 1 : 2)).toLocaleString('en-US')}${unit}`;
  if (k >= 1e6) return short(k / 1e6, 'B');
  if (k >= 1000) return short(k / 1000, 'M');
  return `${sign}$${Math.round(k * 1000).toLocaleString('en-US')}`;
}
export const costText = (cost) => Object.entries(cost).filter(([, n]) => n > 0).map(([, n]) => money(n)).join(', ');
export const canPay = (stock, cost) => Object.entries(cost).every(([k, n]) => (stock[k] ?? 0) >= n);
export function pay(stock, cost, k = 1) {
  for (const [r, n] of Object.entries(cost)) stock[r] = (stock[r] ?? 0) - n * k;
}
