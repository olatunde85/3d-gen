/**
 * Generates many random characters at every detail level and checks mesh
 * validity plus the structural integrity of every export format.
 *   npm test
 */
import { unzipSync, unzlibSync } from 'fflate';
import { buildHuman } from '../src/core/human';
import type { MeshData } from '../src/core/mesh';
import { DEFAULT_PARAMS, DETAILS, PRESETS, randomParams, type HumanParams } from '../src/core/params';
import { DEFAULT_EXPORT, exportCharacter, planExport, runExport, type ExportSettings } from '../src/export';
import { dressing, GARMENTS, OUTFIT_SETS } from '../src/core/garments';
import { Animator } from '../src/core/anim/evaluate';
import { CLIPS, clipById } from '../src/core/anim/clips';
import { MOCAP_DATA } from '../src/core/anim/clips/mocap-data';
import { nodeLibrary } from './node-assets';
import { WEAPONS } from '../src/core/props/weapons';
import { EARRINGS, FACIAL_HAIR, HAIRSTYLES, TATTOOS } from '../src/core/looks';
import { decodeCharacter, encodeCharacter } from '../src/app/share';
import { EXPRESSIONS } from '../src/core/face';

let failures = 0;
const fail = (msg: string) => {
  failures++;
  console.error('FAIL', msg);
};

function checkMesh(m: MeshData, label: string, height: number) {
  const vc = m.positions.length / 3;
  for (const arr of [m.positions, m.normals, m.uvs])
    for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) return fail(`${label}: non-finite vertex data`);
  for (let i = 0; i < m.normals.length; i += 3) {
    const l = Math.hypot(m.normals[i], m.normals[i + 1], m.normals[i + 2]);
    if (Math.abs(l - 1) > 1e-3) return fail(`${label}: non-unit normal (${l})`);
  }
  for (const g of m.groups) {
    if (g.indices.length % 3) fail(`${label}: index count not multiple of 3`);
    for (const i of g.indices) if (i >= vc) return fail(`${label}: index out of range`);
    const corners = g.polySizes.reduce((s, n) => s + n, 0);
    if (corners !== g.polyIndices.length) fail(`${label}: polygon corner count mismatch`);
  }
  if (m.joints && m.weights) {
    for (let v = 0; v < vc; v++) {
      const s = m.weights[v * 4] + m.weights[v * 4 + 1] + m.weights[v * 4 + 2] + m.weights[v * 4 + 3];
      if (Math.abs(s - 1) > 1e-3) return fail(`${label}: weights of vertex ${v} sum to ${s}`);
    }
  }
  let minY = Infinity;
  for (let i = 1; i < m.positions.length; i += 3) minY = Math.min(minY, m.positions[i]);
  if (Math.abs(minY) > 0.002) fail(`${label}: not on ground (minY=${minY.toFixed(4)})`);
  if (height < 0.8 || height > 2.6) fail(`${label}: implausible height ${height.toFixed(2)} m`);
}

/** Minimal binary FBX parser: walks every node record and checks offsets. */
function parseFbx(data: Uint8Array, label: string): Map<string, number> {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (new TextDecoder().decode(data.subarray(0, 18)) !== 'Kaydara FBX Binary') fail(`${label}: bad FBX magic`);
  const counts = new Map<string, number>();
  const readNode = (o: number): number => {
    const end = dv.getUint32(o, true);
    if (end === 0) return o + 13;
    const nprops = dv.getUint32(o + 4, true);
    const plen = dv.getUint32(o + 8, true);
    const nlen = data[o + 12];
    const name = new TextDecoder().decode(data.subarray(o + 13, o + 13 + nlen));
    counts.set(name, (counts.get(name) ?? 0) + 1);
    let p = o + 13 + nlen;
    const pEnd = p + plen;
    for (let i = 0; i < nprops; i++) {
      const t = String.fromCharCode(data[p++]);
      if (t === 'C') p += 1;
      else if (t === 'Y') p += 2;
      else if (t === 'I' || t === 'F') p += 4;
      else if (t === 'L' || t === 'D') p += 8;
      else if (t === 'S' || t === 'R') p += 4 + dv.getUint32(p, true);
      else if ('ilfdb'.includes(t)) {
        const len = dv.getUint32(p, true), enc = dv.getUint32(p + 4, true), clen = dv.getUint32(p + 8, true);
        const raw = data.subarray(p + 12, p + 12 + clen);
        const bytes = enc ? unzlibSync(raw) : raw;
        const size = t === 'd' || t === 'l' ? 8 : t === 'b' ? 1 : 4;
        if (bytes.length !== len * size) fail(`${label}: array ${name} decoded size mismatch`);
        p += 12 + clen;
      } else throw new Error(`${label}: unknown prop type ${t} in ${name}`);
    }
    if (p !== pEnd) fail(`${label}: property length mismatch in ${name}`);
    while (p < end) p = readNode(p);
    if (p !== end) fail(`${label}: end offset mismatch in ${name}`);
    return end;
  };
  let o = 27;
  while (dv.getUint32(o, true) !== 0) o = readNode(o);
  return counts;
}

const lib = await nodeLibrary();

async function checkExports(ch: Awaited<ReturnType<typeof buildHuman>>, label: string) {
  const glb = (await exportCharacter(lib, ch, 'glb')).data;
  const gdv = new DataView(glb.buffer, glb.byteOffset);
  if (gdv.getUint32(0, true) !== 0x46546c67 || gdv.getUint32(8, true) !== glb.length) fail(`${label}: bad GLB header`);
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + gdv.getUint32(12, true))));
  if (json.meshes[0].primitives.length !== ch.mesh.groups.length) fail(`${label}: GLB primitive count`);
  const texCount = new Set(ch.mesh.materials.flatMap((m) => [m.map, m.normalMap]).filter(Boolean)).size;
  if ((json.images?.length ?? 0) !== texCount) fail(`${label}: GLB image count ${json.images?.length} != ${texCount}`);

  if (ch.rig) {
    if (!json.skins || json.skins[0].joints.length !== ch.rig.bones.length) fail(`${label}: GLB skin missing`);
    if (json.meshes[0].primitives[0].attributes.JOINTS_0 === undefined) fail(`${label}: GLB JOINTS_0 missing`);
    const want = ch.params.animations ? CLIPS.length : 0;
    if ((json.animations?.length ?? 0) !== want) fail(`${label}: GLB has ${json.animations?.length ?? 0} animations, expected ${want}`);
  }
  if (ch.face) {
    const mesh0 = json.meshes[0];
    if (mesh0.extras?.targetNames?.length !== ch.face.names.length) fail(`${label}: GLB face shape names`);
    if (mesh0.primitives.some((p: { targets?: unknown[] }) => p.targets?.length !== ch.face!.names.length)) fail(`${label}: GLB primitives missing face targets`);
    if (JSON.stringify(mesh0.weights) !== JSON.stringify(ch.face.defaults)) fail(`${label}: GLB resting face weights`);
    if (ch.rig && ch.params.animations && !json.animations?.every((a: { channels: { target: { path: string } }[] }) => a.channels.some((c) => c.target.path === 'weights')))
      fail(`${label}: GLB animations missing face weights`);
  }
  const counts = parseFbx((await exportCharacter(lib, ch, 'fbx')).data, label);
  if (ch.face && counts.get('Geometry') !== 1 + ch.face.names.length) fail(`${label}: FBX face shapes ${(counts.get('Geometry') ?? 1) - 1}`);
  if (ch.rig && (!counts.get('Pose') || (counts.get('Deformer') ?? 0) < 2)) fail(`${label}: FBX skin/bind pose missing`);
  if (ch.rig && ch.params.animations && counts.get('AnimationStack') !== CLIPS.length) fail(`${label}: FBX animation stacks ${counts.get('AnimationStack')}`);
  if (counts.get('Material') !== ch.mesh.materials.length) fail(`${label}: FBX material count`);
  if ((counts.get('Video') ?? 0) !== texCount) fail(`${label}: FBX embedded texture count`);

  const objZip = unzipSync((await exportCharacter(lib, ch, 'obj')).data);
  const objName = Object.keys(objZip).find((n) => n.endsWith('.obj'))!;
  const faces = new TextDecoder().decode(objZip[objName]).split('\n').filter((l) => l.startsWith('f ')).length;
  const polys = ch.mesh.groups.reduce((s, g) => s + g.polySizes.length, 0);
  if (faces !== polys) fail(`${label}: OBJ face count ${faces} != ${polys}`);
  if (Object.keys(objZip).filter((n) => n.includes('/obj/textures/')).length !== texCount) fail(`${label}: OBJ textures missing`);

  const zip = unzipSync((await exportCharacter(lib, ch, 'zip')).data);
  // Rigged characters leave OBJ out of "all formats" (it can't hold the rig).
  for (const ext of ['.glb', '.fbx', ...(ch.rig ? [] : ['.obj', '.mtl']), '.params.json', 'LICENSE.txt'])
    if (!Object.keys(zip).some((n) => n.endsWith(ext))) fail(`${label}: zip missing ${ext}`);
}

// Export modes: every plan runs, and the files produced are exactly the ones planned.
async function checkExportModes() {
  const ch = await buildHuman(lib, { ...DEFAULT_PARAMS, ...PRESETS['The African Warrior'] });
  const combos: [string, Partial<ExportSettings>][] = [];
  for (const format of ['glb', 'fbx', 'obj', 'all'] as const) combos.push([`static ${format}`, { mode: 'static', format }]);
  for (const format of ['glb', 'fbx', 'all'] as const) combos.push([`rigged ${format}`, { mode: 'rigged', format }]);
  for (const format of ['glb', 'fbx', 'all'] as const)
    for (const packaging of ['embedded', 'separate'] as const)
      for (const clipMesh of [false, true])
        combos.push([`animated ${format} ${packaging}${clipMesh ? ' +mesh' : ''}`, { mode: 'animated', format, packaging, clipMesh, clips: ['walk', 'jump', 'turn_left_90'], rootMotion: true }]);
  combos.push(['animated no clips', { mode: 'animated', format: 'fbx', clips: [] }]);
  combos.push(['loop suffix', { mode: 'animated', format: 'glb', clips: ['walk', 'jump'], loopSuffix: true }]);
  combos.push(['obj while rigged', { mode: 'animated', format: 'obj' }]);
  for (const [label, patch] of combos) {
    const plan = planExport(ch, { ...DEFAULT_EXPORT, ...patch });
    const file = await runExport(lib, ch, plan, { previewPng: new Uint8Array([137, 80, 78, 71]) });
    if (file.name !== plan.download) fail(`export ${label}: name ${file.name} != ${plan.download}`);
    const entries: Record<string, Uint8Array> = plan.zipped ? unzipSync(file.data) : { [plan.files[0].path]: file.data };
    for (const f of plan.files) {
      const key = plan.zipped ? Object.keys(entries).find((k) => k.endsWith('/' + f.path) || (f.kind === 'obj' && k.includes('/obj/'))) : f.path;
      if (!key) { fail(`export ${label}: missing ${f.path}`); continue; }
      const data = entries[key];
      if (f.format === 'fbx') {
        const c = parseFbx(data, `${label}:${f.path}`);
        if ((c.get('AnimationStack') ?? 0) !== f.clips.length) fail(`export ${label}: ${f.path} has ${c.get('AnimationStack') ?? 0} stacks, planned ${f.clips.length}`);
        if (f.meshless === !!c.get('Geometry')) fail(`export ${label}: ${f.path} geometry presence wrong`);
        if (f.rigged !== !!c.get('NodeAttribute')) fail(`export ${label}: ${f.path} rig presence wrong`);
      }
      if (f.format === 'glb') {
        const dv = new DataView(data.buffer, data.byteOffset);
        const j = JSON.parse(new TextDecoder().decode(data.subarray(20, 20 + dv.getUint32(12, true))));
        if ((j.animations?.length ?? 0) !== f.clips.length) fail(`export ${label}: ${f.path} animations ${j.animations?.length ?? 0}, planned ${f.clips.length}`);
        if (label === 'loop suffix' && JSON.stringify(j.animations.map((a: { name: string }) => a.name)) !== JSON.stringify(['Walk-loop', 'Jump']))
          fail(`export ${label}: names ${j.animations.map((a: { name: string }) => a.name)}`);
        if (f.meshless === !!j.meshes) fail(`export ${label}: ${f.path} mesh presence wrong`);
        if (f.rigged && !j.skins) fail(`export ${label}: ${f.path} missing skin (armature)`);
      }
    }
  }
  console.log(`${combos.length} export modes checked`);

  // Weapon as a separate prop file: character without it + a static prop per format.
  const armed = await buildHuman(lib, { ...DEFAULT_PARAMS, weapon: 'rifle' });
  for (const format of ['glb', 'fbx', 'all'] as const) {
    const plan = planExport(armed, { ...DEFAULT_EXPORT, mode: 'animated', format, clips: ['rifle_aim'], weaponFile: 'separate' });
    const props = plan.files.filter((f) => f.kind === 'prop');
    if (props.length !== (format === 'all' ? 2 : 1)) fail(`weapon prop ${format}: ${props.length} prop files planned`);
    const entries = unzipSync((await runExport(lib, armed, plan)).data);
    for (const f of plan.files.filter((x) => x.format === 'glb')) {
      const key = Object.keys(entries).find((k) => k.endsWith('/' + f.path))!;
      const data = entries[key];
      const dv = new DataView(data.buffer, data.byteOffset);
      const j = JSON.parse(new TextDecoder().decode(data.subarray(20, 20 + dv.getUint32(12, true))));
      const mats = j.materials.map((m: { name: string }) => m.name);
      if (f.kind === 'prop' && (j.skins || !mats.includes('Gunmetal'))) fail(`weapon prop ${format}: prop file wrong (${mats})`);
      if (f.kind === 'model' && mats.includes('Gunmetal')) fail(`weapon prop ${format}: character still holds the weapon`);
    }
  }
  const held = planExport(armed, { ...DEFAULT_EXPORT, mode: 'rigged', format: 'glb' });
  if (held.files.some((f) => f.kind === 'prop') || !held.files[0].desc.includes('holding')) fail('weapon held: plan wrong');
  console.log('weapon prop export checked');
}
await checkExportModes();

const t0 = performance.now();
const cases: [string, HumanParams][] = [];
for (const [name, p] of Object.entries(PRESETS)) cases.push([`preset ${name}`, { ...DEFAULT_PARAMS, ...p, name }]);
for (let seed = 0; seed < 45; seed++) cases.push([`seed ${seed}`, { ...randomParams(seed, lib.catalog), detail: DETAILS[seed % 3] }]);
cases.push(['extremes min', { ...DEFAULT_PARAMS, age: 0.2, muscle: 0, weight: 0, height: 0, proportions: 0, gender: 0, detail: 'high' }]);
cases.push(['extremes max', { ...DEFAULT_PARAMS, age: 1, muscle: 1, weight: 1, height: 1, proportions: 1, gender: 1, detail: 'high' }]);
const allSliders = Object.fromEntries(lib.catalog.sliders.flatMap((g) => g.sliders.map((s) => [s.id, s.bipolar ? -0.7 : 0.7])));
cases.push(['every slider', { ...DEFAULT_PARAMS, modifiers: allSliders }]);
for (const o of lib.catalog.outfits) cases.push([`outfit ${o.id}`, { ...DEFAULT_PARAMS, outfit: o.id, gender: o.tags.includes('Female') ? 0 : 1 }]);
for (const h of lib.catalog.hair) cases.push([`hair ${h.id}`, { ...DEFAULT_PARAMS, hair: h.id, hat: 'fedora01' }]);
// Every procedural garment, on a female and a male body, at medium and HD.
for (const g of GARMENTS) {
  const slot = g.slot === 'acc' ? { accessories: [g.id] } : g.slot === 'feet' ? { shoes: g.id } : { [g.slot]: g.id };
  for (const [gender, detail] of [[0, 'medium'], [1, 'high']] as const)
    cases.push([`garment ${g.id} g${gender}`, { ...DEFAULT_PARAMS, outfit: 'none', gender, detail, ...slot }]);
}
cases.push(['sandals', { ...DEFAULT_PARAMS, outfit: 'none', shoes: 'sandals' }]);
// Outfit sets (paired top and bottom) with their suggested extras.
for (const set of OUTFIT_SETS)
  cases.push([`outfit set ${set.id}`, { ...DEFAULT_PARAMS, outfit: set.id, gender: 0, accessories: set.accessories, shoes: set.shoes ?? 'none', hair: 'cornrows' }]);
cases.push(['barefoot', { ...DEFAULT_PARAMS, outfit: 'none', shoes: 'none', bottom: 'none' }]);

// Share links: every preset and random character survives the round trip; garbage is rejected.
{
  const all = [...Object.entries(PRESETS).map(([name, p]) => ({ ...DEFAULT_PARAMS, ...p, name })), ...Array.from({ length: 20 }, (_, i) => randomParams(1000 + i, lib.catalog))];
  for (const p of all) {
    const back = decodeCharacter(encodeCharacter(p), p.detail);
    if (JSON.stringify(back) !== JSON.stringify(p)) fail(`share link round trip changed ${p.name}`);
  }
  if (decodeCharacter('not-a-link', 'medium') !== null) fail('garbage share link accepted');
  console.log(`${all.length} share links round-tripped`);
}

// Modesty rules: under-18 female characters always get a top; nobody is fully undressed. Tattoos are adult-only.
{
  const inkedMinor = await buildHuman(lib, { ...DEFAULT_PARAMS, age: 0.3, hair: 'short02', tattoos: [...TATTOOS] });
  if (inkedMinor.mesh.materials.some((m) => m.name === 'Skin details')) fail('minor has tattoos');
  const teen = dressing({ ...DEFAULT_PARAMS, outfit: 'none', top: 'none', bottom: 'none', gender: 0, age: 0.3 });
  if (teen.top !== 'tank_top') fail('minor without top');
  if (teen.bottom !== 'briefs') fail('no bottom fallback');
  const adult = dressing({ ...DEFAULT_PARAMS, outfit: 'none', top: 'none', gender: 0, age: 0.6 });
  if (adult.top) fail('adult topless option not honoured');
  const bottomless = dressing({ ...DEFAULT_PARAMS, outfit: 'none', bottom: 'none', underwear: false, age: 0.6 });
  if (bottomless.bottom || bottomless.underwear) fail('adult bottomless option not honoured');
  for (const gender of [0, 1]) {
    const minor = dressing({ ...DEFAULT_PARAMS, outfit: 'none', bottom: 'none', underwear: false, age: 0.3, gender });
    if (minor.bottom !== 'briefs' || !minor.underwear) fail('minor without underwear');
  }
}
// Weapons on every rig (weapon vertices skinned only to the WeaponR socket).
for (const weapon of WEAPONS.filter((w) => w !== 'none'))
  for (const [rig, restPose] of [['game', 'A'], ['game', 'T'], ['full', 'A'], ['game_lite', 'T'], ['none', 'A']] as const)
    cases.push([`weapon ${weapon} ${rig} ${restPose}`, { ...DEFAULT_PARAMS, weapon, rig, restPose }]);
// Looks: procedural hair, facial hair, tattoos, earrings.
for (const h of HAIRSTYLES)
  for (const detail of DETAILS) cases.push([`look hair ${h.id} ${detail}`, { ...DEFAULT_PARAMS, hair: h.id, detail, seed: 3 }]);
cases.push(['look mohawk under hat', { ...DEFAULT_PARAMS, hair: 'mohawk', hat: 'fedora01' }]);
for (const f of FACIAL_HAIR) cases.push([`look beard ${f}`, { ...DEFAULT_PARAMS, facialHair: f, faceBones: true, detail: f === 'full_beard' ? 'high' : 'medium' }]);
cases.push(['look all tattoos', { ...DEFAULT_PARAMS, outfit: 'none', tattoos: [...TATTOOS], detail: 'high', restPose: 'T' }]);
cases.push(['look tattoos under clothes', { ...DEFAULT_PARAMS, tattoos: [...TATTOOS] }]);
for (const e of EARRINGS) cases.push([`look earrings ${e}`, { ...DEFAULT_PARAMS, earrings: e, earringMetal: 'silver' }]);
// Faces: every expression, face shapes off (expression baked in), and on the low-detail body.
for (const e of EXPRESSIONS) cases.push([`face ${e}`, { ...DEFAULT_PARAMS, expression: e, detail: e === 'happy' ? 'high' : 'medium' }]);
cases.push(['face shapes off, angry', { ...DEFAULT_PARAMS, expression: 'angry', faceShapes: false }]);
cases.push(['face speech shapes off', { ...DEFAULT_PARAMS, speechShapes: false }]);
cases.push(['face low detail', { ...DEFAULT_PARAMS, expression: 'sad', detail: 'low' }]);
for (const tv of [...lib.catalog.teeth.map((x) => x.id), 'none']) cases.push([`face teeth ${tv}`, { ...DEFAULT_PARAMS, teeth: tv, expression: 'laughing' }]);
cases.push(['look everything, low', { ...DEFAULT_PARAMS, outfit: 'none', hair: 'box_braids', facialHair: 'full_beard', tattoos: [...TATTOOS], earrings: 'big_hoops', weapon: 'sword', detail: 'low' }]);

// Rig variants
for (const rig of ['game', 'game_lite', 'full', 'none'] as const)
  for (const restPose of ['A', 'T'] as const)
    cases.push([`rig ${rig} ${restPose}`, { ...DEFAULT_PARAMS, ...PRESETS['The Adventurer'], rig, restPose, faceBones: restPose === 'T' }]);
cases.push(['rig low detail', { ...DEFAULT_PARAMS, detail: 'low', restPose: 'T' }]);

for (const [label, p] of cases) {
  try {
    const ch = await buildHuman(lib, p);
    if ((p.rig ?? 'game') !== 'none' && (!ch.rig || !ch.mesh.joints)) fail(`${label}: not rigged`);
    if (ch.rig) for (const j of ch.mesh.joints!) if (j >= ch.rig.bones.length) { fail(`${label}: joint index out of range`); break; }
    checkMesh(ch.mesh, label, ch.height);
    const mats = ch.mesh.materials.map((m) => m.name);
    if (p.faceShapes === false && ch.mesh.morphs) fail(`${label}: face shapes exported although turned off`);
    if ((p.teeth ?? 'teeth_base') !== 'none' !== mats.includes('Teeth')) fail(`${label}: teeth present=${mats.includes('Teeth')}`);
    if (p.faceShapes !== false && !ch.mesh.morphs) fail(`${label}: no face shapes`);
    if (ch.mesh.morphs) for (const d of ch.mesh.morphs.deltas) if (d.length !== ch.mesh.positions.length) { fail(`${label}: face shape size`); break; }
    if (ch.mesh.morphs) {
      const names = ch.mesh.morphs.names, visemes = names.filter((n) => n.startsWith('viseme_')).length;
      if (visemes !== (p.speechShapes === false ? 0 : 14)) fail(`${label}: ${visemes} speech shapes`);
      // The lower teeth drop with an open "aa".
      const aa = names.indexOf('viseme_aa'), g = ch.mesh.groups.find((x) => ch.mesh.materials[x.material]?.name === 'Teeth');
      if (aa >= 0 && g) {
        let moved = 0;
        for (const v of g.indices) moved = Math.max(moved, -ch.mesh.morphs.deltas[aa][v * 3 + 1]);
        if (moved < 0.003) fail(`${label}: teeth don't follow viseme_aa (${(moved * 1000).toFixed(1)} mm)`);
      }
    }
    if (p.weapon && p.weapon !== 'none') {
      if (!!ch.weapon !== !!ch.rig) fail(`${label}: weapon present=${!!ch.weapon} rigged=${!!ch.rig}`);
      if (ch.weapon && ch.rig) {
        const socket = ch.rig.bones.findIndex((b) => b.name === 'WeaponR');
        const n = ch.weapon.parts.length, g0 = ch.mesh.groups.length - n;
        for (const g of ch.mesh.groups.slice(g0))
          for (const v of g.indices) if (ch.mesh.joints![v * 4] !== socket || ch.mesh.weights![v * 4] !== 1) { fail(`${label}: weapon vertex not bound to WeaponR`); break; }
      }
    }
    if (label.startsWith('look')) {
      const wantOverlay = !!(p.tattoos?.length || (p.facialHair && p.facialHair !== 'none') || ['buzz', 'mohawk', 'cornrows', 'box_braids'].includes(p.hair));
      if (wantOverlay !== mats.includes('Skin details')) fail(`${label}: skin overlay present=${mats.includes('Skin details')}`);
      if (['mustache', 'goatee', 'short_beard', 'full_beard'].includes(p.facialHair) !== mats.includes('Beard')) fail(`${label}: beard cards`);
      if ((p.earrings !== 'none') !== (mats.includes('Silver') || mats.includes('Gold'))) fail(`${label}: earrings`);
      if (['mohawk', 'cornrows', 'box_braids'].includes(p.hair) && !p.hat?.startsWith('fedora') && !mats.some((m) => m === 'Braids' || m === 'Hair spikes')) fail(`${label}: hair geometry missing`);
    }
    // Every clip evaluates to finite, unit quaternions on every rig.
    if (ch.rig && label.startsWith('rig'))
      for (const c of CLIPS) {
        const { frames } = new Animator(ch.rig).bake(c, 10);
        for (const f of frames)
          for (const q of f.rot)
            if (!q.every(Number.isFinite) || Math.abs(Math.hypot(...q) - 1) > 1e-4) {
              fail(`${label}: clip ${c.id} produced a bad rotation`);
              break;
            }
      }
    // Motion-capture clips: loops close (last frame meets the first) and the lowest step lands on
    // the floor (the lowest joint matches the bind pose's), on every rig.
    if (ch.rig && label.startsWith('rig'))
      for (const id of Object.keys(MOCAP_DATA)) {
        const c = clipById.get(id)!, A = new Animator(ch.rig);
        const low = (ps: number[][]) => Math.min(...ps.map((p) => p[1]));
        const restLow = low(A.positions(A.bind()) as number[][]);
        let clipLow = Infinity;
        for (let i = 0; i <= 60; i++) clipLow = Math.min(clipLow, low(A.positions(A.frame(c, (i / 60) * c.duration)) as number[][]));
        if (Math.abs(clipLow - restLow) > 0.015)
          fail(`${label}: mocap ${id} lowest joint ${(clipLow * 100).toFixed(1)} cm vs rest ${(restLow * 100).toFixed(1)} cm`);
        if (c.loop) {
          const a = A.positions(A.frame(c, 0)), b = A.positions(A.frame(c, c.duration));
          const gap = Math.max(...a.map((p, k) => Math.hypot(p[0] - b[k][0], p[1] - b[k][1], p[2] - b[k][2])));
          if (gap > 0.005) fail(`${label}: mocap ${id} loop gap ${(gap * 100).toFixed(1)} cm`);
        }
      }
    // Chained clips meet where they join (largest joint gap under 3 cm).
    if (ch.rig && label.startsWith('rig'))
      for (const [a, b] of [['idle', 'sit_down'], ['stand_up', 'idle'], ['sit_down', 'sit_idle'], ['sit_idle', 'stand_up'], ['lie_down', 'sleep'], ['sleep', 'get_up_face_up']]) {
        const A = new Animator(ch.rig), ca = clipById.get(a)!, cb = clipById.get(b)!;
        const pa = A.positions(A.frame(ca, ca.duration)), pb = A.positions(A.frame(cb, 0));
        const gap = Math.max(...pa.map((p, k) => Math.hypot(p[0] - pb[k][0], p[1] - pb[k][1], p[2] - pb[k][2])));
        if (gap > 0.03) fail(`${label}: ${a} -> ${b} jump of ${(gap * 100).toFixed(1)} cm`);
      }
    if (label.startsWith('preset') || label.startsWith('seed 1') || label.startsWith('rig') || label.startsWith('look everything') || label === 'weapon rifle game T' || label.startsWith('face'))
      await checkExports(ch, label);
  } catch (e) {
    fail(`${label}: threw ${(e as Error).stack}`);
  }
}
console.log(`${cases.length} characters checked in ${((performance.now() - t0) / 1000).toFixed(1)} s, ${failures} failures`);
process.exit(failures ? 1 : 0);
