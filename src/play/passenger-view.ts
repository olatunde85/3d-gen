/** Fit a guest to the driver's actual passenger seat, preserving every bone length. */
import {Mesh,Matrix4,Vector3} from 'three';
import {RiderFit} from '../core/props/vehicle-kit';
import {clipById} from '../core/anim/clips';
import {boardingFrame} from '../core/anim/boarding';
import {boardingScale,boardProgress} from '../core/props/vehicle-actions';
import {vehicleLift} from '../core/props/vehicles';
import {boneFor} from '../core/rig/poses';
import {qmul,type Q} from '../core/anim/quat';
import type {Animator,Frame} from '../core/anim/evaluate';
import type {Vec3} from '../core/math';
import type {Vehicle} from '../core/props/vehicle';
import type {CompanionState} from './companion';
import {DRIVE,type CarState} from './driving';
export interface PassengerPose {shift:Vec3;floor:number;stand:[number,number]}
export function fitPassenger(vehicle:Vehicle,guest:Animator,car:CarState):PassengerPose{
 const ride=clipById.get('sit_pickup_passenger')!,scale=boardingScale(guest.rig),lift=vehicleLift('pickup',scale),own=guest.positions(guest.frame(ride,0,{vehicleLift:lift,vehicleMotion:false,weaponPose:'hidden'}))[guest.rig.bones.findIndex(b=>b.name===boneFor(guest.rig.type,'Hips'))],hip=vehicle.fit.average('hip'),shift:Vec3=[hip.x-.72*vehicle.fit.scale-own[0],hip.y-own[1],hip.z-own[2]],stand=car.fit.passenger!.stand;
 return {shift,floor:vehicle.lift,stand:[(stand.x-shift[0])/scale,(stand.z-shift[2])/scale]};
}
export function pickupPassengerFrame(animator:Animator,riding:NonNullable<CompanionState['riding']>,fit:PassengerPose,time:number):Frame{
 const ride=clipById.get('sit_pickup_passenger')!,transition=riding.phase==='boarding'||riding.phase==='alighting',clip=clipById.get(riding.phase==='alighting'?'alight_pickup_passenger':'board_pickup_passenger')!,scale=boardingScale(animator.rig),lift=vehicleLift('pickup',scale),phase=riding.time/(riding.phase==='alighting'?DRIVE.alighting:DRIVE.boarding)*clip.duration;
 const f=transition?boardingFrame(animator,clip,phase,clipById.get('idle')!,ride,lift,'sit_pickup_passenger',fit.stand):animator.frame(ride,0,{vehicleLift:lift,vehicleMotion:false,weaponPose:'hidden',faceTime:time}),weight=transition?boardProgress(clip.vehicleTransition!,phase,clip.duration):1;
 for(const [i,p]of f.rootPos)f.rootPos.set(i,[p[0],p[1]+fit.shift[1]*weight,p[2]]);
 if(weight>.8){const P=animator.positions(f),B=animator.rig.bones,world:Q[]=[];B.forEach((b,i)=>world[i]=b.parent<0?f.rot[i]:qmul(world[b.parent],f.rot[i]));const t=Math.min(1,(weight-.8)/.2),w=t*t*(3-2*t);for(const side of ['Left','Right']as const){const i=B.findIndex(b=>b.name===boneFor(animator.rig.type,`${side}Foot`)),p=P[i],floor=fit.floor+.07*scale;if(p[1]<floor)animator.pinLimb(f,side,'leg',[p[0],p[1]+(floor-p[1])*w,p[2]],[side==='Left'?.3:-.3,.12,1],world[i]);}}
 return f;
}

/** Extra headroom belongs to the cabin geometry, never to a compressed guest skeleton. */
export function fitPickupCabin(vehicle:Vehicle,guest:Animator,car:CarState){
 const fit=fitPassenger(vehicle,guest,car),frame=pickupPassengerFrame(guest,{phase:'seated',time:0},fit,0),contacts=new RiderFit(guest.rig,guest,clipById.get('sit_pickup_passenger')!,'pickup').fromFrame(frame),roof=vehicle.bounds.max.y,extra=Math.max(0,contacts.headTop.y+.16*boardingScale(guest.rig)-roof);
 if(extra<.001)return;const sill=vehicle.fit.average('hip').y+.2*vehicle.fit.scale,ceiling=roof-.08*vehicle.fit.scale;vehicle.group.updateMatrixWorld(true);const inverse=vehicle.group.matrixWorld.clone().invert(),point=new Vector3();
 vehicle.group.traverse(o=>{if(!(o instanceof Mesh))return;const matrix=new Matrix4().multiplyMatrices(inverse,o.matrixWorld),back=matrix.clone().invert(),P=o.geometry.getAttribute('position');for(let i=0;i<P.count;i++){point.fromBufferAttribute(P,i).applyMatrix4(matrix);point.y+=extra*Math.max(0,Math.min(1,(point.y-sill)/(ceiling-sill)));point.applyMatrix4(back);P.setXYZ(i,point.x,point.y,point.z);}P.needsUpdate=true;o.geometry.computeVertexNormals();o.geometry.computeBoundingBox();o.geometry.computeBoundingSphere();});
}
