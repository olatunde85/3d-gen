/**
 * Clips built against stage props (climbing, cover): hands and feet on their holds, no body part through the ladder,
 * obstacle, ledge or cover wall, the head hidden behind cover, rigid limbs, smooth motion. With a rifle in hand, the
 * rifle stays out of the cover wall and above the floor through cover, hits and deaths.
 */
import assert from 'node:assert/strict';
import { nodeLibrary } from './node-assets';
import { buildHuman, weaponPropMesh } from '../src/core/human';
import { qmul, qrot } from '../src/core/anim/quat';
import { DEFAULT_PARAMS } from '../src/core/params';
import { Animator } from '../src/core/anim/evaluate';
import { clipById } from '../src/core/anim/clips';
import { boneFor } from '../src/core/rig/poses';
import { LADDER, LEDGE, VAULT } from '../src/core/anim/clips/climbing';
import { COVER, TAKE_COVER_STEP } from '../src/core/anim/clips/cover';
import { animationGroup } from '../src/core/anim/groups';
import { forcedTravel, studioTravel } from '../src/studio/motion';

const lib = await nodeLibrary();
const CLIMBS = ['ladder_up', 'ladder_down', 'vault_over', 'ledge_hang', 'ledge_climb_up'], CLIPS = [...CLIMBS, 'take_cover', 'cover_idle', 'cover_fire'];
const JOINTS = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase', 'LeftToe_End', 'RightToe_End', 'LeftHand', 'RightHand'];
let checks = 0;
// Take cover steps up to the wall: from where it starts, the wall is a step further away.
const wallAt = (id: string) => COVER.near + (id === 'take_cover' ? TAKE_COVER_STEP : 0);
for (const rig of ['game', 'game_lite', 'full'] as const) for (const body of [{}, { gender: 0, height: 0.15, weight: 0.3 }, { gender: 1, height: 0.9, weight: 0.85, muscle: 0.9 }]) {
  const ch = await buildHuman(lib, { ...DEFAULT_PARAMS, ...body, rig, detail: 'low', hair: 'none', outfit: 'none', faceShapes: false });
  const A = new Animator(ch.rig!), B = ch.rig!.bones, k = Math.max(...B.flatMap((b) => [b.head[1], b.tail[1]])) / 1.8, idx = (n: string) => B.findIndex((b) => b.name === boneFor(rig, n));
  for (const id of CLIPS) {
    const c = clipById.get(id)!, label = `${rig} ${JSON.stringify(body)} ${id}`, N = 60;
    let prev: number[][] | undefined;
    for (let n = 0; n <= N; n++) {
      const t = (n / N) * c.duration, s = c.sample(t), f = A.frame(c, t, { rootMotion: true }), p = A.positions(f), tr = (c.travel ?? [0, 0, 0]).map((v) => v * t * k);
      // Every held hand and every foot reaches its hold (feet braced on a wall may rise with a short-armed hang).
      for (const side of ['Left', 'Right'] as const) {
        const h = s.ik?.[side];
        if (h?.space === 'floor' && (s.ikWeight?.[side] ?? 1) > 0.99) { const T = h.pos.map((v, d) => v * k + tr[d]); assert.ok(Math.hypot(...p[idx(side + 'Hand')].map((x, d) => x - T[d])) / k < 0.006, `${label} ${side} hand off its hold at ${t.toFixed(2)}`); }
        const fo = s.feet?.[side];
        if (fo && (fo.weight ?? 1) > 0.99) { const T = fo.pos.map((v, d) => v * k + tr[d]); assert.ok(Math.hypot(...p[idx(side + 'Foot')].map((x, d) => (fo.rise && d === 1 ? 0 : x - T[d]))) / k < 0.006, `${label} ${side} foot off its hold at ${t.toFixed(2)}`); }
      }
      // Nothing passes through the scenery (5 cm of flesh round body joints; hands and feet may touch it).
      for (const name of JOINTS) {
        const j = idx(name); if (j < 0) continue;
        const q = p[j].map((v) => v / k), r = /Hand|Foot|Toe/.test(name) ? 0 : 0.05;
        let depth = 0;
        if (id === 'vault_over') { if (q[2] > VAULT.near - r && q[2] < VAULT.near + VAULT.depth + r && q[1] < VAULT.height + r) depth = Math.min(q[2] - (VAULT.near - r), VAULT.near + VAULT.depth + r - q[2], VAULT.height + r - q[1]); }
        else if (id.includes('cover')) { const near = wallAt(id); if (q[2] > near - r && q[2] < near + COVER.depth + r && q[1] < COVER.height + r) depth = Math.min(q[2] - (near - r), near + COVER.depth + r - q[2], COVER.height + r - q[1]); }
        else if (id.startsWith('ledge')) { if (q[2] > LEDGE.face - r && q[1] < LEDGE.top + r) depth = Math.min(q[2] - (LEDGE.face - r), LEDGE.top + r - q[1]); }
        else if (!/Hand|Foot|Toe/.test(name) && q[2] > LADDER.plane - r) depth = q[2] - (LADDER.plane - r);
        assert.ok(depth < 0.012, `${label} ${name} ${(depth * 100).toFixed(1)} cm into the scenery at ${t.toFixed(2)}`);
      }
      // Hidden in cover: the top of the head stays below the wall.
      if (id === 'cover_idle' || (id === 'cover_fire' && (n === 0 || n === N))) { const head = p[idx('Head')][1] / k + 0.18; assert.ok(head < COVER.height, `${label} head shows over the cover at ${t.toFixed(2)} (${head.toFixed(2)} m)`); }
      for (let j = 0; j < B.length; j++) if (B[j].parent >= 0) assert.ok(Math.abs(Math.hypot(...p[j].map((x, d) => x - p[B[j].parent][d])) - Math.hypot(...B[j].head.map((x, d) => x - B[B[j].parent].head[d]))) < 1e-5, `${label} stretches ${B[j].name}`);
      if (prev) for (let j = 0; j < p.length; j++) assert.ok(Math.hypot(...p[j].map((x, d) => x - prev![j][d])) / k / (c.duration / N) < 14, `${label} ${B[j].name} jumps at ${t.toFixed(2)}`);
      prev = p; checks++;
    }
  }
}
const RIFLE_CLIPS = ['take_cover', 'cover_idle', 'cover_fire', 'rifle_hit_front', 'rifle_hit_back', 'rifle_death_forward', 'rifle_death_backward'];
let rifleChecks = 0;
for (const rig of ['game', 'game_lite', 'full'] as const) for (const body of [{}, { gender: 0, height: 0.15, weight: 0.3 }, { gender: 1, height: 0.9, weight: 0.85, muscle: 0.9 }]) {
  const ch = await buildHuman(lib, { ...DEFAULT_PARAMS, ...body, rig, weapon: 'rifle', detail: 'low', hair: 'none', outfit: 'none', faceShapes: false });
  const A = new Animator(ch.rig!), B = ch.rig!.bones, k = Math.max(...B.flatMap((b) => [b.head[1], b.tail[1]])) / 1.8, socket = B.findIndex((b) => b.name === 'WeaponR');
  const P = weaponPropMesh(ch)!.positions;
  for (const id of RIFLE_CLIPS) {
    const c = clipById.get(id)!;
    for (let n = 0; n <= 60; n++) {
      const t = (n / 60) * c.duration, f = A.frame(c, t, { rootMotion: true }), w: [number, number, number, number][] = [], o = A.positions(f)[socket];
      B.forEach((b, i) => (w[i] = b.parent < 0 ? f.rot[i] : qmul(w[b.parent], f.rot[i])));
      for (let i = 0; i < P.length; i += 15) {
        const q = qrot(w[socket], [P[i], P[i + 1], P[i + 2]]).map((x, d) => (x + o[d]) / k);
        assert.ok(q[1] > -0.012, `${rig} ${JSON.stringify(body)} ${id}: rifle ${(-q[1] * 100).toFixed(1)} cm below the floor at ${t.toFixed(2)}`);
        if (id.includes('cover')) assert.ok(!(q[2] > wallAt(id) + 0.012 && q[2] < wallAt(id) + COVER.depth && q[1] < COVER.height - 0.012), `${rig} ${JSON.stringify(body)} ${id}: rifle in the cover wall at ${t.toFixed(2)}`);
      }
      rifleChecks++;
    }
  }
}
for (const id of CLIMBS) { const c = clipById.get(id)!; assert.equal(animationGroup(c), 'Climbing'); assert.equal(forcedTravel(id), !!c.travel); if (c.travel) assert.deepEqual(studioTravel(id), c.travel); }
console.log(`Stage props: ${checks} rig/body/clip frames; holds, prop clearance, cover, rigid limbs and smooth motion passed. Rifle clear of floor and cover in ${rifleChecks} frames.`);
