/**
 * Recordings from three.js scenes: a skeleton loaded from FBX (Mixamo and most tools) or glTF/GLB, and its
 * animation clips, turned into Takes (see mocap.ts) that retarget onto Ara's rig like the built-in motion capture.
 *
 * Each joint's motion is its world rotation relative to the skeleton's rest pose (the pose the file was loaded in),
 * which is exactly what a BVH channel set at zero describes, so every source retargets the same way.
 */
import { AnimationMixer, Quaternion, Vector3, type AnimationClip, type Object3D } from 'three';
import type { Vec3 } from '../math';
import { CMU_MAP, MOCAP_BONES, REQUIRED_MOCAP_BONES, type Take, type TakeJoint } from './mocap';
import type { Q } from './quat';

/** A joint name without a tool's prefix: "mixamorig:Hips", "mixamorig1Hips" and "Armature|Hips" are all Hips. */
export const plainJointName = (name: string) => name.replace(/^mixamorig\d*:?/i, '').replace(/^.*[:|]/, '');

/** Ara's game rig uses Mixamo's names, so Mixamo skeletons (and Ara's own exports) map one to one. */
const SAME_NAMES: Readonly<Record<string, string>> = Object.fromEntries(MOCAP_BONES.map((b) => [b, b]));

/** The skeleton families recognised without a bone map. */
export const SKELETONS = { ara: SAME_NAMES, cmu: CMU_MAP } as const;

/** Words a joint's name splits into: lower case, at separators, case changes and digits ("L_Upperarm" -> l, upperarm). */
const words = (name: string) => plainJointName(name).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Za-z])(\d)/g, '$1 $2').replace(/(\d)([A-Za-z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
/** Helper joints that sit beside the real ones (twist, corrective, IK and end bones): never a body bone. */
const HELPER = /^(twist|share|roll|helper|ik|pole|target|adj|corrective|null|nub|end|tip|top|dummy|ctrl|mch|org|bend2)$/;
const FINGERS: [string, RegExp][] = [['Thumb', /^thumb$/], ['Index', /^(index|point(er)?)$/], ['Middle', /^(middle|mid)$/], ['Ring', /^ring$/], ['Pinky', /^(pinky|little|small)$/]];
/** Body parts by the words in a joint's name, tried in this order (a forearm is not an arm; a toe is not a foot). */
const PARTS: [string, (w: string[], all: string) => boolean][] = [
  ['ToeBase', (w, all) => /toe ?base|ball/.test(all) || (w.includes('toes') || w.includes('toe')) && !FINGERS.some(([, f]) => w.some((x) => f.test(x)) || w.includes('big'))],
  ['Foot', (w) => w.includes('foot') || w.includes('ankle')],
  ['Leg', (_w, all) => /calf|shin|knee|lower ?leg|low ?leg/.test(all)],
  ['UpLeg', (_w, all) => /thigh|upper ?leg|up ?leg/.test(all)],
  ['Hand', (w) => (w.includes('hand') || w.includes('wrist')) && !FINGERS.some(([, f]) => w.some((x) => f.test(x)))],
  ['ForeArm', (_w, all) => /fore ?arm|lower ?arm|low ?arm|elbow/.test(all)],
  ['Arm', (w, all) => /upper ?arm|up ?arm|shldr/.test(all) || w.includes('arm')],
  ['Shoulder', (w) => w.includes('clavicle') || w.includes('collar') || w.includes('shoulder')],
  ['Head', (w) => w.includes('head') && !w.includes('neck')],
  ['Neck', (w) => w.includes('neck')],
];

/**
 * A bone map worked out from joint names and the skeleton's shape, for skeletons named another way (Character
 * Creator, Unreal's mannequin, Daz, VRoid, Blender): sides from L/R/left/right in any form, parts from their words,
 * the hips where the legs and the spine meet, the spine from the bones between the hips and the neck.
 */
export function guessBoneMap(names: readonly string[], parentOf: (name: string) => string | undefined, positionOf?: (name: string) => Vec3 | undefined): Record<string, string> {
  const depth = (n: string) => { let d = 0;for (let p = parentOf(n);p;p = parentOf(p)) d++;return d; };
  const chain = (n: string) => { const out: string[] = [];for (let p: string | undefined = n;p;p = parentOf(p)) out.push(p);return out; };
  const map: Record<string, string> = {}, taken = new Set<string>();
  const set = (joint: string | undefined, bone: string) => { if (joint && !taken.has(bone) && !map[joint]) { map[joint] = bone;taken.add(bone); } };
  const sideOf = (w: string[]) => w.includes('l') || w.includes('left') ? 'Left' : w.includes('r') || w.includes('right') ? 'Right' : '';
  const fingers = new Map<string, string[]>(), unsided: [string, string][] = [];
  // Shallowest first: a part's main joint comes before its helpers and children.
  for (const name of [...new Set(names)].sort((a, b) => depth(a) - depth(b))) {
    const w = words(name);
    if (w.some((x) => HELPER.test(x))) continue;
    const side = sideOf(w), body = w.filter((x) => !/^(l|r|left|right|\d+)$/.test(x)), all = body.join(' ');
    const finger = FINGERS.find(([, f]) => body.some((x) => f.test(x)));
    if (finger && side && !body.some((x) => /toe/.test(x))) { const key = side + finger[0];fingers.set(key, [...fingers.get(key) ?? [], name]);continue; }
    const part = PARTS.find(([, test]) => test(body, all))?.[0];
    if (!part) continue;
    if (part === 'Head' || part === 'Neck') set(name, part);
    else if (side) set(name, side + part);
    else unsided.push([name, part]);
  }
  // Limbs whose names don't say which side (ARM001, ARM002): the side they sit on, judged by the named legs or arms.
  const at = (bone: string) => { const j = Object.keys(map).find((k) => map[k] === bone);return j ? positionOf?.(j) : undefined; };
  const l = at('LeftUpLeg') ?? at('LeftArm'), r = at('RightUpLeg') ?? at('RightArm');
  const sideAt = (q: Vec3) => (l && r ? ((q[0] - (l[0] + r[0]) / 2) * (l[0] - r[0]) + (q[1] - (l[1] + r[1]) / 2) * (l[1] - r[1]) + (q[2] - (l[2] + r[2]) / 2) * (l[2] - r[2]) > 0 ? 'Left' : 'Right') : '');
  for (const [name, part] of unsided) { const q = positionOf?.(name);if (q && sideAt(q)) set(name, sideAt(q) + part); }
  // A limb found by its lower bones names the rest by the chain: some rigs call the thigh just "leg" (Left_leg, then
  // Left_knee, Left_ankle) or the upper arm by the shoulder's name. The upper bone is the one the lower hangs from.
  const solid = (n?: string) => { for (let p = n && parentOf(n);p;p = parentOf(p)) if (!words(p).some((x) => HELPER.test(x))) return p;return undefined; };
  const named = (bone: string) => Object.keys(map).find((k) => map[k] === bone);
  for (const side of ['Left', 'Right']) {
    for (const [upper, lower, end] of [['UpLeg', 'Leg', 'Foot'], ['Arm', 'ForeArm', 'Hand']]) {
      if (!named(side + lower) && named(side + end)) { const p = solid(named(side + end));if (p && (!named(side + upper) || chain(p).includes(named(side + upper)!))) set(p, side + lower); }
      if (!named(side + upper) && named(side + lower)) set(solid(named(side + lower)), side + upper);
    }
  }
  for (const [key, list] of fingers) list.slice(0, 3).forEach((n, i) => set(n, `${key.replace(/^(Left|Right)/, '$1Hand')}${i + 1}`));
  const joint = (bone: string) => Object.keys(map).find((k) => map[k] === bone);
  // The hips: where both legs and the head meet. The spine: the bones between the hips and the neck (or head).
  const legs = [joint('LeftUpLeg'), joint('RightUpLeg')], head = joint('Head');
  if (legs[0] && legs[1] && head) {
    const up = chain(head), hips = chain(legs[0]).find((j) => chain(legs[1]!).includes(j) && up.includes(j));
    if (hips) {
      set(hips, 'Hips');
      // No plain neck joint: the lowest joint above the spine named for the neck (Character Creator's NeckTwist01), or
      // the head's parent, unless that is the only joint between the hips and the head (a chest).
      if (!joint('Neck')) {
        const between = up.slice(1, up.indexOf(hips)), named = between.filter((j) => words(j).includes('neck')), plain = between.filter((j) => !words(j).some((x) => HELPER.test(x)));
        if (named.length) set(named[named.length - 1], 'Neck');
        else if (plain.length > 1) set(plain[0], 'Neck');
      }
      const neck = joint('Neck') ?? head, spine = chain(neck).slice(1, chain(neck).indexOf(hips)).reverse().filter((j) => !words(j).some((x) => HELPER.test(x)));
      const picks = spine.length >= 3 ? [spine[0], spine[spine.length >> 1], spine[spine.length - 1]] : spine.length === 2 ? [spine[0], undefined, spine[1]] : [spine[0], undefined, undefined];
      if (spine.length === 1) set(spine[0], 'Spine2');
      else picks.forEach((j, i) => set(j, ['Spine', 'Spine1', 'Spine2'][i]));
    }
  }
  // Feet outside the leg's chain (an IK control holding the foot's skin): each side's lowest bone below its shin.
  for (const side of ['Left', 'Right']) {
    const shin = at(`${side}Leg`);
    if (joint(`${side}Foot`) || !shin || !positionOf) continue;
    const ankle = names.filter((n) => !map[n] && !words(n).some((x) => HELPER.test(x) || /toe|knee|pole|finger/.test(x)))
      .map((n) => [n, positionOf(n)] as const).filter(([n, q]) => q && q[1] < shin[1] && (sideOf(words(n)) || sideAt(q)) === side)
      .sort((a, b) => a[1]![1] - b[1]![1])[0];
    if (ankle) set(ankle[0], `${side}Foot`);
  }
  return map;
}

/**
 * Source joint name (as in the file, or without its prefix) -> game-rig bone, for this skeleton: the bone map given,
 * one recognised from the joint names (Mixamo's, Ara's or CMU's), or one worked out from the names and the skeleton's
 * shape (`parentOf`). Throws, naming what's missing, when it can't drive a whole body.
 */
export function boneMapFor(names: readonly string[], given?: Readonly<Record<string, string>>, parentOf?: (name: string) => string | undefined, positionOf?: (name: string) => Vec3 | undefined): Record<string, string> {
  const plain = new Map(names.map((n) => [plainJointName(n), n]));
  const pick = (map: Readonly<Record<string, string>>) => {
    const out: Record<string, string> = {};
    for (const [from, to] of Object.entries(map)) { const joint = names.includes(from) ? from : plain.get(from);if (joint && !Object.values(out).includes(to)) out[joint] = to; }
    return out;
  };
  // CMU skeletons have a LowerBack (their Spine and Spine1 sit one bone higher than Mixamo's); otherwise the family
  // that drives the whole body with the most bones of the same name, and then one worked out from the skeleton.
  const candidates = given ? [pick(given)] : plain.has('LowerBack') ? [pick(CMU_MAP)] : [pick(SAME_NAMES), pick(CMU_MAP)];
  const score = (m: Record<string, string>) => ({ m, missing: REQUIRED_MOCAP_BONES.filter((b) => !Object.values(m).includes(b)), exact: Object.entries(m).filter(([from, to]) => plainJointName(from) === to).length });
  let best = candidates.map(score).sort((a, b) => a.missing.length - b.missing.length || b.exact - a.exact)[0];
  if (best.missing.length && !given && parentOf) { const guessed = score(guessBoneMap(names, parentOf, positionOf));if (guessed.missing.length < best.missing.length) best = guessed; }
  if (best.missing.length) throw Error(`Ara couldn't find the ${best.missing.join(', ')} in this skeleton. ${given ? 'Add them to the bone map' : 'Give a bone map from its joint names to Ara\'s (Mixamo\'s) bone names'}; its joints are: ${names.slice(0, 60).join(', ')}${names.length > 60 ? '…' : ''}.`);
  return best.m;
}

/** Each joint's parent joint by name, under `root` (for boneMapFor). */
export function jointParents(root: Object3D): (name: string) => string | undefined {
  const parents = new Map<string, string>();
  root.traverse((o) => { if (o.name && o.parent?.name && o.parent !== root && !parents.has(o.name)) parents.set(o.name, o.parent.name); });
  return (name) => parents.get(name);
}

/** The frame rate a clip was keyed at (24 to 60), from its first rotation track. */
export function keyRate(clip: AnimationClip): number {
  const times = clip.tracks.find((t) => t.name.endsWith('.quaternion'))?.times;
  if (!times || times.length < 2) return 30;
  const steps = [...times.slice(1)].map((t, i) => t - times[i]).filter((d) => d > 1e-4).sort((a, b) => a - b);
  return Math.max(24, Math.min(60, Math.round(1 / (steps[steps.length >> 1] || 1 / 30))));
}

const vec = (v: Vector3): Vec3 => [v.x, v.y, v.z];
const quat = (q: Quaternion): Q => [q.x, q.y, q.z, q.w];

/**
 * Samples `clip` played on the skeleton under `root` into a Take, `fps` frames a second (default: its key rate).
 * `hips` names the root joint; the joints below it are the recording.
 */
export function takeFromClip(root: Object3D, clip: AnimationClip, hips: string, fps = keyRate(clip)): Take {
  const top = root.getObjectByName(hips);
  if (!top) throw Error(`The skeleton has no joint called ${hips}.`);
  const objects: Object3D[] = [], joints: TakeJoint[] = [];
  const isJoint = (c: Object3D) => !(c as { isMesh?: boolean }).isMesh && !(c as { isCamera?: boolean }).isCamera && !(c as { isLight?: boolean }).isLight;
  const visit = (o: Object3D, parent: number) => {
    // FBX files can give a bone a helper child of the same name: it is part of that bone, not a joint of its own.
    if (parent >= 0 && o.name === joints[parent].name) { for (const c of o.children) if (isJoint(c)) visit(c, parent);return; }
    const k = objects.length;
    objects.push(o);
    joints.push({ name: o.name, parent, offset: [0, 0, 0], kids: [] });
    if (parent >= 0) joints[parent].kids.push(k);
    for (const c of o.children) if (isJoint(c)) visit(c, k);
  };
  visit(top, -1);
  // The rest pose: the skeleton as loaded, before any animation is applied (and put back afterwards).
  const local: Object3D[] = [];
  root.traverse((o) => local.push(o));
  const saved = local.map((o) => [o.position.clone(), o.quaternion.clone(), o.scale.clone()] as const);
  root.updateMatrixWorld(true);
  const restQ = objects.map((o) => o.getWorldQuaternion(new Quaternion()));
  const restP = objects.map((o) => o.getWorldPosition(new Vector3()));
  joints.forEach((j, k) => { if (j.parent >= 0) j.offset = vec(restP[k].clone().sub(restP[j.parent])); });
  // Each bone points at its child; a hand points between its fingers (at the middle one), not at the thumb.
  const tipOf = (k: number): Vec3 | undefined => {
    const long = joints[k].kids.filter((c) => Math.hypot(...joints[c].offset) > 1e-6);
    if (long.length > 1) {
      const middle = long.find((c) => /middle/i.test(joints[c].name));
      if (middle !== undefined) return joints[middle].offset;
      return long.reduce<Vec3>((s, c) => [s[0] + joints[c].offset[0] / long.length, s[1] + joints[c].offset[1] / long.length, s[2] + joints[c].offset[2] / long.length], [0, 0, 0]);
    }
    if (long.length) return joints[long[0]].offset;
    for (const c of joints[k].kids) { const t = tipOf(c);if (t) return t; }
    return undefined;
  };
  joints.forEach((j, k) => (j.tip = tipOf(k)));
  const mixer = new AnimationMixer(root), action = mixer.clipAction(clip).play();
  const frames = Math.max(2, Math.round(clip.duration * fps) + 1), frameTime = clip.duration / (frames - 1) || 1 / fps;
  const poses: Take['poses'] = [];
  const q = new Quaternion(), p = new Vector3(), inv = restQ.map((r) => r.clone().invert());
  for (let f = 0; f < frames; f++) {
    mixer.setTime(f * frameTime);
    root.updateMatrixWorld(true);
    poses.push({ world: objects.map((o, k) => quat(o.getWorldQuaternion(q).multiply(inv[k]))), hips: vec(top.getWorldPosition(p)) });
  }
  action.stop();
  mixer.uncacheRoot(root);
  local.forEach((o, i) => { o.position.copy(saved[i][0]);o.quaternion.copy(saved[i][1]);o.scale.copy(saved[i][2]); });
  root.updateMatrixWorld(true);
  return { joints, frameTime, poses };
}

/** The joint names of the skeleton under `root` (every object that isn't a mesh, camera or light). */
export function jointNames(root: Object3D): string[] {
  const names: string[] = [];
  root.traverse((o) => { if (o !== root && o.name && !(o as { isMesh?: boolean }).isMesh && !(o as { isCamera?: boolean }).isCamera && !(o as { isLight?: boolean }).isLight) names.push(o.name); });
  return names;
}
