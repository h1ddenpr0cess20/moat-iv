import earcut from 'earcut';
import { recipe } from './look.js';

/**
 * Rivertown's designs (ported from its Blender generator) work in Blender's frame: x east, y north, z up, meters.
 * This mesh takes their polygons, boxes and cylinders in that frame and lays them on 3d-city's Builder, whose frame
 * is x east, y up, z south: (x, y, z) -> (x, z, -y), a rotation, so each face keeps the way it faces.
 *
 * Texture coordinates are planar, in meters (a wall's along its length and up; a roof's flat), divided by the real
 * size of the material's texture (look.js `recipe`), as Rivertown's game does.
 */
const WHITE = [1, 1, 1];
/** What the ball bumps into: everything but paint, trim set on a wall, and glass set back in its opening. */
const SOFT = /^M_(Lane_|Frame_White|Mullion|Window|StoreGlass|StainedGlass|Water|Leaves_|Lamp_Glow)/;
const solids = new Map();
const isSolid = (m) => {
  let s = solids.get(m);
  if (s === undefined) { s = !SOFT.test(m); solids.set(m, s); }
  return s;
};
const sizes = new Map();
const sizeOf = (m) => {
  let s = sizes.get(m);
  if (!s) { s = recipe(m).size ?? [1, 1]; sizes.set(m, s); }
  return s;
};

/** Where Mesh.drawn works out a face's corners. */
let SCRATCH = new Float64Array(64);

export class Mesh {
  /** `lod`: the level of detail its parts go in (Builder.part), or null; `at`: [x, z] (3d-city's frame) that files
   * every triangle in one cell, so a whole building changes level at once; `coarse`: the far version (facade.js
   * leaves out what does not show from afar); `solid`: whether the ball bumps into it. */
  constructor(builder, { lod = null, at = null, coarse = false, solid = true } = {}) {
    this.b = builder;
    this.lod = lod;
    this.at = at;
    this.coarse = coarse;
    this.solid = solid;
    // Faces already drawn, by their corners (welded to 2 mm, in any order) and the way they face (poly): a hash of
    // them -> the faces with that hash, each its corners in order and then the way it faces, as whole numbers.
    this.seen = new Map();
  }

  /**
   * Whether a face with these corners (in any order, each welded to 2 mm) facing this way (the normal rounded to
   * quarters) has been drawn already; if not, it is now. (Numbers, not a string made for every face: a city is
   * millions of them.)
   */
  drawn(pts, fx, fy, fz) {
    const m = pts.length, n = m * 3 + 3;
    // Worked out in a scratch array, kept (as a copy) only when the face is new.
    if (SCRATCH.length < n) SCRATCH = new Float64Array(n * 2);
    const key = SCRATCH;
    for (let k = 0; k < m; k++) {
      const p = pts[k];
      // Each corner put in its place among those before it (by x, then y, then z): any order of the corners is one face.
      const x = Math.round(p[0] * 500), y = Math.round(p[1] * 500), z = Math.round(p[2] * 500);
      let at = k * 3;
      while (at > 0) {
        const px = key[at - 3], py = key[at - 2], pz = key[at - 1];
        if (px < x || (px === x && (py < y || (py === y && pz <= z)))) break;
        key[at] = px; key[at + 1] = py; key[at + 2] = pz;
        at -= 3;
      }
      key[at] = x; key[at + 1] = y; key[at + 2] = z;
    }
    key[m * 3] = fx; key[m * 3 + 1] = fy; key[m * 3 + 2] = fz;
    let h = m;
    for (let k = 0; k < n; k++) h = Math.imul(h ^ (key[k] | 0), 0x01000193) >>> 0;
    const same = this.seen.get(h);
    if (same) {
      for (const other of same) {
        if (other.length !== n) continue;
        let k = 0;
        while (k < n && other[k] === key[k]) k++;
        if (k === n) return true;
      }
      same.push(key.slice(0, n));
    } else {
      this.seen.set(h, [key.slice(0, n)]);
    }
    return false;
  }

  /** A polygon of [x, y, z] points; wound to face `facing` if given. */
  poly(pts, material, facing = null, uv = null) {
    const m = pts.length;
    if (m < 3) return;
    let nx = 0, ny = 0, nz = 0;
    let [x2, y2, z2] = pts[m - 1];
    for (const [x1, y1, z1] of pts) {
      nx += (y2 - y1) * (z2 + z1);
      ny += (z2 - z1) * (x2 + x1);
      nz += (x2 - x1) * (y2 + y1);
      x2 = x1; y2 = y1; z2 = z1;
    }
    if (facing && nx * facing[0] + ny * facing[1] + nz * (facing[2] ?? 0) < 0) {
      pts = pts.slice().reverse();
      nx = -nx; ny = -ny; nz = -nz;
      if (uv) uv = uv.slice().reverse();
    }
    const L = Math.hypot(nx, ny, nz);
    if (L < 1e-12) return;
    // A face drawn twice (the same corners, welded to 2 mm, facing the same way) is drawn once: the two flickered.
    // The same corners facing the other way (an underside) are another face.
    if (this.drawn(pts, Math.round((nx / L) * 4), Math.round((ny / L) * 4), Math.round((nz / L) * 4))) return;
    const [sx, sy] = sizeOf(material);
    if (!uv) {
      if (Math.abs(nz) > 0.7 * L) uv = pts.map((p) => [p[0] / sx, p[1] / sy]);
      else {
        const tl = Math.hypot(nx, ny), tx = -ny / tl, ty = nx / tl;
        uv = pts.map((p) => [(p[0] * tx + p[1] * ty) / sx, p[2] / sy]);
      }
    }
    const n = [nx / L, nz / L, -ny / L];
    const P = pts.map((p) => [p[0], p[2], -p[1]]);
    if (m === 3) { this.tri(material, P[0], P[1], P[2], uv[0], uv[1], uv[2], n); return; }
    if (m === 4 && convex4(pts, nx, ny, nz)) {
      this.tri(material, P[0], P[1], P[2], uv[0], uv[1], uv[2], n);
      this.tri(material, P[0], P[2], P[3], uv[0], uv[2], uv[3], n);
      return;
    }
    // Any other polygon: cut into triangles on the plane it mostly lies in, then wound as the polygon is.
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    const [i, j] = az >= ax && az >= ay ? [0, 1] : ax >= ay ? [1, 2] : [2, 0];
    const flat = [];
    for (const p of pts) flat.push(p[i], p[j]);
    const idx = earcut(flat);
    for (let k = 0; k < idx.length; k += 3) {
      let a = idx[k], b = idx[k + 1], c = idx[k + 2];
      const A = pts[a], B = pts[b], C = pts[c];
      const cx = (B[1] - A[1]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[1] - A[1]);
      const cy = (B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2]);
      const cz = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
      if (cx * nx + cy * ny + cz * nz < 0) { const t = b; b = c; c = t; }
      this.tri(material, P[a], P[b], P[c], uv[a], uv[b], uv[c], n);
    }
  }

  tri(material, a, b, c, ua, ub, uc, n) {
    if (this.solid && isSolid(material)) this.b.collide(a, b, c);
    if (this.lod) {
      // The Builder's tri files by chunk; a level of detail needs its own cell: write to that part directly.
      const p = this.at ? this.b.part(material, this.at[0], this.at[1], this.lod) : this.b.part(material, (a[0] + b[0] + c[0]) / 3, (a[2] + b[2] + c[2]) / 3, this.lod);
      p.pos.points3(a, b, c);
      p.nor.push3x3(n[0], n[1], n[2]);
      p.uv.points2(ua, ub, uc);
      p.col.push3x3(1, 1, 1);
    } else {
      this.b.tri(material, a, b, c, ua, ub, uc, WHITE, n);
    }
  }

  /** A box of `size` (sx along yaw, sy across, sz up) whose base center is `c`; `cull` leaves out the side facing
   * straight against it (the back of a box set on a wall), and its `ends` if false. */
  box(c, size, material, { yaw = 0, top = true, bottom = false, cull = null, ends = true } = {}) {
    const sx = size[0] / 2, sy = size[1] / 2, sz = size[2];
    const ca = Math.cos(yaw), sa = Math.sin(yaw);
    const P = (u, v, w) => [c[0] + u * ca - v * sa, c[1] + u * sa + v * ca, c[2] + w];
    const b = [P(-sx, -sy, 0), P(sx, -sy, 0), P(sx, sy, 0), P(-sx, sy, 0)];
    const t = [P(-sx, -sy, sz), P(sx, -sy, sz), P(sx, sy, sz), P(-sx, sy, sz)];
    const ctr = [c[0], c[1], c[2] + sz / 2];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      const q = [b[i], b[j], t[j], t[i]];
      const f = [(q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4 - ctr[0], (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4 - ctr[1], 0];
      if (cull) {
        const L = Math.hypot(f[0], f[1]) || 1, d = (f[0] * cull[0] + f[1] * cull[1]) / L;
        if (d < -0.9 || (!ends && Math.abs(d) < 0.3)) continue;
      }
      this.poly(q, material, f);
    }
    if (top) this.poly(t, material, [0, 0, 1]);
    if (bottom) this.poly(b, material, [0, 0, -1]);
  }

  cylinder(c, r, h, material, seg = 10, top = true) {
    const rb = [], rt = [];
    for (let k = 0; k < seg; k++) {
      const a = (2 * Math.PI * k) / seg;
      rb.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a), c[2]]);
      rt.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a), c[2] + h]);
    }
    for (let k = 0; k < seg; k++) {
      const j = (k + 1) % seg, q = [rb[k], rb[j], rt[j], rt[k]];
      this.poly(q, material, [(q[0][0] + q[1][0]) / 2 - c[0], (q[0][1] + q[1][1]) / 2 - c[1], 0]);
    }
    if (top) this.poly(rt, material, [0, 0, 1]);
  }
}

function convex4(p, nx, ny, nz) {
  for (let i = 0; i < 4; i++) {
    const a = p[i], b = p[(i + 1) % 4], c = p[(i + 2) % 4];
    const cx = (b[1] - a[1]) * (c[2] - b[2]) - (b[2] - a[2]) * (c[1] - b[1]);
    const cy = (b[2] - a[2]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[2] - b[2]);
    const cz = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (cx * nx + cy * ny + cz * nz < -1e-9) return false;
  }
  return true;
}

/** A closed counter-clockwise ring moved `d` meters outwards (inwards if negative), mitred, keeping its points. */
export function offsetRing(ring, d) {
  const n = ring.length, out = [];
  for (let i = 0; i < n; i++) {
    const p0 = ring[(i - 1 + n) % n], p1 = ring[i], p2 = ring[(i + 1) % n];
    const e1 = norm2(p1[0] - p0[0], p1[1] - p0[1]), e2 = norm2(p2[0] - p1[0], p2[1] - p1[1]);
    const n1 = [e1[1], -e1[0]], n2 = [e2[1], -e2[0]];
    let bx = n1[0] + n2[0], by = n1[1] + n2[1], L = Math.hypot(bx, by);
    if (L < 1e-6) { bx = n1[0]; by = n1[1]; L = 1; }
    bx /= L; by /= L;
    const c = bx * n1[0] + by * n1[1];
    const s = d / Math.max(c, 0.35);
    out.push([p1[0] + bx * s, p1[1] + by * s]);
  }
  return out;
}

function norm2(x, y) {
  const L = Math.hypot(x, y);
  return L < 1e-12 ? [0, 0] : [x / L, y / L];
}

/** A counter-clockwise ring moved in by `d` meters (each corner along its bisector, at most 3x `d`). */
export function inset(ring, d) {
  const n = ring.length, out = [];
  for (let i = 0; i < n; i++) {
    const [ax, ay] = ring[(i - 1 + n) % n], [bx, by] = ring[i], [cx, cy] = ring[(i + 1) % n];
    const l1 = Math.hypot(bx - ax, by - ay) || 1, l2 = Math.hypot(cx - bx, cy - by) || 1;
    const n1 = [-(by - ay) / l1, (bx - ax) / l1], n2 = [-(cy - by) / l2, (cx - bx) / l2];
    const mx = n1[0] + n2[0], my = n1[1] + n2[1], dot = mx * n1[0] + my * n1[1];
    let [vx, vy] = dot > 1e-3 ? [(mx * d) / dot, (my * d) / dot] : [n1[0] * d, n1[1] * d];
    const L = Math.hypot(vx, vy);
    if (L > 3 * d) { vx = (vx * 3 * d) / L; vy = (vy * 3 * d) / L; }
    out.push([bx + vx, by + vy]);
  }
  return out;
}
