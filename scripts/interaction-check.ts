/** Contact, continuity and locomotion checks shared by the selftest and a focused rig matrix. */
import { checkInteractionSkin } from './interaction-skin-check';
import { pathToFileURL } from 'node:url';
import { Animator } from '../src/core/anim/evaluate';
import { clipById } from '../src/core/anim/clips';
import { INTERACTIONS } from '../src/core/anim/clips/interaction';
import type { Rig } from '../src/core/rig/rig';
import { boneFor } from '../src/core/rig/poses';
import { qmul, qrot } from '../src/core/anim/quat';

export function checkInteractions(rig: Rig, label: string, fail: (message: string) => void) {
  const A = new Animator(rig), B = rig.bones;
  const idx = (name: string) => B.findIndex((b) => b.name === boneFor(rig.type, name));
  const scale = Math.max(...B.flatMap((b) => [b.head[1], b.tail[1]])) / 1.8;
  const distance = (a: number[], b: number[]) => Math.hypot(...a.map((v, i) => v - b[i]));
  const segmentDistance = (p: number[], a: number[], b: number[]) => {
    const d = b.map((v, j) => v - a[j]), length2 = d.reduce((sum, v) => sum + v * v, 0);
    const u = Math.max(0, Math.min(1, d.reduce((sum, v, j) => sum + v * (p[j] - a[j]), 0) / length2));
    return distance(p, a.map((v, j) => v + u * d[j]));
  };
  const gap = (a: number[][], b: number[][]) => Math.max(...a.map((p, i) => distance(p, b[i])));
  const at = (id: string, t: number) => A.positions(A.frame(clipById.get(id)!, t));
  for (const c of INTERACTIONS) {
    let prev: number[][] | undefined;
    for (let i = 0; i <= 120; i++) {
      const t = c.duration * i / 120, frame = A.frame(c, t), ps = A.positions(frame);
      if (ps.some((p) => !p.every(Number.isFinite))) fail(`${label}: ${c.id} non-finite positions`);
      if (prev && gap(ps, prev) / scale > 0.14) fail(`${label}: ${c.id} abrupt motion at ${t.toFixed(3)}s`);
      prev = ps;
      if (c.id === 'pick_up' || c.id === 'open_door') {
        const world: (typeof frame.rot)[number][] = [];
        B.forEach((b, j) => world[j] = b.parent < 0 ? frame.rot[j] : qmul(world[b.parent], frame.rot[j]));
        for (const side of c.id === 'pick_up' ? ['Left', 'Right'] : ['Right']) {
          const wrist = ps[idx(side + 'Hand')], elbow = ps[idx(side + 'ForeArm')];
          const dir = qrot(world[idx(side + 'Hand')], [0, 1, 0]);
          const fore = wrist.map((v, j) => v - elbow[j]);
          const angle = Math.acos(Math.max(-1, Math.min(1, fore.reduce((sum, v, j) => sum + v * dir[j], 0) / Math.hypot(...fore)))) * 180 / Math.PI;
          if (angle > 65) fail(`${label}: ${c.id} bends ${side} wrist ${angle.toFixed(1)} degrees at ${t.toFixed(2)}s`);
          const clearance = Math.min(...['Left', 'Right'].flatMap((leg) => [
            segmentDistance(wrist, ps[idx(leg + 'UpLeg')], ps[idx(leg + 'Leg')]),
            segmentDistance(wrist, ps[idx(leg + 'Leg')], ps[idx(leg + 'Foot')]),
          ])) / scale;
          if (clearance < 0.13) fail(`${label}: ${c.id} ${side} hand enters leg clearance at ${t.toFixed(2)}s (${clearance.toFixed(3)}m)`);
        }
      }
      if (c.id.startsWith('carry_')) {
        const lh = idx('LeftHand'), rh = idx('RightHand');
        const d = distance(ps[lh], ps[rh]) / scale;
        if (Math.abs(d - 0.46) > 0.01) fail(`${label}: ${c.id} hands separate (${d.toFixed(3)}m)`);
        // Finger directions stay parallel rather than twisting the object between the hands.
        const world: (typeof frame.rot)[number][] = [];
        B.forEach((b, j) => world[j] = b.parent < 0 ? frame.rot[j] : qmul(world[b.parent], frame.rot[j]));
        if (distance(qrot(world[lh], [0, 1, 0]), qrot(world[rh], [0, 1, 0])) > 0.01)
          fail(`${label}: ${c.id} hand directions diverge`);
      }
    }
    if (c.loop) {
      if (gap(at(c.id, 0), at(c.id, c.duration)) / scale > 0.001) fail(`${label}: ${c.id} loop seam`);
    } else if (c.id !== 'pick_up') {
      if (gap(at(c.id, 0), at(c.id, c.duration)) / scale > 0.001) fail(`${label}: ${c.id} does not return to rest`);
    }
  }
  const pickup = clipById.get('pick_up')!, walk = clipById.get('carry_walk')!, source = clipById.get('walk')!;
  if (gap(at('pick_up', pickup.duration), at('carry_idle', 0)) > 0.001) fail(`${label}: pickup -> carry idle pops`);
  for (const side of ['Left', 'Right'] as const) {
    const hand = at('pick_up', 1.5)[idx(`${side}Hand`)];
    const target = pickup.sample(1.5).ik![side]!.pos.map((v) => v * scale);
    if (distance(hand, target) > 0.012 * scale) fail(`${label}: pickup ${side} hand cannot reach contact (${(distance(hand, target) / scale).toFixed(3)}m)`);
    if (hand[1] / scale < 0.05 || hand[1] / scale > 0.32) fail(`${label}: pickup hand misses ground (${(hand[1] / scale).toFixed(3)}m)`);
  }
  for (let i = 0; i <= 30; i++) {
    const t = walk.duration * i / 30;
    const a = at('carry_walk', t), b = at('walk', t * source.duration / walk.duration);
    for (const name of ['Hips', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'])
      if (distance(a[idx(name)], b[idx(name)]) > 0.001) fail(`${label}: carry walk changes captured ${name}`);
    const inPlace = A.frame(walk, t), moving = A.frame(walk, t, { rootMotion: true });
    for (const [j, p] of moving.rootPos) {
      const want = inPlace.rootPos.get(j)!.map((v, d) => v + walk.travel![d] * t * scale);
      if (distance(p, want) > 0.001) fail(`${label}: carry walk root motion mismatch`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { nodeLibrary } = await import('./node-assets');
  const { buildHuman } = await import('../src/core/human');
  const { DEFAULT_PARAMS } = await import('../src/core/params');
  const lib = await nodeLibrary();
  let failures = 0;
  for (const rig of ['game', 'game_lite', 'full'] as const)
    for (const restPose of ['A', 'T'] as const)
      for (const [name, body] of [
        ['average', {}], ['short female', { gender: 0, height: 0.15, weight: 0.3, proportions: 0.2 }],
        ['tall broad', { gender: 1, height: 0.9, weight: 0.85, muscle: 0.9 }],
      ] as const) {
        const ch = await buildHuman(lib, { ...DEFAULT_PARAMS, ...body, rig, restPose, detail: 'low', outfit: 'none', faceShapes: false, hair: 'none' });
        const fail = (m: string) => { failures++; console.error('FAIL', m); };
        checkInteractions(ch.rig!, `${rig} ${restPose} ${name}`, fail);
        checkInteractionSkin(ch.rig!, ch.mesh, `${rig} ${restPose} ${name}`, fail);
      }
  console.log(`Interaction checks: 18 bodies/rigs/binds, ${failures} failures`);
  process.exitCode = failures ? 1 : 0;
}
