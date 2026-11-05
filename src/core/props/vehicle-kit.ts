/** Geometry toolkit and measured rider contacts shared by every vehicle. No renderer or DOM. */
import * as T from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {Animator,type Frame} from '../anim/evaluate';
import type {Clip} from '../anim/clips';
import {qmul,qconj,type Q} from '../anim/quat';
import {boneFor} from '../rig/poses';
import type {Rig} from '../rig/rig';
import {vehicleLift,type VehicleId,type VehicleStyle} from './vehicles';
export type V=T.Vector3;
export const v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
export interface Contacts{headTop:V;hip:V;left:V;right:V;footLeft:V;footRight:V;kneeLeft:V;kneeRight:V;chest:T.Quaternion}
export class RiderFit{
 readonly scale:number;readonly lift:number;readonly samples:Contacts[];
 constructor(readonly rig:Rig,readonly animator:Animator,readonly clip:Clip,readonly id:VehicleId){
  this.scale=Math.max(...rig.bones.flatMap(b=>[b.head[1],b.tail[1]]))/1.8;this.lift=vehicleLift(id,this.scale);
  this.samples=Array.from({length:24},(_,i)=>this.at(i*clip.duration/24));
 }
 at(time:number):Contacts{
  return this.fromFrame(this.animator.frame(this.clip,time,{vehicleLift:this.lift}));
 }
 fromFrame(f:Frame):Contacts{
  const positions=this.animator.positions(f),B=this.rig.bones;
  const idx=(name:string)=>B.findIndex(b=>b.name===boneFor(this.rig.type,name));
  const point=(name:string)=>{const i=idx(name);if(i<0)throw Error(`Vehicle needs ${name} on its rider.`);return v(...positions[i]);};
  const palm=(side:string)=>{const names=['HandIndex1','HandPinky1','HandIndex2','HandMiddle2','HandRing2','HandMiddle3'],indices=names.map(n=>idx(side+n));
   if(indices.every(i=>i>=0))return indices.reduce((p,i)=>p.add(v(...positions[i])),v()).divideScalar(indices.length);
   const m=idx(side+'HandMiddle1');return m>=0?point(side+'Hand').lerp(v(...positions[m]),.75):point(side+'Hand');};
  const chest=idx('Spine2'),world:Q[]=[];B.forEach((b,i)=>world[i]=b.parent<0?f.rot[i]:qmul(world[b.parent],f.rot[i]));
  const rest=this.animator.relaxedBone('Spine2')!.rot,delta=qmul(world[chest],qconj(rest));
  const headIndex=idx('Head'),headBone=B[headIndex],headLength=Math.hypot(...headBone.tail.map((v,d)=>v-headBone.head[d])),headTop=point('Head').add(v(0,headLength,0).applyQuaternion(new T.Quaternion(...world[headIndex])));
  return {headTop,hip:point('Hips'),left:palm('Left'),right:palm('Right'),footLeft:point('LeftFoot'),footRight:point('RightFoot'),kneeLeft:point('LeftLeg'),kneeRight:point('RightLeg'),chest:new T.Quaternion(...delta)};
 }
 average(key:'hip'|'left'|'right'|'footLeft'|'footRight'){return this.samples.reduce((p,s)=>p.add(s[key]),v()).divideScalar(this.samples.length);}
}
export class VehicleKit{
 readonly group=new T.Group();readonly paint:T.MeshStandardMaterial;readonly trim:T.MeshStandardMaterial;readonly seat:T.MeshStandardMaterial;
 readonly rubber=new T.MeshStandardMaterial({name:'Vehicle rubber',color:'#17191c',roughness:.92});
 readonly dark=new T.MeshStandardMaterial({name:'Vehicle dark metal',color:'#272b30',roughness:.5,metalness:.7});
 readonly glass=new T.MeshStandardMaterial({name:'Vehicle glass',color:'#a4c6d3',roughness:.12,transparent:true,opacity:.23,depthWrite:false,side:T.DoubleSide});
 readonly light=new T.MeshStandardMaterial({name:'Vehicle headlight',color:'#fff4d2',roughness:.2,emissive:'#fff0bf',emissiveIntensity:.3});
 readonly updates:((c:Contacts,time:number)=>void)[]=[];
 constructor(readonly style:VehicleStyle,readonly fit:RiderFit){
  this.paint=new T.MeshStandardMaterial({name:'Vehicle paint',color:style.color,roughness:style.finish==='gloss'?.18:style.finish==='matte'?.85:.4,metalness:fit.id==='horse'?0:.35});
  this.trim=new T.MeshStandardMaterial({name:'Vehicle trim',color:style.accentColor,roughness:.3,metalness:fit.id==='horse'?.1:.75});
  this.seat=new T.MeshStandardMaterial({name:'Vehicle upholstery',color:style.seatColor,roughness:.8});
  this.group.name=fit.id;this.group.userData.component=true;
 }
 mesh(geo:T.BufferGeometry,mat:T.Material,parent:T.Object3D=this.group){const m=new T.Mesh(geo,mat);m.castShadow=!(mat instanceof T.MeshStandardMaterial&&mat.transparent&&mat.opacity<.5);m.receiveShadow=true;parent.add(m);return m;}
 box(p:V,size:V,mat:T.Material,parent:T.Object3D=this.group){const m=this.mesh(new RoundedBoxGeometry(size.x,size.y,size.z,2,Math.min(.035*this.fit.scale,size.x*.12,size.y*.12,size.z*.12)),mat,parent);m.position.copy(p);return m;}
 ellipsoid(p:V,size:V,mat:T.Material,parent:T.Object3D=this.group){const m=this.mesh(new T.SphereGeometry(1,24,16),mat,parent);m.position.copy(p);m.scale.copy(size);return m;}
 tube(a:V,b:V,r:number,mat:T.Material,parent:T.Object3D=this.group){const m=this.mesh(new T.CylinderGeometry(r,r,a.distanceTo(b),12),mat,parent);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(v(0,1,0),b.clone().sub(a).normalize());return m;}
 component(name:string,position=v(),parent:T.Object3D=this.group){const g=new T.Group();g.name=name;g.userData.component=true;g.position.copy(position);parent.add(g);return g;}
 wheel(name:string,p:V,r:number,width:number,spokes:boolean|'alloy'=false){
  const g=this.component(name,p);g.userData.wheelRadius=r;const tyre=this.mesh(new T.TorusGeometry(r-width*.3,width*.3,12,40),this.rubber,g);tyre.rotation.y=Math.PI/2;
  const rim=this.mesh(new T.CylinderGeometry(r*.69,r*.69,width*.72,24),this.trim,g);rim.rotation.z=Math.PI/2;
  if(spokes){
   rim.geometry.dispose();rim.geometry=new T.CylinderGeometry(r*.15,r*.15,width*.85,16);
   const count=spokes==='alloy'?5:12;
   for(let i=0;i<count;i++){const a=i/count*Math.PI*2;
    if(spokes==='alloy'){
     const spoke=this.box(v(0,Math.sin(a)*r*.43,Math.cos(a)*r*.43),v(width*.65,r*.65,r*.15),this.trim,g);spoke.quaternion.setFromUnitVectors(v(0,1,0),v(0,Math.sin(a),Math.cos(a)));
    }else this.tube(v(),v(0,Math.sin(a)*r*.8,Math.cos(a)*r*.8),r*.018,this.trim,g);
   }
   if(spokes==='alloy'){const edge=this.mesh(new T.TorusGeometry(r*.79,r*.035,8,40),this.trim,g);edge.rotation.y=Math.PI/2;}
  }
  this.tube(v(-width*.55,0,0),v(width*.55,0,0),r*.12,this.dark,g);return g;
 }
 steering(radius:number,tilt:number,offset=v()){
  const g=this.component('Steering_wheel'),ring=this.mesh(new T.TorusGeometry(radius,.014*this.fit.scale,10,40),this.seat,g);
  ring.name='Steering_rim';for(const a of [0,Math.PI,Math.PI*1.5])this.tube(v(),v(Math.cos(a)*radius,Math.sin(a)*radius,0),.012*this.fit.scale,this.trim,g);
  this.ellipsoid(v(),v(radius*.23,radius*.23,.025*this.fit.scale),this.dark,g);
  this.updates.push(c=>{const L=c.left.clone().add(offset),R=c.right.clone().add(offset),x=L.clone().sub(R).normalize(),normal=v(0,Math.sin(tilt),-Math.cos(tilt)).applyQuaternion(c.chest),y=new T.Vector3().crossVectors(normal,x).normalize();g.position.copy(L).add(R).multiplyScalar(.5);g.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,normal));});
  return g;
 }
 dispose(){const geos=new Set<T.BufferGeometry>(),mats=new Set<T.Material>([this.paint,this.trim,this.seat,this.rubber,this.dark,this.glass,this.light]);this.group.traverse(o=>{if(o instanceof T.Mesh){geos.add(o.geometry);for(const mat of Array.isArray(o.material)?o.material:[o.material])mats.add(mat);}});geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());}
}
