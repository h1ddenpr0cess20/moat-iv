import * as F from './facade.js';
import { Mesh, inset, offsetRing } from './mesh.js';
import { LOOKS } from './looks.js';
import { Builder, CELL } from '../builder.js';

/**
 * Every footprint built as its own kind of building: Rivertown's designs, ported from its Blender generator
 * (citygen/buildings.py) to run here, live, as 3d-city builds the city.
 *
 * `archetype()` decides what a building is (from its use, the map's class, the businesses inside it, its size and
 * height), and each archetype has a builder: houses with porches and gable or hip roofs, Heritage Hill's period
 * houses, row houses with stoops, main street brick blocks with shop fronts and awnings, churches with steeples,
 * schools, colleges, hospitals, civic buildings with porticoes, hotels, apartments, glass and precast office towers,
 * factories, warehouses with loading docks, parking decks, a station, garages and sheds.
 *
 * Everything here is in Blender's frame (x east, y north, z up): a 3d-city point (x, z) is (x, -z) here.
 */

const BRICKS = ['8e3b2c', 'a04a32', '7a3a2a', '6b3326', 'b8875a', 'c9a77a', '9a5a3a', 'a8654a', '5c2e24'];
const GLASSES = ['M_Glass_Blue', 'M_Glass_Dark', 'M_Glass_Teal', 'M_Glass_Bronze', 'M_Glass_Silver', 'M_Glass_Blue'];
const SIDINGS = ['e8e2d4', 'd4d8d2', 'a9b8bf', '7f8f7a', 'c9b38e', 'f1ede2', '8c9aa6', 'b6a58d', '6e7f8c', 'd9cbb0', '9c4a3c', '41505c', 'e3d7a8', 'f5f3ee', '5d6b56'];
const SHINGLES = ['3c3c3e', '4a4642', '2e3134', '5a4a3e', '545a5e', '6a3a30'];
const HERITAGE_STYLES = ['queen', 'queen', 'queen', 'italianate', 'colonial', 'foursquare', 'foursquare'];
const HERITAGE_PAINT = ['7f8f7a', '5d6b56', 'e3d7a8', 'f1ede2', '8c9aa6', '6e7f8c', '9c4a3c', 'c9b38e', 'b6a58d', 'd4d8d2'];
const STUCCO = ['e9dfcc', 'd8c9ae', 'efe9df', 'cdb79a', 'e4d2bf', 'bfb6a8'];
const SIGNS = ['b3242a', '1f4e8c', '1f6b3a', 'e0a21b', '2b2b2b', '6b2a7a', 'd9581f', '0f7f86', 'f2f2f2', '7a1f2b'];
const AWNINGS = ['7a1f2b', '1f3f5a', '2f5a3a', '3a3a3a', 'b8862a', '8a3a1a', '264a7a'];
const BRANDS = [['c8102e', 'ffffff'], ['00843d', 'ffd100'], ['003da5', 'ffffff'], ['ff6a13', 'ffffff'], ['ffd100', 'c8102e'], ['101820', 'e03c31']];

const FUEL_WORDS = ['gas station', 'fuel', 'speedway', 'marathon', 'shell', 'bp', 'mobil', 'citgo', 'sunoco', 'admiral', 'valero', 'exxon', 'phillips 66', 'meijer gas', 'costco gas', "sam's club fuel", 'circle k', '7-eleven', 'mobil mart'];
const NOT_FUEL = ['t-mobile', 'boost mobile', 'gaslight', 'gas light'];
const FAST_WORDS = ['burger', 'mcdonald', 'wendy', 'taco', 'subway', 'pizza', 'kfc', 'arby', 'popeyes', 'culver', 'dairy', 'sonic', 'chick', 'hardee', 'jimmy john', 'qdoba', 'chipotle', 'panera', 'coffee', 'starbucks', 'dunkin', 'tim horton'];

/** Buildings built as one of Heritage Hill's kind of house wherever they stand (3d-city's FEATURED). */
const FEATURED = { 'Jenison Museum': { style: 'queen', paint: 'a8b494' } };

const DEFAULT_H = {
  house: 7.0, townhouse: 9.0, garage: 3.4, shed: 3.0, shop: 5.5, restaurant: 5.0, bar: 5.0, apartments: 12.0, mixed: 12.0,
  office: 14.0, hotel: 20.0, church: 13.0, school: 9.0, university: 14.0, hospital: 18.0, civic: 12.0, industrial: 9.0,
  warehouse: 8.0, parking: 12.0, stadium: 20.0, station: 8.0, canopy: 5.2,
};

const pick = (list, f) => list[Math.floor(f * list.length) % list.length];
const enc = new TextEncoder();
/** A stable number in [0, 1) from a string (FNV-1a over its bytes), as Rivertown's, so each building looks the same. */
export function unit(key) {
  let h = 2166136261 >>> 0;
  for (const ch of enc.encode(key)) h = Math.imul(h ^ ch, 16777619) >>> 0;
  return (h % 100000) / 100000;
}

export function inside(poly, x, y) {
  let c = false;
  for (let k = 0, n = poly.length; k < n; k++) {
    const [x1, y1] = poly[k], [x2, y2] = poly[(k + 1) % n];
    if ((y1 > y) !== (y2 > y) && x < ((x2 - x1) * (y - y1)) / (y2 - y1 + 1e-12) + x1) c = !c;
  }
  return c;
}

export function edgeDistance(poly, x, y) {
  let best = 1e18;
  for (let k = 0, n = poly.length; k < n; k++) {
    const [x1, y1] = poly[k], [x2, y2] = poly[(k + 1) % n];
    const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy;
    const t = L === 0 ? 0 : Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / L));
    const px = x1 + t * dx - x, py = y1 + t * dy - y;
    best = Math.min(best, px * px + py * py);
  }
  return Math.sqrt(best);
}

/** A footprint (3d-city's [x, z] ring) in Blender XY, without the closing point or points 5 cm apart, counter-clockwise; and its area. */
export function ringCcw(ring) {
  let pts = ring.map(([x, z]) => [x, -z]);
  if (pts.length > 1 && Math.abs(pts[0][0] - pts.at(-1)[0]) < 1e-6 && Math.abs(pts[0][1] - pts.at(-1)[1]) < 1e-6) pts = pts.slice(0, -1);
  const out = [];
  for (const p of pts) if (!out.length || Math.hypot(p[0] - out.at(-1)[0], p[1] - out.at(-1)[1]) > 0.05) out.push(p);
  if (out.length > 2 && Math.hypot(out[0][0] - out.at(-1)[0], out[0][1] - out.at(-1)[1]) < 0.05) out.pop();
  let a = 0;
  for (let i = 0; i < out.length; i++) { const p = out[i], q = out[(i + 1) % out.length]; a += p[0] * q[1] - q[0] * p[1]; }
  if (a < 0) out.reverse();
  return [out, Math.abs(a) / 2];
}

export function heightOf(b) {
  const m = b.measured;
  if (m && (m.cover ?? 0) >= 0.25 && (m.height ?? 0) >= 2.5) return +m.height;
  if (b.height && b.height > 1.5) return +b.height;
  if (b.floors) return 3.6 * b.floors;
  return DEFAULT_H[b.use] ?? 8.0;
}

const has = (joined, words) => words.some((w) => new RegExp(`\\b${w.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(joined));

export function archetype(b, h, area, names) {
  const use = b.use || '', cls = b.class || '', joined = names.join(' ');
  if (['roof', 'carport'].includes(cls) || (cls === '' && b.subtype === 'outbuilding' && area > 60)) return 'canopy';
  if (has(joined, FUEL_WORDS) && area < 900 && ['shop', 'restaurant', ''].includes(use) && !has(joined, NOT_FUEL)) return 'mart';
  if (['house', 'townhouse'].includes(use) || ['house', 'detached', 'residential', 'semidetached_house'].includes(cls)) {
    if (use === 'townhouse' || (area > 260 && h < 13 && cls !== 'house')) return 'townhouse';
    if (h < 14 && area < 500) return 'house';
    return 'apartments';
  }
  if (['garage', 'shed'].includes(use) || ['garage', 'garages', 'shed'].includes(cls) || (h < 4.2 && area < 90)) return 'shed';
  if (cls === 'church' || use === 'church' || b.subtype === 'religious') return 'church';
  if (['restaurant', 'bar', 'shop'].includes(use) && h < 7.5 && area > 60 && area < 650 && has(joined, FAST_WORDS)) return 'fastfood';
  if (use === 'school') return 'school';
  if (use === 'university' || cls === 'university') return 'college';
  if (use === 'hospital') return 'hospital';
  if (use === 'civic' || ['civic', 'government', 'library', 'public'].includes(cls)) return 'civic';
  const direct = { hotel: 'hotel', apartments: 'apartments', parking: 'parking', industrial: 'factory', warehouse: 'warehouse', stadium: 'stadium', station: 'station' };
  if (direct[use]) return direct[use];
  if (use === 'office' || h >= 30) return 'office';
  if (use === 'mixed') return 'mixed';
  if (area > 2500 && h < 10) return 'bigbox';
  return 'mainstreet';
}

function hull(pts) {
  const s = [...new Map(pts.map((p) => [`${p[0]},${p[1]}`, p])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (s.length < 3) return s;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of s) { while (lo.length >= 2 && cr(lo.at(-2), lo.at(-1), p) <= 0) lo.pop(); lo.push(p); }
  for (const p of s.slice().reverse()) { while (up.length >= 2 && cr(up.at(-2), up.at(-1), p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

/** The smallest rectangle round a footprint: centre, long axis u, short axis v, half-lengths A >= B. */
export function obb(ring) {
  const hp = hull(ring);
  let best = null;
  for (let i = 0; i < hp.length; i++) {
    const a = hp[i], b = hp[(i + 1) % hp.length];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), c = Math.cos(ang), s = Math.sin(ang);
    const us = hp.map((p) => p[0] * c + p[1] * s), vs = hp.map((p) => -p[0] * s + p[1] * c);
    const u0 = Math.min(...us), u1 = Math.max(...us), v0 = Math.min(...vs), v1 = Math.max(...vs);
    const area = (u1 - u0) * (v1 - v0);
    if (!best || area < best[0]) best = [area, ang, u0, u1, v0, v1];
  }
  const [, ang, u0, u1, v0, v1] = best;
  const c = Math.cos(ang), s = Math.sin(ang), cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
  let A = (u1 - u0) / 2, B = (v1 - v0) / 2, u = [c, s], v = [-s, c];
  if (B > A) { [A, B] = [B, A]; const ou = u; u = v; v = [-ou[0], -ou[1]]; }
  return [[cu * c - cv * s, cu * s + cv * c], u, v, A, B];
}

function randomPoints(ring, n, margin, key, tries = 60) {
  const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const out = [];
  for (let k = 0; k < tries && out.length < n; k++) {
    const x = x0 + unit(`${key}x${k}`) * (x1 - x0), y = y0 + unit(`${key}y${k}`) * (y1 - y0);
    if (inside(ring, x, y) && edgeDistance(ring, x, y) > margin && out.every((o) => Math.hypot(x - o[0], y - o[1]) > margin * 1.6)) out.push([x, y]);
  }
  return out;
}

export function centroid(ring) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % ring.length], c = x1 * y2 - x2 * y1;
    a += c; cx += (x1 + x2) * c; cy += (y1 + y2) * c;
  }
  if (Math.abs(a) < 1e-9) return [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
  return [cx / (3 * a), cy / (3 * a)];
}

const ringArea = (r) => Math.abs(r.reduce((s, p, i) => s + p[0] * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * p[1], 0)) / 2;

// ---- the landmarks 3d-city designed (its looks), as Rivertown refined them -------------------------------------
/** 3d-city's tints multiply a pale painted texture; the scanned brick wants the colour itself, deeper. */
function brickFromTint(tint) {
  const t = tint.replace('#', ''), k = 0.5;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(t.slice(i, i + 2), 16));
  const h = (v) => Math.floor(v * k).toString(16).padStart(2, '0');
  return `M_Brick_${h(r)}${h(g)}${h(b)}`;
}
const GLASS_OF = { 'glass-bronze': 'M_Glass_Bronze', 'glass-blue': 'M_Glass_Blue', 'glass-teal': 'M_Glass_Teal', 'glass-dark': 'M_Glass_Dark', curtain: 'M_Glass_Silver' };
const STONE_OF = { limestone: 'M_Limestone', sandstone: 'M_Sandstone', terracotta: 'M_Terracotta', precast: 'M_Precast', concrete: 'M_Concrete_Board' };

export function wallOf(kind, tint) {
  if (kind === 'historic' || kind === 'historic-arched') return brickFromTint(tint || '#d08a70');
  if (kind === 'precast' && tint && Math.min(...[0, 2, 4].map((i) => parseInt(tint.replace('#', '').slice(i, i + 2), 16))) < 0xc8) return `M_Stucco_${tint.replace('#', '').toLowerCase()}`;
  return STONE_OF[kind] ?? GLASS_OF[kind] ?? 'M_Precast';
}

function landmarkStyle(look, h) {
  const wallKind = look.wall ?? 'precast', wall = wallOf(wallKind, look.tint);
  const base = look.base || {}, corn = look.cornice, glassSide = look.glass;
  let st;
  if (GLASS_OF[wallKind]) {
    st = { kind: 'curtain', glass: wall, spandrel: 'M_Spandrel', mullion: ['glass-blue', 'glass-teal'].includes(wallKind) ? 'M_Mullion_Silver' : 'M_Mullion',
      floor_h: 3.9, ground_h: base.h ?? 6.0, bay: 1.5, ground: 'lobby', base: 'M_Stone_Base', parapet: 1.4, roof: 'M_Roof_Membrane', wall: 'M_Spandrel', cap: 'M_Mullion_Silver' };
  } else {
    const arched = wallKind === 'historic-arched', brick = wallKind === 'historic' || arched;
    st = { kind: 'punched', wall, floor_h: 3.9, ground_h: base.h ?? 4.6, bay: brick ? 2.7 : 3.0, win: brick ? [0.5, 0.85, 3.0] : [0.58, 0.8, 2.9],
      glass: brick ? 'M_Window' : 'M_Glass_Dark', depth: 0.3, frame: brick ? 'M_Frame_White' : 'M_Mullion', mullions: brick ? 0 : 1, transom: brick, sill: true,
      lintel: brick ? 'M_Limestone' : null, keystone: arched, ground: 'same', base: wall, parapet: 1.0, roof: brick ? 'M_Roof_Membrane' : 'M_Roof_Gravel', tank: brick && h > 18 };
  }
  const bw = base.wall;
  if (bw === 'shop') Object.assign(st, { ground: 'storefront', base: 'M_Stone_Base', sign: 'M_Fascia' });
  else if (GLASS_OF[bw]) Object.assign(st, { ground: 'lobby', base: GLASS_OF[bw] });
  else if (bw) {
    Object.assign(st, { ground: 'same', base: wallOf(bw, base.tint) });
    if (['limestone', 'precast', 'concrete'].includes(bw)) st.belt = [wallOf(bw, null), 0.45];
  }
  if (corn) {
    let mat = st.kind === 'punched' ? 'M_Limestone' : 'M_Mullion';
    if (['#2a2628', '#3a3f44', '#3a3c40', '#5a4636', '#4a3a2c'].includes((corn.tint ?? '').toLowerCase())) mat = 'M_Fascia';
    st.cornice = [mat, Math.max(0.5, corn.h ?? 1.0)];
  } else if (corn === false) st.cornice = null;
  if (glassSide) {
    const d = glassSide.toward ?? [1, 0];
    st.glass_toward = [[d[0], -d[1]], glassSide.spread ?? 0.5, GLASS_OF[glassSide.wall] ?? 'M_Glass_Blue'];
  }
  if (look.penthouse === false) st.no_penthouse = true;
  return st;
}

// ---- downtown as 3d-city dresses it (its looks.js coreLook) ----------------------------------------------------
const CORE = [-330.0, 190.0, 720.0]; // its middle in Blender XY, and radius
const HERITAGE = [495.0, 1118.0, -1110.0, 690.0]; // Heritage Hill in Blender XY: x0, x1, y0, y1
const CORE_KINDS = ['mainstreet', 'office', 'mixed', 'apartments', 'hotel', 'fastfood', 'bigbox'];
const TIERED = ['landmark', 'office', 'mixed', 'hotel', 'apartments', 'civic', 'hospital', 'college', 'mainstreet', 'bigbox', 'parking', 'school'];
const inHeritageHill = (x, y) => HERITAGE[0] < x && x < HERITAGE[1] && HERITAGE[2] < y && y < HERITAGE[3];

function coreLook(b, h, key) {
  const RED = '#d08a70', BROWN = '#a8705c', BUFF = '#fbecc8', CREAM = '#fff6e2', DARKRED = '#b06a58', STONE = '#f4ecdc';
  const bricks = [RED, RED, BROWN, DARKRED, BUFF, CREAM, '#c88a6c', '#e0b090'];
  const glasses = ['glass-dark', 'glass-blue', 'glass-dark', 'glass-teal', 'glass-blue'];
  const corn = { h: 1.1, d: 0.7, tint: '#e8e0d0' };
  const r = unit(key + 'core'), s = unit(key + 'shade');
  if (['parking', 'garage', 'industrial', 'warehouse', 'house', 'shed'].includes(b.use) || h < 6) return null;
  const brick = pick(bricks, s);
  if (h < 30) return { wall: r < 0.3 ? 'historic-arched' : 'historic', tint: brick, base: h > 7 ? { wall: 'shop', h: 4.4 } : null, cornice: corn };
  if (h < 55) {
    if (r < 0.35) return { wall: 'limestone', tint: '#fffaf0', base: { wall: 'limestone', h: 8, tint: '#ece6da' }, cornice: { h: 1.6, d: 1.0, tint: '#f0e8d8' } };
    if (r < 0.6) return { wall: 'historic', tint: brick, base: { wall: 'limestone', h: 8, tint: STONE }, cornice: { h: 1.4, d: 0.9, tint: '#ebe2d0' } };
    if (r < 0.8) return { wall: 'precast', tint: '#f4ede0', base: { wall: 'glass-dark', h: 4.6 } };
    return { wall: pick(glasses, s), tint: '#ffffff', cornice: { h: 0.5, d: 0.25, tint: '#9aa0a6' } };
  }
  if (r < 0.3) return { wall: 'precast', tint: '#f4ede0', base: { wall: 'glass-dark', h: 6 } };
  return { wall: pick(glasses, s), tint: '#ffffff', base: { wall: 'glass-dark', h: 6 }, cornice: { h: 0.6, d: 0.3, tint: '#8a9096' } };
}

/** The ground's height at a Blender XY point, from a terrain grid as a tile sends it ({ x0, z0, cell, nx, nz, h }). */
export function groundOf({ x0, z0, cell, nx, nz, h }) {
  return (x, y) => {
    const fx = Math.max(0, Math.min(nx - 1.001, (x - x0) / cell)), fz = Math.max(0, Math.min(nz - 1.001, (-y - z0) / cell));
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    const a = h[j * nx + i], b = h[(j + 1) * nx + i], c = h[(j + 1) * nx + i + 1], d = h[j * nx + i + 1];
    return tz >= tx ? a + (c - b) * tx + (b - a) * tz : a + (d - a) * tx + (c - d) * tz;
  };
}

/**
 * Buildings' outlines ([cell key, ring ([x, z]), top]) -> (x, y, z) metres -> the cell key of the building the point
 * is inside (within its outline and under its top), or null.
 */
export function insideOf(shells) {
  const C = 32, grid = new Map();
  for (const sh of shells) {
    const r = sh[1];
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of r) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    for (let j = Math.floor(z0 / C); j <= Math.floor(z1 / C); j++) for (let i = Math.floor(x0 / C); i <= Math.floor(x1 / C); i++) {
      const k = `${i},${j}`;
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(sh);
    }
  }
  return (x, y, z) => {
    for (const [key, ring, top] of grid.get(`${Math.floor(x / C)},${Math.floor(z / C)}`) ?? []) if (y < top && inside(ring, x, z)) return key;
    return null;
  };
}

// ---- the builder -----------------------------------------------------------------------------------------------
export class Designs {
  /** `ground(x, y)`: the ground's height at a Blender XY point; `streetDir(x, y)`: a unit vector toward the nearest
   * street, or null; `creative`: the greater city (freer choices of style). */
  constructor({ ground, streetDir, creative = false, lazy = null }) {
    this.lazy = lazy;
    this.shells = [];
    this.ground = ground;
    this.streetDir = streetDir;
    this.creative = creative;
    this.counts = {};
  }

  /** Builds `b` (a 3d-city building) on `builder`; `names`: the businesses in it, lower case. Returns its kind. */
  build(builder, b, names = [], near = []) {
    const [ring, area] = ringCcw(b.rings[0]);
    if (ring.length < 3 || area < 6) return null;
    // Coarse (and solid) now, for seeing from afar and for the ball; in full detail when the camera first comes
    // near its cell (`lazy`, made by `detail`), or now if there is no `lazy`.
    const [x, y] = centroid(ring), at = [x, -y];
    const kind = this.design(new Mesh(builder, { lod: 'far', at, coarse: true }), b, ring, area, names, near);
    if (this.lazy) {
      const key = `${Math.floor(at[0] / CELL)}|${Math.floor(at[1] / CELL)}`;
      // Its outline and top, so the camera can tell when it is inside it (scene.js shows the cell's far version then:
      // seen from inside, a wall is not drawn, but the sides of its windows' openings would be).
      const top = this.ground(x, y) + (LOOKS[b.id]?.height ?? LOOKS[b.name]?.height ?? heightOf(b)) + 3;
      this.shells.push([key, b.rings[0], top]);
      if (!this.lazy.has(key)) this.lazy.set(key, []);
      // All it needs to be built again anywhere (the page's thread, for a tile built in a worker): the way to the street.
      this.lazy.get(key).push([b, names, near, this.streetDir(x, y)]);
    } else this.design(new Mesh(builder, { lod: 'detail', at, solid: false }), b, ring, area, names, near);
    if (kind) this.counts[kind] = (this.counts[kind] ?? 0) + 1;
    return kind;
  }

  /** The full detail of a cell's buildings (as `lazy` holds them), as parts. */
  detail(entries) {
    const builder = new Builder(), streetDir = this.streetDir;
    for (const [b, names, near, dir] of entries) {
      const [ring, area] = ringCcw(b.rings[0]);
      const [x, y] = centroid(ring);
      this.streetDir = () => dir;
      this.design(new Mesh(builder, { lod: 'detail', at: [x, -y], solid: false }), b, ring, area, names, near);
    }
    this.streetDir = streetDir;
    return builder.finish();
  }

  design(M, b, ring, area, names, near) {
    let look = LOOKS[b.id] ?? (b.name ? LOOKS[b.name] : null) ?? null;
    const h = look?.height ? +look.height : heightOf(b);
    let kind = look ? 'landmark' : archetype(b, h, area, names);
    // Moat IV: a building that is asked for as a kind of building (a church, a gas station) is built as that kind.
    if (b.kind && !look && this[`b_${b.kind}`]) kind = b.kind;
    // Built as a house whatever its use says: the Jenison Museum, an old house with a turret.
    const featured = FEATURED[b.name];
    if (featured) { kind = 'heritage'; look = null; }
    const c0 = centroid(ring);
    if (!this.creative && !look && !featured) {
      if (['house', 'townhouse', 'apartments'].includes(kind) && inHeritageHill(...c0) && area >= 55 && area <= 700 && h <= 18) kind = 'heritage';
      else if (CORE_KINDS.includes(kind) && Math.hypot(c0[0] - CORE[0], c0[1] - CORE[1]) < CORE[2]) {
        // Downtown, the buildings the table does not name look as 3d-city dressed them.
        let cl = coreLook(b, h, b.id);
        if (cl) {
          if (['shop', 'restaurant', 'bar'].includes(b.use)) cl = { ...cl, base: { wall: 'shop', h: 4.4 } };
          look = cl; kind = 'landmark';
        }
      }
    }
    const gs = ring.map((p) => this.ground(p[0], p[1]));
    const gz = Math.min(...gs), top = gs.reduce((s, v) => s + v, 0) / gs.length + h;
    const key = b.id;
    const ctx = { b, ring, area, h, gz, top, key, names, near, look, r: unit(key + 'a'), s: unit(key + 'b'), q: unit(key + 'c'), w: unit(key + 'd') };
    ctx.front = this.frontEdge(ring);
    ctx.featured = featured;
    const parts = look?.height ? null : b.measured?.parts;
    if (parts && parts.length > 1 && TIERED.includes(kind)) {
      // A tower on a podium, a stepped roof: the lidar's levels, each its own piece, as 3d-city builds them.
      // Each level in a little further than the one under it (0.25 m a level), so no two levels' walls lie in one
      // plane where their outlines are the same: they flickered against each other and the parapets below.
      const order = [...parts].sort((a, b) => a[0] - b[0]);
      for (const [lo, hi, pieces] of parts) for (const piece of pieces) {
        let [pr, pa] = ringCcw(piece[0]);
        if (pr.length < 3 || pa < 4) continue;
        const level = order.findIndex((p) => p[0] === lo);
        if (lo > 0.5 && level > 0) { pr = inset(pr, 0.25 * level); pa = ringArea(pr); if (pa < 4) continue; }
        const pc = { ...ctx, ring: pr, area: pa, gz: gz + lo, top: gz + hi, h: hi - lo, front: this.frontEdge(pr) };
        if (lo > 0.5) pc.upper = true;
        this[`b_${kind}`](M, pc);
      }
      return kind;
    }
    this[`b_${kind}`](M, ctx);
    return kind;
  }

  frontEdge(ring) {
    const d = this.streetDir(...centroid(ring));
    let best = -2, bi = 0;
    for (let i = 0; i < ring.length; i++) {
      const e = new F.Edge(ring[i], ring[(i + 1) % ring.length]);
      if (e.L < 2) continue;
      const score = (d ? e.n[0] * d[0] + e.n[1] * d[1] : e.L) + Math.min(e.L, 20) * 0.01;
      if (score > best) { best = score; bi = i; }
    }
    return bi;
  }

  frontOf(c) { return new F.Edge(c.ring[c.front], c.ring[(c.front + 1) % c.ring.length]); }

  // ---- the generic block: storeys of walls, a ground floor, belt course, cornice, parapet, roof units ----------
  block(M, c, st, { zTop = null, ring = null, rooftop = true } = {}) {
    ring = ring ?? c.ring;
    const gz = c.gz, top = zTop ?? c.top;
    const gh = Math.min(st.ground_h, Math.max(2.8, top - gz - 0.5)), fh = st.floor_h;
    const floors = [];
    let z = gz + gh;
    while (z + fh <= top - 0.35) { floors.push([z, z + fh]); z += fh; }
    if (!floors.length && top - gz - gh > 1.2) floors.push([gz + gh, top - 0.3]);
    const upperTop = floors.length ? floors.at(-1)[1] : gz + gh;
    const par = st.parapet ?? 1.0, wallTop = top + par;
    for (let i = 0; i < ring.length; i++) {
      const e = new F.Edge(ring[i], ring[(i + 1) % ring.length]);
      if (e.L < 0.2) continue;
      let est = st;
      if (st.glass_toward) {
        const [[dx, dy], spread, gmat] = st.glass_toward, L = Math.hypot(dx, dy) || 1;
        if ((e.n[0] * dx + e.n[1] * dy) / L > 1 - 2 * spread * 0.5 - 0.2) est = { ...st, kind: 'curtain', glass: gmat, spandrel: 'M_Spandrel', mullion: 'M_Mullion', bay: 1.6, ground: 'lobby', base: gmat };
      }
      this.edge(M, e, c, est, gz, gh, floors, upperTop, wallTop, i === c.front);
    }
    if (st.belt) { const [mat, s] = st.belt; F.ringSlab(M, ring, (0.1 * s) / 0.3, gz + gh - s, gz + gh, mat); }
    if (st.cornice) { const [mat, s] = st.cornice; F.cornice(M, ring, wallTop, mat, s); }
    const cap = st.cornice ? st.cornice[0] : st.cap ?? 'M_Concrete';
    // (A planted roof where there is one: Rapid Central Station's terminal.)
    const inner = F.parapetAndRoof(M, ring, top, par, st.wall || st.spandrel, c.b.greenRoof ? 'M_Roof_Green' : st.roof ?? 'M_Roof_Membrane', cap);
    if (rooftop) this.rooftop(M, c, inner, top, st);
    return top;
  }

  edge(M, e, c, st, gz, gh, floors, upperTop, wallTop, front) {
    const wall = st.wall || st.base, base = st.base || wall;
    F.plain(M, e, 0, e.L, gz - 0.8, gz, base);
    if (e.L < 1.4) { F.plain(M, e, 0, e.L, gz, wallTop, wall); return; }
    const kind = st.kind, margin = kind === 'curtain' ? 0 : Math.min(0.7, e.L * 0.12);
    // Ground floor.
    const g = st.ground ?? 'same';
    const gx = F.bays(e.L, st.ground_bay ?? (g === 'storefront' || g === 'lobby' ? 4.2 : st.bay), margin);
    if ((g === 'storefront' || g === 'lobby') && gx) {
      // A shop with its own named board on the wall (3d-city's signs) has no blank sign band over it.
      const sm = c.b.boarded ? null : g === 'storefront' ? st.sign : st.sign || 'M_Fascia';
      F.storefront(M, e, gx, gz, gz + gh, st, sm, g === 'storefront' ? 3 : front ? 2 : gx.length - 1, g === 'storefront' && e.L > 5 ? st.awning : null);
    } else if (g === 'parking' && gx) {
      for (let i = 0; i < gx.length - 1; i++) F.opening(M, e, gx[i], gx[i + 1], gz, gz + gh, gx[i] + 0.3, gx[i + 1] - 0.3, gz + (front && i === 0 ? 0 : 1.0), gz + gh - 0.4, 3.0, wall, 'M_Interior', 'M_Concrete');
      F.plain(M, e, 0, gx[0], gz, gz + gh, wall);
      F.plain(M, e, gx.at(-1), e.L, gz, gz + gh, wall);
    } else if (g === 'loading' && gx) {
      for (let i = 0; i < gx.length - 1; i++) {
        if (i % 2 === 0) {
          const dw = Math.min(3.6, gx[i + 1] - gx[i] - 0.6), mid = (gx[i] + gx[i + 1]) / 2;
          F.opening(M, e, gx[i], gx[i + 1], gz, gz + gh, mid - dw / 2, mid + dw / 2, gz + (st.docks ? 1.2 : 0), gz + Math.min(gh - 0.5, 4.6), 0.2, wall, 'M_GarageDoor', 'M_Concrete');
          if (st.docks) {
            F.bar(M, e, mid - dw / 2 - 0.15, gz + 0.3, -0.1, 0.25, 0.2, 0.6, 'M_Rubber');
            F.bar(M, e, mid + dw / 2 + 0.15, gz + 0.3, -0.1, 0.25, 0.2, 0.6, 'M_Rubber');
          }
        } else F.window(M, e, gx[i], gx[i + 1], gz, gz + gh, { ...st, win: [0.6, 0.5, 1.4] });
      }
      F.plain(M, e, 0, gx[0], gz, gz + gh, wall);
      F.plain(M, e, gx.at(-1), e.L, gz, gz + gh, wall);
    } else if (g === 'stoops' && gx) {
      for (let i = 0; i < gx.length - 1; i++) {
        if (i % 2 === 0 && front) {
          const mid = (gx[i] + gx[i + 1]) / 2;
          F.opening(M, e, gx[i], gx[i + 1], gz, gz + gh, mid - 0.55, mid + 0.55, gz + 0.9, gz + 3.2, 0.3, base, 'M_Door', 'M_Limestone');
          for (const [hh, dd] of [[0.3, 1.8], [0.6, 1.4], [0.9, 1.0]]) F.bar(M, e, mid, gz - 0.3, -dd / 2, 1.6, dd, hh + 0.3, 'M_Limestone');
        } else {
          F.window(M, e, gx[i], gx[i + 1], gz + 0.9, gz + gh, st, base);
          F.plain(M, e, gx[i], gx[i + 1], gz, gz + 0.9, base);
        }
      }
      F.plain(M, e, 0, gx[0], gz, gz + gh, base);
      F.plain(M, e, gx.at(-1), e.L, gz, gz + gh, base);
    } else if (kind === 'curtain' || g === 'blank' || g === 'none') {
      F.plain(M, e, 0, e.L, gz, gz + gh, base);
    } else {
      const xs = F.bays(e.L, st.bay, margin);
      if (xs) {
        F.windowRow(M, e, xs, gz, gz + gh, st, base);
        F.plain(M, e, 0, xs[0], gz, gz + gh, base);
        F.plain(M, e, xs.at(-1), e.L, gz, gz + gh, base);
      } else F.plain(M, e, 0, e.L, gz, gz + gh, base);
    }
    // Upper floors.
    if (kind === 'curtain' && floors.length) F.curtainWall(M, e, floors[0][0], upperTop, floors, st);
    else if (floors.length) {
      const xs = F.bays(e.L, st.bay, margin), row = st.row ?? 'window';
      for (const [z0, z1] of floors) {
        if (!xs) { F.plain(M, e, 0, e.L, z0, z1, wall); continue; }
        F.plain(M, e, 0, xs[0], z0, z1, wall);
        F.plain(M, e, xs.at(-1), e.L, z0, z1, wall);
        if (row === 'window') F.windowRow(M, e, xs, z0, z1, st);
        else for (let i = 0; i < xs.length - 1; i++) {
          if (row === 'parking') F.opening(M, e, xs[i], xs[i + 1], z0, z1, xs[i] + 0.25, xs[i + 1] - 0.25, z0 + 1.05, z1 - 0.35, 3.0, wall, 'M_Interior', 'M_Concrete');
          else F.plain(M, e, xs[i], xs[i + 1], z0, z1, wall);
        }
        if (st.balconies && (front || (xs.length - 2) % 2 === 0) && e.L > 6) {
          for (let i = 0; i < xs.length - 1; i++) if ((i + Math.floor(z0)) % 2 === 0) this.balcony(M, e, (xs[i] + xs[i + 1]) / 2, z0, xs[i + 1] - xs[i] - 0.4);
        }
        if (st.ledges) F.bar(M, e, e.L / 2, z0 - 0.12, -0.08, e.L, 0.16, 0.12, st.ledges);
      }
    }
    F.plain(M, e, 0, e.L, upperTop, wallTop, wall);
  }

  balcony(M, e, u, z, w) {
    F.bar(M, e, u, z - 0.15, -0.7, w, 1.4, 0.15, 'M_Concrete');
    F.bar(M, e, u, z, -1.38, w, 0.04, 1.05, 'M_Mullion');
    F.bar(M, e, u - w / 2 + 0.02, z, -0.7, 0.04, 1.4, 1.05, 'M_Mullion');
    F.bar(M, e, u + w / 2 - 0.02, z, -0.7, 0.04, 1.4, 1.05, 'M_Mullion');
    F.bar(M, e, u, z + 0.05, -1.36, w - 0.2, 0.02, 0.9, 'M_Glass_Silver');
  }

  rooftop(M, c, inner, top, st) {
    const { area, key } = c;
    if (area < 80) return;
    // A few low air-handling units on the bigger roofs; no stacks, no water tanks (the map shows none).
    const n = Math.min(4, Math.floor(area / 500));
    randomPoints(inner, n, 2.2, key + 'hv').forEach(([x, y], k) => {
      const r = unit(`${key}hvs${k}`);
      M.box([x, y, top], [2.4 + 2 * r, 1.6 + r, 1.1 + r * 0.4], 'M_Metal_Panel');
    });
    if (c.h > 18 && area > 300 && !st.no_penthouse) {
      const [cx, cy] = centroid(inner);
      if (inside(inner, cx, cy) && edgeDistance(inner, cx, cy) > 3) {
        M.box([cx, cy, top], [5.5, 4.5, 3.6], st.wall || 'M_Concrete');
        M.box([cx, cy, top + 3.6], [5.9, 4.9, 0.2], 'M_Concrete');
      }
    }
  }

  // ---- archetypes ---------------------------------------------------------------------------------------------
  b_landmark(M, c) {
    let st = landmarkStyle(c.look, c.h);
    if (c.upper) st = { ...st, ground: 'same', base: st.kind === 'curtain' ? st.glass : st.wall, ground_h: st.floor_h };
    const look = c.look;
    if (!look.crown) {
      this.block(M, c, st);
      if (look.banded) this.bands(M, c.ring, c.gz + st.ground_h, c.top, st.floor_h);
      return;
    }
    // A stepped crown: the shaft, then two setbacks, and a plant room on top.
    const shaft = c.top - 11.0;
    this.block(M, { ...c, top: shaft }, { ...st, cornice: null, parapet: 0.6 }, { rooftop: false });
    if (look.banded) this.bands(M, c.ring, c.gz + st.ground_h, shaft, st.floor_h);
    const up = { ...st, ground: 'same', base: st.kind === 'curtain' ? st.glass : st.wall, ground_h: st.floor_h, cornice: null, parapet: 0.8 };
    let z = shaft;
    for (const [ins, rise] of [[2.2, 5.5], [5.0, 4.0]]) {
      const ring = offsetRing(c.ring, -ins);
      this.block(M, { ...c, ring, gz: z, top: z + rise }, up, { rooftop: false });
      if (look.banded) this.bands(M, ring, z, z + rise, st.floor_h);
      z += rise;
    }
    const ring = offsetRing(c.ring, -8.0);
    if (ring.length >= 3) this.block(M, { ...c, ring, gz: z, top: z + 1.5 }, { ...up, parapet: 0.4 }, { rooftop: false });
  }

  /** White slab edges at every floor, standing proud of the glass. */
  bands(M, ring, z0, z1, fh) {
    for (let z = z0; z < z1 - 0.5; z += fh) F.ringSlab(M, ring, 0.45, z - 0.12, z + 0.12, 'M_Frame_White');
  }

  brick(c, salt = '') { return `M_Brick_${pick(BRICKS, unit(c.key + 'brick' + salt))}`; }

  b_mainstreet(M, c) {
    const { r, s, q, h } = c;
    if (this.creative && h < 7.5 && c.area < 900 && r > 0.55) {
      // Out in the neighborhoods, a corner store or strip unit is as often stucco or siding as brick.
      const [, accent] = pick(BRANDS, q);
      const st = { kind: 'punched', wall: s < 0.6 ? `M_Stucco_${pick(STUCCO, s)}` : `M_Siding_${pick(SIDINGS, s)}`, floor_h: 4.4, ground_h: 4.4, bay: 3.2,
        ground: 'storefront', base: 'M_Stone_Base', sign: `M_Sign_${pick(SIGNS, q)}`, awning: c.w < 0.5 ? `M_Awning_${pick(AWNINGS, s)}` : null,
        parapet: 0.8 + q, roof: 'M_Roof_Membrane', cornice: c.w > 0.6 ? [`M_Sign_${accent}`, 0.4] : null, glass: 'M_StoreGlass', win: [0.9, 0.8, 2.5], depth: 0.2 };
      this.block(M, { ...c, top: c.gz + Math.max(4.6, h) }, st);
      return;
    }
    const stucco = r > 0.85, wall = stucco ? `M_Stucco_${pick(STUCCO, s)}` : this.brick(c);
    const st = { kind: 'punched', wall, floor_h: 3.7, ground_h: 4.6, bay: 2.7 + q * 0.6, win: [0.5, 0.85, 2.9], glass: 'M_Window', depth: 0.25,
      frame: q < 0.6 ? 'M_Frame_White' : 'M_Fascia', transom: r < 0.5, sill: true, lintel: s < 0.7 ? 'M_Limestone' : wall, keystone: s < 0.25,
      ground: h > 4.2 ? 'storefront' : 'same', base: q < 0.3 ? 'M_Stone_Base' : wall, sign: `M_Sign_${pick(SIGNS, q)}`,
      awning: c.w < 0.45 ? `M_Awning_${pick(AWNINGS, s)}` : null, parapet: 0.9 + 1.2 * q, roof: q < 0.7 ? 'M_Roof_Membrane' : 'M_Roof_Gravel',
      cornice: h > 5 ? (r < 0.3 ? ['M_Fascia', 0.8] : ['M_Limestone', 0.6 + 0.5 * s]) : null, belt: h > 8 ? ['M_Limestone', 0.25] : null };
    this.block(M, c, st);
  }

  b_mixed(M, c) {
    const st = { kind: 'punched', wall: this.brick(c), floor_h: 3.3, ground_h: 4.8, bay: 3.0, win: [0.45, 0.8, 1.9], glass: 'M_Window', depth: 0.22,
      frame: 'M_Frame_White', sill: true, lintel: 'M_Limestone', ground: 'storefront', base: 'M_Stone_Base', sign: `M_Sign_${pick(SIGNS, c.q)}`,
      awning: c.r < 0.6 ? `M_Awning_${pick(AWNINGS, c.s)}` : null, balconies: c.w < 0.4, parapet: 1.0, roof: 'M_Roof_Membrane',
      cornice: ['M_Limestone', 0.7], belt: ['M_Limestone', 0.3] };
    this.block(M, c, st);
  }

  b_office(M, c) {
    const { r, s, q, h } = c;
    if ((h >= 40 && r < 0.6) || (h >= 20 && r < 0.3)) {
      const st = { kind: 'curtain', glass: pick(GLASSES, s), spandrel: 'M_Spandrel', mullion: q < 0.5 ? 'M_Mullion_Silver' : 'M_Mullion', floor_h: 3.9, ground_h: 6.0,
        bay: 1.5, ground: 'lobby', base: q < 0.6 ? 'M_Stone_Base' : 'M_Glass_Dark', parapet: 1.8, roof: 'M_Roof_Membrane', wall: 'M_Spandrel', cap: 'M_Mullion_Silver' };
      const top = this.block(M, c, st);
      if (h > 45 && q < 0.55) {
        // A setback crown of glass, so the skyline has a silhouette.
        const inner = offsetRing(c.ring, -Math.min(4.0, Math.sqrt(c.area) * 0.18));
        this.block(M, { ...c, ring: inner, gz: top + 1.8, top: top + 1.8 + 8.0 }, { ...st, ground: 'none', ground_h: 4.0, floor_h: 4.0, parapet: 2.5, kind: 'curtain' }, { rooftop: false });
      }
      return;
    }
    if (h >= 16 && r < 0.75) {
      const st = { kind: 'punched', wall: s < 0.5 ? 'M_Limestone' : 'M_Precast', floor_h: 3.8, ground_h: 5.5, bay: 3.0, win: [0.58, 0.8, 2.9],
        glass: pick(GLASSES, q), depth: 0.35, frame: 'M_Mullion', mullions: 1, sill: s < 0.5, ground: 'lobby', base: 'M_Stone_Base', parapet: 1.3,
        roof: 'M_Roof_Gravel', cornice: s < 0.5 ? ['M_Limestone', 1.1] : ['M_Precast', 0.5], belt: ['M_Stone_Base', 0.4], ledges: s >= 0.5 ? 'M_Precast' : null };
      this.block(M, c, st);
      return;
    }
    const st = { kind: 'punched', row: 'window', wall: r < 0.88 ? 'M_Precast' : 'M_Metal_Panel', floor_h: 3.7, ground_h: 4.6, bay: 4.5, win: [0.94, 0.95, 2.5],
      glass: pick(GLASSES, s), depth: 0.25, frame: 'M_Mullion', mullions: 2, ground: 'lobby', base: 'M_Concrete', parapet: 1.0, roof: 'M_Roof_Membrane', ledges: 'M_Mullion' };
    this.block(M, c, st);
  }

  b_apartments(M, c) {
    const { r, s, q } = c, modern = r < 0.45;
    const wall = modern && q < 0.5 ? `M_Stucco_${pick(STUCCO, s)}` : modern ? 'M_Metal_Panel' : this.brick(c);
    const st = { kind: 'punched', wall, floor_h: 3.1, ground_h: modern ? 4.5 : 3.6, bay: 3.2, win: [modern ? 0.6 : 0.42, 0.8, 1.7], glass: 'M_Window', depth: 0.2,
      frame: modern ? 'M_Mullion' : 'M_Frame_White', sill: !modern, lintel: modern ? null : 'M_Limestone', ground: modern ? 'lobby' : 'same',
      base: modern ? 'M_Concrete' : 'M_Stone_Base', balconies: modern || q < 0.3, parapet: 1.0, roof: 'M_Roof_Membrane', cornice: modern ? null : ['M_Limestone', 0.6] };
    this.block(M, c, st);
  }

  b_townhouse(M, c) {
    const st = { kind: 'punched', wall: this.brick(c), floor_h: 3.0, ground_h: 3.4, bay: 2.6, win: [0.45, 0.85, 1.8], glass: 'M_Window', depth: 0.2,
      frame: 'M_Frame_White', sill: true, lintel: 'M_Limestone', ground: 'stoops', base: this.brick(c), parapet: 0.8, roof: 'M_Roof_Membrane',
      cornice: c.q < 0.5 ? ['M_Fascia', 0.6] : ['M_Frame_White', 0.6] };
    this.block(M, c, st);
  }

  b_hotel(M, c) {
    const st = { kind: 'punched', wall: c.r < 0.5 ? 'M_Precast' : this.brick(c), floor_h: 3.1, ground_h: 5.5, bay: 3.8, win: [0.48, 0.8, 1.7],
      glass: pick(GLASSES, c.s), depth: 0.25, frame: 'M_Mullion', mullions: 1, ground: 'lobby', base: 'M_Stone_Base', parapet: 1.6,
      roof: 'M_Roof_Membrane', cornice: ['M_Precast', 0.6], belt: ['M_Stone_Base', 0.4] };
    const top = this.block(M, c, st);
    this.porteCochere(M, c, c.gz + 4.2);
    // The hotel's name band near the top (blank).
    const e = this.frontOf(c);
    if (e.L > 10) F.bar(M, e, e.L / 2, top - 2.6, -0.2, Math.min(e.L * 0.6, 16), 0.3, 1.8, `M_Sign_${pick(SIGNS, c.q)}`);
  }

  porteCochere(M, c, z, depth = 6.0, mat = 'M_Fascia') {
    const e = this.frontOf(c);
    if (e.L < 8) return;
    const w = Math.min(12.0, e.L * 0.6);
    F.bar(M, e, e.L / 2, z, -depth / 2, w, depth, 0.6, mat);
    F.bar(M, e, e.L / 2, z - 0.05, -depth / 2, w - 0.4, depth - 0.4, 0.05, 'M_Frame_White');
    for (const su of [-1, 1]) F.bar(M, e, e.L / 2 + su * (w / 2 - 0.4), c.gz, -depth + 0.4, 0.4, 0.4, z - c.gz, 'M_Steel_Dark');
  }

  b_school(M, c) {
    const st = { kind: 'punched', wall: this.brick(c), floor_h: 4.0, ground_h: 4.2, bay: 4.0, win: [0.85, 0.6, 2.2], glass: 'M_Window', depth: 0.25,
      frame: 'M_Mullion_Silver', mullions: 3, ground: 'same', base: 'M_Concrete', parapet: 0.9, roof: 'M_Roof_Membrane', cornice: ['M_Precast', 0.4], ledges: 'M_Precast' };
    this.block(M, c, st);
    this.porteCochere(M, c, c.gz + 3.6, 4.0, 'M_Metal_Panel_Dark');
  }

  b_college(M, c) {
    const r = c.r;
    const st = r < 0.55
      ? { kind: 'punched', wall: r < 0.25 ? 'M_Limestone' : this.brick(c), floor_h: 4.2, ground_h: 5.0, bay: 3.2, win: [0.5, 0.85, 3.2], glass: 'M_Window', depth: 0.35,
        frame: 'M_Mullion', mullions: 1, transom: true, sill: true, lintel: 'M_Limestone', keystone: true, ground: 'same', base: 'M_Stone_Base', parapet: 1.2,
        roof: 'M_Roof_Membrane', cornice: ['M_Limestone', 1.0], belt: ['M_Limestone', 0.35] }
      : { kind: 'curtain', glass: r < 0.8 ? 'M_Glass_Silver' : 'M_Glass_Teal', spandrel: 'M_Metal_Panel', mullion: 'M_Mullion', floor_h: 4.2, ground_h: 5.0, bay: 1.8,
        ground: 'lobby', base: 'M_Precast', parapet: 1.2, roof: 'M_Roof_Membrane', wall: 'M_Metal_Panel' };
    this.block(M, c, st);
  }

  b_hospital(M, c) {
    const st = { kind: 'punched', wall: 'M_Precast', floor_h: 4.2, ground_h: 5.0, bay: 4.2, win: [0.92, 0.55, 2.3], glass: 'M_Glass_Blue', depth: 0.2,
      frame: 'M_Mullion_Silver', mullions: 2, ground: 'lobby', base: 'M_Precast', parapet: 1.4, roof: 'M_Roof_Membrane', ledges: 'M_Glass_Blue', sign: 'M_Sign_1f4e8c' };
    const top = this.block(M, c, st);
    this.porteCochere(M, c, c.gz + 4.5, 8.0, 'M_Frame_White');
    if (c.area > 1200 && c.h > 14) {
      const inner = offsetRing(c.ring, -3), [cx, cy] = centroid(inner);
      if (inside(inner, cx, cy) && edgeDistance(inner, cx, cy) > 10) {
        // The pad, its yellow ring, the dark disc in it and the H, each a few centimetres over the last: no two
        // surfaces at one height (they flickered).
        M.box([cx, cy, top], [18, 18, 0.8], 'M_Concrete_Dark');
        M.cylinder([cx, cy, top + 0.8], 7.5, 0.06, 'M_Lane_Yellow', 32);
        M.cylinder([cx, cy, top + 0.8], 7.0, 0.12, 'M_Concrete_Dark', 32);
        for (const [dx, dy, sx, sy] of [[-2.2, 0, 0.8, 6], [2.2, 0, 0.8, 6], [0, 0, 3.6, 0.8]]) M.box([cx + dx, cy + dy, top + 0.92], [sx, sy, 0.06], 'M_Lane_White');
      }
    }
  }

  b_civic(M, c) {
    const st = { kind: 'punched', wall: 'M_Limestone', floor_h: 4.6, ground_h: 5.4, bay: 3.6, win: [0.45, 0.85, 3.3], glass: 'M_Window', depth: 0.4,
      frame: 'M_Mullion', mullions: 1, transom: true, sill: true, lintel: 'M_Limestone', keystone: true, ground: 'same', base: 'M_Stone_Base', parapet: 1.6,
      roof: 'M_Roof_Gravel', cornice: ['M_Limestone', 1.4], belt: ['M_Limestone', 0.5] };
    const top = this.block(M, c, st);
    this.portico(M, c, Math.min(top, c.gz + 11.0));
  }

  portico(M, c, ztop) {
    const e = this.frontOf(c);
    if (e.L < 12) return;
    const w = Math.min(e.L * 0.6, 28), n = Math.max(4, Math.floor(Math.floor(w / 3.2) / 2) * 2), d = 4.0, gz = c.gz;
    [[0.35, d + 2.4], [0.7, d + 1.6], [1.05, d + 0.8], [1.2, d + 0.2]].forEach(([hh, dd], k) => F.bar(M, e, e.L / 2, gz - 0.4, -dd / 2, w + 2 + (3 - k) * 0.8, dd, hh + 0.4, 'M_Limestone'));
    const colh = ztop - gz - 1.2 - 1.6;
    for (let i = 0; i < n; i++) {
      const u = e.L / 2 - w / 2 + 0.6 + ((w - 1.2) * i) / (n - 1), p = e.P(u, gz + 1.2, -d + 0.6);
      M.cylinder(p, 0.42, colh, 'M_Limestone', 14);
      M.box(p, [1.0, 1.0, 0.3], 'M_Limestone');
      M.box([p[0], p[1], p[2] + colh - 0.3], [1.05, 1.05, 0.3], 'M_Limestone');
    }
    F.bar(M, e, e.L / 2, gz + 1.2 + colh, -d / 2, w, d + 0.1, 1.6, 'M_Limestone');
    // The pediment.
    const z0 = gz + 1.2 + colh + 1.6, ph = w * 0.16;
    for (const k of [-0.05, -d - 0.1]) M.poly([e.P(e.L / 2 - w / 2, z0, k), e.P(e.L / 2 + w / 2, z0, k), e.P(e.L / 2, z0 + ph, k)], 'M_Limestone', k < -1 ? e.n : e.negN());
    for (const sgn of [-1, 1]) {
      const a = e.P(e.L / 2 + (sgn * w) / 2, z0, -d - 0.1), b = e.P(e.L / 2 + (sgn * w) / 2, z0, 0), tp = e.P(e.L / 2, z0 + ph, 0), ta = e.P(e.L / 2, z0 + ph, -d - 0.1);
      M.poly([a, b, tp, ta], 'M_Slate', [e.t[0] * sgn, e.t[1] * sgn, 1]);
    }
  }

  b_church(M, c) {
    const ring = c.ring, [[cx, cy], u, v, A, B] = obb(ring), { gz, h } = c;
    const stone = c.r < 0.6;
    const wall = stone && c.s < 0.4 ? 'M_Stone_Base' : stone ? 'M_Limestone' : this.brick(c);
    // Kept to the map's footprint and height: the walls to the eaves, the roof (and tower) within the measured top.
    const eave = gz + Math.min(Math.max(5.0, h * 0.55), 10.0);
    const st = { kind: 'punched', wall, floor_h: eave - gz, ground_h: eave - gz, bay: 4.0, win: [0.32, 0.95, Math.min(7.0, eave - gz - 2.0)], glass: 'M_StainedGlass',
      depth: 0.45, frame: 'M_Stone_Base', mullions: 1, sill: true, lintel: 'M_Limestone', keystone: true, ground: 'same', base: wall, parapet: 0.0, roof: 'M_Slate' };
    if (c.area / Math.max(1.0, 4 * A * B) < 0.75) {
      // Not a simple nave: the footprint as it is, under a flat roof behind a stone parapet.
      this.block(M, c, { ...st, floor_h: 4.5, ground_h: 4.5, parapet: 1.0, roof: 'M_Roof_Membrane', cornice: ['M_Limestone', 0.5] });
      return;
    }
    for (let i = 0; i < ring.length; i++) {
      const e = new F.Edge(ring[i], ring[(i + 1) % ring.length]);
      F.plain(M, e, 0, e.L, gz - 0.8, gz, wall);
      const xs = F.bays(e.L, 4.0, Math.min(1.0, e.L * 0.12));
      if (xs && e.L > 3) {
        for (let k = 0; k < xs.length - 1; k++) F.window(M, e, xs[k], xs[k + 1], gz, eave, st);
        F.plain(M, e, 0, xs[0], gz, eave, wall);
        F.plain(M, e, xs.at(-1), e.L, gz, eave, wall);
        for (const x of xs) F.bar(M, e, x, gz, -0.35, 0.7, 0.7, eave - gz - 0.8, wall);
      } else F.plain(M, e, 0, e.L, gz, eave, wall);
    }
    const rise = Math.max(2.5, gz + h - eave);
    const pitch = Math.max(20.0, Math.min(45.0, (Math.atan2(rise, B) * 180) / Math.PI));
    const ridge = this.gableRoof(M, [cx, cy], u, v, A, B, eave, pitch, 'M_Slate', wall, 0.3);
    // The tower and spire at the end nearest the street.
    const d = this.streetDir(cx, cy) ?? u;
    const sgn = u[0] * d[0] + u[1] * d[1] >= 0 ? 1 : -1;
    const ts = Math.min(Math.max(B * 0.6, 3.5), 6.0);
    const tx = cx + u[0] * sgn * (A - ts / 2 + 0.6), ty = cy + u[1] * sgn * (A - ts / 2 + 0.6);
    const yaw = Math.atan2(u[1], u[0]), th = ridge - gz + 3.0;
    const tw = [[-ts / 2, -ts / 2], [ts / 2, -ts / 2], [ts / 2, ts / 2], [-ts / 2, ts / 2]].map(([a, b]) => [tx + Math.cos(yaw) * a - Math.sin(yaw) * b, ty + Math.sin(yaw) * a + Math.cos(yaw) * b]);
    const tst = { kind: 'punched', wall, floor_h: th - 4.0, ground_h: 4.0, bay: ts * 0.6, win: [0.35, 0.9, Math.max(1.5, th - 9)], glass: 'M_Interior', depth: 0.5,
      frame: null, sill: true, lintel: 'M_Limestone', keystone: true, ground: 'same', base: wall, parapet: 0.6, roof: 'M_Slate', cornice: ['M_Limestone', 0.6] };
    const top = this.block(M, { ...c, ring: tw, gz, top: gz + th, area: ts * ts, front: 0 }, tst, { rooftop: false });
    // Spire: an octagonal pyramid with a cross.
    const sh = ts * 1.6, seg = 8, rr = ts * 0.48, baseZ = top + 0.6;
    const pts = Array.from({ length: seg }, (_, k) => [tx + rr * Math.cos(yaw + (2 * Math.PI * k) / seg + Math.PI / 8), ty + rr * Math.sin(yaw + (2 * Math.PI * k) / seg + Math.PI / 8), baseZ]);
    const apex = [tx, ty, baseZ + sh];
    for (let k = 0; k < seg; k++) {
      const a = pts[k], b = pts[(k + 1) % seg];
      M.poly([a, b, apex], c.q < 0.4 ? 'M_Copper' : 'M_Slate', [(a[0] + b[0]) / 2 - tx, (a[1] + b[1]) / 2 - ty, 0.3]);
    }
    M.box([tx, ty, baseZ + sh - 0.1], [0.12, 0.12, 2.2], 'M_Steel_Dark');
    M.box([tx, ty, baseZ + sh + 1.3], [0.9, 0.12, 0.12], 'M_Steel_Dark', { yaw });
    // The doors at the foot of the tower.
    M.box([tx + (u[0] * sgn * ts) / 2, ty + (u[1] * sgn * ts) / 2, gz], [1.9, 0.3, 3.2], 'M_Door', { yaw: yaw + Math.PI / 2 });
  }

  /** A pitched roof over the rectangle (centre c, axes u v, half-lengths A along the ridge and B across). */
  gableRoof(M, c, u, v, A, B, eave, pitch, mat, gableMat, o = 0.45, hip = false, trim = 'M_Frame_White') {
    const tp = Math.tan((pitch * Math.PI) / 180), ridge = eave + B * tp, low = eave - o * tp;
    const P = (a, b, z) => [c[0] + u[0] * a + v[0] * b, c[1] + u[1] * a + v[1] * b, z];
    if (hip && A > B * 1.05) {
      const r0 = -(A - B), r1 = A - B;
      for (const sb of [-1, 1]) {
        const q = [P(-A - o, sb * (B + o), low), P(A + o, sb * (B + o), low), P(r1, 0, ridge), P(r0, 0, ridge)];
        M.poly(q, mat, [v[0] * sb, v[1] * sb, 1]);
        if (!M.coarse) M.poly(q, trim, [-v[0] * sb, -v[1] * sb, -1]); // its underside, facing down
      }
      for (const [sa, r] of [[-1, r0], [1, r1]]) {
        const q = [P(sa * (A + o), -B - o, low), P(sa * (A + o), B + o, low), P(r, 0, ridge)];
        M.poly(q, mat, [u[0] * sa, u[1] * sa, 1]);
        if (!M.coarse) M.poly(q, trim, [-u[0] * sa, -u[1] * sa, -1]);
      }
    } else {
      for (const sb of [-1, 1]) {
        const q = [P(-A - o, sb * (B + o), low), P(A + o, sb * (B + o), low), P(A + o, 0, ridge), P(-A - o, 0, ridge)];
        M.poly(q, mat, [v[0] * sb, v[1] * sb, 1]);
        if (!M.coarse) M.poly(q, trim, [-v[0] * sb, -v[1] * sb, -1]); // its underside, facing down
      }
      for (const sa of [-1, 1]) {
        M.poly([P(sa * A, -B, eave), P(sa * A, B, eave), P(sa * A, 0, ridge)], gableMat, [u[0] * sa, u[1] * sa, 0]);
        if (!M.coarse) for (const sb of [-1, 1]) {
          // The rake board along the gable edge.
          const a = P(sa * (A + o), sb * (B + o), low), b = P(sa * (A + o), 0, ridge);
          M.poly([a, b, [b[0], b[1], b[2] - 0.22], [a[0], a[1], a[2] - 0.22]], trim, [u[0] * sa, u[1] * sa, 0]);
        }
      }
    }
    // Fascia along the eaves and a ceiling under the overhang.
    for (const sb of [-1, 1]) {
      const a = P(-A - o, sb * (B + o), low), b = P(A + o, sb * (B + o), low);
      M.poly([a, b, [b[0], b[1], low - 0.22], [a[0], a[1], low - 0.22]], trim, [v[0] * sb, v[1] * sb, 0]);
    }
    if (!M.coarse) M.poly([P(-A - o, -B - o, low - 0.02), P(A + o, -B - o, low - 0.02), P(A + o, B + o, low - 0.02), P(-A - o, B + o, low - 0.02)], trim, [0, 0, -1]);
    return ridge;
  }

  /** Heritage Hill: its houses in the district's own styles (Queen Anne, Italianate, Colonial Revival, Foursquare). */
  b_heritage(M, c) {
    const style = c.featured?.style ?? pick(HERITAGE_STYLES, unit(c.key + 'herit'));
    const paint = `M_Siding_${c.featured?.paint ?? pick(HERITAGE_PAINT, c.r)}`;
    const o = { floors: c.h < 12 ? 2 : 3, fh: 3.3, found: 1.0, found_mat: 'M_Stone_Base', win: [0.36, 0.9, 1.9], bay: 2.9, chimney: true };
    if (style === 'queen') Object.assign(o, { wall: paint, pitch: 52, hip: false, porch: true, tower: true, overhang: 0.4 });
    else if (style === 'italianate') Object.assign(o, { wall: this.brick(c, 'herit'), brick: true, pitch: 22, hip: true, porch: c.w < 0.5, overhang: 0.95, brackets: true });
    else if (style === 'colonial') Object.assign(o, { wall: `M_Siding_${c.s < 0.6 ? 'f1ede2' : 'e3d7a8'}`, pitch: 40, hip: false, porch: true, dormers: true, overhang: 0.35 });
    else Object.assign(o, { wall: c.s < 0.6 ? paint : this.brick(c, 'herit'), brick: c.s >= 0.6, pitch: 32, hip: true, porch: true, dormers: true, overhang: 0.6 });
    this.b_house(M, c, o);
  }

  b_house(M, c, o = null) {
    const given = !!o;
    o = o ?? {};
    const { ring, gz, key } = c, [[cx, cy], u, v, A, B] = obb(ring);
    if (B < 2.0 || A < 2.5) { this.b_shed(M, c); return; }
    const brick = o.brick ?? c.q > (this.creative ? 0.72 : 0.85);
    let wall = brick ? this.brick(c) : `M_Siding_${pick(SIDINGS, c.r)}`;
    if (this.creative && !brick && c.q < 0.12) wall = `M_Stucco_${pick(STUCCO, c.r)}`;
    wall = o.wall ?? wall;
    const trim = c.w < 0.75 || given ? 'M_Frame_White' : `M_Siding_${SIDINGS[Math.floor(c.w * 7) % SIDINGS.length]}`;
    const floors = o.floors ?? (c.h < 5.6 ? 1 : 2), fh = o.fh ?? 2.9, found = o.found ?? 0.6;
    const eave = gz + found + floors * fh;
    const shingles = `M_Shingles_${pick(SHINGLES, c.s)}`;
    const st = { kind: 'punched', wall, glass: 'M_Window', depth: 0.12, frame: trim, sill: true, lintel: brick ? 'M_Limestone' : trim, win: o.win ?? [0.4, 0.85, 1.45], bay: o.bay ?? 3.3 };
    for (let i = 0; i < ring.length; i++) {
      const e = new F.Edge(ring[i], ring[(i + 1) % ring.length]);
      if (e.L < 0.2) continue;
      F.plain(M, e, 0, e.L, gz - 0.8, gz + found, o.found_mat ?? 'M_Concrete');
      const xs = F.bays(e.L, st.bay, Math.min(0.6, e.L * 0.15)), front = i === c.front;
      for (let f = 0; f < floors; f++) {
        const z0 = gz + found + f * fh, z1 = z0 + fh;
        if (!xs || e.L < 2.2) { F.plain(M, e, 0, e.L, z0, z1, wall); continue; }
        F.plain(M, e, 0, xs[0], z0, z1, wall);
        F.plain(M, e, xs.at(-1), e.L, z0, z1, wall);
        const doorBay = front && f === 0 ? Math.floor((xs.length - 1) / 2) : -1;
        const own = (k, u0, u1) => {
          if (k !== doorBay) return false;
          const mid = (u0 + u1) / 2;
          F.opening(M, e, u0, u1, z0, z1, mid - 0.5, mid + 0.5, z0, z0 + 2.1, 0.15, wall, 'M_Door', trim);
          F.plate(M, e, mid, z0 + 2.1, -0.06, 1.3, 0.18, trim);
          return true;
        };
        own.probe = (k) => k === doorBay;
        F.windowRow(M, e, xs, z0, z1, st, wall, own);
        if (c.s < 0.35 && !brick && !M.coarse) {
          // Shutters beside the windows.
          for (let k = 0; k < xs.length - 1; k++) {
            if (k === doorBay) continue;
            const w = (xs[k + 1] - xs[k]) * 0.4, mid = (xs[k] + xs[k + 1]) / 2;
            for (const sg of [-1, 1]) F.plate(M, e, mid + sg * (w / 2 + 0.25), z0 + 0.95, -0.06, 0.42, 1.45, 'M_Fascia');
          }
        }
      }
      if (front && (o.porch ?? c.w < 0.55) && e.L > 6) this.porch(M, e, gz + found, fh, trim, shingles);
    }
    const hip = o.hip ?? c.s > 0.62, pitch = o.pitch ?? 30 + 14 * c.w;
    const ridge = this.gableRoof(M, [cx, cy], u, v, A, B, eave, pitch, shingles, wall, o.overhang ?? 0.45, hip, trim);
    const yaw = Math.atan2(u[1], u[0]);
    if (o.brackets) {
      // Paired brackets under the deep eaves, all round.
      for (let i = 0; i < ring.length; i++) {
        const e = new F.Edge(ring[i], ring[(i + 1) % ring.length]);
        for (const x of F.bays(e.L, 1.4, 0.5) ?? []) F.bar(M, e, x, eave - 0.55, -0.25, 0.18, 0.5, 0.5, trim);
      }
    }
    if (o.tower && A > 4 && B > 3) {
      // A round tower on the front corner, a storey above the eaves, under a conical cap.
      const d = this.streetDir(cx, cy) ?? v;
      const sv = v[0] * d[0] + v[1] * d[1] >= 0 ? 1 : -1, su = unit(key + 'tw') < 0.5 ? 1 : -1;
      const r = Math.min(1.9, B * 0.45);
      const tx = cx + u[0] * su * (A - r * 0.6) + v[0] * sv * (B - r * 0.6), ty = cy + u[1] * su * (A - r * 0.6) + v[1] * sv * (B - r * 0.6);
      const ttop = Math.max(ridge - 1.0, eave + fh);
      M.cylinder([tx, ty, gz + found], r, ttop - gz - found, wall, 12);
      for (let f = 0; f <= floors; f++) {
        const zw = gz + found + f * fh + 0.9;
        if (zw + 1.6 < ttop) for (let k = 0; k < 3; k++) {
          const a = yaw + (k - 1) * 0.9 + (sv > 0 ? Math.PI / 2 : -Math.PI / 2);
          M.box([tx + Math.cos(a) * r, ty + Math.sin(a) * r, zw], [0.7, 0.08, 1.5], 'M_Window', { yaw: a + Math.PI / 2 });
        }
      }
      const seg = 12;
      const pts = Array.from({ length: seg }, (_, k) => [tx + (r + 0.25) * Math.cos((2 * Math.PI * k) / seg), ty + (r + 0.25) * Math.sin((2 * Math.PI * k) / seg), ttop]);
      const apex = [tx, ty, ttop + r * 2.4];
      for (let k = 0; k < seg; k++) {
        const a = pts[k], b = pts[(k + 1) % seg];
        M.poly([a, b, apex], shingles, [(a[0] + b[0]) / 2 - tx, (a[1] + b[1]) / 2 - ty, 0.4]);
      }
      M.box([tx, ty, apex[2] - 0.1], [0.08, 0.08, 0.9], 'M_Steel_Dark');
    }
    if (o.chimney || unit(key + 'chim') < 0.2) {
      const a = (unit(key + 'cha') - 0.5) * A;
      const p = [cx + u[0] * a + v[0] * B * 0.35, cy + u[1] * a + v[1] * B * 0.35];
      M.box([p[0], p[1], eave - 1.0], [0.7, 0.9, ridge - eave + 2.0], 'M_Brick_8e3b2c', { yaw });
      M.box([p[0], p[1], ridge + 1.0], [0.8, 1.0, 0.12], 'M_Concrete', { yaw });
    }
    // A dormer on the long side for the bigger two-storey and storey-and-a-half houses.
    if ((o.dormers || floors === 1) && B > 3.6 && (o.dormers || unit(key + 'dorm') < 0.4)) {
      const tp = Math.tan((pitch * Math.PI) / 180);
      for (const a of A < 6 ? [-A * 0.4] : [-A * 0.45, A * 0.45]) {
        const b = B * 0.45, zb = eave + (B - b) * tp;
        const p = [cx + u[0] * a + v[0] * b, cy + u[1] * a + v[1] * b];
        M.box([p[0], p[1], zb - 0.3], [1.8, 1.4, 1.6], wall, { yaw });
        M.box([p[0] + v[0] * 0.74, p[1] + v[1] * 0.74, zb + 0.1], [0.8, 0.02, 1.0], 'M_Window', { yaw }); // 3 cm off the dormer's face
        M.box([p[0], p[1], zb + 1.3], [2.1, 1.7, 0.18], shingles, { yaw });
      }
    }
  }

  porch(M, e, z, fh, trim, roof) {
    const w = Math.min(e.L * 0.7, 9.0), u = e.L / 2, d = 2.2;
    F.bar(M, e, u, z - 0.6, -d / 2, w, d, 0.6, 'M_Wood');
    if (!M.coarse) for (let k = 0; k < 3; k++) F.bar(M, e, u, z - 0.6, -d - 0.3 - k * 0.3, 1.6, 0.3, 0.6 - k * 0.2, 'M_Wood');
    for (const x of [u - w / 2 + 0.15, u + w / 2 - 0.15, u - w / 6, u + w / 6]) {
      if (Math.abs(x - u) < 0.8) continue;
      F.bar(M, e, x, z, -d + 0.15, 0.16, 0.16, fh - 0.3, trim);
    }
    F.bar(M, e, u - w / 4 - 0.35, z + 0.85, -d + 0.15, w / 2 - 1.2, 0.06, 0.08, trim);
    F.bar(M, e, u + w / 4 + 0.35, z + 0.85, -d + 0.15, w / 2 - 1.2, 0.06, 0.08, trim);
    const top = z + fh - 0.3;
    const p = [e.P(u - w / 2 - 0.2, top + 0.6, 0), e.P(u + w / 2 + 0.2, top + 0.6, 0), e.P(u + w / 2 + 0.2, top, -d - 0.3), e.P(u - w / 2 - 0.2, top, -d - 0.3)];
    M.poly(p, roof, [e.n[0], e.n[1], 2]);
    if (!M.coarse) M.poly(p, trim, [-e.n[0], -e.n[1], -2]); // its underside, facing down
  }

  b_shed(M, c) {
    const { ring, gz } = c, [[cx, cy], u, v, A, B] = obb(ring);
    const wall = `M_Siding_${pick(SIDINGS, c.r)}`;
    const eave = gz + Math.max(2.6, Math.min(c.h, 3.2));
    for (let i = 0; i < ring.length; i++) {
      const e = new F.Edge(ring[i], ring[(i + 1) % ring.length]);
      if (e.L < 0.2) continue;
      F.plain(M, e, 0, e.L, gz - 0.6, gz + 0.15, 'M_Concrete');
      if (i === c.front && e.L > 3.0 && c.b.use === 'garage') {
        const n = e.L > 6.5 ? 2 : 1, dw = (e.L - 0.6 * (n + 1)) / n;
        let x = 0.6;
        for (let k = 0; k < n; k++) {
          F.opening(M, e, x, x + dw, gz + 0.15, eave, x, x + dw, gz + 0.15, gz + 2.3, 0.1, wall, 'M_GarageDoor', 'M_Frame_White');
          x += dw;
          F.plain(M, e, x, x + 0.6, gz + 0.15, eave, wall);
          x += 0.6;
        }
        F.plain(M, e, 0, 0.6, gz + 0.15, eave, wall);
      } else F.plain(M, e, 0, e.L, gz + 0.15, eave, wall);
    }
    if (B < 0.8) return;
    this.gableRoof(M, [cx, cy], u, v, A, B, eave, 22, `M_Shingles_${pick(SHINGLES, c.s)}`, wall, 0.25);
  }

  b_fastfood(M, c) {
    const [brand, accent] = pick(BRANDS, c.q);
    const st = { kind: 'punched', wall: `M_Stucco_${pick(STUCCO, c.s)}`, floor_h: 4.6, ground_h: 4.6, bay: 3.0, ground: 'storefront', base: 'M_Stone_Base',
      sign: `M_Sign_${brand}`, awning: c.r < 0.5 ? `M_Awning_${brand}` : null, parapet: 1.4, roof: 'M_Roof_Membrane', cornice: [`M_Sign_${accent}`, 0.5],
      glass: 'M_StoreGlass', win: [0.9, 0.8, 2.5], depth: 0.2 };
    c = { ...c, top: c.gz + 4.8 };
    const top = this.block(M, c, st);
    // The entrance tower that carries the sign. (No pole sign out front: it stood in the street.)
    const e = this.frontOf(c);
    if (e.L > 6) {
      F.bar(M, e, e.L * 0.25, c.gz, 0.0, 3.6, 0.6, top - c.gz + 3.0, `M_Sign_${brand}`);
      F.bar(M, e, e.L * 0.25, top + 3.0, -0.1, 4.0, 0.9, 0.3, `M_Sign_${accent}`);
    }
  }

  b_mart(M, c) {
    const [brand, accent] = pick(BRANDS, unit(c.key + 'brand'));
    const st = { kind: 'punched', wall: `M_Stucco_${pick(STUCCO, c.s)}`, floor_h: 4.4, ground_h: 4.4, bay: 3.0, ground: 'storefront', base: 'M_Stone_Base',
      sign: `M_Sign_${brand}`, parapet: 1.0, roof: 'M_Roof_Membrane', cornice: [`M_Sign_${accent}`, 0.45], glass: 'M_StoreGlass', win: [0.9, 0.8, 2.5], depth: 0.2 };
    this.block(M, { ...c, top: c.gz + 4.6 }, st);
  }

  /** A fuel canopy over pump islands where the map has a filling station beside it; otherwise a plain roof on posts. */
  b_canopy(M, c) {
    const { ring, gz } = c, nearJoined = c.near.join(' ');
    if (!has(nearJoined, FUEL_WORDS) || has(nearJoined, NOT_FUEL)) {
      const z = gz + Math.max(2.6, Math.min(c.h, 4.5));
      M.poly(ring.map((p) => [p[0], p[1], z + 0.3]), 'M_Roof_Membrane', [0, 0, 1]);
      M.poly(ring.map((p) => [p[0], p[1], z]), 'M_Frame_White', [0, 0, -1]);
      F.ringSlab(M, ring, 0.0, z, z + 0.3, 'M_Fascia');
      for (let i = 0; i < ring.length; i += Math.max(1, Math.floor(ring.length / 6))) M.box([ring[i][0], ring[i][1], gz], [0.25, 0.25, z - gz], 'M_Steel_Dark');
      return;
    }
    const [[cx, cy], u, v, A, B] = obb(ring);
    const [brand, accent] = pick(BRANDS, unit(c.key + 'brand'));
    const z = gz + 5.2, yaw = Math.atan2(u[1], u[0]);
    const P = (a, b) => [cx + u[0] * a + v[0] * b, cy + u[1] * a + v[1] * b];
    const rect = [P(-A, -B), P(A, -B), P(A, B), P(-A, B)];
    F.ringSlab(M, rect, 0.0, z, z + 1.0, `M_Sign_${brand}`);
    F.ringSlab(M, rect, 0.02, z + 0.7, z + 0.85, `M_Sign_${accent}`);
    M.poly(rect.map((p) => [p[0], p[1], z + 1.0]), 'M_Roof_Membrane', [0, 0, 1]);
    M.poly(rect.map((p) => [p[0], p[1], z]), 'M_Frame_White', [0, 0, -1]);
    const islands = Math.max(1, Math.floor((A * 2) / 7.5));
    for (let k = 0; k < islands; k++) {
      const a = -A + (2 * A * (k + 0.5)) / islands;
      for (const b of B < 5 ? [0] : [-B / 2, B / 2]) {
        const p = P(a, b);
        M.box([p[0], p[1], gz], [1.2, 5.0, 0.2], 'M_Concrete', { yaw });
        M.box([p[0], p[1], gz], [0.45, 0.45, z - gz], 'M_Frame_White', { yaw });
        for (const sb of [-1.6, 1.6]) {
          const q = [p[0] + v[0] * sb, p[1] + v[1] * sb];
          M.box([q[0], q[1], gz + 0.2], [0.8, 0.55, 1.9], 'M_Frame_White', { yaw });
          M.box([q[0], q[1], gz + 1.6], [0.82, 0.57, 0.35], `M_Sign_${brand}`, { yaw });
          M.box([q[0], q[1], gz + 1.0], [0.84, 0.3, 0.35], 'M_Glass_Dark', { yaw });
          for (const sa of [-0.5, 0.5]) M.box([q[0] + u[0] * sa, q[1] + u[1] * sa, gz + 0.2], [0.12, 0.7, 0.6], 'M_Rubber', { yaw });
        }
        for (const sb of [-2.4, 2.4]) M.cylinder([p[0] + v[0] * sb, p[1] + v[1] * sb, gz], 0.12, 1.0, 'M_Lane_Yellow', 8);
      }
    }
    // (No price sign by the street: like the pole signs, it stood in the road.)
  }

  b_bigbox(M, c) {
    const [brand, accent] = pick(BRANDS, c.q);
    const st = { kind: 'punched', wall: c.r < 0.6 ? `M_Stucco_${pick(STUCCO, c.s)}` : 'M_Metal_Panel', floor_h: 8.0, ground_h: 8.0, bay: 9.0, row: 'blank', ground: 'blank',
      base: 'M_Stone_Base', parapet: 1.8, roof: 'M_Roof_Membrane', cornice: [`M_Sign_${accent}`, 0.5], sign: `M_Sign_${brand}` };
    const top = this.block(M, { ...c, top: c.gz + Math.max(7.0, Math.min(c.h, 10.0)) }, st);
    const e = this.frontOf(c);
    if (e.L > 20) {
      F.bar(M, e, e.L / 2, c.gz, 0.0, 14, 1.0, top - c.gz + 3.5, st.wall);
      F.bar(M, e, e.L / 2, c.gz, -0.1, 10, 1.1, 4.0, 'M_StoreGlass');
      F.bar(M, e, e.L / 2, top + 0.5, -0.3, 11, 1.2, 2.2, `M_Sign_${brand}`);
      F.bar(M, e, e.L / 2, c.gz + 4.0, -2.0, 14, 4.0, 0.5, `M_Sign_${accent}`);
    }
  }

  b_factory(M, c) {
    const brick = c.r < 0.6, wall = brick ? this.brick(c) : 'M_Metal_Panel';
    const st = { kind: 'punched', wall, floor_h: 5.0, ground_h: 5.5, bay: 5.0, win: [0.8, 0.6, 2.6], glass: 'M_Window', depth: 0.25, frame: 'M_Mullion', mullions: 3,
      transom: true, ground: 'loading', base: 'M_Concrete', parapet: 1.0, roof: 'M_Roof_Membrane', cornice: brick ? ['M_Concrete', 0.4] : null };
    const top = this.block(M, c, st, { rooftop: false });
    const [[cx, cy], u, , A, B] = obb(c.ring), yaw = Math.atan2(u[1], u[0]);
    if (c.area > 600 && B > 8 && c.s < 0.5) {
      // A roof monitor down the middle: a raised clerestory of glass.
      M.box([cx, cy, top], [A * 1.4, 4.0, 2.2], 'M_Glass_Dark', { yaw });
      M.box([cx, cy, top + 2.2], [A * 1.4 + 0.4, 4.6, 0.3], 'M_Metal_Panel_Dark', { yaw });
    }
    // (No smokestacks: the map shows none.)
    this.rooftop(M, c, offsetRing(c.ring, -0.3), top, st);
  }

  b_warehouse(M, c) {
    const st = { kind: 'punched', wall: c.r < 0.6 ? 'M_Metal_Panel' : 'M_Precast', floor_h: 6.0, ground_h: Math.max(4.0, Math.min(c.h, 8.5)), bay: 4.5, row: 'blank',
      ground: 'loading', docks: true, glass: 'M_Window', win: [0.6, 0.5, 1.4], depth: 0.2, frame: 'M_Mullion', base: 'M_Concrete', parapet: 0.6, roof: 'M_Roof_Membrane' };
    this.block(M, { ...c, top: c.gz + Math.max(4.5, Math.min(c.h, 9.0)) }, st);
  }

  b_parking(M, c) {
    const st = { kind: 'punched', row: 'parking', wall: 'M_Stucco_c9b896', floor_h: 3.2, ground_h: 3.6, bay: 7.5, ground: 'parking', parapet: 1.1, roof: 'M_Concrete_Dark', cap: 'M_Stucco_c9b896' };
    const top = this.block(M, c, st, { rooftop: false });
    const inner = offsetRing(c.ring, -0.3);
    // Light poles and the stair and lift tower on the top deck.
    for (const [x, y] of randomPoints(inner, 6, 6.0, c.key + 'lp')) {
      M.cylinder([x, y, top], 0.1, 6.0, 'M_Steel_Dark', 8);
      M.box([x, y, top + 6.0], [0.9, 0.35, 0.18], 'M_Steel_Dark');
    }
    const pts = randomPoints(inner, 1, 4, c.key + 'stair');
    if (pts.length) {
      M.box([pts[0][0], pts[0][1], top], [5, 5, 3.5], 'M_Glass_Dark');
      M.box([pts[0][0], pts[0][1], top + 3.5], [5.4, 5.4, 0.3], 'M_Concrete');
    }
  }

  b_station(M, c) {
    const st = { kind: 'punched', wall: this.brick(c), floor_h: 5.0, ground_h: 5.5, bay: 4.0, win: [0.6, 0.85, 3.6], glass: 'M_Window', depth: 0.35, frame: 'M_Mullion',
      mullions: 2, transom: true, sill: true, lintel: 'M_Limestone', keystone: true, ground: 'lobby', base: 'M_Stone_Base', parapet: 1.2, roof: 'M_Roof_Membrane', cornice: ['M_Limestone', 0.9] };
    this.block(M, c, st);
    this.porteCochere(M, c, c.gz + 4.0, 5.0, 'M_Metal_Panel_Dark');
  }

  b_stadium(M, c) {
    const st = { kind: 'punched', row: 'parking', wall: 'M_Precast', floor_h: 6.0, ground_h: 6.0, bay: 8.0, ground: 'lobby', base: 'M_Concrete', parapet: 2.5,
      roof: 'M_Concrete_Dark', cornice: ['M_Metal_Panel', 1.2] };
    this.block(M, c, st);
  }
}
