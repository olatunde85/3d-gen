/** Right-hand mounted weapon layer; original seat, gait and control hand stay intact. */
import type {Clip,Sample,HandTarget} from './clips/types';
import {grip,crossV,normV} from './clips/helpers';
import {qaxis,qrot,qmul,QI,type Q} from './quat';
import {RIDING_VEHICLES,isPassengerClip} from '../props/vehicles';
import {isFirearm,type WeaponId} from '../props/weapons';
export const WEAPON_POSES=['hold','aim','fire','hidden']as const;
export type WeaponPose=typeof WEAPON_POSES[number];
export const PADDLING_CLIPS=new Set(['paddle_canoe','paddle_kayak','row_boat']);
export function defaultWeaponYaw(clip:string,seat?:string){const id=RIDING_VEHICLES[clip];if(id==='helicopter'&&(seat==='front-passenger'||seat==='rear-left'))return 80;return id==='car'||id==='sports_car'||id==='suv'||id==='pickup'?(isPassengerClip(clip)?-80:80):id==='horse'?-55:-35;}
/** Operators sealed inside armour or flying a take-off/landing cannot wield a weapon; it stays hidden. */
export const ENCLOSED_CLIPS=new Set(['drive_tank','takeoff_jet','land_jet']);
export function supportsWeaponAim(id:string){return !!RIDING_VEHICLES[id]&&!ENCLOSED_CLIPS.has(id)||/^(pistol|rifle)_(?!reload)/.test(id);}
export function mountedWeaponSample(base:Sample,clip:Clip,time:number,weapon:WeaponId,pose:WeaponPose,yaw=defaultWeaponYaw(clip.id),chestCounter:Q=QI,pitch=0):Sample{
 const gun=isFirearm(weapon),aim=pose==='aim'||pose==='fire',angle=Math.max(-110,Math.min(110,yaw)),elevation=Math.max(-45,Math.min(60,pitch)),turn=qmul(qaxis([0,1,0],angle),qaxis([1,0,0],-elevation));
 const pulses=Math.max(1,Math.round(clip.duration*2)),kick=pose==='fire'&&gun?Math.max(0,Math.sin(time/clip.duration*Math.PI*2*pulses))**8:0;
 const bones={...base.bones};grip(bones,'Right',gun);
 const x=Math.max(0,Math.min(1,angle/80)),across=x*x*(3-2*x),pole:[number,number,number]=[-1+1.4*across,-.8,-.35];
 // Cross-body reaches clear the driver's outer window; passengers use the opposite side.
 const reach=qrot(turn,[0,0,aim?.34:.23]);
 const pos:[number,number,number]=[-.22+.44*across+reach[0]*.35,(aim?-.15:-.27)+reach[1],reach[2]];
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
 return {...base,bones,ik:{...base.ik,Right:right},thumbs:{...base.thumbs,Right:.8},gaze:aim?[angle*.15,elevation*.25]:base.gaze};
}

export function directedWeaponSample(base:Sample,yaw=0,pitch=0):Sample{
 const turn=qmul(qaxis([0,1,0],Math.max(-110,Math.min(110,yaw))),qaxis([1,0,0],-Math.max(-45,Math.min(60,pitch))));
 const transform=(h:HandTarget):HandTarget=>{
  const pivot:[number,number,number]=[0,-.15,0],offset=h.pos.map((x,i)=>x-pivot[i])as [number,number,number],p=qrot(turn,offset);
  return {...h,pos:p.map((x,i)=>x+pivot[i])as [number,number,number],pole:qrot(turn,h.pole),...(h.dir?{dir:qrot(turn,h.dir)}:{}),...(h.palm?{palm:qrot(turn,h.palm)}:{})};
 };
 const bones={...base.bones,Neck:[(base.bones.Neck?.[0]??0)-pitch*.3,yaw*.3,base.bones.Neck?.[2]??0]as [number,number,number],Head:[(base.bones.Head?.[0]??0)-pitch*.3,yaw*.45,base.bones.Head?.[2]??0]as [number,number,number]};
 return {...base,bones,ik:{...(base.ik?.Right?{Right:transform(base.ik.Right)}:{}),...(base.ik?.Left?{Left:transform(base.ik.Left)}:{})},gaze:[yaw*.25,pitch*.25]};
}
