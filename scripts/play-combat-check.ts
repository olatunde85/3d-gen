/** Combat contracts exercise the real fixed-step game and geometric bullet checks. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {Catalog} from '../src/core/assets';
import {EscapeGame,type Input} from '../src/play/runtime';
import {defaultMission} from '../src/play/mission';
import {defaultProject,parseProject,resizeEnemies} from '../src/play/project';
import {defaultLoadout,makeCombatant,reload,tickCombat,spendRound,damage,hitDirection,chest,traceShot,type Point3,type Loadout} from '../src/play/combat';
import type {Volume,MotorBody} from '../src/play/motor';
import {updateEnemies} from '../src/play/enemy-ai';
import {solidVolumes} from '../src/play/mission';
import {obstacles,route,distance} from '../src/play/world';
const idle:Input={x:0,z:0,sprint:false,interact:false},armed:Loadout={...defaultLoadout(),weapon:'pistol'};let checks=0;
function check(name:string,fn:()=>void){fn();checks++;console.log('OK',name);}
function wait(g:EscapeGame,seconds:number,input:Input=idle){for(let i=0;i<seconds*60;i++)g.update(1/60,input);}
function fire(g:EscapeGame,target:Point3){g.update(1/60,{...idle,aiming:true,aim:target,fire:true});}
function body(x:number,z:number,y=0):MotorBody{return {...new EscapeGame().player,x,z,y};}
function encounter(){const g=new EscapeGame(defaultMission(),[{id:'enemy-1',aggression:'balanced'}],armed);Object.assign(g.player,{x:11,z:-8,yaw:Math.PI});Object.assign(g.guard,{x:11,z:-15,repath:Infinity,path:[]});g.start();return g;}
check('combat recipes round-trip, preserve mixed squads and reject unsupported loadouts',()=>{
 const catalog=JSON.parse(readFileSync(new URL('../public/assets/catalog.json',import.meta.url),'utf8'))as Catalog,p=defaultProject();p.loadout={weapon:'pistol',health:150,ammunition:'unlimited'};resizeEnemies(p,3);p.enemies[1].response='pistol';p.enemies[1].health=50;assert.deepEqual(parseProject(JSON.stringify(p),catalog),p);
 const {loadout,...legacy}=p,old={...legacy,enemies:p.enemies.map(({response,health,...e})=>e)};assert.equal(loadout.weapon,'pistol');const migrated=parseProject(JSON.stringify(old),catalog);assert.deepEqual(migrated.loadout,defaultLoadout());assert.ok(migrated.enemies.every(e=>e.response==='capture'&&e.health===100));
 for(const loadout of [{weapon:'shotgun'},{weapon:null},{health:0},{health:'100'},{ammunition:0},{ammunition:-12},{ammunition:'infinite'},{script:'code'}])assert.throws(()=>parseProject(JSON.stringify({...p,loadout}),catalog));
 for(const patch of [{response:'shoot'},{response:null},{health:0},{health:null}])assert.throws(()=>parseProject(JSON.stringify({...p,enemies:[{...p.enemies[0],...patch}]}),catalog));
});
check('solid cover blocks bullets, low cover can be fired over and elevation is respected',()=>{
 const shooter=body(0,4),target=body(0,-4),cover:Volume={id:'cover',minX:-1,maxX:1,minZ:-.3,maxZ:.3,h:2,climbable:true},targets=[{id:'target',body:target,alive:true}];
 assert.ok(traceShot(shooter,chest(target),[cover],targets).blocked);assert.equal(traceShot(shooter,chest(target),[{...cover,h:.4}],targets).hit,'target');
 const elevated=body(0,4,2.7);assert.equal(traceShot(elevated,chest(target),[{...cover,h:1.5}],targets).hit,'target');
 assert.ok(traceShot(shooter,chest(target),[{...cover,minZ:3.7,maxZ:4.1}],targets).blocked,'a barrel inside a wall cannot bypass it');
 const roof:Volume={...cover,minZ:-1,maxZ:5,h:2.7};assert.ok(traceShot(elevated,chest(target),[roof],targets).blocked,'a descending shot must intersect the roof before reaching the target');
});
check('the first living actor stops a bullet; dead actors do not act as invisible shields',()=>{
 const shooter=body(0,6),near=body(0,2),far=body(0,-3),targets=[{id:'near',body:near,alive:true},{id:'far',body:far,alive:true}];assert.equal(traceShot(shooter,chest(far),[],targets).hit,'near');targets[0].alive=false;assert.equal(traceShot(shooter,chest(far),[],targets).hit,'far');
});
check('pistol fire consumes ammunition, deals damage and defeats an enemy without despawning it',()=>{
 const g=encounter();for(let i=0;i<3;i++){fire(g,chest(g.guard));wait(g,.32);}assert.equal(g.guard.combat.health,0);assert.equal(g.playerCombat.magazine,9);assert.ok(g.events.some(e=>e.type==='enemy-defeated'));assert.equal(g.enemies.length,1);const position={x:g.guard.x,z:g.guard.z};wait(g,2);assert.equal(g.guard.speed,0);assert.deepEqual({x:g.guard.x,z:g.guard.z},position);assert.equal(g.status,'playing');
});
check('actual damage records a directional impact; firing and misses do not create hit reactions',()=>{
 const b=body(0,0);b.yaw=0;assert.equal(hitDirection(b,{x:0,z:5}),'front');assert.equal(hitDirection(b,{x:0,z:-5}),'back');assert.equal(hitDirection(b,{x:5,z:0}),'left');assert.equal(hitDirection(b,{x:-5,z:0}),'right');b.yaw=Math.PI/2;assert.equal(hitDirection(b,{x:5,z:0}),'front');assert.equal(hitDirection(b,{x:0,z:5}),'right');
 const c=makeCombatant(armed);spendRound(c);assert.equal(c.hitAge,Infinity);damage(c,18,'left');assert.equal(c.hitDirection,'left');assert.equal(c.hitAge,0);tickCombat(c,.4);assert.equal(c.hitAge,.4);damage(c,18,'back');assert.equal(c.hitDirection,'back');assert.equal(c.hitAge,0);
 const g=encounter();fire(g,chest(g.guard));assert.equal(g.guard.combat.hitDirection,'back');assert.equal(g.guard.combat.hitAge,0);assert.equal(g.playerCombat.hitAge,Infinity);
});
check('fire cadence is independent of refresh rate and sub-frame taps survive until a tick',()=>{
 const counts=[];for(const fps of [30,60,144]){const g=new EscapeGame(defaultMission(),undefined,armed);g.start();for(let i=0;i<fps*2;i++)g.update(1/fps,{...idle,aiming:true,aim:{x:-10,y:1.3,z:15},fire:true});counts.push(g.shots.length);}assert.equal(new Set(counts).size,1);assert.ok(counts[0]>=6&&counts[0]<=7);
 const g=encounter();g.update(1/144,{...idle,fire:true,aiming:true,aim:chest(g.guard)});g.update(1/144,{...idle,aiming:true,aim:chest(g.guard)});g.update(1/144,{...idle,aiming:true,aim:chest(g.guard)});assert.equal(g.playerCombat.magazine,11);
});
check('reload transfers only available reserve and unlimited reserve still requires reloading',()=>{
 const c=makeCombatant({...armed,ammunition:24});for(let i=0;i<12;i++){assert.ok(spendRound(c));tickCombat(c,.31);}assert.equal(c.magazine,0);assert.equal(c.reserve,12);assert.ok(reload(c));tickCombat(c,1);assert.equal(c.magazine,0);assert.equal(spendRound(c),false);tickCombat(c,1);assert.equal(c.magazine,12);assert.equal(c.reserve,0);c.magazine=0;assert.equal(reload(c),false);assert.equal(spendRound(c),false);
 const infinite=makeCombatant({...armed,ammunition:'unlimited'});infinite.magazine=0;assert.ok(reload(infinite));tickCombat(infinite,2);assert.equal(infinite.magazine,12);assert.equal(infinite.reserve,null);
});
check('empty magazines automatically reload and cannot create ammunition after reserve is exhausted',()=>{
 const g=new EscapeGame(defaultMission(),undefined,{...armed,ammunition:24});g.start();const input={...idle,aiming:true,aim:{x:-10,y:1.3,z:15},fire:true};wait(g,3.6,input);assert.ok(g.playerCombat.reload>0);assert.equal(g.playerCombat.reserve,12);wait(g,2);assert.equal(g.playerCombat.magazine,12);assert.equal(g.playerCombat.reserve,0);wait(g,4,input);wait(g,3,input);assert.equal(g.playerCombat.magazine,0);assert.equal(g.playerCombat.reserve,0);assert.equal(g.playerCombat.reload,0);
});
check('armed enemies telegraph a shot, and moving away from its aim point can dodge it',()=>{
 const g=new EscapeGame(defaultMission(),[{id:'gunner',aggression:'balanced',response:'pistol'}]);g.start();Object.assign(g.player,{x:11,z:-16});Object.assign(g.guard,{x:11,z:-8,mode:'chase',awareness:1});wait(g,.2);assert.ok(g.guard.combat.windup>0);assert.equal(g.playerCombat.health,100);Object.assign(g.player,{x:13,z:-16});wait(g,.8);assert.ok(g.shots.length>0);assert.equal(g.playerCombat.health,100);assert.equal(g.shots[0].hit,undefined);
});
check('cover and closed gates stop enemy gunfire; allies block shots without friendly damage',()=>{
 const g=new EscapeGame(defaultMission(),[{id:'gunner',aggression:'relentless',response:'pistol'}]);g.start();Object.assign(g.player,{x:0,z:-4.8});Object.assign(g.guard,{x:0,z:-8,mode:'chase',awareness:1});wait(g,4);assert.equal(g.playerCombat.health,100);assert.equal(g.shots.length,0);
 const ally=new EscapeGame(defaultMission(),[{id:'gunner',aggression:'relentless',response:'pistol'},{id:'ally',aggression:'balanced'}]);ally.start();Object.assign(ally.player,{x:11,z:-16});Object.assign(ally.enemies[0],{x:11,z:-8,mode:'chase',awareness:1});Object.assign(ally.enemies[1],{x:11,z:-12,repath:Infinity,path:[]});wait(ally,.6);assert.equal(ally.playerCombat.health,100);assert.equal(ally.enemies[1].combat.health,100);assert.equal(ally.shots.length,0);
});
check('gunfire defeat consumes one life and retry restores health and a safe squad',()=>{
 const g=new EscapeGame(defaultMission(),[{id:'gunner',aggression:'relentless',response:'pistol'}],{...armed,health:50});g.start();Object.assign(g.player,{x:11,z:-15});Object.assign(g.guard,{x:11,z:-8,mode:'chase',awareness:1});wait(g,5);assert.equal(g.failure,'defeated');assert.equal(g.playerCombat.health,0);assert.equal(g.remainingLives,2);const shots=g.shots.length;wait(g,3);assert.equal(g.shots.length,shots);assert.ok(g.retry());assert.equal(g.playerCombat.health,50);assert.equal(g.guard.combat.health,100);assert.equal(g.playerCombat.reload,0);assert.ok(g.protection>0);
});
check('armed squad members maneuver past an ally to find a clear firing line',()=>{
 const g=new EscapeGame(defaultMission(),[{id:'rear',aggression:'balanced',response:'pistol'},{id:'front',aggression:'balanced',response:'pistol'}]),rects=obstacles(1,g.world.blocks),volumes=solidVolumes(g.world,1);Object.assign(g.player,{x:11,z:-16});Object.assign(g.enemies[0],{x:11,z:-8,mode:'chase',awareness:1});Object.assign(g.enemies[1],{x:11,z:-12,mode:'chase',awareness:1});
 for(let i=0;i<480;i++)updateEnemies({dt:1/60,player:g.player,enemies:g.enemies,patrol:g.world.patrol,volumes,rects,emit:()=>{}});
 const shot=traceShot(g.enemies[0],chest(g.player),volumes,[{id:'player',body:g.player,alive:true},{id:'front',body:g.enemies[1],alive:true}]);assert.equal(shot.hit,'player');assert.ok(Math.hypot(g.enemies[0].x-11,g.enemies[0].z+8)>2,'rear guard must leave its blocked starting position');
});
check('checkpoint retries restore ammunition and defeated enemies as one consistent encounter',()=>{
 const g=new EscapeGame({...defaultMission(),plan:'timed'},[{id:'enemy-1',aggression:'balanced'}],armed);g.start();Object.assign(g.player,{x:11,z:-8});Object.assign(g.guard,{x:11,z:-15,repath:Infinity,path:[]});for(let i=0;i<3;i++){fire(g,chest(g.guard));wait(g,.32);}assert.equal(g.guard.combat.health,0);
 const position={x:g.guard.x,y:g.guard.y,z:g.guard.z};Object.assign(g.player,g.world.checkpoints.key);g.update(1/60,{...idle,interact:true});wait(g,2.3);assert.equal(g.checkpoint?.stage,'key');const ammo=g.playerCombat.magazine;fire(g,{x:-10,y:1.3,z:15});assert.equal(g.playerCombat.magazine,ammo-1);g.time=89.99;g.update(1/60,idle);assert.ok(g.retry());assert.equal(g.playerCombat.magazine,ammo);assert.equal(g.guard.combat.health,0);assert.deepEqual({x:g.guard.x,y:g.guard.y,z:g.guard.z},position);assert.equal(g.playerCombat.health,g.playerCombat.maxHealth);
});
check('interactions and traversal suppress gunfire; focus release discards buffered shots',()=>{
 const g=encounter();g.action={kind:'key',time:0,done:false,approach:false};fire(g,chest(g.guard));assert.equal(g.playerCombat.magazine,12);g.action=undefined;Object.assign(g.player,{x:0,z:9.3,yaw:Math.PI});g.update(1/60,{...idle,jump:true});assert.ok(g.traversal);fire(g,chest(g.guard));assert.equal(g.playerCombat.magazine,12);
 const fresh=encounter();fresh.update(1/144,{...idle,fire:true,aiming:true,aim:chest(fresh.guard)});fresh.releaseCombat();fresh.update(1/144,idle);fresh.update(1/144,idle);assert.equal(fresh.playerCombat.magazine,12);
});
check('firing ends respawn protection and raises the alarm in the quiet mission',()=>{
 const g=new EscapeGame({...defaultMission(),plan:'quiet'},undefined,armed);g.start();g.protection=3;fire(g,{x:-10,y:1.3,z:15});assert.equal(g.protection,0);assert.equal(g.failure,'alarm');assert.equal(g.remainingLives,2);assert.equal(g.playerCombat.magazine,11);assert.ok(g.retry());assert.equal(g.playerCombat.magazine,12);
});
check('a complete armed escape can collect the key, open the gate, defeat a gunner and reach extraction',()=>{
 const g=new EscapeGame(defaultMission(),[{id:'gunner',aggression:'balanced',response:'pistol'}],armed);g.start();
 const go=(goal:{x:number;z:number})=>{let limit=1800;while(distance(g.player,goal)>.15&&g.status==='playing'&&limit-->0){const path=route(g.player,goal,obstacles(g.door,g.world.blocks),g.player.radius+.025);assert.ok(path.length);const p=path.length>1&&distance(g.player,path[0])<.25?path[1]:path[0],d=distance(g.player,p);g.update(1/60,{...idle,x:(p.x-g.player.x)/d,z:(p.z-g.player.z)/d,sprint:true});}assert.ok(limit>0);};
 go({x:g.world.key.x,z:g.world.key.z+.8});g.update(1/60,{...idle,interact:true});wait(g,3);assert.ok(g.hasKey);go({x:.84,z:-4.9});g.update(1/60,{...idle,interact:true});wait(g,2.7);assert.equal(g.door,1);go({x:0,z:-9});
 for(let i=0;i<3;i++){fire(g,chest(g.guard));wait(g,.32);}assert.equal(g.guard.combat.health,0,JSON.stringify({status:g.status,player:g.player,enemy:{x:g.guard.x,z:g.guard.z},shots:g.shots}));go({x:0,z:-9});go({x:1,z:-15});go(g.world.exit);assert.equal(g.status,'won',JSON.stringify(g.events));assert.equal(g.playerCombat.magazine,9);assert.ok(g.playerCombat.health>0);assert.equal(g.retry(),false);
});
console.log(`${checks} combat contracts passed.`);
