/**
 * Fitness clips and gym weights on every rig and body: nothing sinks through the floor, push-up hands stay planted,
 * planted feet stay put, each weight sits in the fists in its own lifts and is packed away everywhere else (with Gym weights (all), the others stay packed), and the
 * barbell rests on the floor at the bottom of the deadlift. Also the Gym Instructor, the gym set and carry choice.
 *   npx tsx scripts/fitness-check.ts
 */
import assert from 'node:assert/strict';
import { nodeLibrary } from './node-assets';
import { buildHuman } from '../src/core/human';
import { DEFAULT_PARAMS, PRESETS } from '../src/core/params';
import { presetGroup } from '../src/core/preset-groups';
import { Animator } from '../src/core/anim/evaluate';
import { CLIPS, clipById } from '../src/core/anim/clips';
import { FITNESS, GYM_CLIPS } from '../src/core/anim/clips/fitness';
import { BARBELL_PLATE, GYM_WEIGHTS, PROP_REST } from '../src/core/props/carry';
import { boneFor } from '../src/core/rig/poses';
import { carryForClips } from '../packages/cli/src/library/generate';
import { searchScenes, sceneById } from '../src/studio/catalog';
import { locationMapFile } from '../src/studio/spatial-maps';

const distance = (a: number[], b: number[]) => Math.hypot(...a.map((v, i) => v - b[i]));
const mid = (a: number[], b: number[]) => a.map((v, i) => (v + b[i]) / 2);

// The clips are registered once each, loop on the spot, and the lifts name their weight.
assert.equal(FITNESS.length, 11);
assert.deepEqual(CLIPS.filter((c) => c.category === 'Fitness').map((c) => c.id), FITNESS.map((c) => c.id));
assert.equal(new Set(CLIPS.map((c) => c.id)).size, CLIPS.length);
assert.ok(FITNESS.every((c) => c.loop && !c.travel));
assert.deepEqual(GYM_CLIPS, { dumbbells: ['dumbbell_curl'], kettlebell: ['kettlebell_swing'], barbell: ['barbell_squat', 'deadlift'], gym_weights: ['dumbbell_curl', 'kettlebell_swing', 'barbell_squat', 'deadlift'] });
console.log(`Fitness clips: ${FITNESS.length} looping clips, ${GYM_CLIPS.gym_weights!.length} lifts with their weights passed.`);

const lib = await nodeLibrary();
let checked = 0;
for (const rig of ['game', 'game_lite', 'full'] as const) for (const restPose of ['A', 'T'] as const) for (const [name, body] of [['average', {}], ['short woman', { gender: 0, height: 0.15, weight: 0.3, proportions: 0.2 }], ['tall broad', { gender: 1, height: 0.9, weight: 0.85, muscle: 0.9 }]] as const) {
  for (const carry of ['none', ...GYM_WEIGHTS] as const) {
    const clips = FITNESS.filter((c) => carry === 'gym_weights' ? !!c.weights : (c.weights ?? 'none') === carry);
    const ch = await buildHuman(lib, { ...DEFAULT_PARAMS, ...body, rig, restPose, carry, weapon: 'none', detail: 'low', outfit: 'none', hair: 'none', faceShapes: false });
    const B = ch.rig!.bones, A = new Animator(ch.rig!), scale = Math.max(...B.flatMap((b) => [b.head[1], b.tail[1]])) / 1.8, label = `${rig} ${restPose} ${name} ${carry}`;
    const idx = (n: string) => B.findIndex((b) => b.name === boneFor(rig, n));
    const weights = B.flatMap((b, i) => (/^(Dumbbell[LR]|Kettlebell|Barbell)$/.test(b.name) ? [i] : []));
    assert.equal(weights.length, ({ none: 0, dumbbells: 2, kettlebell: 1, barbell: 1, gym_weights: 4 } as Record<string, number>)[carry], label + ' weight joints');
    const jointsFor = (kind: string) => weights.filter((i) => B[i].name.toLowerCase().startsWith(kind.slice(0, 5)));
    const shown = (f: ReturnType<Animator['frame']>, i: number) => Math.abs((f.scale?.get(i)?.[0] ?? 1) * PROP_REST - 1) < 1e-6;
    // Away from its lifts a weight stays packed.
    if (weights.length) for (const id of ['idle', 'walk', 'squat']) { const f = A.frame(clipById.get(id)!, 0.3); assert.ok(weights.every((i) => !shown(f, i)), `${label}: weight shows in ${id}`); }
    for (const c of clips) {
      const floor = -0.03 * scale, first = A.positions(A.frame(c, 0)), hands: number[][] = [], ankles: number[][] = [];
      for (let k = 0; k <= 24; k++) {
        const t = (c.duration * k) / 24, f = A.frame(c, t), p = A.positions(f);
        assert.ok(p.every((q) => q.every(Number.isFinite)), `${label} ${c.id}: NaN at ${t}`);
        // The full rig's toes are separate joints that clips don't bend, so they are left out there.
        const low = Math.min(...p.filter((_, i) => !weights.includes(i) && !/^toe\d-\d\.[LR]$/.test(B[i].name)).map((q) => q[1]));
        assert.ok(low > floor, `${label} ${c.id}: a joint is ${(-low / scale).toFixed(3)} m under the floor at ${t.toFixed(2)} s`);
        const L = p[idx('LeftHand')], R = p[idx('RightHand')];
        hands.push([...L, ...R]);ankles.push([...p[idx('LeftFoot')], ...p[idx('RightFoot')]]);
        if (!c.weights) continue;
        const own = jointsFor(c.weights);
        assert.ok(own.every((i) => shown(f, i)), `${label} ${c.id}: the weight is hidden`);
        assert.ok(weights.every((i) => own.includes(i) || !shown(f, i)), `${label} ${c.id}: another weight shows`);
        // Within a hand's length of the wrist(s) it is held by.
        const reach = 0.16 * scale;
        if (c.weights === 'dumbbells') { assert.ok(distance(p[own[0]], L) < reach && distance(p[own[1]], R) < reach, `${label} ${c.id}: a dumbbell left the hand at ${t.toFixed(2)} s`); }
        else assert.ok(distance(p[own[0]], mid(L, R)) < reach, `${label} ${c.id}: the ${c.weights} left the hands at ${t.toFixed(2)} s`);
      }
      // Push-up hands stay planted, and so do the feet in the clips that plant them.
      if (c.id === 'push_up') for (const h of hands) assert.ok(distance(h, hands[0]) < 0.03 * scale, `${label}: push-up hands slide`);
      if (['squat', 'dumbbell_curl', 'kettlebell_swing', 'barbell_squat', 'deadlift', 'sit_up'].includes(c.id)) for (const a of ankles) assert.ok(distance(a, ankles[0]) < 0.05 * scale, `${label} ${c.id}: the feet slide`);
      void first;
      checked++;
    }
    // The barbell rests on the floor at the bottom of the deadlift (plate radius, give or take).
    if (carry === 'barbell' || carry === 'gym_weights') {
      const p = A.positions(A.frame(clipById.get('deadlift')!, 1.4)), y = p[jointsFor('barbell')[0]][1] / scale;
      assert.ok(Math.abs(y - BARBELL_PLATE[0]) < 0.08, `${label}: the deadlift bar is at ${y.toFixed(2)} m, not on the floor`);
    }
  }
}
console.log(`Fitness poses: ${checked} clip and body combinations on the game, lite and full rigs passed.`);

// The lifts bring their weight unless a carried item was chosen; the phone clips still bring the phone.
assert.equal(carryForClips(['idle', 'deadlift']), 'barbell');
assert.equal(carryForClips(['kettlebell_swing', 'dumbbell_curl']), 'gym_weights');
assert.equal(carryForClips(['dumbbell_curl', 'squat']), 'dumbbells');
assert.equal(carryForClips(['texting', 'deadlift']), 'phone');
assert.equal(carryForClips(['deadlift'], 'backpack'), undefined);
assert.equal(carryForClips(['squat', 'push_up']), undefined);
// The Gym Instructor is a Sport preset with dumbbells; the gym is searchable and has seats.
for (const name of ['The Gym Instructor', 'The Powerlifter']) { assert.equal(PRESETS[name].carry, 'gym_weights');assert.equal(presetGroup(name), 'Sport'); }
for (const query of ['gym', 'fitness', 'workout', 'weights']) assert.ok(searchScenes(query).some((s) => s.id === 'gym'), query);
assert.equal(sceneById.get('gym')!.category, 'Leisure');
const gym = locationMapFile('gym').location;assert.ok(gym.seats.length >= 2, 'gym benches');
console.log('Carry choice, the Gym Instructor, the Powerlifter and the gym set passed.');
