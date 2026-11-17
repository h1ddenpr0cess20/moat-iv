import { glowing as designGlow } from './rt/look.js';
/**
 * The city at night: what glows, and how much, as the sky turns from day to night (`setNight(f)`, 0 for day, 1 for
 * night). Each material is dressed for it as it is made (scene.js `materialFor` calls `dressForNight`):
 *
 *   the windows    every facade's glass lit warm from within (an emissive map of where its texture is glass), a
 *                  share of them on, each window by its own chance (the engine's emissiveScatter); shop fronts most
 *   the signs      the names on the shops' boards (their atlas is its own emissive map)
 *   the lamps      the street lamps' heads, brighter
 *   the market     the Downtown Market's greenhouse, glowing green-gold
 *   the station    Rapid Central Station's canopy, washed in slowly turning colour, as its lights do it
 */

/** How warm a lit window is, and how much of each kind of wall is lit at night. */
const WARM = '#ffd69a';
const LIT = { shop: 0.8, office: 0.38, curtain: 0.35, precast: 0.38, terracotta: 0.4, sandstone: 0.35, limestone: 0.38, historic: 0.42, 'historic-arched': 0.42, 'glass-blue': 0.32, 'glass-teal': 0.32, 'glass-dark': 0.3, 'glass-bronze': 0.3, brick: 0.42, house: 0.45, concrete: 0.3, garage: 0.2 };

/** Every material that glows, with its glow by day and by night. */
const glowing = [];
let level = 0;
const canopy = [];
let warned = false;

/** Where a facade's texture is glass: its dark, cool pixels, as a warm emissive map (black where it is wall). */
function windowsOf(GFX, map, kind) {
  const img = map?.image;
  if (!img || typeof document === 'undefined') return null;
  const size = 256, c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  try { ctx.drawImage(img, 0, 0, size, size); } catch { return null; }
  const d = ctx.getImageData(0, 0, size, size), p = d.data;
  // Which pixels are glass: darker than the wall round it and no warmer than it is blue (brick is warm; mortar light).
  const on = new Uint8Array(size * size);
  for (let i = 0, k = 0; k < on.length; i += 4, k++) {
    const r = p[i], g = p[i + 1], b = p[i + 2];
    on[k] = 0.3 * r + 0.59 * g + 0.11 * b < 120 && b >= r - 6 ? 1 : 0;
  }
  // The city's glass (facades.js) is three panes of vision glass over a spandrel: its reflections are no guide, its
  // layout is. The panes light, the mullions and the floor's spandrel do not.
  if (kind?.startsWith('glass-')) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size, lu = (u * 3) % 1, edge = (Math.min(lu, 1 - lu) * size) / 3;
    on[y * size + x] = edge > size * 0.016 && v > 0.02 && v < 0.765 ? 1 : 0;
  }
  // A pane is a run of them: keep a pixel only where most of its neighbours agree (no speckle from the texture's grain).
  let glass = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) n += on[((y + dy + size) % size) * size + ((x + dx + size) % size)];
    const lit = n >= 6, i = (y * size + x) * 4, k = lit ? 0.85 + 0.15 * Math.sin(i * 0.013) : 0;
    if (lit) glass++;
    p[i] = 255 * k; p[i + 1] = 214 * k; p[i + 2] = 160 * k; p[i + 3] = 255;
  }
  // A texture that is no glass at all lights nothing; one that is all glass (a curtain wall) lights its panels.
  if (glass < size * size * 0.02) return null;
  ctx.putImageData(d, 0, 0);
  const t = new GFX.CanvasTexture(c);
  t.colorSpace = GFX.SRGBColorSpace;
  t.wrapS = t.wrapT = GFX.RepeatWrapping;
  return t;
}

const glow = (m, day, night) => { glowing.push({ m, day, night }); m.emissiveIntensity = day + (night - day) * level; };

/** Dresses a new material for the night, by its name: what of it glows, and how much by day and by night. */
export function dressForNight(GFX, name, m) {
  if (name.startsWith('wall:facade:')) {
    // An engine without emissive maps would light the whole wall: no windows at all is better (run `npm install`).
    if (!('emissiveMap' in m) || !('emissiveScatter' in m)) {
      if (!warned) { warned = true; console.warn('city: the engine has no emissive maps; run `npm install` for lit windows at night'); }
      return;
    }
    const kind = name.slice(12);
    const map = windowsOf(GFX, m.map, kind);
    if (!map) return;
    m.emissiveMap = map;
    m.emissive = new GFX.Color(WARM);
    m.emissiveScatter = LIT[kind] ?? 0.45;
    // Each of a glass wall's three panes a room of its own.
    if (kind.startsWith('glass-')) m.emissiveCells = [3, 1];
    glow(m, 0, 1.6);
  } else if (name.startsWith('sign:')) {
    m.emissiveMap = m.map;
    m.emissive = new GFX.Color('#ffffff');
    glow(m, 0, 0.95);
  } else if (name.startsWith('M_')) {
    // Rivertown's designs: windows warm by night, shop fronts most, signs and lamps lit (rt/look.js says how much).
    const g = designGlow.find(([mm]) => mm === m);
    if (g) glow(m, 0, g[1]);
  } else if (name === 'prop:glow') {
    glow(m, 0.9, 3.2);
  } else if (name === 'prop:glass') {
    m.emissive = new GFX.Color('#c8e8a0');
    glow(m, 0.15, 1.4);
  } else if (name === 'prop:canopy' || name === 'prop:canopy-under') {
    // Lit from below by coloured floods: the underside washed in it, the top only tinted, so its waves still show.
    m.emissive = new GFX.Color('#8060ff');
    canopy.push(m);
    glow(m, 0, name === 'prop:canopy' ? 0.1 : 0.75);
  }
}

/** How far into the night it is (0 day, 1 night): every glow to match. */
export function setNight(f) {
  level = Math.max(0, Math.min(1, f));
  for (const { m, day, night } of glowing) m.emissiveIntensity = day + (night - day) * level;
}

/** The station canopy's colours turning, `t` seconds on. */
export function nightTick(t) {
  if (!canopy.length || level <= 0) return;
  const h = (t * 0.035) % 1;
  for (const m of canopy) m.emissive.setHSL(h, 0.75, 0.5);
}

export const nightLevel = () => level;

/** Lets go of a material that is gone (a tile's sign atlas, with the tile). */
export function forgetGlow(m) {
  const i = glowing.findIndex((g) => g.m === m);
  if (i >= 0) glowing.splice(i, 1);
}
