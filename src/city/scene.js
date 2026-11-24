import { surfaceMaterial, wallMaterial } from 'madness-engine/textures/town/textures';
import { SURFACES, texturesOf } from './surfaces.js';
import { SCALE } from './config.js';
import { CELL } from './builder.js';
import { CHUNK } from './config.js';
import { dressForNight, forgetGlow } from './night.js';
import { foliageTexture } from 'madness-engine/textures/foliage';
import { insideOf } from './rt/buildings.js';
import { dressesGround, groundMaterial, materialFor as designMaterial } from './rt/look.js';

/** The material a part of the city is drawn with, from the name the builder gave it. */
export function materialFor(GFX, name, cache, painted) {
  if (cache.has(name)) return cache.get(name);
  let m;
  if (dressesGround(name)) {
    // The ground in Rivertown's scanned surfaces (rt/look.js).
    m = groundMaterial(GFX, name);
    dressForNight(GFX, name, m);
    cache.set(name, m);
    return m;
  }
  if (name.startsWith('M_')) {
    // Rivertown's designs: scanned textures at their real size, glass, trim (rt/look.js).
    m = designMaterial(GFX, name);
    dressForNight(GFX, name, m);
    cache.set(name, m);
    return m;
  }
  if (name.startsWith('prop:')) {
    if (name === 'prop:glass') {
      // A greenhouse's glass: clear, bright with the sky, a little lit from within.
      m = new GFX.MeshStandardMaterial({ name, vertexColors: true, roughness: 0.06, metalness: 0.35, emissive: new GFX.Color('#2a3a30'), emissiveIntensity: 0.6 });
      dressForNight(GFX, name, m);
      cache.set(name, m);
      return m;
    }
    const glow = name === 'prop:glow', matte = name === 'prop:cloth' || name === 'prop:board' || name === 'prop:canopy' || name === 'prop:canopy-under';
    m = new GFX.MeshStandardMaterial({ name, vertexColors: true, roughness: glow ? 0.4 : matte ? 0.88 : 0.5, metalness: glow || matte ? 0 : name === 'prop:steel' ? 0.55 : 0.6, ...(glow ? { emissive: new GFX.Color('#ffd890'), emissiveIntensity: 0.9 } : {}) });
  } else if (name === 'tree:leafcard' || name === 'tree:needlecard') {
    // Leaf cards: the engine's foliage atlas, cut out where it is clear; the tree's green from its vertex colors.
    m = new GFX.MeshStandardMaterial({ name, vertexColors: true, map: foliageTexture(GFX, name === 'tree:leafcard' ? 'broad' : 'needle'), alphaTest: 0.45, roughness: 0.78, metalness: 0 });
  } else if (name.startsWith('tree:')) {
    m = new GFX.MeshStandardMaterial({ name, vertexColors: true, roughness: name === 'tree:bark' ? 0.95 : 0.82, metalness: 0 });
  } else if (name === 'water') {
    m = new GFX.MeshPhysicalMaterial({ name: 'water', color: new GFX.Color('#3a4f52'), roughness: 0.06, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04, vertexColors: true });
  } else if (name.startsWith('road:') || name.startsWith('ground:') || name.startsWith('wall:facade:') && painted[`facade-${name.slice(12)}`]) {
    const kind = name.startsWith('wall:facade:') ? `facade-${name.slice(12)}` : name.slice(name.indexOf(':') + 1);
    const def = SURFACES[kind];
    const { map, bump } = texturesOf(GFX, painted[kind]);
    m = new GFX.MeshStandardMaterial({ name, vertexColors: true, map, bumpMap: bump, bumpScale: def.bump, roughness: def.rough, metalness: 0 });
  } else {
    m = name.startsWith('wall:') ? wallMaterial(GFX, name.slice(5)) : surfaceMaterial(GFX, name.slice(8));
    // The builder lays textures in repeats; the painters' are drawn once.
    for (const t of [m.map, m.bumpMap]) if (t) t.wrapS = t.wrapT = GFX.RepeatWrapping;
  }
  // The ground, the streets, the roofs and the plain walls are tiled over whole blocks: they hide the repeat (a
  // facade's windows are meant to line up, so it keeps its grid).
  if (/^(road|ground|surface):/.test(name) || /^wall:(stucco|block|corrugated|clapboard)$/.test(name)) m.antiTile = true;
  // What of it glows at night (night.js).
  dressForNight(GFX, name, m);
  cache.set(name, m);
  return m;
}

const MATERIALS = new Map();

/**
 * A tile's sign atlas as the material `sign:<key>` (the names its boards show, painted on the page), made before
 * its meshes are; and let go of with the tile.
 */
export function signMaterial(GFX, key, canvas) {
  const map = new GFX.CanvasTexture(canvas);
  map.colorSpace = GFX.SRGBColorSpace;
  map.anisotropy = 8;
  const m = new GFX.MeshStandardMaterial({ name: `sign:${key}`, map, vertexColors: true, roughness: 0.55, metalness: 0 });
  dressForNight(GFX, `sign:${key}`, m);
  MATERIALS.set(`sign:${key}`, m);
  return m;
}
export function dropMaterial(name) {
  const m = MATERIALS.get(name);
  if (!m) return;
  MATERIALS.delete(name);
  forgetGlow(m);
  m.map?.dispose?.();
  m.dispose?.();
}

/**
 * The city as meshes in a group in the engine's tiles: one mesh for each
 * material in each chunk, the group moved so that the north-west corner of
 * the map is the origin the physics counts from.
 */
export function cityGroup(GFX, parts, bounds, painted, full = null) {
  const group = new GFX.Group();
  // One material (and one set of textures) for each name across the whole city: downtown, every tile, the far city.
  // Made apart for each, they were thousands of copies of the same few textures, more than a card holds.
  const cache = MATERIALS;
  const lods = [];
  // The meshes are gathered by place, a chunk of the map to a group, each with a sphere round all that is in it: the
  // renderer leaves out a place out of view (or out of the shadow's reach) whole, not mesh by mesh, and a city is
  // thousands of meshes. Nothing in them moves, so their matrices are worked out once (`settle`), not every frame:
  // a place keeps its own (`matrixWorldAutoUpdate` false), and the renderer's walk of the scene leaves it be.
  const places = new Map(), unsettled = new Set();
  const placeFor = (p, sphere) => {
    const x = p.x ?? sphere.center.x, z = p.z ?? sphere.center.z;
    const key = `${Math.floor(x / CHUNK)}|${Math.floor(z / CHUNK)}`;
    let place = places.get(key);
    if (!place) {
      place = new GFX.Group();
      place.matrixAutoUpdate = false;
      place.matrixWorldAutoUpdate = false;
      place.boundingSphere = sphere.clone();
      places.set(key, place);
      group.add(place);
    } else {
      grow(place.boundingSphere, sphere);
    }
    unsettled.add(place);
    return place;
  };
  /** The places given meshes since last time: their world matrices, and their meshes', worked out (the group's own: the scene it is in never moves). */
  const settle = () => {
    for (const place of unsettled) {
      place.matrixWorld.copy(group.matrix);
      place.updateMatrixWorld(true);
    }
    unsettled.clear();
  };
  const add = (p) => {
    const geometry = new GFX.BufferGeometry();
    geometry.setAttribute('position', new GFX.BufferAttribute(p.pos, 3));
    geometry.setAttribute('normal', new GFX.BufferAttribute(p.nor, 3));
    geometry.setAttribute('uv', new GFX.BufferAttribute(p.uv, 2));
    // (Rivertown's designs take their color from their material, not from each corner.)
    if (!p.material.startsWith('M_')) geometry.setAttribute('color', new GFX.BufferAttribute(p.col, 3));
    geometry.computeBoundingSphere();
    // A city is millions of triangles that never change: once on the card, the page lets go of its own copy.
    for (const a of Object.values(geometry.attributes)) a.freeAfterUpload = true;
    const mesh = new GFX.Mesh(geometry, materialFor(GFX, p.material, cache, painted));
    mesh.matrixAutoUpdate = false;
    if (p.lod) {
      // The cell's center in tiles, and how far its corner is from it, for choosing by distance.
      mesh.userData.lod = { kind: p.lod, x: (p.x - bounds.x0) / SCALE, z: (p.z - bounds.z0) / SCALE, r: CELL * 0.71 / SCALE, key: `${Math.floor(p.x / CELL)}|${Math.floor(p.z / CELL)}` };
      lods.push(mesh);
    }
    const solid = p.material.startsWith('wall:') || p.material.startsWith('tree:') || p.material.includes('roof') || p.material.includes('shingles') || p.material.includes('membrane');
    mesh.castShadow = solid;
    mesh.receiveShadow = p.material !== 'water';
    placeFor(p, geometry.boundingSphere).add(mesh);
    return mesh;
  };
  for (const p of parts) add(p);
  // What is made the first time the camera comes near its cell: full-size trees ({ cells: Map(key -> trees),
  // make(trees) -> parts }), and buildings' full detail ({ ..., range: 'near', one: true }: one cell a frame, nearest
  // first, its far version drawn until it is made).
  const lazy = Array.isArray(full) ? full : full ? [full] : [];
  group.userData.pending = lazy.flatMap((f) => [...f.cells].map(([key, items]) => {
    const [i, j] = key.split('|').map(Number);
    return { key, x: ((i + 0.5) * CELL - bounds.x0) / SCALE, z: ((j + 0.5) * CELL - bounds.z0) / SCALE, items, make: f.make, range: f.range ?? 'hi', one: f.one };
  }));
  group.userData.detailed = new Map();
  const shells = lazy.flatMap((f) => f.shells ?? []);
  group.userData.inside = shells.length ? insideOf(shells) : null;
  group.userData.build = (c) => {
    const made = c.make(c.items).map(add);
    settle();
    // A building cell's detail is let go again when the camera is far from it (and made again if it comes back).
    if (c.one) group.userData.detailed.set(c.key, { c, meshes: made });
  };
  group.scale.setScalar(1 / SCALE);
  group.position.set(-bounds.x0 / SCALE, -(bounds.y0 ?? 0) / SCALE, -bounds.z0 / SCALE);
  group.updateMatrix();
  group.matrixAutoUpdate = false;
  settle();
  group.userData.lods = lods;
  return group;
}

/** Grows `sphere` to hold `other` as well (both in the same frame). */
function grow(sphere, other) {
  const d = sphere.center.distanceTo(other.center);
  if (d + other.radius <= sphere.radius) return;
  if (d + sphere.radius <= other.radius) { sphere.copy(other); return; }
  // The smallest sphere round both, a hair larger for the rounding.
  const r = (d + sphere.radius + other.radius) / 2;
  sphere.center.lerp(other.center, (r - sphere.radius) / d);
  sphere.radius = r * (1 + 1e-6) + 1e-3;
}

/** How far, in meters, the full trees and the lamps are drawn, and the thin trees after them. */
export const RANGE = { hi: 260, near: 650, lo: 1500 };

/**
 * Shows each cell of trees and lamps that is the right distance from (x, z) tiles; call as the camera moves. `eye`:
 * the camera, [x, y, z] meters: a cell with a building it is inside is shown in its far version (seen from inside, a
 * wall is not drawn, but the sides of its windows' openings would be, as rows of posts).
 */
export function chooseLods(group, x, z, eye = null) {
  const hi = RANGE.hi / SCALE, near = RANGE.near / SCALE, lo = RANGE.lo / SCALE;
  const { pending, detailed } = group.userData;
  let next = null;
  for (let i = pending.length - 1; i >= 0; i--) {
    const c = pending[i], d = Math.sqrt((c.x - x) ** 2 + (c.z - z) ** 2) - CELL * 0.71 / SCALE;
    if (d >= RANGE[c.range] / SCALE) continue;
    if (c.one) { if (!next || d < next.d) next = { c, d }; continue; }
    group.userData.build(c);
    pending.splice(i, 1);
  }
  if (next) { pending.splice(pending.indexOf(next.c), 1); group.userData.build(next.c); }
  for (const [key, { c, meshes }] of detailed) {
    if (Math.sqrt((c.x - x) ** 2 + (c.z - z) ** 2) - CELL * 0.71 / SCALE < near) continue;
    for (const m of meshes) {
      m.parent?.remove(m);
      m.geometry.dispose();
      const k = group.userData.lods.indexOf(m);
      if (k >= 0) group.userData.lods.splice(k, 1);
    }
    detailed.delete(key);
    pending.push(c);
  }
  const inCell = eye && group.userData.inside ? group.userData.inside(eye[0], eye[1], eye[2]) : null;
  for (const mesh of group.userData.lods) {
    const { kind, x: cx, z: cz, r, key } = mesh.userData.lod;
    const within = key === inCell;
    // (A square root, not Math.hypot: this is every cell of the city, every frame.)
    const dx = cx - x, dz = cz - z, d = Math.sqrt(dx * dx + dz * dz) - r;
    // A building's detail and its far version share a cell (and so `d`): exactly one of the two is drawn.
    mesh.visible = kind === 'hi' ? d < hi : kind === 'near' ? d < near : kind === 'detail' ? d < hi && !within : kind === 'far' ? d >= hi || !detailed.has(key) || within : d >= hi * 0.9 && d < lo;
  }
}

/** The physics world for the city: its solid triangles in tiles, counted from the north-west corner. */
export function cityWorld(World, solid, bounds, trunks = [], reach = null) {
  // The patch the world covers, in tiles from the corner: the map, or as far as its solid things reach (`reach`,
  // [x0, z0, x1, z1] meters: a road whose middle is in it runs on past its edge).
  if (reach === true) {
    reach = [bounds.x0, bounds.z0, bounds.x1, bounds.z1];
    for (let i = 0; i < solid.length; i += 3) {
      reach[0] = Math.min(reach[0], solid[i]); reach[2] = Math.max(reach[2], solid[i]);
      reach[1] = Math.min(reach[1], solid[i + 2]); reach[3] = Math.max(reach[3], solid[i + 2]);
    }
  }
  const [rx0, rz0, rx1, rz1] = reach ?? [bounds.x0, bounds.z0, bounds.x1, bounds.z1];
  const x0 = Math.floor((rx0 - bounds.x0) / SCALE) - 1, z0 = Math.floor((rz0 - bounds.z0) / SCALE) - 1;
  const cols = Math.ceil((rx1 - bounds.x0) / SCALE) + 1 - x0, rows = Math.ceil((rz1 - bounds.z0) / SCALE) + 1 - z0;
  const world = new World({ cols, rows, x0, z0 });
  const k = 1 / SCALE;
  for (let i = 0; i < solid.length; i += 9) {
    world.addTriangle(
      (solid[i] - bounds.x0) * k, solid[i + 1] * k, (solid[i + 2] - bounds.z0) * k,
      (solid[i + 3] - bounds.x0) * k, solid[i + 4] * k, (solid[i + 5] - bounds.z0) * k,
      (solid[i + 6] - bounds.x0) * k, solid[i + 7] * k, (solid[i + 8] - bounds.z0) * k,
    );
  }
  for (const [x, z, r, y0, y1] of trunks) world.addCylinder({ x: (x - bounds.x0) * k, z: (z - bounds.z0) * k, r: r * k, y0: y0 * k, y1: y1 * k });
  world.finish();
  return world;
}
