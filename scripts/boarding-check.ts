/** Boarding endpoint/contact and timeline regressions across body sizes and skeletons. */
import assert from 'node:assert/strict';
import {nodeLibrary} from './node-assets';
import {buildHuman} from '../src/core/human';
import {DEFAULT_PARAMS} from '../src/core/params';
import {Animator} from '../src/core/anim/evaluate';
import {clipById,CLIPS} from '../src/core/anim/clips';
import {VEHICLE_FOR_CLIP,vehicleLift,DEFAULT_VEHICLE_STYLE,VEHICLE_FITS} from '../src/core/props/vehicles';
import {boardingStand,boardingScale} from '../src/core/props/vehicle-actions';
import {boneFor} from '../src/core/rig/poses';
import {Vehicle} from '../src/core/props/vehicle';
import {studioTravel} from '../src/studio/motion';
import {newProject,parseProject,timelineAt} from '../src/studio/project';
import {vehicleStateAt} from '../src/studio/vehicle-state';
import {planExport,DEFAULT_EXPORT} from '../src/export/plan';
const lib=await nodeLibrary(),smoke=process.argv.includes('--smoke'),diagnose=process.argv.includes('--diagnose');
const clips=CLIPS.filter(c=>c.vehicleTransition),gap=(a:number[],b:number[])=>Math.hypot(...a.map((x,d)=>x-b[d]));let checks=0;
assert.equal(clips.length,28);assert.equal(new Set(CLIPS.map(c=>c.id)).size,CLIPS.length);
const priorLengths={bicycle:3.2,car:3.6,car_passenger:3.6,sports_car:4,sports_car_passenger:4,suv:4.2,suv_passenger:4.2,motorcycle:3.4,horse:4.4,canoe:3.8,kayak:4.2,rowboat:3.8,motorboat:4,helicopter:4.4};
for(const c of clips)assert.equal(c.duration,priorLengths[c.id.replace(/^(board|alight)_/,'')as keyof typeof priorLengths]/2,'entry/exit defaults must play at twice the original speed');
for(const rig of smoke?['game']as const:['game','game_lite','full']as const)for(const restPose of smoke?['A']as const:['A','T']as const)for(const body of smoke?[{}]:[{},{gender:0,height:.15,weight:.3,proportions:.2},{gender:1,height:.9,weight:.85,muscle:.9}]){
 const ch=await buildHuman(lib,{...DEFAULT_PARAMS,...body,rig,restPose,detail:'low',hair:'none',outfit:'none',carry:'none',weapon:'none',vehicle:'auto',faceShapes:false}),B=ch.rig!.bones,A=new Animator(ch.rig!),s=Math.max(...B.flatMap(b=>[b.head[1],b.tail[1]]))/1.8;
 const feet=B.flatMap((b,i)=>/^(Left|Right)(Foot|ToeBase|Toe_End)$|^(foot|toe\d-\d)\.[LR]$/.test(b.name)?[i]:[]);
 const idle=A.positions(A.frame(clipById.get('idle')!,0)),floor=Math.min(...feet.map(i=>idle[i][1]));
 const rightFoot=B.findIndex(b=>b.name===boneFor(rig,'RightFoot'));
 for(const c of clips){
  const meta=c.vehicleTransition!,id=VEHICLE_FOR_CLIP[c.id],lift=vehicleLift(id,s),ride=clipById.get(meta.ride)!,target=A.positions(A.frame(ride,0,{vehicleLift:lift}));
  assert.equal(studioTravel(c.id),undefined,'entry must not drive through the scene');
  const begin=A.positions(A.frame(c,meta.direction==='board'?0:c.duration,{vehicleLift:lift})),end=A.positions(A.frame(c,meta.direction==='board'?c.duration:0,{vehicleLift:lift}));
  const stand=boardingStand(meta.ride),bs=boardingScale(ch.rig!);
  for(let i=0;i<B.length;i++){assert.ok(gap(end[i],target[i])<1e-7,`${c.id} riding endpoint ${B[i].name}`);assert.ok(gap(begin[i],[idle[i][0]+stand[0]*bs,idle[i][1],idle[i][2]+stand[1]*bs])<1e-7,`${c.id} upright endpoint`);}
  let previous:number[][]|undefined,min=Infinity,maxGap=0,worst='';
  for(let i=0;i<=90;i++){
   const f=A.frame(c,c.duration*i/90,{vehicleLift:lift}),p=A.positions(f);
   assert.ok(f.rot.every(q=>q.every(Number.isFinite)&&Math.abs(Math.hypot(...q)-1)<1e-5));assert.ok(!f.scale,'no skeleton scaling');
   if(['ride_bicycle','ride_motorcycle','ride_horse'].includes(meta.ride)){
    const dot=Math.abs(f.rot[rightFoot].reduce((sum,x,d)=>sum+x*A.restLocal[rightFoot][d],0));
    assert.ok(2*Math.acos(Math.min(1,dot))*180/Math.PI<45,`${rig} ${c.id} ankle folds against its shin`);
   }
   // Every joint keeps its bind offset: no stretched limbs or collapsed split segments.
   for(let j=0;j<B.length;j++)if(B[j].parent>=0)assert.ok(Math.abs(gap(p[j],p[B[j].parent])-gap(B[j].head,B[B[j].parent].head))<1e-6,`${c.id} ${B[j].name} changes limb length`);
   min=Math.min(min,...feet.map(j=>(p[j][1]-floor)/s));
   if(previous)for(let j=0;j<p.length;j++){const d=gap(p[j],previous[j])/s;if(d>maxGap){maxGap=d;worst=B[j].name+' '+i;}}previous=p;
  }
  if(diagnose)console.log(c.id,'floor',min.toFixed(3),'jump/frame',maxGap.toFixed(3),worst);
  else {assert.ok(min>-.025,`${rig} ${c.id} foot below floor ${min}`);assert.ok(maxGap<.18,`${rig} ${c.id} discontinuity ${maxGap}`);}
  if(smoke){const vehicle=new Vehicle(id,ch.rig!,A,c,DEFAULT_VEHICLE_STYLE);assert.equal(vehicle.fit.clip.id,meta.ride);vehicle.update(c.duration*.5);let doors=0;vehicle.group.traverse(o=>{if(o.userData.occupantDoor){doors++;assert.ok(Math.abs(o.rotation.y)>1);}});if(['car','sports_car','suv'].includes(id))assert.equal(doors,1);if(id==='motorboat'){const gate=vehicle.group.getObjectByName('Boarding_gate');assert.ok(gate&&gate.rotation.y>1.4);}vehicle.update(c.duration);vehicle.group.traverse(o=>{if(o.userData.doorSide)assert.ok(Math.abs(o.rotation.y)<1e-8);});vehicle.dispose();}
  checks++;
 }
 const plan=planExport(ch,{...DEFAULT_EXPORT,clips:clips.map(c=>c.id)});assert.equal(plan.files.filter(f=>f.kind==='vehicle').length,VEHICLE_FITS.length);assert.equal(plan.files.filter(f=>f.kind==='vehicle').reduce((n,f)=>n+f.clips.length,0),clips.length);assert.equal(new Set(plan.files.map(f=>f.path)).size,plan.files.length);
}
const p=newProject(),a=p.actors[0];a.vehicle='auto';a.beats=[{id:'i',clip:'idle',duration:1,move:false},{id:'b',clip:'board_suv',duration:4.2,move:false},{id:'d',clip:'drive_suv',duration:4,move:true,travelSpeed:1},{id:'e',clip:'alight_suv',duration:4.2,move:false},{id:'w',clip:'walk',duration:2,move:true}];p.shots=[{id:'s',duration:12,shot:'wide',target:'all'}];
assert.ok(vehicleStateAt(p,.5,a)?.parked);assert.equal(vehicleStateAt(p,3,a)?.clip.id,'board_suv');assert.equal(vehicleStateAt(p,7,a)?.parked,false);assert.ok(vehicleStateAt(p,14,a)?.parked);
const parked=vehicleStateAt(p,14,a)!,at=timelineAt(p,14,a),alight=timelineAt(p,9.2,a);assert.ok(Math.abs(parked.z+at.z-alight.z)<1e-6);
assert.deepEqual(parseProject(JSON.stringify(p)).actors[0].beats.map(b=>b.clip),a.beats.map(b=>b.clip));
console.log(`Boarding: ${checks} body/rig/action combinations, exact upright/riding endpoints, rigid limbs, parked timelines and exports passed.`);
