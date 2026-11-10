import {Raycaster,Vector3} from 'three';
import type {VehicleSurface} from './vehicle-surfaces';
/** Existing fitted pickup geometry and controls, anchored independently of its driver. */
import {Vehicle} from '../core/props/vehicle';
import {clipById} from '../core/anim/clips';
import {wheelHands} from '../core/anim/clips/vehicles';
import {boardingScale,boardProgress,doorOpenAt} from '../core/props/vehicle-actions';
import {vehicleStyleForChoice,DEFAULT_VEHICLE_STYLE} from '../core/props/vehicles';
import type {Rig} from '../core/rig/rig';
import type {Frame} from '../core/anim/evaluate';
import type {GameActor} from './actor';
import type {CompanionState} from './companion';
import {fitPassenger,fitPickupCabin} from './passenger-view';
import {DRIVE,type CarState,type CarFit,type DrivingSettings} from './driving';
export function drivingClip(steer:number){const clip=clipById.get('drive_pickup')!;return {...clip,sample:()=>({...clip.sample(0),ik:wheelHands([0,-.34,.42],.18,28,5*Math.sin(1)+steer*80)})};}
/** Measure deck heights from the same rendered mesh, including a passenger-raised cabin. */
export function measurePickupSurfaces(vehicle:Vehicle):VehicleSurface[]{
 const s=vehicle.fit.scale,H=vehicle.fit.average('hip'),cx=-.36*s,z=H.z,width=2.02*s,ray=new Raycaster();vehicle.group.updateMatrixWorld(true);
 const top=(x:number,zz:number)=>{const origin=vehicle.group.localToWorld(new Vector3(x,vehicle.bounds.max.y+4,zz));ray.set(origin,new Vector3(0,-1,0));const hit=ray.intersectObject(vehicle.group,true)[0];if(!hit)throw Error('The pickup needs measured climbable surfaces.');return vehicle.group.worldToLocal(hit.point.clone()).y;};
 const hood=top(cx,z+1.3*s),roof=top(cx,z),bed=top(cx,z-1.6*s),rail=top(cx+width*.44,z-1.6*s);
 return [
  {id:'hood',box:{minX:cx-width*.49,maxX:cx+width*.49,minZ:z+.72*s,maxZ:z+2.15*s},h:hood,climbable:true},
  {id:'cab',box:{minX:cx-width*.47,maxX:cx+width*.47,minZ:z-.75*s,maxZ:z+.72*s},h:roof,climbable:true},
  {id:'bed',box:{minX:cx-width*.39,maxX:cx+width*.39,minZ:z-2.9*s,maxZ:z-.82*s},h:bed,climbable:true},
  ...[-1,1].map(side=>({id:'rail-'+side,box:{minX:cx+side*width*.44-.06*s,maxX:cx+side*width*.44+.06*s,minZ:z-3*s,maxZ:z-.75*s},h:rail,climbable:false})),
  {id:'tailgate',box:{minX:cx-width*.49,maxX:cx+width*.49,minZ:z-3.03*s,maxZ:z-2.9*s},h:rail,climbable:false},
 ];
}
export function measurePickup(vehicle:Vehicle,rig:Rig,radius:number,passengerRadius=radius):CarFit {
 const b=vehicle.bounds,s=vehicle.fit.scale,stand=Math.max(1.13*boardingScale(rig),b.max.x+radius+.14);return {surfaces:measurePickupSurfaces(vehicle),box:{minX:b.min.x-.025,maxX:b.max.x+.025,minZ:b.min.z-.025,maxZ:b.max.z+.025},height:b.max.y,stand:{x:stand,z:0},passenger:{seat:{x:vehicle.fit.average('hip').x-.72*s,z:vehicle.fit.average('hip').z},stand:{x:b.min.x-passengerRadius-.14,z:0}},scale:s};
}
export class DrivingView {
 readonly vehicle:Vehicle;readonly fit:CarFit;passengerActor?:GameActor;
 constructor(readonly actor:GameActor,readonly settings:DrivingSettings,radius:number,readonly passengerRadius=radius){
  this.vehicle=new Vehicle('pickup',actor.render.character.rig!,actor.render.animator,clipById.get('drive_pickup')!,{...vehicleStyleForChoice('pickup',DEFAULT_VEHICLE_STYLE),color:settings.color});this.vehicle.filmMotion=true;if(actor.render.character.params.weapon!=='none')this.vehicle.group.traverse(o=>{if(o.name.startsWith('Window_'))o.scale.y=.001;});
  this.fit=measurePickup(this.vehicle,actor.render.character.rig!,radius,passengerRadius);
 }
 configurePassenger(actor:GameActor,car:CarState){if(this.passengerActor!==actor){fitPickupCabin(this.vehicle,actor.render.animator,car);this.fit.height=this.vehicle.bounds.max.y;this.fit.surfaces=measurePickupSurfaces(this.vehicle);this.passengerActor=actor;}actor.passengerFit=fitPassenger(this.vehicle,actor.render.animator,car);}
 update(car:CarState,frame?:Frame,passenger?:CompanionState){
  const phase=car.phase,transition=phase==='boarding'||phase==='alighting',clip=clipById.get(phase==='boarding'?'board_pickup':phase==='alighting'?'alight_pickup':'drive_pickup')!,time=transition?car.time/(phase==='boarding'?DRIVE.boarding:DRIVE.alighting)*clip.duration:0;
  this.vehicle.group.position.set(car.x,0,car.z);this.vehicle.group.rotation.y=car.yaw;
  this.vehicle.update(time,frame,car.distance,clip,phase==='parked');
  const ride=passenger?.riding,passengerClip=clipById.get(ride?.phase==='alighting'?'alight_pickup_passenger':'board_pickup_passenger')!,opening=ride&&(ride.phase==='boarding'||ride.phase==='alighting')?doorOpenAt(boardProgress(passengerClip.vehicleTransition!,ride.time/(ride.phase==='boarding'?DRIVE.boarding:DRIVE.alighting)*passengerClip.duration,passengerClip.duration)):0;
  this.vehicle.group.traverse(o=>{if(o.userData.doorSide===-1)o.rotation.y=opening*1.3;if(o.name.startsWith('Wheel_front')){o.rotation.order='YXZ';o.rotation.y=-car.steer;}});
 }
 dispose(){this.vehicle.group.removeFromParent();this.vehicle.dispose();}
}
