/**
 * Moving city traffic. Cars drive closed loops around the district's blocks in the right-hand lane, slow for corners,
 * queue behind whatever is ahead, wait for people and pull out around stopped vehicles. Each loop is checked against
 * the solid city before any car uses it. The rules are a cheap fixed step: one look ahead per car against the nearby
 * vehicles and people, with no physics.
 */
import {blocked,type Point,type Rect} from './world';
import {carObstacle,carTouches,type CarFit,type CarPose,type CarState,type DriveVehicle} from './driving';

export interface TrafficLoop {points:Point[];/** Cumulative length at each point. */ at:number[];length:number;/** Comfortable speed at each point, lower before corners. */ limit:number[];/** The street crossings at the loop's corners. */ crossings:Point[]}
export interface TrafficCar extends CarPose {id:string;model:DriveVehicle;color:string;livery?:'taxi';loop:number;s:number;speed:number;steer:number;distance:number;/** Sideways offset from the lane, used to pass stopped vehicles. */ shift:number;/** Metres left in the other lane while passing. */ pass:number;wait:number;fit:CarFit;braking:boolean}
export type Mover=Point&{radius:number;moving?:boolean};

const LANE=2.2,CRUISE=11,ACCEL=2.6,BRAKE=7.5,STEP=1;
/** Road centre lines between the city's block columns and rows; see `extendCity`. */
export function trafficLoops(halfWidth:number,halfDepth:number,solids:readonly Rect[]):TrafficLoop[]{
 const xs=[65,117].filter(x=>x+6<halfWidth).flatMap(x=>[-x,x]).sort((a,b)=>a-b),zs=Array.from({length:6},(_,i)=>65+i*52).filter(z=>z+6<halfDepth).flatMap(z=>[-z,z]).sort((a,b)=>a-b);
 const loops:TrafficLoop[]=[];
 for(let i=0;i+1<xs.length;i++)for(let j=0;j+1<zs.length;j++){
  const loop=buildLoop(xs[i],xs[i+1],zs[j],zs[j+1]);
  if(loop.points.every(p=>!blocked(p,1.6,solids)))loops.push(Object.assign(loop,{centre:Math.hypot((xs[i]+xs[i+1])/2,(zs[j]+zs[j+1])/2)}));
 }
 // Loops nearest the middle of the district fill first, where the player spends most time.
 return loops.sort((a,b)=>(a as {centre?:number}).centre!-(b as {centre?:number}).centre!);
}
/** A rounded rectangle traced in the right-hand lane, sampled every metre. */
function buildLoop(x0:number,x1:number,z0:number,z1:number):TrafficLoop{
 // Every loop turns right around its block, so its lane is the one beside that block: neighbouring loops drive the
 // other lane of a shared street in the opposite direction and no two loops cross.
 const corners:Point[]=[{x:x0,z:z0},{x:x1,z:z0},{x:x1,z:z1},{x:x0,z:z1}];
 // Rounded corners on the centre line, then the lane sits to the driver's right.
 const R=11,centre:Point[]=[];
 for(let i=0;i<4;i++){
  const a=corners[(i+3)%4],b=corners[i],c=corners[(i+1)%4],ab=Math.hypot(b.x-a.x,b.z-a.z),bc=Math.hypot(c.x-b.x,c.z-b.z);
  const p={x:b.x-(b.x-a.x)/ab*R,z:b.z-(b.z-a.z)/ab*R},q={x:b.x+(c.x-b.x)/bc*R,z:b.z+(c.z-b.z)/bc*R};
  for(let k=0;k<=8;k++){const t=k/8,u=1-t;centre.push({x:u*u*p.x+2*u*t*b.x+t*t*q.x,z:u*u*p.z+2*u*t*b.z+t*t*q.z});}
 }
 const dense:Point[]=[];
 for(let i=0;i<centre.length;i++){const a=centre[i],b=centre[(i+1)%centre.length],n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/STEP));for(let k=0;k<n;k++)dense.push({x:a.x+(b.x-a.x)*k/n,z:a.z+(b.z-a.z)*k/n});}
 const points=dense.map((p,i)=>{const a=dense[(i+dense.length-1)%dense.length],b=dense[(i+1)%dense.length],yaw=Math.atan2(b.x-a.x,b.z-a.z);return {x:p.x-Math.cos(yaw)*LANE,z:p.z+Math.sin(yaw)*LANE};});
 const at=[0];for(let i=1;i<points.length;i++)at.push(at[i-1]+Math.hypot(points[i].x-points[i-1].x,points[i].z-points[i-1].z));
 const length=at[at.length-1]+Math.hypot(points[0].x-points[points.length-1].x,points[0].z-points[points.length-1].z);
 const heading=(i:number)=>{const a=points[(i+points.length)%points.length],b=points[(i+1+points.length)%points.length];return Math.atan2(b.x-a.x,b.z-a.z);};
 const limit=points.map((_,i)=>{let turn=0;for(let k=0;k<14;k++){const d=heading(i+k+1)-heading(i+k);turn+=Math.abs(Math.atan2(Math.sin(d),Math.cos(d)));}return turn>.5?Math.max(5,CRUISE-turn*6):CRUISE;});
 return {points,at,length,limit,crossings:corners};
}
function sample(loop:TrafficLoop,s:number){
 const L=loop.length;s=((s%L)+L)%L;let lo=0,hi=loop.at.length-1;while(lo<hi){const mid=(lo+hi+1)>>1;if(loop.at[mid]<=s)lo=mid;else hi=mid-1;}
 const a=loop.points[lo],b=loop.points[(lo+1)%loop.points.length],span=(lo+1<loop.at.length?loop.at[lo+1]:L)-loop.at[lo],t=span>0?(s-loop.at[lo])/span:0;
 return {x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,yaw:Math.atan2(b.x-a.x,b.z-a.z),limit:loop.limit[lo]};
}
/** Spread cars along the loops, away from the player's start. */
export function placeTraffic(loops:readonly TrafficLoop[],specs:readonly {model:DriveVehicle;color:string;livery?:'taxi';fit:CarFit}[],start:Point):TrafficCar[]{
 if(!loops.length)return [];
 const perLoop=loops.map(()=>0);specs.forEach((_,i)=>perLoop[i%loops.length]++);const seen=loops.map(()=>0),placed:Point[]=[];
 // Neighbouring loops share streets, so every car keeps clear of the cars already placed and of the player's start.
 const free=(p:Point)=>Math.hypot(p.x-start.x,p.z-start.z)>=30&&placed.every(q=>Math.hypot(p.x-q.x,p.z-q.z)>=14);
 return specs.map((spec,i)=>{
  const loop=i%loops.length,n=seen[loop]++,L=loops[loop].length;let s=L*n/perLoop[loop]+L*.13*loop;
  for(let k=0;k<Math.ceil(L/3)&&!free(sample(loops[loop],s));k++)s+=3;
  const p=sample(loops[loop],s),bx=body(spec.fit).x;placed.push(p);
  return {id:`traffic-${i+1}`,model:spec.model,color:spec.color,...(spec.livery?{livery:spec.livery}:{}),loop,s,x:p.x-Math.cos(p.yaw)*bx,z:p.z+Math.sin(p.yaw)*bx,yaw:p.yaw,speed:0,steer:0,distance:0,shift:0,pass:0,wait:0,fit:spec.fit,braking:false};
 });
}
/** A body's centre, half width and half length, from its fitted box (riders sit off-centre in most bodies). */
const body=(fit:CarFit)=>({x:(fit.box.minX+fit.box.maxX)/2,z:(fit.box.minZ+fit.box.maxZ)/2,w:(fit.box.maxX-fit.box.minX)/2,l:(fit.box.maxZ-fit.box.minZ)/2});
const centre=(car:CarPose,fit:CarFit)=>{const b=body(fit),c=Math.cos(car.yaw),s=Math.sin(car.yaw);return {x:car.x+c*b.x+s*b.z,z:car.z-s*b.x+c*b.z};};
/** Position of `p` in the frame of a body centred at `at` facing `yaw`: forward and sideways (positive to the driver's right). */
function local(at:Point,yaw:number,p:Point){const dx=p.x-at.x,dz=p.z-at.z,s=Math.sin(yaw),c=Math.cos(yaw);return {ahead:dx*s+dz*c,right:-dx*c+dz*s};}
/**
 * Advance every car. `vehicles` are other cars on the road (the player's, police, parked); `people` are walkers.
 * Returns the cars that sounded their horn this step.
 */
export function trafficStep(cars:TrafficCar[],loops:readonly TrafficLoop[],dt:number,vehicles:readonly CarState[],people:readonly Mover[]):TrafficCar[]{
 const horns:TrafficCar[]=[];
 for(const car of cars){
  const loop=loops[car.loop],me=body(car.fit),at=centre(car,car.fit),reach=8+car.speed*1.9;
  let gap=Infinity,stoppedVehicle=false,person=false,blocker=0;
  /** `wide` and `long` are the other's extent across and along this car's heading. */
  const consider=(p:Point,wide:number,long:number,moving:boolean,isPerson:boolean,yaw?:number,other?:TrafficCar)=>{
   const q=local(at,car.yaw,p);if(q.ahead<=0||q.ahead>reach+me.l+long)return;if(Math.abs(q.right)>me.w+wide+.35)return;
   // A passing car does not wait for oncoming traffic; the oncoming car stops for it.
   if(other&&car.pass>0&&Math.cos(other.yaw-car.yaw)<0)return;
   const d=q.ahead-me.l-long;if(d<gap){gap=d;stoppedVehicle=!moving&&!isPerson&&Math.abs(q.right)<1.2&&(yaw===undefined||Math.cos(yaw-car.yaw)>.7);person=isPerson;blocker=long*2;}
  };
  const vehicle=(v:CarPose&{speed:number;fit:CarFit},other?:TrafficCar)=>{const b=body(v.fit),c=Math.abs(Math.cos(v.yaw-car.yaw)),s=Math.abs(Math.sin(v.yaw-car.yaw));consider(centre(v,v.fit),c*b.w+s*b.l,c*b.l+s*b.w,Math.abs(v.speed)>.5,false,v.yaw,other);};
  for(const other of cars)if(other!==car&&Math.abs(other.x-car.x)<45&&Math.abs(other.z-car.z)<45)vehicle(other,other);
  for(const v of vehicles)if(Math.abs(v.x-car.x)<45&&Math.abs(v.z-car.z)<45)vehicle(v);
  for(const p of people)if(Math.abs(p.x-car.x)<30&&Math.abs(p.z-car.z)<30)consider(p,p.radius+.4,p.radius,!!p.moving,true);
  const here=sample(loop,car.s),ahead=sample(loop,car.s+Math.max(6,car.speed*2.2));
  let target=Math.min(here.limit,ahead.limit);
  if(gap<Infinity)target=Math.min(target,Math.sqrt(2*BRAKE*.7*Math.max(0,gap-1.6)));
  car.braking=target<car.speed-.3;car.speed=target>car.speed?Math.min(target,car.speed+ACCEL*dt):Math.max(target,car.speed-BRAKE*dt);
  // A stopped vehicle in the lane: pull out into the other lane, pass it, then pull back in.
  car.wait=car.speed<.3&&gap<6?car.wait+dt:0;
  if(car.wait>2.2&&stoppedVehicle&&car.pass<=0)car.pass=gap+blocker+2*me.l+10;
  if(car.wait>3.5&&(person||car.wait>6)&&Math.floor((car.wait-dt)/4)!==Math.floor(car.wait/4))horns.push(car);
  const wanted=car.pass>0?-2*LANE:0;car.shift+=(wanted-car.shift)*Math.min(1,dt*1.6);if(Math.abs(car.shift-wanted)<.02)car.shift=wanted;
  // Pulling out from a standstill creeps forward while the car swings into the other lane.
  if(car.pass>0){if(car.speed<2.5&&gap>.8)car.speed=Math.min(2.5,car.speed+ACCEL*dt);if(Math.abs(car.shift-wanted)<.4)car.pass-=car.speed*dt;}
  // Never swing or roll into a player's vehicle beside the lane: hold position until it moves.
  const before={x:car.x,z:car.z,yaw:car.yaw,s:car.s,shift:car.shift,distance:car.distance},touching=(c:CarPose)=>vehicles.some(v=>carTouches(c,car.fit,carObstacle(v))),wasTouching=touching(car);
  car.s=(car.s+car.speed*dt)%loop.length;car.distance+=car.speed*dt;
  // The body, not the rider, is centred in the lane.
  const p=sample(loop,car.s),c=Math.cos(p.yaw),sn=Math.sin(p.yaw),lx=p.x-c*car.shift,lz=p.z+sn*car.shift;car.x=lx-c*me.x;car.z=lz+sn*me.x;
  const turn=Math.atan2(Math.sin(ahead.yaw-p.yaw),Math.cos(ahead.yaw-p.yaw));car.steer+=(Math.max(-.5,Math.min(.5,-turn))-car.steer)*Math.min(1,dt*5);car.yaw=p.yaw;
  if(!wasTouching&&touching(car)){Object.assign(car,before);car.speed=0;car.wait+=dt;}
 }
 return horns;
}
/** Solid footprints for collisions and line of fire. */
export const trafficRects=(cars:readonly TrafficCar[]):Rect[]=>cars.map(car=>carObstacle(car as unknown as CarState));
