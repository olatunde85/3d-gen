/** One fitted, customizable vehicle implementation for preview, films and game exports. */
import * as T from 'three';
import {mergeVehicleParts} from './vehicle-merge';
import {Bicycle} from './bicycle';
import {buildCar,buildMotorcycle} from './vehicle-land';
import {buildWatercraft} from './vehicle-water';
import {buildHorse} from './vehicle-horse';
import {RiderFit,VehicleKit,v} from './vehicle-kit';
import {sanitizeVehicleStyle,isCar,type VehicleId,type VehicleStyle} from './vehicles';
import type {Rig} from '../rig/rig';
import type {Animator,Frame,BakedClip} from '../anim/evaluate';
import type {Clip} from '../anim/clips';
import type {MeshData,Material} from '../mesh';
import type {Q} from '../anim/quat';
import type {Vec3} from '../math';
export class Vehicle{
 readonly group:T.Group;readonly fit:RiderFit;readonly lift:number;
 private kit?:VehicleKit;private bicycle?:Bicycle;
 constructor(readonly id:VehicleId,rig:Rig,animator:Animator,readonly clip:Clip,style:VehicleStyle){
  this.fit=new RiderFit(rig,animator,clip,id);this.lift=this.fit.lift;
  if(id==='bicycle'){this.bicycle=new Bicycle(rig,animator,clip,sanitizeVehicleStyle(style));this.group=this.bicycle.group;this.group.userData.component=true;}
  else{const k=this.kit=new VehicleKit(sanitizeVehicleStyle(style),this.fit);this.group=k.group;
   if(isCar(id))buildCar(k);else if(id==='motorcycle')buildMotorcycle(k);else if(id==='horse')buildHorse(k);else buildWatercraft(k);
  }
  mergeVehicleParts(this.group);this.update(0);
 }
 update(time:number,frame?:Frame,travelDistance?:number){
  if(this.bicycle)this.bicycle.update(this.fit.animator.positions(frame??this.fit.animator.frame(this.clip,time)),time/this.clip.duration*Math.PI*6);
  else{const c=frame?this.fit.fromFrame(frame):this.fit.at(time);for(const fn of this.kit!.updates)fn(c,time);}
  if(travelDistance!==undefined)this.group.traverse(o=>{if(o.userData.wheelRadius)o.rotation.x=travelDistance/o.userData.wheelRadius;});
  this.group.updateMatrixWorld(true);
 }
 get bounds(){return new T.Box3().setFromObject(this.group);}
 dispose(){if(this.bicycle)this.bicycle.dispose();else this.kit!.dispose();}

 /** Rigid components become separate joints, keeping steering, paddles and wheels editable. */
 asset():{mesh:MeshData;rig:Rig;bake:()=>BakedClip}{
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
  return {mesh,rig,bake:()=>{
   const n=Math.ceil(this.clip.duration*30),times:number[]=[],frames:Frame[]=[];
   for(let i=0;i<=n;i++){
    const time=Math.min(this.clip.duration,i/30);this.update(time);const inv=this.group.matrixWorld.clone().invert(),rot:Q[]=[],rootPos=new Map<number,Vec3>(),scale=new Map<number,Vec3>();
    for(const [j,o]of parts.entries()){const p=v(),q=new T.Quaternion(),s=v();new T.Matrix4().multiplyMatrices(inv,o.matrixWorld).decompose(p,q,s);let a=q.toArray()as Q;const previous=frames.at(-1)?.rot[j];if(previous&&a.reduce((sum,x,d)=>sum+x*previous[d],0)<0)a=a.map(x=>-x)as Q;rot.push(a);rootPos.set(j,p.toArray()as Vec3);scale.set(j,s.divide(rest[j].s).toArray()as Vec3);}
    times.push(time);frames.push({rot,rootPos,scale});
   }
   return{name:this.clip.name,loop:this.clip.loop,times,frames};
  }};
 }
}
