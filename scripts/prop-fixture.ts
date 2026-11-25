/**
 * A tiny prop file for tests, built in code (prop files stay off the repository): a 4 × 1.8 m box body standing in
 * for Ara's sports car, four tagged wheels (radius 0.33), a tagged steering wheel and two seats with their hips
 * `seat` metres up, the paint and lamps tagged by material. `details` overrides the prop's details.
 */
export const PROP_FIXTURE_ID = 'tester/box-car';

export function propDetails(): Record<string, unknown> {
  return { kind: 'ara-prop', version: 1, id: PROP_FIXTURE_ID, name: 'Box car', author: 'Tester', license: 'CC0-1.0', release: '1.0', type: 'vehicle', base: 'sports_car' };
}

function box(min: number[], max: number[]) {
  const p: number[] = [];
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) p.push(x, y, z);
  const i = [0, 1, 3, 0, 3, 2, 4, 6, 7, 4, 7, 5, 0, 4, 5, 0, 5, 1, 2, 3, 7, 2, 7, 6, 0, 2, 6, 0, 6, 4, 1, 5, 7, 1, 7, 3];
  return { positions: new Float32Array(p), indices: new Uint16Array(i), min, max };
}

export function propFile(options: { details?: Record<string, unknown> | null; seat?: number; wheels?: number } = {}): Uint8Array {
  const seat = options.seat ?? 0.35, r = 0.33;
  const chunks: Uint8Array[] = [], views: object[] = [], accessors: object[] = [], meshes: object[] = [], nodes: object[] = [];
  let length = 0;
  const add = (bytes: Uint8Array, target: number) => {
    const pad = (4 - (length % 4)) % 4;
    if (pad) { chunks.push(new Uint8Array(pad));length += pad; }
    views.push({ buffer: 0, byteOffset: length, byteLength: bytes.byteLength, target });
    chunks.push(bytes);length += bytes.byteLength;
    return views.length - 1;
  };
  const mesh = (name: string, b: ReturnType<typeof box>, material: number, extras?: object) => {
    const position = accessors.push({ bufferView: add(new Uint8Array(b.positions.buffer), 34962), componentType: 5126, count: 8, type: 'VEC3', min: b.min, max: b.max }) - 1;
    const indices = accessors.push({ bufferView: add(new Uint8Array(b.indices.buffer), 34963), componentType: 5123, count: 36, type: 'SCALAR' }) - 1;
    meshes.push({ name, primitives: [{ attributes: { POSITION: position }, indices, material }] });
    return nodes.push({ name, mesh: meshes.length - 1, ...(extras ? { extras } : {}) }) - 1;
  };
  const children = [mesh('Body', box([-0.9, 0.15, -2], [0.9, 1.0, 2]), 0)];
  children.push(mesh('Tail lamp', box([-0.7, 0.75, -2.02], [0.7, 0.8, -2]), 1));
  children.push(mesh('Steering wheel', box([0.2, 0.7, 0.3], [0.5, 0.95, 0.35]), 2, { ara_role: 'steering' }));
  const wheels = options.wheels ?? 4;
  [[0.85, 1.35, 'front', 'left'], [-0.85, 1.35, 'front', 'right'], [0.85, -1.35, 'rear', 'left'], [-0.85, -1.35, 'rear', 'right']].slice(0, wheels).forEach(([x, z, axle, side]) => {
    children.push(mesh(`Wheel ${axle} ${side}`, box([(x as number) - 0.12, 0, (z as number) - r], [(x as number) + 0.12, 2 * r, (z as number) + r]), 2, { ara_role: 'wheel', ara_axle: axle, ara_side: side }));
  });
  children.push(nodes.push({ name: 'Seat driver', translation: [0.36, seat, -0.25], extras: { ara_role: 'seat_driver' } }) - 1);
  children.push(nodes.push({ name: 'Seat passenger', translation: [-0.36, seat, -0.25], extras: { ara_role: 'seat_passenger' } }) - 1);
  const root = nodes.push({ name: 'Box car', children }) - 1;
  const details = options.details === null ? undefined : { ...propDetails(), ...options.details };
  const json = {
    asset: { version: '2.0', generator: 'Ara test fixture' }, scene: 0, scenes: [{ nodes: [root] }], nodes, meshes, accessors, bufferViews: views,
    materials: [{ name: 'Paint', pbrMetallicRoughness: { baseColorFactor: [0.8, 0.2, 0.1, 1] }, extras: { ara_role: 'paint' } },
      { name: 'Tail', emissiveFactor: [1, 0, 0], extras: { ara_role: 'brake_light' } }, { name: 'Black', pbrMetallicRoughness: { baseColorFactor: [0.02, 0.02, 0.02, 1] } }],
    buffers: [{ byteLength: 0 }], ...(details ? { extras: { ara_prop: details } } : {}),
  };
  const pad = (4 - (length % 4)) % 4;
  if (pad) { chunks.push(new Uint8Array(pad));length += pad; }
  json.buffers[0].byteLength = length;
  let text = new TextEncoder().encode(JSON.stringify(json));
  text = Uint8Array.from([...text, ...new Array((4 - (text.length % 4)) % 4).fill(0x20)]);
  const out = new Uint8Array(28 + text.length + length), view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);view.setUint32(4, 2, true);view.setUint32(8, out.length, true);
  view.setUint32(12, text.length, true);view.setUint32(16, 0x4e4f534a, true);out.set(text, 20);
  view.setUint32(20 + text.length, length, true);view.setUint32(24 + text.length, 0x004e4942, true);
  let at = 28 + text.length;
  for (const c of chunks) { out.set(c, at);at += c.byteLength; }
  return out;
}
