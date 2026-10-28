/** Binary glTF 2.0 (.glb) writer with embedded textures. One primitive per material. */
import { MORPH_EPSILON, type MeshData } from '../core/mesh';
import { localTransform, quatOf, transpose, mulMV, type Rig } from '../core/rig/rig';
import type { BakedClip } from '../core/anim/evaluate';
import { hexToRgb, srgbToLinear } from '../core/math';

const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;
const FLOAT = 5126;
const UNSIGNED_SHORT = 5123;
const UNSIGNED_INT = 5125;

export const mimeOf = (file: string) => (file.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg');

/** `meshless`: skeleton + animations only (per-clip animation files). */
export function exportGLB(
  mesh: MeshData, name: string, textures: Map<string, Uint8Array>, rig?: Rig, clips: BakedClip[] = [], opts: { meshless?: boolean } = {},
): Uint8Array {
  const meshless = !!opts.meshless && !!rig;
  const chunks: Uint8Array[] = [];
  const bufferViews: object[] = [];
  const accessors: object[] = [];
  let offset = 0;

  const addView = (data: Uint8Array, target?: number) => {
    const pad = (4 - (offset % 4)) % 4;
    if (pad) {
      chunks.push(new Uint8Array(pad));
      offset += pad;
    }
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.byteLength, ...(target ? { target } : {}) });
    chunks.push(data);
    offset += data.byteLength;
    return bufferViews.length - 1;
  };
  const bytes = (a: ArrayBufferView) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);

  const vcount = mesh.positions.length / 3;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < vcount; i++)
    for (let k = 0; k < 3; k++) {
      const v = mesh.positions[i * 3 + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }

  const uvs = new Float32Array(mesh.uvs.length);
  for (let i = 0; i < mesh.uvs.length; i += 2) {
    uvs[i] = mesh.uvs[i];
    uvs[i + 1] = 1 - mesh.uvs[i + 1]; // glTF UV origin is top-left
  }

  const addAttr = (data: Float32Array, type: string, extra: object = {}) => {
    accessors.push({ bufferView: addView(bytes(data), ARRAY_BUFFER), componentType: FLOAT, count: vcount, type, ...extra });
    return accessors.length - 1;
  };
  const skinned = !!(rig && mesh.joints && mesh.weights);
  let primitives: object[] = [];
  const images: object[] = [];
  let materials: object[] = [];
  if (!meshless) {
    const POSITION = addAttr(mesh.positions, 'VEC3', { min, max });
    const NORMAL = addAttr(mesh.normals, 'VEC3');
    const TEXCOORD_0 = addAttr(uvs, 'VEC2');
    const attributes: Record<string, number> = { POSITION, NORMAL, TEXCOORD_0 };
    if (skinned) {
      accessors.push({ bufferView: addView(bytes(mesh.joints!), ARRAY_BUFFER), componentType: UNSIGNED_SHORT, count: vcount, type: 'VEC4' });
      attributes.JOINTS_0 = accessors.length - 1;
      attributes.WEIGHTS_0 = addAttr(mesh.weights!, 'VEC4');
    }

    // Facial blend shapes: one sparse accessor per shape (only the moved vertices), shared by all primitives.
    let targets: object[] | undefined;
    if (mesh.morphs) {
      targets = mesh.morphs.deltas.map((d) => {
        const idx: number[] = [], val: number[] = [];
        const lo = [0, 0, 0], hi = [0, 0, 0];
        for (let v = 0; v < vcount; v++) {
          const x = d[v * 3], y = d[v * 3 + 1], z = d[v * 3 + 2];
          if (Math.abs(x) < MORPH_EPSILON && Math.abs(y) < MORPH_EPSILON && Math.abs(z) < MORPH_EPSILON) continue;
          idx.push(v);
          val.push(x, y, z);
          [x, y, z].forEach((c, k) => ((lo[k] = Math.min(lo[k], c)), (hi[k] = Math.max(hi[k], c))));
        }
        const acc: Record<string, unknown> = { componentType: FLOAT, count: vcount, type: 'VEC3', min: lo, max: hi };
        if (idx.length)
          acc.sparse = {
            count: idx.length,
            indices: { bufferView: addView(bytes(Uint32Array.from(idx))), componentType: UNSIGNED_INT },
            values: { bufferView: addView(bytes(Float32Array.from(val))) },
          };
        accessors.push(acc); // no bufferView: zeros, overridden by the sparse values
        return { POSITION: accessors.length - 1 };
      });
    }

    const small = vcount < 65536;
    primitives = mesh.groups.map((g) => {
      const idx = small ? Uint16Array.from(g.indices) : g.indices;
      accessors.push({
        bufferView: addView(bytes(idx), ELEMENT_ARRAY_BUFFER),
        componentType: small ? UNSIGNED_SHORT : UNSIGNED_INT,
        count: g.indices.length,
        type: 'SCALAR',
      });
      return { attributes, indices: accessors.length - 1, material: g.material, mode: 4, ...(targets ? { targets } : {}) };
    });

    // Images / textures
    const texIndex = new Map<string, number>();
    const tex = (file?: string) => {
      if (!file) return undefined;
      const data = textures.get(file);
      if (!data) return undefined;
      let i = texIndex.get(file);
      if (i === undefined) {
        images.push({ name: file, mimeType: mimeOf(file), bufferView: addView(data) });
        i = images.length - 1;
        texIndex.set(file, i);
      }
      return { index: i };
    };

    materials = mesh.materials.map((m) => {
      const base = tex(m.map);
      const normal = tex(m.normalMap);
      const rough = tex(m.roughnessMap);
      return {
        name: m.name,
        pbrMetallicRoughness: {
          baseColorFactor: [...hexToRgb(m.color).map(srgbToLinear), m.opacity ?? 1],
          metallicFactor: m.metalness,
          roughnessFactor: rough ? 1 : m.roughness,
          ...(base ? { baseColorTexture: base } : {}),
          ...(rough ? { metallicRoughnessTexture: rough } : {}),
        },
        ...(normal ? { normalTexture: normal } : {}),
        ...(m.emissive ? { emissiveFactor: hexToRgb(m.emissive).map(srgbToLinear) } : {}),
        ...(m.alpha === 'mask' ? { alphaMode: 'MASK', alphaCutoff: 0.5 } : m.alpha === 'blend' ? { alphaMode: 'BLEND' } : {}),
        ...(m.doubleSided ? { doubleSided: true } : {}),
      };
    });

  }

  // Skeleton: node 0 = mesh, node 1 = "Armature", bones from node 2.
  const nodes: object[] = [meshless ? { name } : { name, mesh: 0, ...(skinned ? { skin: 0 } : {}) }];
  const sceneNodes = [0];
  let skins: object[] | undefined;
  const animations: object[] = [];
  if (skinned && rig) {
    const B = rig.bones;
    const first = 2;
    const roots = B.map((b, i) => (b.parent < 0 ? first + i : -1)).filter((i) => i >= 0);
    nodes.push({ name: 'Armature', children: roots });
    sceneNodes.push(1);
    B.forEach((b, i) => {
      const { t, R } = localTransform(B, i);
      const children = B.map((c, k) => (c.parent === i ? first + k : -1)).filter((k) => k >= 0);
      nodes.push({ name: b.name, translation: t, rotation: quatOf(R), ...(children.length ? { children } : {}) });
    });
    const ibm = new Float32Array(B.length * 16);
    B.forEach((b, i) => {
      const Rt = transpose(b.rot);
      const t = mulMV(Rt, b.head).map((x) => -x);
      ibm.set([Rt[0], Rt[1], Rt[2], 0, Rt[3], Rt[4], Rt[5], 0, Rt[6], Rt[7], Rt[8], 0, t[0], t[1], t[2], 1], i * 16);
    });
    accessors.push({ bufferView: addView(bytes(ibm)), componentType: FLOAT, count: B.length, type: 'MAT4' });
    skins = [{ name: 'Armature', joints: B.map((_, i) => first + i), inverseBindMatrices: accessors.length - 1, skeleton: roots[0] }];

    // Animations: one glTF animation per clip, rotation channels per bone + root translation.
    for (const c of clips) {
      const times = Float32Array.from(c.times);
      accessors.push({ bufferView: addView(bytes(times)), componentType: FLOAT, count: times.length, type: 'SCALAR', min: [times[0]], max: [times[times.length - 1]] });
      const input = accessors.length - 1;
      const samplers: object[] = [], channels: object[] = [];
      B.forEach((_, i) => {
        const q = new Float32Array(c.frames.length * 4);
        c.frames.forEach((f, k) => q.set(f.rot[i], k * 4));
        accessors.push({ bufferView: addView(bytes(q)), componentType: FLOAT, count: c.frames.length, type: 'VEC4' });
        samplers.push({ input, output: accessors.length - 1, interpolation: 'LINEAR' });
        channels.push({ sampler: samplers.length - 1, target: { node: first + i, path: 'rotation' } });
        if (B[i].parent < 0) {
          const t = new Float32Array(c.frames.length * 3);
          c.frames.forEach((f, k) => t.set(f.rootPos.get(i)!, k * 3));
          accessors.push({ bufferView: addView(bytes(t)), componentType: FLOAT, count: c.frames.length, type: 'VEC3' });
          samplers.push({ input, output: accessors.length - 1, interpolation: 'LINEAR' });
          channels.push({ sampler: samplers.length - 1, target: { node: first + i, path: 'translation' } });
        }
      });
      // Facial blend-shape weights, one value per shape per frame.
      if (mesh.morphs && !meshless && c.frames[0]?.morph) {
        const n = mesh.morphs.names.length;
        const w = new Float32Array(c.frames.length * n);
        c.frames.forEach((f, k) => w.set(f.morph!, k * n));
        accessors.push({ bufferView: addView(bytes(w)), componentType: FLOAT, count: w.length, type: 'SCALAR' });
        samplers.push({ input, output: accessors.length - 1, interpolation: 'LINEAR' });
        channels.push({ sampler: samplers.length - 1, target: { node: 0, path: 'weights' } });
      }
      animations.push({ name: c.name, samplers, channels });
    }
  }
  const json = {
    asset: { version: '2.0', generator: 'Ara 3D Gen character generator' },
    scene: 0,
    scenes: [{ name: 'Scene', nodes: sceneNodes }],
    nodes,
    ...(skins ? { skins } : {}),
    ...(animations.length ? { animations } : {}),
    ...(meshless
      ? {}
      : {
          meshes: [{
            name, primitives,
            ...(mesh.morphs ? { weights: mesh.morphs.defaults, extras: { targetNames: mesh.morphs.names } } : {}),
          }],
          materials,
        }),
    ...(images.length && !meshless
      ? {
          images,
          samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
          textures: images.map((_, i) => ({ sampler: 0, source: i })),
        }
      : {}),
    accessors,
    bufferViews,
    buffers: [{ byteLength: offset }],
  };

  const binPad = (4 - (offset % 4)) % 4;
  const bin = new Uint8Array(offset + binPad);
  let o = 0;
  for (const c of chunks) {
    bin.set(c, o);
    o += c.byteLength;
  }
  let jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  if (jsonPad) {
    const padded = new Uint8Array(jsonBytes.length + jsonPad).fill(0x20);
    padded.set(jsonBytes);
    jsonBytes = padded;
  }

  const total = 12 + 8 + jsonBytes.length + 8 + bin.length;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); // "glTF"
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.length, true);
  dv.setUint32(16, 0x4e4f534a, true); // "JSON"
  out.set(jsonBytes, 20);
  const b = 20 + jsonBytes.length;
  dv.setUint32(b, bin.length, true);
  dv.setUint32(b + 4, 0x004e4942, true); // "BIN\0"
  out.set(bin, b + 8);
  return out;
}
