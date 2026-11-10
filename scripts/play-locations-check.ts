/** Location contracts and complete scenario loops through the shared game simulation. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EscapeGame,type Input} from '../src/play/runtime';
import {defaultMission,createMission,missionObstacles,solidVolumes,parseMission,type MissionSettings} from '../src/play/mission';
import {defaultLoadout,chest,traceShot} from '../src/play/combat';
import {defaultProgression,placePickups} from '../src/play/progression';
import {defaultProject,parseProject} from '../src/play/project';
import type {Catalog} from '../src/core/assets';
import {enemyStarts} from '../src/play/enemies';
import {blocked,clearPath,distance,route,doorRect,type Point} from '../src/play/world';
import {motorStep} from '../src/play/motor';
const idle:Input={x:0,z:0,sprint:false,interact:false};let checks=0;
function check(name:string,fn:()=>void){fn();checks++;console.log('OK',name);}
function tick(g:EscapeGame,seconds:number,input:Input=idle){for(let i=0;i<seconds*60;i++)g.update(1/60,input);}
function walk(g:EscapeGame,to:Point,limit=90,escort=false){
 for(let i=0;i<limit*60&&g.status==='playing';i++){
  if(distance(g.player,to)<.22)return;
  const rects=missionObstacles(g.world,g.door),path=route(g.player,to,rects,g.player.radius+.025,g.world.bounds);assert.ok(path.length,'reachable destination');let point=path[0];if(path.length>1&&distance(g.player,point)<.3)point=path[1];
  const gap=distance(g.player,point),friend=g.companion,wait=escort&&friend&&distance(friend,g.player)>3.2;g.update(1/60,{...idle,x:wait?0:(point.x-g.player.x)/gap,z:wait?0:(point.z-g.player.z)/gap,sprint:!escort});
 }assert.ok(distance(g.player,to)<1.7||g.status==='won',`route did not finish: ${JSON.stringify({p:g.player,to,status:g.status,friend:g.companion})}`);
}
check('old recipes retain the depot; new locations and scenarios validate independently',()=>{
 const catalog=JSON.parse(readFileSync(new URL('../public/assets/catalog.json',import.meta.url),'utf8'))as Catalog,p=defaultProject();assert.deepEqual(parseProject(JSON.stringify(p),catalog),p);assert.equal(createMission(p.mission).location,'depot');
 p.mission={...p.mission,story:'clear',location:'military-base'};p.loadout.weapon='pistol';assert.deepEqual(parseProject(JSON.stringify(p),catalog),p);
 for(const location of ['invented',null,[],1])assert.throws(()=>parseMission({location}));assert.throws(()=>parseMission({story:'clear',plan:'quiet'}));
 for(const weapon of ['loadout','objective']as const)assert.throws(()=>new EscapeGame(p.mission,undefined,defaultLoadout(),100,{...defaultProgression(),weapon}));
 assert.doesNotThrow(()=>new EscapeGame(p.mission,undefined,defaultLoadout(),100,{...defaultProgression(),weapon:'pickup'}));
});
check('all 54 arrangements reserve clear cast, objective and supply routes within their own bounds',()=>{
 for(const location of ['depot','military-base']as const)for(const story of ['escape','rescue','clear']as const)for(const layout of ['balanced','open','dense']as const)for(let variation=0;variation<3;variation++){
  const w=createMission({...defaultMission(),location,story,layout,variation}),rects=missionObstacles(w,1),starts=enemyStarts(w,5);assert.equal(starts.length,5);
  for(const p of [w.start,w.exit,w.key,w.rescue.captive,...w.patrol,...starts]){assert.ok(p.x>w.bounds.minX&&p.x<w.bounds.maxX&&p.z>w.bounds.minZ&&p.z<w.bounds.maxZ);assert.equal(blocked(p,.52,rects),false);}
  for(const p of [...starts,w.exit])assert.ok(route(w.start,p,rects,.52,w.bounds).length);
  for(const weapon of ['loadout','pickup']as const){const supplies=placePickups(w,{...defaultProgression(),weapon,supplies:'plentiful'});assert.equal(supplies.length,weapon==='pickup'?7:6);for(const p of supplies){assert.equal(blocked(p,.85,rects),false);assert.ok(route(w.start,p,rects,.52,w.bounds).length);}}
  assert.deepEqual(missionObstacles(w,0).at(-1),doorRect(0,w.gate));assert.deepEqual(solidVolumes(w,0).at(-1),{...doorRect(0,w.gate),h:2.3,id:'gate',climbable:false});
 }
});
check('military navigation and player movement extend beyond the old depot limits',()=>{
 const w=createMission({...defaultMission(),location:'military-base'}),rects=missionObstacles(w,1),body={...new EscapeGame().player,x:18,z:17};assert.ok(route(body,w.exit,rects,.52,w.bounds).length);
 for(let i=0;i<240;i++)motorStep(body,.075,0,1/60,solidVolumes(w,1),false,w.bounds);assert.ok(body.x>20&&body.x<22);assert.ok(body.z>16);assert.equal(blocked(body,body.radius,rects),false);
 const path=route(w.start,w.exit,rects,.52,w.bounds);let p=w.start;for(const q of path){assert.ok(clearPath(p,q,rects,.52));p=q;}
});
check('five-enemy military patrols keep moving through every cover layout',()=>{
 for(const layout of ['balanced','open','dense']as const){
  const g=new EscapeGame({...defaultMission(),location:'military-base',layout},Array.from({length:5},(_,i)=>({id:'enemy-'+i,aggression:'balanced' as const})));g.start();g.protection=Infinity;const travelled=g.enemies.map(()=>0);
  for(let i=0;i<30*60;i++){g.update(1/60,idle);g.enemies.forEach((e,j)=>{travelled[j]+=e.speed/60;assert.equal(blocked(e,e.radius,missionObstacles(g.world,g.door)),false);});}
  assert.ok(travelled.every(d=>d>5),`${layout}: a patrol member stopped moving: ${travelled}`);
 }
});
check('extraction cannot complete before every enemy is defeated, regardless of key or gate state',()=>{
 const g=new EscapeGame({...defaultMission(),story:'clear',location:'military-base'},undefined,{...defaultLoadout(),weapon:'pistol'});g.start();Object.assign(g.player,g.world.exit);tick(g,.1);assert.equal(g.status,'playing');assert.equal(g.extractionReady,false);assert.equal(g.canInteract,false);assert.equal(g.hasKey,false);assert.equal(g.door,1);g.enemies.forEach(e=>e.combat.health=0);tick(g,.1);assert.equal(g.status,'won');assert.equal(g.objectivesCompleted,2);assert.equal(g.totalObjectives,2);
});
check('actual pistol combat clears squads and extraction completes on both locations',()=>{
 for(const location of ['depot','military-base']as const)for(const count of [1,3,5]){
  const g=new EscapeGame({...defaultMission(),story:'clear',location},Array.from({length:count},(_,i)=>({id:'enemy-'+i,aggression:'cautious' as const,response:'pistol' as const})),{...defaultLoadout(),weapon:'pistol',health:150,ammunition:'unlimited'},100,{...defaultProgression(),scoring:'action'});g.start();
  for(let i=0;i<240*60&&!g.cleared&&g.status==='playing';i++){
   const living=g.enemies.filter(e=>e.combat.health>0).sort((a,b)=>distance(a,g.player)-distance(b,g.player)),volumes=solidVolumes(g.world,g.door),target=living.find(e=>traceShot(g.player,chest(e),volumes,g.shotTargets()).hit===e.id&&distance(e,g.player)<20);
   if(target)g.update(1/60,{...idle,aiming:true,fire:true,aim:chest(target)});
   else{const point=route(g.player,living[0],missionObstacles(g.world,g.door),g.player.radius+.03,g.world.bounds)[0];assert.ok(point);const gap=distance(g.player,point);g.update(1/60,{...idle,x:(point.x-g.player.x)/gap,z:(point.z-g.player.z)/gap,sprint:true});}
  }
  assert.equal(g.status,'playing',`${location}/${count}: ${g.failure}`);assert.equal(g.remainingEnemies,0);assert.ok(g.shots.length);assert.equal(g.checkpoint?.stage,'clear');assert.equal(g.rewards.filter(r=>r.id==='clear').length,1);walk(g,g.world.exit);assert.equal(g.status,'won');assert.equal(g.objectivesCompleted,2);assert.ok(g.score>=1800+count*100);
 }
});
check('clear checkpoints restore defeated squads and resources atomically; timed failure consumes one life',()=>{
 const g=new EscapeGame({...defaultMission(),story:'clear',location:'military-base',plan:'timed'},undefined,{...defaultLoadout(),weapon:'pistol',grenades:5});g.start();g.grenades=3;g.playerCombat.magazine=8;g.enemies.forEach(e=>e.combat.health=0);tick(g,.1);assert.equal(g.checkpoint?.stage,'clear');const score=g.score;g.grenades=1;g.playerCombat.magazine=1;g.time=90;tick(g,.1);assert.equal(g.failure,'time');assert.equal(g.remainingLives,2);assert.ok(g.retry());assert.equal(g.cleared,true);assert.equal(g.hasKey,false);assert.equal(g.grenades,3);assert.equal(g.playerCombat.magazine,8);assert.equal(g.score,score);assert.equal(g.remainingEnemies,0);assert.ok(distance(g.player,g.world.checkpoints.clear)<.01,'retry uses the secured rally point');walk(g,g.world.exit);assert.equal(g.status,'won');assert.equal(g.rewards.filter(r=>r.id==='clear').length,1);
});
check('checkpoints off restarts the squad, and Find a pistol works before the first encounter',()=>{
 const g=new EscapeGame({...defaultMission(),story:'clear',location:'military-base',plan:'timed',checkpoints:'off'},undefined,defaultLoadout(),100,{...defaultProgression(),weapon:'pickup'});g.start();const pistol=g.pickups.find(p=>p.kind==='pistol')!;walk(g,pistol);assert.equal(g.playerCombat.weapon,'pistol');g.enemies.forEach(e=>e.combat.health=0);tick(g,.1);g.time=90;tick(g,.1);assert.ok(g.retry());assert.equal(g.remainingEnemies,1);assert.equal(g.playerCombat.weapon,'none');assert.equal(g.collected.size,0);assert.equal(g.score,0);
});
check('military escape and rescue retain their full grounded objective loops',()=>{
 for(const story of ['escape','rescue']as const){
  const mission:MissionSettings={...defaultMission(),location:'military-base',story},g=new EscapeGame(mission);g.start();g.enemies.forEach(e=>e.combat.health=0);
  if(story==='escape'){walk(g,g.world.checkpoints.key);g.update(1/60,{...idle,interact:true});tick(g,2);assert.ok(g.hasKey);walk(g,g.world.checkpoints.gate);g.update(1/60,{...idle,interact:true});tick(g,2.5);assert.equal(g.door,1);}
  else{walk(g,g.world.rescue.approach);g.update(1/60,{...idle,interact:true});tick(g,2);assert.ok(g.companion?.rescued);}
  walk(g,g.world.exit,120,story==='rescue');tick(g,5);assert.equal(g.status,'won');assert.equal(g.objectivesCompleted,g.totalObjectives);
 }
});
console.log(`${checks} location/scenario contracts passed.`);
