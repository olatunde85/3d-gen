/**
 * A tiny Studio set file for tests, built in code (set files themselves stay off the repository): a 10 × 8 m floor,
 * a 1 m box standing on it at (2, 1), one seat and a one-pixel lightmap. `manifest` overrides the set's details;
 * `lightmap` gives the lightmap's size (the image's header claims it; only a 1-pixel one is a real picture).
 */
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function png(size: number): Uint8Array {
  if (size === 1) return Uint8Array.from(Buffer.from(PNG_1PX, 'base64'));
  const out = new Uint8Array(33), view = new DataView(out.buffer);
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  view.setUint32(16, size);view.setUint32(20, size);out[24] = 8;out[25] = 2;
  return out;
}

function box(min: number[], max: number[]) {
  const p: number[] = [];
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) p.push(x, y, z);
  const i = [0, 1, 3, 0, 3, 2, 4, 6, 7, 4, 7, 5, 0, 4, 5, 0, 5, 1, 2, 3, 7, 2, 7, 6, 0, 2, 6, 0, 6, 4, 1, 5, 7, 1, 7, 3];
  return { positions: new Float32Array(p), indices: new Uint16Array(i), min, max };
}

export const FIXTURE_ID = 'tester/tiny-yard';

export function fixtureManifest(): Record<string, unknown> {
  return {
    kind: 'ara-studio-set', version: 1, id: FIXTURE_ID, name: 'Tiny yard', subtitle: 'A floor and a box, for tests.',
    author: 'Tester', license: 'CC0-1.0', release: '1.0', category: 'Outdoors', family: 'garden', mood: 'day',
    staging: 'A 1 m box at x=2, z=1; a seat at x=-2, z=0 facing +x.',
    lightmaps: { yard: { image: 0, scale: 2 } }, room: [-5, -4, 5, 4], seats: [{ x: -2, y: 0.45, z: 0, yaw: 90 }],
    light: { sun: { direction: [0.5, -0.8, -0.3], color: '#fff0d8', intensity: 2.5 }, fill: { color: '#bcd0e0', intensity: 0.6 }, exposure: 1, background: '#cfdbe4' },
  };
}

export function setFile(options: { manifest?: Record<string, unknown> | null; lightmap?: number } = {}): Uint8Array {
  const parts = [box([-5, -0.1, -4], [5, 0, 4]), box([1.5, 0, 0.5], [2.5, 1, 1.5])], image = png(options.lightmap ?? 1);
  const chunks: Uint8Array[] = [], views: object[] = [], accessors: object[] = [];
  let length = 0;
  const add = (bytes: Uint8Array, target?: number) => {
    const pad = (4 - (length % 4)) % 4;
    if (pad) { chunks.push(new Uint8Array(pad));length += pad; }
    views.push({ buffer: 0, byteOffset: length, byteLength: bytes.byteLength, ...(target ? { target } : {}) });
    chunks.push(bytes);length += bytes.byteLength;
    return views.length - 1;
  };
  const meshes = parts.map((part, n) => {
    const position = accessors.push({ bufferView: add(new Uint8Array(part.positions.buffer), 34962), componentType: 5126, count: 8, type: 'VEC3', min: part.min, max: part.max }) - 1;
    const indices = accessors.push({ bufferView: add(new Uint8Array(part.indices.buffer), 34963), componentType: 5123, count: 36, type: 'SCALAR' }) - 1;
    return { name: n ? 'Box' : 'Floor', primitives: [{ attributes: { POSITION: position }, indices, material: 0 }], extras: { ara_lightmap: 'yard' } };
  });
  const lightmap = add(image);
  const manifest = options.manifest === null ? undefined : { ...fixtureManifest(), ...options.manifest };
  const json = {
    asset: { version: '2.0', generator: 'Ara test fixture' }, scene: 0, scenes: [{ nodes: [0, 1] }],
    nodes: meshes.map((m, i) => ({ name: m.name, mesh: i })), meshes, accessors, bufferViews: views,
    materials: [{ name: 'Grey', pbrMetallicRoughness: { baseColorFactor: [0.6, 0.6, 0.6, 1] } }],
    images: [{ bufferView: lightmap, mimeType: 'image/png', name: 'yard-light' }],
    buffers: [{ byteLength: 0 }], ...(manifest ? { extras: { ara_set: manifest } } : {}),
  };
  const pad = (4 - (length % 4)) % 4;
  if (pad) { chunks.push(new Uint8Array(pad));length += pad; }
  json.buffers[0].byteLength = length;
  let text = new TextEncoder().encode(JSON.stringify(json));
  const textPad = (4 - (text.length % 4)) % 4;
  text = Uint8Array.from([...text, ...new Array(textPad).fill(0x20)]);
  const out = new Uint8Array(12 + 8 + text.length + 8 + length), view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);view.setUint32(4, 2, true);view.setUint32(8, out.length, true);
  view.setUint32(12, text.length, true);view.setUint32(16, 0x4e4f534a, true);out.set(text, 20);
  view.setUint32(20 + text.length, length, true);view.setUint32(24 + text.length, 0x004e4942, true);
  let at = 28 + text.length;
  for (const c of chunks) { out.set(c, at);at += c.byteLength; }
  return out;
}
