import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EscapeGame,type Input} from '../src/play/runtime';
import {defaultMission,solidVolumes} from '../src/play/mission';
import {defaultLoadout,parseLoadout} from '../src/play/combat';
import {defaultProgression} from '../src/play/progression';
import {defaultProject,parseProject} from '../src/play/project';
import type {Catalog} from '../src/core/assets';
import {GRENADE,advanceGrenade,safeLaunch,predictGrenade,blastDamage,type Grenade} from '../src/play/grenades';
import type {Volume} from '../src/play/motor';
const idle:Input={x:0,z:0,sprint:false,interact:false};let checks=0;
function check(name:string,fn:()=>void){fn();checks++;console.log('OK',name);}
function wait(g:EscapeGame,seconds:number,input:Input=idle){for(let i=0;i<seconds*60;i++)g.update(1/60,input);}
function game(){const g=new EscapeGame(defaultMission(),undefined,{...defaultLoadout(),weapon:'pistol',grenades:5},100,{...defaultProgression(),scoring:'action'});g.start();for(const e of g.enemies)Object.assign(e,{x:11,z:-15,repath:Infinity,path:[]});return g;}
const wall:Volume={id:'wall',minX:-1,maxX:1,minZ:-.1,maxZ:.1,h:3,climbable:true};
check('grenade inventory is strict, optional for older games and portable as JSON',()=>{
 assert.equal(parseLoadout({}).grenades,undefined);
 for(const n of [null,-1,1,3,99,'2',true])assert.throws(()=>parseLoadout({grenades:n}));
 const p=defaultProject();p.loadout.grenades=5;const catalog=JSON.parse(readFileSync(new URL('../public/assets/catalog.json',import.meta.url),'utf8'))as Catalog;assert.deepEqual(parseProject(JSON.stringify(p),catalog),p);
});
check('prediction exactly matches live fixed-step flight, including bounces and fuse',()=>{
 const g=game(),volumes=solidVolumes(g.world,g.door),target={x:-9,y:0,z:4},prediction=predictGrenade(g.player,target,volumes),live=safeLaunch(g.player,target,volumes);
 while(live.age<GRENADE.fuse-1e-7)advanceGrenade(live,1/60,volumes);
 assert.deepEqual(live.position,prediction.landing);assert.ok(live.position.y>=GRENADE.radius-.001);assert.ok(Math.hypot(live.position.x-g.player.x,live.position.z-g.player.z)<GRENADE.maxRange);
});
check('swept collisions stop fast grenades at thin walls, roofs and the floor',()=>{
 const g:Grenade={id:1,position:{x:0,y:1,z:1},velocity:{x:0,y:0,z:-200},age:0};advanceGrenade(g,1/60,[wall]);assert.ok(g.position.z>.1,'must bounce on the near face instead of tunnelling');assert.ok(g.velocity.z>0);
 const top:Grenade={id:2,position:{x:0,y:3.2,z:0},velocity:{x:0,y:-50,z:0},age:0};advanceGrenade(top,1/60,[wall]);assert.ok(top.position.y>wall.h);assert.ok(top.velocity.y>0);
 const floor:Grenade={id:3,position:{x:2,y:.06,z:0},velocity:{x:0,y:-10,z:0},age:0};advanceGrenade(floor,1/60,[]);assert.ok(floor.position.y>=GRENADE.radius);
});
check('reaching a hand through cover never launches a grenade on the far side',()=>{
 const body={...game().player,x:0,z:.45},target={x:0,y:0,z:-5},g=safeLaunch(body,target,[wall]);
 assert.ok(g.position.z>wall.maxZ+GRENADE.radius);advanceGrenade(g,1/60,[wall]);assert.ok(g.position.z>wall.maxZ+GRENADE.radius);assert.ok(g.velocity.z>0);
});
check('full cover shields a blast, partial cover reduces damage and elevation matters',()=>{
 const b={...game().player,x:0,z:-1.6},origin={x:0,y:.06,z:1.6};assert.ok(blastDamage(origin,b,[])>0);assert.equal(blastDamage(origin,b,[wall]),0);
 const low=blastDamage(origin,b,[{...wall,h:.45}]);assert.ok(low>0&&low<blastDamage(origin,b,[]));assert.equal(blastDamage(origin,{...b,z:-20},[]),0);assert.equal(blastDamage(origin,{...b,y:8},[]),0);
});
check('one inventory item is committed per throw, release follows the clip and guns are suppressed',()=>{
 const g=game(),target={x:-9,y:0,z:4};g.update(1/144,{...idle,throwGrenade:true,aim:target});g.update(1/144,idle);g.update(1/144,idle);assert.equal(g.grenades,4);assert.equal(g.projectiles.length,0);
 wait(g,.6,{...idle,fire:true,aiming:true,aim:target,throwGrenade:true,jump:true,interact:true});assert.equal(g.grenades,4);assert.equal(g.playerCombat.magazine,12);assert.equal(g.player.grounded,true);assert.ok(g.throwing);
 wait(g,.3);assert.equal(g.projectiles.length,1);assert.ok(g.throwing?.released);wait(g,1.5);assert.equal(g.throwing,undefined);wait(g,1.4);assert.equal(g.projectiles.length,0);assert.equal(g.explosions.length,1);assert.equal(g.grenades,4);assert.equal(g.playerCombat.weapon,'pistol');
});
check('invalid targets and busy/airborne/reloading actors cannot spend grenades',()=>{
 for(const patch of [{aim:{x:NaN,y:0,z:0}},{aim:undefined}]){const g=game();g.update(1/60,{...idle,throwGrenade:true,...patch});assert.equal(g.grenades,5);}
 const g=game();g.playerCombat.reload=1;g.update(1/60,{...idle,throwGrenade:true,aim:{x:0,y:0,z:0}});assert.equal(g.grenades,5);g.playerCombat.reload=0;g.player.grounded=false;g.player.y=1;g.update(1/60,{...idle,throwGrenade:true,aim:{x:0,y:0,z:0}});assert.equal(g.grenades,5);
});
check('focus release cancels a buffered tap and an empty inventory cannot throw',()=>{
 const g=game();g.update(1/144,{...idle,throwGrenade:true,aim:{x:-9,y:0,z:4}});g.releaseCombat();wait(g,.1);assert.equal(g.grenades,5);assert.equal(g.throwing,undefined);
 g.grenades=0;g.update(1/60,{...idle,throwGrenade:true,aim:{x:-9,y:0,z:4}});assert.equal(g.grenades,0);assert.equal(g.throwing,undefined);assert.equal(g.projectiles.length,0);
});
check('blast damage produces reactions, unique defeat rewards and enemy investigation',()=>{
 const g=game();Object.assign(g.player,{x:11,z:10});Object.assign(g.guard,{x:11,z:-12});g.projectiles.push({id:1,position:{x:11,y:.06,z:-12.7},velocity:{x:0,y:0,z:0},age:GRENADE.fuse});wait(g,1/60);assert.equal(g.guard.combat.health,0);assert.equal(g.guard.combat.hitAge,0);assert.equal(g.score,100);
 g.projectiles.push({id:2,position:{x:11,y:.06,z:-12.7},velocity:{x:0,y:0,z:0},age:GRENADE.fuse});wait(g,1/60);assert.equal(g.score,100);
 const h=game();h.projectiles.push({id:1,position:{x:11,y:.06,z:-11.3},velocity:{x:0,y:0,z:0},age:GRENADE.fuse});wait(h,1/60);assert.ok(h.guard.combat.health>0&&h.guard.combat.health<100);assert.equal(h.guard.mode,'investigate');assert.equal(h.guard.combat.hitAge,0);
});
check('self damage consumes one life; retry restores inventory and removes all ordnance',()=>{
 const g=game();g.grenades=1;g.projectiles.push({id:1,position:{x:g.player.x,y:.06,z:g.player.z},velocity:{x:0,y:0,z:0},age:GRENADE.fuse});wait(g,1/60);assert.equal(g.failure,'defeated');assert.equal(g.remainingLives,2);assert.ok(g.retry());assert.equal(g.grenades,5);assert.equal(g.projectiles.length,0);assert.equal(g.explosions.length,0);assert.equal(g.throwing,undefined);assert.equal(g.score,0);
});
check('checkpoint restores spent inventory atomically and never saves a live grenade',()=>{
 const g=game();g.grenades=3;g.hasKey=true;g.projectiles.push({id:1,position:{x:11,y:.06,z:5},velocity:{x:0,y:0,z:0},age:0});wait(g,.1);assert.equal(g.checkpoint,undefined);g.projectiles.length=0;wait(g,1/60);assert.equal((g as EscapeGame).checkpoint?.grenades,3);g.grenades=1;g.projectiles.push({id:2,position:{x:g.player.x,y:.06,z:g.player.z},velocity:{x:0,y:0,z:0},age:GRENADE.fuse});wait(g,1/60);assert.ok(g.retry());assert.equal(g.grenades,3);assert.equal(g.hasKey,true);
});
check('explosions end quiet missions and can hurt a rescue companion',()=>{
 const quiet=new EscapeGame({...defaultMission(),plan:'quiet'},undefined,{...defaultLoadout(),grenades:2});quiet.start();quiet.projectiles.push({id:1,position:{x:11,y:.06,z:8},velocity:{x:0,y:0,z:0},age:GRENADE.fuse});wait(quiet,1/60);assert.equal(quiet.failure,'alarm');
 const rescue=new EscapeGame({...defaultMission(),story:'rescue'},undefined,{...defaultLoadout(),grenades:2});rescue.start();const c=rescue.companion!;rescue.projectiles.push({id:1,position:{x:c.x,y:.06,z:c.z},velocity:{x:0,y:0,z:0},age:GRENADE.fuse});wait(rescue,1/60);assert.equal(rescue.failure,'companion-defeated');
});
check('flight, consumption and explosion timing are consistent at 30 / 60 / 144 Hz',()=>{
 const results=[];for(const fps of [30,60,144]){const g=game();g.update(1/fps,{...idle,throwGrenade:true,aim:{x:-9,y:0,z:4}});for(let i=1;i<fps*4;i++)g.update(1/fps,idle);results.push({grenades:g.grenades,explosions:g.explosions});}assert.deepEqual(results[0],results[1]);assert.deepEqual(results[1],results[2]);
});
console.log(`${checks} grenade contracts passed.`);
