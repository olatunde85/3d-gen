/**
 * Engine-side check: export a rigged + animated GLB through the real export
 * pipeline, load it with three.js's stock GLTFLoader + AnimationMixer (what a
 * web game would do), and compare every bone at several times in every clip
 * with the generator's own animation evaluator. Run via `npm run test:gltf`.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CLIPS } from '../core/anim/clips';
import { Animator } from '../core/anim/evaluate';
import { AssetLibrary, fetchSource } from '../core/assets';
import { buildHuman } from '../core/human';
import { DEFAULT_PARAMS, PRESETS, type HumanParams } from '../core/params';
import { DEFAULT_EXPORT, exportClipName, planExport, runExport } from '../export';

import {vehicleFor,vehicleLift} from '../core/props/vehicles';

interface Report {
  config: string;
  ok: boolean;
  bones: number;
  clips: number;
  maxAngleDeg: number;
  maxRootErrM: number;
  handMovedM: number;
  /** Facial blend shapes in the file, and the largest weight difference from the generator. */
  faceShapes: number;
  maxFaceErr: number;
  problems: string[];
}

const out = document.getElementById('result')!;

const t0 = performance.now();
const log = (m: string) => console.log(`[gltf-check ${((performance.now() - t0) / 1000).toFixed(1)}s] ${m}`);

async function check(lib: AssetLibrary, config: string, p: HumanParams, loopSuffix: boolean): Promise<Report> {
  const problems: string[] = [];
  log(`${config}: building`);
  const ch = await buildHuman(lib, p);
  log(`${config}: exporting`);
  const settings = { ...DEFAULT_EXPORT, mode: 'animated' as const, format: 'glb' as const, packaging: 'embedded' as const, clips: CLIPS.map((c) => c.id), loopSuffix,vehicleFile:false,climbProps:false };
  const file = await runExport(lib, ch, planExport(ch, settings));
  const buf = file.data.buffer.slice(file.data.byteOffset, file.data.byteOffset + file.data.byteLength) as ArrayBuffer;
  log(`${config}: loading GLB (${(buf.byteLength / 1e6).toFixed(1)} MB)`);
  const gltf = await new GLTFLoader().parseAsync(buf, '');
  log(`${config}: comparing clips`);

  let skinned: THREE.SkinnedMesh | undefined;
  gltf.scene.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh && !skinned) skinned = o as THREE.SkinnedMesh;
  });
  const rig = ch.rig!;
  if (!skinned) problems.push('no SkinnedMesh in the loaded scene');
  const bones = skinned?.skeleton.bones ?? [];
  if (bones.length !== rig.bones.length) problems.push(`skeleton has ${bones.length} bones, expected ${rig.bones.length}`);
  const names = gltf.animations.map((a) => a.name);
  for (const c of CLIPS) if (!names.includes(exportClipName(c.id, settings))) problems.push(`missing animation "${exportClipName(c.id, settings)}"`);

  const animator = new Animator(rig, ch.face);
  const mixer = new THREE.AnimationMixer(gltf.scene);
  let maxAngle = 0, maxRoot = 0, maxFace = 0;
  const shapes = skinned?.morphTargetInfluences?.length ?? 0;
  if (ch.face) {
    const dict = skinned?.morphTargetDictionary ?? {};
    if (shapes !== ch.face.names.length) problems.push(`${shapes} face shapes loaded, expected ${ch.face.names.length}`);
    for (const n of ch.face.names) if (!(n in dict)) problems.push(`face shape "${n}" missing by name`);
  }
  for (const c of CLIPS) {
    const anim = gltf.animations.find((a) => a.name === exportClipName(c.id, settings));
    if (!anim) continue;
    mixer.stopAllAction();
    const action = mixer.clipAction(anim);
    // One-shots play once and hold their last frame, as a game would set them up.
    if (!c.loop) {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    action.reset().play();
    const frames = Math.round(c.duration * 30);
    // Compare at baked keyframes (between keys every player interpolates). Loops use their
    // last keyframe before wrapping; durations aren't always whole frames.
    for (const f of [0, Math.round(frames / 3), Math.round((2 * frames) / 3), c.loop ? frames - 1 : frames]) {
      const t = Math.min(f / 30, c.duration);
      mixer.setTime(t);
      const id=vehicleFor(ch.params.vehicle,c.id),scale=Math.max(...rig.bones.flatMap(b=>[b.head[1],b.tail[1]]))/1.8;
      const want = animator.frame(c, t,{vehicleLift:id?vehicleLift(id,scale):0});
      bones.forEach((b, i) => {
        const q = new THREE.Quaternion(...want.rot[i]);
        const err = (b.quaternion.angleTo(q) * 180) / Math.PI;
        if (err > 1 && problems.length < 6) problems.push(`${c.id} t=${t.toFixed(3)} ${rig.bones[i].name}: ${err.toFixed(1)} deg`);
        maxAngle = Math.max(maxAngle, err);
        const rp = want.rootPos.get(i);
        if (rp) maxRoot = Math.max(maxRoot, b.position.distanceTo(new THREE.Vector3(...rp)));
      });
      if (want.morph && skinned?.morphTargetInfluences)
        want.morph.forEach((w, s) => (maxFace = Math.max(maxFace, Math.abs(skinned!.morphTargetInfluences![s] - w))));
    }
  }

  // Deformation: a vertex weighted to the right hand must move when waving.
  let moved = 0;
  if (skinned) {
    // Bones are in skin-joint order = rig order (three.js sanitises names, e.g. "wrist.R" -> "wristR").
    const hand = rig.bones.findIndex((b) => b.name === 'RightHand' || b.name === 'wrist.R');
    const si = skinned.geometry.getAttribute('skinIndex'), sw = skinned.geometry.getAttribute('skinWeight');
    let vi = -1, best = 0;
    for (let v = 0; v < si.count; v++)
      for (let k = 0; k < 4; k++) if (si.getComponent(v, k) === hand && sw.getComponent(v, k) > best) [vi, best] = [v, sw.getComponent(v, k)];
    const pos = (t: number | null) => {
      mixer.stopAllAction();
      if (t !== null) {
        const a = mixer.clipAction(gltf.animations.find((x) => x.name.startsWith('Wave'))!);
        a.reset().play();
        mixer.setTime(t);
      } else skinned!.skeleton.pose();
      gltf.scene.updateMatrixWorld(true);
      const v = new THREE.Vector3().fromBufferAttribute(skinned!.geometry.getAttribute('position'), vi);
      return skinned!.applyBoneTransform(vi, v).clone();
    };
    if (vi >= 0) moved = pos(null).distanceTo(pos(0.5));
    else problems.push(`no vertex weighted to the hand bone (index ${hand})`);
    if (moved < 0.2) problems.push(`right-hand vertex moved only ${moved.toFixed(3)} m when waving`);
  }
  if (maxAngle > 1) problems.push(`bone rotations differ by up to ${maxAngle.toFixed(2)} degrees`);
  if (maxRoot > 0.005) problems.push(`root position differs by up to ${maxRoot.toFixed(4)} m`);
  if (maxFace > 0.01) problems.push(`face weights differ by up to ${maxFace.toFixed(3)}`);
  return { config, ok: !problems.length, bones: bones.length, clips: gltf.animations.length, maxAngleDeg: +maxAngle.toFixed(4), maxRootErrM: +maxRoot.toFixed(5), handMovedM: +moved.toFixed(3), faceShapes: shapes, maxFaceErr: +maxFace.toFixed(4), problems };
}

(async () => {
  try {
    const lib = await new AssetLibrary(fetchSource('/assets/')).init();
    const base = { ...DEFAULT_PARAMS, ...PRESETS['The Adventurer'] };
    const reports = [
      await check(lib,'game rig, fitted vehicle cabin/deck heights',{...base,vehicle:'auto',carry:'none',weapon:'none'},false),
      await check(lib, 'game rig, A-pose', { ...base, rig: 'game', restPose: 'A' }, false),
      await check(lib, 'game rig, T-pose, angry, -loop names', { ...base, rig: 'game', restPose: 'T', faceBones: true, expression: 'angry' }, true),
      await check(lib, 'lite rig', { ...base, rig: 'game_lite' }, false),
      await check(lib, 'full MakeHuman rig, fitted SUV', { ...base, rig: 'full',vehicle:'suv',carry:'none',weapon:'none' }, false),
      await check(lib, 'game rig, parcel and pistol', { ...base, rig: 'game', carry:'parcel',weapon:'pistol' }, false),
      await check(lib, 'full T-pose, parcel and rifle', { ...base, rig:'full',restPose:'T',carry:'parcel',weapon:'rifle' }, false),
    ];
    out.textContent = JSON.stringify({ ok: reports.every((r) => r.ok), reports }, null, 1);
  } catch (e) {
    out.textContent = JSON.stringify({ ok: false, error: String((e as Error).stack ?? e) });
  }
  document.title = 'DONE';
  // When run by scripts/gltf-check.ts, report back to the test runner.
  fetch('/__report', { method: 'POST', body: out.textContent }).catch(() => {});
})();
