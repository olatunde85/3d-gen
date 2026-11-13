/** City traffic: measured loops, no collisions, waiting for people, passing stopped vehicles and no gridlock. */
import assert from 'node:assert/strict';
import {EscapeGame} from '../src/play/runtime';
import {defaultMission,missionObstacles} from '../src/play/mission';
import {defaultCity} from '../src/play/city';
import {defaultCarFit,carCorners,carPoint,type CarFit,type CarState} from '../src/play/driving';
import {trafficLoops,placeTraffic,trafficStep,type TrafficCar} from '../src/play/traffic';
import {blocked} from '../src/play/world';

const fit=(scale:number):CarFit=>{const f=defaultCarFit();return {...f,box:{minX:f.box.minX*scale,maxX:f.box.maxX*scale,minZ:f.box.minZ*scale,maxZ:f.box.maxZ*scale}};};
const hub=(size:'local'|'district'|'vast')=>new EscapeGame({...defaultMission(),location:'urban-block',story:'getaway',extraction:'pickup'},undefined,undefined,100,undefined,undefined,true,{...defaultCity(),size});
const overlap=(a:TrafficCar,b:TrafficCar)=>{const pa=carCorners(a,a.fit),pb=carCorners(b,b.fit);for(const poly of [pa,pb])for(let i=0;i<4;i++){const p=poly[i],q=poly[(i+1)%4],nx=q.z-p.z,nz=p.x-q.x,proj=(pts:typeof pa)=>pts.map(t=>t.x*nx+t.z*nz),A=proj(pa),B=proj(pb);if(Math.max(...A)<Math.min(...B)||Math.max(...B)<Math.min(...A))return false;}return true;};

for(const size of ['district','vast']as const){
 const g=hub(size),solids=missionObstacles(g.world,1),loops=trafficLoops(g.world.bounds.maxX,g.world.bounds.maxZ,solids);
 assert.ok(loops.length>=2,`${size} has traffic loops`);for(const loop of loops)assert.ok(loop.points.every(p=>!blocked(p,1.6,solids)));
 const cars=placeTraffic(loops,Array.from({length:12},(_,i)=>({model:'saloon' as const,color:'#777777',fit:fit(i%3===1?1.25:1)})),g.world.start);
 let worst=Infinity;const moved=cars.map(()=>0);
 for(let i=0;i<60*120;i++){const before=cars.map(c=>c.distance);trafficStep(cars,loops,1/60,[],[]);cars.forEach((c,k)=>moved[k]+=c.distance-before[k]);
  if(i%6===0)for(let a=0;a<cars.length;a++)for(let b=a+1;b<cars.length;b++)assert.ok(!overlap(cars[a],cars[b]),`${size}: ${cars[a].id} and ${cars[b].id} collide at ${i/60}s`);
  if(i%30===0)for(const c of cars)worst=Math.min(worst,...carCorners(c,c.fit).map(p=>blocked(p,.05,solids)?0:1));}
 assert.equal(worst,1,`${size}: traffic stays out of buildings`);assert.ok(moved.every(m=>m>300),`${size}: every car keeps moving (${moved.map(Math.round).join(', ')} m)`);
 console.log('OK',size,`${loops.length} loops; 12 cars drive two minutes without collisions or gridlock`);
}
assert.equal(trafficLoops(30,60,[]).length,0,'a Local district has no side streets');console.log('OK local districts have no moving traffic');

{const g=hub('vast'),loops=trafficLoops(g.world.bounds.maxX,g.world.bounds.maxZ,missionObstacles(g.world,1)),[car]=placeTraffic(loops,[{model:'saloon',color:'#777777',fit:fit(1)}],{x:999,z:999});
 for(let i=0;i<600;i++)trafficStep([car],loops,1/60,[],[]);
 const ahead={x:car.x+Math.sin(car.yaw)*30,z:car.z+Math.cos(car.yaw)*30},walker={...ahead,radius:.35,moving:false};let closest=Infinity;
 for(let i=0;i<60*8;i++){trafficStep([car],loops,1/60,[],[walker]);closest=Math.min(closest,Math.hypot(car.x-walker.x,car.z-walker.z));}
 assert.ok(car.speed<.3&&closest>car.fit.box.maxZ+walker.radius+.5,`car waits for a person in the road (closest ${closest.toFixed(2)} m)`);console.log('OK cars stop short of people in the road');
 // Start on a straight stretch, with the stopped vehicle 25 m along it.
 const L=loops[car.loop],dir=(i:number)=>{const a=L.points[i%L.points.length],b=L.points[(i+1)%L.points.length];return Math.atan2(b.x-a.x,b.z-a.z);},first=L.points.findIndex((_,i)=>Array.from({length:50},(_,k)=>dir(i+k)).every(y=>Math.abs(Math.sin(y-dir(i)))<1e-3));
 Object.assign(car,{s:L.at[first],speed:0,pass:0,shift:0,wait:0});trafficStep([car],loops,1e-4,[],[]);
 const spot={x:car.x+Math.sin(car.yaw)*25,z:car.z+Math.cos(car.yaw)*25},parked:CarState={x:spot.x,z:spot.z,yaw:car.yaw,speed:0,steer:0,distance:0,phase:'parked',time:0,blocked:0,fit:fit(1)};let passed=false;
 for(let i=0;i<60*25&&!passed;i++){trafficStep([car],loops,1/60,[parked],[]);const dz=(car.x-parked.x)*Math.sin(parked.yaw)+(car.z-parked.z)*Math.cos(parked.yaw);passed=dz>8&&Math.abs(car.shift)<.05;
  assert.ok(!overlap(car,{...car,...parked,fit:parked.fit} as TrafficCar),`passing car never touches the stopped vehicle (t=${(i/60).toFixed(2)} shift ${car.shift.toFixed(2)} pass ${car.pass.toFixed(1)} v ${car.speed.toFixed(1)} yaw ${car.yaw.toFixed(2)} vs ${parked.yaw.toFixed(2)})`);}
 assert.ok(passed,`a car pulls out around a stopped vehicle and returns to its lane (wait ${car.wait.toFixed(1)} pass ${car.pass.toFixed(1)} shift ${car.shift.toFixed(2)} v ${car.speed.toFixed(1)} at ${car.x.toFixed(1)},${car.z.toFixed(1)} yaw ${car.yaw.toFixed(2)}; parked ${parked.x.toFixed(1)},${parked.z.toFixed(1)})`);console.log('OK cars pass a stopped vehicle and return to their lane');}

{const g=hub('vast');g.configureTraffic(Array.from({length:8},()=>({model:'saloon' as const,color:'#777777',fit:fit(1)})));assert.equal(g.traffic.length,8);g.start();for(let i=0;i<120;i++)g.update(1/60,{x:0,z:0,sprint:false,interact:false});assert.ok(g.traffic.some(c=>c.speed>1),'traffic moves in the running city');assert.equal(g.trafficVolumes.length,8);console.log('OK the city runs its traffic and treats it as solid');}
{const g=hub('vast'),loops=trafficLoops(g.world.bounds.maxX,g.world.bounds.maxZ,missionObstacles(g.world,1));
 // Loops turn right only, so each stays inside its own block's lane and never crosses another loop.
 for(const loop of loops){let turn=0;for(let i=0;i<loop.points.length;i++){const a=loop.points[i],b=loop.points[(i+1)%loop.points.length],c=loop.points[(i+2)%loop.points.length],d=Math.atan2(c.x-b.x,c.z-b.z)-Math.atan2(b.x-a.x,b.z-a.z);turn+=Math.atan2(Math.sin(d),Math.cos(d));}assert.ok(turn<-6,'every loop turns right');}
 for(let i=0;i<loops.length;i++)for(let j=i+1;j<loops.length;j++)assert.ok(loops[i].points.every(p=>loops[j].points.every(q=>Math.hypot(p.x-q.x,p.z-q.z)>2.5)),'loops never share a lane');
 console.log('OK loops turn right around their blocks and never share a lane');}
// A car parked across a lane, then manoeuvred while the honking car pulls out around it, can always drive away.
{const idle={x:0,z:0,sprint:false,interact:false};for(const trial of [1,3,9,0]){const g=hub('vast');g.configureCar(defaultCarFit());g.configureTraffic(Array.from({length:8},()=>({model:'saloon' as const,color:'#777777',fit:defaultCarFit()})));g.start();g.protection=Infinity;g.car!.phase='driving';g.hasKey=true;
 for(let i=0;i<60;i++)g.update(1/60,idle);const t=g.traffic[trial%g.traffic.length],ahead=carPoint(t,{x:0,z:9});Object.assign(g.car!,{x:ahead.x,z:ahead.z,yaw:t.yaw+(trial%3)*.6,speed:0});
 for(let i=0;i<8*60;i++)g.update(1/60,{...idle,brake:true});for(let i=0;i<6*60;i++)g.update(1/60,{...idle,throttle:((i/40|0)%2?1:-1)*.5,steer:trial%2?1:-1});
 const start={x:g.car!.x,z:g.car!.z};let moved=0;for(const [throttle,steer]of [[1,0],[-1,0],[1,1],[-1,-1],[1,-1],[-1,1]]){for(let i=0;i<60;i++)g.update(1/60,{...idle,throttle,steer});moved=Math.max(moved,Math.hypot(g.car!.x-start.x,g.car!.z-start.z));}
 assert.ok(moved>.5,`trial ${trial}: the player's car can drive away after a honking car passes (${moved.toFixed(2)} m)`);}
 console.log('OK honking traffic never pins the player car');}

