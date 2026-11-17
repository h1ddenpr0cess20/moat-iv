import { heightAt } from '../world/world.js';

/**
 * Snow, all through the view: a field of flakes in a box round what the camera looks at, the box as wide as what is
 * seen (so it falls everywhere on screen, near or far, not only in one patch), the flakes standing in the world and
 * wrapping round the box as it moves. They fall and drift on their own, thick or thin as the snow comes and goes.
 */

const FLAKES = 3200;

export function createSnow(GFX, scene, world) {
  const geometry = new GFX.IcosahedronGeometry(1, 0);
  const material = new GFX.MeshBasicMaterial({ color: new GFX.Color('#f4f8ff'), transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false });
  const mesh = new GFX.InstancedMesh(geometry, material, FLAKES);
  mesh.name = 'snow';
  mesh.renderOrder = 5;
  mesh.frustumCulled = false;
  mesh.count = 0;
  scene.add(mesh);
  // Where each flake stands in its box, 0 to 1, and how fast it falls and how it sways.
  const seed = Array.from({ length: FLAKES }, (_, i) => {
    const h = (n) => { const s = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453; return s - Math.floor(s); };
    return { u: h(1), v: h(2), w: h(3), fall: 0.7 + h(4) * 0.9, sway: h(5) * 6.28, size: 0.6 + h(6) * 0.8, rank: i / FLAKES };
  });
  let amount = 0, time = 0;
  const wrap = (v, size) => v - size * Math.round(v / size);

  return {
    mesh,
    /** `on`: whether it is snowing; `at`: where the camera looks, { x, z, distance } in tiles. Once a frame. */
    update(dt, on, at) {
      amount += ((on ? 1 : 0) - amount) * Math.min(1, dt * 0.7);
      const count = Math.round(FLAKES * amount);
      if (count < 8) { mesh.count = 0; mesh.visible = false; return; }
      mesh.visible = true;
      time += dt;
      // The box is as wide as the view is: a flake every few tiles however far the camera is.
      const S = Math.max(26, Math.min(130, at.distance * 2.4));
      const H = Math.max(14, S * 0.5);
      const y0 = heightAt(world, Math.max(0, Math.min(world.size, at.x)), Math.max(0, Math.min(world.size, at.z))) - 1;
      const scale = 0.009 + 0.0007 * at.distance;
      let n = 0;
      for (let i = 0; i < FLAKES && n < count; i++) {
        const f = seed[i];
        // Thin the snow evenly through the box, not by dropping a corner of it.
        if (f.rank > amount) continue;
        const x = at.x + wrap(f.u * S + Math.sin(time * 0.6 + f.sway) * 0.7 + time * 0.5 - at.x, S);
        const z = at.z + wrap(f.v * S + Math.cos(time * 0.5 + f.sway) * 0.7 + time * 0.2 - at.z, S);
        const y = y0 + ((((f.w * H - time * f.fall * 1.6) % H) + H) % H);
        mesh.setInstance(n++, x, y, z, 0, scale * f.size);
      }
      mesh.count = n;
      mesh.instancePlace.needsUpdate = true;
      mesh.instanceLook.needsUpdate = true;
    },
  };
}
