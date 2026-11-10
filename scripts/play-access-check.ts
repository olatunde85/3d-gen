/** Regressions for rear pickup access and cargo collection from every reachable side. */
import assert from 'node:assert/strict';
import {EscapeGame,type Input} from '../src/play/runtime';
import {defaultMission} from '../src/play/mission';
import {carPoint,carLocal} from '../src/play/driving';
import {vehicleVolumes} from '../src/play/vehicle-surfaces';
import {planTraversal,supportAt} from '../src/play/motor';
import {distance,blocked} from '../src/play/world';
const idle:Input={x:0,z:0,sprint:false,interact:false};let checks=0;function check(name:string,f:()=>void){f();checks++;console.log('OK',name);}
function tick(g:EscapeGame,t:number,input=idle){for(let n=0;n<Math.ceil(t*60)&&g.status==='playing';n++)g.update(1/60,input);}
function make(){const g=new EscapeGame({...defaultMission(),story:'getaway'});g.start();g.enemies.forEach(e=>e.combat.health=0);g.world.blocks=[];g.world.gate={x:0,z:-16};Object.assign(g.car!,{x:0,z:0});return g;}
check('rear access climbs over the tailgate into the bed at any yaw and can continue onto the roof',()=>{
 for(const yaw of [0,.67,Math.PI/2,Math.PI])for(const radius of [.28,.48])for(const offset of [-.5,0,.5]){
  const g=make(),c=g.car!;c.yaw=yaw;g.player.radius=radius;const surfaces=vehicleVolumes(c),tail=surfaces.find(v=>v.id==='pickup-tailgate')!.obb!.box,bed=surfaces.find(v=>v.id==='pickup-bed')!,cab=surfaces.find(v=>v.id==='pickup-cab')!,cx=(bed.obb!.box.minX+bed.obb!.box.maxX)/2,dir={x:Math.sin(yaw),z:Math.cos(yaw)};
  Object.assign(g.player,carPoint(c,{x:cx+offset,z:tail.minZ-.8}),{yaw,y:0});g.update(1/60,{...idle,...dir,jump:true});assert.ok(g.traversal,'rear entry has a fitted route');assert.equal(g.traversal!.block,'pickup-tailgate');assert.ok(g.traversal!.landingDrop!>0);
  for(let n=0;n<360&&g.traversal;n++)g.update(1/60,idle);assert.equal(g.traversal,undefined);assert.ok(g.player.grounded);assert.ok(Math.abs(g.player.y-bed.h)<1e-5);assert.equal(supportAt(g.player,g.player.y,surfaces,radius),bed.h);assert.ok(carLocal(c,g.player).z>tail.maxZ+radius);
  for(let n=0;n<150&&carLocal(c,g.player).z<cab.obb!.box.minZ-.8;n++)g.update(1/60,{...idle,...dir});g.update(1/60,{...idle,...dir,jump:true});assert.ok(g.traversal,'bed leads to roof');for(let n=0;n<360&&g.traversal;n++)g.update(1/60,idle);assert.ok(Math.abs(g.player.y-cab.h)<1e-5);
 }
});
check('rear entry rejects an occupied truck, an obstructed bed and a blocked rear approach',()=>{const g=make(),c=g.car!,surfaces=vehicleVolumes(c),tail=surfaces.find(v=>v.id==='pickup-tailgate')!,b=tail.obb!.box,cx=(b.minX+b.maxX)/2,p={...g.player,...carPoint(c,{x:cx,z:b.minZ-.8}),yaw:c.yaw},dir={x:Math.sin(c.yaw),z:Math.cos(c.yaw)};assert.ok(planTraversal(p,dir,surfaces));c.phase='driving';assert.equal(planTraversal(p,dir,vehicleVolumes(c)),undefined);c.phase='parked';const bed=surfaces.find(v=>v.id==='pickup-bed')!;assert.equal(planTraversal(p,dir,[...surfaces,{...bed,id:'blocked-bed',h:5,climbable:false}]),undefined);const obstruction={minX:p.x-.4,maxX:p.x+.4,minZ:p.z-.2,maxZ:p.z+.6,h:3,id:'rear-wall',climbable:false};assert.equal(planTraversal(p,dir,[...surfaces,obstruction]),undefined);});
check('briefcases and packages can be secured from front, back, sides and corners in every map arrangement',()=>{
 for(const location of ['depot','military-base']as const)for(const layout of ['open','balanced','dense']as const)for(let variation=0;variation<3;variation++)for(const cargo of ['briefcase','package']as const){
  const g=new EscapeGame({...defaultMission(),location,layout,variation,cargo});g.start();g.enemies.forEach(e=>e.combat.health=0);const p=g.world.cargo!.position,stand=g.world.blocks.find(b=>b.id==='mission-cargo-stand')!;
  for(const [sx,sz]of [[0,1],[0,-1],[1,0],[-1,0],[1,1],[-1,-1]]){g.hasCargo=false;g.action=undefined;g.player.radius=variation===2?.48:.34;Object.assign(g.player,{x:p.x+sx*(stand.w/2+g.player.radius+.15),z:p.z+sz*(stand.d/2+g.player.radius+.15),y:0,vy:0,grounded:true,speed:0,yaw:Math.PI});assert.ok(!blocked(g.player,g.player.radius,g.traversalVolumes),'approach starts on clear ground');assert.ok(g.canInteract);g.update(1/60,{...idle,interact:true});assert.ok((g.action as EscapeGame['action'])?.kind==='cargo');tick(g,3);assert.ok(g.hasCargo,JSON.stringify({location,layout,variation,cargo,sx,sz,player:g.player,action:g.action}));assert.equal(g.action,undefined);assert.ok(Number.isFinite(g.player.x)&&Number.isFinite(g.player.z));const yaw=Math.atan2(p.x-g.player.x,p.z-g.player.z);assert.ok(Math.abs(Math.atan2(Math.sin(yaw-g.player.yaw),Math.cos(yaw-g.player.yaw)))<.02,'faces the item on the actual approach side');}
 }
});
check('a dynamically blocked interaction times out and releases movement instead of soft-locking',()=>{const g=new EscapeGame({...defaultMission(),cargo:'briefcase'});g.start();g.enemies.forEach(e=>e.combat.health=0);const p=g.world.cargo!.position;Object.assign(g.player,{x:p.x,z:p.z-1.5,yaw:0});g.update(1/60,{...idle,interact:true});assert.ok(g.action?.approach);g.world.blocks.push({id:'temporary-block',kind:'wall',x:g.player.x,z:g.player.z,w:1.8,d:1.8,h:3,color:'#777777'});tick(g,3);assert.equal(g.action,undefined);assert.equal(g.hasCargo,false);g.world.blocks.pop();const before={x:g.player.x,z:g.player.z};tick(g,.4,{...idle,x:1});assert.ok(distance(g.player,before)>.3);});
console.log(`${checks} rear access and interaction regressions passed.`);
