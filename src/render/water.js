import { CHUNK, CHUNKS, WATER_LEVEL } from '../config.js';
import { HV, SUB } from '../world/world.js';
import { freeGeometry } from './dispose.js';

/**
 * The water, frozen: the Grand River and its creeks, drawn as a flat sheet of
 * ice over every tile the ground dips below the water level in. The ground
 * hides the sheet where it is above it, so the shore falls where the ground
 * meets the level. Thick ice is paler, the cracks and frost are the bump map's,
 * and nothing moves on it.
 */

const SHALLOW = [0.62, 0.74, 0.8], MID = [0.5, 0.64, 0.74], DEEP = [0.4, 0.54, 0.68];

const mixTo = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

export function createWater(GFX, world, materials, scene) {
  const group = new GFX.Group();
  group.name = 'water';
  scene.add(group);
  const ripple = new GFX.CanvasTexture(materials.tex.ripples.bump.image);
  ripple.wrapS = ripple.wrapT = GFX.RepeatWrapping;
  ripple.anisotropy = 4;
  const material = new GFX.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.2, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.12, transparent: true, opacity: 0.97,
    bumpMap: ripple, bumpScale: 0.12, envMapIntensity: 1.1, depthWrite: false,
  });
  const meshes = new Array(CHUNKS * CHUNKS).fill(null);
  
  const build = (cx, cy) => {
    const pos = [], nor = [], col = [], uv = [];
    const x0 = cx * CHUNK, y0 = cy * CHUNK;
    const at = (vx, vy) => world.h[Math.max(0, Math.min(HV - 1, vy)) * HV + Math.max(0, Math.min(HV - 1, vx))];
    const step = 1 / SUB;
    for (let ty = y0; ty < y0 + CHUNK; ty++) {
      for (let tx = x0; tx < x0 + CHUNK; tx++) {
        // Is there any water in the tile?
        let wet = false;
        for (let j = 0; j <= SUB && !wet; j++) for (let i = 0; i <= SUB; i++) if (at(tx * SUB + i, ty * SUB + j) < WATER_LEVEL + 0.04) { wet = true; break; }
        if (!wet) continue;
        for (let j = 0; j < SUB; j++) {
          for (let i = 0; i < SUB; i++) {
            const vx = tx * SUB + i, vy = ty * SUB + j;
            const hs = [at(vx, vy), at(vx + 1, vy), at(vx + 1, vy + 1), at(vx, vy + 1)];
            if (Math.min(...hs) > WATER_LEVEL + 0.12) continue;
            const ps = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([a, b], k) => ({ x: (vx + a) * step, z: (vy + b) * step, d: Math.max(0, WATER_LEVEL - hs[k]) }));
            for (const k of [0, 2, 1, 0, 3, 2]) {
              const p = ps[k];
              pos.push(p.x, WATER_LEVEL, p.z);
              nor.push(0, 1, 0);
              const c = p.d < 0.45 ? mixTo(SHALLOW, MID, smooth(p.d / 0.45)) : mixTo(MID, DEEP, smooth((p.d - 0.45) / 0.8));
              col.push(c[0], c[1], c[2]);
              uv.push(p.x / 7, p.z / 7);
            }
          }
        }
      }
    }
    if (!pos.length) return null;
    const g = new GFX.BufferGeometry();
    g.setAttribute('position', new GFX.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('normal', new GFX.BufferAttribute(new Float32Array(nor), 3));
    g.setAttribute('color', new GFX.BufferAttribute(new Float32Array(col), 3));
    g.setAttribute('uv', new GFX.BufferAttribute(new Float32Array(uv), 2));
    g.computeBoundingSphere();
    return g;
  };

  const make = (i) => {
    const cx = i % CHUNKS, cy = Math.floor(i / CHUNKS);
    if (meshes[i]) { group.remove(meshes[i]); freeGeometry(meshes[i].geometry); meshes[i] = null; }
    const g = build(cx, cy);
    if (!g) return;
    const mesh = new GFX.Mesh(g, material);
    mesh.renderOrder = 2;
    mesh.name = `water ${cx},${cy}`;
    group.add(mesh);
    meshes[i] = mesh;
  };

  // Past the edge of the map the open sea goes on to the horizon: four wide strips of deep water round it.
  {
    const S = world.size, F = 3000;
    const pos = [], col = [], nor = [], uv = [];
    const quad = (x0, z0, x1, z1) => {
      for (const [x, z] of [[x0, z0], [x1, z1], [x1, z0], [x0, z0], [x0, z1], [x1, z1]]) {
        pos.push(x, WATER_LEVEL, z); nor.push(0, 1, 0); col.push(...DEEP); uv.push(x / 7, z / 7);
      }
    };
    quad(-F, -F, S + F, 0);
    quad(-F, S, S + F, S + F);
    quad(-F, 0, 0, S);
    quad(S, 0, S + F, S);
    const g = new GFX.BufferGeometry();
    g.setAttribute('position', new GFX.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('normal', new GFX.BufferAttribute(new Float32Array(nor), 3));
    g.setAttribute('color', new GFX.BufferAttribute(new Float32Array(col), 3));
    g.setAttribute('uv', new GFX.BufferAttribute(new Float32Array(uv), 2));
    g.computeBoundingSphere();
    const sea = new GFX.Mesh(g, material);
    sea.renderOrder = 2;
    sea.name = 'open sea';
    group.add(sea);
  }

  const water = {
    group, material,
    build() { for (let i = 0; i < meshes.length; i++) make(i); world.dirty.water.clear(); },
    sync() { for (const i of [...world.dirty.water]) { world.dirty.water.delete(i); make(i); } },
    /** Brightens the ice with the sky. */
    update(dt, { shine = 1, storm = false } = {}) {
      void dt; void storm;
      material.envMapIntensity = 0.4 + 0.6 * shine;
    },
  };
  return water;
}
