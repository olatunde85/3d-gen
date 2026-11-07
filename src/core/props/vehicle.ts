import {vehicleStunt,vehicleCrash} from './vehicle-stunt';
import {clipVehicleMotion,bailoutDrift,manoeuvre} from './vehicle-motion';
import {tankGunFiring} from '../anim/clips/vehicles';
import {buildJet,buildTank} from './vehicle-special';
/** One fitted, customizable vehicle implementation for preview, films and game exports. */
import * as T from 'three';
import {mergeVehicleParts} from './vehicle-merge';
import {Bicycle} from './bicycle';
import {buildCar,buildMotorcycle} from './vehicle-land';
import {buildHelicopter} from './vehicle-helicopter';
import {buildWatercraft} from './vehicle-water';
import {buildHorse} from './vehicle-horse';
import {RiderFit,VehicleKit,v} from './vehicle-kit';
import {sanitizeVehicleStyle,isCar,type VehicleId,type VehicleStyle} from './vehicles';
import type {Rig} from '../rig/rig';
import type {Animator,Frame,BakedClip} from '../anim/evaluate';
import {clipById,type Clip} from '../anim/clips';
import {ridingClip,boardProgress,doorOpenAt,hatchOpenAt} from './vehicle-actions';
import {articulateDoors} from './vehicle-doors';
import type {MeshData,Material} from '../mesh';
import type {Q} from '../anim/quat';
import type {Vec3} from '../math';
export class Vehicle{
 readonly group:T.Group;readonly fit:RiderFit;readonly lift:number;
 private stuntRoot=new T.Group();
 /** Set by Studio, which flies and moves vehicles along the film itself instead of the clip-authored motion. */
 filmMotion=false;
 private kit?:VehicleKit;private bicycle?:Bicycle;
 constructor(readonly id:VehicleId,rig:Rig,animator:Animator,readonly clip:Clip,style:VehicleStyle){
  const reference=clipById.get(ridingClip(clip.id))!;
  this.fit=new RiderFit(rig,animator,reference,id);this.lift=this.fit.lift;
  if(id==='bicycle'){this.bicycle=new Bicycle(rig,animator,reference,sanitizeVehicleStyle(style));this.group=this.bicycle.group;this.group.userData.component=true;}
  else{const k=this.kit=new VehicleKit(sanitizeVehicleStyle(style),this.fit);this.group=k.group;
   if(isCar(id)){buildCar(k);articulateDoors(k);}else if(id==='jet')buildJet(k);else if(id==='tank')buildTank(k);else if(id==='motorcycle')buildMotorcycle(k);else if(id==='horse')buildHorse(k);else if(id==='helicopter')buildHelicopter(k);else buildWatercraft(k);
  }
  mergeVehicleParts(this.group);this.stuntRoot.name='Vehicle_motion';this.stuntRoot.userData.component=true;this.stuntRoot.add(...[...this.group.children]);this.group.add(this.stuntRoot);this.update(0);
 }
 update(time:number,frame?:Frame,travelDistance?:number,action:Clip=this.clip,parked=false){
  const armed=frame?.ridingWeapon,hands=frame;frame=frame?.vehicleControls??frame;
  const transition=action.vehicleTransition,kind=manoeuvre(action.id),s=this.fit.scale;
  // Builder/export flight baked into the clip; Studio (filmMotion) flies the vehicle along the film instead.
  const motion=this.filmMotion?undefined:clipVehicleMotion(action.id,time,action.duration,this.fit.average('hip').z-.85*s);
  if(motion&&!armed)frame=this.fit.animator.frame(action,time,{vehicleLift:this.lift,weaponPose:'hidden',vehicleMotion:false});
  // Off the controls: boarding, stunts, bail-outs and the standing tank gunner leave levers and sticks at rest.
  const detached=!!transition||!!action.vehicleStunt||kind==='bailout'||kind==='gun'||kind==='crash';
  const controlsTime=transition||action.vehicleStunt?0:time;
  const progress=transition?boardProgress(transition,time,action.duration):1,x=Math.max(0,Math.min(1,(progress-.88)/.12));
  this.group.userData.parkedWeight=parked?1:transition?1-x*x*(3-2*x):0;
  if(this.bicycle)this.bicycle.update(this.fit.animator.positions(detached?this.fit.animator.frame(this.fit.clip,0,{weaponPose:'hidden'}):frame??this.fit.animator.frame(this.fit.clip,time,{weaponPose:'hidden'})),controlsTime/this.fit.clip.duration*Math.PI*6);
  else{const c=detached?this.fit.at(0):frame?this.fit.fromFrame(frame):this.fit.at(time);if(armed&&this.id==='horse')c.right.copy(c.left);for(const fn of this.kit!.updates)fn(c,(action.vehicleStunt||kind==='bailout')&&this.id==='helicopter'?time:controlsTime);}
  const opening=transition?doorOpenAt(boardProgress(transition,time,action.duration)):kind==='bailout'||kind==='crash'?Math.min(1,time/.3):0;
  const gunner=kind==='gun'&&hands&&!hands.vehicleControls?this.fit.fromFrame(hands):undefined;
  this.group.traverse(o=>{if(o.userData.doorSide)o.rotation.y=o.userData.occupantDoor?-o.userData.doorSide*opening*1.3:0;if(o.name.startsWith('Window_'))o.scale.y=armed?.001:1;if(o.name==='Canopy')o.rotation.z=-opening*1.3;if(o.name==='Boarding_gate')o.rotation.y=opening*1.5;if(o.name==='Tank_hatch')o.rotation.z=transition?hatchOpenAt(boardProgress(transition,time,action.duration))*1.6:kind==='gun'?1.6:0;
   // The gun traverses with the gunner's grip; the flash flickers through each burst.
   if(o.name==='Tank_gun'){const m=gunner?gunner.left.clone().add(gunner.right).multiplyScalar(.5):undefined;o.rotation.y=m?Math.atan2(-(m.x-o.position.x),-(m.z-o.position.z)):0;}
   if(o.name==='Muzzle_flash')o.visible=kind==='gun'&&tankGunFiring(time)&&Math.floor(time*24)%2===0;});
  if(motion)travelDistance=motion.distance;
  if(travelDistance!==undefined)this.group.traverse(o=>{if(o.userData.wheelRadius)o.rotation.x=travelDistance/o.userData.wheelRadius;});
  if(action.vehicleStunt){const m=vehicleStunt(this.id,time,action.duration,this.fit.scale);this.stuntRoot.quaternion.set(...m.rotation);this.stuntRoot.position.set(...m.translation);}
  // The crash is the vehicle's own motion in every context, so a film keeps the wreck where it came to rest.
  else if(kind==='crash'){const m=vehicleCrash(this.id,time,this.fit.scale);this.stuntRoot.quaternion.set(...m.rotation);this.stuntRoot.position.set(...m.translation);}
  else if(motion){this.stuntRoot.quaternion.set(...motion.rotation);this.stuntRoot.position.set(motion.translation[0],motion.translation[1],motion.translation[2]+bailoutDrift(action.id,time));}
  else{this.stuntRoot.quaternion.identity();this.stuntRoot.position.set(0,0,0);}
  if(this.id==='jet')this.setFlight(motion?.retract??0,motion?motion.throttle:transition||parked?0:.15);
  this.group.updateMatrixWorld(true);
 }
 /** Aircraft state from a film: 0..1 gear retraction and engine throttle (0 idle, 1 take-off power). */
 setFlight(retract:number,throttle:number){
  this.group.traverse(o=>{const axis=o.userData.gearFold as T.Vector3|undefined,lift=o.userData.gearLift as T.Vector3|undefined;if(axis)o.quaternion.setFromAxisAngle(axis,retract*Math.PI/2);if(lift){o.userData.gearRest??=o.position.clone();o.position.copy(o.userData.gearRest).addScaledVector(lift,retract);}if(o.name==='Exhaust_glow'){o.visible=throttle>0;o.scale.set(.25+.75*throttle,.25+.75*throttle,.2+1.1*throttle);}});
  this.group.updateMatrixWorld(true);
 }
 get bounds(){return new T.Box3().setFromObject(this.group);}
 dispose(){if(this.bicycle)this.bicycle.dispose();else this.kit!.dispose();}

 /** Rigid components become separate joints, keeping steering, paddles and wheels editable. */
 asset():{mesh:MeshData;rig:Rig;bake:(clip?:Clip)=>BakedClip}{
  this.update(0);const rootInverse=this.group.matrixWorld.clone().invert(),parts:T.Object3D[]=[];
  this.group.traverse(o=>{if(o.userData.component)parts.push(o);});
  const relative=(o:T.Object3D)=>new T.Matrix4().multiplyMatrices(rootInverse,o.matrixWorld);
  const rest=parts.map(o=>{const p=v(),q=new T.Quaternion(),s=v();relative(o).decompose(p,q,s);return{p,q,s};});
  const rig:Rig={type:'game',restPose:'A',bones:parts.map((o,i)=>({name:`Vehicle_${i}_${o.name||'part'}`,parent:-1,head:rest[i].p.toArray()as Vec3,tail:rest[i].p.clone().add(v(0,.05*this.fit.scale,0)).toArray()as Vec3,rot:new T.Matrix3().setFromMatrix4(new T.Matrix4().makeRotationFromQuaternion(rest[i].q)).toArray()as [number,number,number,number,number,number,number,number,number]}))};
  // Preserve authored smooth normals and indexed vertices. Recomputing normals after
  // splitting into triangles would make the exported hulls, tyres and coat faceted.
  const positions:number[]=[],normals:number[]=[],uvs:number[]=[],joints:number[]=[],weights:number[]=[],materials:Material[]=[];
  const groups=new Map<T.Material,{material:number;indices:number[]}>();
  this.group.traverse(o=>{
   if(!(o instanceof T.Mesh))return;
   let anchor:T.Object3D|null=o;while(anchor&&!anchor.userData.component)anchor=anchor.parent;
   const joint=parts.indexOf(anchor!);if(joint<0)throw Error('Vehicle part has no rigid component.');
   const geo=o.geometry.clone();geo.applyMatrix4(relative(o));if(!geo.getAttribute('normal'))geo.computeVertexNormals();
   const P=geo.getAttribute('position'),N=geo.getAttribute('normal'),U=geo.getAttribute('uv'),offset=positions.length/3;
   const mat=(Array.isArray(o.material)?o.material[0]:o.material)as T.MeshStandardMaterial;
   let group=groups.get(mat);
   if(!group){
    group={material:materials.length,indices:[]};groups.set(mat,group);
    materials.push({name:mat.name||'Vehicle material',color:'#'+mat.color.getHexString(),roughness:mat.roughness??.6,metalness:mat.metalness??0,alpha:mat.transparent?'blend':'opaque',opacity:mat.opacity,doubleSided:mat.side===T.DoubleSide,...(mat.emissive?.getHex()?{emissive:'#'+mat.emissive.getHexString()}: {})});
   }
   for(let i=0;i<P.count;i++){
    positions.push(P.getX(i),P.getY(i),P.getZ(i));normals.push(N.getX(i),N.getY(i),N.getZ(i));uvs.push(U?.getX(i)??0,U?.getY(i)??0);joints.push(joint,0,0,0);weights.push(1,0,0,0);
   }
   for(let i=0;i<(geo.index?.count??P.count);i++)group.indices.push(offset+(geo.index?.getX(i)??i));
   geo.dispose();
  });
  const mesh:MeshData={positions:Float32Array.from(positions),normals:Float32Array.from(normals),uvs:Float32Array.from(uvs),joints:Uint16Array.from(joints),weights:Float32Array.from(weights),materials,groups:[...groups.values()].map(g=>({material:g.material,indices:Uint32Array.from(g.indices),polyIndices:Uint32Array.from(g.indices),polySizes:new Uint8Array(g.indices.length/3).fill(3)}))};
  return {mesh,rig,bake:(action:Clip=this.clip)=>{
   const n=Math.ceil(action.duration*30),times:number[]=[],frames:Frame[]=[];
   for(let i=0;i<=n;i++){
    const time=Math.min(action.duration,i/30);this.update(time,this.fit.animator.frame(action,time,{vehicleLift:this.lift}),undefined,action);const inv=this.group.matrixWorld.clone().invert(),rot:Q[]=[],rootPos=new Map<number,Vec3>(),scale=new Map<number,Vec3>();
    for(const [j,o]of parts.entries()){const p=v(),q=new T.Quaternion(),s=v();new T.Matrix4().multiplyMatrices(inv,o.matrixWorld).decompose(p,q,s);let a=q.toArray()as Q;const previous=frames.at(-1)?.rot[j];if(previous&&a.reduce((sum,x,d)=>sum+x*previous[d],0)<0)a=a.map(x=>-x)as Q;rot.push(a);rootPos.set(j,p.toArray()as Vec3);scale.set(j,s.divide(rest[j].s).toArray()as Vec3);}
    times.push(time);frames.push({rot,rootPos,scale});
   }
   return{name:action.name,loop:action.loop,times,frames};
  }};
 }
}
