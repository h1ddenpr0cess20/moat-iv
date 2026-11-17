import { Mesh } from './mesh.js';

/**
 * Rivertown's refined set pieces (ported from its Blender generator, citygen/landmarks.py), in Blender's frame
 * (x east, y north, z up). The rest of 3d-city's set pieces are its own.
 *
 * La Grande Vitesse (Alexander Calder, 1969), Calder Plaza: about 13 m tall and 16.5 m long, vermilion steel plate.
 * Modeled from photographs: tall curved "petals", each standing on a narrow foot and flaring up into a rounded lobe
 * (the tall ear at the east end, a broad low lobe at the west with a thin spike behind it, smaller ones between), tied
 * together over head by a twisted saddle of plate, every plate stiffened by a flange down its middle.
 */
export const CALDER = [-254.0, 590.0];
const RED = 'M_Paint_d0321e';
const both = (M, pts, mat) => { M.poly(pts, mat); M.poly(pts.slice().reverse(), mat); };

function petal(M, P, foot, yaw, H, W, { wf = 0.5, bend = 0.35, lean = [0, 0], rows = 18, cols = 10, flange = true, flare = 1.8, cap = 0.7 } = {}) {
  const ax = Math.cos(yaw), ay = Math.sin(yaw), nx = -ay, ny = ax;
  const R = W / 2, Rz = R * cap, zc = H - Rz;
  const half = (z) => (z <= zc ? wf / 2 + (R - wf / 2) * (z / zc) ** flare : R * Math.sqrt(Math.max(0, 1 - ((z - zc) / Rz) ** 2)));
  const grid = [];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows, z = H * (1 - (1 - t) ** 1.3), hw = half(Math.min(z, H - 1e-3)), row = [];
    for (let j = 0; j <= cols; j++) {
      const s = -1 + (2 * j) / cols, off = s * hw, cup = bend * s * s * (z / H), k = (z / H) ** 2;
      row.push(P(foot[0] + ax * (off + lean[0] * k) + nx * (cup + lean[1] * k), foot[1] + ay * (off + lean[0] * k) + ny * (cup + lean[1] * k), z));
    }
    grid.push(row);
  }
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) both(M, [grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]], RED);
  if (flange) {
    // A stiffening flange down the middle of the plate, standing 0.3 m proud on its concave side.
    for (let i = 0; i < Math.floor(rows * 0.8); i++) {
      const a = grid[i][cols >> 1], b = grid[i + 1][cols >> 1];
      both(M, [a, b, [b[0] + nx * 0.3, b[1] + ny * 0.3, b[2]], [a[0] + nx * 0.3, a[1] + ny * 0.3, a[2]]], RED);
    }
  }
}

/** A ruled, twisted sheet of plate (a hyperbolic paraboloid) from the edge a0-a1 to the edge b0-b1. */
function saddle(M, P, a0, a1, b0, b1, n = 18, m = 6) {
  const lerp = (p, q, t) => p.map((v, i) => v + (q[i] - v) * t);
  const grid = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, row = [];
    for (let j = 0; j <= m; j++) row.push(P(...lerp(lerp(a0, b0, t), lerp(a1, b1, t), j / m)));
    grid.push(row);
  }
  for (let k = 0; k < n; k++) for (let j = 0; j < m; j++) both(M, [grid[k][j], grid[k + 1][j], grid[k + 1][j + 1], grid[k][j + 1]], RED);
}

/** La Grande Vitesse; `ground(x, y)` the ground's height at a Blender XY point. */
export function vitesse(builder, ground, [x, y] = CALDER) {
  const M = new Mesh(builder);
  const g = ground(x, y) + 0.02, P = (px, py, pz) => [x + px, y + py, g + pz], D = (a) => (a * Math.PI) / 180;
  petal(M, P, [0.0, -6.4], D(90), 8.6, 7.6, { wf: 0.8, bend: 0.7, lean: [-0.8, 0.8], flare: 1.5, cap: 0.6 });
  petal(M, P, [-2.6, -6.0], D(80), 10.6, 1.3, { wf: 0.35, bend: 0.05, lean: [-0.6, -0.4], cols: 2, flange: false, flare: 1.2, cap: 1.2 });
  petal(M, P, [0.6, 1.2], D(70), 9.0, 2.8, { wf: 0.5, bend: 0.5, lean: [0.4, 0.5], flare: 1.7 });
  petal(M, P, [-0.4, 7.6], D(100), 13.2, 5.2, { wf: 0.6, bend: 0.8, lean: [1.4, -0.5], flare: 1.35, cap: 0.95 });
  petal(M, P, [-3.6, -1.2], D(20), 6.2, 3.0, { wf: 0.5, bend: 0.45, lean: [-0.3, -0.5], flare: 1.5 });
  petal(M, P, [-3.2, 4.0], D(150), 5.4, 2.4, { wf: 0.45, bend: 0.35, lean: [0.2, 0.4], flare: 1.5 });
  // The great saddle: from the lobe's shoulder up into the ear, twisting through a quarter turn; a lesser one behind.
  saddle(M, P, [0.4, -4.0, 4.6], [-0.8, -3.0, 7.6], [0.8, 6.4, 11.8], [-1.0, 6.8, 6.8]);
  saddle(M, P, [0.4, 1.6, 6.0], [0.8, 0.8, 8.2], [-3.4, -0.6, 4.6], [-3.8, -1.6, 5.8], 10, 4);
}

/**
 * DeVos Place's river hall: a long wall to the Grand River (silver panels over a tan band) under a silver roof that lies low at the north end
 * and sweeps up into a great curve at the south, where it rounds down over a glazed end; ribs of white steel up the
 * glass every 9 m; the roof runs across the whole exhibit wing to its east side. (The rest of DeVos Place is devosPlace.)
 */
// (The roof of the exhibit halls, from the river across to their east side; south of them is the ballroom, devosPlace's.)
// Its river wall on the footprint's (the Riverwalk runs outside it, on the flood wall); it stops short of Michigan
// Street, where a lower block of the base meets the street.
const DEVOS = { x0: -490.5, x1: -350.5, y0: 512.0, y1: 672.0, glass: -478.0 };
const ROOF = 'M_Paint_d3d6d9', PANEL = 'M_Paint_c9cdd1', TAN = 'M_Stucco_e2b07c';
const WHITE = 'M_Paint_eeeeee';
function devosHeight(t) {
  t = 1 - t;
  const rise = t < 0.3 ? 0 : (1 - Math.cos(Math.PI * Math.min(1, (t - 0.3) / 0.58))) / 2;
  let z = 13.0 + 13.0 * rise;
  if (t > 0.9) z -= 9.0 * ((t - 0.9) / 0.1) ** 2;
  return z;
}

export function devosHall(builder, ground) {
  const M = new Mesh(builder), d = DEVOS, n = 40;
  let g = Infinity;
  for (let k = 0; k <= n; k++) g = Math.min(g, ground(d.x0, d.y0 + ((d.y1 - d.y0) * k) / n));
  const front = [], back = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, y = d.y0 + (d.y1 - d.y0) * t, z = g + devosHeight(t);
    front.push([d.x0, y, z]);
    // (Across the whole wing it rises a little to the east, clear of the walls round it, 11.4 m.)
    back.push([d.x1, y, z + 1.0]);
  }
  for (let k = 0; k < n; k++) {
    // The roof, its soffit, and its deep white edge; the wall under it.
    M.poly([front[k], front[k + 1], back[k + 1], back[k]], ROOF, [0, 0, 1]);
    M.poly([front[k], back[k], back[k + 1], front[k + 1]], ROOF, [0, 0, -1]);
    const a = front[k], b = front[k + 1];
    M.poly([[a[0] - 0.6, a[1], a[2] + 0.4], [b[0] - 0.6, b[1], b[2] + 0.4], [b[0] - 0.6, b[1], b[2] - 0.9], [a[0] - 0.6, a[1], a[2] - 0.9]], WHITE, [-1, 0, 0]);
    // The wall: silver panels over a tan band 5 m high (glass doors along its south part, toward the ballroom).
    const x = a[0] + 0.8, low = k / n < 0.4 ? 'M_Glass_Blue' : TAN;
    M.poly([[x, a[1], g], [x, b[1], g], [x, b[1], g + 5], [x, a[1], g + 5]], low, [-1, 0, 0]);
    M.poly([[x, a[1], g + 5], [x, b[1], g + 5], [x, b[1], b[2] - 0.9], [x, a[1], a[2] - 0.9]], PANEL, [-1, 0, 0]);
  }
  // The ribs, every 9 m.
  for (let y = d.y0; y <= d.y1 - 4; y += 9.0) {
    const z = g + devosHeight((y - d.y0) / (d.y1 - d.y0));
    M.box([d.x0 + 0.2, y, g], [1.2, 0.5, z - g - 0.6], WHITE);
  }
  // The ends: glass under the hall's river front, plain wall across the rest; the east side plain wall to the roof.
  for (const [a, b, f] of [[front[0], back[0], [0, -1, 0]], [front.at(-1), back.at(-1), [0, 1, 0]]]) {
    const at = (x) => a[2] + (b[2] - a[2]) * ((x - a[0]) / (b[0] - a[0]));
    const gx = d.glass, gz = at(gx);
    M.poly([[a[0], a[1], g], [gx, a[1], g], [gx, a[1], gz], [a[0], a[1], a[2]]], 'M_Glass_Blue', f);
    M.poly([[gx, a[1], g], [b[0], b[1], g], [b[0], b[1], b[2]], [gx, a[1], gz]], 'M_Precast', f);
  }
  for (let k = 0; k < n; k++) {
    const a = back[k], b = back[k + 1];
    M.poly([[a[0], a[1], g], [b[0], b[1], g], [b[0], b[1], b[2]], [a[0], a[1], a[2]]], 'M_Precast', [1, 0, 0]);
  }
}

/**
 * The rest of DeVos Place, on its footprint (`ring`, [x, z] as the map has it): a convention centre, not offices. Plain
 * light precast walls about 11 m high under a flat white roof; on the river, south of the exhibit halls, the ballroom's
 * two storeys of glass; its south-west corner tan stone, and on the east the old Civic Auditorium's limestone and
 * pilasters. (The exhibit halls' roof is devosHall's.) Over it, as the laser survey has them: the stage house at 18 m and its
 * white fly tower at 25 m.
 */
export function devosPlace(builder, ground, ring) {
  const M = new Mesh(builder);
  let R = ring.map(([x, z]) => [x, -z]);
  let area = 0;
  for (let i = 0; i < R.length; i++) { const a = R[i], b = R[(i + 1) % R.length]; area += a[0] * b[1] - b[0] * a[1]; }
  if (area < 0) R = R.reverse();
  if (R.length > 1 && R[0][0] === R.at(-1)[0] && R[0][1] === R.at(-1)[1]) R = R.slice(0, -1);
  let g = Infinity;
  for (const [x, y] of R) g = Math.min(g, ground(x, y));
  const H = 11, TOP = 11.4;
  const PRECAST = 'M_Precast', TAN = 'M_Stucco_c49466', LIME = 'M_Limestone', GLASS = 'M_Glass_Blue';
  for (let i = 0; i < R.length; i++) {
    const a = R[i], b = R[(i + 1) % R.length], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    if (L < 0.05) continue;
    const n = [dy / L, -dx / L, 0], my = (a[1] + b[1]) / 2;
    const quad = (z0, z1, mat, off = 0) => M.poly([[a[0] + n[0] * off, a[1] + n[1] * off, g + z0], [b[0] + n[0] * off, b[1] + n[1] * off, g + z0],
      [b[0] + n[0] * off, b[1] + n[1] * off, g + z1], [a[0] + n[0] * off, a[1] + n[1] * off, g + z1]], mat, n);
    // The parapet's inside, seen from over the roof.
    M.poly([[a[0], a[1], g + H], [b[0], b[1], g + H], [b[0], b[1], g + TOP], [a[0], a[1], g + TOP]], PRECAST, [-n[0], -n[1], 0]);
    const west = n[0] < -0.7, east = n[0] > 0.7, south = n[1] < -0.7;
    // Under the exhibit halls' roof the river wall is devosHall's.
    if (west && my > 512 && my < 672) continue;
    if (my < 420 && (west || south) && a[0] < -470) {
      quad(0, TOP, TAN);
    } else if (west && my < 512) {
      // The ballroom: glass from a low sill to under the roof, steel mullions every 3 m and a band at the floor between.
      quad(0, 1, PRECAST); quad(10, TOP, PRECAST); quad(1, 10, GLASS);
      const k = Math.max(1, Math.round(L / 3));
      for (let j = 1; j < k; j++) {
        const t = j / k;
        M.box([a[0] + dx * t + n[0] * 0.1, a[1] + dy * t + n[1] * 0.1, g + 1], [0.15, 0.2, 9], 'M_Mullion', { yaw: Math.atan2(dy, dx) });
      }
      M.box([(a[0] + b[0]) / 2 + n[0] * 0.15, (a[1] + b[1]) / 2 + n[1] * 0.15, g + 5.3], [L, 0.3, 0.4], PRECAST, { yaw: Math.atan2(dy, dx), bottom: true });
    } else if (east && my < 520) {
      quad(0, TOP, LIME);
      // Pilasters every 4.5 m, the height of the wall.
      const k = Math.floor(L / 4.5);
      for (let j = 1; j < k; j++) {
        const t = j / k;
        M.box([a[0] + dx * t + n[0] * 0.3, a[1] + dy * t + n[1] * 0.3, g], [1.0, 0.6, H - 0.6], LIME, { yaw: Math.atan2(dy, dx) });
      }
    } else {
      quad(0, TOP, PRECAST);
    }
  }
  M.poly(R.map(([x, y]) => [x, y, g + H]), 'M_Roof_Membrane', [0, 0, 1]);
  // What stands over the roof: walls and a flat top.
  const block = (x0, x1, y0, y1, z1, wall, roof = 'M_Roof_Membrane') => {
    const c = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    for (let i = 0; i < 4; i++) {
      const p = c[i], q = c[(i + 1) % 4];
      M.poly([[p[0], p[1], g + H], [q[0], q[1], g + H], [q[0], q[1], g + z1], [p[0], p[1], g + z1]], wall, [q[1] - p[1], p[0] - q[0], 0]);
    }
    M.poly(c.map(([x, y]) => [x, y, g + z1]), roof, [0, 0, 1]);
  };
  block(-461, -369, 441, 502, 18, PRECAST);
  block(-431, -371, 443, 494, 25, 'M_Paint_e9e7e1');
}
