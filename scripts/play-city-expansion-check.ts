import assert from 'node:assert/strict';
import {EscapeGame,type Input} from '../src/play/runtime';
import {createMission,defaultMission,missionObstacles,solidVolumes} from '../src/play/mission';
import {motorStep,sight} from '../src/play/motor';
import {defaultCarFit,driveStep,carTouchesPerson,topSpeed,type CarState} from '../src/play/driving';
import {blocked,distance} from '../src/play/world';
import {defaultLoadout,traceShot} from '../src/play/combat';

const idle:Input={x:0,z:0,sprint:false,interact:false};
for(const location of ['desert-compound','market-street','urban-block']as const){
 const world=createMission({...defaultMission(),location}),volumes=solidVolumes(world,1),body={x:-13,z:12,y:0,vy:0,height:1.8,radius:.34,grounded:true,airTime:0,landing:0,yaw:Math.PI,speed:0};
 assert.equal(world.doors.length,2);assert.ok(!blocked({x:-13,z:11},.34,missionObstacles(world,1)));
 assert.equal(sight({...body,z:12}, {...body,z:9},volumes),true,'entrance admits an indoor shot');
 for(let i=0;i<1100;i++)motorStep(body,0,-.012,1/60,volumes,false,world.bounds);
 assert.ok(body.y>=(location==='urban-block'?4.3:2.1),`${location} stairs reach the roof`);
 console.log('OK',location,'has a passable interior, opening-door clearance and walkable roof route');
}
const urban=createMission({...defaultMission(),location:'urban-block'}),urbanVolumes=solidVolumes(urban,1),lower={x:-15,z:7,y:0,vy:0,height:1.8,radius:.34,grounded:true,airTime:0,landing:0,yaw:0,speed:0};
for(let i=0;i<100;i++)motorStep(lower,0,.01,1/60,urbanVolumes,false,urban.bounds);
assert.ok(lower.z>7.8&&lower.y===0,'the lower room stays walkable beneath its suspended floor');
const upper={...lower,x:-13,z:12,y:0};for(let i=0;i<1000&&upper.y<2.2;i++)motorStep(upper,0,-.012,1/60,urbanVolumes,false,urban.bounds);
assert.ok(upper.y>=2.2,'stairs reach the second level');for(let i=0;i<160;i++)motorStep(upper,-.014,0,1/60,urbanVolumes,false,urban.bounds);
assert.ok(upper.x<-14.2&&upper.y>=2.35&&upper.y<3,'the upper room is accessible from the stairs');
const below={...lower,x:upper.x,z:upper.z};assert.equal(sight(below,upper,urbanVolumes),false,'the suspended floor blocks sight between levels');
assert.equal(traceShot(below,{x:upper.x,y:upper.y+1,z:upper.z},urbanVolumes,[],20).blocked,true,'the suspended floor blocks shots between levels');
console.log('OK urban block has a walkable lower room and reachable suspended upper floor');

const actors=[{id:'driver',aggression:'balanced' as const,response:'pistol' as const}];
for(const location of ['depot','military-base','desert-compound','market-street','urban-block']as const)for(const layout of ['balanced','dense']as const){const candidate=new EscapeGame({...defaultMission(),location,layout,story:'getaway',extraction:'pickup',steps:[{type:'chase'}]},actors);candidate.configureCar(defaultCarFit());candidate.configurePursuit(defaultCarFit());assert.ok(candidate.pursuit,'the chase target has a clear road bay');}
console.log('OK chase vehicles have clear starting bays across all five maps and two layouts');
const chase=new EscapeGame({...defaultMission(),location:'urban-block',story:'getaway',extraction:'pickup',steps:[{type:'chase'}]},actors);
chase.configureCar(defaultCarFit());chase.configurePursuit(defaultCarFit());chase.start();chase.protection=Infinity;
const samples:{x:number;z:number}[]=[];for(let i=0;i<42*60;i++){chase.update(1/60,idle);if(i%60===59)samples.push({...chase.pursuit!.car});}
assert.ok(samples.length>=40&&samples.some(p=>distance(p,samples[0])>9),JSON.stringify(samples));assert.ok(new Set(samples.map(p=>Math.round(p.z/3))).size>=3,`courier keeps circulating: ${JSON.stringify(samples)}`);
// The courier flees a hunter parked in its path: it turns away and keeps its distance, at more than walking pace.
{const flee=new EscapeGame({...defaultMission(),location:'urban-block',story:'getaway',extraction:'pickup',steps:[{type:'chase'}]},actors);flee.configureCar(defaultCarFit());flee.configurePursuit(defaultCarFit());flee.start();flee.protection=Infinity;flee.car!.phase='driving';
 for(let i=0;i<4*60;i++)flee.update(1/60,idle);let top=0;const goal=(flee as unknown as {chaseGoal:{x:number;z:number}}).chaseGoal;Object.assign(flee.car!,{x:(flee.pursuit!.car.x+goal.x)/2,z:(flee.pursuit!.car.z+goal.z)/2,speed:0});
 for(let i=0;i<10*60;i++){flee.update(1/60,{...idle,brake:true});top=Math.max(top,Math.abs(flee.pursuit!.car.speed));}
 assert.notDeepEqual((flee as unknown as {chaseGoal:unknown}).chaseGoal,goal,'a cut-off courier picks another lane');assert.ok(distance(flee.car!,flee.pursuit!.car)>12,`courier keeps away: ${distance(flee.car!,flee.pursuit!.car)}`);assert.ok(top>12,`courier speeds up when hunted: ${top}`);assert.equal(flee.stepIndex,0);}
console.log('OK courier flees a hunter that cuts it off');
assert.equal(chase.stepIndex,0);chase.car!.phase='driving';Object.assign(chase.car!,{x:chase.pursuit!.car.x,z:chase.pursuit!.car.z+5,speed:0});chase.update(1/60,{...idle,brake:true});assert.equal(chase.stepIndex,1);console.log('OK courier loops until caught in a driven vehicle');

const convoy=new EscapeGame({...defaultMission(),location:'urban-block',story:'getaway',extraction:'pickup',steps:[{type:'convoy'}]},actors);
convoy.configureCar(defaultCarFit());convoy.configurePursuit(defaultCarFit());convoy.start();convoy.protection=Infinity;convoy.car!.phase='driving';
for(let i=0;i<45*60&&convoy.stepIndex===0;i++){Object.assign(convoy.car!,{x:convoy.pursuit!.car.x,z:convoy.pursuit!.car.z+12,speed:0});convoy.update(1/60,{...idle,brake:true});}
assert.equal(convoy.stepIndex,1);assert.ok(convoy.enemies.find(e=>e.id===convoy.pursuit!.driver)!.combat.health>0);assert.equal(convoy.pursuitActive,true);assert.equal(convoy.shotTargets().some(t=>t.id===convoy.pursuit!.driver),false,'the escorted driver remains friendly after arrival');console.log('OK convoy advances only while escorted and reaches extraction');

const checkpoint=new EscapeGame({...defaultMission(),story:'getaway',extraction:'pickup',steps:[{type:'reach'}]},actors);
checkpoint.start();checkpoint.car!.phase='driving';checkpoint.stepIndex=1;checkpoint.update(1/60,{...idle,brake:true});assert.equal(checkpoint.checkpoint?.stage,'gate');assert.equal(carTouchesPerson(checkpoint.car!,checkpoint.car!.fit,{...checkpoint.checkpoint!.spawn,radius:checkpoint.player.radius}),false);
const legacy={...checkpoint.checkpoint!,spawn:{x:checkpoint.car!.x,z:checkpoint.car!.z,yaw:checkpoint.car!.yaw}};Object.assign(checkpoint,{savedCheckpoint:legacy,status:'caught',remainingLives:2});assert.ok(checkpoint.retry());assert.equal(carTouchesPerson(checkpoint.car!,checkpoint.car!.fit,checkpoint.player),false);console.log('OK checkpoint retry moves even a legacy under-car spawn to a safe driver-side spot');

const hub=new EscapeGame({...defaultMission(),location:'urban-block',story:'getaway',extraction:'pickup',sideQuests:['delivery','street-race']},actors,{...defaultLoadout(),weapon:'pistol',ammunition:'unlimited'},100,undefined,undefined,true);
hub.configureCar(defaultCarFit());hub.configurePursuit(defaultCarFit());hub.start();hub.protection=Infinity;assert.equal(hub.hubHeat,0);assert.equal(hub.enemies[0].combat.health,0);hub.update(1/60,idle);assert.equal(hub.events.some(e=>e.type==='checkpoint'),false,'the hub does not announce a mission key checkpoint');
for(let i=0;i<16*60;i++)hub.update(1/60,{...idle,fire:true,aim:{x:10,y:1,z:10}});
assert.equal(hub.hubHeat,3);assert.equal(hub.pursuitActive,true);assert.ok(hub.enemies[0].combat.health>0);hub.protection=Infinity;for(let i=0;i<85*60;i++)hub.update(1/60,idle);assert.equal(hub.hubHeat,0);
hub.car!.phase='driving';Object.assign(hub.car!,hub.world.exit,{speed:0});hub.update(1/60,{...idle,brake:true});assert.equal(hub.hubMissionReady,true);hub.update(1/60,{...idle,interact:true,brake:true});assert.equal(hub.hubLaunch,true);assert.equal(hub.status,'playing');console.log('OK hub police escalates through three stars, cools down and unlocks the mission marker');

const bounds={minX:-100,maxX:100,minZ:-100,maxZ:100},fit=defaultCarFit(),car:CarState={x:0,z:0,yaw:0,speed:0,steer:0,distance:0,phase:'driving',time:0,blocked:0,fit};
for(let i=0;i<4*60;i++)driveStep(car,1/60,1,0,false,{color:'#294c60',pace:'standard'},[],bounds);assert.ok(car.speed>15&&car.speed<=topSpeed({color:'#294c60',pace:'standard'}));
Object.assign(car,{speed:0,blocked:0});for(let i=0;i<3*60;i++)driveStep(car,1/60,-1,0,false,{color:'#294c60',pace:'standard'},[],bounds);assert.ok(car.speed< -6);console.log('OK forward acceleration and reverse reach the raised speed caps');
