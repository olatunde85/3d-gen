/** Multi-enemy contracts: recipes, starts, independent senses, hearing, spacing and capture. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {Catalog} from '../src/core/assets';
import {defaultProject,parseProject,resizeEnemies} from '../src/play/project';
import {MAX_ENEMIES,enemyStarts,type EnemyRole} from '../src/play/enemies';
import {EscapeGame} from '../src/play/runtime';
import {updateEnemies} from '../src/play/enemy-ai';
import {createMission,defaultMission,solidVolumes} from '../src/play/mission';
import {blocked,distance,obstacles,route} from '../src/play/world';
const idle={x:0,z:0,sprint:false,interact:false},roles=(n:number):EnemyRole[]=>Array.from({length:n},(_,i)=>({id:`enemy-${i+1}`,aggression:'balanced'}));
const catalog=JSON.parse(readFileSync(new URL('../public/assets/catalog.json',import.meta.url),'utf8'))as Catalog;let checks=0;
function check(name:string,fn:()=>void){fn();checks++;console.log('OK',name);}
check('squad recipes round-trip and migrate old single-enemy files',()=>{const p=defaultProject();resizeEnemies(p,3);p.enemies[1].character.name='Second guard';p.enemies[1].aggression='relentless';assert.deepEqual(parseProject(JSON.stringify(p),catalog),p);const {enemies,...base}=p,legacy={...base,version:1,enemy:enemies[1].character};assert.deepEqual(parseProject(JSON.stringify(legacy),catalog).enemies[0].character,enemies[1].character);const {enemy,...oldest}=legacy;assert.equal(parseProject(JSON.stringify(oldest),catalog).enemies.length,1);assert.equal(parseProject(JSON.stringify(oldest),catalog).enemies[0].character.name,'The Soldier');});
check('aggression replaces legacy pursuit without retaining a hidden speed setting',()=>{
 const p=defaultProject(),{enemies,...base}=p,legacy={...base,version:1,enemy:enemies[0].character,difficulty:'relaxed'};
 const migrated=parseProject(JSON.stringify(legacy),catalog);assert.equal(migrated.enemies[0].aggression,'cautious');assert.ok(!Object.hasOwn(migrated,'difficulty'));
 assert.deepEqual(parseProject(JSON.stringify({...p,difficulty:'relaxed'}),catalog),p,'explicit squad aggression takes precedence in older version 2 recipes');
});
check('counts and IDs are bounded; individual characters stay independent',()=>{const p=defaultProject();resizeEnemies(p,5);assert.equal(new Set(p.enemies.map(e=>e.id)).size,5);p.enemies[2].character.height=.1;assert.notEqual(p.enemies[0].character.height,.1);const id=p.enemies[0].id;resizeEnemies(p,2);resizeEnemies(p,4);assert.equal(p.enemies[0].id,id);assert.equal(p.enemies[3].character.height,p.enemies[0].character.height);for(const n of [0,6,1.5])assert.throws(()=>resizeEnemies(p,n));for(const enemies of [[],Array(6).fill(p.enemies[0]),[p.enemies[0],p.enemies[0]],[{...p.enemies[0],aggression:'impossible'}],[{...p.enemies[0],id:'player'}]])assert.throws(()=>parseProject(JSON.stringify({...p,enemies}),catalog));});
check('up to five enemies get clear, separated starts in every arrangement',()=>{for(const layout of ['balanced','open','dense']as const)for(let variation=0;variation<3;variation++){const world=createMission({...defaultMission(),layout,variation}),starts=enemyStarts(world,MAX_ENEMIES),rects=obstacles(0,world.blocks);assert.equal(starts.length,5);for(const [i,p]of starts.entries()){assert.ok(!blocked(p,.55,rects));for(const q of starts.slice(i+1))assert.ok(distance(p,q)>=2.5);}}});
check('a guard near a container corner recovers and resumes its patrol',()=>{
 const game=new EscapeGame(defaultMission(),roles(3));game.start();const enemy=game.enemies[2],rects=obstacles(0,game.world.blocks),position={x:3.84,z:-9.65};
 Object.assign(enemy,position,{patrol:1,repath:0,path:[]});assert.ok(!blocked(enemy,enemy.radius,rects));assert.equal(route(enemy,game.world.patrol[1],rects,enemy.radius+.04).length,0,'reproduce the stranded position');
 for(let i=0;i<600;i++){game.update(1/60,idle);assert.ok(!blocked(enemy,enemy.radius,rects));}
 assert.equal(enemy.mode,'patrol');assert.ok(distance(enemy,position)>3,'enemy must leave the corner');
});
check('three- and five-member patrols keep moving through every layout with mixed body sizes',()=>{
 for(const count of [3,5])for(const layout of ['balanced','open','dense']as const)for(let variation=0;variation<3;variation++){
  const game=new EscapeGame({...defaultMission(),layout,variation},roles(count)),rects=obstacles(0,game.world.blocks);game.enemies.forEach((e,i)=>e.radius=[.28,.38,.48][i%3]);game.start();let travelled=Array(count).fill(0);const reached=Array(count).fill(0),previous=game.enemies.map(e=>e.patrol);
  for(let i=0;i<3600;i++){
   game.update(1/60,idle);game.enemies.forEach((e,j)=>{travelled[j]+=e.speed/60;if(e.patrol!==previous[j]){reached[j]++;previous[j]=e.patrol;}assert.ok(!blocked(e,e.radius,rects));for(const other of game.enemies.slice(j+1))assert.ok(distance(e,other)>=e.radius+other.radius-.001);});
   if((i+1)%900===0){assert.ok(travelled.every(d=>d>3),`${count} enemies, ${layout}, arrangement ${variation}: patrol stalled (${travelled})`);travelled=Array(count).fill(0);}
  }
  assert.ok(reached.every(n=>n>=3),`${count} enemies, ${layout}, arrangement ${variation}: every patrol must complete its circuit (${reached})`);
 }
});
check('an enemy other than the lead can detect and catch the player',()=>{const game=new EscapeGame(defaultMission(),roles(3));game.start();Object.assign(game.guard,{x:-10,z:-8.5,repath:Infinity});const second=game.enemies[1];game.player.x=second.x+.7;game.player.z=second.z;second.mode='chase';second.awareness=1;game.update(1/60,idle);assert.equal(game.status,'caught');assert.equal(game.failure,'caught');assert.ok(game.enemies.every(e=>e.speed===0));});
check('awareness belongs to each enemy and the HUD threat can be a secondary enemy',()=>{const game=new EscapeGame(defaultMission(),roles(2));game.start();Object.assign(game.guard,{x:-10,z:-8.5,repath:Infinity});const second=game.enemies[1];second.repath=Infinity;game.player.x=second.x+1.5;game.player.z=second.z;for(let i=0;i<30;i++)game.update(1/60,idle);assert.equal(game.guard.awareness,0);assert.ok(second.awareness>.5);assert.equal(game.threat.id,second.id);});
check('nearby enemies hear an alert without receiving instant full awareness',()=>{const game=new EscapeGame(defaultMission(),roles(3));game.start();Object.assign(game.enemies[0],{x:0,z:-8,awareness:1});Object.assign(game.enemies[1],{x:-5,z:-8});Object.assign(game.enemies[2],{x:-12,z:-8});Object.assign(game.player,{x:0,z:-9});game.update(1/60,idle);assert.equal(game.enemies[0].mode,'chase');assert.equal(game.enemies[1].mode,'investigate');assert.ok(game.enemies[1].awareness<.1);assert.equal(game.enemies[2].mode,'patrol');});
check('aggression changes detection speed and any enemy can raise the quiet alarm',()=>{const values=[];for(const aggression of ['cautious','relentless']as const){const game=new EscapeGame(defaultMission(),[{id:'enemy-1',aggression}]);game.start();Object.assign(game.guard,{x:0,z:-8,repath:Infinity});Object.assign(game.player,{x:0,z:-9.4});for(let i=0;i<24;i++)game.update(1/60,idle);values.push(game.awareness);}assert.ok(values[1]>values[0]*1.5);const quiet=new EscapeGame({...defaultMission(),plan:'quiet'},roles(3));quiet.start();quiet.enemies[2].mode='chase';quiet.update(1/60,idle);assert.equal(quiet.failure,'alarm');});
check('aggression alone determines each enemy chase speed',()=>{
 for(const [aggression,speed]of [['cautious',2.8],['balanced',3.65],['relentless',4]]as const){
  const game=new EscapeGame(defaultMission(),[{id:'enemy-1',aggression}]),enemy=game.guard,rects=obstacles(1,game.world.blocks),volumes=solidVolumes(game.world,1);
  Object.assign(enemy,{x:11,z:-8,mode:'chase',awareness:1});Object.assign(game.player,{x:11,z:-16});
  for(let i=0;i<60;i++)updateEnemies({dt:1/60,player:game.player,enemies:game.enemies,patrol:game.world.patrol,volumes,rects,emit:()=>{}});
  assert.ok(Math.abs(distance(enemy,{x:11,z:-8})-speed)<.01,`${aggression} chase speed`);
 }
});
check('five pursuing enemies navigate solid cargo without overlapping each other',()=>{const game=new EscapeGame(defaultMission(),roles(5)),rects=obstacles(1,game.world.blocks),volumes=solidVolumes(game.world,1),player={...game.player,x:0,z:-8,y:4};for(const e of game.enemies){e.mode='chase';e.lastKnown={x:player.x,z:player.z};e.awareness=1;}
 const initial=game.enemies.map(e=>distance(e,player));for(let i=0;i<1200;i++){updateEnemies({dt:1/60,player,enemies:game.enemies,patrol:game.world.patrol,volumes,rects,emit:()=>{}});for(const [j,e]of game.enemies.entries()){assert.ok(!blocked(e,e.radius,rects));for(const other of game.enemies.slice(j+1))assert.ok(distance(e,other)>=e.radius+other.radius-.001,'overlapping enemies');}}
 assert.ok(game.enemies.every((e,i)=>distance(e,player)<initial[i]-1),'each enemy should make progress');
});
console.log(`${checks} squad contracts passed.`);
