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
