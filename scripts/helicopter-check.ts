import assert from 'node:assert/strict';
import {defaultWeaponYaw} from '../src/core/anim/riding-weapons';
import {searchAnimations} from '../src/studio/animations';
import {readFileSync} from 'node:fs';
import * as T from 'three';
import {helicopterFilm} from './fixtures/studio-helicopter';
import {parseProject,newProject,beat} from '../src/studio/project';
import {VehicleStage,type VehicleBody} from '../src/studio/vehicle-stage';
import {helicopterHeight} from '../src/studio/helicopter-flight';
import {seatsForVehicle} from '../src/studio/vehicle-seats';
import {parseStudioInput,generateAssistGuide} from '../src/studio/assist';
import {nodeLibrary} from './node-assets';
import {buildHuman} from '../src/core/human';
import {DEFAULT_PARAMS} from '../src/core/params';
import {Animator} from '../src/core/anim/evaluate';
import {clipById} from '../src/core/anim/clips';
import {Vehicle} from '../src/core/props/vehicle';
import {DEFAULT_VEHICLE_STYLE,VEHICLE_CLIP,vehicleLift} from '../src/core/props/vehicles';
import {boardingScale} from '../src/core/props/vehicle-actions';
import {boneFor} from '../src/core/rig/poses';
import {vehicleActions,VEHICLES} from '../src/app/ui/quick-data';
assert.equal(searchAnimations('chopper').length,5);assert.equal(defaultWeaponYaw('fly_helicopter','front-passenger'),80);assert.equal(defaultWeaponYaw('fly_helicopter','rear-left'),80);assert.equal(defaultWeaponYaw('fly_helicopter','rear-right'),-35);
const p=parseProject(JSON.stringify(helicopterFilm()));
assert.deepEqual(parseStudioInput(JSON.stringify(p)),p);assert.equal(seatsForVehicle('helicopter').length,4);assert.ok(VEHICLES.some(v=>v.id==='helicopter'));assert.deepEqual(vehicleActions('helicopter'),['board_helicopter','fly_helicopter','bailout_helicopter','alight_helicopter','tumble_helicopter']);
const body:VehicleBody={scale:1,boardingScale:1,hip:()=>[0,1,0]},bodies=new Map(p.actors.map(a=>[a.id,body]));
for(const t of [0,2.2,4.4,5.2,7.2,9,11.2,13.2,15.4,16.4]){const stage=new VehicleStage(p,t,bodies);assert.equal(stage.vehicles.size,1);const vehicle=stage.vehicles.get('rescue')!;assert.ok(vehicle.y>=0);if(t>=7.2&&t<=11.2)assert.ok(vehicle.y>=4.9);if(t<5.2||t>=13.2)assert.ok(vehicle.y<1e-8);if(t>=4.4&&t<13.2)for(const a of p.actors){const q=stage.actor(a);assert.equal(q.y,vehicle.y);assert.ok(Math.hypot(q.x-vehicle.x,q.z-vehicle.z)<2);}}
for(const at of [2.2,5.2,13.2]){const before=new VehicleStage(p,at-1e-6,bodies).vehicles.get('rescue')!,after=new VehicleStage(p,at+1e-6,bodies).vehicles.get('rescue')!;assert.ok(Math.hypot(before.x-after.x,before.y-after.y,before.z-after.z)<.001);}
const bad=structuredClone(p);bad.actors[0].beats[1].flightHeight=3;assert.throws(()=>parseProject(JSON.stringify(bad)),/ground/);
for(const flightHeight of [-1,31,'high']){const q=newProject();q.actors[0].beats=[{...beat('fly_helicopter',6),flightHeight:flightHeight as number}];assert.throws(()=>parseProject(JSON.stringify(q)));}
const other=newProject();other.actors[0].beats=[{...beat('walk',3),flightHeight:4}];assert.throws(()=>parseProject(JSON.stringify(other)));
const hover=newProject();hover.actors[0].beats=[{...beat('fly_helicopter',6),flightHeight:4}];assert.equal(helicopterHeight(hover.actors[0],0,0),0);assert.equal(helicopterHeight(hover.actors[0],0,3),4);assert.equal(helicopterHeight(hover.actors[0],0,6),0);
const guide=generateAssistGuide(JSON.parse(readFileSync('public/assets/catalog.json','utf8')));assert.ok(guide.includes('flightHeight'));assert.ok(guide.includes('board_helicopter'));assert.ok(guide.includes('alight_helicopter'));assert.ok(guide.length<250_000);
const lib=await nodeLibrary(),ch=await buildHuman(lib,{...DEFAULT_PARAMS,detail:'low',outfit:'none',hair:'none',faceShapes:false,vehicle:'auto',carry:'none',weapon:'none'}),A=new Animator(ch.rig!),ride=new Vehicle('helicopter',ch.rig!,A,clipById.get('fly_helicopter')!,DEFAULT_VEHICLE_STYLE);
assert.ok(ride.bounds.min.y>=0);assert.ok(ride.bounds.getSize(new T.Vector3()).z>6);for(const name of ['Main_rotor','Tail_rotor','Door_right','Door_left','Door_rear_left','Door_rear_right','Cyclic','Collective'])assert.ok(ride.group.getObjectByName(name),name);
const rotor=ride.group.getObjectByName('Main_rotor')!;ride.update(.4);assert.ok(Math.abs(rotor.rotation.y)>1);ride.update(.4,undefined,undefined,ride.clip,true);assert.equal(rotor.rotation.y,0);
const board=clipById.get('board_helicopter')!;ride.update(board.duration*.45,undefined,undefined,board);assert.ok(Math.abs(ride.group.getObjectByName('Door_right')!.rotation.y)>1);assert.equal(ride.group.getObjectByName('Door_left')!.rotation.y,0);assert.equal(rotor.rotation.y,0);
const scale=ride.fit.scale,hip=ch.rig!.bones.findIndex(b=>b.name===boneFor(ch.rig!.type,'Hips'));const actual:VehicleBody={scale,boardingScale:boardingScale(ch.rig!),hip:(id,model)=>A.positions(A.frame(clipById.get(id)!,0,{vehicleLift:vehicleLift(model??'helicopter',scale),weaponPose:'hidden'}))[hip]};
const actualBodies=new Map(p.actors.map(a=>[a.id,actual]));for(const t of [0,2.2,4.4,7.2,13.2,15.4]){const state=new VehicleStage(p,t,actualBodies);assert.ok([...state.vehicles.values()].every(v=>Number.isFinite(v.y)));}
ride.update(0);const {mesh,rig,bake}=ride.asset();assert.ok(mesh.positions.every(Number.isFinite));assert.ok(rig.bones.some(b=>b.name.includes('Main_rotor')));assert.ok(bake().frames.every(f=>f.rot.every(q=>q.every(Number.isFinite))));ride.dispose();
assert.equal(VEHICLE_CLIP.helicopter,'fly_helicopter');
console.log('Helicopter: four seats, Quick Build, flight/hover/landing, grounded entry validation, real doors/rotors, shared elevation, export joints and LLM guide passed.');
