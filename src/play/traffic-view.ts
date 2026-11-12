/**
 * Draws moving city traffic cheaply. Each vehicle type is fitted and built once; every car on the road is a copy that
 * shares its geometry and materials, with one paint per colour and its own tail lamps for braking. Each copy is merged
 * into one mesh per material; beyond 55 m a car becomes a few boxes, and beyond 115 m, inside
 * the fog, it is hidden. Drivers are simple
 * silhouettes behind tinted glass.
 */
import * as T from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {Vehicle} from '../core/props/vehicle';
import {clipById} from '../core/anim/clips';
import {VEHICLE_CLIP,DEFAULT_VEHICLE_STYLE,vehicleStyleForChoice} from '../core/props/vehicles';
import {VEHICLE_BODIES,type VehicleBody} from '../core/props/vehicle-bodies';
import {driveBase,type CarFit,type DriveVehicle} from './driving';
import {measureDriveVehicle} from './driving-view';
import type {GameActor} from './actor';
import type {TrafficCar,TrafficLoop} from './traffic';

export interface TrafficSpec {model:DriveVehicle;color:string;livery?:'taxi';fit:CarFit}
/** The district's mix: enclosed vehicles only, so the simple drivers stay behind glass. */
const MIX:{model:DriveVehicle;colors:string[];livery?:'taxi'}[]=[
 {model:'saloon',colors:['#f2c22e'],livery:'taxi'},{model:'danfo',colors:['#f2c22e']},{model:'saloon',colors:['#3a4a5c','#8c8f93','#6e2a2a']},{model:'suv',colors:['#2b2f33','#e8e8e4']},
 {model:'van',colors:['#e8e8e4','#4f6b7a']},{model:'danfo',colors:['#f2c22e']},{model:'sports_car',colors:['#a83d38','#2d6fc8']},{model:'truck',colors:['#c8372d','#356e5c']},
 {model:'pickup',colors:['#b7a76f','#536268']},{model:'muscle',colors:['#d4762a']},{model:'bus',colors:['#2f6db5']},{model:'saloon',colors:['#e8e8e4'],livery:'taxi'},
];
// The district fog closes in by 110 m, so nothing beyond that needs drawing.
const NEAR=55,LIMIT=115;
interface Template {vehicle:Vehicle;fit:CarFit;paints:Map<string,T.Material>;flat:T.Group;proxy:T.Group}
interface Drawn {near:T.Group;far:T.Group;tail:T.MeshStandardMaterial}
export class TrafficView {
 readonly group=new T.Group();private templates=new Map<string,Template>();private drawn=new Map<string,Drawn>();
 private driverMaterial=new T.MeshStandardMaterial({color:'#2e3238',roughness:.85});private shade=new T.MeshStandardMaterial({color:'#1d2429',roughness:.35,metalness:.3});private tyres=new T.MeshStandardMaterial({color:'#17191c',roughness:.9});private skin=new T.MeshStandardMaterial({color:'#5b3d2c',roughness:.7});
 constructor(readonly actor:GameActor,private radius:number){this.group.name='City traffic';}
 /** The cars for `count`, each with its measured fit. */
 specs(count:number):TrafficSpec[]{
  return Array.from({length:count},(_,i)=>{const m=MIX[i%MIX.length],t=this.template(m.model,m.livery);return {model:m.model,color:m.colors[Math.floor(i/MIX.length)%m.colors.length],...(m.livery?{livery:m.livery}:{}),fit:t.fit};});
 }
 private template(model:DriveVehicle,livery?:'taxi'){
  const key=model+(livery??'');let t=this.templates.get(key);if(t)return t;
  const rig=this.actor.render.character.rig!,base=driveBase(model),body=(VEHICLE_BODIES as readonly string[]).includes(model)?model as VehicleBody:undefined;
  const vehicle=new Vehicle(base,rig,this.actor.render.animator,clipById.get(VEHICLE_CLIP[base])!,{...vehicleStyleForChoice(base,DEFAULT_VEHICLE_STYLE),...(livery?{livery}:{})},{body});vehicle.filmMotion=true;vehicle.update(0);
  // A seated silhouette at the fitted driver's hips.
  const s=vehicle.fit.scale,hip=vehicle.fit.average('hip'),torso=new T.Mesh(new T.CapsuleGeometry(.17*s,.34*s,4,8),this.driverMaterial),head=new T.Mesh(new T.SphereGeometry(.105*s,12,8),this.skin);
  torso.position.set(hip.x,hip.y+.34*s,hip.z-.08*s);head.position.set(hip.x,hip.y+.74*s,hip.z-.04*s);vehicle.group.add(torso,head);
  t={vehicle,fit:measureDriveVehicle(vehicle,rig,this.radius,model),paints:new Map(),flat:flatten(vehicle.group),proxy:this.proxy(vehicle)};this.templates.set(key,t);return t;
 }
 /** The far version: body, cabin glass and wheels as three boxes and cylinders. */
 private proxy(vehicle:Vehicle){
  const b=new T.Box3().setFromObject(vehicle.group),size=b.getSize(new T.Vector3()),c=b.getCenter(new T.Vector3()),g=new T.Group(),low=size.y*.48;
  const paint=new T.Mesh(new RoundedBoxGeometry(size.x*.98,low-.25,size.z*.98,1,.08));
  let paintMaterial:T.Material|undefined;vehicle.group.traverse(o=>{const m=(o as T.Mesh).material as T.Material|undefined;if(m&&!Array.isArray(m)&&m.name==='Vehicle paint')paintMaterial??=m;});paint.material=paintMaterial!;
  paint.position.set(c.x,.25+(low-.25)/2,c.z);
  const cabin=new T.Mesh(new RoundedBoxGeometry(size.x*.9,size.y-low,size.z*.72,1,.08),this.shade);cabin.position.set(c.x,low+(size.y-low)/2,c.z-size.z*.06);
  const r=.36,wheel=new T.CylinderGeometry(r,r,.25,10).rotateZ(Math.PI/2),wheels=mergeGeometries([[-1,-1],[-1,1],[1,-1],[1,1]].map(([sx,sz])=>wheel.clone().translate(c.x+sx*(size.x/2-.2),r,c.z+sz*(size.z/2-.9))));wheel.dispose();
  g.add(paint,cabin,new T.Mesh(wheels!,this.tyres));return g;
 }
 private draw(car:TrafficCar):Drawn{
  const t=this.template(car.model,car.livery),near=t.flat.clone(true),far=t.proxy.clone(true);
  let paint=t.paints.get(car.color);if(!paint){paint=(t.flat.children.find(m=>((m as T.Mesh).material as T.Material).name==='Vehicle paint') as T.Mesh|undefined)?.material as T.Material|undefined;paint=paint?paint.clone():new T.MeshStandardMaterial();(paint as T.MeshStandardMaterial).color.set(car.color);t.paints.set(car.color,paint);}
  const tail=new T.MeshStandardMaterial();let tailCopied=false;
  for(const group of [near,far])for(const o of group.children){const mesh=o as T.Mesh,mat=mesh.material as T.MeshStandardMaterial;
   if(mat.name==='Vehicle paint')mesh.material=paint;
   if(mat.name==='Vehicle tail lamps'){if(!tailCopied){tail.copy(mat);tailCopied=true;}mesh.material=tail;}}
  near.name=far.name=car.id;this.group.add(near,far);return {near,far,tail};
 }
 private roads?:T.Group;
 /** Asphalt under each traffic lane, with a dashed centre line: two merged meshes for the whole district. */
 paveRoads(loops:readonly TrafficLoop[]){
  if(this.roads){this.roads.traverse(o=>{const m=o as T.Mesh;if(m.isMesh){m.geometry.dispose();(m.material as T.Material).dispose();}});this.roads.removeFromParent();}
  const asphalt:number[]=[],paint:number[]=[],strip=(out:number[],a:T.Vector3,b:T.Vector3,c:T.Vector3,d:T.Vector3)=>out.push(a.x,a.y,a.z,b.x,b.y,b.z,c.x,c.y,c.z,b.x,b.y,b.z,d.x,d.y,d.z,c.x,c.y,c.z);
  for(const loop of loops){const n=loop.points.length,at=(i:number,side:number,y:number)=>{const p=loop.points[i%n],q=loop.points[(i+1)%n],o=loop.points[(i+n-1)%n],yaw=Math.atan2(q.x-o.x,q.z-o.z);return new T.Vector3(p.x-Math.cos(yaw)*side,y,p.z+Math.sin(yaw)*side);};
   for(const c of loop.crossings)strip(asphalt,new T.Vector3(c.x+4.9,.005,c.z-4.9),new T.Vector3(c.x-4.9,.005,c.z-4.9),new T.Vector3(c.x+4.9,.005,c.z+4.9),new T.Vector3(c.x-4.9,.005,c.z+4.9));
   for(let i=0;i<n;i++){strip(asphalt,at(i,-2.45,.006),at(i,2.45,.006),at(i+1,-2.45,.006),at(i+1,2.45,.006));const q=loop.points[i%n],inCrossing=loop.crossings.some(c=>Math.max(Math.abs(q.x-c.x),Math.abs(q.z-c.z))<6.5);if(i%4<2&&!inCrossing)strip(paint,at(i,-2.3,.01),at(i,-2.1,.01),at(i+1,-2.3,.01),at(i+1,-2.1,.01));}}
  const mesh=(points:number[],color:string)=>{const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(points,3));g.computeVertexNormals();const m=new T.Mesh(g,new T.MeshStandardMaterial({color,roughness:.95,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));m.receiveShadow=true;return m;};
  this.roads=new T.Group();this.roads.add(mesh(asphalt,'#4b5056'),mesh(paint,'#d9d6c9'));this.group.add(this.roads);
 }
 update(cars:readonly TrafficCar[],camera:T.Camera,headlights:number){
  for(const t of this.templates.values())t.vehicle.setLights(0,headlights);
  const seen=new Set<string>();
  for(const car of cars){
   seen.add(car.id);const range=Math.hypot(car.x-camera.position.x,car.z-camera.position.z);let d=this.drawn.get(car.id);
   if(range>LIMIT){if(d)d.near.visible=d.far.visible=false;continue;}
   d??=this.drawn.set(car.id,this.draw(car)).get(car.id)!;
   const close=range<NEAR;d.near.visible=close;d.far.visible=!close;const shown=close?d.near:d.far;shown.position.set(car.x,0,car.z);shown.rotation.y=car.yaw;
   d.tail.emissiveIntensity=.55+2.4*Math.max(car.braking?1:0,headlights*.4);
  }
  for(const [id,d]of this.drawn)if(!seen.has(id)){d.near.removeFromParent();d.far.removeFromParent();d.tail.dispose();this.drawn.delete(id);}
 }
 dispose(){
  for(const d of this.drawn.values())d.tail.dispose();this.drawn.clear();this.roads?.traverse(o=>{const m=o as T.Mesh;if(m.isMesh){m.geometry.dispose();(m.material as T.Material).dispose();}});this.group.clear();
  for(const t of this.templates.values()){for(const p of t.paints.values())p.dispose();for(const g of [t.flat,t.proxy])g.traverse(o=>(o as T.Mesh).geometry?.dispose());t.vehicle.dispose();}this.templates.clear();
  for(const m of [this.driverMaterial,this.skin,this.shade,this.tyres])m.dispose();this.group.removeFromParent();
 }
}
/** One mesh per material for a whole vehicle, in the vehicle's own frame. */
function flatten(root:T.Group){
 root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),byMaterial=new Map<T.Material,T.BufferGeometry[]>();
 root.traverse(o=>{const mesh=o as T.Mesh;if(!mesh.isMesh||Array.isArray(mesh.material))return;
  const geo=mesh.geometry.clone().applyMatrix4(inverse.clone().multiply(mesh.matrixWorld));for(const name of Object.keys(geo.attributes))if(!['position','normal','uv'].includes(name))geo.deleteAttribute(name);
  if(!geo.getAttribute('normal'))geo.computeVertexNormals();if(!geo.getAttribute('uv'))geo.setAttribute('uv',new T.BufferAttribute(new Float32Array(geo.getAttribute('position').count*2),2));
  const flat=geo.index?geo.toNonIndexed():geo;if(flat!==geo)geo.dispose();
  const list=byMaterial.get(mesh.material)??[];list.push(flat);byMaterial.set(mesh.material,list);});
 const g=new T.Group();
 for(const [material,list]of byMaterial){const merged=mergeGeometries(list);list.forEach(x=>x.dispose());if(!merged)continue;const mesh=new T.Mesh(merged,material);mesh.castShadow=!(material as T.MeshStandardMaterial).transparent;mesh.receiveShadow=true;g.add(mesh);}
 return g;
}
