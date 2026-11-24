/**
 * Facades the engine's set does not have, painted the same way (one story of one bay, tiling across and up; the
 * top of the picture is the top of the story), for the buildings of downtown Grand Rapids as their photographs show
 * them:
 *
 * - `glass`: a curtain wall of reflective glass in a `tone`: `bronze` (the Amway Grand tower, Campau Square Plaza),
 *   `blue` (the old National City building on Monroe), `teal` (the JW Marriott), `dark` (the newer towers),
 *   with mullions to suit and a spandrel at the foot of each story.
 * - `limestone`: pale ashlar in courses with a rusticated joint, a tall window with a dressed lintel and a sill:
 *   McKay Tower, the old Federal Building, the banks of Pearl Street.
 * - `historic`: running-bond brick (light, to be tinted red, brown or buff) round a tall one-over-one sash window
 *   with a stone lintel and sill: the Victorian and Edwardian blocks of Monroe Center, Ionia and Pearl.
 * - `concrete`: board-formed concrete in big panels with the form-tie holes in rows: the Grand Rapids Art Museum.
 *
 * `paintCityFacade` gives raw pixels (`{ size, color, height }`), like the engine's painters, so it runs in a worker.
 */
import { fractal } from 'madness-engine/textures/painters';
import { Pixels, clamp, hash, lerp, ramp } from 'madness-engine/textures/pixel-kit';

const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const scale = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

const TONES = {
  bronze: { lo: [64, 46, 30], hi: [150, 116, 80], sky: [196, 170, 132], frame: [62, 48, 36], spandrel: [58, 44, 32] },
  blue: { lo: [36, 66, 110], hi: [92, 136, 188], sky: [170, 198, 228], frame: [176, 182, 190], spandrel: [44, 60, 82] },
  teal: { lo: [30, 70, 78], hi: [86, 140, 146], sky: [170, 206, 208], frame: [150, 160, 162], spandrel: [34, 58, 62] },
  dark: { lo: [22, 28, 34], hi: [70, 82, 94], sky: [150, 164, 178], frame: [40, 42, 46], spandrel: [26, 30, 34] },
};

function glass(s, { seed, tone = 'blue' }) {
  const n = s.size, t = TONES[tone] ?? TONES.blue;
  const sky = fractal(seed * 7 + 11, 3, 4), city = fractal(seed * 7 + 13, 6, 3), fine = fractal(seed * 7 + 17, 48, 1);
  const panes = [0, 1, 2].map((i) => 0.9 + hash(i, seed, 3) * 0.2);
  const mull = n * 0.011;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x, u = x / n, v = y / n;
    const pane = Math.min(2, Math.floor(u * 3)), lu = u * 3 - pane, edge = Math.min(lu, 1 - lu) * n / 3;
    let rgb, h;
    if (edge < mull || v < 0.012 || (v > 0.77 && v < 0.79)) { rgb = t.frame; h = 0.85; }
    else if (v < 0.77) {
      // Vision glass: the tone, lighter toward the top where it takes the sky, with clouds and the street opposite in it.
      const cloud = ramp(0.4, 0.85, sky(u * 0.9 + pane * 0.07, v * 0.6)), block = ramp(0.45, 0.8, city(u * 0.8 + pane * 0.05, v * 0.7));
      rgb = mix(t.lo, t.hi, clamp(1 - v / 0.77) * 0.75);
      rgb = mix(mix(rgb, t.sky, cloud * 0.28), scale(t.lo, 0.7), block * 0.3);
      rgb = scale(rgb, panes[pane] * (0.95 + (fine(u, v) - 0.5) * 0.06));
      h = 0.46;
    } else { rgb = scale(t.spandrel, panes[pane] * (0.96 + (fine(u, v) - 0.5) * 0.05)); h = 0.5; }
    s.r[i] = rgb[0]; s.g[i] = rgb[1]; s.b[i] = rgb[2]; s.h[i] = h;
  }
}

/** A tall window in a wall: dark glass with a sash rail, a frame, a lintel above it and a sill under it. */
function windowAt(u, v, { u0, u1, v0, v1, frame, lintel, sill, arch = false }) {
  const w = u1 - u0;
  // An arched head: the top of the opening is a half-round over the window's width.
  const r = w / 2, cx = (u0 + u1) / 2, top = arch ? v0 + r * 0.9 : v0;
  const inArch = arch && v < top && v >= v0 - 0.001 && Math.hypot((u - cx) / r, (v - top) / (r * 0.9)) <= 1;
  const inside = u > u0 && u < u1 && v > top && v < v1;
  if (inside || inArch) {
    const g = ramp(0, 1, (v - v0) / (v1 - v0));
    let rgb = mix([70, 84, 96], [24, 30, 38], g * 0.85), h = 0.15;
    const rail = Math.abs(v - (top + (v1 - top) * 0.5)) < 0.008, side = u < u0 + 0.014 || u > u1 - 0.014, mid = arch && Math.abs(u - cx) < 0.006;
    if (rail || side || mid || v > v1 - 0.014) { rgb = frame; h = 0.32; }
    return { rgb, h };
  }
  // The lintel: a stone block over the window, a little wider; the sill: a ledge under it, proud and lit.
  if (lintel && !arch && u > u0 - 0.03 && u < u1 + 0.03 && v > v0 - 0.07 && v <= v0) return { rgb: lintel, h: 0.8 };
  if (lintel && arch && Math.hypot((u - cx) / (r + 0.035), (v - top) / (r * 0.9 + 0.05)) <= 1 && v < top) return { rgb: lintel, h: 0.78 };
  if (sill && u > u0 - 0.025 && u < u1 + 0.025 && v >= v1 && v < v1 + 0.035) return { rgb: sill, h: 0.85 };
  // The shadowed reveal round the opening.
  if (u > u0 - 0.012 && u < u1 + 0.012 && v > (arch ? v0 : v0 - 0.012) && v < v1 + 0.004) return { rgb: null, h: 0.35, shade: 0.72 };
  return null;
}

function limestone(s, { seed }) {
  const n = s.size;
  const cloud = fractal(seed * 5 + 3, 5, 4), fine = fractal(seed * 5 + 7, 40, 2);
  const stone = [226, 216, 196];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x, u = x / n, v = y / n;
    const course = Math.floor(v * 6), cv = v * 6 - course;
    const off = course % 2 ? 0.25 : 0, block = ((u + off) * 2) % 1;
    // Each block a shade of its own; the joints thin and dark, the bed joints a little sunk (rusticated).
    const k = 0.93 + (hash(course, Math.floor((u + off) * 2), seed) - 0.5) * 0.08 + (cloud(u, v) - 0.5) * 0.1 + (fine(u, v) - 0.5) * 0.05;
    let rgb = scale(stone, k), h = 0.6 + (fine(u, v) - 0.5) * 0.04;
    if (cv < 0.035) { rgb = scale(rgb, 0.62); h = 0.3; } else if (block < 0.008 || block > 0.992) { rgb = scale(rgb, 0.78); h = 0.45; }
    const w = windowAt(u, v, { u0: 0.3, u1: 0.7, v0: 0.2, v1: 0.8, frame: [58, 52, 46], lintel: scale(stone, 1.04), sill: scale(stone, 1.06) });
    if (w) { if (w.rgb) rgb = w.rgb; else rgb = scale(rgb, w.shade); h = w.h; }
    s.r[i] = rgb[0]; s.g[i] = rgb[1]; s.b[i] = rgb[2]; s.h[i] = h;
  }
}

function historic(s, { seed, arch = false }) {
  const n = s.size;
  const cloud = fractal(seed * 3 + 5, 6, 3);
  // Running bond: a brick 0.2 m by 0.065 m, a story of four meters: some 60 courses.
  const courses = 58, perRow = 16;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x, u = x / n, v = y / n;
    const c = Math.floor(v * courses), cv = v * courses - c;
    const bu = u * perRow + (c % 2 ? 0.5 : 0), b = Math.floor(bu), bf = bu - b;
    const tone = hash(b, c, seed);
    let rgb = scale([214, 172, 144], 0.86 + tone * 0.22 + (cloud(u, v) - 0.5) * 0.12), h = 0.62;
    if (tone > 0.94) rgb = scale(rgb, 0.8); // the odd overburnt brick
    if (cv < 0.16 || bf < 0.035) { rgb = [172, 164, 154]; h = 0.4; } // mortar, raked back
    const w = windowAt(u, v, { u0: 0.32, u1: 0.68, v0: 0.2, v1: 0.82, frame: [236, 232, 222], lintel: [222, 214, 196], sill: [226, 218, 200], arch });
    if (w) { if (w.rgb) rgb = w.rgb; else rgb = scale(rgb, w.shade); h = w.h; }
    s.r[i] = rgb[0]; s.g[i] = rgb[1]; s.b[i] = rgb[2]; s.h[i] = h;
  }
}

function concrete(s, { seed }) {
  const n = s.size;
  const cloud = fractal(seed * 11 + 2, 4, 4), board = fractal(seed * 11 + 5, 3, 2);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x, u = x / n, v = y / n;
    // The boards of the formwork: horizontal strips each its own shade, the wood's grain faint in them.
    const strip = Math.floor(v * 16), grain = board(u * 6, strip * 0.37 + v * 0.2);
    const k = 0.92 + (hash(strip, 0, seed) - 0.5) * 0.05 + (cloud(u, v) - 0.5) * 0.1 + (grain - 0.5) * 0.04 + (hash(x, y, 5) - 0.5) * 0.04;
    let rgb = scale([206, 204, 198], k), h = 0.55;
    // The panel joints, and the tie holes in a grid between them.
    if (u < 0.004 || v < 0.004) { rgb = scale(rgb, 0.6); h = 0.25; }
    for (const tu of [0.25, 0.75]) for (const tv of [0.25, 0.75]) if (Math.hypot(u - tu, v - tv) < 0.011) { rgb = scale(rgb, 0.55); h = 0.2; }
    s.r[i] = rgb[0]; s.g[i] = rgb[1]; s.b[i] = rgb[2]; s.h[i] = h;
  }
}

const PAINTERS = { glass, limestone, historic, concrete };

/** One of the city's facades as pixels: `kind` (glass, limestone, historic, concrete), `tone` for glass, `seed`, `size`. */
export function paintCityFacade({ size = 1024, kind = 'historic', tone = 'blue', seed = 1, arch = false } = {}) {
  const s = new Pixels(size);
  PAINTERS[kind](s, { seed, tone, arch });
  return s.bake();
}
