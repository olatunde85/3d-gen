import assert from 'node:assert/strict';
import {VehicleStage,type VehicleBody} from '../src/studio/vehicle-stage';
import {parseProject,newProject,newActor,beat} from '../src/studio/project';
import {parseStudioInput,generateAssistGuide} from '../src/studio/assist';
import {sharedBoatFilm,transferFilm} from './fixtures/studio-shared-vehicles';
import {VEHICLE_SPEED,STAGE_LIMIT} from '../src/studio/motion';
import {readFileSync} from 'node:fs';
import type {Catalog} from '../src/core/assets';
const body:VehicleBody={scale:1,boardingScale:1,hip:clip=>[0,clip==='drive_boat'?1.1:.9,0]},bodies=new Map(['driver','left','right'].map(id=>[id,body]));
const boat=parseProject(JSON.stringify(sharedBoatFilm()));
assert.deepEqual(parseStudioInput(JSON.stringify(boat)),boat);
for(const time of [0,3.9,7,11,16,19,21.9,25,29,34,50]){const plan=new VehicleStage(boat,time,bodies);assert.equal(plan.vehicles.size,1);const car=plan.vehicles.get('launch')!;for(const actor of boat.actors){const a=plan.actor(actor);assert.ok([a.x,a.y,a.z,a.yaw].every(Number.isFinite));if(time>=12&&time<22)assert.ok(Math.hypot(a.x-car.x,a.z-car.z)<2,'passenger left the shared boat');}}
assert.equal(new VehicleStage(boat,30,bodies).actor(boat.actors[1]).vehicle,undefined);
for(const patch of [
 (p:typeof boat)=>{p.actors[2].beats.filter(b=>b.vehicleId).forEach(b=>b.vehicleSeat='passenger-left');},
 (p:typeof boat)=>{p.actors[1].beats.find(b=>b.vehicleId)!.vehicleId='missing';},
 (p:typeof boat)=>{p.actors[1].beats.find(b=>b.vehicleId)!.vehicleSeat='rear-left';},
 (p:typeof boat)=>{p.actors[0].beats[1].move=true;},
]){const p=structuredClone(boat);patch(p);assert.throws(()=>parseProject(JSON.stringify(p)));}
const transfer=parseProject(JSON.stringify(transferFilm())),track=transfer.actors[0],profiles=new Map([[track.id,body]]),initial=new VehicleStage(transfer,0,profiles),bike=initial.vehicles.get(`${track.id}-motorcycle`)!,launch=initial.vehicles.get(`${track.id}-motorboat`)!;
for(const time of [0,3,5,6.4,8,9.3999]){const plan=new VehicleStage(transfer,time,profiles);assert.equal(plan.vehicles.size,2);const waiting=plan.vehicles.get(launch.id)!;assert.deepEqual([waiting.x,waiting.z],[launch.x,launch.z]);}
const parked=new VehicleStage(transfer,3,profiles).vehicles.get(bike.id)!;
for(const time of [6.4,9.4,13.4,18.4,24]){const plan=new VehicleStage(transfer,time,profiles),actual=plan.vehicles.get(bike.id)!;assert.deepEqual([actual.x,actual.z],[parked.x,parked.z]);}
const large=newProject('forest-trail');large.actors[0].x=STAGE_LIMIT;large.actors[0].z=-STAGE_LIMIT;assert.doesNotThrow(()=>parseProject(JSON.stringify(large)));
const old={bicycle:1.2,car:1.6,sports_car:1.6,suv:1.6,motorcycle:1.8,horse:1.6,canoe:.65,kayak:.8,rowboat:.7,motorboat:1.4};for(const [id,speed]of Object.entries(old))assert.ok(Math.abs(VEHICLE_SPEED[id as keyof typeof old]-speed*3)<1e-10);
const catalog=JSON.parse(readFileSync('public/assets/catalog.json','utf8'))as Catalog,guide=generateAssistGuide(catalog);assert.ok(guide.includes('vehicleId'));assert.ok(guide.includes('passenger-left'));assert.ok(guide.length<250_000);assert.ok(!guide.includes('One active vehicle per actor'));
const leave=newProject();leave.actors=[{...newActor(undefined,'medium','driver'),beats:[{...beat('drive_car',4),vehicleId:'car'}, {...beat('drive_car',8,true),vehicleId:'car'}]},{...newActor(undefined,'medium','guest'),beats:[{...beat('alight_car_passenger',3.6),vehicleId:'car',vehicleSeat:'front-passenger'}]}];
const parsedLeave=parseProject(JSON.stringify(leave)),metrics=new Map([['driver',body],['guest',body]]),a=new VehicleStage(parsedLeave,3.6,metrics).actor(parsedLeave.actors[1]),z=new VehicleStage(parsedLeave,10,metrics).actor(parsedLeave.actors[1]);assert.deepEqual([a.x,a.z],[z.x,z.z]);
console.log('Studio vehicle staging: shared seats, validation, persistent future/abandoned props, transfer paths, held exits, 3x defaults, large placement and LLM contract passed.');
