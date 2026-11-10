import assert from 'node:assert/strict';
import {EscapeGame,type Input} from '../src/play/runtime';
import {defaultMission,parseMission,missionObstacles} from '../src/play/mission';
import {defaultCarFit,driverStand,carObstacle} from '../src/play/driving';
import {distance,route} from '../src/play/world';
const idle:Input={x:0,z:0,sprint:false,interact:false};let checks=0;const check=(name:string,f:()=>void)=>{f();checks++;console.log('OK',name);};
function tick(g:EscapeGame,t:number,i:Input=idle){for(let n=0;n<t*60&&g.status==='playing';n++)g.update(1/60,i);}
function make(cargo:'none'|'briefcase'|'package'='none',difficulty:'easy'|'standard'|'hard'='easy',location:'depot'|'military-base'='depot'){const g=new EscapeGame({...defaultMission(),story:'getaway',cargo,driveDifficulty:difficulty,location});g.start();g.enemies.forEach(e=>e.combat.health=0);return g;}
function collect(g:EscapeGame){Object.assign(g.player,g.world.checkpoints.cargo);assert.ok(g.canInteract);g.update(1/60,{...idle,interact:true});tick(g,2);assert.ok(g.hasCargo);}
check('optional theft is validated, visible in the contract and placed safely across all arrangements',()=>{
 assert.throws(()=>parseMission({cargo:'helicopter'}));assert.throws(()=>parseMission({driveDifficulty:'extreme'}));
 for(const location of ['depot','military-base']as const)for(const layout of ['balanced','open','dense']as const)for(let variation=0;variation<3;variation++)for(const cargo of ['briefcase','package']as const){const g=new EscapeGame({...defaultMission(),location,layout,variation,cargo});g.start();g.enemies.forEach(e=>e.combat.health=0);assert.ok(route(g.world.start,g.world.checkpoints.cargo,missionObstacles(g.world,0),.48,g.world.bounds).length);assert.equal(g.totalObjectives,4);assert.equal(g.extractionReady,false);collect(g);assert.equal(g.objectivesCompleted,1);assert.equal(g.checkpoint!.cargo,true);}
});
check('cargo needs a completed local interaction, is required for boarding and is restored on retry',()=>{
 const g=make('briefcase');g.hasKey=true;g.opening=true;Object.assign(g.player,driverStand(g.car!));assert.equal(g.canInteract,false);g.update(1/60,{...idle,interact:true});assert.equal(g.car!.phase,'parked');collect(g);const score=g.score;tick(g,.5,{...idle,interact:true});assert.equal(g.score,score);g.mission.plan='timed';g.time=g.timeLimit;tick(g,.1);assert.equal(g.status,'caught');assert.ok(g.retry());assert.ok(g.hasCargo&&g.hasKey);assert.equal(g.door,1);assert.equal(g.rewards.filter(r=>r.id==='cargo').length,1);
 const beforeKeys=make('package');collect(beforeKeys);beforeKeys.mission.plan='timed';beforeKeys.time=beforeKeys.timeLimit;tick(beforeKeys,.1);assert.ok(beforeKeys.retry());assert.equal(beforeKeys.hasKey,false);assert.equal(beforeKeys.door,0);
});
check('route difficulty increases real route length and obstacles without changing vehicle pace',()=>{
 for(const location of ['depot','military-base']as const){const a=make('none','easy',location),b=make('none','standard',location),c=make('none','hard',location);assert.ok(!a.world.getaway!.course);assert.ok(b.world.getaway!.course!.length>130);assert.ok(c.world.getaway!.course!.length>b.world.getaway!.course!.length*1.7);assert.equal(b.world.getaway!.course!.checkpoints.length,2);assert.equal(c.world.getaway!.course!.checkpoints.length,6);assert.deepEqual(a.vehicleSettings,c.vehicleSettings);for(const g of [b,c])g.configureCar(defaultCarFit());assert.ok(c.world.blocks.filter(b=>b.id.startsWith('road-')).length>b.world.blocks.filter(b=>b.id.startsWith('road-')).length);}
});
function driveRoute(g:EscapeGame){Object.assign(g.player,g.world.checkpoints.key);g.update(1/60,{...idle,interact:true});tick(g,2.4);Object.assign(g.player,driverStand(g.car!));g.update(1/60,{...idle,interact:true});tick(g,1.3);assert.ok(g.readyToDrive);const path=g.world.getaway!.route;let index=0;
 for(let n=0;n<60*200&&g.status==='playing';n++){
  const car=g.car!;while(index<path.length-1&&distance(car,path[index])<4)index++;let target=path[index];for(let j=index;j<path.length;j++){if(distance(car,path[j])>5.5){target=path[j];break;}}
  const want=Math.atan2(target.x-car.x,target.z-car.z),angle=Math.atan2(Math.sin(want-car.yaw),Math.cos(want-car.yaw)),d=distance(car,g.world.exit),steer=Math.max(-1,Math.min(1,-angle*2.5));g.update(1/60,{...idle,throttle:d<5?.2:Math.abs(angle)>.3?.32:.6,steer,brake:d<car.speed*car.speed/22+1});
 }
 assert.equal(g.status,'won',JSON.stringify({routeStage:g.routeStage,car:g.car,index}));
}
check('standard and hard courses are driveable with actual controls, require ordered checkpoints and reach extraction',()=>{
 for(const difficulty of ['standard','hard']as const)for(const location of ['depot','military-base']as const){const g=make('none',difficulty,location);driveRoute(g);assert.equal(g.routeStage,g.world.getaway!.course!.checkpoints.length);assert.equal(g.objectivesCompleted,3);}
});
check('road checkpoints restore the parked pickup, cleared route stages and inventory together',()=>{
 const g=make('briefcase','standard');collect(g);g.hasKey=true;g.opening=true;g.door=1;Object.assign(g.player,driverStand(g.car!));g.update(1/60,{...idle,interact:true});tick(g,1.3);const point=g.world.getaway!.course!.checkpoints[0];Object.assign(g.car!,point);Object.assign(g.player,point);tick(g,.1);assert.equal(g.routeStage,1);assert.equal(g.checkpoint!.stage,'route');g.mission.plan='timed';g.time=g.timeLimit;tick(g,.1);assert.ok(g.retry());assert.equal(g.routeStage,1);assert.ok(g.hasCargo);assert.equal(g.car!.phase,'parked');assert.ok(distance(g.car!,point)<.001);assert.ok(route(g.player,driverStand(g.car!),[...missionObstacles(g.world,g.door),carObstacle(g.car!)],g.player.radius,g.world.bounds).length);
});
console.log(`${checks} optional objective and driving course contracts passed.`);
