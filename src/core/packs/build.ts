/**
 * Making packs: animation files (FBX from Mixamo and most tools, glTF/GLB, BVH) retargeted onto Ara's rig and
 * compressed the way Ara stores its own motion capture. Used by `ara3d pack build`; runs in browsers too.
 *
 * FBX and glTF files are read with three.js's loaders. In Node, call `nodeLoaders()` from the CLI first: it lets
 * them skip the textures some animation files carry.
 */
import type { AnimationClip, Object3D } from 'three';
import { bakeMocap, mocapClip, parseBvh, mirrorBvh, bvhTake, uprightTake, MOCAP_BONES, type MocapOptions, type Take } from '../anim/mocap';
import { boneMapFor, jointNames, jointParents, keyRate, takeFromClip } from '../anim/take-three';
import { qmul, qconj, type Q } from '../anim/quat';
import { ITEM_ID, PACK_CATEGORIES, PACK_ID, PACK_KIND, PACK_VERSION, parsePack, type Pack, type PackAnimation } from './format';

/** One animation of a pack, as written in a pack's pack.json. */
export interface AnimationSource {
  /** The file, relative to pack.json: .fbx, .glb, .gltf or .bvh. */
  file: string;
  /** The animation inside the file, by name (default: the first). */
  clip?: string;
  /** ID inside the pack (default: from the file name). */
  id?: string;
  name?: string;
  category?: PackAnimation['category'];
  /** Whether it loops (default: when its last pose matches its first). */
  loop?: boolean;
  /** Seconds into the recording to start and end. */
  start?: number;
  end?: number;
  /** Frames a second to store (default: the file's own rate, 24 to 60). */
  fps?: number;
  /** Closed fists when the recording has no fingers (default: relaxed hands). */
  hands?: 'fist';
  /** Keep the lowest foot on the floor every frame (seated and lying clips). */
  ground?: boolean;
  /** BVH only: play it mirrored left to right. */
  mirror?: boolean;
  /** Degrees to turn the arms out from the body (default 0; 8 for CMU recordings). */
  armSpread?: number;
  /** Degrees to turn the legs out at the hip and knee (default 0; 4 for CMU recordings). */
  legSpread?: number;
  /** Source joint -> Ara bone, for skeletons Ara doesn't recognise (it knows Mixamo's, Ara's and CMU's). */
  bones?: Record<string, string>;
}

/** A pack's pack.json: the pack's details and its animations. */
export interface PackSource {
  id: string;
  name: string;
  author?: string;
  license?: string;
  homepage?: string;
  description?: string;
  animations: AnimationSource[];
}

/** A file's recordings: three.js's scene and clips (FBX, glTF) or a parsed BVH. */
export type AnimationFile = { root: Object3D; clips: AnimationClip[] } | { bvh: ReturnType<typeof parseBvh> };

const ext = (name: string) => /\.([a-z0-9]+)$/i.exec(name)?.[1].toLowerCase() ?? '';
export const ANIMATION_FILE_TYPES = ['fbx', 'glb', 'gltf', 'bvh'] as const;
const buffer = (bytes: Uint8Array) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

/**
 * A binary FBX cut off after its last top-level record, padded the way three's reader expects. Some exporters write a
 * footer of another length, which that reader would otherwise read as one more record and fail on.
 */
export function trimFbxFooter(bytes: Uint8Array): Uint8Array | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), wide = view.getUint32(23, true) >= 7500;
  if (new TextDecoder().decode(bytes.subarray(0, 18)) !== 'Kaydara FBX Binary') return undefined;
  let at = 27;
  while (at + (wide ? 25 : 13) <= bytes.length) {
    const end = wide ? Number(view.getBigUint64(at, true)) : view.getUint32(at, true);
    if (end === 0) break;
    if (end <= at || end > bytes.length) return undefined;
    at = end;
  }
  const out = new Uint8Array((at + 176) & ~0xf);
  out.set(bytes.subarray(0, Math.min(at, bytes.length)));
  return out;
}

/**
 * VRM avatars (VRoid and others) keep their face shapes unnamed and name them in expression presets (VRM 0.x
 * blendShapeMaster, VRM 1.0 expressions). Each preset that moves one shape adds that name ("vrm_blink_l") to the
 * meshes' morph dictionaries, so the character import can use it.
 */
function nameVrmExpressions(gltf: { parser: { json: Record<string, any>; associations: Map<object, { meshes?: number; nodes?: number }> }; scene: Object3D }) {
  const ext = gltf.parser.json.extensions ?? {}, named: [string, 'meshes' | 'nodes', number, number][] = [];
  for (const g of ext.VRM?.blendShapeMaster?.blendShapeGroups ?? []) {
    const binds = (g.binds ?? []).filter((b: { weight?: number }) => (b.weight ?? 100) > 0);
    for (const b of binds) named.push([String(g.presetName && g.presetName !== 'unknown' ? g.presetName : g.name).toLowerCase(), 'meshes', b.mesh, b.index]);
  }
  for (const [preset, e] of Object.entries<any>(ext.VRMC_vrm?.expressions?.preset ?? {}))
    for (const b of e.morphTargetBinds ?? []) named.push([preset.toLowerCase(), 'nodes', b.node, b.index]);
  if (!named.length) return;
  gltf.scene.traverse((o) => {
    const mesh = o as Object3D & { morphTargetDictionary?: Record<string, number> };
    if (!mesh.morphTargetDictionary) return;
    // A glTF mesh of several primitives loads as a group of meshes: the association is on the mesh or its parent.
    const own = gltf.parser.associations.get(o) ?? (o.parent ? gltf.parser.associations.get(o.parent) : undefined);
    for (const [preset, kind, at, index] of named) if (own?.[kind] === at && !(`vrm_${preset}` in mesh.morphTargetDictionary)) mesh.morphTargetDictionary[`vrm_${preset}`] = index;
  });
}

/**
 * Files kept beside a model that it names (textures an FBX points to, a glTF's .bin and images), by file name: they
 * are found by name wherever the model's own paths said they were (often the computer it was made on). `used`
 * collects the names of the ones the model asked for.
 */
export interface ModelFiles { files?: ReadonlyMap<string, Uint8Array>; used?: Set<string>; /** Where the model came from: files it names that aren't in `files` are read from beside it. */ base?: string }
const IMAGE_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', tga: 'image/tga', bmp: 'image/bmp', gif: 'image/gif' };
/** Whether a file can be one a model uses: an image, a glTF's data, or a Unity material (its colour tint). */
export const isModelFile = (name: string) => (ext(name) in IMAGE_TYPES) || ext(name) === 'bin' || ext(name) === 'mat';

/** three.js's loading manager for a model: names resolved to the files given, and TGA textures decoded. */
async function managerFor(extra: ModelFiles = {}) {
  const { LoadingManager } = await import('three');
  const { TGALoader } = await import('three/examples/jsm/loaders/TGALoader.js');
  const manager = new LoadingManager(), urls = new Map<string, string>(), files = extra.files ?? new Map<string, Uint8Array>();
  if (files.size || extra.base) manager.setURLModifier((url) => {
    if (/^(blob|data):/.test(url)) return url;
    const named = decodeURIComponent(url).split(/[\\/]/).pop()!, base = named.toLowerCase(), stem = base.replace(/\.[^.]+$/, '');
    // By name; or the same name in another image format (a .tga named, a .png kept).
    const key = files.has(base) ? base : [...files.keys()].find((k) => k.replace(/\.[^.]+$/, '') === stem && ext(k) in IMAGE_TYPES);
    // Otherwise from beside the model (the folder it was read from), whatever folder the model's own path names.
    if (!key) return extra.base && !/^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? new URL(encodeURIComponent(named), extra.base).href : url;
    extra.used?.add(key);
    let blob = urls.get(key);
    if (!blob) { blob = URL.createObjectURL(new Blob([files.get(key)! as BlobPart], { type: IMAGE_TYPES[ext(key)] ?? 'application/octet-stream' }));urls.set(key, blob); }
    return blob;
  });
  manager.addHandler(/\.tga$/i, new TGALoader(manager));
  return manager;
}

/** Reads an animation file (and a model's, with the files it names beside it). */
export async function readAnimationFile(bytes: Uint8Array, name: string, extra?: ModelFiles): Promise<AnimationFile> {
  const type = ext(name);
  if (type === 'bvh') return { bvh: parseBvh(new TextDecoder().decode(bytes)) };
  if (type === 'fbx') {
    const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
    // Files with a camera make three's FBX reader ask for the window's size, which workers and Node don't have: it
    // gets one just while it reads (removed again, so nothing else takes this for a page).
    const g = globalThis as { window?: unknown }, stand = g.window === undefined;
    if (stand) g.window = { innerWidth: 1920, innerHeight: 1080 };
    let root: Object3D;
    const manager = await managerFor(extra);
    try { root = new FBXLoader(manager).parse(buffer(bytes), ''); }
    catch (error) {
      const trimmed = trimFbxFooter(bytes);
      try { if (!trimmed) throw error;root = new FBXLoader(manager).parse(buffer(trimmed), ''); }
      catch {
        // FBX 6 and older (2006 and before) predate the version three.js reads.
        const version = /FileVersion:\s*(\d+)/.exec((error as Error).message)?.[1];
        if (version && Number(version) < 7000) throw Error(`${name} is an old FBX file (version ${Number(version) / 1000}). Re-export it as FBX 7 or newer (2011 onwards) or as GLB, for example with Autodesk's FBX Converter or the tool it came from.`);
        throw Error(`${name} couldn't be read as FBX: ${(error as Error).message}`);
      }
    } finally { if (stand) delete g.window; }
    return { root, clips: (root as Object3D & { animations: AnimationClip[] }).animations };
  }
  if (type === 'glb' || type === 'gltf' || type === 'vrm') {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    try {
      const gltf = await new GLTFLoader(await managerFor(extra)).parseAsync(type === 'gltf' ? new TextDecoder().decode(bytes) : buffer(bytes), '');
      nameVrmExpressions(gltf);
      return { root: gltf.scene, clips: gltf.animations };
    } catch (error) { throw Error(`${name} couldn't be read as ${type === 'vrm' ? 'VRM' : 'glTF'}: ${(error as Error).message}`); }
  }
  throw Error(`${name}: use an FBX, glTF (.glb, .gltf) or BVH file.`);
}

/** Animations shorter than this are poses (a T-pose, a tool's empty take), not motion. */
const MIN_SECONDS = 0.1, POSE_SECONDS = 2;
const moving = (file: Extract<AnimationFile, { clips: unknown }>) => file.clips.filter((c) => c.duration >= MIN_SECONDS);
/** The animations in a file, by name (BVH holds one, named after the file). */
/** How far (degrees) a body bone of a still frame must turn from the skeleton's rest for the frame to be a pose. */
const POSE_TURN = 15;
/**
 * A file's still frame that is a pose of its own (as Mixamo's poses download), when it has no animation: not a
 * skeleton standing in its rest pose, as a character file's frame does (a T-pose).
 */
function stillPose(file: Extract<AnimationFile, { clips: unknown }>): AnimationClip | undefined {
  if (moving(file).length) return undefined;
  let map: Readonly<Record<string, string>>;
  try { map = boneMapFor(jointNames(file.root), undefined, jointParents(file.root)); } catch { return undefined; }
  const hips = Object.entries(map).find(([, g]) => g === 'Hips')?.[0];
  if (!hips) return undefined;
  return file.clips.find((clip) => {
    const take = takeFromClip(file.root, clip, hips, 30), pose = take.poses[0];
    return take.joints.some((j, k) => MOCAP_BONES.includes(map[j.name]) && (2 * Math.acos(Math.min(1, Math.abs(pose.world[k][3]))) * 180) / Math.PI > POSE_TURN);
  });
}
export const animationNames = (file: AnimationFile, name: string) => 'bvh' in file ? [name.replace(/\.[^.]+$/, '')] : [...moving(file), ...[stillPose(file)].filter((c) => c)].map((c) => c!.name);

/** How far a loop's last pose may be from its first (average degrees per bone) for it to loop. */
const LOOP_TOLERANCE = 7;
/** Whether a take ends in the pose it starts with (so it loops), over the bones that drive the body. */
function endsWhereItStarts(take: Take, map: Readonly<Record<string, string>>): boolean {
  const first = take.poses[0], last = take.poses[take.poses.length - 1], used = take.joints.map((j, k) => [map[j.name], k] as const).filter(([g]) => g);
  let sum = 0;
  for (const [, k] of used) {
    const d: Q = qmul(first.world[k], qconj(last.world[k]));
    sum += (2 * Math.acos(Math.min(1, Math.abs(d[3]))) * 180) / Math.PI;
  }
  return used.length > 0 && sum / used.length < LOOP_TOLERANCE;
}

/** Groups whose animations repeat when they end where they start; others loop only when named so. */
const LOOPING_GROUPS = new Set<string>(['Locomotion', 'Idle & stance', 'Fitness']);
const LOOPING_WORDS = /\b(loop\w*|cycle|idle|danc\w*|samba|salsa|walk\w*|run\w*|jog\w*|sprint\w*|strafe\w*|swim\w*|tread\w*|breath\w*|wait\w*|talk\w*|clap\w*|cheer\w*)\b/i;

/** One pack animation from a file's recording. */
export function packAnimation(file: AnimationFile, fileName: string, source: AnimationSource): PackAnimation {
  const base = fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
  const id = source.id ?? (base.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48) || 'animation');
  if (!ITEM_ID.test(id)) throw Error(`${fileName}: the id "${id}" must be lower-case letters, digits and underscores.`);
  const category = source.category ?? 'Actions';
  if (!(PACK_CATEGORIES as readonly string[]).includes(category)) throw Error(`${fileName}: category must be one of ${PACK_CATEGORIES.join(', ')}.`);
  let take: Take, map: Readonly<Record<string, string>>, fps = source.fps, cmu = false, pose = false;
  if ('bvh' in file) {
    const bvh = source.mirror ? mirrorBvh(file.bvh) : file.bvh;
    map = boneMapFor(bvh.joints.map((j) => j.name), source.bones, (n) => { const j = bvh.joints.find((x) => x.name === n);return j && j.parent >= 0 ? bvh.joints[j.parent].name : undefined; });
    cmu = bvh.joints.some((j) => j.name === 'LowerBack');
    take = bvhTake(bvh);
    fps ??= Math.max(24, Math.min(60, Math.round(1 / bvh.frameTime)));
  } else {
    if (source.mirror) throw Error(`${fileName}: mirror works on BVH files only.`);
    // A file with only a still frame (a pose, as Mixamo's poses download) becomes a stance held for POSE_SECONDS.
    const clip = source.clip ? file.clips.find((c) => c.name === source.clip) : moving(file)[0] ?? stillPose(file);
    if (!clip) throw Error(`${fileName}: ${source.clip ? `there's no animation called "${source.clip}". It has: ${file.clips.map((c) => c.name).join(', ')}.` : 'there are no animations in this file.'}`);
    map = boneMapFor(jointNames(file.root), source.bones, jointParents(file.root));
    const hips = Object.entries(map).find(([, g]) => g === 'Hips')![0];
    fps ??= keyRate(clip);
    take = takeFromClip(file.root, clip, hips, Math.min(60, fps * 2));
    if (clip.duration < MIN_SECONDS) { pose = true;take = { ...take, frameTime: 1 / 30, poses: Array.from({ length: POSE_SECONDS * 30 + 1 }, () => take.poses[0]) }; }
  }
  // Animations drive the body and fingers; other bones found (toes, eyes) follow their parents, as in Ara's own clips.
  map = Object.fromEntries(Object.entries(map).filter(([, bone]) => MOCAP_BONES.includes(bone)));
  take = uprightTake(take, map);
  if (take.poses.length < 2) throw Error(`${fileName}: the animation has a single frame. A pose needs at least two frames.`);
  // Many one-off moves end in the stance they start from (a catch, a kick): only motion meant to repeat loops.
  const loop = source.loop ?? (pose || endsWhereItStarts(take, map) && (LOOPING_GROUPS.has(category) || LOOPING_WORDS.test(`${source.name ?? ''} ${base}`)));
  const options: MocapOptions = {
    id, name: source.name ?? base, category, loop, start: source.start, end: source.end, map,
    // CMU actors wore marker caps (their neutral head pose varies) and hold their arms in close; animated sources mean their poses.
    neutralHead: cmu, levelFeet: cmu, armSpread: source.armSpread ?? (cmu ? 8 : 0), legSpread: source.legSpread ?? (cmu ? 4 : 0),
  };
  const clip = mocapClip(take, options);
  return { id, name: (source.name ?? base).slice(0, 60), category, motion: bakeMocap(clip, Math.max(24, Math.min(60, fps)), source.hands, source.ground) };
}

/** Checks a pack.json, filling in what it leaves out. */
export function parsePackSource(raw: unknown): PackSource {
  const s = raw as Partial<PackSource>;
  if (!s || typeof s !== 'object') throw Error('pack.json must be an object: { "id", "name", "animations": [...] }.');
  if (typeof s.id !== 'string' || !PACK_ID.test(s.id)) throw Error('pack.json needs an "id": 2 to 40 lower-case letters, digits and hyphens, such as "salsa-moves".');
  if (typeof s.name !== 'string' || !s.name.trim()) throw Error('pack.json needs a "name", such as "Salsa moves".');
  if (!Array.isArray(s.animations) || !s.animations.length) throw Error('pack.json needs "animations": a list such as [{ "file": "basic.fbx", "name": "Salsa basic", "category": "Emotes" }].');
  for (const [i, a] of s.animations.entries()) if (!a || typeof a.file !== 'string') throw Error(`Animation ${i + 1} in pack.json needs a "file".`);
  return s as PackSource;
}

/** Builds a pack from its pack.json and a way to read its files. Reports each animation as it is converted. */
export async function buildPack(source: PackSource, read: (file: string) => Promise<Uint8Array>, progress?: (message: string) => void): Promise<Pack> {
  const files = new Map<string, Promise<AnimationFile>>();
  const animations: PackAnimation[] = [];
  for (const a of source.animations) {
    let file = files.get(a.file);
    if (!file) { file = read(a.file).then((bytes) => readAnimationFile(bytes, a.file));files.set(a.file, file); }
    const anim = packAnimation(await file, a.file, a);
    progress?.(`${anim.id}: ${anim.motion.duration.toFixed(2)} s${anim.motion.loop ? ', loops' : ''}, ${anim.motion.bones.length} bones`);
    animations.push(anim);
  }
  const pack: Pack = { kind: PACK_KIND, version: PACK_VERSION, id: source.id, name: source.name.trim(), animations };
  for (const key of ['author', 'license', 'homepage', 'description'] as const) if (source[key]) pack[key] = source[key];
  // The same checks every app makes when it opens the pack.
  return parsePack(JSON.stringify(pack));
}

/** A readable name from a file or take name: "goalkeeper_body block (2)" -> "Goalkeeper body block 2". */
export function cleanName(label: string): string {
  const s = label.replace(/^.*[\\/]/, '').replace(/\.(fbx|glb|gltf|bvh)$/i, '').replace(/^mixamo\.com$/i, 'Animation')
    .replace(/[_]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\s*\((\d+)\)\s*$/, ' $1').replace(/\s+/g, ' ').trim();
  // "SoccerGamePack" reads as "Soccer game pack"; words already capitalised by spaces keep their case.
  const words = /[a-z][A-Z]/.test(label) ? s.split(' ').map((w, i) => (i ? w.charAt(0).toLowerCase() + w.slice(1) : w)).join(' ') : s;
  return (words.charAt(0).toUpperCase() + words.slice(1)).slice(0, 60) || 'Animation';
}

/** Words that place an animation in a group, tried in this order (a goalkeeper's block is sport, not combat). */
const CATEGORY_WORDS: [PackAnimation['category'], RegExp][] = [
  ['Sports', /\b(soccer|football|goal ?keeper|keeper|kick ?up|header|dribbl\w*|penalty|tackl\w*|throw ?in|dunk|tennis|golf|pitch\w*|batting|volley\w*|rugby|cricket|bowling|hockey|skat\w*|surf\w*|\w*ball)\b/i],
  ['Fitness', /\b(squat\w*|push ?ups?|sit ?ups?|plank|burpee\w*|lunges?|jumping jacks?|stretch\w*|yoga|exercis\w*|workout|curls?|deadlift|bench press|warm ?up|calisthenics?)\b/i],
  ['Sitting & lying', /\b(sit\w*|seated|lying|lie|lay\w*|sleep\w*|kneel\w*)\b/i],
  ['Reactions', /\b(hit|hits|death|dying|die|dies|knock\w*|fall\w*|stumbl\w*|react\w*|injur\w*|get(ting)? up|stand(ing)? up|shot|flinch\w*|dodg\w*)\b/i],
  ['Combat', /\b(punch\w*|jab|hook|uppercut|block\w*|fight\w*|boxing|boxer|martial|karate|kung ?fu|sword\w*|slash\w*|stab\w*|combo|elbow|strike|attack\w*|kick\w*|parry|guard)\b/i],
  ['Turns', /\b(turn\w*|pivot\w*|spin\w*)\b/i],
  ['Locomotion', /\b(walk\w*|run\w*|jog\w*|sprint\w*|strafe\w*|crawl\w*|sneak\w*|stride|march\w*|step\w*|side ?step\w*|backward|limp\w*|swagger)\b/i],
  ['Emotes', /\b(danc\w*|samba|salsa|tango|hip ?hop|breakdanc\w*|twerk\w*|wav\w*|cheer\w*|clap\w*|laugh\w*|cry\w*|celebrat\w*|taunt\w*|bow\w*|salut\w*|thumbs?|victory|shrug\w*|agree\w*|disagree\w*|nod\w*|bored|happy|sad|angry|excited)\b/i],
  ['Interaction', /\b(pick\w*|grab\w*|open\w*|push\w*|pull\w*|carry\w*|lift\w*|handshake|hug\w*|press\w*|button|door|lever|throw\w*|catch\w*|put\w*)\b/i],
  ['Everyday', /\b(talk\w*|phone|text\w*|drink\w*|eat\w*|look\w*|point\w*|typ\w*|sweep\w*|clean\w*|wash\w*|cook\w*|read\w*|writ\w*|smok\w*)\b/i],
  ['Idle & stance', /\b(idle|stand\w*|stance|breath\w*|wait\w*|pose)\b/i],
];
/** The group an animation most likely belongs in, from its name (Actions when nothing fits). */
export function guessCategory(name: string): PackAnimation['category'] {
  const words = name.replace(/[_-]+/g, ' ');
  return CATEGORY_WORDS.find(([, re]) => re.test(words))?.[0] ?? 'Actions';
}

/** A pack or item ID from a name, made unique against `taken`. */
export function idFrom(name: string, taken: Iterable<string>, kind: 'pack' | 'item'): string {
  const used = new Set(taken), max = kind === 'pack' ? 40 : 48, sep = kind === 'pack' ? '-' : '_';
  let base = name.toLowerCase().replace(/[^a-z0-9]+/g, sep).replace(new RegExp(`^\\${sep}+|\\${sep}+$`, 'g'), '').slice(0, max) || (kind === 'pack' ? 'my-animations' : 'animation');
  if (kind === 'pack' && base.length < 2) base = `${base}-pack`;
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base.slice(0, max - String(n).length - 1)}${sep}${n}`;
  return id;
}

/** A file to import: its name (with any folder) and contents. */
export interface ImportFile { name: string; bytes: Uint8Array }
export interface ImportResult {
  pack: Pack;
  /** The animations this import added. */
  added: PackAnimation[];
  /** Files left out, with the reason (a copy of another file, a pose without motion, a file that can't be read). */
  skipped: { file: string; reason: string }[];
}

/** File order: by name, a numbered copy ("walk (2).fbx") right after its original ("walk.fbx"), which is kept first. */
function order(a: string, b: string) {
  const split = (n: string) => { const m = /^(.*?)\s*\((\d+)\)(\.[^.]+)$/.exec(n);return m ? [m[1] + m[3], Number(m[2])] as const : [n, 0] as const; };
  const [x, i] = split(a), [y, j] = split(b);
  return x.localeCompare(y, undefined, { numeric: true }) || i - j;
}

/** A quick fingerprint of a file, to skip copies (Mixamo downloads the same file twice under "(2)"). */
function fingerprint(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], 0x01000193);
  return `${bytes.length}:${h >>> 0}`;
}

/**
 * Turns animation files straight into a pack, with nothing to fill in: names from the files, groups guessed from the
 * names, loops found from the motion, copies skipped. With `into`, the animations join that pack (IDs and names kept
 * unique); otherwise a new pack is made, named `name` (default: My animations).
 */
export async function importAnimations(files: readonly ImportFile[], options: { into?: Pack; name?: string; id?: string; takenIds?: Iterable<string>; progress?: (done: number, total: number, label: string) => void } = {}): Promise<ImportResult> {
  const name = (options.into?.name ?? options.name?.trim()) || 'My animations';
  const pack: Pack = options.into ? structuredClone(options.into) : { kind: PACK_KIND, version: PACK_VERSION, id: options.id ?? idFrom(name, options.takenIds ?? [], 'pack'), name: name.slice(0, 60), animations: [] };
  const animations = pack.animations ??= [], added: PackAnimation[] = [], skipped: ImportResult['skipped'] = [], seen = new Map<string, string>();
  const usable = files.filter((f) => (ANIMATION_FILE_TYPES as readonly string[]).includes(f.name.split('.').pop()!.toLowerCase())).sort((a, b) => order(a.name, b.name));
  for (const f of files) if (!usable.includes(f)) skipped.push({ file: f.name, reason: 'not an animation file (FBX, GLB, glTF or BVH)' });
  for (const [i, f] of usable.entries()) {
    const label = f.name.replace(/^.*[\\/]/, '');
    options.progress?.(i, usable.length, label);
    const print = fingerprint(f.bytes);
    if (seen.has(print)) { skipped.push({ file: label, reason: `the same as ${seen.get(print)}` });continue; }
    seen.set(print, label);
    let file: AnimationFile;
    try { file = await readAnimationFile(f.bytes, label); } catch (error) { skipped.push({ file: label, reason: (error as Error).message });continue; }
    const takes = animationNames(file, label);
    if (!takes.length) { skipped.push({ file: label, reason: 'it only stands in its rest pose, with no animation or pose of its own' });continue; }
    for (const take of takes) {
      // Mixamo calls every animation "mixamo.com": the file's name says more.
      const title = cleanName(takes.length === 1 || /^mixamo\.com$/i.test(take) ? label : take);
      const id = idFrom(title, animations.map((a) => a.id), 'item');
      let shown = title;
      for (let n = 2; animations.some((a) => a.name === shown); n++) shown = `${title.slice(0, 56)} ${n}`;
      try {
        const anim = packAnimation(file, label, { file: label, ...('bvh' in file ? {} : { clip: take }), id, name: shown, category: guessCategory(title) });
        animations.push(anim);added.push(anim);
      } catch (error) { skipped.push({ file: label, reason: (error as Error).message }); }
    }
  }
  options.progress?.(usable.length, usable.length, '');
  if (!added.length) throw Error(skipped.length ? `Nothing to import: ${skipped.map((s) => `${s.file} (${s.reason})`).join('; ')}.` : 'Choose FBX, GLB, glTF or BVH animation files.');
  return { pack: parsePack(JSON.stringify(pack)), added, skipped };
}
