import { DIRS } from '../config.js';
import { BUILDINGS } from '../catalog.js';
import { heightAt } from '../world/world.js';
import { ORIGIN, TILE, TOWER, parcelByType, recordAt, toMetres } from '../parcels.js';
import { Builder } from '../city/builder.js';
import { devosPlace, vitesse } from '../city/rt/landmarks.js';
import { Designs } from '../city/rt/buildings.js';
import { materialFor } from '../city/rt/look.js';
import { castsShadow } from './materials.js';

/**
 * Buildings in 3d-city's own designs (src/city/rt, from its Rivertown-derived generator): a real parcel keeps the
 * footprint, height and name of the building it was, and the lots the zones grow are rectangles of a given use and
 * height. Each is built in metres in 3d-city's frame (x east, z south of the middle of its map) and shown in a group
 * that scales it to the game's tiles and puts it where the map is.
 */

/** Is this building drawn in a design (not one of the engine's models)? */
export const isDesigned = (b) => b.type === 'castle' || Boolean(BUILDINGS[b.type]?.design || BUILDINGS[b.type]?.parcel !== undefined);

/** The group every designed mesh goes in: metres in, tiles out. */
export function designFrame(GFX) {
  const g = new GFX.Group();
  g.scale.setScalar(1 / TILE);
  g.position.set(-ORIGIN[0] / TILE, 0, -ORIGIN[1] / TILE);
  return g;
}

/** The record 3d-city's designs read for a building of the game's. */
export function recordOf(b) {
  if (b.type === 'castle') return TOWER;
  const real = parcelByType.get(b.type);
  if (real) return recordAt(real, b.x, b.y);
  const def = BUILDINGS[b.type], m = 1.4;
  const [x0, z0] = toMetres(b.x, b.y), [x1, z1] = toMetres(b.x + b.w, b.y + b.d);
  const ring = [[x0 + m, z0 + m], [x1 - m, z0 + m], [x1 - m, z1 - m], [x0 + m, z1 - m]];
  ring.push(ring[0]);
  return { id: `lot${b.id}`, rings: [ring], use: def.design.use, height: def.design.h, kind: def.design.kind };
}

export function createDesigner(GFX, world) {
  const ground = (x, y) => {
    const tx = (x - ORIGIN[0]) / TILE, tz = (-y - ORIGIN[1]) / TILE;
    return heightAt(world, Math.max(0, Math.min(world.size, tx)), Math.max(0, Math.min(world.size, tz))) * TILE;
  };
  const real = new Designs({ ground, streetDir: () => null, creative: false });
  const free = new Designs({ ground, streetDir: () => null, creative: true });
  const cache = new Map();

  /** A building's parts (each { material, pos, nor, uv, col }), built the first time and again when its ground or street changes. */
  const partsOf = (b) => {
    const sig = `${b.type}:${b.front}:${b.x}:${b.y}:${b.w}:${b.d}:${ground(...toMetres(b.x + b.w / 2, b.y + b.d / 2).map((v, i) => (i ? -v : v))).toFixed(2)}`;
    const kept = cache.get(b.id);
    if (kept && kept.sig === sig) return kept.parts;
    const [dx, dy] = DIRS[b.front] ?? [0, 1];
    const lot = parcelByType.get(b.type);
    let parts;
    if (lot?.set) {
      // A set piece 3d-city draws as a whole (La Grande Vitesse, DeVos Place).
      const builder = new Builder(), record = recordOf(b);
      if (lot.set === 'devosplace') devosPlace(builder, ground, record.rings[0]);
      else if (lot.set === 'vitesse') {
        let cx = 0, cz = 0;
        for (const [x, z] of record.rings[0].slice(0, 4)) { cx += x / 4; cz += z / 4; }
        vitesse(builder, ground, [cx, -cz]);
      }
      parts = builder.finish();
    } else {
      parts = (b.type === 'castle' || lot ? real : free).detail([[recordOf(b), BUILDINGS[b.type]?.design?.names ?? [], [], [dx, -dy]]]);
    }
    cache.set(b.id, { sig, parts });
    return parts;
  };

  const geometryOf = (p) => {
    const geometry = new GFX.BufferGeometry();
    geometry.setAttribute('position', new GFX.BufferAttribute(p.pos, 3));
    geometry.setAttribute('normal', new GFX.BufferAttribute(p.nor, 3));
    geometry.setAttribute('uv', new GFX.BufferAttribute(p.uv, 2));
    geometry.computeBoundingSphere();
    return geometry;
  };
  // Snow on the roofs: the roofing materials are shared by every building, so they are whitened once.
  const snowed = new Set();
  const roofOf = (name) => {
    const m = materialFor(GFX, name);
    if (!snowed.has(m) && /^M_(Roof_Membrane|Roof_Gravel|Shingles_|Slate)/.test(name)) { snowed.add(m); m.color.lerp(new GFX.Color('#f4f8fc'), 0.8); }
    return m;
  };
  const meshOf = (geometry, material) => {
    const mesh = new GFX.Mesh(geometry, roofOf(material));
    mesh.castShadow = castsShadow(material.startsWith('M_Glass') ? 'glass' : 'wall');
    mesh.receiveShadow = true;
    return mesh;
  };

  return {
    forget: (id) => cache.delete(id),
    /** Adds a mesh a material for all of `list` to `parent`, in a frame that takes metres to tiles. */
    merged(list, parent) {
      const by = new Map();
      for (const b of list) {
        for (const p of partsOf(b)) {
          let m = by.get(p.material);
          if (!m) by.set(p.material, (m = { pos: [], nor: [], uv: [] }));
          m.pos.push(p.pos); m.nor.push(p.nor); m.uv.push(p.uv);
        }
      }
      const frame = designFrame(GFX);
      const cat = (arrays) => { const out = new Float32Array(arrays.reduce((n, a) => n + a.length, 0)); let o = 0; for (const a of arrays) { out.set(a, o); o += a.length; } return out; };
      for (const [material, m] of by) frame.add(meshOf(geometryOf({ pos: cat(m.pos), nor: cat(m.nor), uv: cat(m.uv) }), material));
      parent.add(frame);
    },
    /** One building on its own, as it rises: its height is `progress` of the whole, from the ground up. */
    site(b, parent) {
      const frame = designFrame(GFX);
      const holder = new GFX.Group();
      const gm = ground(...toMetres(b.x + b.w / 2, b.y + b.d / 2).map((v, i) => (i ? -v : v)));
      holder.position.y = gm;
      for (const p of partsOf(b)) { const mesh = meshOf(geometryOf(p), p.material); mesh.position.y = -gm; holder.add(mesh); }
      holder.scale.y = Math.max(0.08, b.progress);
      frame.add(holder);
      parent.add(frame);
      return holder;
    },
  };
}
