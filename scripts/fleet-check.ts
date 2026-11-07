import {stagingReport} from '../src/studio/spatial-report';
import {locationMap,VEHICLE_ENVELOPES} from '../src/studio/spatial-maps';
import assert from 'node:assert/strict';
import * as T from 'three';
import {nodeLibrary} from './node-assets';
import {buildHuman} from '../src/core/human';
import {DEFAULT_PARAMS} from '../src/core/params';
import {Animator} from '../src/core/anim/evaluate';
import {clipById,CLIPS} from '../src/core/anim/clips';
import {Vehicle} from '../src/core/props/vehicle';
import {VEHICLE_CLIP,VEHICLE_FOR_CLIP,vehicleLift,DEFAULT_VEHICLE_STYLE} from '../src/core/props/vehicles';
import {vehicleStunt} from '../src/core/props/vehicle-stunt';
import {qrot} from '../src/core/anim/quat';
import {boneFor} from '../src/core/rig/poses';
import {newProject,beat,parseProject} from '../src/studio/project';
import {helicopterHeight} from '../src/studio/helicopter-flight';
import {seatsForVehicle} from '../src/studio/vehicle-seats';
import {parseStudioInput} from '../src/studio/assist';
const lib=await nodeLibrary();let checks=0;
for(const rig of ['game','game_lite','full']as const){
 const ch=await buildHuman(lib,{...DEFAULT_PARAMS,rig,detail:'low',outfit:'none',hair:'none',carry:'none',weapon:'none',faceShapes:false}),A=new Animator(ch.rig!),B=ch.rig!.bones,scale=Math.max(...B.flatMap(b=>[b.head[1],b.tail[1]]))/1.8;
 for(const clip of CLIPS.filter(c=>c.vehicleStunt)){
  const model=VEHICLE_FOR_CLIP[clip.id],native=clipById.get(VEHICLE_CLIP[model])!,lift=vehicleLift(model,scale),base=A.frame(native,0,{vehicleLift:lift,vehicleMotion:false}),points=A.positions(base),prop=new Vehicle(model,ch.rig!,A,clip,DEFAULT_VEHICLE_STYLE),hand=B.findIndex(b=>b.name===boneFor(rig,'RightHand'));
  for(const t of [0,.3,.75,1.5,2.25,2.7,3]){
   const f=A.frame(clip,t,{vehicleLift:lift}),p=A.positions(f),m=vehicleStunt(model,t,3,scale),expected=qrot(m.rotation,points[hand]).map((v,d)=>v+m.translation[d]);
   assert.ok(Math.hypot(...p[hand].map((v,d)=>v-expected[d]))<1e-6,'rider/vehicle transform disagrees');assert.ok(f.rot.every(q=>q.every(Number.isFinite)));
   prop.update(t,f,undefined,clip);assert.ok(prop.bounds.getSize(new T.Vector3()).toArray().every(Number.isFinite));
   if(t===0||t===3)for(let i=0;i<B.length;i++)assert.ok(Math.hypot(...p[i].map((v,d)=>v-points[i][d]))<1e-6,'stunt endpoint changes seat');checks++;
  }
  prop.dispose();
 }
}
assert.equal(seatsForVehicle('pickup').length,2);assert.equal(seatsForVehicle('tank').length,1);assert.equal(seatsForVehicle('jet').length,1);
for(const model of ['pickup','tank','jet']as const){const p=newProject('highway');p.actors[0].beats=[beat(`board_${model}`,clipById.get(`board_${model}`)!.duration),beat(VEHICLE_CLIP[model],6,true),beat(`alight_${model}`,clipById.get(`alight_${model}`)!.duration)];if(model==='jet')p.actors[0].beats[1].flightHeight=5;assert.deepEqual(parseStudioInput(JSON.stringify(p),lib.catalog),parseProject(JSON.stringify(p)));if(model==='jet'){const start=p.actors[0].beats[0].duration;assert.equal(helicopterHeight(p.actors[0],1,start),0);assert.ok(helicopterHeight(p.actors[0],1,start+3)>4.9);assert.equal(helicopterHeight(p.actors[0],1,start+6),0);}}
for(const model of ['jet','helicopter']){const p=newProject();p.actors[0].beats=[{...beat(`fly_${model}`,6),flightHeight:5},{...beat(`tumble_${model}`,3),flightHeight:5},{...beat(`fly_${model}`,6),flightHeight:5}];assert.doesNotThrow(()=>parseProject(JSON.stringify(p)));for(const t of [6,9]){const i=t===6?1:2;assert.ok(Math.abs(helicopterHeight(p.actors[0],i-1,t)-helicopterHeight(p.actors[0],i,t))<1e-6);assert.equal(helicopterHeight(p.actors[0],i,t),5);}}
const edge=newProject('desert-outpost');edge.actors[0].x=locationMap(edge.template).bounds[2]-VEHICLE_ENVELOPES.tank.bounds[2]-.1;edge.actors[0].beats=[beat('tumble_tank',3)];assert.ok(stagingReport(edge).issues.some(i=>i.entity.startsWith('vehicle:')&&i.code==='outside-map'),'staging must inspect the swept tumble, not only the upright pose');
console.log(`Expanded fleet: ${checks} rigid stunt samples across three rigs; native endpoints, matching prop transforms, entry JSON, seats and jet flight passed.`);
