/** Progression exercises real mission geometry, pickup use, objective timing and atomic retries. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {Catalog} from '../src/core/assets';
import {EscapeGame,type Input} from '../src/play/runtime';
import {defaultMission,createMission} from '../src/play/mission';
import {defaultLoadout,chest} from '../src/play/combat';
import {defaultProject,parseProject,heroWeapon} from '../src/play/project';
import {defaultProgression,parseProgression,placePickups,MAX_RESERVE,type ProgressionSettings} from '../src/play/progression';
import {blocked,clearPath,distance,obstacles,route} from '../src/play/world';
const idle:Input={x:0,z:0,sprint:false,interact:false};let checks=0;
function check(name:string,fn:()=>void){fn();checks++;console.log('OK',name);}
function wait(g:EscapeGame,seconds:number,input:Input=idle){for(let i=0;i<seconds*60;i++)g.update(1/60,input);}
function game(p:Partial<ProgressionSettings>={},armed=false){const g=new EscapeGame({...defaultMission(),plan:'timed',lives:'unlimited'},undefined,{...defaultLoadout(),weapon:armed?'pistol':'none'},100,{...defaultProgression(),...p});g.start();g.protection=Infinity;return g;}
function take(g:EscapeGame,kind:'health'|'ammo'|'pistol'){const p=g.pickups.find(p=>p.kind===kind&&!g.collected.has(p.id))!;assert.ok(p);Object.assign(g.player,p,{y:0,grounded:true});g.update(1/60,idle);return p;}
function objective(g:EscapeGame,kind:'key'|'gate'|'rescue'){Object.assign(g.player,g.world.checkpoints[kind],{y:0,grounded:true});g.update(1/60,{...idle,interact:true});wait(g,2.4);assert.equal(g.status,'playing');}
function fail(g:EscapeGame){g.time=89.99;g.update(1/60,idle);assert.equal(g.status,'caught');}
check('progression recipes round-trip, migrate older setups and reject ambiguous equipment',()=>{
 const catalog=JSON.parse(readFileSync(new URL('../public/assets/catalog.json',import.meta.url),'utf8'))as Catalog;
 for(const weapon of ['loadout','pickup','objective']as const)for(const supplies of ['scarce','balanced','plentiful']as const)for(const scoring of ['off','objectives','action']as const){const p=defaultProject();p.progression={weapon,supplies,scoring};assert.deepEqual(parseProject(JSON.stringify(p),catalog),p);assert.equal(heroWeapon(p),weapon==='loadout'?'none':'pistol');}
 const {progression,...old}=defaultProject();assert.deepEqual(parseProject(JSON.stringify(old),catalog).progression,progression);
 for(const raw of [null,[],{weapon:'rifle'},{supplies:'random'},{scoring:1},{scoring:null},{points:10}])assert.throws(()=>parseProgression(raw));
 const p=defaultProject();p.loadout.weapon='pistol';p.progression.weapon='pickup';assert.throws(()=>parseProject(JSON.stringify(p),catalog));
});
check('all 162 story/layout/arrangement/supply/equipment combinations place reachable separated supplies',()=>{
 for(const story of ['escape','rescue']as const)for(const layout of ['balanced','open','dense']as const)for(let variation=0;variation<3;variation++){
  const world=createMission({...defaultMission(),story,layout,variation}),open=obstacles(1,world.blocks);
  for(const supplies of ['scarce','balanced','plentiful']as const)for(const weapon of ['loadout','pickup','objective']as const){
   const p={...defaultProgression(),supplies,weapon},items=placePickups(world,p),n={scarce:2,balanced:4,plentiful:6}[supplies];assert.equal(items.length,n+Number(weapon==='pickup'));assert.equal(items.filter(p=>p.kind==='health').length,n/2);assert.deepEqual(placePickups(world,p),items,'deterministic placement');
   for(const item of items){assert.ok(!blocked(item,.85,open));assert.ok(route(world.start,item,open,.52).length,'ground route with a large actor');assert.ok(distance(item,world.start)>1.9);for(const other of items)if(other!==item)assert.ok(distance(item,other)>2.1);}
   const gun=items.find(p=>p.kind==='pistol');if(gun)assert.ok(clearPath(world.start,gun,obstacles(story==='rescue'?1:0,world.blocks),.52),'weapon is accessible before unlocking the gate');
  }
 }
});
check('walking over the pistol unlocks the existing loadout without changing health or awarding farmable points',()=>{
 const g=game({weapon:'pickup'});g.playerCombat.health=64;assert.equal(g.playerCombat.weapon,'none');const gun=g.pickups.find(p=>p.kind==='pistol')!;
 for(let i=0;i<120&&g.playerCombat.weapon==='none';i++)g.update(1/60,{...idle,z:-1});
 assert.equal(g.playerCombat.weapon,'pistol');assert.equal(g.playerCombat.health,64);assert.equal(g.playerCombat.magazine,12);assert.equal(g.playerCombat.reserve,36);assert.ok(g.collected.has(gun.id));assert.equal(g.score,0);
 g.playerCombat.magazine=3;Object.assign(g.player,gun);wait(g,.3);assert.equal(g.playerCombat.magazine,3,'cannot reacquire the same gun');
});
check('health packs stay when full, cap at maximum and can only be consumed once',()=>{
 const g=game(),p=take(g,'health');assert.ok(!g.collected.has(p.id));g.playerCombat.health=90;g.update(1/60,idle);assert.equal(g.playerCombat.health,100);assert.ok(g.collected.has(p.id));g.playerCombat.health=50;wait(g,.5);assert.equal(g.playerCombat.health,50);
});
check('ammunition waits for a weapon, respects unlimited reserve, caps finite reserves and supports reload',()=>{
 for(const ammo of [24,'unlimited']as const){const g=new EscapeGame({...defaultMission(),plan:'timed'},undefined,{weapon:'pistol',health:100,ammunition:ammo});g.start();g.protection=Infinity;g.playerCombat.magazine=0;g.playerCombat.reserve=ammo==='unlimited'?null:MAX_RESERVE-5;const p=take(g,'ammo');assert.equal(g.playerCombat.magazine,0);assert.equal(g.playerCombat.reserve,ammo==='unlimited'?null:MAX_RESERVE);assert.equal(g.collected.has(p.id),ammo!=='unlimited');g.update(1/60,{...idle,reload:true});wait(g,2);assert.equal(g.playerCombat.magazine,12);}
 const g=game(),p=take(g,'ammo');assert.ok(!g.collected.has(p.id));assert.equal(g.playerCombat.reserve,0);
});
check('collection cannot pass through the gate, occur on roofs, during interactions or after failure',()=>{
 const g=game({},true),p=g.pickups.find(p=>p.kind==='health')!;p.x=0;p.z=-6.4;Object.assign(g.player,{x:0,z:-5.6});g.playerCombat.health=50;g.update(1/60,idle);assert.equal(g.playerCombat.health,50,'gate blocks pickup');
 Object.assign(p,{x:-10,z:11});Object.assign(g.player,{x:-10,z:11,y:2.7,grounded:true});g.update(1/60,idle);assert.ok(!g.collected.has(p.id));
 Object.assign(g.player,{y:0});g.action={kind:'key',time:0,done:false,approach:false};g.update(1/60,idle);assert.ok(!g.collected.has(p.id));g.action=undefined;Object.assign(g.player,{x:-8,z:11});fail(g);Object.assign(g.player,p);g.update(1/60,idle);assert.ok(!g.collected.has(p.id));
});
check('key and rescue objectives unlock a pistol at completion and preserve checkpoint equipment',()=>{
 for(const story of ['escape','rescue']as const){const g=new EscapeGame({...defaultMission(),story,plan:'timed'},undefined,defaultLoadout(),100,{...defaultProgression(),weapon:'objective'});g.start();g.protection=Infinity;assert.equal(g.playerCombat.weapon,'none');const kind=story==='escape'?'key':'rescue';objective(g,kind);assert.equal(g.playerCombat.weapon,'pistol');assert.equal(g.score,story==='escape'?250:600);assert.equal(g.checkpoint?.weapon,'pistol');assert.equal(g.objectivesCompleted,1);fail(g);assert.ok(g.retry());assert.equal(g.playerCombat.weapon,'pistol');assert.equal(g.score,story==='escape'?250:600);}
});
check('checkpoint restores points, equipped weapon and consumed supplies atomically without duplicating rewards',()=>{
 const g=game({weapon:'pickup'}),gun=take(g,'pistol');g.playerCombat.health=50;const health=take(g,'health');objective(g,'key');const saved=g.checkpoint!;assert.equal(g.score,250);assert.ok(saved.collected.includes(gun.id)&&saved.collected.includes(health.id));assert.ok(Object.isFrozen(saved.rewards[0]));
 const ammo=take(g,'ammo');assert.ok(g.collected.has(ammo.id));g.playerCombat.magazine=1;fail(g);assert.ok(g.retry());assert.equal(g.score,250);assert.deepEqual([...g.collected],saved.collected);assert.ok(!g.collected.has(ammo.id));assert.equal(g.playerCombat.magazine,saved.ammo.magazine);assert.equal(g.playerCombat.weapon,'pistol');
 for(let i=0;i<2;i++){g.protection=Infinity;Object.assign(g.player,g.world.checkpoints.key);g.update(1/60,{...idle,interact:true});wait(g,.3);assert.equal(g.score,250);fail(g);assert.ok(g.retry());}
 g.protection=Infinity;objective(g,'gate');assert.equal(g.score,600);assert.equal(g.checkpoint?.stage,'gate');fail(g);assert.ok(g.retry());assert.equal(g.score,600);
});
check('without a checkpoint retries reset items, score and weapon unlock while total time and retries stay cumulative',()=>{
 const g=new EscapeGame({...defaultMission(),plan:'timed',checkpoints:'off'},undefined,defaultLoadout(),100,{...defaultProgression(),weapon:'pickup'});g.start();g.protection=Infinity;take(g,'pistol');objective(g,'key');assert.equal(g.score,250);fail(g);const elapsed=g.elapsed;assert.ok(g.retry());assert.equal(g.score,0);assert.equal(g.collected.size,0);assert.equal(g.playerCombat.weapon,'none');assert.equal(g.elapsed,elapsed);assert.equal(g.attempts,2);
});
check('only Action scoring awards enemy defeats; missed shots and repeated hits do not duplicate rewards',()=>{
 for(const scoring of ['off','objectives','action']as const){const g=game({scoring},true);Object.assign(g.player,{x:11,z:-8});Object.assign(g.guard,{x:11,z:-14,repath:Infinity,path:[]});g.guard.combat.health=50;
  for(let i=0;i<4;i++){g.update(1/60,{...idle,aiming:true,aim:chest(g.guard),fire:true});wait(g,.32);}
  assert.equal(g.guard.combat.health,0);assert.equal(g.score,scoring==='action'?100:0);assert.equal(g.rewards.filter(r=>r.kind==='combat').length,1);assert.equal(g.objectivesCompleted,0);
 }
});
check('completion shows objective rewards and bounded bonuses; scoring off still tracks objectives',()=>{
 for(const scoring of ['off','objectives','action']as const){const g=game({scoring});g.guard.combat.health=0;objective(g,'key');objective(g,'gate');g.elapsed=40;g.attempts=3;Object.assign(g.player,g.world.exit);g.update(1/60,idle);assert.equal(g.status,'won');assert.equal(g.objectivesCompleted,3);assert.equal(g.totalObjectives,3);assert.equal(g.score,scoring==='off'?0:1920);const score=g.score;wait(g,3);assert.equal(g.score,score);assert.equal(g.retry(),false);}
});
console.log(`${checks} progression contracts passed.`);
