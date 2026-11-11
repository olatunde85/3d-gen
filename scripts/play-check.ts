/** Physical and gameplay contracts: run the actual escape simulation without rendering. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {Catalog} from '../src/core/assets';
import {defaultProject,parseProject,playable,preset} from '../src/play/project';
import {defaultMission} from '../src/play/mission';
import {EscapeGame,type Input} from '../src/play/runtime';
import {BLOCKS,START,KEY,EXIT,PATROL,obstacles,rectOf,blocked,move,clearPath,route,distance,type Point} from '../src/play/world';
const idle:Input={x:0,z:0,sprint:false,interact:false};
let checks=0;function check(name:string,fn:()=>void){fn();checks++;console.log('OK',name);}
function wait(game:EscapeGame,seconds:number){for(let i=0;i<seconds*60;i++)game.update(1/60,idle);}
function go(game:EscapeGame,goal:Point,sprint=true){let limit=1800;while(distance(game.player,goal)>.15&&game.status==='playing'&&limit-->0){const path=route(game.player,goal,obstacles(game.door),game.player.radius+.025);assert.ok(path.length,'no route to '+JSON.stringify(goal));let waypoint=path[0];if(distance(game.player,waypoint)<.25&&path.length>1)waypoint=path[1];const d=distance(game.player,waypoint);game.update(1/60,{x:(waypoint.x-game.player.x)/d,z:(waypoint.z-game.player.z)/d,sprint,interact:false});assert.ok(!blocked(game.player,game.player.radius,obstacles(game.door)),'player penetrated visible geometry');assert.ok(!blocked(game.guard,game.guard.radius,obstacles(game.door)),'guard penetrated visible geometry');}assert.ok(limit>0,'movement stuck at '+JSON.stringify(game.player));}
check('solid props, boundaries and a shut gate cannot be tunnelled through',()=>{
 for(const b of BLOCKS){const rect=rectOf(b),p={x:rect.minX-.6,z:b.z},end=move(p,b.w+1.2,0,.34,[rect]);assert.ok(end.x<rect.minX-.33,b.id);}
 assert.ok(move({x:0,z:-4},0,-20,.34,obstacles()).z>-5.54);
});
check('movement slides and diagonal input cannot cut through corners',()=>{
 const r={minX:0,maxX:2,minZ:0,maxZ:3},p=move({x:-.4,z:-2},2,6,.34,[r]);assert.ok(!blocked(p,.34,[r]));assert.ok(p.x>1.5&&p.z<-.33);const slide=move({x:-.4,z:1},1,1,.34,[r]);assert.ok(slide.z>1.9&&slide.x<-.3);
});
check('guard routes avoid containers and a closed gate separates the yards',()=>{
 const from={x:1,z:-11},to={x:11,z:-11},rects=obstacles(1),path=route(from,to,rects);assert.ok(path.length>1);let p=from;for(const q of path){assert.ok(clearPath(p,q,rects,.4));p=q;}assert.equal(route(START,EXIT,obstacles()).length,0);for(const q of PATROL)assert.ok(!blocked(q,.42,obstacles()));
});
check('walls block sight even when the target is close',()=>{assert.ok(!clearPath({x:0,z:-5.5},{x:0,z:-6.5},obstacles()));assert.ok(clearPath({x:0,z:-5.5},{x:0,z:-6.5},obstacles(1)));});
check('key and gate require proximity and timed contact, never a remote button press',()=>{
 const game=new EscapeGame();game.start();game.update(1/60,{...idle,interact:true});wait(game,2);assert.equal(game.hasKey,false);assert.equal(game.opening,false);go(game,{x:KEY.x,z:KEY.z+.8});game.update(1/60,{...idle,interact:true});assert.equal(game.hasKey,false);wait(game,.3);assert.equal(game.hasKey,false);wait(game,3);assert.equal(game.hasKey,true);assert.equal(game.events.filter(e=>e.type==='key').length,1);assert.equal(game.opening,false);
});
check('complete escape works at cautious and balanced aggression with movement and interactions',()=>{
 for(const aggression of ['balanced','cautious']as const){const game=new EscapeGame(defaultMission(),[{id:'enemy-1',aggression}]);game.start();go(game,{x:KEY.x,z:KEY.z+.8});game.update(1/60,{...idle,interact:true});wait(game,3);assert.equal(game.hasKey,true);go(game,{x:.84,z:-4.9});game.update(1/60,{...idle,interact:true});wait(game,2.7);assert.ok(game.opening&&game.door===1);go(game,{x:0,z:-9});go(game,{x:1,z:-15});go(game,EXIT);assert.equal(game.status,'won',JSON.stringify(game.events));assert.ok(game.events.some(e=>e.type==='spotted'),'escape should exercise actual guard pursuit');assert.ok(game.events.some(e=>e.type==='door'));}
});
check('different player and enemy body sizes can navigate and finish the escape',()=>{
 for(const [player,enemy]of [[.28,.48],[.48,.28]]){const game=new EscapeGame();game.player.radius=player;game.guard.radius=enemy;game.start();go(game,{x:KEY.x,z:KEY.z+.8});game.update(1/60,{...idle,interact:true});wait(game,3);go(game,{x:.84,z:-4.9});game.update(1/60,{...idle,interact:true});wait(game,2.7);go(game,{x:0,z:-9});go(game,{x:1,z:-15});go(game,EXIT);assert.equal(game.status,'won',JSON.stringify({player,enemy,events:game.events}));}
});
check('a nearby pursuing guard catches the player; finished runs stop advancing',()=>{const game=new EscapeGame();game.start();game.player.x=game.guard.x+.7;game.player.z=game.guard.z;game.mode='chase';game.awareness=1;game.update(1/60,idle);assert.equal(game.status,'caught');assert.equal(game.guard.speed,0);const t=game.time;wait(game,1);assert.equal(game.time,t);});
check('breaking sight switches pursuit to searching, never sees through cover',()=>{const game=new EscapeGame();game.start();game.player.x=0;game.player.z=-4.8;game.mode='chase';game.awareness=1;game.lastKnown={x:0,z:-8};wait(game,3);assert.equal(game.mode,'search');assert.ok(game.awareness<.1);});
check('display refresh rate does not change movement; a short interaction tap is queued',()=>{
 const positions=[];for(const fps of [30,60,144]){const game=new EscapeGame();game.start();for(let i=0;i<fps;i++)game.update(1/fps,{...idle,z:-1});positions.push(game.player.z);}assert.ok(Math.max(...positions)-Math.min(...positions)<.05);
 const game=new EscapeGame();game.start();game.player={...game.player,x:KEY.x-.2,z:KEY.z+.5};game.update(1/144,{...idle,interact:true});game.update(1/144,idle);game.update(1/144,idle);assert.ok(game.action);
});
check('portable setups round-trip, reject unsupported values and retain custom outfits',()=>{
 const catalog=JSON.parse(readFileSync(new URL('../public/assets/catalog.json',import.meta.url),'utf8'))as Catalog,project=defaultProject(),parsed=parseProject(JSON.stringify(project),catalog);assert.deepEqual(parsed,project);const {mission,...preMission}=project;assert.deepEqual(parseProject(JSON.stringify(preMission),catalog).mission,mission);assert.throws(()=>parseProject(JSON.stringify({...project,mission:{plan:'unknown'}}),catalog));const enemy=project.enemies[0].character,{enemies,...base}=project,legacy={...base,version:1,enemy};assert.deepEqual(parseProject(JSON.stringify(legacy),catalog).enemies[0].character,enemy);assert.deepEqual(enemy,preset('The Soldier'));assert.throws(()=>parseProject(JSON.stringify({...legacy,enemy:{outfit:'invented-enemy-outfit'}}),catalog));assert.throws(()=>parseProject(JSON.stringify({...legacy,enemy:null}),catalog));const customEnemy={...enemy,name:'My warden',height:.8};assert.deepEqual(parseProject(JSON.stringify({...legacy,enemy:customEnemy}),catalog).enemies[0].character,customEnemy);
 assert.throws(()=>parseProject(JSON.stringify({...project,difficulty:'impossible'}),catalog));assert.throws(()=>parseProject(JSON.stringify({...project,character:{outfit:'invented-outfit'}}),catalog));assert.throws(()=>parseProject(JSON.stringify({...project,character:undefined}),catalog));assert.throws(()=>parseProject(JSON.stringify({...project,script:'anything'}),catalog));
 const custom=playable({...project.character,name:'My runner',height:.2,weapon:'pistol',vehicle:'jet'});assert.equal(custom.weapon,'none');assert.equal(custom.vehicle,'none');assert.equal(custom.carry,'backpack');assert.equal(parseProject(JSON.stringify({...project,character:custom}),catalog).character.outfit,project.character.outfit);
});
console.log(`${checks} Ara Play contracts passed.`);
