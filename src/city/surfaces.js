import { onCanvas } from 'madness-engine/textures/pixel-kit';

/**
 * The surfaces of the ground, painted by the engine's own painters
 * (textures/road, textures/ground) in workers, all at once. Each is a tile
 * that wraps, `tile` meters across, with a bump map in the same pixels.
 */
export const SURFACES = {
  asphalt: { painter: 'asphalt', tile: 2, bump: 2.2, rough: 0.93, options: { age: 0.55, cracks: 0.12, stains: 0.3, seed: 1 } },
  lot: { painter: 'asphalt', tile: 2, bump: 2.4, rough: 0.95, small: true, options: { age: 0.8, cracks: 0.35, stains: 0.45, seed: 2 } },
  concrete: { painter: 'concrete', tile: 3, bump: 1.6, rough: 0.9, options: { finish: 'aged', slabs: 1, cracks: 0.3, stains: 0.4, seed: 3 } },
  sidewalk: { painter: 'concrete', tile: 3, bump: 1.6, rough: 0.88, small: true, options: { finish: 'broom', slabs: 2, cracks: 0.25, stains: 0.3, seed: 4 } },
  turf: { painter: 'turf', tile: 1.5, bump: 1.8, rough: 1, options: { health: 0.8, length: 0.35, clover: 0.3, seed: 1 } },
  pavers: { painter: 'pavers', tile: 1.6, bump: 1.8, rough: 0.9, small: true, options: { kind: 'brick', wear: 0.5, seed: 1 } },
  ballast: { painter: 'gravel', tile: 2, bump: 3, rough: 1, small: true, options: { kind: 'ballast', seed: 1 } },
  path: { painter: 'gravel', tile: 2, bump: 2.4, rough: 1, small: true, options: { kind: 'path', seed: 2 } },
  'gravel-roof': { painter: 'gravel', tile: 2, bump: 2.4, rough: 1, small: true, options: { kind: 'roof', seed: 3 } },
  'shingles-charcoal': { painter: 'shingles', tile: 1.6, bump: 2, rough: 0.95, small: true, options: { color: 'charcoal', age: 0.4, seed: 1 } },
  'shingles-brown': { painter: 'shingles', tile: 1.6, bump: 2, rough: 0.95, small: true, options: { color: 'brown', age: 0.4, seed: 2 } },
  'membrane-white': { painter: 'membrane', tile: 3, bump: 1.4, rough: 0.7, small: true, options: { tone: 'white', age: 0.35, seed: 1 } },
  'facade-curtain': { painter: 'facade', tile: 3.6, bump: 1.2, rough: 0.2, small: true, options: { kind: 'curtain', seed: 1 } },
  'facade-precast': { painter: 'facade', tile: 3.6, bump: 2.2, rough: 0.85, small: true, options: { kind: 'precast', seed: 1 } },
  'facade-terracotta': { painter: 'facade', tile: 3.6, bump: 1.8, rough: 0.6, small: true, options: { kind: 'terracotta', seed: 1 } },
  'facade-sandstone': { painter: 'facade', tile: 3.6, bump: 2.6, rough: 0.92, small: true, options: { kind: 'sandstone', seed: 1 } },
  'facade-glass-bronze': { painter: 'city', tile: 3.6, bump: 0.8, rough: 0.12, small: true, options: { kind: 'glass', tone: 'bronze', seed: 2 } },
  'facade-glass-blue': { painter: 'city', tile: 3.6, bump: 0.8, rough: 0.12, small: true, options: { kind: 'glass', tone: 'blue', seed: 3 } },
  'facade-glass-teal': { painter: 'city', tile: 3.6, bump: 0.8, rough: 0.12, small: true, options: { kind: 'glass', tone: 'teal', seed: 4 } },
  'facade-glass-dark': { painter: 'city', tile: 3.6, bump: 0.8, rough: 0.14, small: true, options: { kind: 'glass', tone: 'dark', seed: 5 } },
  'facade-limestone': { painter: 'city', tile: 3.6, bump: 2.2, rough: 0.85, small: true, options: { kind: 'limestone', seed: 1 } },
  'facade-historic': { painter: 'city', tile: 3.6, bump: 2.4, rough: 0.88, small: true, options: { kind: 'historic', seed: 1 } },
  'facade-historic-arched': { painter: 'city', tile: 3.6, bump: 2.4, rough: 0.88, small: true, options: { kind: 'historic', arch: true, seed: 3 } },
  'facade-concrete': { painter: 'city', tile: 3.6, bump: 1.6, rough: 0.8, small: true, options: { kind: 'concrete', seed: 1 } },
  'membrane-gray': { painter: 'membrane', tile: 3, bump: 1.4, rough: 0.75, small: true, options: { tone: 'gray', age: 0.35, seed: 2 } },
};

/** The pixel size the surfaces are painted at: `?texture=2048` for the best, 1024 to load quickly. */
export const SIZE = Number(new URLSearchParams(globalThis.location?.search ?? '').get('texture')) || 1536;

/**
 * Paints every surface in a few workers (as many as the machine has cores, less one, no more than six), each taking
 * the next surface as it finishes the last; resolves with { name: { size, color, height } }. A surface whose worker
 * fails is painted again here, on the page's own thread, so one lost worker does not lose the city its streets.
 */
export function paintSurfaces(onEach = () => {}) {
  const painted = {};
  const queue = Object.entries(SURFACES);
  const optionsOf = (def) => ({ ...def.options, size: def.small ? Math.min(SIZE, 1024) : SIZE });
  const here = async (name, def) => {
    const { paintHere } = await import('./paint.here.js');
    painted[name] = paintHere(def.painter, optionsOf(def));
    onEach(name);
  };
  const lane = () => new Promise((resolve) => {
    const worker = new Worker(new URL('./paint.worker.js', import.meta.url), { type: 'module' });
    let current = null;
    const next = () => {
      current = queue.shift();
      if (!current) { worker.terminate(); resolve(); return; }
      worker.postMessage({ name: current[0], painter: current[1].painter, options: optionsOf(current[1]) });
    };
    worker.onmessage = ({ data }) => { painted[data.name] = data.pixels; onEach(data.name); next(); };
    worker.onerror = (e) => {
      e.preventDefault?.();
      console.warn(`painting ${current?.[0]} in a worker failed (${e.message}); painting it here`);
      worker.terminate();
      // This lane's surface, and the rest of the queue it would have taken, are painted on the page's thread.
      const mine = current;
      (async () => { if (mine) await here(...mine); while (queue.length) await here(...queue.shift()); resolve(); })();
    };
    next();
  });
  const lanes = Math.max(2, Math.min(6, (globalThis.navigator?.hardwareConcurrency ?? 4) - 1));
  return Promise.all(Array.from({ length: lanes }, lane)).then(() => painted);
}

/** The textures of a painted surface, on canvases, wrapping. */
export const texturesOf = (GFX, pixels) => onCanvas(GFX, pixels);
