/**
 * Imported characters: Ara characters exported as GLB and FBX and read back as models from another tool, checked
 * against the originals in every kind of animation; turned and duplicated skeletons as other tools write them; models
 * without a skeleton refused; every clip valid on the imported rig; textures kept; exports with animations baked in.
 *   npm run test:character-import
 */
import assert from 'node:assert/strict';
import { Mesh, BoxGeometry, MeshStandardMaterial, Object3D, Group, Texture, TextureLoader } from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Animator } from '../src/core/anim/evaluate';
import { CLIPS, clipById } from '../src/core/anim/clips';
import { qaxis, qmul } from '../src/core/anim/quat';
import { guessBoneMap } from '../src/core/anim/take-three';
import { characterFromFile, characterFromModel } from '../src/core/characters/model';
import { buildHuman, type Character } from '../src/core/human';
import { DEFAULT_PARAMS, PRESETS } from '../src/core/params';
import { readAnimationFile } from '../src/core/packs/build';
import { DEFAULT_EXPORT, planExport, runExport } from '../src/export';
import { nodeLibrary } from './node-assets';

(globalThis as { self?: unknown }).self ??= globalThis;
TextureLoader.prototype.load = function (_url: string, onLoad?: (t: Texture) => void) { const t = new Texture();onLoad?.(t);return t; } as TextureLoader['load'];

let passed = 0;
const started = performance.now();
async function check(name: string, fn: () => void | Promise<void>) { await fn();passed++;console.log(`  ok  ${name}`); }

const lib = await nodeLibrary();
const CLIPS_TO_COMPARE = ['idle', 'walk', 'run', 'wave', 'punch_combo', 'sit_idle', 'texting', 'kick_front', 'cheer'];
/** The furthest a hand, foot or the head of `got` is from `want`'s, relative to the hips (metres), over these clips. */
function difference(want: Character, got: Character) {
  const A = new Animator(want.rig!, want.face), B = new Animator(got.rig!, got.face), names = want.rig!.bones.map((b) => b.name), at = new Map(got.rig!.bones.map((b, i) => [b.name, i]));
  let worst = 0;
  for (const id of CLIPS_TO_COMPARE) {
    const c = clipById.get(id)!;
    for (let k = 0; k <= 6; k++) {
      const t = (c.duration * k) / 6, a = A.positions(A.frame(c, t)), b = B.positions(B.frame(c, t)), ha = a[names.indexOf('Hips')], hb = b[at.get('Hips')!];
      names.forEach((n, i) => {
        if (!/^(Left|Right)(Hand|Foot)$|^Head$/.test(n)) return;
        const j = at.get(n)!;
        worst = Math.max(worst, Math.hypot(...[0, 1, 2].map((d) => (a[i][d] - ha[d]) - (b[j][d] - hb[d])) as [number, number, number]));
      });
    }
  }
  return worst;
}
const exported = async (ch: Character, format: 'glb' | 'fbx', clips: string[] = []) =>
  (await runExport(lib, ch, planExport(ch, { ...DEFAULT_EXPORT, mode: clips.length ? 'animated' : 'rigged', format, packaging: 'embedded', clips, stageProps: false }))).data;

console.log('Round trips');
for (const restPose of ['A', 'T'] as const) {
  const original = await buildHuman(lib, { ...DEFAULT_PARAMS, ...PRESETS['The Adventurer'], detail: 'low', restPose });
  const glb = await exported(original, 'glb');
  await check(`an Ara character (${restPose}-pose) through GLB plays every animation as the original`, async () => {
    const imported = await characterFromFile(glb, 'hero.glb', { id: 'glb' });
    assert.equal(imported.report.restPose, restPose);
    assert.equal(imported.report.faceShapes.length, 34, 'face shapes');
    assert.ok(Math.abs(imported.report.height - original.height) < 0.03, `height ${imported.report.height} vs ${original.height}`);
    const d = difference(original, imported.character);
    assert.ok(d < 0.005, `${(d * 100).toFixed(1)} cm`);
  });
  await check(`the same through FBX (Ara's FBX leaves out fingertip bones, so hands are a little freer)`, async () => {
    const imported = await characterFromFile(await exported(original, 'fbx'), 'hero.fbx', { id: 'fbx' });
    const d = difference(original, imported.character);
    assert.ok(d < 0.05, `${(d * 100).toFixed(1)} cm`);
  });
}

const original = await buildHuman(lib, { ...DEFAULT_PARAMS, ...PRESETS['The Adventurer'], detail: 'low' });
const glb = await exported(original, 'glb');
const base = await characterFromFile(glb, 'hero.glb', { id: 'base' });
console.log('Models as other tools write them');
await check('a model facing backwards and lying along Z (Z-up tools) stands up and faces forward', async () => {
  const file = await readAnimationFile(glb, 'hero.glb') as { root: Object3D };
  const turn = new Group();
  turn.quaternion.set(...qmul(qaxis([0, 1, 0], 180), qaxis([1, 0, 0], -90)));
  for (const c of [...file.root.children]) turn.add(c);
  file.root.add(turn);
  const imported = await characterFromModel(file.root, { name: 'Turned', textureKey: 't', format: 'gltf' });
  const d = difference(original, imported.character);
  assert.ok(d < 0.005, `${(d * 100).toFixed(1)} cm`);
});
await check('a rig that names its sides from the viewer\'s point of view is turned to face forward by its feet', async () => {
  const file = await readAnimationFile(glb, 'hero.glb') as { root: Object3D };
  const turn = new Group();
  turn.quaternion.set(...qaxis([0, 1, 0], 180));
  for (const c of [...file.root.children]) turn.add(c);
  file.root.add(turn);
  // Left and right swapped in every bone's name (the bone on the character's left is called Right, and so on).
  file.root.traverse((o) => { if ((o as { isBone?: boolean }).isBone) o.name = o.name.replace(/^(Left|Right)/, (x) => (x === 'Left' ? 'Right' : 'Left')); });
  const imported = await characterFromModel(file.root, { name: 'Mirrored', textureKey: 'm', format: 'gltf' });
  assert.ok(imported.report.notes.some((n) => /feet pointed backwards/.test(n)), 'turned round');
  const d = difference(original, imported.character);
  assert.ok(d < 0.005, `${(d * 100).toFixed(1)} cm`);
});
await check('a model in centimetres comes in metres', async () => {
  const file = await readAnimationFile(glb, 'hero.glb') as { root: Object3D };
  file.root.scale.setScalar(100);
  const imported = await characterFromModel(file.root, { name: 'Big', textureKey: 'b', format: 'gltf' });
  assert.ok(Math.abs(imported.report.height - base.report.height) < 0.01, `${imported.report.height}`);
});
await check('meshes with their own copies of the skeleton (Mixamo\'s X Bot) share one set of bones', async () => {
  const file = await readAnimationFile(glb, 'hero.glb') as { root: Object3D };
  file.root.add(clone(file.root));
  const imported = await characterFromModel(file.root, { name: 'Twice', textureKey: 'w', format: 'gltf' });
  assert.equal(imported.report.bones, base.report.bones);
  assert.equal(imported.character.mesh.positions.length, base.character.mesh.positions.length * 2);
});
await check('a model without a skeleton is refused with what to do', async () => {
  const root = new Group();root.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial()));
  await assert.rejects(characterFromModel(root, { name: 'Box', textureKey: 'x', format: 'gltf' }), /no skeleton.*Mixamo/);
  await assert.rejects(characterFromFile(new Uint8Array(10), 'notes.txt', { id: 'x' }), /GLB, glTF or FBX/);
});

await check('skeletons named another way are worked out: Character Creator, Unreal, Daz, VRoid', () => {
  /** A skeleton from [joint, parent] pairs, with both sides and five fingers made from templates ("{s}" = the side). */
  const skeleton = (body: [string, string?][], limbs: [string, string][], side: (s: 'L' | 'R') => string) => {
    const rows: [string, string | undefined][] = [...body.map(([n, p]) => [n, p] as [string, string | undefined])];
    for (const s of ['L', 'R'] as const) for (const [n, p] of limbs) rows.push([n.replaceAll('{s}', side(s)), p.replaceAll('{s}', side(s))]);
    const parent = new Map(rows);
    return guessBoneMap(rows.map(([n]) => n), (n) => parent.get(n));
  };
  const fingers = (hand: string, name: (f: string, k: number) => string, names = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']) =>
    names.flatMap((f) => [1, 2, 3].map((k) => [name(f, k), k === 1 ? hand : name(f, k - 1)] as [string, string]));
  const expect = (map: Record<string, string>, want: Record<string, string>) => { for (const [bone, joint] of Object.entries(want)) assert.equal(Object.keys(map).find((k) => map[k] === bone), joint, bone); };
  const cc = skeleton([['CC_Base_BoneRoot'], ['CC_Base_Hip', 'CC_Base_BoneRoot'], ['CC_Base_Pelvis', 'CC_Base_Hip'], ['CC_Base_Waist', 'CC_Base_Hip'], ['CC_Base_Spine01', 'CC_Base_Waist'], ['CC_Base_Spine02', 'CC_Base_Spine01'], ['CC_Base_NeckTwist01', 'CC_Base_Spine02'], ['CC_Base_NeckTwist02', 'CC_Base_NeckTwist01'], ['CC_Base_Head', 'CC_Base_NeckTwist02']],
    [['CC_Base_{s}_Thigh', 'CC_Base_Pelvis'], ['CC_Base_{s}_ThighTwist01', 'CC_Base_{s}_Thigh'], ['CC_Base_{s}_Calf', 'CC_Base_{s}_Thigh'], ['CC_Base_{s}_KneeShareBone', 'CC_Base_{s}_Calf'], ['CC_Base_{s}_Foot', 'CC_Base_{s}_Calf'], ['CC_Base_{s}_ToeBase', 'CC_Base_{s}_Foot'], ['CC_Base_{s}_BigToe1', 'CC_Base_{s}_ToeBase'],
      ['CC_Base_{s}_Clavicle', 'CC_Base_Spine02'], ['CC_Base_{s}_Upperarm', 'CC_Base_{s}_Clavicle'], ['CC_Base_{s}_UpperarmTwist01', 'CC_Base_{s}_Upperarm'], ['CC_Base_{s}_Forearm', 'CC_Base_{s}_Upperarm'], ['CC_Base_{s}_ElbowShareBone', 'CC_Base_{s}_Forearm'], ['CC_Base_{s}_Hand', 'CC_Base_{s}_Forearm'],
      ...fingers('CC_Base_{s}_Hand', (f, k) => `CC_Base_{s}_${f === 'Middle' ? 'Mid' : f}${k}`)], (s) => s);
  expect(cc, { Hips: 'CC_Base_Hip', Spine: 'CC_Base_Waist', Spine1: 'CC_Base_Spine01', Spine2: 'CC_Base_Spine02', Neck: 'CC_Base_NeckTwist01', Head: 'CC_Base_Head', LeftUpLeg: 'CC_Base_L_Thigh', LeftLeg: 'CC_Base_L_Calf', LeftToeBase: 'CC_Base_L_ToeBase', RightArm: 'CC_Base_R_Upperarm', RightForeArm: 'CC_Base_R_Forearm', RightHandMiddle2: 'CC_Base_R_Mid2' });
  const ue = skeleton([['root'], ['pelvis', 'root'], ['spine_01', 'pelvis'], ['spine_02', 'spine_01'], ['spine_03', 'spine_02'], ['spine_04', 'spine_03'], ['spine_05', 'spine_04'], ['neck_01', 'spine_05'], ['neck_02', 'neck_01'], ['head', 'neck_02'], ['ik_foot_root', 'root']],
    [['thigh_{s}', 'pelvis'], ['thigh_twist_01_{s}', 'thigh_{s}'], ['calf_{s}', 'thigh_{s}'], ['foot_{s}', 'calf_{s}'], ['ball_{s}', 'foot_{s}'], ['ik_foot_{s}', 'ik_foot_root'], ['clavicle_{s}', 'spine_05'], ['upperarm_{s}', 'clavicle_{s}'], ['lowerarm_{s}', 'upperarm_{s}'], ['hand_{s}', 'lowerarm_{s}'],
      ...fingers('hand_{s}', (f, k) => `${f.toLowerCase()}_0${k}_{s}`)], (s) => s.toLowerCase());
  expect(ue, { Hips: 'pelvis', Spine: 'spine_01', Spine1: 'spine_03', Spine2: 'spine_05', Neck: 'neck_01', LeftUpLeg: 'thigh_l', LeftToeBase: 'ball_l', LeftArm: 'upperarm_l', LeftForeArm: 'lowerarm_l', RightHandThumb3: 'thumb_03_r' });
  const daz = skeleton([['hip'], ['pelvis', 'hip'], ['abdomenLower', 'hip'], ['abdomenUpper', 'abdomenLower'], ['chestLower', 'abdomenUpper'], ['chestUpper', 'chestLower'], ['neckLower', 'chestUpper'], ['neckUpper', 'neckLower'], ['head', 'neckUpper']],
    [['{s}ThighBend', 'pelvis'], ['{s}ThighTwist', '{s}ThighBend'], ['{s}Shin', '{s}ThighTwist'], ['{s}Foot', '{s}Shin'], ['{s}Toe', '{s}Foot'], ['{s}Collar', 'chestUpper'], ['{s}ShldrBend', '{s}Collar'], ['{s}ShldrTwist', '{s}ShldrBend'], ['{s}ForearmBend', '{s}ShldrTwist'], ['{s}ForearmTwist', '{s}ForearmBend'], ['{s}Hand', '{s}ForearmTwist'],
      ...fingers('{s}Hand', (f, k) => `{s}${f === 'Middle' ? 'Mid' : f === 'Pinky' ? 'Pinky' : f}${k}`)], (s) => s.toLowerCase());
  expect(daz, { Hips: 'hip', Spine: 'abdomenLower', Spine2: 'chestUpper', Neck: 'neckLower', LeftUpLeg: 'lThighBend', LeftLeg: 'lShin', LeftShoulder: 'lCollar', LeftArm: 'lShldrBend', LeftForeArm: 'lForearmBend', RightHand: 'rHand', RightHandIndex1: 'rIndex1' });
  const vroid = skeleton([['J_Bip_C_Hips'], ['J_Bip_C_Spine', 'J_Bip_C_Hips'], ['J_Bip_C_Chest', 'J_Bip_C_Spine'], ['J_Bip_C_UpperChest', 'J_Bip_C_Chest'], ['J_Bip_C_Neck', 'J_Bip_C_UpperChest'], ['J_Bip_C_Head', 'J_Bip_C_Neck'], ['J_Adj_L_FaceEye', 'J_Bip_C_Head']],
    [['J_Bip_{s}_UpperLeg', 'J_Bip_C_Hips'], ['J_Bip_{s}_LowerLeg', 'J_Bip_{s}_UpperLeg'], ['J_Bip_{s}_Foot', 'J_Bip_{s}_LowerLeg'], ['J_Bip_{s}_ToeBase', 'J_Bip_{s}_Foot'], ['J_Bip_{s}_Shoulder', 'J_Bip_C_UpperChest'], ['J_Bip_{s}_UpperArm', 'J_Bip_{s}_Shoulder'], ['J_Bip_{s}_LowerArm', 'J_Bip_{s}_UpperArm'], ['J_Bip_{s}_Hand', 'J_Bip_{s}_LowerArm'],
      ...fingers('J_Bip_{s}_Hand', (f, k) => `J_Bip_{s}_${f === 'Pinky' ? 'Little' : f}${k}`)], (s) => s);
  expect(vroid, { Hips: 'J_Bip_C_Hips', Spine: 'J_Bip_C_Spine', Spine1: 'J_Bip_C_Chest', Spine2: 'J_Bip_C_UpperChest', LeftUpLeg: 'J_Bip_L_UpperLeg', LeftLeg: 'J_Bip_L_LowerLeg', RightArm: 'J_Bip_R_UpperArm', RightForeArm: 'J_Bip_R_LowerArm', LeftHandPinky3: 'J_Bip_L_Little3' });
});

console.log('Using it');
await check('every animation gives a valid pose on the imported rig', () => {
  const A = new Animator(base.character.rig!, base.character.face);
  for (const c of CLIPS) for (const t of [0, c.duration / 2, c.duration]) {
    const f = A.frame(c, t);
    assert.ok(f.rot.every((q) => q.every(Number.isFinite)), `${c.id} at ${t}`);
  }
});
await check('exports bake the animations in, and keep the model\'s textures', async () => {
  const textures: [string, Uint8Array][] = [];
  const withTextures = await characterFromFile(glb, 'hero.glb', { id: 'tex', encodeTexture: async () => ({ bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]), type: 'png' }) });
  for (const [name, bytes] of withTextures.textures) { lib.registerTexture(name, bytes);textures.push([name, bytes]); }
  assert.ok(textures.length > 0, 'textures');
  assert.ok(withTextures.character.mesh.materials.some((m) => m.map?.startsWith('imported-tex-')), 'materials use them');
  const out = await exported(base.character, 'glb', ['idle', 'walk', 'wave']);
  const json = JSON.parse(new TextDecoder().decode(out.subarray(20, 20 + new DataView(out.buffer, out.byteOffset).getUint32(12, true))));
  assert.deepEqual(json.animations.map((a: { name: string }) => a.name), ['Idle', 'Walk', 'Wave']);
  assert.equal(json.skins[0].joints.length, base.report.bones);
});

console.log(`Character import checks passed: ${passed} in ${((performance.now() - started) / 1000).toFixed(1)} s`);
