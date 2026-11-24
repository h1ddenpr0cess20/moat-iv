import { Mesher } from 'madness-engine/mesher';
import { Builder, CELL } from './builder.js';
import { WALKS } from './bridges.js';
import { widthOf } from './ground.js';
import { leafy, spruce } from 'madness-engine/flora';
import { unit } from './geometry.js';

/**
 * The trees the lidar and the aerial photograph found (scripts/trees.py), planted as the engine's own
 * trees (flora): an oak or a birch for a broadleaf, a pine for a conifer, each scaled to the height and
 * crown it was measured with and tinted the green the photograph shows. Near Rosa Parks Circle, where the
 * photographs show birches and maples, the narrow ones are birches.
 */

/** What each model is, as it is drawn: its crown's radius and its height, in its own tiles. */
const MODEL = {
  oak: { make: (m, o) => leafy(m, { ...o, form: 'oak' }), R: 0.5, H: 1.33, variants: 4 },
  maple: { make: (m, o) => leafy(m, { ...o, form: 'maple' }), R: 0.46, H: 1.4, variants: 4 },
  elm: { make: (m, o) => leafy(m, { ...o, form: 'elm' }), R: 0.52, H: 1.38, variants: 3 },
  birch: { make: (m, o) => leafy(m, { ...o, form: 'birch' }), R: 0.27, H: 1.46, variants: 3 },
  pine: { make: spruce, R: 0.52, H: 1.62, variants: 3 },
};

const templates = new Map();
function template(kind, hi, variant) {
  const key = `${kind}:${hi}:${variant}`;
  let t = templates.get(key);
  if (!t) {
    const m = new Mesher();
    MODEL[kind].make(m, { hi, seed: variant });
    t = m.finish();
    templates.set(key, t);
  }
  return t;
}

const srgbToLinear = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };

/** The material a model's part is drawn with: bark, leaves or needles. */
const materialOf = (name) => (name === 'leafCard' ? 'tree:leafcard' : name === 'needleCard' ? 'tree:needlecard' : name === 'needle' ? 'tree:needle' : name.startsWith('leaf') ? 'tree:leaf' : 'tree:bark');

function stamp(builder, { model, variant, x, y, z, yaw, sxz, sy, tint }, hi) {
  for (const [name, part] of Object.entries(template(model, hi, variant))) {
    const mat = materialOf(name);
    builder.stamp(mat, part, x, y, z, yaw, sxz, sy, mat === 'tree:bark' ? null : tint, hi ? 'hi' : 'lo');
  }
}

/** The full-detail meshes (parts, as `Builder.finish` gives them) for the trees planted in one cell. */
export function fullTrees(trees) {
  const b = new Builder();
  for (const t of trees) stamp(b, t, true);
  return b.finish();
}

/**
 * Whether (x, z) is somewhere a tree cannot stand: in a roadway or on a railway (the lidar sees a lorry, a bridge's
 * girder or a pole as a crown), or inside a building. Footpaths and pavements do not count: street trees grow beside them.
 */
export function blockedBy(roads, within, { walks = true } = {}) {
  const CELLSIZE = 32, grid = new Map();
  for (const r of roads) {
    if (r.subtype === 'water' || r.subclass === 'crosswalk') continue;
    const walk = WALKS.has(r.class);
    if (walk && !walks) continue;
    // A path is kept clear the ball's width either side of its middle (it is 3 m across): a trunk nearer stops it.
    const half = r.subtype === 'rail' ? 2.4 : walk ? Math.max(widthOf(r) / 2, 1.9) : widthOf(r) / 2 + 0.6;
    for (let k = 0; k + 1 < r.line.length; k++) {
      const [ax, az] = r.line[k], [bx, bz] = r.line[k + 1], seg = { ax, az, bx, bz, half };
      for (let gz = Math.floor((Math.min(az, bz) - half) / CELLSIZE); gz <= Math.floor((Math.max(az, bz) + half) / CELLSIZE); gz++) for (let gx = Math.floor((Math.min(ax, bx) - half) / CELLSIZE); gx <= Math.floor((Math.max(ax, bx) + half) / CELLSIZE); gx++) {
        const key = `${gx},${gz}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(seg);
      }
    }
  }
  return (x, z) => {
    for (const { ax, az, bx, bz, half } of grid.get(`${Math.floor(x / CELLSIZE)},${Math.floor(z / CELLSIZE)}`) ?? []) {
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      if (Math.hypot(x - (ax + dx * t), z - (az + dz * t)) < half) return true;
    }
    return within ? within(x, z, 0) : false;
  };
}

/** Plants every tree into `builder`, standing on `terrain`; the trunks go in `builder.trunks` for the ball to bump into. */
export function plant(builder, terrain, trees, { near = null, blocked = null } = {}) {
  builder.fullTrees ??= new Map();
  let planted = 0;
  for (const [x, z, h, rad, kind, r, g, b] of trees) {
    if (blocked?.(x, z)) continue;
    const seed = `${x},${z}`;
    const close = near ? Math.hypot(x - near[0], z - near[1]) : Infinity;
    // Tall and narrow, or in the park the photographs show birches in: a birch.
    // The rest of the broadleaves: oaks and maples most, and some elms (the vase-shaped street trees).
    const f = unit(`${seed}f`);
    let model = kind === 1 ? 'pine' : (h / (2 * rad) > 1.9 || (close < 90 && unit(`${seed}b`) < 0.55)) ? 'birch' : f < 0.42 ? 'oak' : f < 0.82 ? 'maple' : 'elm';
    const variant = Math.floor(unit(seed) * MODEL[model].variants);
    const m = MODEL[model];
    const sxz = Math.max(rad, 1.3) / m.R, sy = Math.min(h, 30) / m.H;
    const y = terrain.heightAt(x, z) - 0.15;
    const yaw = unit(`${seed}y`) * Math.PI * 2;
    // The photograph's color is hazy (a crown comes out gray-green and bright): keep its hue, deepen it to the albedo of a leaf, and let each tree be a shade of its own.
    const lum = (r + g + b) / 3, boost = (c) => Math.max(0, lum + (c - lum) * 3.2);
    const k = (kind === 1 ? 0.62 : 0.8) * (0.82 + 0.36 * unit(`${seed}k`));
    const tint = [boost(r), boost(g), boost(b)].map((c) => Math.min(1.5, srgbToLinear(Math.min(255, c * k)) / 0.8));
    // The thin tree goes in now; the full one is made when the camera first comes near its cell (see `fullTrees`).
    const placed = { model, variant, x, y, z, yaw, sxz, sy, tint };
    stamp(builder, placed, false);
    const key = `${Math.floor(x / CELL)}|${Math.floor(z / CELL)}`;
    let cell = builder.fullTrees.get(key);
    if (!cell) builder.fullTrees.set(key, cell = []);
    cell.push(placed);
    // A trunk the ball can bump into, where the tree is big enough to be in the way.
    if (rad >= 2.2) builder.trunks.push([x, z, 0.16 + 0.02 * h, y, y + 3.2]);
    planted++;
  }
  return planted;
}
