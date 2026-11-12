/**
 * Shapes for the market street course: a yellow minibus that rolls down a lane, a parked tricycle that blocks one,
 * and stall umbrellas. Each is one geometry with painted vertex colours, so a whole street draws in a few batches.
 */
import * as T from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function painted(parts: [T.BufferGeometry, string][]) {
  const geometries = parts.map(([g, color]) => {
    const flat = g.index ? g.toNonIndexed() : g, c = new T.Color(color), n = flat.getAttribute('position').count, colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.toArray(colors, i * 3);
    flat.setAttribute('color', new T.BufferAttribute(colors, 3));flat.deleteAttribute('uv');if (flat !== g) g.dispose();return flat;
  });
  const merged = mergeGeometries(geometries)!;geometries.forEach((g) => g.dispose());return merged;
}
const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new T.BoxGeometry(w, h, d).translate(x, y, z);

/** A yellow minibus with black bands and dark windows, 3 m long, centred on the moving-cart slot. */
export function minibusGeometry() {
  const yellow = '#f2b81c', black = '#1d1d1f', glass = '#2b3640';
  return painted([
    [box(1.6, 1.15, 3.0, 0, 0.9, 0), yellow], [box(1.62, 0.12, 3.02, 0, 0.62, 0), black], [box(1.62, 0.1, 3.02, 0, 1.05, 0), black],
    [box(1.63, 0.38, 2.3, 0, 1.3, -0.25), glass], [box(1.5, 0.45, 0.06, 0, 1.25, 1.49), glass], [box(1.6, 0.12, 3.0, 0, 1.53, 0), yellow],
    [box(1.4, 0.08, 2.6, 0, 1.63, -0.1), black], [box(0.3, 0.12, 0.05, -0.55, 0.62, 1.52), '#fff4c8'], [box(0.3, 0.12, 0.05, 0.55, 0.62, 1.52), '#fff4c8'],
  ]);
}

/** A green tricycle taxi with a black canopy, parked across one lane. */
export function tricycleGeometry() {
  const green = '#2f8f4e', black = '#1d1d1f', yellow = '#f2c23c';
  return painted([
    [box(1.25, 0.75, 1.9, 0, 0.7, 0), green], [box(1.27, 0.1, 1.92, 0, 0.5, 0), yellow], [box(0.9, 0.5, 0.5, 0, 0.85, 1.15), green],
    [box(1.3, 0.08, 1.7, 0, 1.85, -0.05), black], ...[-0.6, 0.6].flatMap((x) => [[box(0.06, 0.8, 0.06, x, 1.45, 0.75), black], [box(0.06, 0.8, 0.06, x, 1.45, -0.8), black]] as [T.BufferGeometry, string][]),
    [box(1.0, 0.55, 0.05, 0, 1.5, 0.85), '#2b3640'], [new T.CylinderGeometry(0.28, 0.28, 0.16, 12).rotateZ(Math.PI / 2).translate(0, 0.28, 1.25), black],
    [new T.CylinderGeometry(0.28, 0.28, 0.16, 12).rotateZ(Math.PI / 2).translate(-0.62, 0.28, -0.6), black], [new T.CylinderGeometry(0.28, 0.28, 0.16, 12).rotateZ(Math.PI / 2).translate(0.62, 0.28, -0.6), black],
  ]);
}

/** A stall umbrella canopy on its pole; colour comes from the instance. */
export const umbrellaGeometry = () => mergeGeometries([new T.ConeGeometry(1.35, 0.55, 10).translate(0, 2.55, 0), new T.CylinderGeometry(0.04, 0.04, 2.4, 6).translate(0, 1.2, 0)])!;
export const UMBRELLA_COLORS = ['#d8473d', '#2f78c4', '#f2b81c', '#2f9e60', '#e07a2c', '#8c4fb0'];
