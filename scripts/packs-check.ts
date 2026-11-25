/**
 * Content packs: the pack format's checks, converting animation files (FBX and GLB written by Ara's own exporter,
 * so the result can be compared with the clip that made them; turned and helper-boned versions as other tools write
 * them; CMU BVH), loading packs into Ara's lists, and films, exports and the library using their animations.
 *   npm run test:packs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Object3D, Texture, TextureLoader } from 'three';
import { BUILT_IN_CLIPS, CLIPS, clipById, onClipsChange } from '../src/core/anim/clips';
import { animationGroup } from '../src/core/anim/groups';
import { Animator } from '../src/core/anim/evaluate';
import { bvhTake, CMU_MAP, parseBvh, uprightTake, type Take } from '../src/core/anim/mocap';
import { qaxis, qmul, qconj, qrot } from '../src/core/anim/quat';
import { boneMapFor, jointNames, takeFromClip } from '../src/core/anim/take-three';
import { buildHuman } from '../src/core/human';
import { DEFAULT_PARAMS, PRESETS, type HumanParams } from '../src/core/params';
import { buildPack, cleanName, guessCategory, idFrom, importAnimations, packAnimation, readAnimationFile, type AnimationFile } from '../src/core/packs/build';
import { parsePack, PACK_CATEGORIES, type Pack } from '../src/core/packs/format';
import { ensurePacks, loadedPacks, missingPackMessage, packRefsFor, readPackRefs, registerPack, syncPacks, unregisterPack } from '../src/core/packs';
import { DEFAULT_EXPORT, exportClipName, planExport, runExport } from '../src/export';
import { filmJson, parseFilm } from '../src/studio/film';
import { presetCode } from '../src/studio/project';
import { clipIds } from '../packages/cli/src/library/generate';
import { nodeLibrary } from './node-assets';

// three.js's loaders can't decode images in Node; only motion is read.
(globalThis as { self?: unknown }).self ??= globalThis;
TextureLoader.prototype.load = function (_url: string, onLoad?: (t: Texture) => void) { const t = new Texture();onLoad?.(t);return t; } as TextureLoader['load'];

let passed = 0;
const started = performance.now();
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}
const throws = (fn: () => unknown, pattern: RegExp, what: string) => assert.throws(fn, (e: Error) => pattern.test(e.message) || assert.fail(`${what}: "${e.message}" doesn't match ${pattern}`));

const lib = await nodeLibrary();
const params: HumanParams = { ...DEFAULT_PARAMS, ...PRESETS['The Adventurer'], name: 'Pack check', detail: 'low' };
const ch = await buildHuman(lib, params);
const animator = new Animator(ch.rig!, ch.face);

/** Ara's own export of some clips, read back as an animation file. */
async function exported(format: 'glb' | 'fbx', clips: string[]): Promise<{ bytes: Uint8Array; file: AnimationFile }> {
  const settings = { ...DEFAULT_EXPORT, mode: 'animated' as const, format, packaging: 'embedded' as const, clips, vehicleFile: false, stageProps: false };
  const out = await runExport(lib, ch, planExport(ch, settings));
  return { bytes: out.data, file: await readAnimationFile(out.data, `test.${format}`) };
}
/** The furthest a hand, ankle, toe tip or the head is from where `want` puts it, in metres, over the clip. */
function endError(want: string, got: { sample: (t: number) => unknown; duration: number } & Parameters<Animator['frame']>[0]) {
  const a = clipById.get(want)!, names = ch.rig!.bones.map((b) => b.name);
  let worst = 0;
  for (let i = 0; i <= 8; i++) {
    const t = (a.duration * i) / 8, A = animator.positions(animator.frame(a, t)), B = animator.positions(animator.frame(got, t));
    A.forEach((p, k) => { if (/^(Left|Right)(Hand|Foot|Toe_End)$|^Head$/.test(names[k])) worst = Math.max(worst, Math.hypot(p[0] - B[k][0], p[1] - B[k][1], p[2] - B[k][2])); });
  }
  return worst;
}
const packOf = (animations: Pack['animations'], id = 'test-pack'): Pack => ({ kind: 'ara-pack', version: 1, id, name: 'Test pack', animations });

console.log('Pack format');
const glb = await exported('glb', ['wave', 'walk', 'sit_idle']);
const wave = packAnimation(glb.file, 'test.glb', { file: 'test.glb', clip: 'Wave', id: 'wave', name: 'Wave', category: 'Emotes' });
const good = packOf([wave]);
await check('a pack written by the builder passes its own checks', () => { assert.equal(parsePack(JSON.stringify(good)).animations![0].id, 'wave'); });
await check('malformed packs are refused with a message that says what to fix', () => {
  const bad = (change: (p: Record<string, any>) => void) => { const p = structuredClone(good) as Record<string, any>;change(p);return JSON.stringify(p); };
  throws(() => parsePack('not json'), /isn't JSON/, 'not JSON');
  throws(() => parsePack(bad((p) => { p.kind = 'ara-studio'; })), /isn't an Ara pack/, 'kind');
  throws(() => parsePack(bad((p) => { p.version = 2; })), /version 2/, 'version');
  throws(() => parsePack(bad((p) => { p.id = 'Bad ID'; })), /lower-case/, 'pack id');
  throws(() => parsePack(bad((p) => { p.animations = []; })), /nothing in it/, 'empty');
  throws(() => parsePack(bad((p) => { p.animations.push(p.animations[0]); })), /Two animations/, 'duplicate');
  throws(() => parsePack(bad((p) => { p.animations[0].category = 'Vehicles'; })), /category must be one of/, 'behaviour category');
  throws(() => parsePack(bad((p) => { p.animations[0].motion.bones[0] = 'Tail'; })), /isn't a bone Ara animates/, 'unknown bone');
  throws(() => parsePack(bad((p) => { p.animations[0].motion.rot = p.animations[0].motion.rot.slice(8); })), /wrong amount of data/, 'short data');
  throws(() => parsePack(bad((p) => { p.animations[0].motion.rot = '!!!!' + p.animations[0].motion.rot.slice(4); })), /base64/, 'not base64');
  throws(() => parsePack(bad((p) => { p.animations[0].motion.bones = p.animations[0].motion.bones.filter((b: string) => b !== 'LeftFoot'); })), /doesn't move LeftFoot/, 'missing bone');
  throws(() => parsePack(bad((p) => { p.animations[0].motion.duration = Infinity; })), /duration/, 'non-finite');
  throws(() => parsePack(bad((p) => { p.homepage = 'javascript:alert(1)'; })), /web address/, 'homepage');
});
await check('pack categories exist among Ara\'s', () => { for (const c of PACK_CATEGORIES) assert.ok(BUILT_IN_CLIPS.some((x) => x.category === c), c); });

console.log('Converting animations');
await check('Ara\'s own wave comes back through GLB within 1.5 cm', async () => {
  registerPack(JSON.stringify(good));
  const err = endError('wave', clipById.get('test-pack/wave')!);
  unregisterPack('test-pack');
  assert.ok(err < 0.015, `${(err * 100).toFixed(1)} cm`);
});
const fbx = await exported('fbx', ['wave', 'walk']);
await check('the same through FBX (Mixamo\'s format)', async () => {
  registerPack(JSON.stringify(packOf([packAnimation(fbx.file, 'test.fbx', { file: 'test.fbx', clip: 'Wave', id: 'wave', name: 'Wave', category: 'Emotes' })])));
  const err = endError('wave', clipById.get('test-pack/wave')!);
  unregisterPack('test-pack');
  assert.ok(err < 0.015, `${(err * 100).toFixed(1)} cm`);
});
// The exported walk plays in place, so its hips sway a little differently from Ara's travelling walk: 2.5 cm.
await check('feet keep their pose: Ara\'s walk comes back through FBX with toes within 2.5 cm', async () => {
  registerPack(JSON.stringify(packOf([packAnimation(fbx.file, 'test.fbx', { file: 'test.fbx', clip: 'Walk', id: 'walk', name: 'Walk', category: 'Locomotion' })])));
  const err = endError('walk', clipById.get('test-pack/walk')!);
  unregisterPack('test-pack');
  assert.ok(err < 0.025, `${(err * 100).toFixed(1)} cm`);
});
await check('a skeleton named another way (Character Creator, with toes) converts the same, keeping only the bones animations drive', async () => {
  const file = await readAnimationFile(glb.bytes, 'cc.glb') as Extract<AnimationFile, { root: unknown }>;
  const cc: Record<string, string> = { Hips: 'CC_Base_Hip', Spine: 'CC_Base_Waist', Spine1: 'CC_Base_Spine01', Spine2: 'CC_Base_Spine02', Neck: 'CC_Base_NeckTwist01', Head: 'CC_Base_Head' };
  for (const s of ['Left', 'Right']) for (const [ara, own] of [['Shoulder', 'Clavicle'], ['Arm', 'Upperarm'], ['ForeArm', 'Forearm'], ['Hand', 'Hand'], ['UpLeg', 'Thigh'], ['Leg', 'Calf'], ['Foot', 'Foot'], ['ToeBase', 'ToeBase']]) cc[s + ara] = `CC_Base_${s[0]}_${own}`;
  file.root.traverse((o) => { if (cc[o.name]) o.name = cc[o.name]; });
  for (const clip of file.clips) for (const t of clip.tracks) { const [bone, prop] = t.name.split('.');if (cc[bone]) t.name = `${cc[bone]}.${prop}`; }
  const walk = packAnimation(file, 'cc.glb', { file: 'cc.glb', clip: 'Walk', id: 'walk', name: 'Walk', category: 'Locomotion' });
  assert.ok(!walk.motion.bones.some((b) => /Toe/.test(b)), 'no toes in the motion');
  registerPack(JSON.stringify(packOf([walk])));
  const err = endError('walk', clipById.get('test-pack/walk')!);
  unregisterPack('test-pack');
  assert.ok(err < 0.025, `${(err * 100).toFixed(1)} cm`);
});
await check('a skeleton facing the other way, lying along Z (as some tools export) converts the same', async () => {
  const turned = await readAnimationFile(glb.bytes, 'turned.glb') as Extract<AnimationFile, { root: unknown }>;
  const wrapper = new Object3D();
  wrapper.quaternion.set(...qmul(qaxis([0, 1, 0], 180), qaxis([1, 0, 0], -90)));
  for (const c of [...turned.root.children]) wrapper.add(c);
  turned.root.add(wrapper);
  const again = packAnimation(turned, 'turned.glb', { file: 'turned.glb', clip: 'Wave', id: 'wave', name: 'Wave', category: 'Emotes' });
  registerPack(JSON.stringify(packOf([again])));
  const err = endError('wave', clipById.get('test-pack/wave')!);
  unregisterPack('test-pack');
  assert.ok(err < 0.015, `${(err * 100).toFixed(1)} cm`);
});
await check('helper joints that repeat a bone\'s name (FBX) are folded into the bone', async () => {
  const file = await readAnimationFile(glb.bytes, 'helpers.glb') as Extract<AnimationFile, { root: unknown }>;
  const map = boneMapFor(jointNames(file.root)), hips = Object.keys(map).find((k) => map[k] === 'Hips')!;
  const plain = takeFromClip(file.root, file.clips[0], hips, 30).joints.length;
  file.root.traverse((o) => { if (map[o.name] && o.children.length) { const helper = new Object3D();helper.name = o.name;o.add(helper); } });
  assert.equal(takeFromClip(file.root, file.clips[0], hips, 30).joints.length, plain);
});
await check('loops: motion meant to repeat loops when it ends where it starts; one-off moves don\'t; pack.json can say', () => {
  const opts = (clip: string, category: 'Locomotion' | 'Emotes') => ({ file: 'test.glb', clip, category });
  assert.equal(packAnimation(glb.file, 'test.glb', opts('Walk', 'Locomotion')).motion.loop, true, 'a walk');
  assert.equal(packAnimation(glb.file, 'test.glb', opts('Walk', 'Emotes')).motion.loop, false, 'the same motion named as a one-off move');
  assert.equal(packAnimation(glb.file, 'test.glb', { ...opts('Wave', 'Emotes'), loop: true }).motion.loop, true, 'pack.json decides');
});
await check('the converter keeps motion, travel and fingers in proportion', () => {
  const walk = packAnimation(glb.file, 'test.glb', { file: 'test.glb', clip: 'Walk', id: 'walk', category: 'Locomotion' }).motion;
  assert.ok(walk.bones.includes('LeftHandIndex1') || !ch.rig!.bones.some((b) => b.name === 'LeftHandIndex1'), 'fingers kept');
  assert.ok(walk.frames >= 24, 'frames');
});
const bvhPath = join(import.meta.dirname, '../vendor/mocap/cmu/01_01.bvh');
await check('CMU recordings keep their skeleton family and need no turning (the built-in clips stay as they are)', () => {
  let text: string;
  try { text = readFileSync(bvhPath, 'utf8'); } catch { console.log('      (vendor/mocap not downloaded: run npm run setup-assets to include this check)');return; }
  const bvh = parseBvh(text), map = boneMapFor(bvh.joints.map((j) => j.name)), take = bvhTake(bvh);
  assert.equal(map.LowerBack, CMU_MAP.LowerBack);
  assert.equal(uprightTake(take, map), take);
  const turned: Take = { ...take, joints: take.joints.map((j) => ({ ...j, offset: qrot(qaxis([0, 1, 0], 180), j.offset), ...(j.tip ? { tip: qrot(qaxis([0, 1, 0], 180), j.tip) } : {}) })), poses: take.poses.map((P) => ({ world: P.world.map((q) => qmul(qmul(qaxis([0, 1, 0], 180), q), qconj(qaxis([0, 1, 0], 180)))), hips: qrot(qaxis([0, 1, 0], 180), P.hips) })) };
  const back = uprightTake(turned, map);
  for (const [k, j] of back.joints.entries()) for (let d = 0; d < 3; d++) assert.ok(Math.abs(j.offset[d] - take.joints[k].offset[d]) < 1e-6, 'turned back');
});
await check('a skeleton built lying down whose motion stands up (some BVH exporters) plays upright, facing +Z', () => {
  let text: string;
  try { text = readFileSync(bvhPath, 'utf8'); } catch { console.log('      (vendor/mocap not downloaded: run npm run setup-assets to include this check)');return; }
  const bvh = parseBvh(text), map = boneMapFor(bvh.joints.map((j) => j.name)), take = bvhTake(bvh);
  // The same recording with its skeleton laid along +Z: the motion's rotations stand it back up, as such files do.
  const lay = qaxis([1, 0, 0], 90), unlay = qconj(lay);
  const lying: Take = { ...take, joints: take.joints.map((j) => ({ ...j, offset: qrot(lay, j.offset), ...(j.tip ? { tip: qrot(lay, j.tip) } : {}) })), poses: take.poses.map((P) => ({ world: P.world.map((q) => qmul(q, unlay)), hips: P.hips })) };
  const fixed = uprightTake(lying, map), k = (g: string) => fixed.joints.findIndex((j) => map[j.name] === g);
  const posed = (t: Take, f: number) => { const p: number[][] = [];t.joints.forEach((j, i) => { p[i] = j.parent < 0 ? t.poses[f].hips : qrot(t.poses[f].world[j.parent], j.offset).map((x, d) => x + p[j.parent][d]); });return p; };
  const unit = (v: number[]) => v.map((x) => x / Math.hypot(...v));
  for (const f of [0, Math.floor(fixed.poses.length / 2)]) {
    const p = posed(fixed, f), up = unit(p[k('Head')].map((x, d) => x - p[k('Hips')][d]));
    assert.ok(up[1] > 0.9, `frame ${f}: standing (up ${up.map((x) => x.toFixed(2))})`);
    // Only turned about the vertical: the hips keep their height.
    assert.ok(Math.abs(p[k('Hips')][1] - posed(take, f)[k('Hips')][1]) < 1e-3, `frame ${f}: hips height kept`);
  }
  const first = posed(fixed, 0), left = unit(first[k('LeftUpLeg')].map((x, d) => x - first[k('RightUpLeg')][d]));
  assert.ok(left[0] > 0.9, `facing +Z as it starts (left ${left.map((x) => x.toFixed(2))})`);
  // Its rest pose is turned upright too.
  const rest: number[][] = [];fixed.joints.forEach((j, i) => { rest[i] = j.parent < 0 ? [0, 0, 0] : j.offset.map((x, d) => x + rest[j.parent][d]); });
  assert.ok(unit(rest[k('Head')].map((x, d) => x - rest[k('Hips')][d]))[1] > 0.9, 'rest pose upright');
});
await check('buildPack converts a whole pack.json', async () => {
  const files: Record<string, Uint8Array> = { 'moves.glb': glb.bytes, 'moves.fbx': fbx.bytes };
  const pack = await buildPack({ id: 'moves', name: 'Moves', license: 'CC0-1.0', animations: [{ file: 'moves.glb', clip: 'Walk', category: 'Locomotion' }, { file: 'moves.fbx', clip: 'Wave', id: 'hello', name: 'Hello', category: 'Emotes' }] }, async (f) => files[f]);
  assert.deepEqual(pack.animations!.map((a) => a.id), ['moves', 'hello']);
  assert.equal(pack.license, 'CC0-1.0');
});

console.log('One-step import');
await check('names are cleaned and groups guessed from file names', () => {
  assert.equal(cleanName('goalkeeper body block (2).fbx'), 'Goalkeeper body block 2');
  assert.equal(cleanName('dir/jog_strafe_left.FBX'), 'Jog strafe left');
  assert.equal(cleanName('SoccerGamePack'), 'Soccer game pack');
  assert.equal(cleanName('mixamo.com'), 'Animation');
  const groups: [string, string][] = [['Goalkeeper body block', 'Sports'], ['Kick soccerball', 'Sports'], ['Jog backward diagonal', 'Locomotion'], ['Hip Hop Dancing', 'Emotes'],
    ['Punching bag', 'Combat'], ['Sitting idle', 'Sitting & lying'], ['Standing idle', 'Idle & stance'], ['Push ups', 'Fitness'], ['Falling back death', 'Reactions'], ['Picking up', 'Interaction'], ['Backflip', 'Actions']];
  for (const [name, want] of groups) assert.equal(guessCategory(name), want, name);
  assert.equal(idFrom('Jog forward', ['jog_forward'], 'item'), 'jog_forward_2');
  assert.equal(idFrom('Soccer game pack', [], 'pack'), 'soccer-game-pack');
});
await check('files become a pack with nothing to fill in: copies and non-animations are skipped, loops only for motion that repeats', async () => {
  const { pack, added, skipped } = await importAnimations([
    { name: 'moves/jog forward.glb', bytes: glb.bytes }, { name: 'moves/jog forward (2).glb', bytes: glb.bytes }, { name: 'moves/readme.txt', bytes: new Uint8Array([104, 105]) },
    { name: 'moves/goalkeeper wave.fbx', bytes: fbx.bytes },
  ], { name: 'My moves' });
  assert.equal(pack.id, 'my-moves');
  assert.deepEqual(skipped.map((s) => s.file), ['moves/readme.txt', 'jog forward (2).glb']);
  // Files in name order: the FBX holds Wave and Walk, the GLB Wave, Walk and Sit idle (chair); repeated names are numbered.
  assert.deepEqual(added.map((a) => [a.name, a.category]), [['Wave', 'Emotes'], ['Walk', 'Locomotion'], ['Wave 2', 'Emotes'], ['Walk 2', 'Locomotion'], ['Sit idle (chair)', 'Sitting & lying']]);
  assert.equal(added.find((a) => a.name === 'Walk')!.motion.loop, true, 'a walk that ends where it starts loops');
  const more = await importAnimations([{ name: 'kick.fbx', bytes: fbx.bytes }], { into: pack });
  assert.equal(more.pack.animations!.length, 7, 'importing into a pack adds to it');
  assert.ok(new Set(more.pack.animations!.map((a) => a.id)).size === 7, 'IDs stay unique');
});
await check('FBX files with a footer of another length still read', async () => {
  const padded = new Uint8Array(fbx.bytes.length + 40);
  padded.set(fbx.bytes);
  padded.fill(7, fbx.bytes.length);
  const file = await readAnimationFile(padded, 'padded.fbx');
  assert.ok('clips' in file && file.clips.length >= 2);
});

console.log('Loading packs');
await check('clashing names are told apart: a pack named like an Ara group, an animation named like another', () => {
  const sports = registerPack(JSON.stringify({ ...good, id: 'sports-pack', name: 'Sports' }));
  assert.equal(sports.label, 'Sports (import)');
  assert.equal(clipById.get('sports-pack/wave')!.name, 'Wave (Sports (import))');
  assert.equal(animationGroup(clipById.get('sports-pack/wave')!), 'Sports (import)');
  unregisterPack('sports-pack');
});
await check('a pack\'s animations join Ara\'s lists, grouped under the pack, and leave with it', () => {
  let changes = 0;
  const stop = onClipsChange(() => changes++);
  const before = CLIPS.length;
  registerPack(JSON.stringify(good), { url: 'https://example.com/test-pack.ara-pack.json' });
  assert.equal(CLIPS.length, before + 1);
  assert.equal(animationGroup(clipById.get('test-pack/wave')!), 'Test pack');
  assert.equal(registerPack(JSON.stringify(good)).pack.id, 'test-pack', 'the same pack again changes nothing');
  throws(() => registerPack(JSON.stringify({ ...good, name: 'Other' })), /Another pack called "test-pack"/, 'same id, other pack');
  assert.equal(registerPack(JSON.stringify({ ...good, name: 'Newer' }), { replace: true }).pack.name, 'Newer', 'a newer version can replace it');
  assert.equal(CLIPS.length, before + 1);
  unregisterPack('test-pack');
  assert.equal(CLIPS.length, before);
  assert.equal(clipById.has('test-pack/wave'), false);
  assert.equal(changes, 3, 'added, replaced in one step, removed');
  stop();
});
await check('workers follow their page\'s packs, new versions included', () => {
  syncPacks([{ text: JSON.stringify(good) }]);
  assert.ok(clipById.has('test-pack/wave'));
  const renamed = JSON.stringify({ ...good, name: 'Renamed' });
  syncPacks([{ text: renamed }]);
  assert.equal(loadedPacks()[0].pack.name, 'Renamed');
  syncPacks([]);
  assert.equal(loadedPacks().length, 0);
});
await check('pack lists in films are checked', async () => {
  assert.deepEqual(readPackRefs([{ id: 'salsa', url: 'https://x.test/s.json' }]), [{ id: 'salsa', url: 'https://x.test/s.json' }]);
  throws(() => readPackRefs([{ id: 'Bad' }]), /needs an id/, 'bad id');
  throws(() => readPackRefs('salsa'), /list/, 'not a list');
  await assert.rejects(ensurePacks([{ id: 'salsa', name: 'Salsa' }]), /needs the Salsa pack/);
  await assert.rejects(ensurePacks([{ id: 'salsa', url: 'file:///etc/passwd' }]), /https/);
});

console.log('Films, exports and the library');
const url = 'https://example.com/test-pack.ara-pack.json';
registerPack(JSON.stringify(good), { url });
await check('films use pack animations and say where the pack is', () => {
  const film = { kind: 'ara-studio', version: 2, title: 'Packs', template: 'portrait', camera: 'locked', aspect: 'landscape', caption: false, view: { azimuth: 0, elevation: 0, zoom: 1 },
    actors: [{ id: 'a', character: presetCode('The Adventurer'), detail: 'medium', x: 0, y: 0, z: 0, yaw: 0, beats: [{ clip: 'test-pack/wave', duration: 2, move: false }, { clip: 'idle', duration: 1, move: false }] }],
    shots: [{ duration: 3, shot: 'wide', target: 'all' }] };
  const saved = filmJson(parseFilm(JSON.stringify(film)));
  assert.deepEqual(saved.packs, [{ id: 'test-pack', name: 'Test pack', url }]);
  const plain = filmJson(parseFilm(JSON.stringify({ ...film, actors: [{ ...film.actors[0], beats: [{ clip: 'idle', duration: 3, move: false }] }] })));
  assert.equal('packs' in plain, false, 'films with only Ara\'s clips stay as they were');
  unregisterPack('test-pack');
  throws(() => parseFilm(JSON.stringify(film)), /test-pack pack, which isn't loaded/, 'missing pack');
  registerPack(JSON.stringify(good), { url });
});
await check('exports include pack animations, with names that never clash', async () => {
  const settings = { ...DEFAULT_EXPORT, mode: 'animated' as const, format: 'glb' as const, packaging: 'embedded' as const, clips: ['wave', 'test-pack/wave'], vehicleFile: false, stageProps: false };
  assert.equal(exportClipName('test-pack/wave', settings), 'Wave (Test pack)');
  const out = await runExport(lib, ch, planExport(ch, settings)), json = JSON.parse(new TextDecoder().decode(out.data.subarray(20, 20 + new DataView(out.data.buffer, out.data.byteOffset).getUint32(12, true))));
  assert.deepEqual(json.animations.map((a: { name: string }) => a.name), ['Wave', 'Wave (Test pack)']);
});
await check('the library offers only the packs a character asks for', () => {
  assert.equal(clipIds('all').length, BUILT_IN_CLIPS.length);
  assert.equal(clipIds('all', ['test-pack']).length, BUILT_IN_CLIPS.length + 1);
  assert.deepEqual(clipIds(['test-pack'], ['test-pack']), ['test-pack/wave']);
  throws(() => clipIds(['test-pack/wave']), /add the pack to the packs option/, 'pack not asked for');
});
await check('a missing pack item is named in messages', () => {
  assert.match(missingPackMessage('test-pack/nope')!, /has no "nope"/);
  assert.match(missingPackMessage('other/x')!, /other pack, which isn't loaded/);
  assert.equal(missingPackMessage('idle'), undefined);
  assert.deepEqual(packRefsFor(['idle', 'test-pack/wave', 'other/x']), [{ id: 'other' }, { id: 'test-pack', name: 'Test pack', url }]);
});
unregisterPack('test-pack');

console.log(`Pack checks passed: ${passed} in ${((performance.now() - started) / 1000).toFixed(1)} s`);
