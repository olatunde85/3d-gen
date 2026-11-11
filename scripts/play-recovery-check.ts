/** Lives, checkpoint restoration, safe squad respawns and retry boundaries. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {Catalog} from '../src/core/assets';
import {EscapeGame,RESPAWN_PROTECTION,type Input} from '../src/play/runtime';
import {defaultMission,parseMission,type Lives} from '../src/play/mission';
import {defaultProject,parseProject} from '../src/play/project';
import {blocked,distance,obstacles,route} from '../src/play/world';
const idle:Input={x:0,z:0,sprint:false,interact:false};let checks=0;
function check(name:string,fn:()=>void){fn();checks++;console.log('OK',name);}
function wait(game:EscapeGame,seconds:number){for(let i=0;i<seconds*60;i++)game.update(1/60,idle);}
function complete(game:EscapeGame,kind:'key'|'gate'){
 Object.assign(game.player,game.world.checkpoints[kind],{y:0,vy:0,grounded:true,speed:0});game.update(1/60,{...idle,interact:true});wait(game,2.3);
 assert.equal(game.status,'playing',JSON.stringify(game.events));
}
function catchPlayer(game:EscapeGame,index=0){const enemy=game.enemies[index];Object.assign(game.player,{x:enemy.x,z:enemy.z,y:0,vy:0,grounded:true});enemy.mode='chase';enemy.awareness=1;game.update(1/60,idle);assert.equal(game.status,'caught');}
check('lives and checkpoints validate, save and migrate missing mission choices',()=>{
 const catalog=JSON.parse(readFileSync(new URL('../public/assets/catalog.json',import.meta.url),'utf8'))as Catalog;
 for(const lives of [1,3,5,'unlimited']as Lives[])for(const checkpoints of ['off','auto']as const){const p=defaultProject();Object.assign(p.mission,{lives,checkpoints});assert.deepEqual(parseProject(JSON.stringify(p),catalog),p);}
 const {lives,checkpoints,...old}=defaultMission();assert.equal(lives,3);assert.equal(checkpoints,'auto');assert.deepEqual(parseMission(old),defaultMission());
 for(const raw of [{lives:0},{lives:2},{lives:'3'},{lives:null},{checkpoints:'anywhere'},{checkpoints:true},{checkpoints:['auto']}])assert.throws(()=>parseMission(raw));
});
check('one capture consumes exactly one life and retries cannot mint extra attempts',()=>{
 const game=new EscapeGame();game.start();assert.equal(game.retry(),false);catchPlayer(game);assert.equal(game.remainingLives,2);wait(game,5);assert.equal(game.remainingLives,2);assert.equal(game.attempts,1);
 assert.equal(game.retry(),true);assert.equal(game.retry(),false);assert.equal(game.remainingLives,2);assert.equal(game.attempts,2);assert.equal(game.status,'playing');assert.equal(game.protection,RESPAWN_PROTECTION);
});
check('finite lives reach game over and a new run restores the configured allowance',()=>{
 for(const lives of [1,3,5]as const){const game=new EscapeGame({...defaultMission(),lives});game.start();for(let i=0;i<lives;i++){game.protection=0;catchPlayer(game);assert.equal(game.remainingLives,lives-i-1);assert.equal(game.canRetry,i<lives-1);if(game.canRetry)assert.ok(game.retry());}assert.equal(game.retry(),false);const fresh=new EscapeGame(game.mission);assert.equal(fresh.remainingLives,lives);assert.equal(fresh.checkpoint,undefined);assert.equal(fresh.attempts,1);}
});
check('unlimited lives still count attempts without reaching game over',()=>{
 const game=new EscapeGame({...defaultMission(),lives:'unlimited'});game.start();for(let i=0;i<12;i++){game.protection=0;catchPlayer(game);assert.equal(game.remainingLives,null);assert.ok(game.retry());}assert.equal(game.attempts,13);
});
check('key and gate checkpoints save only after completed interactions',()=>{
 const game=new EscapeGame();game.start();Object.assign(game.player,game.world.checkpoints.key);game.update(1/60,{...idle,interact:true});wait(game,1);assert.ok(game.hasKey);assert.equal(Boolean(game.checkpoint),false);wait(game,1);assert.equal(game.checkpoint?.stage,'key');
 Object.assign(game.player,game.world.checkpoints.gate);game.update(1/60,{...idle,interact:true});wait(game,1.1);assert.ok(game.opening);assert.equal(game.checkpoint?.stage,'key');wait(game,1.2);assert.equal(game.checkpoint?.stage,'gate');assert.equal(game.door,1);assert.ok(Object.isFrozen(game.checkpoint?.spawn));
});
check('key retry retains the key, restores the checkpoint clock and resets all enemy awareness',()=>{
 const game=new EscapeGame();game.start();complete(game,'key');const snapshot=game.checkpoint!,elapsed=game.elapsed;wait(game,3);catchPlayer(game);const total=game.elapsed;assert.ok(total>elapsed);assert.ok(game.retry());
 assert.ok(game.hasKey);assert.equal(game.door,0);assert.equal(game.opening,false);assert.equal(game.time,snapshot.time);assert.equal(game.elapsed,total);assert.equal(distance(game.player,snapshot.spawn),0);assert.equal(game.player.yaw,snapshot.spawn.yaw);assert.ok(game.enemies.every(e=>e.mode==='patrol'&&e.awareness===0&&!e.path.length));
});
check('gate retry retains the open gate, key and checkpoint across repeated captures',()=>{
 const game=new EscapeGame();game.start();complete(game,'key');complete(game,'gate');const snapshot=game.checkpoint!;catchPlayer(game);assert.ok(game.retry());assert.ok(game.hasKey&&game.opening);assert.equal(game.door,1);assert.equal(game.checkpoint,snapshot);assert.equal(game.prompt,'');game.protection=0;catchPlayer(game);assert.ok(game.retry());assert.equal(game.checkpoint,snapshot);assert.equal(game.time,snapshot.time);
});
check('disabled checkpoints restart objectives and the clock while preserving remaining lives',()=>{
 const game=new EscapeGame({...defaultMission(),checkpoints:'off'});game.start();complete(game,'key');complete(game,'gate');assert.equal(Boolean(game.checkpoint),false);catchPlayer(game);assert.ok(game.retry());assert.equal(game.remainingLives,2);assert.equal(game.hasKey,false);assert.equal(game.opening,false);assert.equal(game.door,0);assert.equal(game.time,0);assert.equal(distance(game.player,game.world.start),0);
});
check('timeout and alarm each consume a life and retry restores a playable mission',()=>{
 const timed=new EscapeGame({...defaultMission(),plan:'timed'});timed.start();complete(timed,'key');const saved=timed.checkpoint!.time;timed.time=89.99;timed.update(1/60,idle);assert.equal(timed.failure,'time');assert.equal(timed.remainingLives,2);assert.ok(timed.retry());assert.equal(timed.time,saved);timed.update(1/60,idle);assert.equal(timed.status,'playing');
 const quiet=new EscapeGame({...defaultMission(),plan:'quiet'});quiet.start();quiet.mode='chase';quiet.update(1/60,idle);assert.equal(quiet.failure,'alarm');assert.equal(quiet.remainingLives,2);assert.ok(quiet.retry());quiet.update(1/60,idle);assert.equal(quiet.status,'playing');assert.equal(quiet.failure,undefined);
});
check('respawn protection suppresses detection and capture but expires during active play',()=>{
 const game=new EscapeGame();game.start();catchPlayer(game);game.retry();Object.assign(game.guard,{x:game.player.x,z:game.player.z-1,yaw:0,repath:Infinity});wait(game,2);assert.equal(game.status,'playing');assert.equal(game.awareness,0);assert.ok(game.protection>0);wait(game,3);assert.equal(game.protection,0);assert.equal(game.status,'caught');assert.equal(game.remainingLives,1);
});
check('every checkpoint has clear routes, safe five-enemy separation and preserved body sizes',()=>{
 for(const layout of ['balanced','open','dense']as const)for(let variation=0;variation<3;variation++)for(const stage of ['key','gate']as const){
  const game=new EscapeGame({...defaultMission(),layout,variation},Array.from({length:5},(_,i)=>({id:`enemy-${i+1}`,aggression:'relentless'})));game.player.radius=.48;game.player.height=2.1;game.player.animationScale=1.2;game.enemies.forEach((e,i)=>{e.radius=[.28,.38,.48][i%3];e.height=1.4+i*.15;});game.start();complete(game,'key');if(stage==='gate')complete(game,'gate');
  const sizes=game.enemies.map(e=>[e.radius,e.height]);catchPlayer(game,4);assert.ok(game.retry());assert.equal(game.checkpoint?.stage,stage);assert.equal(game.player.radius,.48);assert.equal(game.player.height,2.1);assert.equal(game.player.animationScale,1.2);assert.deepEqual(game.enemies.map(e=>[e.radius,e.height]),sizes);
  const rects=obstacles(game.door,game.world.blocks);assert.ok(!blocked(game.player,game.player.radius,rects));assert.ok(route(game.player,stage==='gate'?game.world.exit:game.world.checkpoints.gate,rects,game.player.radius).length);
  for(const e of game.enemies){assert.ok(!blocked(e,e.radius,rects));assert.ok(distance(e,game.player)>4);}
  wait(game,1);assert.equal(game.status,'playing');assert.ok(game.enemies.every(e=>e.awareness===0));
 }
});
check('retry clears unfinished actions, jumps, held input and motion; winning cannot be retried',()=>{
 const game=new EscapeGame();game.start();Object.assign(game.player,game.world.checkpoints.key);game.update(1/144,{...idle,interact:true,jump:true});game.update(1/60,idle);game.player.vy=5;game.player.grounded=false;game.player.landing=.5;game.action={kind:'key',time:.4,done:false,approach:false};catchPlayer(game);assert.ok(game.retry());assert.equal(game.action,undefined);assert.equal(game.traversal,undefined);assert.ok(game.player.grounded);assert.equal(game.player.vy,0);assert.equal(game.player.landing,0);game.update(1/60,idle);assert.equal(game.player.y,0);assert.equal(game.action,undefined);assert.equal(game.hasKey,false);
 game.status='won';const lives=game.remainingLives;assert.equal(game.retry(),false);assert.equal(game.remainingLives,lives);
});
console.log(`${checks} recovery contracts passed.`);
