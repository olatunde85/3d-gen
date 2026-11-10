import {boneFor} from '../core/rig/poses';
import {qmul,qslerp,QI,qaxis} from '../core/anim/quat';
import type {Animator,Frame} from '../core/anim/evaluate';
/** Existing crouch gait, with free arms or the current pistol action layered over it. */
import {clipById,type Clip} from '../core/anim/clips';
export function crouchLocomotion(moving:boolean):Clip{
 if(!moving)return clipById.get('crouch')!;
 const gait=clipById.get('rifle_crouch_walk')!,idle=clipById.get('crouch')!;
 return {...gait,id:'play_crouch_walk',sample:t=>{const s=gait.sample(t),arms=idle.sample(t),bones={...s.bones};for(const name of Object.keys(bones))if(/(Arm|Hand|Finger|Thumb)/.test(name))delete bones[name];for(const [name,ch]of Object.entries(arms.bones))if(/(Arm|Hand|Finger|Thumb|Neck|Head)/.test(name))bones[name]=ch;return {...s,bones,ik:undefined};}};
}
export function defeatClip(direction:'front'|'back'|'left'|'right',crouched=false):Clip{
 const source=clipById.get(direction==='back'?'shot_back':'shot_chest')!;if(!crouched)return source;
 // Enter the buckling part of the performance; a crouched victim must never rise to die.
 const offset=direction==='back'?.85:1.4;return {...source,duration:source.duration-offset,sample:t=>source.sample(t+offset)};
}

/** Seated defeats slump in the cabin; a full floor fall would pass through the dashboard. */
export function seatedDefeatFrame(animator:Animator,base:Frame,age:number):Frame{
 const rot=base.rot.slice(),w=Math.min(1,age/.65);
 for(const [name,angle]of [['Spine',8],['Neck',20],['Head',24]]as const){const i=animator.rig.bones.findIndex(b=>b.name===boneFor(animator.rig.type,name));if(i>=0)rot[i]=qmul(qslerp(QI,qaxis([1,0,0],angle),w),rot[i]);}
 return {...base,rot};
}
