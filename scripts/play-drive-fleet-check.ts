import assert from 'node:assert/strict';
import {nodeLibrary} from './node-assets';
import {buildHuman} from '../src/core/human';
import {DEFAULT_PARAMS} from '../src/core/params';
import {Animator} from '../src/core/anim/evaluate';
import {clipById} from '../src/core/anim/clips';
import {Vehicle} from '../src/core/props/vehicle';
import {VEHICLE_CLIP,DEFAULT_VEHICLE_STYLE} from '../src/core/props/vehicles';
import {measureDriveVehicle,measurePickup} from '../src/play/driving-view';
import {DRIVE,DRIVE_VEHICLES,driveBase,driveStep,parseDriving,topSpeed,driverStand,carPoint,defaultCarFit,type CarFit,type DriveVehicle,type CarState} from '../src/play/driving';
import {EscapeGame} from '../src/play/runtime';
import {defaultMission} from '../src/play/mission';

const lib=await nodeLibrary(),human=await buildHuman(lib,{...DEFAULT_PARAMS,rig:'game',detail:'low',weapon:'none',carry:'none',faceShapes:false}),anim=new Animator(human.rig!);
const road={minX:-500,maxX:500,minZ:-500,maxZ:500},settings=parseDriving({pace:'standard'})!,car:CarState={x:0,z:0,yaw:0,speed:0,steer:0,distance:0,phase:'driving',time:0,fit:defaultCarFit(),blocked:0};
for(let i=0;i<300;i++)driveStep(car,1/60,1,0,false,settings,[],road);
assert.ok(car.speed>=26.9&&car.z>100,'standard pickup reaches the higher forward speed on an open road');
for(let i=0;i<240;i++)driveStep(car,1/60,-1,0,false,settings,[],road);
assert.ok(car.speed<=-DRIVE.reverse+.1&&car.z<120,'pickup reaches the higher reverse speed and actually moves backward');
console.log('OK pickup accelerates to 27 m/s forward and 14 m/s in reverse');
const fleet:{model:DriveVehicle;color:string;fit:CarFit}[]=[];
for(const model of DRIVE_VEHICLES.filter(m=>m!=='pickup')){
 const base=driveBase(model),vehicle=new Vehicle(base,human.rig!,anim,clipById.get(VEHICLE_CLIP[base])!,DEFAULT_VEHICLE_STYLE,{body:base===model?undefined:model as never}),fit=measureDriveVehicle(vehicle,human.rig!,.36,model);
 assert.equal(fit.model,model);assert.ok(topSpeed({color:'#294c60',pace:'standard',model})>0);
 for(const location of model==='bus'?[]:['depot','military-base','desert-compound','market-street','urban-block']as const){const game=new EscapeGame({...defaultMission(),story:'getaway',extraction:'pickup',location},undefined,undefined,100,undefined,parseDriving({model})!);try{game.configureCar(fit);}catch(error){throw Error(`${model} / ${location}: ${(error as Error).message}`);}}
 // A parked vehicle is solid only within its own outline: wherever boarding is offered around it, the walk-up and boarding succeed.
 if(model!=='bus'){let offered=0;for(let k=0;k<16;k++){const game=new EscapeGame({...defaultMission(),story:'getaway',extraction:'pickup',location:'depot'},undefined,undefined,100,undefined,parseDriving({model})!);game.configureCar(fit);game.start();game.protection=Infinity;game.enemies.forEach(e=>e.combat.health=0);game.hasKey=true;
  const car=game.car!,b=fit.box,angle=k/16*Math.PI*2,dir={x:Math.sin(angle),z:Math.cos(angle)},edge=Math.min(Math.abs((dir.x>0?b.maxX:-b.minX)/(dir.x||1e-9)),Math.abs((dir.z>0?b.maxZ:-b.minZ)/(dir.z||1e-9)))+.6;Object.assign(game.player,carPoint(car,{x:dir.x*edge,z:dir.z*edge}));
  const idle={x:0,z:0,sprint:false,interact:false};game.update(1/60,idle);if(!game.canInteract)continue;offered++;game.update(1/60,{...idle,interact:true});for(let i=0;i<300&&car.phase!=='driving';i++)game.update(1/60,idle);
  assert.equal(car.phase,'driving',`${model} boards when approached from ${Math.round(angle*180/Math.PI)}° in vehicle space: ${game.prompt}`);}
  assert.ok(offered>=4,`${model} offers boarding from several sides: ${offered}`);}
 fleet.push({model,color:'#777777',fit});
 vehicle.dispose();console.log('OK',model,model==='bus'?'joins the city fleet (too long for mission routes)':'fits all five direct extraction maps');
}
const pickup=new Vehicle('pickup',human.rig!,anim,clipById.get(VEHICLE_CLIP.pickup)!,DEFAULT_VEHICLE_STYLE),hub=new EscapeGame({...defaultMission(),location:'urban-block',story:'getaway',extraction:'pickup'},undefined,undefined,100,undefined,undefined,true);
hub.configureCar(measurePickup(pickup,human.rig!,.36));hub.configureHubFleet(fleet);assert.equal(hub.hubFleet.length,fleet.length);hub.start();for(const model of ['sports_car','suv','motorcycle']as const){const slot=hub.hubFleet.find(item=>item.model===model)!;Object.assign(hub.player,driverStand(slot.car));assert.equal(hub.canInteract,true,`${model} has a reachable driver door`);hub.update(1/60,{x:0,z:0,sprint:false,interact:true});assert.equal(hub.vehicleSettings.model,model);assert.equal(hub.car?.phase,'boarding');hub.configureCar(slot.car.fit);hub.car!.phase='parked';}pickup.dispose();console.log('OK city fleet cars are parked, reachable and switchable');
const still={x:0,z:0,sprint:false,interact:false};Object.assign(hub.player,driverStand(hub.car!));assert.equal(hub.canInteract,true,'parked bike is boardable');hub.update(1/60,{...still,interact:true});for(let i=0;i<90;i++)hub.update(1/60,still);assert.equal(hub.car!.phase,'driving');Object.assign(hub.car!,{x:0,z:-70,yaw:Math.PI/3,speed:0});Object.assign(hub.player,{x:0,z:-70,yaw:Math.PI/3});hub.update(1/60,{...still,interact:true});for(let i=0;i<90;i++)hub.update(1/60,still);assert.equal(hub.car!.phase,'parked');const left=carPoint(hub.car!,{x:-hub.car!.fit.stand.x,z:hub.car!.fit.stand.z});Object.assign(hub.player,left);assert.equal(hub.canInteract,true,`parked bike can be boarded from the other side: ${hub.prompt}`);hub.update(1/60,{...still,interact:true});for(let i=0;i<90;i++)hub.update(1/60,still);assert.equal(hub.car!.phase,'driving','bike reboards from the opposite side');
