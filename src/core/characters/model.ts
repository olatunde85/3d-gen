/**
 * Characters from other tools: a rigged humanoid model (GLB/glTF or FBX, loaded with three.js) turned into an Ara
 * Character, its mesh, skeleton and face shapes in Ara's own form. Its matched bones take Ara's (Mixamo's) names and
 * Ara's bone frames, so every Ara animation and content pack plays on it, and the viewer, Studio and the GLB and FBX
 * exporters use it like a character built by Ara.
 *
 * The model is turned upright and facing +Z, measured in metres, stood on the floor and centred over its hips. Bones
 * Ara doesn't animate (hair, tails, accessories) are kept and follow their parents.
 */
import { BufferAttribute, DoubleSide, Matrix3, Vector3, type BufferGeometry, type Material as ThreeMaterial, type Mesh, type Object3D, type SkinnedMesh, type Texture } from 'three';
import type { Vec3 } from '../math';
import type { Character } from '../human';
import type { Material, MeshData, MeshGroup } from '../mesh';
import { DEFAULT_PARAMS, type HumanParams } from '../params';
import { placeBones, type Rig } from '../rig/rig';
import { boneMapFor, plainJointName } from '../anim/take-three';
import { qfromTo, qmul, qrot, type Q } from '../anim/quat';
import { FACE_SHAPE_NAMES } from '../face';

/** Bones of Ara's game rig that a model's bones can take the names of (Mixamo's names), beyond the animated ones. */
const RIG_NAMES = new Set([
  'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'HeadTop_End', 'Jaw',
  ...['Left', 'Right'].flatMap((s) => [
    'Eye', 'Shoulder', 'Arm', 'ForeArm', 'Hand', 'UpLeg', 'Leg', 'Foot', 'ToeBase', 'Toe_End',
    ...['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'].flatMap((f) => [1, 2, 3, 4].map((k) => `Hand${f}${k}`)),
  ].map((n) => s + n)),
]);
/** Joints Ara adds or uses for props; a model bone with one of these names is renamed so it can't be mistaken. */
const RESERVED = /^(WeaponR|Parcel|Broom|BagL|Phone|Camera|Dumbbell[LR]|Kettlebell|Barbell)$/;
/** Character Creator (CC4) face shapes for Ara's, first set found wins; a set's shapes are added together. */
const FACE_ALIASES: Record<string, string[][]> = {
  eyeBlinkLeft: [['Eye_Blink_L']], eyeBlinkRight: [['Eye_Blink_R']], eyeWideLeft: [['Eye_Wide_L']], eyeWideRight: [['Eye_Wide_R']],
  eyeSquintLeft: [['Eye_Squint_L']], eyeSquintRight: [['Eye_Squint_R']], browDownLeft: [['Brow_Drop_L']], browDownRight: [['Brow_Drop_R']],
  browInnerUp: [['Brow_Raise_Inner_L', 'Brow_Raise_Inner_R']], browOuterUpLeft: [['Brow_Raise_Outer_L']], browOuterUpRight: [['Brow_Raise_Outer_R']],
  jawOpen: [['Jaw_Open']], mouthSmile: [['Mouth_Smile_L', 'Mouth_Smile_R']], mouthFrown: [['Mouth_Frown_L', 'Mouth_Frown_R']],
  mouthPucker: [['Mouth_Pucker_Up_L', 'Mouth_Pucker_Up_R', 'Mouth_Pucker_Down_L', 'Mouth_Pucker_Down_R'], ['Mouth_Pucker']],
  mouthPress: [['Mouth_Press_L', 'Mouth_Press_R']], mouthStretch: [['Mouth_Stretch_L', 'Mouth_Stretch_R']],
  noseSneerLeft: [['Nose_Sneer_L']], noseSneerRight: [['Nose_Sneer_R']], mouthUpperUp: [['Mouth_Up_Upper_L', 'Mouth_Up_Upper_R']],
  viseme_PP: [['V_Explosive']], viseme_FF: [['V_Dental_Lip']], viseme_TH: [['V_Tongue_Out']], viseme_DD: [['V_Tongue_up']], viseme_kk: [['V_Tongue_Raise']],
  viseme_CH: [['V_Affricate']], viseme_SS: [['V_Tight']], viseme_nn: [['V_Tongue_up']], viseme_RR: [['V_Tight_O']], viseme_aa: [['V_Open']],
  viseme_E: [['V_Wide']], viseme_I: [['V_Wide']], viseme_O: [['V_Tight_O']], viseme_U: [['V_Tight_O']],
};

/** Largest model file the converter takes, in bytes (the command line's limit; the website sets its own, lower one). */
export const MAX_MODEL_SIZE = 200e6;

export interface ModelOptions {
  /** The character's name (file names on export). */
  name: string;
  /**
   * Turns a texture into PNG or JPEG bytes (browsers draw it to a canvas); without it, textures are left out. `exact`:
   * a texture whose every value matters (a normal map, or colours with see-through parts), best kept lossless.
   */
  encodeTexture?: (texture: Texture, exact: boolean) => Promise<{ bytes: Uint8Array; type: 'png' | 'jpg' } | undefined>;
  /** Prefix for the texture names this character registers (unique per character). */
  textureKey: string;
  /** Joint name -> Ara bone name, for skeletons Ara doesn't recognise. */
  bones?: Record<string, string>;
  /** The file's format: glTF puts texture coordinates' origin at the top left, FBX (and Ara) at the bottom left. */
  format: 'gltf' | 'fbx';
  /** Reports each stage, for a loading message. */
  progress?: (label: string) => void;
}

export interface ImportedCharacter {
  character: Character;
  /** Textures to register with the asset library under these names, before the character is shown or exported. */
  textures: [string, Uint8Array][];
  /** What was found: bones, the ones Ara animates, face shapes and anything left out. */
  report: { bones: number; animated: number; faceShapes: string[]; restPose: 'A' | 'T'; height: number; notes: string[] };
}

const v3 = (v: Vector3): Vec3 => [v.x, v.y, v.z];
const isSkinned = (o: Object3D): o is SkinnedMesh => (o as SkinnedMesh).isSkinnedMesh === true;
const isMesh = (o: Object3D): o is Mesh => (o as Mesh).isMesh === true;

/** The rotation that stands a body up (+Y) with its left side towards +X, so it faces +Z (as Ara's characters do). */
function uprightRotation(up: Vec3, left: Vec3): Q {
  const axis = [0, 1, 2].reduce((a, d) => (Math.abs(up[d]) > Math.abs(up[a]) ? d : a), 0), vertical: Vec3 = [0, 0, 0];
  vertical[axis] = Math.sign(up[axis]) || 1;
  const stand = qfromTo(vertical, [0, 1, 0]), side = qrot(stand, left), h = Math.hypot(side[0], side[2]) || 1;
  return qmul(qfromTo([side[0] / h, 0, side[2] / h], [1, 0, 0]), stand);
}

/** A three.js colour as Ara's sRGB hex. */
const hex = (c?: { getHexString(): string }) => `#${c?.getHexString() ?? 'cccccc'}`;

/**
 * Turns a loaded model into an Ara character. Throws, saying what to do, for a model without a skeleton or one whose
 * skeleton can't drive a whole body.
 */
export async function characterFromModel(root: Object3D, options: ModelOptions): Promise<ImportedCharacter> {
  root.updateMatrixWorld(true);
  options.progress?.('Matching the skeleton');
  const notes: string[] = [];
  const skinned: SkinnedMesh[] = [], rigid: Mesh[] = [];
  root.traverse((o) => { if (!o.visible) return;if (isSkinned(o)) skinned.push(o);else if (isMesh(o)) rigid.push(o); });
  if (!skinned.length) throw Error('This model has no skeleton, so it can\'t be animated. Rig it first, for example with Mixamo\'s free auto-rigger (upload it at mixamo.com and download it as FBX), then open it again.');

  // Every bone of every skin, once: meshes can carry their own copies of the skeleton, merged by name. The model is
  // read as three.js shows it, in the pose it was saved in (its rest pose).
  const bones: Object3D[] = [], byBoneName = new Map<string, Object3D>(), same = new Map<Object3D, Object3D>();
  for (const mesh of skinned) for (const bone of mesh.skeleton.bones) {
    if (same.has(bone)) continue;
    const first = byBoneName.get(bone.name);
    if (first) { same.set(bone, first);continue; }
    byBoneName.set(bone.name, bone);same.set(bone, bone);bones.push(bone);
  }
  // The hierarchy goes by name: a bone's parent is the nearest bone above it with another name (copies of the
  // skeleton can be nested inside each other, Head under Head, as some FBX exports have), as its one shared copy.
  const parentOf = (b: Object3D) => { let p = b.parent;while (p && (!same.has(p) || p.name === b.name)) p = p.parent;return p ? same.get(p) : undefined; };
  const map = boneMapFor(bones.map((b) => b.name), options.bones, (name) => { const b = bones.find((x) => x.name === name);const p = b && parentOf(b);return p?.name; });
  const aranames = new Map<Object3D, string>(), used = new Set<string>();
  for (const b of bones) {
    const mapped = map[b.name] ?? (RIG_NAMES.has(plainJointName(b.name)) ? plainJointName(b.name) : undefined);
    if (mapped && !used.has(mapped)) { aranames.set(b, mapped);used.add(mapped); }
  }
  for (const b of bones) {
    if (aranames.has(b)) continue;
    let name = plainJointName(b.name) || 'Bone';
    if (RIG_NAMES.has(name) || RESERVED.test(name)) name = `${name}_model`;
    for (let n = 2; used.has(name); n++) name = `${plainJointName(b.name)}_${n}`;
    aranames.set(b, name);used.add(name);
  }

  // Stand it up, facing +Z, in metres, feet on the floor and centred over the hips.
  const at = (o: Object3D) => v3(new Vector3().setFromMatrixPosition(o.matrixWorld));
  const byName = (g: string) => bones.find((b) => aranames.get(b) === g)!;
  const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const turn = uprightRotation(sub(at(byName('Head')), at(byName('Hips'))), sub(at(byName('LeftUpLeg')), at(byName('RightUpLeg'))));
  const place = (p: Vec3) => qrot(turn, p);

  // The mesh: skinned meshes with their weights, and meshes fixed to a bone (glasses, hats) weighted to it.
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], joints: number[] = [], weights: number[] = [];
  const groups = new Map<number, number[]>(), materials: Material[] = [], textures: [string, Uint8Array][] = [];
  const morphs = new Map<string, Map<number, Vec3>>();
  const materialIndex = new Map<ThreeMaterial, number>(), textureNames = new Map<Texture, string>();
  const boneIndex = new Map<Object3D, number>(); // filled once the bones are ordered (below)
  const ordered: Object3D[] = [];
  const visit = (b: Object3D) => { ordered.push(b);for (const c of bones.filter((x) => parentOf(x) === b)) visit(c); };
  for (const b of bones.filter((x) => !parentOf(x))) visit(b);
  ordered.forEach((b, i) => boneIndex.set(b, i));

  async function textureName(texture: Texture | null | undefined, exact: boolean): Promise<string | undefined> {
    if (!texture || !options.encodeTexture) return undefined;
    if (textureNames.has(texture)) return textureNames.get(texture);
    const encoded = await options.encodeTexture(texture, exact).catch(() => undefined);
    if (!encoded) return undefined;
    const name = `${options.textureKey}-${textureNames.size}.${encoded.type}`;
    textureNames.set(texture, name);textures.push([name, encoded.bytes]);
    return name;
  }
  /** A material's index, or -1 for one that can never be seen (fully see-through without a texture, such as the
   * empty occlusion layers some tools put over the eyes): its surfaces are left out. */
  async function materialOf(m: ThreeMaterial): Promise<number> {
    if (materialIndex.has(m)) return materialIndex.get(m)!;
    const see = m as ThreeMaterial & { map?: Texture | null; alphaMap?: Texture | null };
    if (!m.visible || (!see.map && !see.alphaMap && (m.opacity <= 0.001 || (m.alphaTest > 0 && m.opacity < m.alphaTest)) && (m.transparent || m.alphaTest > 0))) { materialIndex.set(m, -1);return -1; }
    const s = m as ThreeMaterial & { color?: { getHexString(): string }; map?: Texture | null; normalMap?: Texture | null; roughness?: number; metalness?: number; shininess?: number; emissive?: { getHexString(): string; r: number; g: number; b: number }; alphaTest: number };
    const roughness = s.roughness ?? (s.shininess !== undefined ? Math.max(0.2, Math.min(1, 1 - Math.sqrt(s.shininess / 100))) : 0.8);
    const material: Material = {
      name: (m.name || `Material ${materials.length + 1}`).slice(0, 60), color: s.map ? '#ffffff' : hex(s.color), roughness, metalness: s.metalness ?? 0,
      alpha: m.transparent ? 'blend' : s.alphaTest > 0 ? 'mask' : 'opaque', doubleSided: m.side === DoubleSide,
      ...(s.emissive && s.emissive.r + s.emissive.g + s.emissive.b > 0.02 ? { emissive: hex(s.emissive) } : {}),
      ...(m.transparent && m.opacity < 1 ? { opacity: m.opacity } : {}),
    };
    // A texture keeps the material's tint, as three.js shows it.
    if (s.map && s.color && s.color.getHexString() !== 'ffffff') material.color = hex(s.color);
    const map = await textureName(s.map, material.alpha !== 'opaque'), normal = await textureName(s.normalMap, true);
    if (map) material.map = map;
    if (normal) material.normalMap = normal;
    materials.push(material);materialIndex.set(m, materials.length - 1);
    return materials.length - 1;
  }

  async function addMesh(mesh: Mesh, skin?: SkinnedMesh) {
    const g = mesh.geometry as BufferGeometry, pos = g.getAttribute('position'), nor = g.getAttribute('normal'), uv = g.getAttribute('uv');
    if (!pos) return;
    const base = positions.length / 3, world = mesh.matrixWorld, normalM = new Matrix3().getNormalMatrix(world);
    const holder = skin ? undefined : (() => { let p: Object3D | null = mesh.parent;while (p && !same.has(p)) p = p.parent;return p && same.get(p); })();
    const p = new Vector3(), n = new Vector3(), q = new Vector3();
    /** Where a point of the mesh (in its own space) shows in the world: skinned by its bones as displayed. */
    const shown = (i: number, local: Vector3) => (skin ? skin.applyBoneTransform(i, local) : local).applyMatrix4(world);
    for (let i = 0; i < pos.count; i++) {
      shown(i, p.fromBufferAttribute(pos, i));
      positions.push(...place(v3(p)));
      if (nor && skin) { shown(i, q.fromBufferAttribute(pos, i).addScaledVector(n.fromBufferAttribute(nor, i), 0.01));normals.push(...qrot(turn, v3(q.sub(p).normalize()))); }
      else if (nor) { n.fromBufferAttribute(nor, i).applyMatrix3(normalM).normalize();normals.push(...qrot(turn, v3(n))); } else normals.push(0, 1, 0);
      if (uv) uvs.push(uv.getX(i), options.format === 'gltf' ? 1 - uv.getY(i) : uv.getY(i));else uvs.push(0, 0);
      if (skin) {
        const si = g.getAttribute('skinIndex'), sw = g.getAttribute('skinWeight');
        let total = 0;
        const js: number[] = [], ws: number[] = [];
        for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k), b = skin.skeleton.bones[si.getComponent(i, k)], own = b && same.get(b);js.push(own ? boneIndex.get(own) ?? 0 : 0);ws.push(own ? w : 0);total += own ? w : 0; }
        joints.push(...js);weights.push(...ws.map((w) => (total > 0 ? w / total : 0)));
        if (total <= 0) { joints.splice(-4, 4, boneIndex.get(byName('Hips'))!, 0, 0, 0);weights.splice(-4, 4, 1, 0, 0, 0); }
      } else {
        joints.push(boneIndex.get(holder ?? byName('Hips'))!, 0, 0, 0);weights.push(1, 0, 0, 0);
      }
    }
    // Face shapes (morph targets), turned and scaled like the mesh. Shapes stored as positions become offsets.
    const dict = mesh.morphTargetDictionary, targets = g.morphAttributes.position;
    if (dict && targets) {
      const rest = new Vector3(), moved = new Vector3();
      for (const [name, t] of Object.entries(dict)) {
        const attr = targets[t] as BufferAttribute;
        const out = morphs.get(name) ?? new Map<number, Vec3>();
        for (let i = 0; i < attr.count; i++) {
          const d = new Vector3().fromBufferAttribute(attr, i);
          if (!g.morphTargetsRelative) d.sub(new Vector3().fromBufferAttribute(pos, i));
          if (d.lengthSq() < 1e-14) continue;
          // The offset as shown: the shape's point and the rest point, both skinned and placed.
          shown(i, rest.fromBufferAttribute(pos, i));shown(i, moved.fromBufferAttribute(pos, i).add(d));
          out.set(base + i, qrot(turn, v3(moved.sub(rest))));
        }
        morphs.set(name, out);
      }
    }
    // Triangles, by material.
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const index = g.getIndex(), count = index ? index.count : pos.count;
    const ranges = g.groups.length ? g.groups : [{ start: 0, count, materialIndex: 0 }];
    for (const r of ranges) {
      const mi = await materialOf(mats[r.materialIndex ?? 0] ?? mats[0]);
      if (mi < 0) continue;
      const list = groups.get(mi) ?? [];
      for (let k = r.start; k < Math.min(count, r.start + r.count); k++) list.push(base + (index ? index.getX(k) : k));
      groups.set(mi, list);
    }
  }
  let done = 0;
  for (const m of skinned) { options.progress?.(`Preparing the mesh and textures (${++done} of ${skinned.length})`);await addMesh(m, m); }
  for (const m of rigid) { let p: Object3D | null = m.parent;while (p && !same.has(p)) p = p.parent;if (p) await addMesh(m);else notes.push(`${m.name || 'A mesh'} isn't attached to the skeleton, so it was left out.`); }

  // Ground and centre: the lowest vertex on the floor, the hips over the origin.
  let low = Infinity;
  for (let i = 1; i < positions.length; i += 3) low = Math.min(low, positions[i]);
  const hips = place(at(byName('Hips'))), shift: Vec3 = [-hips[0], -low, -hips[2]];
  for (let i = 0; i < positions.length; i += 3) for (let d = 0; d < 3; d++) positions[i + d] += shift[d];
  let top = 0;
  for (let i = 1; i < positions.length; i += 3) top = Math.max(top, positions[i]);
  // Metres: tools write centimetres or other units; a model several metres tall is kept as it is (a giant stays one).
  const scale = top > 20 ? 0.01 : 1;
  if (scale !== 1) for (let i = 0; i < positions.length; i++) positions[i] *= scale;
  const placed = (o: Object3D): Vec3 => { const q = place(at(o));return [(q[0] + shift[0]) * scale, (q[1] + shift[1]) * scale, (q[2] + shift[2]) * scale]; };

  // The rig: Ara's bone frames (Y along the bone), from the joints' bind positions.
  const defs = ordered.map((b) => ({ name: aranames.get(b)!, parent: parentOf(b) ? aranames.get(parentOf(b)!)! : null, head: aranames.get(b)!, mh: [] as string[] }));
  const heads = new Map(ordered.map((b) => [aranames.get(b)!, placed(b)]));
  const rigBones = placeBones(defs, (name) => heads.get(name)!);
  const arm = (side: string) => { const a = heads.get(`${side}Arm`), f = heads.get(`${side}ForeArm`);return a && f ? Math.abs(Math.atan2(f[1] - a[1], Math.hypot(f[0] - a[0], f[2] - a[2]))) * 180 / Math.PI : 45; };
  const restPose: 'A' | 'T' = (arm('Left') + arm('Right')) / 2 < 25 ? 'T' : 'A';
  const rig: Rig = { type: 'game', restPose, bones: rigBones };

  // Face shapes Ara uses: by their own (ARKit) name, a left and right pair added together (mouthSmileLeft + Right),
  // or Character Creator's names (Eye_Blink_L, Mouth_Smile_L + _R, its V_ visemes).
  const vertexCount = positions.length / 3, faceNames: string[] = [], deltas: Float32Array[] = [];
  const lookup = new Map([...morphs.keys()].map((k) => [k.replace(/^.*[.:]/, '').toLowerCase(), k]));
  const found = (names: readonly string[]) => { const got = names.map((n) => lookup.get(n.toLowerCase()));return got.every((g) => g) ? got as string[] : undefined; };
  for (const name of FACE_SHAPE_NAMES) {
    const use = found([name]) ?? found([`${name}Left`, `${name}Right`]) ?? found([`${name}_L`, `${name}_R`]) ?? (FACE_ALIASES[name] ?? []).map(found).find((g) => g);
    if (!use?.length) continue;
    const delta = new Float32Array(vertexCount * 3);
    for (const s of use) for (const [i, d] of morphs.get(s)!) for (let k = 0; k < 3; k++) delta[i * 3 + k] += d[k] * scale;
    faceNames.push(name);deltas.push(delta);
  }

  const meshGroups: MeshGroup[] = [...groups].map(([material, list]) => {
    const indices = Uint32Array.from(list);
    return { material, indices, polySizes: new Uint8Array(indices.length / 3).fill(3), polyIndices: indices } as MeshGroup;
  });
  const mesh: MeshData = {
    positions: Float32Array.from(positions), normals: Float32Array.from(normals), uvs: Float32Array.from(uvs), groups: meshGroups, materials,
    joints: Uint16Array.from(joints), weights: Float32Array.from(weights),
    ...(faceNames.length ? { morphs: { names: faceNames, deltas, defaults: faceNames.map(() => 0) } } : {}),
  };
  const height = top * scale;
  const params: HumanParams = { ...DEFAULT_PARAMS, name: options.name.slice(0, 60) || 'Imported character', rig: 'game', restPose, faceShapes: faceNames.length > 0, speechShapes: faceNames.some((n) => n.startsWith('viseme_')), faceBones: false, weapon: 'none', carry: 'none', vehicle: 'none', animations: true };
  const animated = rigBones.filter((b) => RIG_NAMES.has(b.name)).length;
  if (!faceNames.length) notes.push('No face shapes were found, so the face stays still (no expressions, blinking or lip-sync).');
  return {
    character: { params, mesh, rig, height, ...(faceNames.length ? { face: { names: faceNames, defaults: faceNames.map(() => 0) } } : {}) },
    textures,
    report: { bones: rigBones.length, animated, faceShapes: faceNames, restPose, height, notes },
  };
}

/**
 * Reads a model file (GLB, glTF or FBX) and turns it into an Ara character, `id` naming it among imported
 * characters (its textures are registered under that ID).
 */
export async function characterFromFile(bytes: Uint8Array, fileName: string, options: Omit<ModelOptions, 'format' | 'textureKey' | 'name'> & { id: string; name?: string }): Promise<ImportedCharacter> {
  const ext = /\.([a-z0-9]+)$/i.exec(fileName)?.[1].toLowerCase();
  if (ext !== 'glb' && ext !== 'gltf' && ext !== 'fbx') throw Error(`${fileName}: open a GLB, glTF or FBX character.`);
  if (bytes.length > MAX_MODEL_SIZE) throw Error(`${fileName} is larger than ${MAX_MODEL_SIZE / 1e6} MB.`);
  const { readAnimationFile } = await import('../packs/build');
  options.progress?.('Reading the file');
  const file = await readAnimationFile(bytes, fileName);
  if ('bvh' in file) throw Error(`${fileName}: open a GLB, glTF or FBX character.`);
  const name = options.name ?? fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  const result = await characterFromModel(file.root, { ...options, name, format: ext === 'fbx' ? 'fbx' : 'gltf', textureKey: `imported-${options.id}` });
  result.character.imported = options.id;
  return result;
}
