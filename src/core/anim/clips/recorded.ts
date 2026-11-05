/** Shared recorded locomotion. Layers retain the source feet, pelvis and stride distance. */
import { clipFromMocap } from '../mocap';
import { qaxis, qmul, qrot, qslerp } from '../quat';
import { MOCAP_DATA } from './mocap-data';
import type { Clip, Sample } from './types';

export const recordedWalk=clipFromMocap(MOCAP_DATA.walk,{id:'walk',name:'Walk',category:'Locomotion'});
export const recordedRun=clipFromMocap(MOCAP_DATA.run,{id:'run',name:'Run',category:'Locomotion'});
/** Reverse the complete recorded pose and root velocity together, without altering the gait. */
export const walkBack:Clip={...recordedWalk,id:'walk_back',name:'Walk backwards',
  travel:recordedWalk.travel!.map(v=>-v) as Clip['travel'],
  sample:t=>recordedWalk.sample(recordedWalk.duration-Math.max(0,Math.min(recordedWalk.duration,t))),
};

export function uprightStrafe(clip:Clip):Clip{
  return {...clip,sample:t=>{
    const s=clip.sample(t),m=s.mocap!,rot={...m.rot};
    // The recorded sidestep bends its chest farther forward than Walk. Correct only the upper
    // body; the captured pelvis, legs, foot contacts and root path remain unchanged.
    const correction=qaxis([1,0,0],-6);
    for(const name of Object.keys(rot))if(/^(Spine|Neck|Head|Left(Shoulder|Arm|ForeArm|Hand)|Right(Shoulder|Arm|ForeArm|Hand))/.test(name))rot[name]=qmul(correction,rot[name]);
    // Keep the gaze along the set's forward direction rather than scanning sideways mid-step.
    const forward=qrot(rot.Spine2,[0,0,1]),head=qaxis([0,1,0],Math.atan2(forward[0],forward[2])*180/Math.PI);
    rot.Head=head;rot.Neck=qslerp(rot.Spine2,head,.6);
    return {...s,mocap:{...m,rot},gaze:[0,0]};
  }};
}
export const recordedStrafeLeft=uprightStrafe(clipFromMocap(MOCAP_DATA.strafe_left,{id:'strafe_left',name:'Strafe left',category:'Locomotion'}));
export const recordedStrafeRight=uprightStrafe(clipFromMocap(MOCAP_DATA.strafe_right,{id:'strafe_right',name:'Strafe right',category:'Locomotion'}));

/** Retiming changes cadence AND root velocity, keeping exactly the same distance per stride. */
export function pace(clip:Clip,factor:number):Clip{
  return {...clip,duration:clip.duration*factor,travel:clip.travel?.map(v=>v/factor) as Clip['travel'],sample:t=>clip.sample(t/factor)};
}
/** A weapon hold replaces only the participating arm(s), not the captured lower body. */
export function armLayer(sample:Sample,sides:readonly ('Left'|'Right')[]=['Left','Right']):Sample{
  const m=sample.mocap!,rot={...m.rot};
  for(const side of sides)for(const part of ['Shoulder','Arm','ForeArm','Hand'])delete rot[side+part];
  return {...sample,mocap:{...m,rot}};
}
