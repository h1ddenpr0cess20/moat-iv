/** Builds the tiles of the greater city round downtown, away from the page's own thread (metro.js). */
import { backdrop, buildTile, metroShared, transferables } from './metro.js';

let shared = null;
const get = (url) => fetch(url).then((r) => r.json());

onmessage = async ({ data }) => {
  try {
    if (data.init) {
      shared = metroShared(data.init);
      postMessage({ ready: true });
      return;
    }
    if (data.backdrop) {
      const parts = [...backdrop(shared, { far: data.far })];
      postMessage({ backdrop: parts }, parts.flatMap(([, ps]) => ps.flatMap((p) => [p.pos.buffer, p.nor.buffer, p.uv.buffer, p.col.buffer])));
      return;
    }
    const { i, j, file, base } = data;
    const tile = buildTile(await get(`${base}${file}`), i, j, shared);
    postMessage({ tile }, transferables(tile));
  } catch (err) {
    postMessage({ error: `${data.base ?? ""}${data.file ?? ""}: ${String(err?.stack ?? err)}`, i: data.i, j: data.j });
  }
};
