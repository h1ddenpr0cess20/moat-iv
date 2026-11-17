import { paintHere } from './paint.here.js';

/** Paints surfaces off the main thread, one per message: the painters are plain pixel maths, so the page keeps moving while they work. */
self.onmessage = ({ data: { name, painter, options } }) => {
  const pixels = paintHere(painter, options);
  self.postMessage({ name, pixels }, [pixels.color.buffer, pixels.height.buffer]);
};
