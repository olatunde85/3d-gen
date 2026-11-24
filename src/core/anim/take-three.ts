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

/**
 * Source joint name (as in the file, or without its prefix) -> game-rig bone, for this skeleton: the bone map given,
 * or one recognised from the joint names. Throws, naming the missing bones, when it can't drive a whole body.
 */
export function boneMapFor(names: readonly string[], given?: Readonly<Record<string, string>>): Record<string, string> {
  const plain = new Map(names.map((n) => [plainJointName(n), n]));
  const pick = (map: Readonly<Record<string, string>>) => {
    const out: Record<string, string> = {};
    for (const [from, to] of Object.entries(map)) { const joint = names.includes(from) ? from : plain.get(from);if (joint && !Object.values(out).includes(to)) out[joint] = to; }
    return out;
  };
  // CMU skeletons have a LowerBack (their Spine and Spine1 sit one bone higher than Mixamo's); otherwise the family
  // that drives the whole body with the most bones of the same name.
  const candidates = given ? [pick(given)] : plain.has('LowerBack') ? [pick(CMU_MAP)] : [pick(SAME_NAMES), pick(CMU_MAP)];
  const best = candidates.map((m) => ({ m, missing: REQUIRED_MOCAP_BONES.filter((b) => !Object.values(m).includes(b)), exact: Object.entries(m).filter(([from, to]) => plainJointName(from) === to).length }))
    .sort((a, b) => a.missing.length - b.missing.length || b.exact - a.exact)[0];
  if (best.missing.length) throw Error(`The skeleton has no joint for ${best.missing.join(', ')}. ${given ? 'Add them to the bone map' : 'Give a bone map from its joint names to Ara\'s (Mixamo\'s) bone names'}; its joints are: ${names.slice(0, 60).join(', ')}${names.length > 60 ? '…' : ''}.`);
  return best.m;
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
