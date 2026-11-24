import { flat } from './colors.js';

/**
 * How each of Rivertown's materials (by its M_* name, as its designs name them) is drawn in the Madness engine: the
 * tiling texture it takes and how big one repeat is in meters, how rough, metallic or glassy it is, and whether the
 * ball collides with it. `recipe(name)` is plain data, so the region worker can read it too; `materialFor` makes the
 * engine material, painting its texture on a canvas the first time.
 */

const GLASS = /^M_(Glass_|Window|StoreGlass|Spandrel)/;

// The scanned textures (Poly Haven, CC0), as the Blender materials use them: [material, asset, its size in meters].
// Each is drawn tinted by the material's own color (or the color given here); until its image arrives, the painted texture stands in.
const SCANS = [
  [/^M_Brick_/, 'red_brick_03', [1, 1]], [/^M_Siding_/, 'weathered_plank_siding', [1.57, 1.57]],
  [/^M_(Shingles_|Slate$)/, 'roof_slates_02', [3, 3]], [/^M_Stucco_/, 'gray_plaster', [1, 1]],
  [/^M_Limestone$/, 'white_sandstone_blocks_02', [2, 2]], [/^M_Sandstone$/, 'sandstone_blocks_05', [3, 3]],
  [/^M_Stone_Base$/, 'stone_wall', [2, 2]], [/^M_(Precast|Concrete|Concrete_Dark|Curb)$/, 'brushed_concrete', [4, 4]],
  [/^M_Concrete_Board$/, 'brushed_concrete', [2.5, 2.5]], [/^M_Asphalt$/, 'asphalt_04', [4.04, 4.04], '#2f2f31'],
  [/^M_Asphalt_Old$/, 'asphalt_04', [4.04, 4.04], '#4a4947'],  // not asphalt_02: its long cracks show as lines down every road
 
  [/^M_Pavers_Brick$/, 'brick_pavement_02', [2, 2]],
  [/^M_Grass$/, 'leafy_grass', [2, 2]], [/^M_Bark$/, 'bark_brown_02', [1, 1]],
  [/^M_Metal_Panel/, 'corrugated_iron_02', [2.7, 2.7]], [/^M_GarageDoor$/, 'painted_metal_shutter', [2, 2]],
  [/^M_Ground_Dirt$/, 'dirt', [2, 2]], [/^M_Ballast$/, 'gravel', [2, 2]],
];

export function recipe(name) {
  const r = paintedRecipe(name);
  const n = name.replace(/\.\d+$/, '');
  const s = SCANS.find(([re]) => re.test(n));
  return s ? { ...r, kind: `scan:${s[1]}`, painted: r.kind ?? 'rough', bump: r.bump ?? 0.6, size: s[2], lift: 1.25, tint: s[3] } : r;
}

function paintedRecipe(name) {
  const n = name.replace(/\.\d+$/, '');
  if (n === 'M_StainedGlass') return { glass: true, stained: true };
  if (GLASS.test(n)) return { glass: true, metal: n === 'M_Window' || n === 'M_StoreGlass' ? 0.15 : 0.55 };
  if (n === 'M_Water') return { water: true };
  if (n.startsWith('M_Brick_')) return { kind: 'brick', size: [2.25, 1.5], bump: 0.6, lift: 1.25 };
  if (n.startsWith('M_Siding_')) return { kind: 'siding', size: [1.0, 1.6], bump: 1.2, lift: 1.05 };
  if (n.startsWith('M_Shingles_') || n === 'M_Slate') return { kind: 'shingles', size: [1.32, 1.4], bump: 1.0, lift: 1.2 };
  if (n.startsWith('M_Stucco_')) return { kind: 'rough', size: [4, 4], bump: 0.6, lift: 1.05 };
  if (n.startsWith('M_Leaves_')) return { kind: 'leaves', size: [2, 2], bump: 1.5, lift: 1.3 };
  if (['M_Limestone', 'M_Sandstone', 'M_Terracotta', 'M_Stone_Base'].includes(n)) return { kind: 'stone', size: [2.4, 2.4], bump: 0.5, lift: 1.08 };
  if (n === 'M_Precast') return { kind: 'panel', size: [3, 3], bump: 0.4, lift: 1.05 };
  if (n === 'M_Concrete_Board') return { kind: 'board', size: [2.4, 1.2], bump: 0.6, lift: 1.1 };
  if (['M_Sidewalk', 'M_Plaza'].includes(n)) return { kind: 'slabs', size: [3, 3], bump: 0.5, lift: 1.1 };
  if (['M_Asphalt', 'M_Asphalt_Old'].includes(n)) return { kind: 'asphalt', size: [6, 6], bump: 0.6, lift: 1.15 };
  if (n === 'M_Grass') return { kind: 'grass', size: [8, 8], bump: 0.8, lift: 1.15 };
  if (n.startsWith('M_Metal_Panel') || n === 'M_GarageDoor') return { kind: 'metal', size: [3, 2], bump: 0.5, lift: 1.05 };
  if (/^M_(Concrete|Roof_|Curb|Ground_|Ballast|Bark|Wood)/.test(n)) return { kind: 'rough', size: [4, 4], bump: 0.6, lift: 1.12 };
  return {};
}

/** What the ball rolls on and bumps into: everything but paint, glass set back in its opening, trim and leaves. */
export function solid(name) {
  return !/^M_(Lane_|Frame_White|Mullion|Window|StoreGlass|Glass_|Spandrel|StainedGlass|Water|Leaves_|Lamp_Glow)/.test(name);
}

// ———————————————— the textures, painted on canvases

let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const gray = (v) => { const k = Math.max(0, Math.min(255, Math.round(v * 255))); return `rgb(${k},${k},${k})`; };

function grain(g, w, h, amount, size = 1) {
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let y = 0; y < h; y += size) for (let x = 0; x < w; x += size) {
    const n = (rnd() - 0.5) * amount;
    for (let yy = 0; yy < size && y + yy < h; yy++) for (let xx = 0; xx < size && x + xx < w; xx++) {
      const i = ((y + yy) * w + x + xx) * 4;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
  }
  g.putImageData(img, 0, 0);
}

const PAINT = {
  // Running bond: 10 bricks by 20 courses.
  brick(g, w, h) {
    g.fillStyle = gray(0.72); g.fillRect(0, 0, w, h);
    const bw = w / 10, bh = h / 20, j = 2;
    for (let r = 0; r < 20; r++) for (let k = -1; k < 11; k++) { g.fillStyle = gray(0.82 + rnd() * 0.3); g.fillRect(k * bw + (r % 2) * bw / 2 + j / 2, r * bh + j / 2, bw - j, bh - j); }
    grain(g, w, h, 26);
  },
  // Lap siding: eight boards, each shadowed at its foot.
  siding(g, w, h) {
    const bh = h / 8;
    for (let r = 0; r < 8; r++) {
      const grd = g.createLinearGradient(0, r * bh, 0, (r + 1) * bh);
      grd.addColorStop(0, gray(1)); grd.addColorStop(0.85, gray(0.9)); grd.addColorStop(1, gray(0.55));
      g.fillStyle = grd; g.fillRect(0, r * bh, w, bh);
    }
    grain(g, w, h, 10);
  },
  shingles(g, w, h) {
    g.fillStyle = gray(0.4); g.fillRect(0, 0, w, h);
    const tw = w / 4, th = h / 10;
    for (let r = 0; r < 10; r++) for (let k = -1; k < 5; k++) { g.fillStyle = gray(0.75 + rnd() * 0.3); g.fillRect(k * tw + (r % 2) * tw / 2 + 2, r * th + 1, tw - 4, th - 3); }
    grain(g, w, h, 60, 2);
  },
  stone(g, w, h) {
    g.fillStyle = gray(0.7); g.fillRect(0, 0, w, h);
    const bw = w / 2, bh = h / 4;
    for (let r = 0; r < 4; r++) for (let k = -1; k < 3; k++) { g.fillStyle = gray(0.9 + rnd() * 0.12); g.fillRect(k * bw + (r % 2) * bw / 2 + 1, r * bh + 1, bw - 2, bh - 2); }
    grain(g, w, h, 22);
  },
  panel(g, w, h) {
    g.fillStyle = gray(0.62); g.fillRect(0, 0, w, h);
    for (let r = 0; r < 2; r++) { g.fillStyle = gray(0.93 + rnd() * 0.07); g.fillRect(1, r * h / 2 + 1, w - 2, h / 2 - 2); }
    grain(g, w, h, 14);
  },
  board(g, w, h) {
    for (let r = 0; r < 8; r++) { g.fillStyle = gray(0.85 + rnd() * 0.15); g.fillRect(0, r * h / 8, w, h / 8 - 1); }
    grain(g, w, h, 24);
  },
  slabs(g, w, h) {
    // Four slabs, the saw-cut joints between them dark enough to read from the street.
    const j = Math.max(2, Math.round(w / 128));
    g.fillStyle = gray(0.5); g.fillRect(0, 0, w, h);
    for (let r = 0; r < 2; r++) for (let k = 0; k < 2; k++) { g.fillStyle = gray(0.9 + rnd() * 0.08); g.fillRect(k * w / 2 + j, r * h / 2 + j, w / 2 - 2 * j, h / 2 - 2 * j); }
    grain(g, w, h, 20);
  },
  asphalt(g, w, h) {
    g.fillStyle = gray(0.85); g.fillRect(0, 0, w, h);
    for (let k = 0; k < 14; k++) { g.fillStyle = `rgba(0,0,0,${0.04 + rnd() * 0.06})`; g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 20 + rnd() * 80, 10 + rnd() * 50, rnd() * 3, 0, 7); g.fill(); }
    grain(g, w, h, 70);
  },
  rough(g, w, h) {
    g.fillStyle = gray(0.88); g.fillRect(0, 0, w, h);
    for (let k = 0; k < 20; k++) { g.fillStyle = `rgba(0,0,0,${0.03 + rnd() * 0.05})`; g.beginPath(); g.arc(rnd() * w, rnd() * h, 10 + rnd() * 60, 0, 7); g.fill(); }
    grain(g, w, h, 30);
  },
  grass(g, w, h) {
    g.fillStyle = gray(0.85); g.fillRect(0, 0, w, h);
    for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,200'},${0.04 + rnd() * 0.06})`; g.beginPath(); g.arc(rnd() * w, rnd() * h, 8 + rnd() * 50, 0, 7); g.fill(); }
    grain(g, w, h, 50);
  },
  metal(g, w, h) {
    g.fillStyle = gray(0.3); g.fillRect(0, 0, w, h);
    for (let r = 0; r < 2; r++) { g.fillStyle = gray(0.92 + rnd() * 0.08); g.fillRect(1, r * h / 2 + 1, w - 2, h / 2 - 2); }
    for (let x = 0; x < w; x += w / 12) { g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(x, 0, 2, h); }
  },
  leaves(g, w, h) {
    g.fillStyle = gray(0.7); g.fillRect(0, 0, w, h);
    for (let k = 0; k < 900; k++) { g.fillStyle = gray(0.5 + rnd() * 0.7); g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 3 + rnd() * 5, 2 + rnd() * 3, rnd() * 3, 0, 7); g.fill(); }
  },
};

const textures = new Map();
function textureOf(GFX, kind, [sx, sy], painted = null) {
  if (!textures.has(kind)) {
    const scan = kind.startsWith('scan:') ? kind.slice(5) : null;
    const c = document.createElement('canvas');
    c.width = 512; c.height = scan ? 512 : Math.round(512 * sy / sx);
    seed = 7;
    PAINT[scan ? painted : kind](c.getContext('2d'), c.width, c.height);
    const map = new GFX.CanvasTexture(c);
    map.wrapS = map.wrapT = GFX.RepeatWrapping;
    map.colorSpace = GFX.SRGBColorSpace;
    map.anisotropy = 8;
    const bump = new GFX.CanvasTexture(c);
    bump.wrapS = bump.wrapT = GFX.RepeatWrapping;
    const also = [];
    textures.set(kind, { map, bump, canvas: c, also });
    if (scan) {
      // The scan, scaled so its average is a light gray: the material's color then tints it as it tints the painted one.
      const img = new Image();
      img.onload = () => {
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0, c.width, c.height);
        const px = g.getImageData(0, 0, c.width, c.height), d = px.data;
        const mean = [0, 0, 0];
        for (let i = 0; i < d.length; i += 4) { mean[0] += d[i]; mean[1] += d[i + 1]; mean[2] += d[i + 2]; }
        const n = d.length / 4, k = mean.map((m) => (0.8 * 255) / Math.max(1, m / n));
        for (let i = 0; i < d.length; i += 4) for (let j = 0; j < 3; j++) d[i + j] = Math.min(255, d[i + j] * k[j]);
        g.putImageData(px, 0, 0);
        map.needsUpdate = true;
        bump.needsUpdate = true;
        for (const t of also) t.needsUpdate = true;
      };
      img.src = `${import.meta.env?.BASE_URL ?? '/'}scans/${scan}.jpg`;
    }
  }
  return textures.get(kind);
}

const made = new Map();
/** Every material that glows at night: [material, its glow by night]. */
export const glowing = [];

/** The engine material for one of Rivertown's, shared by the whole city. */
export function materialFor(GFX, name) {
  const key = name.replace(/\.\d+$/, '');
  if (made.has(key)) return made.get(key);
  const r = recipe(key);
  const f = flat(key);
  const c = new GFX.Color(r.tint ?? f.color);
  let m;
  if (r.glass) {
    m = new GFX.MeshPhysicalMaterial({ name: key, color: c, metalness: r.stained ? 0.1 : r.metal, roughness: r.stained ? 0.2 : 0.06, clearcoat: 1, clearcoatRoughness: 0.03 });
    // Lit from within at night: a share of the city's windows warm, the shop fronts most.
    // Drawn in front of a wall it lies on (a far building's windows are a few centimeters proud of its wall).
    m.polygonOffset = true;
    m.polygonOffsetFactor = -1;
    m.polygonOffsetUnits = -4;
    m.emissive = new GFX.Color(r.stained ? '#7a3040' : '#ffd69a');
    m.emissiveIntensity = 0;
    glowing.push([m, key === 'M_StoreGlass' ? 1.4 : r.stained ? 0.8 : 0.45]);
  } else if (r.water) {
    m = new GFX.MeshPhysicalMaterial({ name: key, color: new GFX.Color('#2c4446'), metalness: 0.05, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.03 });
  } else if (r.kind) {
    const t = textureOf(GFX, r.kind, r.size, r.painted);
    m = new GFX.MeshStandardMaterial({ name: key, color: c.multiplyScalar(r.lift), map: t.map, bumpMap: t.bump, bumpScale: r.bump, roughness: 0.85, metalness: 0 });
  } else {
    const metal = /Mullion|Steel|Rail|Metal|Copper/.test(key);
    m = new GFX.MeshStandardMaterial({ name: key, color: c, roughness: metal ? 0.4 : 0.6, metalness: metal ? 0.7 : 0 });
    if (key === 'M_Lamp_Glow') { m.emissive = new GFX.Color('#ffd9a0'); m.emissiveIntensity = 0; glowing.push([m, 3]); }
    if (key.startsWith('M_Sign_')) { m.emissive = c.clone(); m.emissiveIntensity = 0; glowing.push([m, 0.6]); }
  }
  made.set(key, m);
  return m;
}

/** 0 by day, 1 by night: the windows, signs and lamps come on. */
export function setGlow(night) {
  for (const [m, k] of glowing) m.emissiveIntensity = k * night;
}

/**
 * 3d-city's ground, as Rivertown dressed it: its name -> [Rivertown's material, the meters one repeat of 3d-city's
 * texture coordinates covers there (its surfaces' `tile`)].
 */
const GROUND = {
  'road:paint-white': ['M_Lane_White', 1], 'road:paint-yellow': ['M_Lane_Yellow', 1],
  'road:asphalt': ['M_Asphalt', 2], 'road:lot': ['M_Asphalt_Old', 2], 'road:concrete': ['M_Curb', 3], 'road:sidewalk': ['M_Sidewalk', 3],
  'ground:turf': ['M_Grass', 1.5], 'ground:lawn': ['M_Grass', 1.5], 'ground:riverbed': ['M_Ground_Riverbed', 1.5], 'ground:pavers': ['M_Pavers_Brick', 1.6], 'ground:plaza': ['M_Plaza', 3], 'ground:path': ['M_Plaza', 2], 'ground:stone': ['M_Curb', 2],
  'ground:ballast': ['M_Ballast', 2], 'surface:dirt': ['M_Ground_Dirt', 2], 'surface:concrete': ['M_Concrete_Dark', 3],
};
export const dressesGround = (name) => name in GROUND;

/** The engine material for one of 3d-city's ground surfaces, in Rivertown's look: its own copy of the texture,
 * repeated to the scan's real size, in the material's own color (as Rivertown's: not 3d-city's tints). */
export function groundMaterial(GFX, name) {
  if (made.has(name)) return made.get(name);
  const [key, tile] = GROUND[name];
  if (key.startsWith('M_Lane_')) { const m = materialFor(GFX, key); made.set(name, m); return m; } // paint: its flat color
  const r = recipe(key), f = flat(key);
  const t = textureOf(GFX, r.kind, r.size, r.painted);
  const own = (color) => {
    const x = new GFX.CanvasTexture(t.canvas);
    x.wrapS = x.wrapT = GFX.RepeatWrapping;
    if (color) x.colorSpace = GFX.SRGBColorSpace;
    x.anisotropy = 8;
    x.repeat.set(tile / r.size[0], tile / r.size[1]);
    t.also.push(x);
    return x;
  };
  const map = own(true), bump = own(false);
  const m = new GFX.MeshStandardMaterial({ name, color: new GFX.Color(r.tint ?? f.color).multiplyScalar(r.lift ?? 1), map, bumpMap: bump, bumpScale: r.bump ?? 0.6, roughness: 0.88, metalness: 0 });
  // (Not 3d-city's anti-tiling, which mixes turned and shifted copies of the texture: it broke the slabs' grid
  // into extra joints and blotches. Rivertown's materials repeat plainly.)
  made.set(name, m);
  return m;
}
