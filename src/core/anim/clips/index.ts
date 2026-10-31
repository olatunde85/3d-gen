/**
 * All animation clips, in the order the app and exporters list them.
 * Each set lives in its own module; add new sets as new files and list them here.
 */
import { type Clip } from './types';
import { turn } from './gait';
import { crouch, idle, walkBack } from './basic';
import { fall, hit, jumpAir, jumpLand, jumpRunning, jumpStart, punch } from './actions';
import { cheer, laugh, talk, wave } from './emotes';
import { PISTOL, RIFLE } from './shooter';
import { MELEE } from './melee';
import { VEHICLES } from './vehicles';
import { INTERACTIONS } from './interaction';
import { REACTIONS } from './reactions';
import { withFaces } from './faces';
import { lieDown, sleep } from './lying';
import { MOCAP_DATA } from './mocap-data';
import { clipFromMocap } from '../mocap';
export * from './types';

/** Motion-captured clips (CMU, see clips/mocap-data.ts); the rest are keyframed. */
const mocap = (id: string, name: string, category: Clip['category']): Clip => clipFromMocap(MOCAP_DATA[id], { id, name, category });
/** A clip that starts from another clip's first pose and eases into its own over `over` seconds. */
const easeFrom = (c: Clip, from: Clip, over: number): Clip => ({
  ...c,
  sample: (t) => {
    const s = c.sample(t), x = Math.min(1, t / over), w = 1 - x * x * (3 - 2 * x);
    return w > 0 ? { ...s, blend: { sample: from.sample(0), w } } : s;
  },
});
/** A clip played backwards (Stand up is Sit down in reverse, so it ends where Sit down began). */
const reversed = (c: Clip, id: string, name: string): Clip => ({ ...c, id, name, sample: (t) => c.sample(c.duration - t) });

// Sitting starts from Idle; Stand up (its reverse) therefore ends in Idle.
const SIT_DOWN = easeFrom(mocap('sit_down', 'Sit down (chair)', 'Sitting & lying'), idle, 0.7);

export const CLIPS: Clip[] = withFaces(
  [
    idle,
    crouch,
    mocap('walk', 'Walk', 'Locomotion'),
    mocap('walk_slouch', 'Slouch walk', 'Locomotion'),
    mocap('run', 'Run', 'Locomotion'),
    walkBack,
    mocap('strafe_left', 'Strafe left', 'Locomotion'),
    mocap('strafe_right', 'Strafe right', 'Locomotion'),
    mocap('jump', 'Jump', 'Actions'),
    jumpStart,
    jumpAir,
    jumpLand,
    jumpRunning,
    fall,
    punch,
    mocap('punch_low', 'Low punch', 'Actions'),
    hit,
    ...REACTIONS,
    ...INTERACTIONS,
    wave,
    cheer,
    laugh,
    talk,
    mocap('cry', 'Cry', 'Emotes'),
    SIT_DOWN,
    mocap('sit_idle', 'Sit idle (chair)', 'Sitting & lying'),
    reversed(SIT_DOWN, 'stand_up', 'Stand up (chair)'),
    lieDown,
    sleep,
    turn('turn_left_45', 'Turn left 45°', 45),
    turn('turn_left_90', 'Turn left 90°', 90),
    turn('turn_right_45', 'Turn right 45°', -45),
    turn('turn_right_90', 'Turn right 90°', -90),
    turn('turn_360', 'Full turn 360°', 360),
    ...PISTOL,
    ...MELEE,
    ...RIFLE,
    ...VEHICLES,
  ],
);

export const clipById = new Map(CLIPS.map((c) => [c.id, c]));
