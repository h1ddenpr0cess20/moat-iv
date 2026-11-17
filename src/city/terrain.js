import { BASE } from './config.js';
import { edgeDistance, inside } from './geometry.js';
import { linear } from './builder.js';

const smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

/**
 * The ground: the SRTM heights resampled to a finer grid, with the river's
 * bed cut into it. Heights are metres above BASE. `rawAt` is the ground as
 * the satellite saw it (a bridge's ends stand on that), `heightAt` the ground
 * as it is drawn.
 */
export class Terrain {
  /**
   * `box` ([x0, z0, x1, z1] metres): the patch of `elevation` this ground covers, for a tile of a bigger map (all of
   * it, by default). `level`: the height of the water the engine's ocean is drawn at, if it is known already (the
   * river's, worked out from what the satellite saw over it, by default). `surface(x, z)`: the river's own surface
   * there, where it runs higher than that (above a dam, upstream); `floor`: no dry ground lower than this, so the
   * ocean does not come up through a field that lies below the river downtown.
   */
  constructor(elevation, water = [], { cell = 8, bank = 18, box = null, level = undefined, surface = null, floor = null, outer = null, pad = 0 } = {}) {
    this.elevation = elevation;
    // The heights round `elevation`'s own (the greater area's), for the ground `pad` metres past its edge.
    this.outer = outer;
    this.cell = cell;
    const { step, cols, rows } = elevation;
    const [x0, z0] = box ?? [elevation.x0 - pad, elevation.z0 - pad];
    this.x0 = x0; this.z0 = z0;
    this.width = box ? box[2] - box[0] : (cols - 1) * step + 2 * pad; this.depth = box ? box[3] - box[1] : (rows - 1) * step + 2 * pad;
    this.nx = Math.floor(this.width / cell) + 1;
    this.nz = Math.floor(this.depth / cell) + 1;
    this.raw = new Float32Array(this.nx * this.nz);
    for (let j = 0; j < this.nz; j++) for (let i = 0; i < this.nx; i++) this.raw[j * this.nx + i] = this.coarse(x0 + i * cell, z0 + j * cell);
    this.h = Float32Array.from(this.raw);

    const rivers = water.filter((w) => w.rings && (w.subtype === 'river' || w.subtype === 'stream' || w.class === 'river' || w.class === 'stream' || w.class === 'canal'));
    if (level !== undefined) {
      this.waterLevel = level;
      this.surface = surface ?? (() => level);
      // Lakes and ponds: each at the lowest the satellite saw round its shore, if that is above the river.
      const lakes = water.filter((w) => w.rings && !rivers.includes(w) && w.subtype !== 'swimming_pool' && w.class !== 'swimming_pool' && w.class !== 'fountain');
      for (const w of lakes) {
        let low = Infinity;
        for (const [x, z] of w.rings[0]) low = Math.min(low, this.coarse(x, z));
        w.level = Math.max(level, low - 0.4);
      }
      for (const w of rivers) w.level = null;
      this.lakes = lakes;
      this.carve([...rivers, ...lakes], bank);
      if (floor !== null) this.raise(floor, [...rivers, ...lakes]);
      return;
    }
    // The water's level: low in what the satellite saw over it.
    const seen = [];
    for (const w of rivers) {
      const xs = w.rings[0].map((p) => p[0]), zs = w.rings[0].map((p) => p[1]);
      for (let k = 0; k < 400; k++) {
        const x = Math.min(...xs) + Math.random() * (Math.max(...xs) - Math.min(...xs));
        const z = Math.min(...zs) + Math.random() * (Math.max(...zs) - Math.min(...zs));
        if (inside(w.rings, x, z)) seen.push(this.rawAt(x, z));
      }
    }
    seen.sort((a, b) => a - b);
    this.waterLevel = seen.length ? seen[Math.floor(seen.length * 0.25)] : null;
    if (this.waterLevel !== null) this.carve(rivers, bank);
  }

  coarse(x, z) {
    let e = this.elevation;
    if (this.outer && (x < e.x0 || z < e.z0 || x > e.x0 + (e.cols - 1) * e.step || z > e.z0 + (e.rows - 1) * e.step)) e = this.outer;
    const { x0, z0, step, cols, rows, heights } = e;
    const fx = Math.max(0, Math.min(cols - 1.001, (x - x0) / step)), fz = Math.max(0, Math.min(rows - 1.001, (z - z0) / step));
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    const h = (a, b) => heights[b][a] - BASE;
    return (h(i, j) * (1 - tx) + h(i + 1, j) * tx) * (1 - tz) + (h(i, j + 1) * (1 - tx) + h(i + 1, j + 1) * tx) * tz;
  }

  carve(rivers, bank) {
    const surface = this.surface ?? (() => this.waterLevel);
    for (const w of rivers) {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const [x, z] of w.rings[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      const i0 = Math.max(0, Math.floor((x0 - bank - this.x0) / this.cell)), i1 = Math.min(this.nx - 1, Math.ceil((x1 + bank - this.x0) / this.cell));
      const j0 = Math.max(0, Math.floor((z0 - bank - this.z0) / this.cell)), j1 = Math.min(this.nz - 1, Math.ceil((z1 + bank - this.z0) / this.cell));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const x = this.x0 + i * this.cell, z = this.z0 + j * this.cell;
          const d = edgeDistance(w.rings, x, z);
          const inWater = inside(w.rings, x, z);
          const k = j * this.nx + i;
          const here = this.h[k];
          const level = w.level ?? surface(x, z);
          if (inWater) {
            this.h[k] = Math.min(here, level - 0.6 - 2.4 * smooth(d / 14));
          } else if (d < bank) {
            const t = smooth(d / bank);
            this.h[k] = Math.min(here, (level - 0.6) * (1 - t) + Math.max(here, level + 0.3) * t);
          }
        }
      }
    }
  }

  /** No dry ground below `floor` (+ 30 cm): the low fields beside the river come up to it. */
  raise(floor, water) {
    const boxes = water.map((w) => {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const [x, z] of w.rings[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      return { w, x0, x1, z0, z1 };
    });
    const wet = (x, z) => boxes.some((b) => x >= b.x0 - 20 && x <= b.x1 + 20 && z >= b.z0 - 20 && z <= b.z1 + 20 && (inside(b.w.rings, x, z) || edgeDistance(b.w.rings, x, z) < 20));
    for (let j = 0; j < this.nz; j++) for (let i = 0; i < this.nx; i++) {
      const k = j * this.nx + i;
      if (this.h[k] >= floor + 0.3) continue;
      const x = this.x0 + i * this.cell, z = this.z0 + j * this.cell;
      if (!wet(x, z)) this.h[k] = floor + 0.3;
    }
  }

  /**
   * The height of `grid` at (x, z), on the very triangles `mesh()` draws: each cell is cut from its corner (i, j)
   * to (i + 1, j + 1), so a road laid by this height lies on the ground and not a little under it on a slope.
   */
  sample(grid, x, z) {
    const fx = Math.max(0, Math.min(this.nx - 1.001, (x - this.x0) / this.cell)), fz = Math.max(0, Math.min(this.nz - 1.001, (z - this.z0) / this.cell));
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    const n = this.nx, a = grid[j * n + i], b = grid[(j + 1) * n + i], c = grid[(j + 1) * n + i + 1], d = grid[j * n + i + 1];
    return tz >= tx ? a + (c - b) * tx + (b - a) * tz : a + (d - a) * tx + (c - d) * tz;
  }

  heightAt(x, z) { return this.sample(this.h, x, z); }

  /** Levels the ground within `r` metres of (cx, cz) to its mean height there, easing back to the ground as it was over `feather` metres: for a plaza. */
  level(cx, cz, r, feather = 10) {
    let sum = 0, n = 0;
    const each = (fn) => {
      for (let j = 0; j < this.nz; j++) for (let i = 0; i < this.nx; i++) {
        const d = Math.hypot(this.x0 + i * this.cell - cx, this.z0 + j * this.cell - cz);
        if (d < r + feather) fn(j * this.nx + i, d);
      }
    };
    each((k, d) => { if (d < r) { sum += this.h[k]; n++; } });
    const y = n ? sum / n : this.heightAt(cx, cz);
    each((k, d) => { this.h[k] = d < r ? y : y + (this.h[k] - y) * smooth((d - r) / feather); });
    return y;
  }

  /** Lifts the ground within `r` metres of (cx, cz) to at least `y`: a bank built up to a level, as behind a wall. */
  embank(cx, cz, r, y) {
    const i0 = Math.max(0, Math.floor((cx - r - this.x0) / this.cell)), i1 = Math.min(this.nx - 1, Math.ceil((cx + r - this.x0) / this.cell));
    const j0 = Math.max(0, Math.floor((cz - r - this.z0) / this.cell)), j1 = Math.min(this.nz - 1, Math.ceil((cz + r - this.z0) / this.cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (Math.hypot(this.x0 + i * this.cell - cx, this.z0 + j * this.cell - cz) < r) this.h[j * this.nx + i] = Math.max(this.h[j * this.nx + i], y);
    }
  }

  /** Raises a low hill `height` metres high at (cx, cz), easing out to nothing `r` metres off: a park's mound. */
  mound(cx, cz, r, height) {
    for (let j = 0; j < this.nz; j++) for (let i = 0; i < this.nx; i++) {
      const d = Math.hypot(this.x0 + i * this.cell - cx, this.z0 + j * this.cell - cz);
      if (d < r) this.h[j * this.nx + i] += height * Math.cos((Math.PI * d) / (2 * r)) ** 2;
    }
  }

  /**
   * A point `lift` metres over the ground at (x, z), lifted a little more where the ground is steep: a strip
   * is flat between its points and the ground is not, so on a slope it would sink through between them.
   */
  over(x, z, lift, most = 0.45) {
    const slope = Math.max(Math.abs(this.heightAt(x + 4, z) - this.heightAt(x - 4, z)), Math.abs(this.heightAt(x, z + 4) - this.heightAt(x, z - 4))) / 8;
    return this.heightAt(x, z) + lift + Math.min(most, (most / 0.75) * slope);
  }
  rawAt(x, z) { return this.sample(this.raw, x, z); }

  /**
   * Ground beyond the edge of the map, so the world does not stop at it: the edge's heights carried
   * outward (the river's channel too), in coarse cells, drawn and not rolled on.
   */
  skirt(builder, material, { reach = 700, cell = 24, tile = 6 } = {}) {
    const x0 = this.x0, x1 = this.x0 + (this.nx - 1) * this.cell, z0 = this.z0, z1 = this.z0 + (this.nz - 1) * this.cell;
    const color = [0.95, 0.98, 0.9];
    const uv = (q) => [q[0] / tile, q[2] / tile];
    const p = (x, z) => [x, this.heightAt(x, z), z];
    for (let z = z0 - reach; z < z1 + reach; z += cell) {
      for (let x = x0 - reach; x < x1 + reach; x += cell) {
        // Skip what the map itself already covers.
        if (x >= x0 && x + cell <= x1 && z >= z0 && z + cell <= z1) continue;
        const a = p(x, z), b = p(x, z + cell), c = p(x + cell, z + cell), d = p(x + cell, z);
        builder.quad(material, a, b, c, d, uv(a), uv(b), uv(c), uv(d), color);
      }
    }
  }

  /** The ground as triangles into `builder`: textured as `material`, drawn and rolled on. */
  mesh(builder, { grass: grassMaterial = 'surface:grass', paved: pavedMaterial = 'road:concrete', built = null, skip = null } = {}, tile = 1.5) {
    const { nx, nz, cell } = this;
    const green = [[1, 1, 1], [1.08, 1.06, 1], [0.92, 0.96, 0.92], [1.04, 1.1, 0.96]];
    const grey = [[1, 1, 1], [1.05, 1.04, 1.02], [0.94, 0.94, 0.94], [0.98, 0.97, 1.0]];
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        // A cell some other ground covers (downtown's, in a tile round it) is left to it.
        if (skip && skip(this.x0 + (i + 0.5) * cell, this.z0 + (j + 0.5) * cell)) continue;
        const p = (a, b) => [this.x0 + a * cell, this.h[b * nx + a], this.z0 + b * cell];
        const a = p(i, j), b = p(i, j + 1), c = p(i + 1, j + 1), d = p(i + 1, j);
        // Shaded smooth, as Rivertown's ground is: each corner's normal from the slope round it (shaded flat, the
        // grid's slightly tilted triangles showed as streaks).
        const nrm = (gi, gj) => {
          const h = (x, y) => this.h[Math.max(0, Math.min(nz - 1, y)) * nx + Math.max(0, Math.min(nx - 1, x))];
          const dx = h(gi + 1, gj) - h(gi - 1, gj), dz = h(gi, gj + 1) - h(gi, gj - 1), l = Math.hypot(dx, 2 * cell, dz);
          return [-dx / l, (2 * cell) / l, -dz / l];
        };
        const ns = [nrm(i, j), nrm(i, j + 1), nrm(i + 1, j + 1), nrm(i + 1, j)];
        const uv = (q) => [q[0] / tile, q[2] / tile];
        const urbanTile = 3;
        const k = (i * 7 + j * 13) % 4;
        const urban = built ? built(this.x0 + (i + 0.5) * cell, this.z0 + (j + 0.5) * cell) : false;
        const at = urban ? (q) => [q[0] / urbanTile, q[2] / urbanTile] : uv;
        // Under the river (all of it below the water): silt, dark as a riverbed is, not lawn seen through the shallows.
        const level = this.surface ? this.surface(a[0], a[2]) : this.waterLevel;
        const under = !urban && level !== null && level !== undefined && Math.max(a[1], b[1], c[1], d[1]) < level - 0.02;
        builder.quad(urban ? pavedMaterial : under ? 'ground:riverbed' : grassMaterial, a, b, c, d, at(a), at(b), at(c), at(d), urban ? grey[k] : under ? [1, 1, 1] : green[k], ns);
        builder.collide(a, b, c);
        builder.collide(a, c, d);
      }
    }
  }
}
