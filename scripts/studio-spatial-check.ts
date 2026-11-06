/** Spatial contracts: true geometry extents, continuous paths, transfers and fitted body scales. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SETS} from '../src/studio/catalog';
import {LOCATION_MAPS,locationMap,locationMapFile,VEHICLE_ENVELOPES} from '../src/studio/spatial-maps';
import {footprint,hull,spatialConflict} from '../src/studio/spatial-geometry';
import {stagingReport,placeStart,type SpatialBody} from '../src/studio/spatial-report';
import {newProject,beat,timelineAt,type StudioProject} from '../src/studio/project';
import {VehicleStage} from '../src/studio/vehicle-stage';
import {clipById} from '../src/core/anim/clips';
import {VEHICLE_CLIP,VEHICLE_FOR_CLIP,vehicleLift,type VehicleId,DEFAULT_VEHICLE_STYLE} from '../src/core/props/vehicles';
import {VEHICLE_TRANSITIONS,boardingScale} from '../src/core/props/vehicle-actions';
import {generateAssistGuide,describeAssistProject} from '../src/studio/assist';
import {buildHuman} from '../src/core/human';
import {DEFAULT_PARAMS} from '../src/core/params';
import {Animator} from '../src/core/anim/evaluate';
import {boneFor} from '../src/core/rig/poses';
import {Vehicle} from '../src/core/props/vehicle';
import {nodeLibrary} from './node-assets';
import type {LocationMap,Rect,SpatialPose,VehicleEnvelope} from '../src/studio/spatial-types';

assert.deepEqual(LOCATION_MAPS.map(m=>m.id),SETS.map(s=>s.id));
for(const map of LOCATION_MAPS){
 assert.ok(map.bounds.every(Number.isFinite));assert.ok(map.bounds[0]<map.bounds[2]&&map.bounds[1]<map.bounds[3]);
 for(const s of map.seats)assert.ok([s.x,s.y,s.z,s.yaw].every(Number.isFinite));
 for(const r of map.routes){const models=r.mode==='pedestrian'?['pedestrian']:r.mode==='boat'?['motorboat']:['car','sports_car','suv','motorcycle'];for(const model of models){const rect:Rect=model==='pedestrian'?[-.3,-.3,.3,.3]:VEHICLE_ENVELOPES[model].bounds;
  assert.equal(spatialConflict(map,hull([...footprint(r.start,rect,r.clearance),...footprint(r.end,rect,r.clearance)]),r.mode,0,r.mode==='pedestrian'?2.2:2.8),undefined,`${map.id}/${r.id}/${model}`);}}
 for(const start of map.starts)for(const model of start.models){const rect:Rect=model==='pedestrian'?[-.3,-.3,.3,.3]:VEHICLE_ENVELOPES[model].bounds;assert.equal(spatialConflict(map,footprint(start.pose,rect,start.clearance),start.mode,0,start.mode==='pedestrian'?2.2:2.8),undefined,`${map.id} starting ${model}`);}
 for(let i=0;i<map.starts.length;i++)for(let j=i+1;j<map.starts.length;j++)assert.ok(Math.hypot(map.starts[i].pose.x-map.starts[j].pose.x,map.starts[i].pose.z-map.starts[j].pose.z)>=3,`${map.id} separated starts`);
}
for(const [id,shore]of [['harbour',-7.5],['beach',-3.5],['sunset-beach',-3.5],['mountain-lake',-9],['campsite',-14]]as const)assert.equal(locationMap(id).water[0][3],shore);
assert.equal(locationMap('office').seats.length,5);assert.ok(locationMap('church').seats.length>=24);assert.ok(locationMap('office').routes.length>0);
assert.ok(locationMap('sports-court').regions.some(r=>r.id==='basketball-court'&&r.bounds[0]>3));
const harbour=locationMap('harbour'),anchor=harbour.boarding[0];assert.ok(anchor);assert.equal(anchor.stand.yaw,180);assert.ok(harbour.regions.some(r=>r.id==='boarding-pier'));
assert.equal(spatialConflict(harbour,hull([...footprint(anchor.approach,[-.25,-.25,.25,.25],.08),...footprint(anchor.stand,[-.25,-.25,.25,.25],.08)]),'pedestrian'),undefined);
assert.equal(spatialConflict(harbour,hull([...footprint(anchor.vehicle,VEHICLE_ENVELOPES.motorboat.bounds,.025),...footprint(anchor.departure,VEHICLE_ENVELOPES.motorboat.bounds,.025)]),'boat',0,2.8),undefined);
assert.equal(locationMapFile('harbour').location.id,'harbour');
console.log(`Geometry: ${LOCATION_MAPS.length} maps, every reference lane/start checked with each supported footprint; shores, piers, seats and court coordinates passed.`);

const empty:LocationMap={id:'test',bounds:[-100,-100,100,100],land:{bounds:[-100,-100,100,100],exceptWater:true},water:[[-5,-5,5,5]],regions:[],obstacles:[],seats:[],routes:[],starts:[],boarding:[],notes:[]};
const p=(x:number,z:number,yaw=0):SpatialPose=>({x,y:0,z,yaw}),rect:Rect=[-.2,-.2,.2,.2];
const crossing=hull([...footprint(p(-10,0),rect),...footprint(p(10,0),rect)]);
assert.equal(spatialConflict(empty,crossing,'pedestrian')?.code,'ground-in-water','must inspect the middle, even when both endpoints are on land');
const surrounded=hull([...footprint(p(-10,-10),[-2,-2,2,2]),...footprint(p(10,10),[-2,-2,2,2])]);assert.equal(spatialConflict(empty,surrounded,'boat')?.code,'boat-on-land');
const narrow={...empty,water:[],obstacles:[{bounds:[.005,-1,.01,1]as Rect,bottom:0,top:2}]};assert.equal(spatialConflict(narrow,crossing,'ground-vehicle')?.code,'obstacle','thin barrier crossed between frames');
const overpass={...empty,water:[],obstacles:[{bounds:[-5,-5,5,5]as Rect,bottom:5,top:6}]};assert.equal(spatialConflict(overpass,crossing,'ground-vehicle',0,2.8),undefined);assert.equal(spatialConflict(overpass,crossing,'air',4,7)?.code,'obstacle');
const deck=footprint(p(0,0,45),[-1,-4,1,4]);assert.equal(spatialConflict(empty,footprint(p(0,0),rect),'pedestrian',0,2,[deck]),undefined);assert.equal(spatialConflict(empty,footprint(p(4,0),rect),'pedestrian',0,2,[deck])?.code,'ground-in-water','deck exemption cannot make nearby water into land');
const docked={...empty,regions:[{id:'dock',kind:'dock' as const,bounds:[-1,-7,1,7]as Rect,y:0}]};assert.equal(spatialConflict(docked,footprint(p(0,0),rect),'pedestrian'),undefined);assert.equal(spatialConflict(docked,footprint(p(0,0),rect),'boat')?.code,'boat-on-land');
console.log('Continuous footprints: interior water, thin walls, dock overrides, oriented deck support and overpass heights passed.');

const land=newProject('harbour');land.actors[0].beats=[beat('drive_car',6,true)];Object.assign(land.actors[0],{x:20,y:0,z:0,yaw:180});const result=stagingReport(land);
assert.equal(result.accuracy,'reference-body');assert.ok(result.issues.some(i=>i.code==='ground-in-water'));assert.equal(result.transitions[0].from.z,14.4);assert.equal(result.transitions[0].to.z,-14.4);
const boat=newProject('harbour');boat.actors[0].beats=[beat('idle',2),beat('board_motorboat',2),beat('drive_boat',3,true)];assert.ok(stagingReport(boat).issues.some(i=>i.entity.startsWith('vehicle:')&&i.start===0),'future boat must already be checked at frame zero');
const start=newProject('harbour');start.actors[0].beats=[beat('run',3,true),beat('idle',1),beat('walk',2,true)];placeStart(start,start.actors[0].id,{x:10,z:20});const initial=new VehicleStage(start,0,new Map()).actor(start.actors[0]);assert.ok(Math.hypot(initial.x-10,initial.z-20)<1e-8);
const original=JSON.stringify(start);stagingReport(start);assert.equal(JSON.stringify(start),original,'checks must not change the film');
assert.ok(describeAssistProject(land).warnings.length>0);
const catalogue=JSON.parse(readFileSync('public/assets/catalog.json','utf8'));const guide=generateAssistGuide(catalogue,'An escape through the harbour.',undefined,'harbour');assert.ok(guide.includes('SPATIAL-STAGING REQUIREMENT'));assert.ok(guide.includes('cumulativeTravel(t)-D/2'));assert.ok(guide.includes('east-pier-motorboat'));assert.ok(guide.includes('walkway'));assert.ok(guide.length<250_000);
console.log('Film planning: centred full-timeline paths, placed starts, first-frame waiting boats, warnings and guide contracts passed.');

for(const [clip,mode]of [['walk','pedestrian'],['drive_suv','ground-vehicle'],['drive_boat','boat']]as const){
 const lane=harbour.routes.find(r=>r.mode===mode)!,film=newProject('harbour');film.actors[0].yaw=lane.start.yaw;film.actors[0].beats=[beat(clip,3,true)];placeStart(film,film.actors[0].id,lane.start);assert.deepEqual(stagingReport(film).issues,[],clip+' verified lane should stay clear for the whole film');
}
// Fitted characters use the exact rig scale, hip fit and authored boarding footwork.
const lib=await nodeLibrary();
for(const rig of ['game','game_lite','full']as const){
 const ch=await buildHuman(lib,{...DEFAULT_PARAMS,rig,detail:'low',outfit:'none',hair:'none',faceShapes:false}),animator=new Animator(ch.rig!),s=Math.max(...ch.rig!.bones.flatMap(b=>[b.head[1],b.tail[1]]))/1.8,hip=ch.rig!.bones.findIndex(b=>b.name===boneFor(rig,'Hips')),cache=new Map<string,VehicleEnvelope>();
 const body:SpatialBody={scale:s,boardingScale:boardingScale(ch.rig!),height:ch.height,hip:(clip,model)=>animator.positions(animator.frame(clipById.get(clip)!,0,{vehicleLift:vehicleLift(model??VEHICLE_FOR_CLIP[clip],s),weaponPose:'hidden'}))[hip],
  envelope:(model)=>{if(!cache.has(model)){const v=new Vehicle(model as VehicleId,ch.rig!,animator,clipById.get(VEHICLE_CLIP[model as VehicleId])!,DEFAULT_VEHICLE_STYLE),box=v.bounds;cache.set(model,{bounds:[box.min.x,box.min.z,box.max.x,box.max.z],bottom:box.min.y,top:box.max.y});v.dispose();}return cache.get(model);},
  boardingPoint:(project,track,time)=>{const at=timelineAt(project,time,track),clip=clipById.get(track.beats[at.index].clip)!,f=animator.frame(clip,Math.min(at.phase,clip.duration),{vehicleLift:vehicleLift(VEHICLE_FOR_CLIP[clip.id],s)}),p=f.rootPos.get(hip)!;return{x:p[0]-ch.rig!.bones[hip].head[0],z:p[2]-ch.rig!.bones[hip].head[2]};}};
 const transfer:StudioProject=newProject('harbour'),a=transfer.actors[0],run=clipById.get('run')!;a.yaw=180;a.beats=[beat('ride_motorcycle',3,true),beat('alight_motorcycle',1.7),beat('run',8.5/(run.travel![2]*s),true),beat('board_motorboat',2),beat('drive_boat',6,true)];
 a.beats[0].vehicleId='bike';a.beats[1].vehicleId='bike';a.beats[3].vehicleId='boat';a.beats[4].vehicleId='boat';const bodies=new Map([[a.id,body]]),before=new VehicleStage(transfer,0,bodies).vehicles.get('boat')!;
 // Fit the vessel beside the pier using its measured half-beam and real doorway reach.
 const envelope=body.envelope!('motorboat')!,x=1.2+envelope.bounds[2]+.04,z=-12; a.x+=x-before.x;a.z+=z-before.z;
 const report=stagingReport(transfer,bodies);assert.equal(report.accuracy,'fitted-bodies');
 const waiting=new VehicleStage(transfer,0,bodies).vehicles.get('boat')!,exited=new VehicleStage(transfer,6,bodies);assert.ok(waiting.z< -7.5);assert.ok(exited.vehicles.has('bike'));assert.ok(exited.vehicles.get('bike')!.z> -7.5);
 const board=report.transitions.find(t=>t.clip==='board_motorboat')!;assert.ok(board.from.z< -10);assert.ok(board.from.x<1.2&&board.from.x>-.6,rig+' gate on pier');
 assert.ok(!report.issues.some(i=>i.entity==='vehicle:boat'&&i.code==='boat-on-land'),rig+' boat stays in water');
 assert.ok(report.issues.every(i=>i.code==='ground-in-water'&&i.entity===a.id),'tight approach/deck contacts should be identified');console.log(`${rig} fitted transfer: ${report.issues.length} conservative findings; gate (${board.from.x},${board.from.z}), parked boat (${waiting.x.toFixed(3)},${waiting.z.toFixed(3)}).`);
}
assert.equal(VEHICLE_TRANSITIONS.length,14);
console.log('Spatial staging checks passed.');
