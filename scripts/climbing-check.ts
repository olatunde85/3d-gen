/** Climbing: hands and feet on their holds, no body part through the ladder/obstacle/ledge, rigid limbs, smooth motion. */
import assert from 'node:assert/strict';
import { nodeLibrary } from './node-assets';
import { buildHuman } from '../src/core/human';
import { DEFAULT_PARAMS } from '../src/core/params';
import { Animator } from '../src/core/anim/evaluate';
import { clipById } from '../src/core/anim/clips';
import { boneFor } from '../src/core/rig/poses';
import { LADDER, LEDGE, VAULT } from '../src/core/anim/clips/climbing';
import { animationGroup } from '../src/core/anim/groups';
import { forcedTravel, studioTravel } from '../src/studio/motion';

const lib = await nodeLibrary();
const CLIPS = ['ladder_up', 'ladder_down', 'vault_over', 'ledge_hang', 'ledge_climb_up'];
const JOINTS = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase', 'LeftToe_End', 'RightToe_End', 'LeftHand', 'RightHand'];
let checks = 0;
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
        if (fo) { const T = fo.pos.map((v, d) => v * k + tr[d]); assert.ok(Math.hypot(...p[idx(side + 'Foot')].map((x, d) => (fo.rise && d === 1 ? 0 : x - T[d]))) / k < 0.006, `${label} ${side} foot off its hold at ${t.toFixed(2)}`); }
      }
      // Nothing passes through the scenery (5 cm of flesh round body joints; hands and feet may touch it).
      for (const name of JOINTS) {
        const j = idx(name); if (j < 0) continue;
        const q = p[j].map((v) => v / k), r = /Hand|Foot|Toe/.test(name) ? 0 : 0.05;
        let depth = 0;
        if (id === 'vault_over') { if (q[2] > VAULT.near - r && q[2] < VAULT.near + VAULT.depth + r && q[1] < VAULT.height + r) depth = Math.min(q[2] - (VAULT.near - r), VAULT.near + VAULT.depth + r - q[2], VAULT.height + r - q[1]); }
        else if (id.startsWith('ledge')) { if (q[2] > LEDGE.face - r && q[1] < LEDGE.top + r) depth = Math.min(q[2] - (LEDGE.face - r), LEDGE.top + r - q[1]); }
        else if (!/Hand|Foot|Toe/.test(name) && q[2] > LADDER.plane - r) depth = q[2] - (LADDER.plane - r);
        assert.ok(depth < 0.012, `${label} ${name} ${(depth * 100).toFixed(1)} cm into the scenery at ${t.toFixed(2)}`);
      }
      for (let j = 0; j < B.length; j++) if (B[j].parent >= 0) assert.ok(Math.abs(Math.hypot(...p[j].map((x, d) => x - p[B[j].parent][d])) - Math.hypot(...B[j].head.map((x, d) => x - B[B[j].parent].head[d]))) < 1e-5, `${label} stretches ${B[j].name}`);
      if (prev) for (let j = 0; j < p.length; j++) assert.ok(Math.hypot(...p[j].map((x, d) => x - prev![j][d])) / k / (c.duration / N) < 14, `${label} ${B[j].name} jumps at ${t.toFixed(2)}`);
      prev = p; checks++;
    }
  }
}
for (const id of CLIPS) { const c = clipById.get(id)!; assert.equal(animationGroup(c), 'Climbing'); assert.equal(forcedTravel(id), !!c.travel); if (c.travel) assert.deepEqual(studioTravel(id), c.travel); }
console.log(`Climbing: ${checks} rig/body/clip frames; holds, scenery clearance, rigid limbs and smooth motion passed.`);
