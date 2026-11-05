/** Right-hand mounted weapon layer; original seat, gait and control hand stay intact. */
import type {Clip,Sample,HandTarget} from './clips/types';
import {grip,crossV,normV} from './clips/helpers';
import {qaxis,qrot,QI,type Q} from './quat';
import {RIDING_VEHICLES,isPassengerClip} from '../props/vehicles';
import {isFirearm,type WeaponId} from '../props/weapons';
export const WEAPON_POSES=['hold','aim','fire','hidden']as const;
export type WeaponPose=typeof WEAPON_POSES[number];
export const PADDLING_CLIPS=new Set(['paddle_canoe','paddle_kayak','row_boat']);
export function defaultWeaponYaw(clip:string){const id=RIDING_VEHICLES[clip];return id==='car'||id==='sports_car'||id==='suv'?(isPassengerClip(clip)?-80:80):id==='horse'?-55:-35;}
export function mountedWeaponSample(base:Sample,clip:Clip,time:number,weapon:WeaponId,pose:WeaponPose,yaw=defaultWeaponYaw(clip.id),chestCounter:Q=QI):Sample{
 const gun=isFirearm(weapon),aim=pose==='aim'||pose==='fire',angle=Math.max(-110,Math.min(110,yaw)),turn=qaxis([0,1,0],angle);
 const pulses=Math.max(1,Math.round(clip.duration*2)),kick=pose==='fire'&&gun?Math.max(0,Math.sin(time/clip.duration*Math.PI*2*pulses))**8:0;
 const bones={...base.bones};grip(bones,'Right',gun);
 const x=Math.max(0,Math.min(1,angle/80)),across=x*x*(3-2*x),pole:[number,number,number]=[-1+1.4*across,-.8,-.35];
 // Cross-body reaches clear the driver's outer window; passengers use the opposite side.
 const pos:[number,number,number]=[-.38+.74*across,aim?-.02:-.10,aim?.31:.23];
 pos[1]+=kick*.025;pos[2]-=kick*.025;
 const level=(v:[number,number,number])=>qrot(chestCounter,v),direction=(v:[number,number,number])=>level(qrot(turn,v)),wrist=level(pos);
 let right:HandTarget;
 if(gun){
  const gripDir:[number,number,number]=weapon==='rifle'?[.1,-.55+kick*.28,.83]:[.05,-.25+kick*.28,.97];
  right={pos:wrist,pole,dir:direction(normV(gripDir)),palm:direction([1,0,0])};
 }else{
  // Blades point away from the body and cabin, with a modest upward guard.
  const blade=direction(normV([0,aim?.22:.48,1])),edge=direction([0,-1,0]);
  const dot=edge.reduce((n,x,i)=>n+x*blade[i],0),dir=normV(edge.map((x,i)=>x-dot*blade[i])as [number,number,number]);
  right={pos:wrist,pole,dir,palm:crossV(blade,dir)};
 }
 if(aim){bones.Neck=[base.bones.Neck?.[0]??0,angle*.35,base.bones.Neck?.[2]??0];bones.Head=[base.bones.Head?.[0]??0,angle*.5,base.bones.Head?.[2]??0];delete bones.LeftEye;delete bones.RightEye;}
 return {...base,bones,ik:{...base.ik,Right:right},thumbs:{...base.thumbs,Right:.8},gaze:aim?[angle*.15,0]:base.gaze};
}
