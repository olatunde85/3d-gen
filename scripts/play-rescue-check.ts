/** Rescue story: complete escorts, physical navigation, protection and saved encounters. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {Catalog} from '../src/core/assets';
import {EscapeGame,type Input} from '../src/play/runtime';
import {defaultMission,parseMission} from '../src/play/mission';
import {defaultProject,defaultCompanion,parseProject} from '../src/play/project';
import {chest,defaultLoadout} from '../src/play/combat';
import {blocked,distance,obstacles,route,type Point} from '../src/play/world';
import {enemyVolume} from '../src/play/enemy-ai';
const idle:Input={x:0,z:0,sprint:false,interact:false};let checks=0;
function check(name:string,fn:()=>void){if(process.argv[2]&&!name.includes(process.argv[2]))return;fn();checks++;console.log('OK',name);}
function game(){const g=new EscapeGame({...defaultMission(),story:'rescue'});g.guard.combat.health=0;g.start();return g;}
function wait(g:EscapeGame,seconds:number,input:Input=idle){for(let i=0;i<seconds*60;i++)g.update(1/60,input);}
function free(g:EscapeGame){Object.assign(g.player,g.world.rescue.approach,{y:0,vy:0,grounded:true});g.update(1/60,{...idle,interact:true});wait(g,2.5);assert.equal(g.companion?.rescued,true,JSON.stringify({status:g.status,events:g.events,action:g.action}));}
function safeTick(g:EscapeGame,input:Input){const c=g.companion!,old={x:c.x,z:c.z};g.update(1/60,input);assert.ok(distance(old,c)<=4.7/60+1e-6,'companion must never warp');assert.equal(c.y,0);assert.ok(!blocked(c,c.radius,obstacles(g.door,g.world.blocks)),'companion entered solid cargo');}
function go(g:EscapeGame,goal:Point){let limit=3600;while(distance(g.player,goal)>.15&&g.status==='playing'&&limit-->0){const rects=obstacles(g.door,g.world.blocks),c=g.companion!;if(c.combat.health>0)rects.push(enemyVolume(c));let path=route(g.player,goal,rects,g.player.radius+.025);if(!path.length)path=route(g.player,goal,rects,g.player.radius);assert.ok(path.length,'hero needs a route');const p=path.length>1&&distance(g.player,path[0])<.25?path[1]:path[0],d=distance(g.player,p);safeTick(g,{...idle,x:(p.x-g.player.x)/d,z:(p.z-g.player.z)/d,sprint:true});}assert.ok(limit>0,JSON.stringify({error:'hero stuck',hero:g.player,companion:g.companion}));}
check('rescue recipes migrate old games and preserve companion appearance/health',()=>{
 const catalog=JSON.parse(readFileSync(new URL('../public/assets/catalog.json',import.meta.url),'utf8'))as Catalog,p=defaultProject();p.mission.story='rescue';p.companion.health=150;p.companion.character.name='My partner';assert.deepEqual(parseProject(JSON.stringify(p),catalog),p);
 const {companion,...old}=defaultProject();assert.equal(companion.health,100);assert.deepEqual(parseProject(JSON.stringify(old),catalog).companion,defaultCompanion());assert.equal(parseMission({plan:'timed'}).story,'escape');
 for(const patch of [{health:0},{health:null},{character:{outfit:'invented'}},{weapon:'pistol'}])assert.throws(()=>parseProject(JSON.stringify({...p,companion:{...p.companion,...patch}}),catalog));assert.throws(()=>parseMission({story:'invented'}));assert.throws(()=>parseMission({story:['rescue']}));assert.throws(()=>parseProject(JSON.stringify({...p,enemies:[{...p.enemies[0],id:'companion'}]}),catalog));
});
check('every rescue arrangement reserves clear space for both characters and five enemies',()=>{
 for(const layout of ['balanced','open','dense']as const)for(let variation=0;variation<3;variation++){
  const g=new EscapeGame({...defaultMission(),story:'rescue',layout,variation},Array.from({length:5},(_,i)=>({id:`enemy-${i}`,aggression:'balanced'}))),c=g.companion!,rects=obstacles(1,g.world.blocks);assert.equal(g.door,1);assert.ok(!g.hasKey);assert.ok(!blocked(c,.52,rects));assert.ok(route(c,g.world.exit,rects,.52).length);for(const e of g.enemies){assert.ok(distance(e,c)>=4);assert.ok(distance(e,g.world.rescue.approach)>=4);}
 }
});
check('freeing requires proximity and a finished interaction; reaching extraction alone cannot win',()=>{
 const g=game();wait(g,1);assert.equal(g.status,'playing');g.update(1/60,{...idle,interact:true});assert.equal(g.action,undefined);assert.equal(g.companion!.rescued,false);Object.assign(g.player,g.world.rescue.approach);assert.ok(g.canInteract);g.update(1/60,{...idle,interact:true});wait(g,1);assert.equal(g.companion!.rescued,false);assert.equal(Boolean(g.checkpoint),false);wait(g,1.5);assert.equal(g.companion!.rescued,true);assert.equal(g.checkpoint?.stage,'rescue');
 g.companion!.waiting=true;Object.assign(g.player,g.world.exit);wait(g,2);assert.equal(g.status,'playing','both characters must arrive');
});
check('the companion can be freed from different reachable sides without walking through them',()=>{
 for(const radius of [.28,.48])for(const [x,z]of [[-1.4,0],[1.4,0],[0,-1.4],[0,1.4]]){
  const g=game(),c=g.companion!;g.player.radius=radius;c.radius=radius;Object.assign(g.player,{x:c.x+x,z:c.z+z});assert.ok(g.canInteract);g.update(1/60,{...idle,interact:true});wait(g,3);assert.ok(c.rescued,JSON.stringify({radius,x,z,action:g.action}));assert.ok(distance(g.player,c)>=radius*2-.03);
 }
});
check('complete escorts navigate every layout in both body-size combinations without teleporting',()=>{
 for(const layout of ['balanced','open','dense']as const)for(let variation=0;variation<3;variation++)for(const [hero,companion]of [[.28,.48],[.48,.28]]){
  const g=new EscapeGame({...defaultMission(),story:'rescue',layout,variation}),c=g.companion!;g.guard.combat.health=0;g.player.radius=hero;c.radius=companion;g.start();go(g,g.world.rescue.approach);g.update(1/60,{...idle,interact:true});wait(g,2.5);assert.ok(c.rescued);go(g,g.world.exit);for(let i=0;i<900&&g.status==='playing';i++)safeTick(g,idle);assert.equal(g.status,'won',JSON.stringify({layout,variation,hero,companion,player:g.player,friend:c}));assert.ok(distance(c,g.world.exit)<2.2);assert.ok(g.events.some(e=>e.type==='rescued'));
 }
});
check('wait/follow orders are local, preserve physical position and can be resumed',()=>{
 const g=game();free(g);const c=g.companion!,position={x:c.x,z:c.z};g.update(1/60,{...idle,interact:true});assert.ok(c.waiting);go(g,{x:-12,z:-8});wait(g,2);assert.equal(distance(c,position),0);g.update(1/60,{...idle,interact:true});assert.ok(c.waiting,'distant commands cannot toggle companion');go(g,g.world.rescue.approach);g.update(1/60,{...idle,interact:true});assert.equal(c.waiting,false);go(g,{x:-12,z:-8});wait(g,2);assert.ok(distance(c,position)>2);
});
check('a companion waits below elevated players and resumes on a clear ground route',()=>{
 const g=game();free(g);const c=g.companion!,position={x:c.x,z:c.z};Object.assign(g.player,{x:-5,z:-1.5,y:1.3,grounded:true});wait(g,2);assert.equal(c.state,'ground');assert.equal(distance(c,position),0);Object.assign(g.player,{x:-9,z:-2,y:0,grounded:true});wait(g,2);assert.ok(distance(c,position)>2);assert.equal(c.y,0);
});
check('a closed gate blocks the escort and opening a route lets them continue',()=>{
 const g=game();free(g);const c=g.companion!,position={x:c.x,z:c.z};Object.assign(g.player,{x:-10,z:10});g.door=0;g.opening=false;wait(g,2);assert.equal(c.state,'blocked');assert.equal(distance(c,position),0);g.door=1;wait(g,2);assert.ok(distance(c,position)>2);
});
check('captive companions are ignored by enemies and player bullets never cause friendly damage',()=>{
 const g=new EscapeGame({...defaultMission(),story:'rescue'},undefined,{...defaultLoadout(),weapon:'pistol'});g.start();const c=g.companion!;Object.assign(g.guard,{x:c.x,z:c.z+1,repath:Infinity,path:[]});wait(g,.5);assert.equal(g.guard.awareness,0);assert.equal(g.guard.target,'player');assert.equal(c.combat.health,100);g.guard.combat.health=0;Object.assign(g.player,{x:c.x,z:c.z+3});g.update(1/60,{...idle,aiming:true,aim:chest(c),fire:true});assert.equal(g.shots.at(-1)?.hit,'companion');assert.equal(c.combat.health,100);free(g);g.update(1/60,{...idle,aiming:true,aim:chest(c),fire:true});assert.equal(c.combat.health,100);
});
check('a released companion can be detected and captured, using exactly one life',()=>{
 const g=game();free(g);const c=g.companion!;g.guard.combat.health=100;Object.assign(g.player,g.world.start);Object.assign(g.guard,{x:c.x+.6,z:c.z,mode:'chase',awareness:1,target:'companion'});g.update(1/60,idle);assert.equal(g.failure,'companion-captured');assert.equal(g.remainingLives,2);wait(g,2);assert.equal(g.remainingLives,2);assert.ok(g.retry());assert.ok(c.rescued);assert.equal(c.combat.health,100);assert.ok(g.protection>0);assert.equal(g.hasKey,false);assert.equal(g.door,1);
});
check('armed enemies can target and defeat the companion while the hero is elsewhere',()=>{
 const g=new EscapeGame({...defaultMission(),story:'rescue',layout:'open'},[{id:'gunner',aggression:'balanced',response:'pistol'}],defaultLoadout(),50);g.start();free(g);const c=g.companion!;c.waiting=true;Object.assign(g.player,g.world.start);Object.assign(g.guard,{x:c.x,z:c.z+6,mode:'chase',awareness:1,target:'companion'});wait(g,5);assert.equal(g.failure,'companion-defeated');assert.equal(g.guard.target,'companion');assert.equal(c.combat.health,0);assert.equal(g.playerCombat.health,100);assert.equal(g.remainingLives,2);assert.ok(g.retry());assert.equal(c.combat.health,50);assert.ok(c.rescued);assert.equal(c.waiting,false);
});
check('rescue checkpoints restore both bodies, saved ammunition, timer and enemy progress safely',()=>{
 for(const layout of ['balanced','open','dense']as const)for(let variation=0;variation<3;variation++){
  const g=new EscapeGame({...defaultMission(),story:'rescue',plan:'timed',layout,variation},Array.from({length:5},(_,i)=>({id:`enemy-${i}`,aggression:'balanced'})),undefined,150),c=g.companion!;g.enemies.forEach(e=>e.combat.health=0);g.player.radius=.48;c.radius=.48;c.height=2.2;c.animationScale=1.2;g.start();free(g);const saved=g.checkpoint!;c.combat.health=18;g.time=89.99;g.update(1/60,idle);assert.equal(g.failure,'time');assert.ok(g.retry());assert.equal(g.time,saved.time);assert.equal(c.combat.health,150);assert.equal(c.radius,.48);assert.equal(c.height,2.2);assert.equal(c.animationScale,1.2);assert.equal(c.rescued,true);assert.ok(g.enemies.every(e=>e.combat.health===0));assert.ok(!blocked(c,c.radius,obstacles(1,g.world.blocks)));assert.ok(distance(c,g.player)>=.96);assert.equal(g.door,1);
 }
});
check('checkpoints Off resets the captive and quiet missions include companion detection',()=>{
 const g=new EscapeGame({...defaultMission(),story:'rescue',checkpoints:'off',plan:'timed'});g.guard.combat.health=0;g.start();free(g);assert.equal(Boolean(g.checkpoint),false);g.time=89.99;g.update(1/60,idle);assert.ok(g.retry());assert.equal(g.companion!.rescued,false);assert.equal(g.door,1);assert.equal(g.hasKey,false);
 const quiet=new EscapeGame({...defaultMission(),story:'rescue',plan:'quiet'});quiet.guard.combat.health=0;quiet.start();free(quiet);quiet.guard.combat.health=100;Object.assign(quiet.player,quiet.world.start);Object.assign(quiet.guard,{x:quiet.companion!.x+.8,z:quiet.companion!.z,mode:'chase',awareness:1,target:'companion'});quiet.update(1/60,idle);assert.equal(quiet.failure,'alarm');assert.equal(quiet.remainingLives,2);
});
check('a live pursuing guard can be escaped while rescuing and escorting the companion',()=>{
 const g=new EscapeGame({...defaultMission(),story:'rescue'});g.start();go(g,g.world.rescue.approach);assert.equal(g.status,'playing',JSON.stringify(g.events));g.update(1/60,{...idle,interact:true});wait(g,2.5);assert.ok(g.companion!.rescued);go(g,g.world.exit);for(let i=0;i<900&&g.status==='playing';i++)safeTick(g,idle);assert.equal(g.status,'won',JSON.stringify({events:g.events,companion:g.companion,hero:g.player}));assert.ok(g.guard.combat.health>0);
});
console.log(`${checks} rescue contracts passed.`);
