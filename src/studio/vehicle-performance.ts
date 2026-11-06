/** Passenger performances reuse the same fixed-length choreography and fitted skeleton. */
import {clipById,type Clip} from '../core/anim/clips';
import {VEHICLE_FOR_CLIP,VEHICLE_CLIP,vehicleLift,isCar,type VehicleId} from '../core/props/vehicles';
import {boardingFrame} from '../core/anim/boarding';
import {boardProgress} from '../core/props/vehicle-actions';
import type {Animator,Frame} from '../core/anim/evaluate';
import type {Beat} from './project';
import type {StagedActor} from './vehicle-stage';
import {boneFor} from '../core/rig/poses';
import {qmul,type Q} from '../core/anim/quat';
export function passengerClip(clip:Clip,model:VehicleId):Clip{
 const source=clipById.get(model==='motorcycle'?'ride_motorcycle':'sit_passenger')!;
 return {...clip,sample:t=>{
  const s=source.sample(t/clip.duration*source.duration);
  if(model!=='motorcycle')return s;
  return {...s,bones:{...s.bones,LeftArm:[10,0,5],RightArm:[10,0,-5],LeftForeArm:[25,0,0],RightForeArm:[25,0,0]},ik:undefined};
 }};
}
export function passengerFrame(animator:Animator,beat:Beat,time:number,state:StagedActor,scale:number,faceTime:number):Frame{
 const clip=clipById.get(beat.clip)!,model=VEHICLE_FOR_CLIP[clip.id],ride=passengerClip(clipById.get(VEHICLE_CLIP[model])!,model),lift=vehicleLift(model,scale);
 let frame:Frame;
 if(clip.vehicleTransition){
  const reference={...ride,id:`${ride.id}-${state.seat}`},choreography=model==='car'||model==='sports_car'||model==='suv'?(state.seat==='rear-left'?VEHICLE_CLIP[model]:model==='suv'?'sit_suv_passenger':model==='sports_car'?'sit_sports_car_passenger':'sit_passenger'):VEHICLE_CLIP[model];
  frame=boardingFrame(animator,clip,time,clipById.get('idle')!,reference,lift,choreography,state.stand);
  const socket=animator.rig.bones.findIndex(b=>b.name==='WeaponR');if(socket>=0)frame.scale=new Map([[socket,[0,0,0]]]);
 }else frame=animator.frame(passengerClip(clip,model),time,{faceTime,vehicleLift:lift,weaponPose:beat.weaponPose,weaponYaw:beat.weaponYaw??(isCar(model)?state.seat==='rear-left'?80:-80:state.seat==='passenger-left'?55:-55)});
 const weight=clip.vehicleTransition?boardProgress(clip.vehicleTransition,time,clip.duration):1;
 if(state.seatShift[1])for(const [i,p]of frame.rootPos)frame.rootPos.set(i,[p[0],p[1]+state.seatShift[1]*weight,p[2]]);
 // Fit the seated hips to the shared upholstery, then keep longer legs above its real floor.
 // IK bends the knee; it never scales the guest's bones to match the driver's body.
 if(weight>.8&&model!=='motorcycle'){
  const u=Math.min(1,(weight-.8)/.2),w=u*u*(3-2*u),B=animator.rig.bones,P=animator.positions(frame),world:Q[]=[];B.forEach((b,i)=>world[i]=b.parent<0?frame.rot[i]:qmul(world[b.parent],frame.rot[i]));
  for(const side of ['Left','Right']as const){const i=B.findIndex(b=>b.name===boneFor(animator.rig.type,`${side}Foot`)),p=P[i],floor=state.deckFloor+.07*scale;if(p[1]<floor)animator.pinLimb(frame,side,'leg',[p[0],p[1]+(floor-p[1])*w,p[2]],[side==='Left'?.3:-.3,.12,1],world[i]);}
 }
 return frame;
}
