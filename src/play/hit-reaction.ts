/** Directional flinches affect the character, never its movement body or camera anchor. */
import {Animator,type Frame} from '../core/anim/evaluate';
import {clipById} from '../core/anim/clips';
import {boneFor} from '../core/rig/poses';
import {QI,qconj,qmul,qslerp} from '../core/anim/quat';
import type {Combatant,HitDirection} from './combat';

export const HIT_REACTION_DURATION=.8;
const cache=new WeakMap<Animator,{joints:{index:number;head:boolean}[];neutral:Map<HitDirection,Frame>}>();

/** Keep the base locomotion pose free of reactions so repeated frames cannot accumulate a bend. */
export function hitReactionFrame(animator:Animator,base:Frame,combat:Combatant,contact=false):Frame {
 if(combat.health<=0||combat.hitAge<0||combat.hitAge>=HIT_REACTION_DURATION)return base;
 let saved=cache.get(animator);
 if(!saved){
  const joints=['Spine','Spine1','Spine2','Neck','Head'].flatMap(name=>{const index=animator.rig.bones.findIndex(b=>b.name===boneFor(animator.rig.type,name));return index<0?[]:[{index,head:name==='Head'||name==='Neck'}];});
  saved={joints,neutral:new Map()};cache.set(animator,saved);
 }
 const direction=combat.hitDirection,clip=clipById.get(`hit_${direction}`)!;
 let neutral=saved.neutral.get(direction);if(!neutral){neutral=animator.frame(clip,0,{rootMotion:false,faceTime:0});saved.neutral.set(direction,neutral);}
 const impact=animator.frame(clip,combat.hitAge,{rootMotion:false,faceTime:0}),rot=base.rot.slice();
 for(const {index,head}of saved.joints){
  // During a fitted hand contact, react with the head/neck without moving the planted hands.
  if(contact&&!head)continue;
  const delta=qmul(impact.rot[index],qconj(neutral.rot[index]));rot[index]=qmul(qslerp(QI,delta,.8),base.rot[index]);
 }
 return {...base,rot};
}
