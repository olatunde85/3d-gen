import {AERIAL} from './aerial';
/**
 * All animation clips, in the order the app and exporters list them.
 * Each set lives in its own module; add new sets as new files and list them here.
 */
import { type Clip } from './types';
import { crouch, idle } from './basic';
import { pace, recordedWalk, recordedRun, recordedStrafeLeft, recordedStrafeRight, walkBack } from './recorded';
import { fall, hit, jumpAir, jumpLand, jumpRunning, jumpStart, punch } from './actions';
import { cheer, laugh, talk, wave, SOCIAL_EMOTES } from './emotes';
import { PISTOL, RIFLE } from './shooter';
import { MELEE } from './melee';
import { VEHICLES, BOARDING, VEHICLE_TUMBLES, VEHICLE_CRASHES } from './vehicles';
import { DODGES } from './dodge';
import { SWIMMING } from './swimming';
import { EVERYDAY } from './everyday';
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
const easeFrom = (c: Clip, from: Clip, over: number, ground=false): Clip => ({
  ...c,
  sample: (t) => {
    const s = c.sample(t), x = Math.min(1, t / over), w = 1 - x * x * (3 - 2 * x);
    return w > 0 ? { ...s, blend: { sample: from.sample(0), w, ground } } : s;
  },
});
/** A clip played backwards (Stand up is Sit down in reverse, so it ends where Sit down began). */
const reversed = (c: Clip, id: string, name: string): Clip => ({ ...c, id, name, sample: (t) => c.sample(c.duration - t) });
/** Preserve the impact itself, then recover to the exact same upright pose as the start. */
const recover = (c:Clip,over:number):Clip=>({...c,sample:t=>{
  const s=c.sample(t),x=Math.max(0,Math.min(1,(t-(c.duration-over))/over)),w=x*x*(3-2*x);
  return w?{...s,blend:{sample:idle.sample(0),w,ground:true}}:s;
}});
const capturedTurn=(id:string,name:string,angle:number)=>{
  const c=easeFrom(mocap(id,name,'Turns'),idle,.2,true);
  return pace({...c,sample:(t:number)=>{const s=c.sample(t),x=Math.max(0,Math.min(1,(t-c.duration+.25)/.25)),w=x*x*(3-2*x),rest=idle.sample(0);return w?{...s,blend:{sample:{...rest,root:{...rest.root,yaw:angle}},w,ground:true}}:s;}},.5);
};

// Sitting starts from Idle; Stand up (its reverse) therefore ends in Idle.
const SIT_DOWN = easeFrom(mocap('sit_down', 'Sit down (chair)', 'Sitting & lying'), idle, 0.7);

export const CLIPS: Clip[] = withFaces(
  [
    idle,
    crouch,
    recordedWalk,
    mocap('walk_slouch', 'Slouch walk', 'Locomotion'),
    mocap('model_walk', 'Model walk (catwalk)', 'Locomotion'),
    recordedRun,
    walkBack,
    recordedStrafeLeft,
    recordedStrafeRight,
    recover(easeFrom(mocap('jump', 'Jump', 'Actions'),idle,.2,true),.45),
    jumpStart,
    jumpAir,
    jumpLand,
    recover(jumpRunning,.24),
    fall,
    punch,
    recover(easeFrom(mocap('punch_low', 'Low punch', 'Actions'),idle,.25,true),.45),
    hit,
    ...DODGES,
    ...REACTIONS,
    ...INTERACTIONS,
    ...SWIMMING,
    ...EVERYDAY,
    wave,
    cheer,
    laugh,
    talk,
    mocap('cry', 'Cry', 'Emotes'),
    ...SOCIAL_EMOTES,
    SIT_DOWN,
    mocap('sit_idle', 'Sit idle (chair)', 'Sitting & lying'),
    reversed(SIT_DOWN, 'stand_up', 'Stand up (chair)'),
    lieDown,
    sleep,
    capturedTurn('turn_left_45', 'Turn left 45°', 45),
    capturedTurn('turn_left_90', 'Turn left 90°', 90),
    capturedTurn('turn_right_45', 'Turn right 45°', -45),
    capturedTurn('turn_right_90', 'Turn right 90°', -90),
    capturedTurn('turn_360', 'Full turn 360°', 360),
    ...PISTOL,
    ...MELEE,
    ...RIFLE,
    ...VEHICLES,
    ...BOARDING,
    ...VEHICLE_TUMBLES,
    ...VEHICLE_CRASHES,
    ...AERIAL,
  ],
);

export const clipById = new Map(CLIPS.map((c) => [c.id, c]));
