import { SURFACES } from 'madness-engine/textures/town/surfaces';
import { CHUNK } from './config.js';

/** Things drawn at a few levels of detail, or only when near, gather in smaller cells so the choice can follow the camera. */
export const CELL = 320;

/** A growing list of floats kept packed (32 bits each), not as boxed numbers: a city is tens of millions of them. */
class Floats {
  constructor() { this.data = new Float32Array(4096); this.length = 0; }
  /** Room for `n` more. */
  room(n) {
    if (this.length + n <= this.data.length) return;
    const bigger = new Float32Array(Math.max(this.data.length * 2, this.length + n));
    bigger.set(this.data.subarray(0, this.length));
    this.data = bigger;
  }
  push(...values) {
    this.room(values.length);
    for (let i = 0; i < values.length; i++) this.data[this.length + i] = values[i];
    this.length += values.length;
  }
  // The builder's own pushes, of a fixed few: `push(...values)` makes an array of every call, and a city is millions of them.
  push2(a, b) {
    if (this.length + 2 > this.data.length) this.room(2);
    const d = this.data, o = this.length;
    d[o] = a; d[o + 1] = b;
    this.length = o + 2;
  }
  push3(a, b, c) {
    if (this.length + 3 > this.data.length) this.room(3);
    const d = this.data, o = this.length;
    d[o] = a; d[o + 1] = b; d[o + 2] = c;
    this.length = o + 3;
  }
  /** The same three values three times (a flat triangle's normal, or its colour). */
  push3x3(a, b, c) {
    if (this.length + 9 > this.data.length) this.room(9);
    const d = this.data, o = this.length;
    d[o] = a; d[o + 1] = b; d[o + 2] = c;
    d[o + 3] = a; d[o + 4] = b; d[o + 5] = c;
    d[o + 6] = a; d[o + 7] = b; d[o + 8] = c;
    this.length = o + 9;
  }
  /** Three points [x, y, z]. */
  points3(p, q, r) {
    if (this.length + 9 > this.data.length) this.room(9);
    const d = this.data, o = this.length;
    d[o] = p[0]; d[o + 1] = p[1]; d[o + 2] = p[2];
    d[o + 3] = q[0]; d[o + 4] = q[1]; d[o + 5] = q[2];
    d[o + 6] = r[0]; d[o + 7] = r[1]; d[o + 8] = r[2];
    this.length = o + 9;
  }
  /** Three texture corners [u, v]. */
  points2(p, q, r) {
    if (this.length + 6 > this.data.length) this.room(6);
    const d = this.data, o = this.length;
    d[o] = p[0]; d[o + 1] = p[1];
    d[o + 2] = q[0]; d[o + 3] = q[1];
    d[o + 4] = r[0]; d[o + 5] = r[1];
    this.length = o + 6;
  }
  [Symbol.iterator]() { return this.data.subarray(0, this.length)[Symbol.iterator](); }
  array() { return this.data.slice(0, this.length); }
}

/**
 * Where the city's triangles are gathered before they become meshes: per
 * material and per chunk of the city, so a mesh is one material over a
 * patch of ground and the renderer can leave out whatever is far off.
 * Positions are in metres (x east, y up, z south); colours are linear.
 */
export class Builder {
  /** `chunk`: the side of the patch of ground one mesh covers, metres (CHUNK): larger for what is seen from afar, so it is fewer meshes to draw. */
  constructor({ chunk = CHUNK } = {}) {
    this.chunk = chunk;
    this.parts = new Map();
    // How `part` finds them: lod -> material -> cell -> part, and the last one found.
    this.index = new Map();
    this.last = null;
    /** The triangles the ball rolls on and bumps into, in metres: [ax, ay, az, bx, by, bz, cx, cy, cz, ...]. */
    this.solid = [];
    /** Upright cylinders to bump into (a trunk): [x, z, radius, y0, y1], metres. */
    this.trunks = [];
  }

  /** The part for `material` where (x, z) is; with a `lod` ('hi', 'lo' or 'near') it is one of the small cells that scene.js shows or hides by distance. */
  part(material, x, z, lod = null) {
    const size = lod ? CELL : this.chunk, i = Math.floor(x / size), j = Math.floor(z / size);
    // Most triangles land in the same part as the one before: that one is kept to hand, and the rest are found by
    // number, not by a string made for each (`parts` itself is filled in the same order, so the meshes come out the same).
    const last = this.last;
    if (last !== null && last.material === material && last.i === i && last.j === j && last.lod === lod) return last.p;
    const lods = this.index.get(lod ?? '') ?? this.index.set(lod ?? '', new Map()).get(lod ?? '');
    let cells = lods.get(material);
    if (!cells) { cells = new Map(); lods.set(material, cells); }
    const cell = (i + 0x8000) * 0x10000 + (j + 0x8000);
    let p = cells.get(cell);
    if (!p) {
      p = { material, lod, x: (i + 0.5) * size, z: (j + 0.5) * size, pos: new Floats(), nor: new Floats(), uv: new Floats(), col: new Floats() };
      this.parts.set(`${material}|${i}|${j}|${lod ?? ''}`, p);
      cells.set(cell, p);
    }
    this.last = { material, i, j, lod, p };
    return p;
  }

  /** A triangle a, b, c ([x, y, z]) with a normal n, texture corners ua, ub, uc ([u, v]) and one colour. */
  tri(material, a, b, c, ua, ub, uc, color, n = null) {
    let nx, ny, nz;
    if (!n) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      nx = uy * vz - uz * vy; ny = uz * vx - ux * vz; nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz);
      if (l < 1e-9) return;
      nx /= l; ny /= l; nz /= l;
    }
    const base = baseOf(material);
    const p = this.part(material, (a[0] + b[0] + c[0]) / 3, (a[2] + b[2] + c[2]) / 3);
    p.pos.points3(a, b, c);
    // One normal for the triangle, or one at each corner ([na, nb, nc]: a smooth surface, the ground).
    if (!n) p.nor.push3x3(nx, ny, nz);
    else if (Array.isArray(n[0])) p.nor.points3(n[0], n[1], n[2]);
    else p.nor.push3x3(n[0], n[1], n[2]);
    p.uv.points2(ua, ub, uc);
    // (A colour times white is itself.)
    if (base === WHITE) p.col.push3x3(color[0], color[1], color[2]);
    else p.col.push3x3(color[0] * base[0], color[1] * base[1], color[2] * base[2]);
  }

  /** A quad a, b, c, d in order round it, with one normal. */
  quad(material, a, b, c, d, ua, ub, uc, ud, color, n = null) {
    // (`n` may be one normal, or one at each corner [na, nb, nc, nd].)
    const each = n && Array.isArray(n[0]);
    this.tri(material, a, b, c, ua, ub, uc, color, each ? [n[0], n[1], n[2]] : n);
    this.tri(material, a, c, d, ua, uc, ud, color, each ? [n[0], n[2], n[3]] : n);
  }

  /** A copy of a template's `part` (triangles, y up) stood at (x, y, z), turned by `yaw` and stretched `sx` across and `sy` up, its colours multiplied by `tint`. */
  stamp(material, part, x, y, z, yaw, sx, sy, tint = null, lod = null) {
    const p = this.part(material, x, z, lod);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const tr = tint ? tint[0] : 1, tg = tint ? tint[1] : 1, tb = tint ? tint[2] : 1;
    const pos = part.pos, nor = part.nor, uv = part.uv, col = part.col;
    for (let i = 0; i < part.count; i++) {
      const px = pos[i * 3] * sx, py = pos[i * 3 + 1] * sy, pz = pos[i * 3 + 2] * sx;
      p.pos.push3(px * c + pz * s + x, py + y, -px * s + pz * c + z);
      const nx = nor[i * 3], nz = nor[i * 3 + 2];
      p.nor.push3(nx * c + nz * s, nor[i * 3 + 1], -nx * s + nz * c);
      p.uv.push2(uv[i * 2], uv[i * 2 + 1]);
      p.col.push3(col[i * 3] * tr, col[i * 3 + 1] * tg, col[i * 3 + 2] * tb);
    }
  }

  /** Solid triangles (for the physics) in the same order as a drawn one. */
  collide(a, b, c) {
    this.solid.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  }

  get triangles() {
    let n = 0;
    for (const p of this.parts.values()) n += p.pos.length / 9;
    return n;
  }

  /** Typed arrays for every part: [{ material, pos, nor, uv, col, cx, cz }]. */
  finish() {
    return [...this.parts.values()].map((p) => ({
      material: p.material, lod: p.lod, x: p.x, z: p.z, count: p.pos.length / 3,
      pos: p.pos.array(), nor: p.nor.array(), uv: p.uv.array(), col: p.col.array(),
    }));
  }
}

const cache = new Map();
/** A hex colour as linear RGB. */
export function linear(hex) {
  let c = cache.get(hex);
  if (c) return c;
  const n = parseInt(hex.replace('#', ''), 16);
  const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  c = [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)];
  cache.set(hex, c);
  return c;
}

export const scale = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
export const mul = (a, b) => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];

const bases = new Map();
const WHITE = [1, 1, 1];
/** What a surface's texture is multiplied by: the colour the engine's town paints its tops in. */
function baseOf(material) {
  // (The surfaces Rivertown's look dresses, rt/look.js, carry their own colour.)
  if (!material.startsWith('surface:') || material === 'surface:concrete' || material === 'surface:dirt') return WHITE;
  let c = bases.get(material);
  if (!c) {
    const top = SURFACES[material.slice(8)]?.top;
    c = top ? linear(top) : WHITE;
    bases.set(material, c);
  }
  return c;
}
