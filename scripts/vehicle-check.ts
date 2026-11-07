/** Vehicle geometry, deterministic fitting, loop seams and game export contract. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import * as T from 'three';
import {nodeLibrary} from './node-assets';
import {buildHuman} from '../src/core/human';
import {DEFAULT_PARAMS} from '../src/core/params';
import {Animator} from '../src/core/anim/evaluate';
import {clipById} from '../src/core/anim/clips';
import {Vehicle} from '../src/core/props/vehicle';
import {DEFAULT_VEHICLE_STYLE,VEHICLE_FOR_CLIP,VEHICLE_FITS,vehicleFor,vehicleLift} from '../src/core/props/vehicles';
import {DEFAULT_EXPORT,planExport,runExport} from '../src/export';
import {unzipSync} from 'fflate';
const smoke=process.argv.includes('--smoke'),lib=await nodeLibrary();let checked=0;
mkdirSync('out/vehicles',{recursive:true});
for(const rig of smoke?['game']as const:['game','game_lite','full']as const)for(const restPose of smoke?['A']as const:['A','T']as const)for(const body of smoke?[{}]:[{},{gender:0,height:.15,weight:.3,proportions:.2},{gender:1,height:.9,weight:.85,muscle:.9}]){
 const ch=await buildHuman(lib,{...DEFAULT_PARAMS,...body,rig,restPose,carry:'none',weapon:'none',vehicle:'auto',detail:'low',outfit:'none',hair:'none',faceShapes:false});
 const A=new Animator(ch.rig!),scale=Math.max(...ch.rig!.bones.flatMap(b=>[b.head[1],b.tail[1]]))/1.8;
 for(const {clip:clipId,id}of VEHICLE_FITS){
  const clip=clipById.get(clipId)!,ride=new Vehicle(id,ch.rig!,A,clip,DEFAULT_VEHICLE_STYLE),label=`${rig}/${restPose}/${clipId}`;
  assert.equal(vehicleFor('auto',clipId),VEHICLE_FOR_CLIP[clipId]);assert.equal(vehicleFor(id,clipId),id);assert.equal(vehicleFor('none',clipId),undefined);
  const snapshot=()=>{ride.group.updateMatrixWorld(true);const points:number[]=[];ride.group.traverse(o=>{if(o.userData.component)points.push(...o.matrixWorld.elements);});return points;};
  const first=snapshot();ride.update(clip.duration);const last=snapshot();assert.equal(first.length,last.length);
  for(let i=0;i<first.length;i++)assert.ok(Math.abs(first[i]-last[i])<1e-5,label+' loop seam');
  for(let i=0;i<=32;i++){
   const t=i/32*clip.duration,base=A.positions(A.frame(clip,t,{vehicleMotion:false})),frame=A.frame(clip,t,{vehicleLift:ride.lift,vehicleMotion:false}),raised=A.positions(frame);ride.update(t,frame);
   for(let b=0;b<base.length;b++)for(let d=0;d<3;d++)assert.ok(Math.abs(raised[b][d]-base[b][d]-(d===1?vehicleLift(id,scale):0))<1e-5,label+' changes rider pose');
   const box=new T.Box3().setFromObject(ride.group,true);assert.ok([...box.min.toArray(),...box.max.toArray()].every(Number.isFinite),label+' invalid bounds');assert.ok(box.min.y>(['canoe','kayak','rowboat'].includes(id)?-.95:-.12)*scale,label+' below ground');assert.ok(box.getSize(new T.Vector3()).length()<(id==='jet'?13:id==='helicopter'?12:id==='tank'?10:id==='pickup'?9:7)*scale,label+' oversized');
  }
  if(id==='sports_car'||id==='suv')for(const c of ride.fit.samples.filter((_,i)=>i%8===0)){
   const ray=new T.Raycaster(c.headTop.clone(),new T.Vector3(0,1,0),0,.6*scale),hit=ray.intersectObject(ride.group,true)[0];assert.ok(hit&&hit.distance>.03*scale,label+' '+id+' roof intersects the rider or leaves them uncovered: '+JSON.stringify({head:c.headTop.toArray(),bounds:ride.bounds.max.toArray(),hit:hit?.distance}));
  }
  if(id==='horse'){
   const hoof=ride.group.getObjectByName('Fore_left_hoof')!;ride.update(clip.duration*.60);const before=hoof.position.z;ride.update(clip.duration*.65);assert.ok(hoof.position.z<before,label+' planted hoof must move backwards to propel the horse forwards');
  }
  if(id==='canoe')for(let i=0;i<48;i++){
   ride.update(clip.duration*i/48);const paddle=ride.group.getObjectByName('Paddle')!;
   paddle.traverse(o=>{if(!(o instanceof T.Mesh))return;const points=o.geometry.getAttribute('position');for(let j=0;j<points.count;j++){
    const p=new T.Vector3().fromBufferAttribute(points,j).applyMatrix4(o.matrixWorld),t=(p.z/scale-.25-ride.fit.average('hip').z/scale)/(3.45/2),rim=.48+.08*Math.abs(t)**5;
    if(Math.abs(t)<1&&p.y/scale<rim-.012){const half=.83/2*Math.max(.035,(1-Math.abs(t)**2.8)**.65);assert.ok(Math.abs(p.x/scale)>half+.008,`${label} paddle enters hull at ${i}: ${p.toArray().map(v=>v/scale)}`);}
   }});
  }
  ride.update(clip.duration*.63);const a=snapshot();ride.update(.09);ride.update(clip.duration*.63);assert.deepEqual(snapshot(),a,label+' nondeterministic seek');
  if(smoke){console.log(clipId,'bounds',ride.bounds.min.toArray().map(x=>x.toFixed(2)),ride.bounds.max.toArray().map(x=>x.toFixed(2)),'hands',ride.fit.average('left').toArray().map(x=>x.toFixed(2)),'hip',ride.fit.average('hip').toArray().map(x=>x.toFixed(2)));}
  if(checked<9){
   const {mesh,rig:propRig,bake}=ride.asset();assert.ok(mesh.positions.every(Number.isFinite));assert.ok(propRig.bones.length>1);const baked=bake();for(const f of baked.frames)for(const q of f.rot)assert.ok(q.every(Number.isFinite));
  }
  ride.dispose();checked++;
 }
 if(rig==='game'&&restPose==='A'&&Object.keys(body).length===0){
  for(const format of ['glb','fbx','obj']as const){const settings={...DEFAULT_EXPORT,format,mode:format==='obj'?'static' as const:'animated' as const,clips:Object.keys(VEHICLE_FOR_CLIP)};const plan=planExport(ch,settings),result=await runExport(lib,ch,plan),zip=unzipSync(result.data);assert.equal(plan.files.filter(f=>f.kind==='vehicle').length,format==='obj'?0:VEHICLE_FITS.length);for(const f of plan.files.filter(f=>f.kind!=='meta'))assert.ok(Object.keys(zip).some(k=>k.endsWith(f.path)||f.path.endsWith('/')&&k.includes(f.path)),`Missing ${f.path}`);writeFileSync(`out/vehicles/vehicles-${format}.zip`,result.data);console.log(format,result.data.length,'bytes');}
  for(const vehicle of ['sports_car','suv']as const){
   const custom={...ch,params:{...ch.params,vehicle}};const plan=planExport(custom,{...DEFAULT_EXPORT,format:'glb',clips:['drive_car','sit_passenger','drive_sports_car','sit_sports_car_passenger','drive_suv','sit_suv_passenger']}),zip=unzipSync((await runExport(lib,custom,plan)).data);
   assert.equal(plan.files.filter(f=>f.kind==='vehicle').length,2);for(const role of ['driver','passenger'])assert.ok(Object.keys(zip).some(k=>k.endsWith(`${vehicle}_${role}.glb`)),'missing '+vehicle+' '+role);
  }
  for(const finish of ['matte','gloss']as const)for(const {id,clip}of VEHICLE_FITS){
   const ride=new Vehicle(id,ch.rig!,A,clipById.get(clip)!,{...DEFAULT_VEHICLE_STYLE,color:'#176a80',finish,variant:'sport'});ride.update(.37);
   const asset=ride.asset();assert.ok(asset.mesh.positions.every(Number.isFinite));assert.ok(asset.mesh.normals.every(Number.isFinite));assert.ok(asset.mesh.materials.some(m=>m.name==='Vehicle paint'&&m.color==='#176a80'));ride.dispose();
  }
  // Static export uses a concrete selection and includes a stand-alone OBJ/MTL prop.
  const car={...ch,params:{...ch.params,vehicle:'car' as const}};const plan=planExport(car,{...DEFAULT_EXPORT,format:'obj',mode:'static'}),zip=unzipSync((await runExport(lib,car,plan)).data);assert.ok(Object.keys(zip).some(k=>k.includes('props/car_driver/')&&k.endsWith('.obj')));
 }
 console.log('OK',rig,restPose,body);
}
console.log(`Vehicle checks: ${checked} fitted clip/body/rig combinations passed.`);
