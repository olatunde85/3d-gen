import {weaponProfile,type Equipment} from './weapons';
/** Pistol upper-body actions retain Ara's recorded feet and original bone lengths. */
import {clipById,type Clip} from '../core/anim/clips';
import {armLayer} from '../core/anim/clips/recorded';
import {track} from '../core/anim/clips/helpers';
import type {Sample,HandTarget} from '../core/anim/clips/types';
import {PISTOL,type Combatant} from './combat';
export function reloadSample(time:number):Sample {
 const sample=clipById.get('pistol_idle')!.sample(0),t=Math.max(0,Math.min(PISTOL.reload,time)),right=sample.ik!.Right!,left=sample.ik!.Left!;
 const times=[0,.3,.65,1.05,1.35,1.8],at=(values:number[])=>track(times,values)(t);
 const hand:HandTarget={...left,pos:[at([left.pos[0],.32,.24,.04,.02,left.pos[0]]),at([left.pos[1],-.58,-.5,-.4,-.25,left.pos[1]]),at([left.pos[2],.12,.15,.25,.32,left.pos[2]])],pole:[.7,-1,-.1]};
 return {...sample,ik:{Right:{...right,pos:[right.pos[0],right.pos[1]+at([0,.09,.09,.09,.09,0]),right.pos[2]]},Left:hand},gaze:[0,0]};
}
/** Match locomotion to the actor's movement relative to the direction of aim. */
export function pistolLocomotion(moving:boolean,speed:number,aiming:boolean,relative:number):Clip {
 if(!moving)return clipById.get(aiming?'pistol_aim':'pistol_idle')!;
 if(!aiming)return clipById.get(speed>2.65?'pistol_run':'pistol_walk')!;
 if(Math.cos(relative)<-.6)return clipById.get('walk_back')!;
 if(Math.abs(Math.sin(relative))>.7)return clipById.get(relative>0?'pistol_strafe_left':'pistol_strafe_right')!;
 return clipById.get('pistol_walk')!;
}
export function weaponLocomotion(weapon:Equipment,moving:boolean,speed:number,aiming:boolean,relative:number):Clip{
 if(weapon!=='rifle')return pistolLocomotion(moving,speed,aiming,relative);
 const id=!moving?aiming?'rifle_aim':'rifle_idle':!aiming&&speed>2.65?'rifle_run':aiming&&Math.cos(relative)<-.6?'rifle_walk_back':aiming&&Math.abs(Math.sin(relative))>.7?relative>0?'rifle_strafe_left':'rifle_strafe_right':'rifle_walk';return clipById.get(id)!;
}
export function combatClip(base:Clip,c:Combatant):Clip {
 const gun=c.weapon==='rifle'?'rifle':'pistol',profile=weaponProfile(c.weapon),reloading=c.reload>0,fire=c.fireAge<profile.fireWindow,upper=reloading?undefined:clipById.get(`${gun}_${fire?'fire':c.aiming?'aim':'idle'}`)!;
 return {...base,id:reloading?`${gun}_reload_game`:`${gun}_game_${base.id}`,sample:t=>{
  const original=base.sample(t),s=original.mocap?armLayer(original):original,u=reloading?gun==='rifle'?clipById.get('rifle_reload')!.sample(profile.reload-c.reload):reloadSample(PISTOL.reload-c.reload):upper!.sample(fire?c.fireAge:t%upper!.duration),bones={...s.bones};
  for(const [name,value]of Object.entries(u.bones))if(!/(Hips|UpLeg|Leg|Foot|ToeBase)/.test(name))bones[name]=value;
  return {...s,bones,ik:u.ik,thumbs:u.thumbs,gaze:u.gaze};
 }};
}
