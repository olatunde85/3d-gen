import assert from 'node:assert/strict';
import {EscapeGame,type Input} from '../src/play/runtime';
import {createMission,defaultMission,missionObstacles} from '../src/play/mission';
import {defaultDriving,defaultCarFit,driverStand,carClear,driveStep,parseDriving,type CarState} from '../src/play/driving';
import {defaultLoadout,makeCombatant} from '../src/play/combat';
import {route,distance,type Point} from '../src/play/world';
const idle:Input={x:0,z:0,sprint:false,interact:false};let checks=0;
function check(name:string,fn:()=>void){fn();checks++;console.log('OK',name);}
function tick(g:EscapeGame,seconds:number,input:Input=idle){for(let i=0;i<Math.ceil(seconds*60);i++)g.update(1/60,input);}
function walk(g:EscapeGame,to:Point){for(let i=0;i<90*60&&g.status==='playing'&&distance(g.player,to)>.12;i++){const path=route(g.player,to,missionObstacles(g.world,g.door),g.player.radius,g.world.bounds),p=path[0];assert.ok(p);const n=distance(g.player,p);g.update(1/60,{...idle,x:(p.x-g.player.x)/n,z:(p.z-g.player.z)/n,sprint:true});}assert.ok(distance(g.player,to)<.2);tick(g,.35);}
function game(){const g=new EscapeGame({...defaultMission(),story:'getaway'},undefined,{...defaultLoadout(),weapon:'pistol',grenades:2});g.start();g.enemies.forEach(e=>e.combat.health=0);return g;}
function board(g:EscapeGame){Object.assign(g.player,driverStand(g.car!));g.update(1/60,{...idle,interact:true});tick(g,1.2);assert.equal(g.car!.phase,'driving');}
check('pickup settings validate and legacy missions remain on foot',()=>{
 assert.equal(parseDriving(undefined),undefined);assert.deepEqual(parseDriving({}),defaultDriving());for(const raw of [null,[],{pace:'turbo'},{color:'red'},{model:'jet'},{pace:0}])assert.throws(()=>parseDriving(raw));assert.equal(new EscapeGame().car,undefined);
});
check('all 18 getaway arrangements reserve a drivable wide gate, parking and entry',()=>{
 for(const location of ['depot','military-base']as const)for(const layout of ['balanced','open','dense']as const)for(let variation=0;variation<3;variation++){
  const w=createMission({...defaultMission(),story:'getaway',location,layout,variation}),fit=defaultCarFit(),car:CarState={...w.getaway!.pickup,speed:0,steer:0,distance:0,time:0,blocked:0,phase:'parked',fit};assert.equal(w.gateWidth,6);
  for(let z=car.z;z>=w.exit.z;z-=.12)assert.ok(carClear({...car,z},fit,missionObstacles(w,1),w.bounds),JSON.stringify({location,layout,variation,z}));
  assert.ok(route(w.start,w.checkpoints.key,missionObstacles(w,0),.52,w.bounds).length);assert.ok(route(w.key,driverStand(car),missionObstacles(w,1),.52,w.bounds).length);
 }
});
check('every district layout and variation keeps the pickup and compound lane clear',()=>{const fit=defaultCarFit();for(const location of ['desert-compound','market-street','urban-block']as const)for(const layout of ['open','balanced','dense']as const)for(let variation=0;variation<12;variation++){const w=createMission({...defaultMission(),location,layout,variation,extraction:'pickup'}),rects=missionObstacles(w,1),car=w.getaway!.pickup;for(let z=car.z;z>=w.gate.z-5;z-=.5)assert.ok(carClear({...car,z},fit,rects,w.bounds),`${location} ${layout} ${variation} at z=${z}`);}for(const location of ['desert-compound','market-street','urban-block']as const){const g=new EscapeGame({...defaultMission(),location,extraction:'pickup',driveDifficulty:'hard'});g.configureCar(fit);}});
check('district pursuit bays stay clear across staging arrangements',()=>{for(const location of ['desert-compound','market-street','urban-block']as const)for(const layout of ['open','balanced','dense']as const)for(let variation=0;variation<3;variation++){const g=new EscapeGame({...defaultMission(),location,layout,variation,extraction:'pickup',pursuit:true});assert.doesNotThrow(()=>g.configurePursuit(defaultCarFit()),`${location} ${layout} ${variation}`);}});
check('fitted pickup errors name the route segment and location',()=>{const g=new EscapeGame({...defaultMission(),location:'market-street',extraction:'pickup'}),fit=defaultCarFit();fit.box.maxX=20;assert.throws(()=>g.configureCar(fit),/pickup route segment 1: fitted vehicle intersects .*market-street, layout "balanced", variation 0/);});
check('acceleration, braking, reverse and vehicle-relative steering use fixed-step dynamics',()=>{
 const w=createMission({...defaultMission(),story:'getaway'}),car:CarState={...w.getaway!.pickup,speed:0,steer:0,distance:0,time:0,blocked:0,phase:'driving',fit:defaultCarFit()},rects=missionObstacles(w,1);
 for(let i=0;i<60;i++)driveStep(car,1/60,1,0,false,defaultDriving(),rects,w.bounds);assert.ok(car.speed>4);const z=car.z;for(let i=0;i<60;i++)driveStep(car,1/60,0,0,true,defaultDriving(),rects,w.bounds);assert.equal(car.speed,0);assert.ok(car.z<z);for(let i=0;i<60;i++)driveStep(car,1/60,-1,0,false,defaultDriving(),rects,w.bounds);assert.ok(car.speed<0);
 const yaw=car.yaw;for(let i=0;i<10;i++)driveStep(car,1/60,-1,1,false,defaultDriving(),rects,w.bounds);assert.notEqual(car.yaw,yaw);
});
check('swept pickup collisions stop at thin walls and people without teleporting either',()=>{
 const w=createMission({...defaultMission(),story:'getaway'}),car:CarState={x:0,z:9,yaw:Math.PI,speed:13,steer:0,distance:0,time:0,blocked:0,phase:'driving',fit:defaultCarFit()},wall={minX:-4,maxX:4,minZ:4,maxZ:4.03};
 for(let i=0;i<60;i++)driveStep(car,1/60,1,0,false,{...defaultDriving(),pace:'fast'},[wall],w.bounds);assert.equal(car.speed,0);assert.ok(car.z>7.4);assert.ok(car.blocked>0);
 car.z=9;car.speed=13;const person={x:0,z:4,radius:.4};for(let i=0;i<60;i++)driveStep(car,1/60,1,0,false,defaultDriving(),[],w.bounds,[person]);assert.equal(car.speed,0);assert.deepEqual(person,{x:0,z:4,radius:.4});
});
check('impact damages the pickup and a checkpoint restores its condition',()=>{const g=game();g.hasKey=true;g.opening=true;board(g);const checkpoint=g.checkpoint!;assert.equal(checkpoint.vehicle?.health,100);const car=g.car!;Object.assign(car,{x:0,z:9,yaw:Math.PI,health:100,speed:10});const wall={minX:-4,maxX:4,minZ:4,maxZ:4.03};for(let i=0;i<60&&car.speed>0;i++)driveStep(car,1/60,1,0,false,defaultDriving(),[wall],g.world.bounds);assert.ok(car.health!<100);assert.equal(car.speed,0);g.mission.plan='timed';g.time=90;tick(g,.1);assert.equal(g.status,'caught');assert.ok(g.retry());assert.equal(g.car!.health,100);});
check('keys are required; boarding hides guns, then seated drivers can fire while jump and grenades stay blocked',()=>{
 const g=game();Object.assign(g.player,driverStand(g.car!));assert.equal(g.canInteract,false);g.update(1/60,{...idle,interact:true});assert.equal(g.car!.phase,'parked');g.hasKey=true;g.opening=true;board(g);const grenades=g.grenades,ammo=g.playerCombat.magazine;tick(g,.2,{...idle,jump:true,fire:true,aiming:true,aim:{x:0,y:1,z:0},throwGrenade:true,reload:true});assert.equal(g.grenades,grenades);assert.equal(g.playerCombat.magazine,ammo-1);assert.ok(g.playerCombat.reload>0);assert.equal(g.player.grounded,true);assert.equal(g.playerCombat.aiming,false);assert.equal(g.checkpoint?.stage,'vehicle');
});
check('alighting leaves the pickup parked and reboarding uses its current position',()=>{
 const g=game();g.hasKey=true;g.opening=true;board(g);tick(g,.7,{...idle,throttle:1});assert.equal(g.canInteract,false);tick(g,1,{...idle,brake:true});const pose={x:g.car!.x,z:g.car!.z,yaw:g.car!.yaw};assert.ok(g.canInteract);g.update(1/60,{...idle,interact:true});tick(g,1.2);assert.equal(g.car!.phase,'parked');assert.deepEqual({x:g.car!.x,z:g.car!.z,yaw:g.car!.yaw},pose);assert.ok(distance(g.player,driverStand(g.car!))<.01);tick(g,.5);assert.deepEqual({x:g.car!.x,z:g.car!.z,yaw:g.car!.yaw},pose);board(g);assert.deepEqual({x:g.car!.x,z:g.car!.z,yaw:g.car!.yaw},pose);
});
check('a blocked exit stays seated, while retry restores keys, equipment and the parked pickup atomically',()=>{
 const g=game();g.hasKey=true;g.opening=true;board(g);const cp=g.checkpoint!,saved={x:cp.vehicle!.x,z:cp.vehicle!.z,yaw:cp.vehicle!.yaw};tick(g,.6,{...idle,throttle:1});tick(g,.7,{...idle,brake:true});g.grenades=0;g.playerCombat.magazine=2;g.time=90;g.mission.plan='timed';tick(g,.1);assert.equal(g.status,'caught');assert.ok(g.retry());assert.equal(g.car!.phase,'parked');assert.deepEqual({x:g.car!.x,z:g.car!.z,yaw:g.car!.yaw},saved);assert.ok(g.hasKey);assert.equal(g.grenades,cp.grenades);assert.equal(g.playerCombat.magazine,cp.ammo.magazine);assert.ok(distance(g.player,driverStand(g.car!))<.01);
 const car=g.car!,stand=driverStand(car);car.phase='driving';Object.assign(g.player,car);g.enemies[0].combat.health=100;Object.assign(g.enemies[0],stand);assert.equal(g.canInteract,false);g.update(1/60,{...idle,interact:true});assert.equal(car.phase,'driving');
});
check('parking at an angle keeps the real driver’s door accessible for alighting and reboarding',()=>{
 const g=new EscapeGame({...defaultMission(),story:'getaway',location:'military-base'});g.start();g.enemies.forEach(e=>e.combat.health=0);g.hasKey=true;g.opening=true;Object.assign(g.car!,{x:0,z:14,yaw:Math.PI/4});Object.assign(g.player,driverStand(g.car!));assert.ok(g.canInteract);board(g);g.update(1/60,{...idle,interact:true});tick(g,1.2);assert.equal(g.car!.phase,'parked');assert.ok(g.canInteract);board(g);
});
check('armed enemies can hit a seated driver and spent controls do not advance a paused simulation',()=>{
 const g=game();g.hasKey=true;g.opening=true;board(g);const e=g.guard;e.response='pistol';e.combat=makeCombatant({...defaultLoadout(),weapon:'pistol',ammunition:'unlimited'});Object.assign(e,{x:0,z:2,mode:'chase',awareness:1});tick(g,1.5);assert.ok(g.playerCombat.health<100);assert.equal(g.car!.phase,'driving');const pose=JSON.stringify(g.car);g.releaseCombat();assert.equal(JSON.stringify(g.car),pose);
});
check('capture guards pursue the driver around the pickup instead of targeting its solid interior',()=>{
 const g=game();g.hasKey=true;g.opening=true;board(g);const e=g.guard;e.combat=makeCombatant(defaultLoadout());Object.assign(e,{x:0,z:-2,yaw:0,mode:'chase',awareness:1,lastKnown:{x:g.player.x,z:g.player.z},repath:0});const start={x:e.x,z:e.z};tick(g,1);assert.ok(distance(e,start)>1);assert.equal(g.status,'playing');
});
check('30, 60 and 144 Hz displays produce the same driving outcome',()=>{
 const results=[];for(const fps of [30,60,144]){const g=game();g.hasKey=true;g.opening=true;board(g);for(let i=0;i<fps;i++)g.update(1/fps,{...idle,throttle:1,steer:.2});results.push({x:g.car!.x,z:g.car!.z,yaw:g.car!.yaw,speed:g.car!.speed});}for(const result of results)for(const k of ['x','z','yaw','speed']as const)assert.ok(Math.abs(result[k]-results[0][k])<1e-8);
});
check('a complete key, board, drive and stop loop wins on both maps; on-foot extraction cannot win',()=>{
 for(const location of ['depot','military-base']as const){const g=new EscapeGame({...defaultMission(),story:'getaway',location});g.start();g.enemies.forEach(e=>e.combat.health=0);Object.assign(g.player,g.world.exit);tick(g,.1);assert.equal(g.status,'playing');Object.assign(g.player,g.world.start);walk(g,g.world.checkpoints.key);g.update(1/60,{...idle,interact:true});tick(g,2.4);assert.ok(g.hasKey);assert.equal(g.door,1);walk(g,driverStand(g.car!));g.update(1/60,{...idle,interact:true});tick(g,1.5);assert.equal(g.car!.phase,'driving',JSON.stringify({location,player:g.player,stand:driverStand(g.car!),canInteract:g.canInteract,boarding:g.boarding}));for(let i=0;i<20*60&&g.status==='playing';i++){const d=distance(g.car!,g.world.exit);g.update(1/60,{...idle,throttle:d>3?1:.2,brake:d<g.car!.speed*g.car!.speed/22+.8});}assert.equal(g.status,'won',JSON.stringify({location,car:g.car,exit:g.world.exit}));assert.equal(g.objectivesCompleted,3);assert.equal(g.car!.speed,0);}
});
console.log(`${checks} pickup/getaway contracts passed.`);
