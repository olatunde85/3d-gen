/** Gameplay contracts for height-aware collision, traversal planning and abstract missions. */
import assert from 'node:assert/strict';
import {EscapeGame,type Body} from '../src/play/runtime';
import {motorStep,planTraversal,sight,type Volume} from '../src/play/motor';
import {createMission,defaultMission,parseMission,solidVolumes} from '../src/play/mission';
import {distance,obstacles,route} from '../src/play/world';
const body=(patch:Partial<Body>={}):Body=>({...new EscapeGame().player,x:0,z:3,...patch});
const box=(patch:Partial<Volume>={}):Volume=>({minX:-1.5,maxX:1.5,minZ:-.175,maxZ:.175,h:.85,id:'test-cargo',climbable:true,...patch});
const idle={x:0,z:0,sprint:false,interact:false};let checks=0;
function check(name:string,fn:()=>void){fn();checks++;console.log('OK',name);}
check('low steps support walking and stepping off returns to ground',()=>{const volumes=[box({id:'1',minZ:0,maxZ:1.5,h:.22}),box({id:'2',minZ:-1.5,maxZ:0,h:.44}),box({id:'3',minZ:-3,maxZ:-1.5,h:.66})],b=body({z:2});for(let i=0;i<115;i++)motorStep(b,0,-.04,1/60,volumes);assert.ok(Math.abs(b.y-.66)<1e-6&&b.grounded,JSON.stringify(b));for(let i=0;i<80;i++)motorStep(b,0,-.04,1/60,volumes);for(let i=0;i<60;i++)motorStep(b,0,0,1/60,volumes);assert.equal(b.y,0);assert.ok(b.grounded);});
check('a jump clears a low barrier, lands and never tunnels through a tall one',()=>{for(const height of [.4,2]){const b=body({z:1.4}),volumes=[box({h:height})];let peak=0;for(let i=0;i<90;i++){motorStep(b,0,-2.5/60,1/60,volumes,i===0);peak=Math.max(peak,b.y);}assert.ok(peak>.9&&peak<1.2);assert.equal(b.y,0);assert.ok(b.grounded);if(height===.4)assert.ok(b.z<-.8);else assert.ok(b.z>.45);}});
check('walking on a roof preserves its height, and walking off falls safely',()=>{const v=box({h:1.3,minZ:-2,maxZ:2}),b=body({z:0,y:1.3});for(let i=0;i<20;i++)motorStep(b,.02,0,1/60,[v]);assert.equal(b.y,1.3);for(let i=0;i<130;i++)motorStep(b,.03,0,1/60,[v]);for(let i=0;i<60;i++)motorStep(b,0,0,1/60,[v]);assert.equal(b.y,0);});
check('height, depth, reach and available landing choose vault or climb',()=>{
 const b=body({z:1.3,yaw:Math.PI}),rail=box(),vault=planTraversal(b,{x:0,z:-1},[rail]);assert.equal(vault?.kind,'vault');
 const crate=box({h:1.3,minZ:-1,maxZ:1}),climb=planTraversal(body({z:1.5}),{x:0,z:-1},[crate]);assert.equal(climb?.kind,'climb');assert.equal(climb?.to.y,1.3);
 assert.equal(planTraversal(body({z:1.5}),{x:0,z:-1},[box({h:.3,minZ:-1,maxZ:1})]),undefined);
 assert.equal(planTraversal(body({z:1.5,height:1.3}),{x:0,z:-1},[crate]),undefined);assert.equal(planTraversal(b,{x:0,z:-1},[box({climbable:false})]),undefined);
 assert.equal(planTraversal(b,{x:0,z:-1},[rail,box({id:'blocked-landing',h:3,minZ:-2,maxZ:-1})]),undefined);
});
check('a complete contextual climb ends upright on the top and movement continues',()=>{const game=new EscapeGame();game.start();Object.assign(game.player,{x:-8.7,z:4,yaw:Math.PI/2});game.update(1/60,{...idle,jump:true});assert.equal(game.traversal?.kind,'climb');for(let i=0;i<260;i++)game.update(1/60,idle);assert.equal(game.traversal,undefined);assert.ok(game.player.grounded);assert.equal(game.player.y,1.3);const before=game.player.x;for(let i=0;i<12;i++)game.update(1/60,{...idle,x:.3});assert.ok(game.player.x>before);});
check('a complete contextual vault crosses the rail and lands on clear ground',()=>{const game=new EscapeGame();game.start();Object.assign(game.player,{x:0,z:9.3,yaw:Math.PI});game.update(1/60,{...idle,jump:true});assert.equal(game.traversal?.kind,'vault');for(let i=0;i<180;i++)game.update(1/60,idle);assert.equal(game.traversal,undefined);assert.ok(game.player.z<7);assert.equal(game.player.y,0);assert.ok(game.player.grounded);});
check('height-aware sight sees a rooftop character but cannot see through a container',()=>{const v=box({h:2.7,minZ:-1,maxZ:1}),guard=body({z:3}),player=body({z:0});assert.equal(sight(guard,player,[v]),false);player.y=2.7;assert.equal(sight(guard,player,[v]),true);});
check('all scenario and layout arrangements retain reachable objectives for large bodies',()=>{for(const plan of ['breakout','timed','quiet']as const)for(const layout of ['balanced','open','dense']as const)for(let variation=0;variation<3;variation++){const settings={...defaultMission(),plan,layout,variation},world=createMission(settings),open=obstacles(1,world.blocks);assert.ok(route(world.start,world.exit,open,.52).length);assert.deepEqual(createMission(settings),world);assert.ok(solidVolumes(world,0).length>10);}});
check('timed, quiet and grounded choices change actual gameplay',()=>{
 const timed=new EscapeGame({...defaultMission(),plan:'timed'});timed.start();timed.time=89.99;timed.update(1/60,idle);assert.equal(timed.failure,'time');assert.equal(timed.status,'caught');
 const quiet=new EscapeGame({...defaultMission(),plan:'quiet'});quiet.start();quiet.mode='chase';quiet.update(1/60,idle);assert.equal(quiet.failure,'alarm');
 const grounded=new EscapeGame({...defaultMission(),movement:'grounded'});grounded.start();for(let i=0;i<30;i++)grounded.update(1/60,{...idle,jump:i===0});assert.equal(grounded.player.y,0);assert.equal(grounded.traversal,undefined);
 const agile=new EscapeGame();agile.start();agile.update(1/60,{...idle,jump:true});for(let i=0;i<10;i++)agile.update(1/60,idle);assert.ok(agile.player.y>.5);
});
check('mission recipes reject invented settings and migrate missing choices',()=>{assert.deepEqual(parseMission(undefined),defaultMission());for(const raw of [{plan:'invented'},{variation:12},{variation:-1},{movement:'fly'},{layout:'moon'},{script:'code'}])assert.throws(()=>parseMission(raw));const a=createMission({...defaultMission(),variation:1}),b=createMission({...defaultMission(),variation:2});assert.ok(distance(a.key,b.key)>10);});
console.log(`${checks} traversal and scenario contracts passed.`);
