import assert from 'node:assert/strict';
import {EscapeGame,type Input} from '../src/play/runtime';
import {defaultMission,parseMission,usesPickup,missionGoal,missionObstacles} from '../src/play/mission';
import {defaultLoadout} from '../src/play/combat';
import {passengerEntryClear,carObstacle,driverStand,passengerStand,carLocal,carTouchesPerson} from '../src/play/driving';
import {distance,route,type Point} from '../src/play/world';
import {enemyVolume} from '../src/play/enemy-ai';
const idle:Input={x:0,z:0,sprint:false,interact:false};let checks=0;
const check=(name:string,fn:()=>void)=>{fn();console.log('OK',name);checks++;};
function tick(g:EscapeGame,seconds:number,input:Input=idle){for(let i=0;i<seconds*60&&g.status==='playing';i++)g.update(1/60,input);}
function game(patch:Partial<ReturnType<typeof defaultMission>>={}){const g=new EscapeGame({...defaultMission(),story:'rescue',extraction:'pickup',...patch},undefined,{...defaultLoadout(),grenades:2});g.start();g.enemies.forEach(e=>e.combat.health=0);return g;}
function free(g:EscapeGame){Object.assign(g.player,g.world.rescue.approach);g.update(1/60,{...idle,interact:true});tick(g,2.8);assert.ok(g.companion?.rescued);assert.ok(g.hasKey);assert.equal(g.checkpoint?.stage,'rescue');}
function walk(g:EscapeGame,to:Point){let limit=8000,path:Point[]=[],repath=0;while(distance(g.player,to)>.13&&limit-->0&&g.status==='playing'){
 if(repath--<=0){const rects=[...missionObstacles(g.world,g.door),carObstacle(g.car!),...(g.companion&&!g.companion.riding&&distance(g.companion,to)>1?[enemyVolume(g.companion)]:[])];path=route(g.player,to,rects,g.player.radius+.02,g.world.bounds);repath=12;assert.ok(path.length,JSON.stringify({from:g.player,to,friend:g.companion}));}
 while(path.length>1&&distance(g.player,path[0])<.18)path.shift();const target=path[0]??to,n=distance(g.player,target);g.update(1/60,{...idle,x:(target.x-g.player.x)/Math.max(.01,n),z:(target.z-g.player.z)/Math.max(.01,n),sprint:true});
 }assert.ok(distance(g.player,to)<.2,JSON.stringify({to,player:g.player,friend:g.companion}));tick(g,.25);}
function board(g:EscapeGame){assert.ok(g.canInteract,JSON.stringify({prompt:g.prompt,friend:g.companion,player:g.player}));g.update(1/60,{...idle,interact:true});for(let i=0;i<1200&&!g.readyToDrive&&g.status==='playing';i++)g.update(1/60,idle);assert.ok(g.readyToDrive,JSON.stringify({prompt:g.prompt,friend:g.companion,car:g.car}));assert.equal(g.car!.phase,'driving');assert.equal(g.checkpoint?.stage,'vehicle');}
function extract(g:EscapeGame){for(let i=0;i<20*60&&g.status==='playing';i++){const d=distance(g.car!,g.world.exit);g.update(1/60,{...idle,throttle:d>3?1:.2,brake:d<g.car!.speed*g.car!.speed/22+.8});}assert.equal(g.status,'won',JSON.stringify({car:g.car,friend:g.companion,exit:g.world.exit}));assert.equal(g.objectivesCompleted,3);}
check('objective and extraction compose without changing legacy projects',()=>{
 assert.equal(usesPickup(parseMission({story:'getaway'})),true);assert.equal(missionGoal(parseMission({story:'getaway'})),'escape');assert.equal(usesPickup(parseMission({story:'rescue'})),false);
 for(const story of ['escape','rescue','clear']as const)for(const extraction of ['foot','pickup']as const){const mission=parseMission({story,extraction});assert.equal(usesPickup(mission),extraction==='pickup');}
 for(const m of [{extraction:'boat'},{extraction:null},{story:'getaway',extraction:'foot'},{story:'rescue',extraction:'pickup',plan:'quiet'}])assert.throws(()=>parseMission(m));
});
check('all 18 rescue pickup arrangements support real escort, opposite-door boarding and full extraction',()=>{
 for(const location of ['depot','military-base']as const)for(const layout of ['balanced','open','dense']as const)for(let variation=0;variation<3;variation++){
  const g=game({location,layout,variation});assert.ok(g.car&&g.companion);assert.equal(g.door,1);assert.equal(g.extractionReady,false);free(g);walk(g,driverStand(g.car!));board(g);const start={x:g.car!.x,z:g.car!.z};assert.ok(distance(start,g.world.getaway!.pickup)<.01);extract(g);assert.equal(g.companion!.riding!.phase,'seated');assert.ok(distance(g.companion!,g.player)<2);
 }
});
check('boarding waits for a following companion and never drives away during entry',()=>{
 const g=game();free(g);Object.assign(g.player,driverStand(g.car!));assert.equal(g.canInteract,false,'companion is too far away');Object.assign(g.companion!,{x:2.4,z:13,waiting:true});assert.equal(g.canInteract,false);g.companion!.waiting=false;assert.ok(g.canInteract);g.update(1/60,{...idle,interact:true});const start={x:g.car!.x,z:g.car!.z};for(let i=0;i<90;i++){if(g.companion!.riding?.phase==='seated')break;g.update(1/60,{...idle,throttle:1});assert.ok(distance(start,g.car!)<1e-8,'truck remains parked until passenger is seated');}tick(g,8);assert.ok(g.readyToDrive);
});
check('passenger entry and exit require clear doors, and alighting preserves the shared truck',()=>{
 const g=game();free(g);walk(g,driverStand(g.car!));const e=g.guard;Object.assign(e,passengerStand(g.car!));e.combat.health=100;assert.equal(g.canInteract,false);e.combat.health=0;board(g);e.combat.health=100;assert.equal(g.canInteract,false,'passenger exit is blocked');e.combat.health=0;const parked=JSON.stringify({x:g.car!.x,z:g.car!.z,yaw:g.car!.yaw});g.update(1/60,{...idle,interact:true});tick(g,1.2);assert.equal(g.car!.phase,'parked');assert.equal(g.companion!.riding,undefined);assert.equal(g.companion!.grounded,true);assert.equal(g.companion!.y,0);assert.ok(!carTouchesPerson(g.car!,g.car!.fit,g.companion!));assert.equal(JSON.stringify({x:g.car!.x,z:g.car!.z,yaw:g.car!.yaw}),parked);board(g);assert.equal(g.rewards.filter(r=>r.id==='vehicle').length,1);
});
check('checkpoints advance from rescue to both aboard and restore a safe pair of door positions',()=>{
 const g=game();free(g);const rescue=g.checkpoint!;assert.equal(rescue.stage,'rescue');walk(g,driverStand(g.car!));g.companion!.combat.health=63;board(g);const saved=g.checkpoint!;assert.equal(saved.companion!.health,63);tick(g,.5,{...idle,throttle:1});g.mission.plan='timed';g.time=90;tick(g,.1);assert.equal(g.status,'caught');assert.ok(g.retry());assert.ok(g.companion!.rescued&&g.hasKey);assert.equal(g.companion!.combat.health,63);assert.equal(g.car!.phase,'parked');assert.equal(g.companion!.riding,undefined);assert.ok(!carTouchesPerson(g.car!,g.car!.fit,g.companion!));assert.ok(distance(g.player,g.companion!)>g.player.radius+g.companion!.radius);assert.equal(g.objectivesCompleted,2);board(g);assert.equal(g.objectivesCompleted,2);
 const fresh=game({checkpoints:'off'});Object.assign(fresh.companion!,{rescued:true});fresh.hasKey=true;fresh.mission.plan='timed';fresh.time=90;tick(fresh,.1);assert.ok(fresh.retry());assert.equal(fresh.companion!.rescued,false);assert.equal(fresh.hasKey,false);
});
check('clear-and-drive unlocks the same pickup only after the entire squad is defeated',()=>{
 for(const location of ['depot','military-base']as const){const g=new EscapeGame({...defaultMission(),story:'clear',extraction:'pickup',location},undefined,{...defaultLoadout(),weapon:'pistol'});g.start();Object.assign(g.player,driverStand(g.car!));assert.equal(g.hasKey,false);assert.equal(g.canInteract,false);g.enemies.forEach(e=>e.combat.health=0);tick(g,.1);assert.ok(g.hasKey&&g.cleared);assert.equal(g.checkpoint?.stage,'clear');board(g);extract(g);}
});
check('a guest seated before a delayed driver can wait without being reset or teleported',()=>{
 const g=game();free(g);walk(g,driverStand(g.car!));board(g);g.car!.phase='parked';Object.assign(g.player,driverStand(g.car!));const seat={x:g.companion!.x,z:g.companion!.z};assert.ok(g.canInteract);g.update(1/60,{...idle,interact:true});tick(g,1.4);assert.ok(g.readyToDrive);assert.ok(distance(g.companion!,seat)<.001);assert.equal(g.companion!.riding!.phase,'seated');
});
check('a passenger cannot alight beyond the playable perimeter',()=>{
 const g=game({location:'military-base'});free(g);walk(g,driverStand(g.car!));board(g);g.car!.x=g.world.bounds.maxX-2;assert.equal(passengerEntryClear(g.car!,g.companion!.radius,[],[],g.world.bounds),false);assert.equal(g.canInteract,false);
});
check('extraction requires the living rescued passenger aboard, including after parking at an angle',()=>{
 const g=game({location:'military-base'});free(g);Object.assign(g.car!,{yaw:Math.PI/4});Object.assign(g.player,driverStand(g.car!));Object.assign(g.companion!,{x:g.car!.x+4,z:g.car!.z-4});board(g);const local=carLocal(g.car!,g.companion!);assert.ok(Math.abs(local.x-g.car!.fit.passenger!.seat.x)<.001);g.companion!.riding=undefined;g.companion!.waiting=true;Object.assign(g.player,g.world.exit);Object.assign(g.car!,g.world.exit);tick(g,.1);assert.equal(g.status,'playing');assert.equal(g.extractionReady,false);
});
console.log(`${checks} composed extraction contracts passed.`);
