import { strToU8, zipSync, type Zippable } from 'fflate';
import { CLIPS, clipById } from '../core/anim/clips';
import { Animator, type BakedClip } from '../core/anim/evaluate';
import type { AssetLibrary } from '../core/assets';
import { meshWithoutWeapon, textureFiles, weaponPropMesh, type Character } from '../core/human';
import { quatOf } from '../core/rig/rig';
import { exportFBX } from './fbx';
import { exportGLB } from './glb';
import { exportOBJ } from './obj';
import { exportClipName, planExport, stemOf, type ExportPlan, type ExportSettings, type PlannedFile } from './plan';
import {Vehicle} from '../core/props/vehicle';
import {vehicleFor,vehicleLift} from '../core/props/vehicles';
import { climbPropMesh } from '../core/props/climb-props';

export * from './plan';

export type ExportFormat = 'glb' | 'fbx' | 'obj' | 'zip';

export interface ExportFile {
  name: string;
  data: Uint8Array;
  mime: string;
}

export const fileStem = stemOf;

const LICENSE = `Character assets derive from MakeHuman (makehumancommunity.org), released as
CC0 1.0 (public domain) by Data Collection AB, Joel Palmius and Jonas Hauquier.
Free for commercial and non-commercial use, no attribution required.

The Walk, Slouch walk, Run, Strafe left/right, Jump, Low punch, Cry and the chair (sit down,
sit idle, stand up) animations are retargeted from the CMU Graphics Lab Motion Capture
Database (mocap.cs.cmu.edu; created with funding from NSF EIA-0196217). They may be used in
commercial and non-commercial products; the motion data itself may not be resold on its own.
`;

async function loadTextures(lib: AssetLibrary, ch: Character): Promise<Map<string, Uint8Array>> {
  const files = textureFiles(ch.mesh);
  const data = await Promise.all(files.map((f) => lib.texture(f)));
  return new Map(files.map((f, i) => [f, data[i]]));
}

/** Engine-neutral skeleton description (bind pose), for retargeting. */
function rigJson(ch: Character) {
  const r = ch.rig!;
  return {
    type: r.type,
    restPose: r.restPose,
    units: 'metres, +Y up, character faces +Z',
    boneAxes: 'local +Y along the bone, +Z toward the front',
    bones: r.bones.map((b) => ({
      name: b.name,
      parent: b.parent >= 0 ? r.bones[b.parent].name : null,
      head: b.head.map((x) => +x.toFixed(5)),
      tail: b.tail.map((x) => +x.toFixed(5)),
      rotation: quatOf(b.rot).map((x) => +x.toFixed(6)),
    })),
  };
}

function readme(ch: Character, plan: ExportPlan): string {
  return [
    `${ch.params.name} - exported by Ara 3D Gen`,
    '',
    `Export:  ${plan.summary}`,
    `Height:  ${(ch.height * 100).toFixed(0)} cm`,
    '',
    'Files',
    ...plan.files.map((f) => `  ${f.path.padEnd(32)} ${f.desc}`),
    '',
    ...(plan.notes.length ? ['Notes', ...plan.notes.map((n) => `  - ${n}`), ''] : []),
    'Conventions: +Y up, character faces +Z. GLB/OBJ in metres, FBX in centimetres.',
    ...(ch.rig ? ['Game rigs use Mixamo bone names (Hips, Spine, LeftArm...), so Mixamo / Unity Humanoid / Unreal retargeting maps them automatically.'] : []),
    '',
  ].join('\n');
}

/** Execute an export plan: one file, or a zip with exactly the planned files. */
export interface ExportExtras {
  previewPng?: Uint8Array;
  /** Progress: what is happening and the fraction done (0..1). */
  onProgress?: (label: string, frac: number) => void;
}

export async function runExport(lib: AssetLibrary, ch: Character, plan: ExportPlan, extras: ExportExtras = {}): Promise<ExportFile> {
  const stem = stemOf(ch.params.name);
  // Progress units: one per clip to bake, one per file to write, one for the zip.
  const clipIds = [...new Set(plan.files.flatMap((f) => f.clips))];
  const total = clipIds.length + plan.files.length + (plan.zipped ? 1 : 0);
  let done = 0;
  const progress = (label: string) => extras.onProgress?.(label, Math.min(1, done++ / total));
  progress('Loading textures');
  done = 0;
  const textures = await loadTextures(lib, ch);
  const animator = ch.rig ? new Animator(ch.rig, ch.face) : null;
  const riderScale=ch.rig?Math.max(...ch.rig.bones.flatMap(b=>[b.head[1],b.tail[1]]))/1.8:1;
  const baked = new Map<string, BakedClip>();
  const bake = (ids: string[]): BakedClip[] =>
    ids.map((id) => {
      let b = baked.get(id);
      if (!b) {
        const c = clipById.get(id)!;
        progress(`Baking ${c.name}`);
        const vehicle=vehicleFor(ch.params.vehicle,id);
        b = { name: exportClipName(id, plan.settings), loop: c.loop, ...animator!.bake(c, 30, { rootMotion: plan.settings.rootMotion,vehicleLift:vehicle?vehicleLift(vehicle,riderScale):0 }) };
        baked.set(id, b);
      }
      return b;
    });

  const build = (f: PlannedFile): Uint8Array | Zippable => {
    if (f.kind !== 'meta') progress(`Writing ${f.path.replace(/\/$/, '')}`);
    if (f.kind === 'obj') {
      const { obj, mtl } = exportOBJ(ch.mesh, stem, `${stem}.mtl`);
      const out: Zippable = { [`${stem}.obj`]: strToU8(obj), [`${stem}.mtl`]: strToU8(mtl) };
      for (const [n, d] of textures) out[`textures/${n}`] = [d, { level: 0 }];
      return out;
    }
    if (f.kind === 'meta') {
      if (f.path.endsWith('.params.json')) return strToU8(JSON.stringify(ch.params, null, 2));
      if (f.path.endsWith('.rig.json')) return strToU8(JSON.stringify(rigJson(ch), null, 1));
      if (f.path === 'README.txt') return strToU8(readme(ch, plan));
      if (f.path === 'LICENSE.txt') return strToU8(LICENSE);
      return extras.previewPng ?? new Uint8Array();
    }
    if(f.kind==='vehicle'){
      const vehicle=new Vehicle(f.vehicleId!,ch.rig!,animator!,clipById.get(f.vehicleClip!)!,ch.params.vehicleStyle);
      try{
        const {mesh,rig,bake}=vehicle.asset(),name=`${stem}_${f.vehicleId}`;
        if(f.format==='obj'){const {obj,mtl}=exportOBJ(mesh,name,`${name}.mtl`);return{[`${name}.obj`]:strToU8(obj),[`${name}.mtl`]:strToU8(mtl)};}
        const write=f.format==='glb'?exportGLB:exportFBX,clips=f.clips.map(id=>({...bake(clipById.get(id)!),name:exportClipName(id,plan.settings)}));
        return write(mesh,name,new Map(),f.rigged?rig:undefined,clips,{});
      }finally{vehicle.dispose();}
    }
    if (f.kind === 'climb') {
      const mesh = climbPropMesh(f.climbProp!, riderScale), name = `${stem}_${f.climbProp}`;
      if (f.format === 'obj') { const { obj, mtl } = exportOBJ(mesh, name, `${name}.mtl`); return { [`${name}.obj`]: strToU8(obj), [`${name}.mtl`]: strToU8(mtl) }; }
      return (f.format === 'glb' ? exportGLB : exportFBX)(mesh, name, new Map(), undefined, [], {});
    }
    const write = f.format === 'glb' ? exportGLB : exportFBX;
    if (f.kind === 'prop') return write(weaponPropMesh(ch)!, `${stem}_${ch.weapon!.id}`, new Map(), undefined, [], {});
    const mesh = plan.files.some((x) => x.kind === 'prop') ? meshWithoutWeapon(ch) : ch.mesh;
    const rig = f.rigged ? ch.rig : undefined;
    const clips = rig && f.clips.length ? bake(f.clips) : [];
    return write(mesh, stem, f.meshless ? new Map() : textures, rig, clips, { meshless: f.meshless });
  };

  if (!plan.zipped) {
    const f = plan.files[0];
    return { name: plan.download, data: build(f) as Uint8Array, mime: f.format === 'glb' ? 'model/gltf-binary' : 'application/octet-stream' };
  }
  const folder: Zippable = {};
  for (const f of plan.files) {
    if (f.path === 'preview.png' && !extras.previewPng) continue;
    const data = build(f);
    if (f.kind === 'obj') folder.obj = data as Zippable;
    else if((f.kind==='vehicle'||f.kind==='climb')&&f.format==='obj')folder[f.path.replace(/\/$/,'')]=data as Zippable;
    else folder[f.path] = data instanceof Uint8Array && /\.(glb|png)$/.test(f.path) ? [data, { level: 0 }] : (data as Uint8Array);
  }
  progress('Compressing zip');
  return { name: plan.download, data: zipSync({ [stem]: folder }, { level: 6 }), mime: 'application/zip' };
}

/** Simple one-call export (CLI / tests): GLB / FBX with the character's rig and all clips, OBJ static, ZIP everything. */
export async function exportCharacter(
  lib: AssetLibrary, ch: Character, format: ExportFormat, extras: { previewPng?: Uint8Array } = {},
): Promise<ExportFile> {
  const mode = ch.rig ? (ch.params.animations ? 'animated' : 'rigged') : 'static';
  const settings: ExportSettings = {
    mode: format === 'obj' ? 'static' : mode,
    format: format === 'zip' ? 'all' : format,
    clips: CLIPS.map((c) => c.id),
    packaging: 'embedded',
    clipMesh: false,
    rootMotion: false,
    loopSuffix: false,
    weaponFile: 'held',
    climbProps: false,
  };
  return runExport(lib, ch, planExport(ch, settings), extras);
}
