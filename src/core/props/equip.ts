/**
 * Props on a rig: carried items (bags, parachute, head load, broom, phone, gym weights, parcel) and the held weapon.
 * Ara's characters get them as they're built; an imported character gets the same props, fitted to its own skeleton
 * (see equipCharacter).
 */
import type { AssetLibrary } from '../assets';
import { Animator } from '../anim/evaluate';
import { qconj, qmul, qrot, type Q } from '../anim/quat';
import { genTexture } from '../garments';
import type { PolyMesh } from '../geometry';
import type { Character } from '../human';
import type { Vec3 } from '../math';
import { MeshAssembler, type Material, type MeshData } from '../mesh';
import type { HumanParams } from '../params';
import { boneFor } from '../rig/poses';
import { quatOf, type Rig, type RigBone } from '../rig/rig';
import { socketBone, SOCKET_NAME, type HandJoints } from '../rig/socket';
import { buildCarry, carryStyle, GYM_WEIGHTS, gymJoints, headLoad, PARCEL_REST, PLACED_PROPS, PROP_REST, WORN_BAGS, type CarryPart } from './carry';
import { PACKED_CANOPY, parachuteCanopy, parachuteHarness, parachuteLine, parachutePack, SUSPENSION_ANCHORS } from './parachute';
import { buildWeapon } from './weapons';

export type PropChoice = Pick<HumanParams, 'rig' | 'carry' | 'weapon' | 'garmentStyles'>;
/** A part of the body the props fit over: its positions (metres) and material (its name says what it is). */
export type Worn = readonly (readonly [{ positions: Float32Array }, { name: string }])[];

/** Whether a carry choice is a bag held in the left hand. */
export const handBag = (carry: HumanParams['carry']) => carry !== 'none' && !PLACED_PROPS.includes(carry) && !WORN_BAGS.includes(carry);

/** Rigid parts bound to one bone. */
function bound(part: { mesh: PolyMesh; material: Material }, positions: Float32Array, bone: number): [PolyMesh, Material] {
  const n = positions.length / 3, j = new Uint16Array(n * 4), w = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { j[i * 4] = bone;w[i * 4] = 1; }
  return [{ ...part.mesh, positions, skin: { j, w } }, part.material];
}

/**
 * Adds the chosen props to a rig whose bones are already placed (its WeaponR socket included, when there's a weapon):
 * their bones go on `rig.bones`, and the parts to add to the mesh are returned, the weapon's last. `worn`: the body,
 * which the parachute and head load sit over. `sizeK`: the character's height over 1.8 m.
 */
export function attachProps(rig: Rig, p: PropChoice, lib: AssetLibrary, worn: Worn, sizeK: number): { parts: [PolyMesh, Material][]; weapon: Character['weapon'] } {
  const { bones } = rig, out: [PolyMesh, Material][] = [], texture = (key: string, make: Parameters<typeof genTexture>[2]) => genTexture(lib, key, make);
  let weapon: Character['weapon'];
  // A bag carried in the hand: that hand's fingers close round its handle.
  if (handBag(p.carry)) rig.holds = ['Left'];
  const hips = (() => { const h = bones.findIndex((b) => b.name === 'Hips');return h >= 0 ? h : bones.findIndex((b) => b.parent < 0); })();

  // Carried bag: hangs straight down from the left hand with the arms relaxed at the sides (the
  // animation rest pose), and is bound rigidly to the hand bone.
  if (handBag(p.carry)) {
    const a = new Animator(rig);
    const hand = a.relaxedBone('LeftHand'), hi = bones.findIndex((b) => b.name === (p.rig === 'full' ? 'wrist.L' : 'LeftHand'));
    // The middle knuckle; a hand without finger bones has it a hand's length along the hand bone.
    const mid = a.relaxedBone('LeftHandMiddle1') ?? (hand && { pos: ((d: Vec3) => [0, 1, 2].map((k) => hand.pos[k] + d[k] * 0.09 * sizeK) as Vec3)(qrot(hand.rot, [0, 1, 0])) });
    if (hand && mid && hi >= 0) {
      // Grip: inside the closed fist, just past the knuckles and toward the palm (which faces
      // the thigh); the fingers close round the handle there (rig.holds).
      const grip: Vec3 = [hand.pos[0] + (mid.pos[0] - hand.pos[0]) * 1.15 - 0.018, hand.pos[1] + (mid.pos[1] - hand.pos[1]) * 1.15, hand.pos[2] + (mid.pos[2] - hand.pos[2]) * 1.15];
      const toBind = qmul(quatOf(bones[hi].rot), qconj(hand.rot));
      // The bag rides on its own joint under the hand, so clips that need the hand free (climbing, swimming)
      // can put it away; everywhere else it moves exactly with the hand.
      const bag = bones.length;
      bones.push({ name: 'BagL', parent: hi, head: [...bones[hi].head], tail: [bones[hi].head[0], bones[hi].head[1] + 0.05 * sizeK, bones[hi].head[2]], rot: bones[hi].rot });
      for (const cp of buildCarry(p.carry, texture, p.garmentStyles)) {
        const P = cp.mesh.positions, positions = new Float32Array(P.length);
        for (let i = 0; i < P.length; i += 3) {
          const w = qrot(toBind, [P[i] + grip[0] - hand.pos[0], P[i + 1] + grip[1] - hand.pos[1], P[i + 2] + grip[2] - hand.pos[2]]);
          positions.set([bones[hi].head[0] + w[0], bones[hi].head[1] + w[1], bones[hi].head[2] + w[2]], i);
        }
        out.push(bound(cp, positions, bag));
      }
    }
  }

  if (p.carry === 'parachute') {
    // Fit the rig over clothing, not bare skin. Hair and small face parts never push the webbing out.
    const surfaces = worn.filter(([, m]) => !/hair|eye|brow|lash|teeth|tongue|hat|beard|stubble|earring|pearl/i.test(m.name)).map(([m]) => m.positions);
    const P = new Float32Array(surfaces.reduce((n, a) => n + a.length, 0));surfaces.reduce((o, a) => (P.set(a, o), o + a.length), 0);
    const chest = ['Spine2', 'Spine1', 'Spine'].map((n) => bones.findIndex((b) => b.name === boneFor(p.rig, n))).find((i) => i >= 0)!, level = bones[chest].head[1];let back = 0;
    for (let i = 0; i < P.length; i += 3) if (Math.abs(P[i + 1] - level) < .13 * sizeK && Math.abs(P[i]) < .22 * sizeK) back = Math.min(back, P[i + 2]);
    const centre: Vec3 = [0, level + .12 * sizeK, back - .085 * sizeK], style = carryStyle('parachute', p.garmentStyles);
    const attach = (part: CarryPart, index: number, offset?: Vec3, k = 1) => out.push(bound(part, part.mesh.positions.map((v, i) => v * k + (offset?.[i % 3] ?? 0)), index));
    const harness = parachuteHarness(P, level, sizeK);
    for (const part of parachutePack(centre, .32 * sizeK, sizeK, style, harness)) attach(part, chest);
    // Packed rest geometry stays inside the pack, including static/bind-pose exports.
    const addRoot = (name: string) => { const i = bones.length;bones.push({ name, parent: -1, head: [...centre], tail: [centre[0], centre[1] + .01 * sizeK, centre[2]], rot: [1, 0, 0, 0, 1, 0, 0, 0, 1] });return i; };
    const canopy = addRoot('ParachuteCanopy');for (const part of parachuteCanopy(style)) attach(part, canopy, centre, sizeK * PACKED_CANOPY);
    for (let n = 0; n < SUSPENSION_ANCHORS.length + 2; n++) attach(parachuteLine(), addRoot(`ParachuteLine${n}`), centre, sizeK * PACKED_CANOPY);
  }

  // Head load: on the crown (over the hair), rigid with the head.
  if (p.carry === 'head_load') {
    const head = bones.findIndex((b) => b.name === boneFor(p.rig, 'Head')), base = bones[head].head[1];let crown = base, z = 0, top = -Infinity;
    for (const [m, mat] of worn) { if (/eye|brow|lash|teeth|tongue/i.test(mat.name)) continue;const P = m.positions;for (let i = 0; i < P.length; i += 3) if (Math.abs(P[i]) < .04 * sizeK && P[i + 1] > base) { if (P[i + 1] > crown) crown = P[i + 1];if (!/hair|hat/i.test(mat.name) && P[i + 1] > top) { top = P[i + 1];z = P[i + 2]; } } }
    for (const part of headLoad(carryStyle('head_load', p.garmentStyles))) out.push(bound(part, part.mesh.positions.map((v, i) => v * sizeK + [0, crown - .01 * sizeK, z][i % 3]), head));
  }

  // Broom and phone: their own root joints, placed by the animator in the clips that use them (hidden otherwise).
  // At rest (bind pose, static exports) they are packed to nothing inside the hips.
  if (p.carry === 'broom' || p.carry === 'phone') {
    const head: Vec3 = [...bones[hips].head], index = bones.length;bones.push({ name: p.carry === 'broom' ? 'Broom' : 'Phone', parent: -1, head, tail: [head[0], head[1] + .1 * sizeK, head[2]], rot: [1, 0, 0, 0, 1, 0, 0, 0, 1] });
    for (const cp of buildCarry(p.carry, texture, p.garmentStyles)) out.push(bound(cp, cp.mesh.positions.map((v, i) => v * sizeK * PROP_REST + head[i % 3]), index));
  }

  // Gym weights: the same packed root joints (a dumbbell for each hand), placed in the Fitness clips that lift them.
  if (GYM_WEIGHTS.includes(p.carry)) {
    const head: Vec3 = [...bones[hips].head];
    // Gym weights (all) colours every weight with its own style.
    const own = p.garmentStyles.gym_weights, styles = p.carry === 'gym_weights' ? { ...p.garmentStyles, ...(own ? { dumbbells: own, kettlebell: own, barbell: own } : {}) } : p.garmentStyles;
    for (const [kind, names] of gymJoints(p.carry)) for (const name of names) {
      const parts = buildCarry(kind, texture, styles);
      const index = bones.length;bones.push({ name, parent: -1, head, tail: [head[0], head[1] + .1 * sizeK, head[2]], rot: [1, 0, 0, 0, 1, 0, 0, 0, 1] });
      for (const cp of parts) out.push(bound(cp, cp.mesh.positions.map((v, i) => v * sizeK * PROP_REST + head[i % 3]), index));
    }
  }

  // A parcel has its own rigid root, so pickup can leave it on the floor until the grip and
  // carry can drive it from both wrists. The same bone and motion are exported to game engines.
  if (p.carry === 'parcel') {
    const index = bones.length, head = PARCEL_REST.map((v) => v * sizeK) as Vec3;
    bones.push({ name: 'Parcel', parent: -1, head, tail: [head[0], head[1] + .1 * sizeK, head[2]], rot: [1, 0, 0, 0, 1, 0, 0, 0, 1] });
    for (const cp of buildCarry('parcel', texture, p.garmentStyles)) out.push(bound(cp, cp.mesh.positions.map((v, i) => v * sizeK + head[i % 3]), index));
  }

  // Weapon: modelled in its own frame, mapped onto the socket and fitted to its reference pose.
  if (p.weapon && p.weapon !== 'none') {
    const socket = bones.findIndex((b) => b.name === SOCKET_NAME);
    let fitRot: Q = [0, 0, 0, 1];
    let supportZ = 0.3;
    if (p.weapon === 'rifle' || p.weapon === 'pistol') {
      // The same fit the animations use, so the support hand lands on the handguard.
      const f = new Animator(rig).fitFor(p.weapon);
      fitRot = f.rot;
      supportZ = f.supportZ;
    }
    const parts = buildWeapon(p.weapon, { supportZ });
    weapon = { id: p.weapon, rot: fitRot, parts };
    // A separate rigid root follows WeaponR until release, then travels independently.
    const propIndex = p.weapon === 'grenade' ? bones.length : socket;
    if (p.weapon === 'grenade') { const sb = bones[socket];bones.push({ ...sb, name: 'Grenade', parent: -1 }); }
    const sb = bones[socket], sq = quatOf(sb.rot);
    for (const wp of parts) {
      const P = wp.mesh.positions, positions = new Float32Array(P.length);
      for (let i = 0; i < P.length; i += 3) {
        const w = qrot(sq, qrot(fitRot, [P[i], P[i + 1], P[i + 2]]));
        positions[i] = sb.head[0] + w[0];
        positions[i + 1] = sb.head[1] + w[1];
        positions[i + 2] = sb.head[2] + w[2];
      }
      out.push(bound(wp, positions, propIndex));
    }
  }
  return { parts: out, weapon };
}

/**
 * The right hand's joints for its weapon socket, from a rig's bones (Ara's names): the knuckles where it has fingers,
 * and a hand-sized palm along the hand bone where it has none.
 */
export function handJoints(bones: readonly RigBone[], sizeK: number): HandJoints | undefined {
  const at = (name: string) => bones.find((b) => b.name === name);
  const hand = at('RightHand');
  if (!hand) return undefined;
  const wrist = hand.head, sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const unit = (v: Vec3): Vec3 => { const l = Math.hypot(...v) || 1;return [v[0] / l, v[1] / l, v[2] / l]; };
  const along = (k: Vec3, d: number): Vec3 => [wrist[0] + k[0] * d, wrist[1] + k[1] * d, wrist[2] + k[2] * d];
  const index = at('RightHandIndex1')?.head, middle = at('RightHandMiddle1')?.head, pinky = (at('RightHandPinky1') ?? at('RightHandRing1'))?.head;
  const thumb = at('RightHandThumb3') ?? at('RightHandThumb2') ?? at('RightHandThumb1');
  // Without fingers: the palm points along the hand bone, faces down (the arm held out) and is a palm wide, thumb forward.
  const dir = unit(sub(middle ?? hand.tail, wrist)), across = unit([dir[2], 0, -dir[0]]), s = 0.09 * sizeK;
  const k = index && middle && pinky ? undefined : s;
  return {
    wrist,
    index: k ? [along(dir, k)[0] + across[0] * .025 * sizeK, along(dir, k)[1], along(dir, k)[2] + across[2] * .025 * sizeK] : index!,
    middle: k ? along(dir, k) : middle!,
    pinky: k ? [along(dir, k)[0] - across[0] * .025 * sizeK, along(dir, k)[1], along(dir, k)[2] - across[2] * .025 * sizeK] : pinky!,
    thumbTip: thumb?.tail ?? [along(dir, s * .6)[0], along(dir, s * .6)[1] - .03 * sizeK, along(dir, s * .6)[2] + .04 * sizeK],
  };
}

/** `a` with `b`'s vertices and groups after its own (b's materials too); morphs b lacks are zero on its vertices. */
function joinMeshes(a: MeshData, b: MeshData): MeshData {
  const n = a.positions.length / 3, cat = <T extends Float32Array | Uint16Array>(x: T, y: T): T => { const o = new (x.constructor as new (n: number) => T)(x.length + y.length);o.set(x);o.set(y, x.length);return o; };
  return {
    positions: cat(a.positions, b.positions), normals: cat(a.normals, b.normals), uvs: cat(a.uvs, b.uvs),
    materials: [...a.materials, ...b.materials],
    groups: [...a.groups, ...b.groups.map((g) => ({ material: g.material + a.materials.length, indices: g.indices.map((v) => v + n), polySizes: g.polySizes, polyIndices: g.polyIndices.map((v) => v + n) }))],
    ...(a.joints && a.weights && b.joints && b.weights ? { joints: cat(a.joints, b.joints), weights: cat(a.weights, b.weights) } : {}),
    ...(a.morphs ? { morphs: { ...a.morphs, deltas: a.morphs.deltas.map((d, s) => cat(d, b.morphs?.deltas[s] ?? new Float32Array(b.positions.length))) } } : {}),
  };
}

/** The body parts props sit over, one per material, from a built mesh. */
function wornParts(mesh: MeshData): Worn {
  return mesh.groups.map((g) => {
    const used = [...new Set(g.indices)], positions = new Float32Array(used.length * 3);
    used.forEach((v, i) => positions.set(mesh.positions.subarray(v * 3, v * 3 + 3), i * 3));
    return [{ positions }, mesh.materials[g.material]] as const;
  });
}

/** The equipment choices that change an imported character's mesh and rig. */
export type Equipment = Pick<HumanParams, 'weapon' | 'carry'> & Partial<Pick<HumanParams, 'vehicle' | 'garmentStyles' | 'vehicleStyle'>>;

/**
 * An imported character (as converted, without props) with the chosen props: a weapon in its right hand on a WeaponR
 * socket fitted to its knuckles, a carried item, and a vehicle for the riding clips. Its own bones and mesh come first,
 * unchanged, so it animates and exports exactly as before.
 */
export function equipCharacter(ch: Character, choice: Equipment, lib: AssetLibrary): Character {
  const params: HumanParams = { ...ch.params, weapon: choice.weapon, carry: choice.carry, vehicle: choice.vehicle ?? ch.params.vehicle, garmentStyles: choice.garmentStyles ?? ch.params.garmentStyles, vehicleStyle: choice.vehicleStyle ?? ch.params.vehicleStyle };
  if (!ch.rig || (params.weapon === 'none' && params.carry === 'none')) return { ...ch, params, ...(ch.rig ? { rig: { ...ch.rig, weapon: params.weapon } } : {}) };
  const { holds: _holds, weapon: _weapon, ...base } = ch.rig;
  const rig: Rig = { ...base, bones: ch.rig.bones.map((b) => ({ ...b })) }, sizeK = ch.height / 1.8;
  if (params.weapon !== 'none') {
    const hand = handJoints(rig.bones, sizeK), handIdx = rig.bones.findIndex((b) => b.name === 'RightHand');
    if (hand) rig.bones.push(socketBone(hand, handIdx, sizeK));
    else params.weapon = 'none';
  }
  const { parts, weapon } = attachProps(rig, params, lib, wornParts(ch.mesh), sizeK);
  rig.weapon = params.weapon;
  if (!parts.length) return { ...ch, params, rig };
  const asm = new MeshAssembler(ch.mesh.morphs ? { names: ch.mesh.morphs.names, defaults: ch.mesh.morphs.defaults } : undefined);
  for (const [m, mat] of parts) asm.add(m, mat);
  const { weapon: _w, ...rest } = ch;
  return { ...rest, params, rig, mesh: joinMeshes(ch.mesh, asm.build()), ...(weapon ? { weapon } : {}) };
}
