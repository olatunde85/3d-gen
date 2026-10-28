/**
 * Export planning: turns the user's export settings into an explicit list of
 * files (names + human-readable descriptions). The UI shows the plan before
 * downloading, and runExport() executes exactly that plan, so what you see is
 * what you get.
 */
import { clipById } from '../core/anim/clips';
import type { Character } from '../core/human';
import { triangleCount } from '../core/mesh';
import { RIG_LABELS } from '../core/rig/skeletons';
import { WEAPON_LABELS } from '../core/props/weapons';

export type ExportMode = 'static' | 'rigged' | 'animated';
export type FormatChoice = 'glb' | 'fbx' | 'obj' | 'all';

export interface ExportSettings {
  mode: ExportMode;
  format: FormatChoice;
  /** Clip ids to include (animated mode). */
  clips: string[];
  /** 'embedded': every clip inside the model file. 'separate': model + one file per clip (zip). */
  packaging: 'embedded' | 'separate';
  /** Separate clip files include the mesh (else skeleton + animation only, Unity "model@clip" style). */
  clipMesh: boolean;
  /** Locomotion clips travel (root motion) instead of playing in place. */
  rootMotion: boolean;
  /** Name looping clips "Walk-loop" so Godot imports them as looping. */
  loopSuffix: boolean;
  /** Held weapon: 'held' = in the hand, skinned to the WeaponR bone; 'separate' = its own prop file. */
  weaponFile: 'held' | 'separate';
}

/** Clip name as written into exported files. */
export function exportClipName(id: string, s: Pick<ExportSettings, 'loopSuffix'>): string {
  const c = clipById.get(id)!;
  return s.loopSuffix && c.loop ? `${c.name}-loop` : c.name;
}

export const DEFAULT_EXPORT: ExportSettings = {
  mode: 'animated',
  format: 'fbx',
  clips: ['idle', 'walk', 'run'],
  packaging: 'embedded',
  clipMesh: false,
  rootMotion: false,
  loopSuffix: false,
  weaponFile: 'held',
};

export const MODE_LABELS: Record<ExportMode, { title: string; blurb: string }> = {
  static: { title: 'Static model', blurb: 'Mesh + textures only. For props, renders, 3D printing, or rigging elsewhere.' },
  rigged: { title: 'Rigged model', blurb: 'Mesh + skeleton + skin weights, no animation. Ready for Mixamo / your own animations.' },
  animated: { title: 'Rigged + animations', blurb: 'Mesh + skeleton + the animation clips you pick.' },
};

export interface PlannedFile {
  /** Path inside the zip (or the download name for single files). */
  path: string;
  kind: 'model' | 'clip' | 'obj' | 'meta' | 'prop';
  format?: 'glb' | 'fbx' | 'obj';
  rigged: boolean;
  /** Clip ids baked into this file. */
  clips: string[];
  /** Skeleton-only animation file (no mesh). */
  meshless: boolean;
  desc: string;
}

export interface ExportPlan {
  settings: ExportSettings;
  /** Effective mode after constraints (e.g. OBJ can't be rigged). */
  mode: ExportMode;
  download: string;
  zipped: boolean;
  files: PlannedFile[];
  notes: string[];
  /** One-line summary for the export bar. */
  summary: string;
}

const FMT = { glb: 'GLB', fbx: 'FBX', obj: 'OBJ' } as const;

export function stemOf(name: string): string {
  return name.trim().replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'character';
}

export function planExport(ch: Character, s: ExportSettings): ExportPlan {
  const notes: string[] = [];
  const stem = stemOf(ch.params.name);
  let mode = s.mode;
  if (mode !== 'static' && !ch.rig) {
    notes.push('This character has no rig (skeleton set to "none"), so it exports as a static model.');
    mode = 'static';
  }
  if (s.format === 'obj' && mode !== 'static') {
    notes.push('OBJ cannot store skeletons or animations: exporting a static OBJ. Pick GLB or FBX to keep the rig.');
    mode = 'static';
  }
  const clips = mode === 'animated' ? s.clips.filter((c) => clipById.has(c)) : [];
  if (mode === 'animated' && !clips.length) {
    notes.push('No animations selected: exporting the rigged model only.');
    mode = 'rigged';
  }
  const formats: ('glb' | 'fbx' | 'obj')[] =
    s.format === 'all' ? (mode === 'static' ? ['glb', 'fbx', 'obj'] : ['glb', 'fbx']) : [s.format];
  if (s.format === 'all' && mode !== 'static') notes.push('OBJ is left out of "All formats" because it cannot hold the rig.');

  const tris = triangleCount(ch.mesh).toLocaleString();
  const textures = new Set(ch.mesh.materials.flatMap((m) => [m.map, m.normalMap, m.roughnessMap]).filter(Boolean)).size;
  const rig = ch.rig;
  const rigDesc = rig ? `${rig.bones.length}-bone ${RIG_LABELS[rig.type].split(' —')[0].split(' (')[0].toLowerCase()}, ${rig.restPose}-pose bind` : '';
  const clipName = (id: string) => exportClipName(id, s);
  const clipList = (ids: string[]) => ids.map(clipName).join(', ');
  const separate = mode === 'animated' && s.packaging === 'separate';
  const weapon = ch.weapon;
  const wName = weapon ? WEAPON_LABELS[weapon.id] : '';
  const propFile = !!weapon && s.weaponFile === 'separate' && formats.some((f) => f !== 'obj');

  const files: PlannedFile[] = [];
  for (const f of formats) {
    const inFolder = formats.length > 1 || separate || f === 'obj';
    const base = (n: string) => (inFolder && formats.length > 1 ? `${f}/${n}` : n);
    if (f === 'obj') {
      files.push({
        path: 'obj/', kind: 'obj', format: 'obj', rigged: false, clips: [], meshless: false,
        desc: `OBJ + MTL + ${textures} texture files (static, quad topology, metres)`,
      });
      continue;
    }
    const embedded = mode === 'animated' && !separate ? clips : [];
    files.push({
      path: base(`${stem}.${f}`), kind: 'model', format: f, rigged: mode !== 'static', clips: embedded, meshless: false,
      desc: [
        `${FMT[f]} model · ${tris} triangles · ${textures} textures embedded`,
        mode === 'static' ? 'static (no skeleton)' : rigDesc,
        embedded.length ? `${embedded.length} animation${embedded.length > 1 ? 's' : ''}: ${clipList(embedded)}` : mode !== 'static' ? 'no animations' : '',
        weapon ? (propFile ? `no weapon (${wName.toLowerCase()} is a separate file)` : `holding ${wName.toLowerCase()}`) : '',
      ].filter(Boolean).join(' · '),
    });
    if (propFile && weapon)
      files.push({
        path: base(`${stem}_${weapon.id}.${f}`), kind: 'prop', format: f, rigged: false, clips: [], meshless: false,
        desc: `${wName} prop · static · origin at the grip: parent it to the WeaponR bone with zero offset`,
      });
    if (separate)
      for (const c of clips) {
        const clip = clipById.get(c)!;
        files.push({
          path: base(`${stem}@${c}.${f}`), kind: 'clip', format: f, rigged: true, clips: [c], meshless: !s.clipMesh,
          desc: `${clip.name} · ${clip.duration.toFixed(1)} s ${clip.loop ? 'loop' : 'one-shot'}${s.rootMotion && clip.travel ? ' · root motion' : ''} · ${s.clipMesh ? 'with mesh' : 'skeleton only'}`,
        });
      }
  }
  if (mode === 'animated' && s.rootMotion && clips.some((c) => clipById.get(c)!.travel))
    notes.push('Root motion on: walk/run/strafe clips move the hips forward or sideways instead of playing in place.');
  if (mode === 'animated' && s.loopSuffix && clips.some((c) => clipById.get(c)!.loop))
    notes.push('Looping clips are named "…-loop", which Godot imports as looping automatically.');
  if (weapon && mode !== 'static' && !propFile)
    notes.push(`The ${wName.toLowerCase()} is skinned to the WeaponR bone (child of the right hand). To swap weapons in-engine, export it as a separate file and attach props to WeaponR.`);
  if (weapon && mode === 'static' && !propFile) notes.push(`The ${wName.toLowerCase()} is part of the static mesh, in the rest-pose hand.`);
  if (weapon && s.weaponFile === 'separate' && formats.includes('obj')) notes.push('OBJ keeps the weapon in the mesh (no separate prop file for OBJ).');
  if (separate && !s.clipMesh)
    notes.push('Clip files hold only the skeleton + animation (Unity "model@clip" convention): import the model first, then the clips onto its skeleton.');

  const zipped = files.length > 1 || files[0].kind === 'obj';
  if (zipped) {
    files.push({ path: `${stem}.params.json`, kind: 'meta', rigged: false, clips: [], meshless: false, desc: 'Generator settings: load to regenerate this character' });
    if (rig && mode !== 'static') files.push({ path: `${stem}.rig.json`, kind: 'meta', rigged: false, clips: [], meshless: false, desc: 'Skeleton description (bone names, hierarchy, bind pose)' });
    files.push({ path: 'README.txt', kind: 'meta', rigged: false, clips: [], meshless: false, desc: 'What is in this download' });
    files.push({ path: 'LICENSE.txt', kind: 'meta', rigged: false, clips: [], meshless: false, desc: 'Asset licences' });
    files.push({ path: 'preview.png', kind: 'meta', rigged: false, clips: [], meshless: false, desc: 'Preview image (from the viewer)' });
  }

  const tag = mode === 'static' ? 'static' : mode === 'rigged' ? 'rigged' : separate ? 'anims' : `${clips.length}anims`;
  const download = zipped ? `${stem}_${tag}${s.format === 'all' ? '_all' : formats[0] === 'obj' ? '_obj' : ''}.zip` : files[0].path;
  const fmtText = s.format === 'all' ? formats.map((f) => FMT[f]).join(' + ') : FMT[formats[0]];
  const modeText = mode === 'static' ? 'Static' : mode === 'rigged' ? 'Rigged' : `Rigged + ${clips.length} anim${clips.length > 1 ? 's' : ''}${separate ? ' (1 file each)' : ''}`;
  return { settings: s, mode, download, zipped, files, notes, summary: `${fmtText} · ${modeText}${zipped ? ' · zip' : ''}` };
}

