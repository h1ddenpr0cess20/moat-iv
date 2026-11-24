import { storefrontLook } from './storefronts.js';
import { areaOf, boundingRectangle, inside, open, triangulate, unit } from './geometry.js';
import { linear } from './builder.js';
import { CORE, LOOKS, coreLook, kindOf } from './looks.js';
import { heritageHouse, isHeritageHouse } from './heritage.js';
import { isTypicalHouse, pickKind, typicalHouse } from './houses.js';

/**
 * Buildings out of footprints: walls that run up from the ground in whole
 * stories of the engine's facades, a roof, and a tint no two alike.
 *
 * A facade is a texture that repeats once a story and once a bay, so every
 * wall gets a whole number of both: the windows then land on the corners.
 */

// What each facade (textures/town: FACADES) looks like: the height of a story, in meters, and its width as a multiple of that.
const FACADE = {
  office: { story: 3.6, ratio: 0.9, tints: ['#a9bdd0', '#8fa6bc', '#c4ccd2', '#9fb0a8', '#b4bcc8', '#7f98b0'] },
  brick: { story: 3.9, ratio: 1.2, tints: ['#e0b090', '#cf9474', '#e6c8a6', '#bf8a70', '#dcc9b0', '#b09484', '#d4a080'] },
  house: { story: 4.2, ratio: 1.6, tints: ['#f0e4cc', '#cfdcc4', '#e0d0be', '#bccbdc', '#ecd6c4', '#f6f0e2', '#d8d0c0'] },
  curtain: { story: 3.6, ratio: 1, tints: ['#ffffff', '#f0f6ff', '#e6f0f8', '#f6faff', '#e0ecf6'] },
  precast: { story: 3.6, ratio: 1, tints: ['#ffffff', '#f4ecde', '#ece4d4', '#f8f0e0', '#efe8dc'] },
  terracotta: { story: 3.6, ratio: 1, tints: ['#ffffff', '#f4e8e0', '#e8d8cc'] },
  sandstone: { story: 3.6, ratio: 1, tints: ['#ffffff', '#f0e4dc', '#e0d0c4', '#d4c8bc'] },
  garage: { story: 3.0, ratio: 1.0, tints: ['#d0ccc0', '#c0bcb2', '#d8d4c8'] },
  shop: { story: 4.4, ratio: 2.4, tints: ['#ffffff', '#f0e6d8', '#e0e8ee', '#f2dcd0', '#e4ecdc'] },
  // The city's own (facades.js).
  'glass-bronze': { story: 3.9, ratio: 1, tints: ['#ffffff'] },
  'glass-blue': { story: 3.9, ratio: 1, tints: ['#ffffff'] },
  'glass-teal': { story: 3.9, ratio: 1, tints: ['#ffffff'] },
  'glass-dark': { story: 3.9, ratio: 1, tints: ['#ffffff'] },
  limestone: { story: 3.9, ratio: 0.85, tints: ['#ffffff', '#f6f0e6', '#ece6da'] },
  historic: { story: 4.0, ratio: 0.8, tints: ['#d08a70', '#a8705c', '#fbecc8'] },
  'historic-arched': { story: 4.0, ratio: 0.8, tints: ['#d08a70', '#a8705c', '#fbecc8'] },
  concrete: { story: 4.2, ratio: 1.2, tints: ['#ffffff', '#f0f0ee'] },
};
const PLAIN = {
  stucco: { tile: 3, tints: ['#e6dcc8', '#d8cdb8', '#efe6d4', '#cfc6b4'] },
  block: { tile: 3, tints: ['#c4c0b8', '#b4b0a8', '#d0ccc4'] },
  corrugated: { tile: 3, tints: ['#c8ccd0', '#b0b8c0', '#d4d4cc'] },
  clapboard: { tile: 3, tints: ['#e8e0d0', '#d8d8c8', '#c8d0d8'] },
};
const FLAT_ROOFS = [['ground:membrane-white', 3, 0.34], ['ground:membrane-gray', 3, 0.22], ['ground:gravel-roof', 2, 0.44]];
const SHINGLES = ['ground:shingles-charcoal', 'ground:shingles-brown'];
/** The mean color of each roof texture, to tint it toward the photograph's color of the real roof. */
const ROOF_REF = {
  'ground:membrane-white': [205, 205, 200], 'ground:membrane-gray': [150, 152, 154], 'ground:gravel-roof': [125, 122, 118],
  'ground:shingles-charcoal': [60, 60, 64], 'ground:shingles-brown': [96, 68, 52], 'ground:turf': [60, 88, 36],
};
const clampTint = (v) => Math.max(0.55, Math.min(1.3, v));
/** A roof's tint toward the color the aerial photograph shows (hazy and bright, so eased halfway). */
const tintToward = (material, rgb) => ROOF_REF[material].map((ref, i) => clampTint(1 + (rgb[i] / ref - 1) * 0.6));

const HOMEY = new Set(['house', 'detached', 'semidetached_house', 'residential', 'cabin', 'bungalow', 'terrace', 'farm', 'static_caravan']);
const OFFICEY = new Set(['office', 'commercial', 'hotel', 'civic', 'government', 'hospital', 'university', 'college', 'public', 'education', 'service', 'transportation', 'medical']);
const DECKS = new Set(['parking', 'garage', 'garages', 'carport']);

/** The height of a building, in meters, from what is known about it. */
export function heightOf(b) {
  // What the lidar measured, where it saw enough of the roof.
  if (b.measured && b.measured.cover >= 0.25 && b.measured.height >= 2.5) return b.measured.height;
  if (b.height) return b.height;
  if (b.floors) return b.floors * 3.6;
  const area = areaOf(b.rings[0]);
  const byClass = { house: 7, detached: 7, residential: 8, apartments: 14, dormitory: 14, garage: 3.2, garages: 3.2, parking: 9, shed: 3, garage_: 3, retail: 6, commercial: 9, office: 18, industrial: 8, warehouse: 8, hospital: 16, university: 14, school: 9, church: 10, hotel: 24, civic: 12, roof: 3, outbuilding: 3, service: 6, terrace: 9, transportation: 6, retail: 6 };
  if (byClass[kindOf(b)]) return byClass[kindOf(b)];
  if (area < 60) return 3.5;
  if (area < 250) return 7;
  if (area < 700) return 10;
  return 14;
}

/**
 * How each kind of building looks, from its `use` (scripts/uses.py): a house in clapboard under a hip roof, flats in
 * brick, a shop with a shop front, a bar in dark paint, a church in sandstone under shingles, a school in buff brick,
 * a hospital in white precast over a glass lobby, a warehouse in gray block, a factory in corrugated steel, and so on.
 * Null where `use` says nothing the looks below do not (they then go by height and form).
 */
export function styleByUse(use, h, area, r) {
  switch (use) {
    case 'house':
      if (h > 11) return { wall: 'brick', roof: 'flat' };
      if (r < 0.14) return { plain: 'clapboard', roof: 'hip' };
      return area < 330 ? { wall: 'house', roof: 'hip' } : { wall: 'brick', roof: 'flat' };
    case 'townhouse': return { wall: 'brick', tint: r < 0.5 ? '#cf9474' : '#bf8a70', roof: 'flat' };
    case 'apartments':
      if (h >= 13) return { wall: r < 0.5 ? 'precast' : 'terracotta', roof: 'flat', cornice: { h: 0.5, d: 0.25, tint: '#bdb8b0' } };
      return { wall: 'brick', tint: r < 0.4 ? '#b09484' : r < 0.7 ? '#dcc9b0' : '#cf9474', roof: 'flat' };
    case 'shop':
      return h < 6 ? { wall: 'shop', roof: 'flat' } : { base: 'shop', wall: 'brick', roof: 'flat' };
    case 'restaurant':
      return h < 6 ? { wall: 'shop', tint: '#f2c8b0', roof: 'flat' } : { base: { wall: 'shop', h: 4.4, tint: '#f2c8b0' }, wall: 'brick', roof: 'flat' };
    case 'bar':
      return h < 6 ? { wall: 'shop', tint: '#7a6a62', roof: 'flat' } : { base: { wall: 'shop', h: 4.4, tint: '#7a6a62' }, wall: 'brick', roof: 'flat' };
    case 'mixed':
      return { base: 'shop', wall: h >= 13 ? 'office' : 'brick', roof: 'flat' };
    case 'office':
      return h >= 13 ? { wall: r < 0.4 ? 'precast' : r < 0.7 ? 'curtain' : 'office', roof: 'flat' } : { wall: 'office', roof: 'flat' };
    case 'hotel':
      return h >= 13 ? { wall: 'glass-bronze', tint: '#ffffff', roof: 'flat' } : { wall: 'limestone', roof: 'flat', cornice: { h: 0.8, d: 0.4, tint: '#e8e0d0' } };
    case 'church':
      return { wall: 'sandstone', tint: '#d4c8bc', roof: area < 1200 ? 'hip' : 'flat', cornice: { h: 0.7, d: 0.35, tint: '#cfc6b4' } };
    case 'school':
      return { wall: 'brick', tint: '#e6c8a6', roof: 'flat', cornice: { h: 0.6, d: 0.3, tint: '#d8d0c0' } };
    case 'university':
      return { wall: 'limestone', roof: 'flat', cornice: { h: 0.8, d: 0.4, tint: '#e8e0d0' } };
    case 'hospital':
      return { wall: 'precast', tint: '#ffffff', base: { wall: 'glass-blue', h: 4 }, roof: 'flat' };
    case 'civic':
      return { wall: 'limestone', roof: 'flat', cornice: { h: 0.9, d: 0.5, tint: '#e8e0d0' } };
    case 'industrial': return { plain: 'corrugated', tint: '#a8b4c0', roof: 'flat' };
    case 'warehouse': return { plain: 'block', tint: '#b4b0a8', roof: 'flat' };
    case 'garage': return { plain: 'block', roof: area < 140 ? 'hip' : 'flat' };
    case 'shed': return { plain: 'clapboard', roof: area < 140 ? 'hip' : 'flat' };
    case 'parking': return { wall: 'garage', roof: 'flat' };
    case 'stadium': return { wall: 'concrete', roof: 'flat' };
    case 'station': return { wall: 'precast', roof: 'flat' };
    default: return null;
  }
}

/** How the walls of a building look: a facade, or a plain wall; the roof's kind. */
export function styleOf(b, h, area) {
  const cls = kindOf(b);
  if (DECKS.has(cls) && h >= 6) return { wall: 'garage', roof: 'flat' };
  const r = unit(`${b.id ?? b.name ?? area}style`);
  if (h >= 38) return { wall: r < 0.6 ? 'curtain' : 'precast', roof: 'flat' };
  const by = b.use && styleByUse(b.use, h, area, r);
  if (by) return by;
  if (HOMEY.has(cls) && h <= 11 && area < 330) return { wall: 'house', roof: 'hip' };
  if (HOMEY.has(cls) && h <= 11) return { wall: 'brick', roof: 'flat' };
  if (OFFICEY.has(cls) && h >= 13) return { wall: r < 0.4 ? 'precast' : r < 0.65 ? 'curtain' : r < 0.75 ? 'terracotta' : 'office', roof: 'flat' };
  if ((cls === 'retail' || cls === 'commercial' || cls === 'service') && h >= 5.5) return { base: 'shop', wall: h >= 9 ? 'brick' : null, roof: 'flat' };
  if (cls === 'industrial' || cls === 'warehouse' || cls === 'factory') return { plain: 'corrugated', roof: 'flat' };
  if (cls === 'garage' || cls === 'garages' || cls === 'shed' || cls === 'outbuilding' || cls === 'roof' || h < 4.6) return { plain: area > 200 ? 'block' : 'stucco', roof: area < 140 ? 'hip' : 'flat' };
  if (!cls && h <= 10.5 && area < 260 && area > 45) return { wall: 'house', roof: 'hip' };
  if (h >= 15 && area > 500) return { wall: r < 0.45 ? 'precast' : r < 0.6 ? 'curtain' : 'office', roof: 'flat' };
  if (h >= 10 && area < 1300 && r < 0.18) return { wall: 'sandstone', roof: 'flat' };
  if (h >= 7) return { wall: 'brick', roof: 'flat' };
  return { plain: 'stucco', roof: area < 200 ? 'hip' : 'flat' };
}

/** Landmarks built as a house of Heritage Hill's kind (heritage.js): a Queen Anne with a round tower, painted sage. */
const FEATURED = { 'Jenison Museum': { style: 'queen', tower: true, brick: false, paint: '#a8b494' } };

const pick = (list, seed) => linear(list[Math.floor(unit(seed) * list.length) % list.length]);

/** The height a building stands from: its lowest corner, a little lower on a slope, so nothing hangs in the air. */
export function footOf(terrain, b) {
  let low = Infinity, high = -Infinity;
  for (const [x, z] of open(b.rings[0])) { const y = terrain.heightAt(x, z); low = Math.min(low, y); high = Math.max(high, y); }
  return low - Math.min(0.5, (high - low) * 0.5) - (high - low > 0.6 ? 0.4 : 0);
}

/** Puts a building into `builder`, standing on `terrain`. */
export function building(builder, terrain, b, index) {
  const outer = open(b.rings[0]);
  if (outer.length < 3) return;
  const seed = `${b.name ?? ''}${index}${outer[0][0]}`;
  const area = areaOf(b.rings[0]);
  // A height the list of the city's tallest buildings gives, for those built since the lidar flew (or that it missed).
  const named = LOOKS[b.id] ?? LOOKS[b.name];
  // A shop on a main street stands at least a story and a parapet tall, for its windows and its sign.
  const h = named?.height ?? (b.storefront ? Math.max(5.8, heightOf(b)) : heightOf(b));
  const foot = footOf(terrain, b);
  const bottom = b.min ? foot + b.min : foot;
  // A roof on posts (a filling station's canopy, a carport, a drive-through): open beneath, so the road under it goes on.
  if (!named && (b.class === 'roof' || b.class === 'carport') && !b.measured?.parts) { canopy(builder, b.rings, foot, Math.max(4.4, Math.min(h, 7)), seed); return; }
  // Heritage Hill's houses are built in the district's own styles.
  if (!named && isHeritageHouse(b, h, area)) { heritageHouse(builder, b, h, foot, b.front, seed); return; }
  // Buildings that are one of Heritage Hill's kind of house wherever they stand: the Jenison Museum, an old house with a turret.
  const featured = FEATURED[b.name];
  if (featured && b.rings.length === 1) { heritageHouse(builder, b, h, foot, b.front, seed, featured); return; }
  // The houses of the region: ranch, cape, bungalow, gabled cottage, gambrel, two-story traditional (houses.js).
  if (!named && isTypicalHouse(b, h, area)) { typicalHouse(builder, b, h, foot, b.front, seed, pickKind(h, area, seed)); return; }
  let style = styleOf(b, h, area);
  // The important buildings look as their photographs say; the rest of downtown as its kind of building does there.
  const [cx, cz] = outer[0];
  const core = Math.hypot(cx - CORE.center[0], cz - CORE.center[1]) < CORE.radius;
  // A shop, bar or restaurant's building: downtown, its block as downtown's are (with shop windows); elsewhere a main street's.
  const shopLook = () => (core ? (({ base, ...l }) => ({ ...l, base: { wall: 'shop', h: 4.4 } }))(coreLook(b, Math.max(h, 7), b.id ?? seed) ?? storefrontLook(b.id ?? seed)) : storefrontLook(b.id ?? seed));
  const front = !named && b.storefront && style.roof !== 'hip' && area < 3000 ? shopLook() : null;
  const look = named ?? front ?? (core ? coreLook(b, h, b.id ?? seed) : null);
  if (look) style = { ...style, wall: look.wall, plain: undefined, base: look.base ?? null, tint: look.tint, cornice: look.cornice, glass: look.glass, penthouse: look.penthouse, roof: 'flat' };
  else if (style.wall && !['house', 'garage'].includes(style.wall) && h >= 7) style = { ...style, cornice: { h: 0.5, d: 0.25, tint: '#bdb8b0' } };

  // Measured from the air, a roof's height is to its top: the walls stop where a hip roof begins.
  let hipRect = null, top = bottom + h;
  if (style.roof === 'hip') {
    const rect = boundingRectangle(b.rings[0]);
    if (rect && rect.d >= 3 && area / rect.area > 0.8 && b.rings.length === 1) {
      hipRect = rect;
      if (b.measured) top = bottom + Math.max(2.4, h - (rect.d / 2 + 0.35) * 0.62);
    }
  }

  // A tower on a podium, a stepped roof: the lidar's levels, each its own piece, from the level below to its own.
  const parts = named?.height ? null : b.measured?.parts;
  if (parts) {
    for (const [from, to, pieces] of parts) {
      for (const piece of pieces) raise(builder, piece, { bottom: bottom + from, top: bottom + to, base: from === 0, style, seed: `${seed}${from}`, h: to - from, roofColor: b.roofColor });
    }
    return;
  }
  raise(builder, b.rings, { bottom, top, base: true, style, seed, h: top - bottom, hipRect, roofColor: b.roofColor });
}

/**
 * The walls of one solid (a footprint, its holes, and the height it stands between) and its roof.
 * `base`: whether it reaches the ground, so a shop front goes on it.
 */
function raise(builder, polygon, { bottom, top, base, style, seed, h, hipRect = null, roofColor = null }) {
  const area = areaOf(polygon[0]);
  // Every ring run so that a wall's outward side is (-dz, dx): tested on its longest edge, which is not fooled by a sliver.
  const rings = polygon.map((r) => {
    const pts = open(r);
    let best = 0, longest = 0;
    for (let i = 0; i < pts.length; i++) {
      const l = Math.hypot(pts[(i + 1) % pts.length][0] - pts[i][0], pts[(i + 1) % pts.length][1] - pts[i][1]);
      if (l > longest) { longest = l; best = i; }
    }
    const p = pts[best], q = pts[(best + 1) % pts.length];
    const dx = q[0] - p[0], dz = q[1] - p[1], l = longest || 1;
    return inside(polygon, (p[0] + q[0]) / 2 - (dz / l) * 0.05, (p[1] + q[1]) / 2 + (dx / l) * 0.05) ? pts.slice().reverse() : pts;
  });

  const wallBands = [];
  const tintOf = (kind, t, salt) => (t ? linear(t) : pick((FACADE[kind] ?? PLAIN[kind]).tints, seed + salt));
  const upper = style.wall ? { kind: style.wall, tint: tintOf(style.wall, style.tint, '') } : { kind: style.plain ?? 'stucco', plain: true, tint: tintOf(style.plain ?? 'stucco', style.tint, '') };
  // The lowest stories: shop fronts, a stone base or a glass lobby, where the building reaches the ground.
  const ground = style.base === 'shop' ? { wall: 'shop', h: FACADE.shop.story } : style.base;
  if (ground && base) {
    const gh = Math.min(ground.h, h);
    wallBands.push({ kind: ground.wall, from: bottom, to: bottom + gh, tint: tintOf(ground.wall, ground.tint, 's'), lower: true });
    if (h - gh > 0.5) wallBands.push({ ...upper, from: bottom + gh, to: top });
  } else wallBands.push({ ...upper, from: bottom, to: top });
  // The side of it that is glass (a museum's wall to the river, an arena's entrance): every wall that faces that way.
  const glassDir = style.glass ? (([x, z]) => { const l = Math.hypot(x, z) || 1; return [x / l, z / l]; })(style.glass.toward) : null;

  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const A = ring[i], B = ring[(i + 1) % ring.length];
      const dx = B[0] - A[0], dz = B[1] - A[1], L = Math.hypot(dx, dz);
      if (L < 0.2) continue;
      const n = [-dz / L, 0, dx / L];
      const glazed = glassDir && n[0] * glassDir[0] + n[2] * glassDir[1] > (style.glass.spread ?? 0.5);
      for (const b0 of wallBands) {
        const band = glazed && b0.kind !== 'shop' ? { ...b0, kind: style.glass.wall, plain: false, tint: [1, 1, 1] } : b0;
        const height = band.to - band.from;
        if (height <= 0.05) continue;
        let u1, v1, material;
        if (band.plain) {
          const t = PLAIN[band.kind].tile;
          u1 = L / t; v1 = height / t; material = `wall:${band.kind}`;
        } else {
          const f = FACADE[band.kind];
          const rows = Math.max(1, Math.round(height / f.story));
          const tileH = height / rows, tileW = tileH / f.ratio;
          u1 = Math.max(1, Math.round(L / tileW)); v1 = rows; material = `wall:facade:${band.kind}`;
        }
        const a = [A[0], band.from, A[1]], bb = [B[0], band.from, B[1]], c = [B[0], band.to, B[1]], d = [A[0], band.to, A[1]];
        // Seen from outside, along a to b, the wall is to the right of the way round.
        builder.quad(material, a, bb, c, d, [0, 0], [u1, 0], [u1, v1], [0, v1], band.tint, n);
      }
      if (top - bottom > 2.5) { builder.collide([A[0], bottom, A[1]], [B[0], bottom, B[1]], [B[0], top, B[1]]); builder.collide([A[0], bottom, A[1]], [B[0], top, B[1]], [A[0], top, A[1]]); }
    }
  }

  // The cornice round the top, and what stands on a flat roof.
  if (style.cornice && top - bottom > 3 && !hipRect) cornice(builder, rings[0], top, style.cornice);
  // The roof.
  if (hipRect) hip(builder, hipRect, top, `roof${seed}`, seed, roofColor);
  else {
    flat(builder, polygon, top, seed, roofColor);
    if (style.penthouse !== false && area > 260 && h > 9) rooftop(builder, polygon, top, seed, area);
  }
}

/**
 * A cornice round the top of a wall: a band `h` meters deep standing `d` meters proud of it, with its underside and
 * its top, and a low parapet lip above the roof. `ring` runs so that (-dz, dx) of each edge is outward.
 */
function cornice(builder, ring, top, { h = 1, d = 0.6, tint = '#e8e0d0' }) {
  const n = ring.length, color = linear(tint), under = color.map((c) => c * 0.62);
  const mat = 'road:concrete';
  const lip = 0.35, y0 = top - h, y1 = top + lip;
  // Each corner pushed out along the mitre of its two walls (no further than three times `d`, at a sharp corner).
  const out = ring.map((p, i) => {
    const a = ring[(i + n - 1) % n], b = ring[(i + 1) % n];
    const e1 = [p[0] - a[0], p[1] - a[1]], e2 = [b[0] - p[0], b[1] - p[1]];
    const l1 = Math.hypot(...e1) || 1, l2 = Math.hypot(...e2) || 1;
    const n1 = [-e1[1] / l1, e1[0] / l1], n2 = [-e2[1] / l2, e2[0] / l2];
    let m = [n1[0] + n2[0], n1[1] + n2[1]];
    const ml = Math.hypot(...m) || 1;
    m = [m[0] / ml, m[1] / ml];
    const k = Math.min(3, 1 / Math.max(0.2, m[0] * n2[0] + m[1] * n2[1]));
    return [p[0] + m[0] * d * k, p[1] + m[1] * d * k];
  });
  for (let i = 0; i < n; i++) {
    const A = ring[i], B = ring[(i + 1) % n], A2 = out[i], B2 = out[(i + 1) % n];
    const L = Math.hypot(B2[0] - A2[0], B2[1] - A2[1]);
    if (L < 0.05) continue;
    const nn = [-(B2[1] - A2[1]) / L, 0, (B2[0] - A2[0]) / L];
    // The face, the underside (facing down) and the top (facing up).
    builder.quad(mat, [A2[0], y0, A2[1]], [B2[0], y0, B2[1]], [B2[0], y1, B2[1]], [A2[0], y1, A2[1]], [0, 0], [L / 3, 0], [L / 3, (y1 - y0) / 3], [0, (y1 - y0) / 3], color, nn);
    builder.quad(mat, [A[0], y0, A[1]], [B[0], y0, B[1]], [B2[0], y0, B2[1]], [A2[0], y0, A2[1]], [0, 0], [1, 0], [1, 1], [0, 1], under, [0, -1, 0]);
    builder.quad(mat, [A[0], y1, A[1]], [A2[0], y1, A2[1]], [B2[0], y1, B2[1]], [B[0], y1, B[1]], [0, 0], [1, 0], [1, 1], [0, 1], color, [0, 1, 0]);
    // The inside of the parapet lip, seen from the roof.
    builder.quad(mat, [B[0], top, B[1]], [A[0], top, A[1]], [A[0], y1, A[1]], [B[0], y1, B[1]], [0, 0], [1, 0], [1, 1], [0, 1], under, [-nn[0], 0, -nn[2]]);
  }
}

/** A box from y0 to y1 over the rectangle round (x, z) along (ax, az), `w` by `d` meters: four walls and a lid. */
function box(builder, wallMat, lidMat, x, z, ax, az, w, d, y0, y1, color, lid = color) {
  const px = -az, pz = ax, hw = w / 2, hd = d / 2;
  const P = (s, t, y) => [x + ax * s + px * t, y, z + az * s + pz * t];
  const c = [[hw, hd], [-hw, hd], [-hw, -hd], [hw, -hd]];
  // Round the corners so that each wall faces out: the same way the walls of a building run.
  for (let i = 0; i < 4; i++) {
    const [s0, t0] = c[(i + 1) % 4], [s1, t1] = c[i];
    const a = P(s0, t0, y0), b = P(s1, t1, y0);
    const L = Math.hypot(b[0] - a[0], b[2] - a[2]);
    builder.quad(wallMat, a, b, P(s1, t1, y1), P(s0, t0, y1), [0, 0], [L / 3, 0], [L / 3, (y1 - y0) / 3], [0, (y1 - y0) / 3], color);
  }
  builder.quad(lidMat, P(hw, hd, y1), P(hw, -hd, y1), P(-hw, -hd, y1), P(-hw, hd, y1), [0, 0], [w / 3, 0], [w / 3, d / 3], [0, d / 3], lid, [0, 1, 0]);
}

/** What stands on a flat roof: a penthouse for the lifts and plant, and air-handling units about it. */
function rooftop(builder, polygon, top, seed, area) {
  const r = boundingRectangle(polygon[0]);
  if (!r || r.w < 8 || r.d < 6) return;
  const gray = linear('#b8b6b0');
  const big = top > 40;
  const pw = Math.max(4, Math.min(r.w * 0.34, 22)), pd = Math.max(3.5, Math.min(r.d * 0.34, 14));
  const ox = (unit(`${seed}px`) - 0.5) * (r.w - pw) * 0.4, oz = (unit(`${seed}pz`) - 0.5) * (r.d - pd) * 0.4;
  const cx = r.x + r.ax * ox - r.az * oz, cz = r.z + r.az * ox + r.ax * oz;
  const fits = (x, z, w, d) => [[1, 1], [-1, 1], [-1, -1], [1, -1]].every(([s, t]) => inside(polygon, x + r.ax * s * w / 2 - r.az * t * d / 2, z + r.az * s * w / 2 + r.ax * t * d / 2));
  if (fits(cx, cz, pw + 2, pd + 2)) box(builder, 'wall:block', 'ground:membrane-gray', cx, cz, r.ax, r.az, pw, pd, top - 0.1, top + (big ? 4.6 : 3.2), gray);
  // The units: steel boxes with a fan on top, a few on a small roof and more on a big one.
  const count = Math.min(8, 1 + Math.floor(area / 500));
  const steel = linear('#9ea4aa');
  for (let k = 0; k < count; k++) {
    const s = (unit(`${seed}u${k}`) - 0.5) * r.w * 0.8, t = (unit(`${seed}v${k}`) - 0.5) * r.d * 0.8;
    const x = r.x + r.ax * s - r.az * t, z = r.z + r.az * s + r.ax * t;
    const w = 2 + unit(`${seed}w${k}`) * 2.5, d = 1.4 + unit(`${seed}d${k}`) * 1;
    if (Math.abs(s - ox) < (pw + w) / 2 + 0.5 && Math.abs(t - oz) < (pd + d) / 2 + 0.5) continue;
    if (!fits(x, z, w + 1.5, d + 1.5)) continue;
    box(builder, 'prop:steel', 'prop:steel', x, z, r.ax, r.az, w, d, top - 0.05, top + 1.3 + unit(`${seed}h${k}`) * 0.6, steel, steel.map((c) => c * 0.8));
  }
}

function flat(builder, rings, y, seed, photo = null) {
  const t = triangulate(rings);
  let material, tile, color;
  if (photo) {
    // What the photograph shows: a bright roof is white membrane, a mid gray one gray membrane or gravel, a dark one gravel, a green one planted.
    const [r, g, b, green] = photo;
    const lum = (r + g + b) / 3;
    material = green > 0.085 ? 'ground:turf' : lum >= 168 ? 'ground:membrane-white' : lum >= 138 && unit(`${seed}m`) < 0.55 ? 'ground:membrane-gray' : 'ground:gravel-roof';
    tile = material === 'ground:turf' ? 1.5 : material === 'ground:gravel-roof' ? 2 : 3;
    color = tintToward(material, [r, g, b]);
    // A white roof in the sun is bright in the photograph and brighter still lit in the scene: kept a little down, so it does not glare.
    if (material === 'ground:membrane-white') color = color.map((c) => c * 0.8);
  } else {
    // Each roof is its own kind: white or gray membrane, or gravel over tar.
    let pick = unit(seed + 'roof') * FLAT_ROOFS.reduce((a, r) => a + r[2], 0), kind = FLAT_ROOFS[0];
    for (const r of FLAT_ROOFS) { pick -= r[2]; if (pick <= 0) { kind = r; break; } }
    [material, tile] = kind;
    const v = 0.92 + unit(seed + 'tone') * 0.14;
    color = [v, v, v];
  }
  const at = (i) => [t.points[i * 2], y, t.points[i * 2 + 1]];
  for (let k = 0; k < t.index.length; k += 3) {
    const a = at(t.index[k]), b = at(t.index[k + 1]), c = at(t.index[k + 2]);
    const uv = (p) => [p[0] / tile, p[2] / tile];
    builder.tri(material, a, b, c, uv(a), uv(b), uv(c), color, [0, 1, 0]);
  }
}

/** A hip roof over a rectangle: four planes meeting in a ridge along the long side. */
function hip(builder, r, y, key, seed, photo = null) {
  const over = 0.35;
  const hw = r.w / 2 + over, hd = r.d / 2 + over;
  const ridge = Math.max(0, (r.w - r.d) / 2);
  const rise = hd * 0.62;
  const px = -r.az, pz = r.ax;
  const P = (s, t, up = 0) => [r.x + r.ax * s + px * t, y + up, r.z + r.az * s + pz * t];
  const c1 = P(hw, hd), c2 = P(-hw, hd), c3 = P(-hw, -hd), c4 = P(hw, -hd);
  const r1 = P(ridge, 0, rise), r2 = P(-ridge, 0, rise);
  let material = SHINGLES[Math.floor(unit(seed + 'sh') * SHINGLES.length) % SHINGLES.length];
  if (photo) material = photo[0] - photo[2] > 14 ? SHINGLES[1] : SHINGLES[0];
  const v = 0.9 + unit(seed + 'hc') * 0.2;
  const color = photo ? tintToward(material, photo).map((c) => c * v) : [v, v, v];
  const tile = 1.6;
  // Shingles run along the eave and up the slope: each face takes its own two directions.
  const face = (a, b, c, d = null) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    const l = Math.hypot(...n) || 1;
    n = n.map((q) => q / l);
    const flip = n[1] < 0;
    if (flip) n = n.map((q) => -q);
    // Along the eave is level and across the way the face leans; up the slope is in the face, perpendicular to that.
    const eh = Math.hypot(n[0], n[2]) || 1;
    const e = [-n[2] / eh, 0, n[0] / eh];
    let up = [n[1] * e[2] - n[2] * e[1], n[2] * e[0] - n[0] * e[2], n[0] * e[1] - n[1] * e[0]];
    if (up[1] < 0) up = up.map((q) => -q);
    const uv = (p) => {
      const dx = p[0] - a[0], dy = p[1] - a[1], dz = p[2] - a[2];
      return [(dx * e[0] + dz * e[2]) / tile, (dx * up[0] + dy * up[1] + dz * up[2]) / tile];
    };
    const add = (p, q, s2) => (flip ? builder.tri(material, p, s2, q, uv(p), uv(s2), uv(q), color) : builder.tri(material, p, q, s2, uv(p), uv(q), uv(s2), color));
    add(a, b, c);
    if (d) add(a, c, d);
  };
  face(c1, c2, r2, r1); // the +p side
  face(c4, c3, r2, r1); // the -p side
  face(c1, c4, r1); // the +a end
  face(c2, c3, r2); // the -a end
}

/**
 * A canopy: a flat roof `h` meters up on slim steel posts, its fascia round the edge and its underside lit pale, with
 * nothing to bump into under it but the posts.
 */
export function canopy(builder, rings, foot, h, seed) {
  const ring = open(rings[0]);
  const top = foot + h, deep = 0.7;
  const fascia = [0.92, 0.92, 0.9], under = [0.82, 0.82, 0.8], steel = [0.55, 0.57, 0.6];
  const n = ring.length;
  // The fascia: faces out all round (the ring may run either way), and is solid from the outside.
  let a2 = 0;
  for (let i = 0; i < n; i++) { const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % n]; a2 += x0 * z1 - x1 * z0; }
  const sign = a2 > 0 ? -1 : 1;
  for (let i = 0; i < n; i++) {
    const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % n];
    const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1;
    const nrm = [sign * -dz / l, 0, sign * dx / l];
    const A = [x0, top, z0], B = [x1, top, z1], C = [x1, top - deep, z1], D = [x0, top - deep, z0];
    const [p, q, r, t] = sign > 0 ? [A, B, C, D] : [B, A, D, C];
    builder.quad('surface:concrete', p, t, r, q, [0, 0], [0, 1], [l / 3, 1], [l / 3, 0], fascia, nrm);
    builder.quad('surface:concrete', q, r, t, p, [l / 3, 0], [l / 3, 1], [0, 1], [0, 0], fascia, nrm.map((v) => -v));
  }
  // The roof on top (rolled on), and the soffit under it.
  const t = triangulate(rings);
  const at = (i, y) => [t.points[i * 2], y, t.points[i * 2 + 1]];
  for (let k = 0; k < t.index.length; k += 3) {
    const a = at(t.index[k], top), b = at(t.index[k + 1], top), c = at(t.index[k + 2], top);
    builder.tri('ground:membrane-gray', a, b, c, [a[0] / 3, a[2] / 3], [b[0] / 3, b[2] / 3], [c[0] / 3, c[2] / 3], [0.9, 0.9, 0.9], [0, 1, 0]);
    builder.collide(a, b, c);
    const d = at(t.index[k], top - deep), e = at(t.index[k + 1], top - deep), f = at(t.index[k + 2], top - deep);
    builder.tri('surface:concrete', d, f, e, [0, 0], [1, 1], [1, 0], under, [0, -1, 0]);
  }
  // The posts: inset from the corners, one every twelve meters or so along the longer runs.
  const posts = [];
  const cx = ring.reduce((s, p) => s + p[0], 0) / n, cz = ring.reduce((s, p) => s + p[1], 0) / n;
  for (let i = 0; i < n; i++) {
    const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % n], l = Math.hypot(x1 - x0, z1 - z0);
    const k = Math.max(1, Math.round(l / 12));
    for (let j = 0; j < k; j++) {
      const f = j / k, x = x0 + (x1 - x0) * f, z = z0 + (z1 - z0) * f;
      const dx = cx - x, dz = cz - z, dl = Math.hypot(dx, dz) || 1, inset = Math.min(1.2, dl * 0.3);
      if (posts.every(([px, pz]) => Math.hypot(px - x, pz - z) > 4)) posts.push([x + dx / dl * inset, z + dz / dl * inset]);
    }
  }
  for (const [x, z] of posts.slice(0, 16)) {
    const r = 0.18;
    for (let k = 0; k < 6; k++) {
      const a0 = (k / 6) * Math.PI * 2, a1 = ((k + 1) / 6) * Math.PI * 2;
      const p0 = [x + Math.cos(a0) * r, z + Math.sin(a0) * r], p1 = [x + Math.cos(a1) * r, z + Math.sin(a1) * r];
      builder.quad('prop:steel', [p0[0], foot, p0[1]], [p0[0], top - deep, p0[1]], [p1[0], top - deep, p1[1]], [p1[0], foot, p1[1]], [0, 0], [0, 1], [1, 1], [1, 0], steel, [Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)]);
    }
    builder.trunks.push([x, z, r, foot, top - deep]);
  }
}
