/**
 * Rapid Central Station (Progressive AE, 2004), between Wealthy and Cherry beside US-131: the terminal, with its
 * green roof, on the west; and over the bus bays on the east a long canopy of white fabric on steel masts, in two
 * tiers that rise and fall between about 14 and 45 feet, meant for the rapids of the Grand River (the aerial photo
 * shows its crests running down its length, the two tiers out of step). Set a little higher than the published
 * figures, to read as the tall canopy it is beside the highway.
 */
export const STATION = { terminal: '0e81276c-320e-4d44-bc10-e281b0c9e0df', canopy: 'e4bb3166-38f2-409a-9b52-8a30b80085ed' };

const LOW = 6, HIGH = 15.5, WAVE = 42;

/** The canopy over the bays, on the footprint the map gives it (its long axis is its length). */
export function stationCanopy(builder, terrain, b) {
  const ring = b.rings[0];
  const xs = ring.map((p) => p[0]), zs = ring.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  const along = z1 - z0 >= x1 - x0;
  // u along its length, v across; to (x, z).
  const len = along ? z1 - z0 : x1 - x0, wid = along ? x1 - x0 : z1 - z0;
  const at = (u, v) => (along ? [x0 + v, z0 + u] : [x0 + u, z0 + v]);
  let ground = Infinity;
  for (const [x, z] of ring) ground = Math.min(ground, terrain.heightAt(x, z));
  // Each tier a run of crests; the second half a wave behind the first.
  const tier = (v) => (v < wid / 2 ? 0 : 1);
  const height = (u, v) => {
    const t = tier(v), phase = t ? Math.PI : 0;
    const s = 0.5 + 0.5 * Math.cos((2 * Math.PI * u) / WAVE + phase);
    // Across each tier the fabric sags from its masts' line to its edges.
    const vt = t ? (v - wid / 2) / (wid / 2) : v / (wid / 2), sag = 1 - 0.15 * Math.pow(2 * vt - 1, 2);
    return ground + LOW + (HIGH - LOW) * s * sag;
  };
  const white = [0.96, 0.96, 0.94], under = [0.8, 0.8, 0.82], steel = [0.5, 0.52, 0.55];
  const du = 3, dv = wid / 8;
  for (let u = 0; u < len - 1e-6; u += du) {
    const u1 = Math.min(len, u + du);
    for (let k = 0; k < 8; k++) {
      const v0 = k * dv, v1 = (k + 1) * dv;
      // Where the tiers meet, each keeps its own edge: a step in the fabric, not a slope between them.
      const e = 0.02, a = v0 + (k === 4 ? e : 0), c = v1 - (k === 3 ? e : 0);
      const P = (uu, vv) => { const [x, z] = at(uu, vv); return [x, height(uu, vv), z]; };
      const A = P(u, a), B = P(u1, a), C = P(u1, c), D = P(u, c);
      // The fabric's own slope, so the moon and the street lights shade its waves.
      const e1 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]], e2 = [B[0] - D[0], B[1] - D[1], B[2] - D[2]];
      let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const nl = Math.hypot(...n) || 1;
      n = n.map((c) => (c * Math.sign(n[1] || 1)) / nl);
      const down = n.map((c) => -c);
      // Top and underside, each wound to face its own way (front where cross(b - a, c - a) is along its normal).
      const face = (mat, color, nn) => {
        const x = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], y = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
        const up = (x[2] * y[0] - x[0] * y[2]) * nn[1] + (x[1] * y[2] - x[2] * y[1]) * nn[0] + (x[0] * y[1] - x[1] * y[0]) * nn[2];
        if (up > 0) builder.quad(mat, A, B, C, D, [0, 0], [1, 0], [1, 1], [0, 1], color, nn);
        else builder.quad(mat, A, D, C, B, [0, 0], [0, 1], [1, 1], [1, 0], color, nn);
      };
      face('prop:canopy', white, n);
      face('prop:canopy-under', under, down);
    }
  }
  // The masts: up each tier's middle, at its crests, standing above the fabric; and short posts at its low edges.
  const mast = (x, z, y0, y1, r) => {
    for (let k = 0; k < 4; k++) {
      const a0 = (k / 4) * Math.PI * 2 + Math.PI / 4, a1 = ((k + 1) / 4) * Math.PI * 2 + Math.PI / 4;
      const A = [x + Math.cos(a0) * r, y0, z + Math.sin(a0) * r], B = [x + Math.cos(a1) * r, y0, z + Math.sin(a1) * r];
      builder.quad('prop:steel', B, A, [A[0], y1, A[2]], [B[0], y1, B[2]], [0, 0], [1, 0], [1, 1], [0, 1], steel, [Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)]);
    }
    builder.trunks.push([x, z, r + 0.05, y0, y1]);
  };
  for (const t of [0, 1]) {
    const v = wid / 4 + t * (wid / 2);
    for (let u = t ? WAVE / 2 : 0; u <= len + 1e-6; u += WAVE) {
      const uu = Math.max(1, Math.min(len - 1, u));
      const [x, z] = at(uu, v);
      mast(x, z, ground, height(uu, v) + 2.5, 0.22);
    }
  }
  for (let u = WAVE / 2; u < len; u += WAVE) for (const v of [0.6, wid - 0.6]) {
    const [x, z] = at(u, v);
    mast(x, z, ground, height(u, v), 0.14);
  }
  // The bays' concrete under it.
  const [ax, az] = at(0, 0), [cx, cz] = at(len, wid);
  builder.quad('road:concrete', [ax, ground + 0.22, az], [ax, ground + 0.22, cz], [cx, ground + 0.22, cz], [cx, ground + 0.22, az], [ax / 3, az / 3], [ax / 3, cz / 3], [cx / 3, cz / 3], [cx / 3, az / 3], [0.92, 0.92, 0.9], [0, 1, 0]);
}
