/**
 * Binary FBX 7.4 writer (the format Unity, Unreal, Blender, Maya and 3ds Max
 * all read). Writes a single mesh with per-polygon materials, in centimetres.
 */
import { zlibSync } from 'fflate';
import { MORPH_EPSILON, type MeshData } from '../core/mesh';
import { hexToRgb, srgbToLinear } from '../core/math';
import { localTransform, mulMV, transpose, type Mat3, type Rig } from '../core/rig/rig';
import type { BakedClip } from '../core/anim/evaluate';
import { qToEulerXYZ } from '../core/anim/quat';

// --- Low-level node tree -----------------------------------------------------

type Prop =
  | { t: 'C'; v: boolean }
  | { t: 'I'; v: number }
  | { t: 'L'; v: number }
  | { t: 'D'; v: number }
  | { t: 'S'; v: string }
  | { t: 'R'; v: Uint8Array }
  | { t: 'i'; v: Int32Array }
  | { t: 'd'; v: Float64Array }
  | { t: 'f'; v: Float32Array }
  | { t: 'l'; v: BigInt64Array };

const C = (v: boolean): Prop => ({ t: 'C', v });
const I = (v: number): Prop => ({ t: 'I', v });
const L = (v: number): Prop => ({ t: 'L', v });
const D = (v: number): Prop => ({ t: 'D', v });
const S = (v: string): Prop => ({ t: 'S', v });
const R = (v: Uint8Array): Prop => ({ t: 'R', v });
const Ai = (v: Int32Array | number[]): Prop => ({ t: 'i', v: v instanceof Int32Array ? v : Int32Array.from(v) });
const Ad = (v: Float64Array | number[]): Prop => ({ t: 'd', v: v instanceof Float64Array ? v : Float64Array.from(v) });
const Af = (v: number[]): Prop => ({ t: 'f', v: Float32Array.from(v) });
const Al = (v: number[]): Prop => ({ t: 'l', v: BigInt64Array.from(v.map((x) => BigInt(Math.round(x)))) });

interface FbxNode {
  name: string;
  props: Prop[];
  children: FbxNode[];
}
const N = (name: string, props: Prop[] = [], children: FbxNode[] = []): FbxNode => ({ name, props, children });

/** Properties70 entry. */
const P = (name: string, type: string, label: string, flags: string, ...values: Prop[]): FbxNode =>
  N('P', [S(name), S(type), S(label), S(flags), ...values]);

class ByteWriter {
  private buf = new Uint8Array(1 << 16);
  private dv = new DataView(this.buf.buffer);
  len = 0;
  private ensure(n: number) {
    if (this.len + n <= this.buf.length) return;
    let cap = this.buf.length * 2;
    while (cap < this.len + n) cap *= 2;
    const nb = new Uint8Array(cap);
    nb.set(this.buf.subarray(0, this.len));
    this.buf = nb;
    this.dv = new DataView(nb.buffer);
  }
  u8(v: number) { this.ensure(1); this.dv.setUint8(this.len, v); this.len += 1; }
  u32(v: number) { this.ensure(4); this.dv.setUint32(this.len, v, true); this.len += 4; }
  i32(v: number) { this.ensure(4); this.dv.setInt32(this.len, v, true); this.len += 4; }
  i64(v: number) { this.ensure(8); this.dv.setBigInt64(this.len, BigInt(Math.round(v)), true); this.len += 8; }
  f64(v: number) { this.ensure(8); this.dv.setFloat64(this.len, v, true); this.len += 8; }
  bytes(b: Uint8Array) { this.ensure(b.length); this.buf.set(b, this.len); this.len += b.length; }
  zeros(n: number) { this.ensure(n); this.buf.fill(0, this.len, this.len + n); this.len += n; }
  patchU32(pos: number, v: number) { this.dv.setUint32(pos, v, true); }
  result() { return this.buf.slice(0, this.len); }
}

const enc = new TextEncoder();

function writeProp(w: ByteWriter, p: Prop) {
  w.u8(p.t.charCodeAt(0));
  switch (p.t) {
    case 'C': w.u8(p.v ? 1 : 0); break;
    case 'I': w.i32(p.v); break;
    case 'L': w.i64(p.v); break;
    case 'D': w.f64(p.v); break;
    case 'S': case 'R': {
      const b = typeof p.v === 'string' ? enc.encode(p.v) : p.v;
      w.u32(b.length);
      w.bytes(b);
      break;
    }
    case 'i': case 'd': case 'f': case 'l': {
      const raw = new Uint8Array(p.v.buffer, p.v.byteOffset, p.v.byteLength);
      const compress = p.v.length > 64;
      const data = compress ? zlibSync(raw) : raw;
      w.u32(p.v.length);
      w.u32(compress ? 1 : 0);
      w.u32(data.length);
      w.bytes(data);
      break;
    }
  }
}

const SENTINEL = 13; // null record length for FBX < 7.5

function writeNode(w: ByteWriter, n: FbxNode, isLast: boolean) {
  const start = w.len;
  w.u32(0); // end offset (patched)
  w.u32(n.props.length);
  w.u32(0); // property list length (patched)
  const name = enc.encode(n.name);
  w.u8(name.length);
  w.bytes(name);
  const ps = w.len;
  for (const p of n.props) writeProp(w, p);
  w.patchU32(start + 8, w.len - ps);
  if (n.children.length) {
    n.children.forEach((c, i) => writeNode(w, c, i === n.children.length - 1));
    w.zeros(SENTINEL);
  } else if (!n.props.length && !isLast) {
    w.zeros(SENTINEL);
  }
  w.patchU32(start, w.len);
}

const HEAD_MAGIC = enc.encode('Kaydara FBX Binary  \0\x1a\0');
// Fixed FileId / CreationTime / footer triple, as used by Blender's exporter.
const FILE_ID = new Uint8Array([0x28, 0xb3, 0x2a, 0xeb, 0xb6, 0x24, 0xcc, 0xc2, 0xbf, 0xc8, 0xb0, 0x2a, 0xa9, 0x2b, 0xfc, 0xf1]);
const CREATION_TIME = '1970-01-01 10:00:00:000';
const FOOT_ID = new Uint8Array([0xfa, 0xbc, 0xab, 0x09, 0xd0, 0xc8, 0xd4, 0x66, 0xb1, 0x76, 0xfb, 0x83, 0x1c, 0xf7, 0x26, 0x7e]);
const FOOT_MAGIC = new Uint8Array([0xf8, 0x5a, 0x8c, 0x6a, 0xde, 0xf5, 0xd9, 0x7e, 0xec, 0xe9, 0x0c, 0xe3, 0x75, 0x8f, 0x29, 0x0b]);
const VERSION = 7400;

function serialize(root: FbxNode[]): Uint8Array {
  const w = new ByteWriter();
  w.bytes(HEAD_MAGIC);
  w.u32(VERSION);
  root.forEach((n, i) => writeNode(w, n, i === root.length - 1));
  w.zeros(SENTINEL);
  w.bytes(FOOT_ID);
  w.zeros(4);
  let pad = ((w.len + 15) & ~15) - w.len;
  if (pad === 0) pad = 16;
  w.zeros(pad);
  w.u32(VERSION);
  w.zeros(120);
  w.bytes(FOOT_MAGIC);
  return w.result();
}

// --- Scene -------------------------------------------------------------------

/** FBX object name: "Name\x00\x01Class" in binary files. */
const objName = (name: string, cls: string) => `${name}\x00\x01${cls}`;

const CM = 100; // metres -> centimetres

/** Column-major 4x4 from rotation + translation (cm). */
function mat4(R: Mat3, t: number[]): Float64Array {
  return Float64Array.from([R[0], R[1], R[2], 0, R[3], R[4], R[5], 0, R[6], R[7], R[8], 0, t[0], t[1], t[2], 1]);
}

/** Euler XYZ in degrees (R = Rz * Ry * Rx), FBX's default rotation order. */
function eulerXYZ(R: Mat3): [number, number, number] {
  const r20 = R[2], deg = 180 / Math.PI;
  if (Math.abs(r20) < 0.99999) {
    return [Math.atan2(R[5], R[8]) * deg, Math.asin(-r20) * deg, Math.atan2(R[1], R[0]) * deg];
  }
  return [Math.atan2(-R[7], R[4]) * deg, (r20 < 0 ? 90 : -90), 0];
}

const KTIME = 46186158000; // FBX time units per second

/**
 * `meshless`: skeleton + animation only (no geometry, materials or skin), for
 * per-clip animation files (Unity's model@clip convention).
 */
export function exportFBX(
  mesh: MeshData, name: string, textures: Map<string, Uint8Array>, rig?: Rig, clips: BakedClip[] = [], opts: { meshless?: boolean } = {},
): Uint8Array {
  const meshless = !!opts.meshless && !!rig;
  let nextId = 1_000_000;
  const id = () => nextId++;
  const geomId = id(), modelId = id(), docId = id();
  const matIds = mesh.materials.map(() => id());

  // Geometry: original polygons (quads), in group (material) order.
  const corners: number[] = [];
  const sizes: number[] = [];
  const polyMat: number[] = [];
  for (const g of mesh.groups) {
    for (const v of g.polyIndices) corners.push(v);
    for (const n of g.polySizes) {
      sizes.push(n);
      polyMat.push(g.material);
    }
  }
  const vertices = new Float64Array(mesh.positions.length);
  for (let i = 0; i < vertices.length; i++) vertices[i] = mesh.positions[i] * CM;
  const pvi = new Int32Array(corners.length);
  const normals = new Float64Array(corners.length * 3);
  for (let p = 0, c = 0; p < sizes.length; p++) {
    for (let k = 0; k < sizes[p]; k++, c++) {
      const v = corners[c];
      pvi[c] = k === sizes[p] - 1 ? -v - 1 : v; // last vertex of each polygon is bit-negated
      normals[c * 3] = mesh.normals[v * 3];
      normals[c * 3 + 1] = mesh.normals[v * 3 + 1];
      normals[c * 3 + 2] = mesh.normals[v * 3 + 2];
    }
  }

  const layerEl = (type: string, children: FbxNode[]) => N(type, [I(0)], children);
  const geometry = N('Geometry', [L(geomId), S(objName(name, 'Geometry')), S('Mesh')], [
    N('Properties70'),
    N('GeometryVersion', [I(124)]),
    N('Vertices', [Ad(vertices)]),
    N('PolygonVertexIndex', [Ai(pvi)]),
    layerEl('LayerElementNormal', [
      N('Version', [I(101)]),
      N('Name', [S('')]),
      N('MappingInformationType', [S('ByPolygonVertex')]),
      N('ReferenceInformationType', [S('Direct')]),
      N('Normals', [Ad(normals)]),
    ]),
    layerEl('LayerElementUV', [
      N('Version', [I(101)]),
      N('Name', [S('UVMap')]),
      N('MappingInformationType', [S('ByPolygonVertex')]),
      N('ReferenceInformationType', [S('IndexToDirect')]),
      N('UV', [Ad(Float64Array.from(mesh.uvs))]),
      N('UVIndex', [Ai(Int32Array.from(corners))]),
    ]),
    layerEl('LayerElementMaterial', [
      N('Version', [I(101)]),
      N('Name', [S('')]),
      N('MappingInformationType', [S('ByPolygon')]),
      N('ReferenceInformationType', [S('IndexToDirect')]),
      N('Materials', [Ai(polyMat)]),
    ]),
    N('Layer', [I(0)], [
      N('Version', [I(100)]),
      N('LayerElement', [], [N('Type', [S('LayerElementNormal')]), N('TypedIndex', [I(0)])]),
      N('LayerElement', [], [N('Type', [S('LayerElementMaterial')]), N('TypedIndex', [I(0)])]),
      N('LayerElement', [], [N('Type', [S('LayerElementUV')]), N('TypedIndex', [I(0)])]),
    ]),
  ]);

  const model = N('Model', [L(modelId), S(objName(name, 'Model')), S('Mesh')], [
    N('Version', [I(232)]),
    N('Properties70', [], [
      P('Lcl Translation', 'Lcl Translation', '', 'A', D(0), D(0), D(0)),
      P('Lcl Rotation', 'Lcl Rotation', '', 'A', D(0), D(0), D(0)),
      P('Lcl Scaling', 'Lcl Scaling', '', 'A', D(1), D(1), D(1)),
      P('DefaultAttributeIndex', 'int', 'Integer', '', I(0)),
      P('InheritType', 'enum', '', '', I(1)),
    ]),
    N('MultiLayer', [I(0)]),
    N('MultiTake', [I(0)]),
    N('Shading', [C(true)]),
    N('Culling', [S('CullingOff')]),
  ]);

  const materials = mesh.materials.map((m, i) => {
    const [r, g, b] = hexToRgb(m.color).map(srgbToLinear);
    const shininess = (1 - m.roughness) ** 2 * 100 + 2;
    const spec = 0.04 + m.metalness * 0.5;
    return N('Material', [L(matIds[i]), S(objName(m.name, 'Material')), S('')], [
      N('Version', [I(102)]),
      N('ShadingModel', [S('Phong')]),
      N('MultiLayer', [I(0)]),
      N('Properties70', [], [
        ...(() => {
          const [er, eg, eb] = m.emissive ? hexToRgb(m.emissive).map(srgbToLinear) : [0, 0, 0];
          return [P('EmissiveColor', 'Color', '', 'A', D(er), D(eg), D(eb)), P('EmissiveFactor', 'Number', '', 'A', D(m.emissive ? 1 : 0))];
        })(),
        P('AmbientColor', 'Color', '', 'A', D(0), D(0), D(0)),
        P('DiffuseColor', 'Color', '', 'A', D(r), D(g), D(b)),
        P('DiffuseFactor', 'Number', '', 'A', D(1)),
        P('SpecularColor', 'Color', '', 'A', D(spec), D(spec), D(spec)),
        P('SpecularFactor', 'Number', '', 'A', D(1)),
        P('ShininessExponent', 'Number', '', 'A', D(shininess)),
        P('ReflectionFactor', 'Number', '', 'A', D(m.metalness)),
        P('Opacity', 'Number', '', 'A', D(m.opacity ?? 1)),
        P('TransparencyFactor', 'Number', '', 'A', D(1 - (m.opacity ?? 1))),
      ]),
    ]);
  });

  // Embedded textures: one Video (holds the bytes) + one Texture per file.
  const texObjs: FbxNode[] = [];
  const texConn: FbxNode[] = [];
  const texIds = new Map<string, number>();
  const texture = (file: string) => {
    let tid = texIds.get(file);
    if (tid !== undefined) return tid;
    const data = textures.get(file);
    if (!data) return undefined;
    const vid = id();
    tid = id();
    texIds.set(file, tid);
    const stem = file.replace(/\.[^.]+$/, '');
    const rel = `textures/${file}`;
    texObjs.push(
      N('Video', [L(vid), S(objName(stem, 'Video')), S('Clip')], [
        N('Type', [S('Clip')]),
        N('Properties70', [], [P('Path', 'KString', 'XRefUrl', '', S(rel))]),
        N('UseMipMap', [I(0)]),
        N('Filename', [S(rel)]),
        N('RelativeFilename', [S(rel)]),
        N('Content', [R(data)]),
      ]),
      N('Texture', [L(tid), S(objName(stem, 'Texture')), S('')], [
        N('Type', [S('TextureVideoClip')]),
        N('Version', [I(202)]),
        N('TextureName', [S(objName(stem, 'Texture'))]),
        N('Properties70', [], [P('UseMaterial', 'bool', '', '', I(1))]),
        N('Media', [S(objName(stem, 'Video'))]),
        N('FileName', [S(rel)]),
        N('RelativeFilename', [S(rel)]),
        N('ModelUVTranslation', [D(0), D(0)]),
        N('ModelUVScaling', [D(1), D(1)]),
        N('Texture_Alpha_Source', [S('None')]),
        N('Cropping', [I(0), I(0), I(0), I(0)]),
      ]),
    );
    texConn.push(N('C', [S('OO'), L(vid), L(tid)]));
    return tid;
  };
  mesh.materials.forEach((m, i) => {
    const link = (file: string | undefined, prop: string) => {
      const t = file ? texture(file) : undefined;
      if (t !== undefined) texConn.push(N('C', [S('OP'), L(t), L(matIds[i]), S(prop)]));
    };
    link(m.map, 'DiffuseColor');
    if (m.alpha !== 'opaque') link(m.map, 'TransparentColor');
    link(m.normalMap, 'NormalMap');
  });
  const videoCount = texObjs.length / 2;

  // --- Skeleton + skin -----------------------------------------------------------
  const rigObjs: FbxNode[] = [];
  const rigConn: FbxNode[] = [];
  let boneCount = 0, deformerCount = 0, attrCount = 0, curveNodeCount = 0, curveCount = 0;
  const animStacks: { name: string; stop: number }[] = [];

  // --- Facial blend shapes: BlendShape deformer -> one channel per shape -> sparse Shape geometry ---
  let shapeCount = 0, blendDeformers = 0;
  const channelIds: number[] = [];
  if (mesh.morphs && !meshless) {
    const bsId = id();
    rigObjs.push(N('Deformer', [L(bsId), S(objName('Face', 'Deformer')), S('BlendShape')], [N('Version', [I(100)])]));
    rigConn.push(N('C', [S('OO'), L(bsId), L(geomId)]));
    blendDeformers = 1;
    mesh.morphs.deltas.forEach((d, s) => {
      const shapeName = mesh.morphs!.names[s];
      const idx: number[] = [], val: number[] = [];
      for (let v = 0; v < d.length / 3; v++) {
        if (Math.abs(d[v * 3]) < MORPH_EPSILON && Math.abs(d[v * 3 + 1]) < MORPH_EPSILON && Math.abs(d[v * 3 + 2]) < MORPH_EPSILON) continue;
        idx.push(v);
        val.push(d[v * 3] * CM, d[v * 3 + 1] * CM, d[v * 3 + 2] * CM);
      }
      const chId = id(), shId = id();
      channelIds.push(chId);
      rigObjs.push(
        N('Deformer', [L(chId), S(objName(shapeName, 'SubDeformer')), S('BlendShapeChannel')], [
          N('Version', [I(100)]),
          N('DeformPercent', [D(mesh.morphs!.defaults[s] * 100)]),
          N('FullWeights', [Ad([100])]),
          N('Properties70', [], [P('DeformPercent', 'Number', '', 'A', D(mesh.morphs!.defaults[s] * 100))]),
        ]),
        N('Geometry', [L(shId), S(objName(shapeName, 'Geometry')), S('Shape')], [
          N('Version', [I(100)]),
          N('Indexes', [Ai(idx)]),
          N('Vertices', [Ad(val)]),
          N('Normals', [Ad(new Array(val.length).fill(0))]),
        ]),
      );
      rigConn.push(N('C', [S('OO'), L(chId), L(bsId)]), N('C', [S('OO'), L(shId), L(chId)]));
      shapeCount++;
    });
  }
  if (rig && mesh.joints && mesh.weights) {
    const B = rig.bones;
    const armId = id(), armAttr = id(), skinId = id(), poseId = id();
    const boneIds = B.map(() => id()), attrIds = B.map(() => id());
    const lcl = (t: number[], r: number[]) => [
      P('Lcl Translation', 'Lcl Translation', '', 'A', D(t[0]), D(t[1]), D(t[2])),
      P('Lcl Rotation', 'Lcl Rotation', '', 'A', D(r[0]), D(r[1]), D(r[2])),
      P('Lcl Scaling', 'Lcl Scaling', '', 'A', D(1), D(1), D(1)),
      P('DefaultAttributeIndex', 'int', 'Integer', '', I(0)),
      P('InheritType', 'enum', '', '', I(1)),
    ];
    rigObjs.push(
      N('NodeAttribute', [L(armAttr), S(objName('Armature', 'NodeAttribute')), S('Null')], [N('TypeFlags', [S('Null')])]),
      N('Model', [L(armId), S(objName('Armature', 'Model')), S('Null')], [
        N('Version', [I(232)]), N('Properties70', [], lcl([0, 0, 0], [0, 0, 0])), N('Culling', [S('CullingOff')]),
      ]),
    );
    rigConn.push(N('C', [S('OO'), L(armId), L(0)]), N('C', [S('OO'), L(armAttr), L(armId)]));
    // Per-bone vertex lists for clusters.
    const idx: number[][] = B.map(() => []), wts: number[][] = B.map(() => []);
    for (let v = 0; v < mesh.joints.length / 4; v++)
      for (let k = 0; k < 4; k++) {
        const w = mesh.weights[v * 4 + k];
        if (w > 0) {
          idx[mesh.joints[v * 4 + k]].push(v);
          wts[mesh.joints[v * 4 + k]].push(w);
        }
      }
    const poseNodes: FbxNode[] = [N('PoseNode', [], [N('Node', [L(modelId)]), N('Matrix', [Ad(mat4([1, 0, 0, 0, 1, 0, 0, 0, 1], [0, 0, 0]))])])];
    if (!meshless) {
      rigObjs.push(N('Deformer', [L(skinId), S(objName(name, 'Deformer')), S('Skin')], [N('Version', [I(101)]), N('Link_DeformAcuracy', [D(50)])]));
      rigConn.push(N('C', [S('OO'), L(skinId), L(geomId)]));
      deformerCount = 1;
    }
    B.forEach((b, i) => {
      const { t, R } = localTransform(B, i);
      rigObjs.push(
        N('NodeAttribute', [L(attrIds[i]), S(objName(b.name, 'NodeAttribute')), S('LimbNode')], [
          N('Properties70', [], [P('Size', 'double', 'Number', '', D(3))]),
          N('TypeFlags', [S('Skeleton')]),
        ]),
        N('Model', [L(boneIds[i]), S(objName(b.name, 'Model')), S('LimbNode')], [
          N('Version', [I(232)]),
          N('Properties70', [], lcl(t.map((x) => x * CM), eulerXYZ(R))),
          N('MultiLayer', [I(0)]), N('MultiTake', [I(0)]), N('Shading', [C(true)]), N('Culling', [S('CullingOff')]),
        ]),
      );
      rigConn.push(
        N('C', [S('OO'), L(attrIds[i]), L(boneIds[i])]),
        N('C', [S('OO'), L(boneIds[i]), L(b.parent >= 0 ? boneIds[b.parent] : armId)]),
      );
      const world = mat4(b.rot, b.head.map((x) => x * CM));
      poseNodes.push(N('PoseNode', [], [N('Node', [L(boneIds[i])]), N('Matrix', [Ad(world)])]));
      if (idx[i].length && !meshless) {
        const cid = id();
        const Rt = transpose(b.rot);
        const inv = mat4(Rt, mulMV(Rt, b.head.map((x) => x * CM) as [number, number, number]).map((x) => -x));
        rigObjs.push(N('Deformer', [L(cid), S(objName(b.name, 'SubDeformer')), S('Cluster')], [
          N('Version', [I(100)]),
          N('UserData', [S(''), S('')]),
          N('Indexes', [Ai(idx[i])]),
          N('Weights', [Ad(wts[i])]),
          N('Transform', [Ad(inv)]),
          N('TransformLink', [Ad(world)]),
        ]));
        rigConn.push(N('C', [S('OO'), L(cid), L(skinId)]), N('C', [S('OO'), L(boneIds[i]), L(cid)]));
        deformerCount++;
      }
    });
    if (!meshless)
      rigObjs.push(N('Pose', [L(poseId), S(objName('BindPose', 'Pose')), S('BindPose')], [
        N('Type', [S('BindPose')]), N('Version', [I(100)]), N('NbPoseNodes', [I(poseNodes.length)]), ...poseNodes,
      ]));
    boneCount = B.length;
    attrCount = B.length + 1;

    // Animations: one AnimationStack (take) per clip; Euler XYZ rotation curves per bone, plus root translation.
    for (const c of clips) {
      const stackId = id(), layerId = id();
      const stop = c.times[c.times.length - 1] * KTIME;
      const keyTimes = c.times.map((t) => t * KTIME);
      rigObjs.push(
        N('AnimationStack', [L(stackId), S(objName(c.name, 'AnimStack')), S('')], [N('Properties70', [], [
          P('LocalStart', 'KTime', 'Time', '', L(0)), P('LocalStop', 'KTime', 'Time', '', L(stop)),
          P('ReferenceStart', 'KTime', 'Time', '', L(0)), P('ReferenceStop', 'KTime', 'Time', '', L(stop)),
        ])]),
        N('AnimationLayer', [L(layerId), S(objName('BaseLayer', 'AnimLayer')), S('')]),
      );
      rigConn.push(N('C', [S('OO'), L(layerId), L(stackId)]));
      animStacks.push({ name: c.name, stop });
      const curveNode = (owner: number, prop: string, short: string, values: number[][]) => {
        const nodeId = id();
        rigObjs.push(N('AnimationCurveNode', [L(nodeId), S(objName(short, 'AnimCurveNode')), S('')], [N('Properties70', [], [
          P('d|X', 'Number', '', 'A', D(values[0][0])), P('d|Y', 'Number', '', 'A', D(values[0][1])), P('d|Z', 'Number', '', 'A', D(values[0][2])),
        ])]));
        rigConn.push(N('C', [S('OO'), L(nodeId), L(layerId)]), N('C', [S('OP'), L(nodeId), L(owner), S(prop)]));
        ['X', 'Y', 'Z'].forEach((axis, a) => {
          const cid = id();
          rigObjs.push(N('AnimationCurve', [L(cid), S(objName('', 'AnimCurve')), S('')], [
            N('Default', [D(values[0][a])]),
            N('KeyVer', [I(4009)]),
            N('KeyTime', [Al(keyTimes)]),
            N('KeyValueFloat', [Af(values.map((v) => v[a]))]),
            N('KeyAttrFlags', [Ai([24836])]),
            N('KeyAttrDataFloat', [Af([0, 0, 9.419963346924634e-30, 0])]),
            N('KeyAttrRefCount', [Ai([values.length])]),
          ]));
          rigConn.push(N('C', [S('OP'), L(cid), L(nodeId), S(`d|${axis}`)]));
          curveCount++;
        });
        curveNodeCount++;
      };
      B.forEach((b, i) => {
        // Euler angles, unwrapped so curves stay continuous.
        const eul: number[][] = [];
        for (const f of c.frames) {
          const e = qToEulerXYZ(f.rot[i]);
          if (eul.length) {
            const p = eul[eul.length - 1];
            for (let k = 0; k < 3; k++) e[k] += Math.round((p[k] - e[k]) / 360) * 360;
          }
          eul.push([...e]);
        }
        curveNode(boneIds[i], 'Lcl Rotation', 'R', eul);
        if (b.parent < 0) curveNode(boneIds[i], 'Lcl Translation', 'T', c.frames.map((f) => f.rootPos.get(i)!.map((x) => x * CM)));
        if(c.frames.some(f=>f.scale?.has(i)))curveNode(boneIds[i],'Lcl Scaling','S',c.frames.map(f=>f.scale?.get(i)??[1,1,1]));
      });
      // Facial blend-shape weights (DeformPercent, 0..100) per channel.
      if (channelIds.length && c.frames[0]?.morph)
        channelIds.forEach((chId, s) => {
          const nodeId = id(), cid = id();
          const vals = c.frames.map((f) => f.morph![s] * 100);
          rigObjs.push(N('AnimationCurveNode', [L(nodeId), S(objName('DeformPercent', 'AnimCurveNode')), S('')], [N('Properties70', [], [
            P('d|DeformPercent', 'Number', '', 'A', D(vals[0])),
          ])]));
          rigConn.push(N('C', [S('OO'), L(nodeId), L(layerId)]), N('C', [S('OP'), L(nodeId), L(chId), S('DeformPercent')]));
          rigObjs.push(N('AnimationCurve', [L(cid), S(objName('', 'AnimCurve')), S('')], [
            N('Default', [D(vals[0])]),
            N('KeyVer', [I(4009)]),
            N('KeyTime', [Al(keyTimes)]),
            N('KeyValueFloat', [Af(vals)]),
            N('KeyAttrFlags', [Ai([24836])]),
            N('KeyAttrDataFloat', [Af([0, 0, 9.419963346924634e-30, 0])]),
            N('KeyAttrRefCount', [Ai([vals.length])]),
          ]));
          rigConn.push(N('C', [S('OP'), L(cid), L(nodeId), S('d|DeformPercent')]));
          curveNodeCount++;
          curveCount++;
        });
    }
  }

  const now = new Date();
  const root: FbxNode[] = [
    N('FBXHeaderExtension', [], [
      N('FBXHeaderVersion', [I(1003)]),
      N('FBXVersion', [I(VERSION)]),
      N('EncryptionType', [I(0)]),
      N('CreationTimeStamp', [], [
        N('Version', [I(1000)]),
        N('Year', [I(now.getFullYear())]),
        N('Month', [I(now.getMonth() + 1)]),
        N('Day', [I(now.getDate())]),
        N('Hour', [I(now.getHours())]),
        N('Minute', [I(now.getMinutes())]),
        N('Second', [I(now.getSeconds())]),
        N('Millisecond', [I(0)]),
      ]),
      N('Creator', [S('Ara 3D Gen character generator')]),
    ]),
    N('FileId', [R(FILE_ID)]),
    N('CreationTime', [S(CREATION_TIME)]),
    N('Creator', [S('Ara 3D Gen character generator')]),
    N('GlobalSettings', [], [
      N('Version', [I(1000)]),
      N('Properties70', [], [
        P('UpAxis', 'int', 'Integer', '', I(1)),
        P('UpAxisSign', 'int', 'Integer', '', I(1)),
        P('FrontAxis', 'int', 'Integer', '', I(2)),
        P('FrontAxisSign', 'int', 'Integer', '', I(1)),
        P('CoordAxis', 'int', 'Integer', '', I(0)),
        P('CoordAxisSign', 'int', 'Integer', '', I(1)),
        P('OriginalUpAxis', 'int', 'Integer', '', I(1)),
        P('OriginalUpAxisSign', 'int', 'Integer', '', I(1)),
        P('UnitScaleFactor', 'double', 'Number', '', D(1)),
        P('OriginalUnitScaleFactor', 'double', 'Number', '', D(1)),
        P('AmbientColor', 'ColorRGB', 'Color', '', D(0), D(0), D(0)),
        P('DefaultCamera', 'KString', '', '', S('Producer Perspective')),
        P('TimeMode', 'enum', '', '', I(6)), // 30 fps
        P('TimeSpanStart', 'KTime', 'Time', '', L(0)),
        P('TimeSpanStop', 'KTime', 'Time', '', L(Math.max(KTIME, ...animStacks.map((a) => a.stop)))),
        P('CustomFrameRate', 'double', 'Number', '', D(30)),
      ]),
    ]),
    N('Documents', [], [
      N('Count', [I(1)]),
      N('Document', [L(docId), S('Scene'), S('Scene')], [
        N('Properties70', [], [
          P('SourceObject', 'object', '', ''),
          P('ActiveAnimStackName', 'KString', '', '', S('')),
        ]),
        N('RootNode', [L(0)]),
      ]),
    ]),
    N('References'),
    N('Definitions', [], [
      N('Version', [I(100)]),
      N('Count', [I((meshless ? 1 : 3 + mesh.materials.length + videoCount * 2) + (boneCount ? boneCount + 1 + attrCount + deformerCount + (meshless ? 0 : 1) : 0) + blendDeformers + shapeCount * 2 + animStacks.length * 2 + curveNodeCount + curveCount)]),
      N('ObjectType', [S('GlobalSettings')], [N('Count', [I(1)])]),
      N('ObjectType', [S('Model')], [N('Count', [I((meshless ? 0 : 1) + (boneCount ? boneCount + 1 : 0))])]),
      ...(boneCount ? [N('ObjectType', [S('NodeAttribute')], [N('Count', [I(attrCount)])])] : []),
      ...(!meshless && deformerCount + blendDeformers + shapeCount ? [N('ObjectType', [S('Deformer')], [N('Count', [I(deformerCount + blendDeformers + shapeCount)])])] : []),
      ...(boneCount && !meshless ? [N('ObjectType', [S('Pose')], [N('Count', [I(1)])])] : []),
      ...(animStacks.length
        ? [
            N('ObjectType', [S('AnimationStack')], [N('Count', [I(animStacks.length)])]),
            N('ObjectType', [S('AnimationLayer')], [N('Count', [I(animStacks.length)])]),
            N('ObjectType', [S('AnimationCurveNode')], [N('Count', [I(curveNodeCount)])]),
            N('ObjectType', [S('AnimationCurve')], [N('Count', [I(curveCount)])]),
          ]
        : []),
      ...(meshless ? [] : [
        N('ObjectType', [S('Geometry')], [N('Count', [I(1 + shapeCount)])]),
        N('ObjectType', [S('Material')], [N('Count', [I(mesh.materials.length)])]),
      ]),
      ...(videoCount && !meshless
        ? [
            N('ObjectType', [S('Texture')], [N('Count', [I(videoCount)])]),
            N('ObjectType', [S('Video')], [N('Count', [I(videoCount)])]),
          ]
        : []),
    ]),
    N('Objects', [], meshless ? rigObjs : [geometry, model, ...materials, ...texObjs, ...rigObjs]),
    N('Connections', [], meshless ? rigConn : [
      N('C', [S('OO'), L(modelId), L(0)]),
      N('C', [S('OO'), L(geomId), L(modelId)]),
      ...matIds.map((m) => N('C', [S('OO'), L(m), L(modelId)])),
      ...texConn,
      ...rigConn,
    ]),
    N('Takes', [], [
      N('Current', [S(animStacks[0]?.name ?? '')]),
      ...animStacks.map((a) => N('Take', [S(a.name)], [
        N('FileName', [S(`${a.name.replace(/[^a-zA-Z0-9]+/g, '_')}.tak`)]),
        N('LocalTime', [L(0), L(a.stop)]),
        N('ReferenceTime', [L(0), L(a.stop)]),
      ])),
    ]),
  ];
  return serialize(root);
}
