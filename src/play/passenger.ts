/** A companion reaches a real door before boarding; occupied seats follow one shared car. */
import {distance,route,move,type Point,type Rect} from './world';
import {carObstacle,passengerStand,passengerSeat,passengerEntryClear,DRIVE,type CarState} from './driving';
import type {CompanionState} from './companion';
export function canBoardPassenger(c:CompanionState,car:CarState,rects:readonly Rect[],people:readonly (Point&{radius:number})[],bounds:Rect){
 const stand=passengerStand(car);return c.rescued&&c.combat.health>0&&!c.waiting&&c.grounded&&c.y<.1&&distance(c,stand)<10&&passengerEntryClear(car,c.radius,rects,people,bounds)&&route(c,stand,[...rects,carObstacle(car)],c.radius,bounds).length>0;
}
export function beginPassenger(c:CompanionState){c.riding={phase:'approaching',time:0};c.path=[];c.repath=0;c.stuck=0;}
/** Returns false only when a blocked approach was cancelled, never by teleporting the guest. */
export function stepPassenger(c:CompanionState,car:CarState,dt:number,rects:readonly Rect[],people:readonly (Point&{radius:number})[],bounds:Rect){
 const ride=c.riding;if(!ride)return true;c.speed=0;const stand=passengerStand(car),seat=passengerSeat(car);c.grounded=true;c.y=0;c.vy=0;
 if(ride.phase==='seated'){Object.assign(c,seat,{yaw:car.yaw,state:'seated',speed:Math.abs(car.speed)});return true;}
 if(ride.phase==='approaching'){
  c.state='boarding';ride.time+=dt;const obstacles=[...rects,carObstacle(car)];
  if(!passengerEntryClear(car,c.radius,rects,people,bounds)){c.stuck+=dt;}else{
   c.repath-=dt;if(c.repath<=0){c.path=route(c,stand,obstacles,c.radius,bounds);c.repath=.35;}
   while(c.path.length&&distance(c,c.path[0])<.05)c.path.shift();
   const target=c.path[0];if(target){const d=distance(c,target),amount=Math.min(d,dt*3.2),next=move(c,(target.x-c.x)/d*amount,(target.z-c.z)/d*amount,c.radius,obstacles),safe=people.every(p=>distance(next,p)>=c.radius+p.radius+.025||distance(next,p)>distance(c,p)+.001),old={x:c.x,z:c.z};if(safe)Object.assign(c,next);c.speed=distance(old,c)/dt;if(c.speed>.03)c.yaw=Math.atan2(c.x-old.x,c.z-old.z);c.stuck=c.speed<.05?c.stuck+dt:0;}
   if(distance(c,stand)<.05){Object.assign(c,stand);ride.phase='boarding';ride.time=0;c.path=[];c.speed=0;}
  }
  if(c.stuck>4||ride.time>15){c.riding=undefined;c.waiting=true;c.state='blocked';c.path=[];return false;}return true;
 }
 c.state=ride.phase==='boarding'?'boarding':'alighting';ride.time+=dt;const p=Math.min(1,ride.time/(ride.phase==='boarding'?DRIVE.boarding:DRIVE.alighting)),w=p*p*(3-2*p),weight=ride.phase==='boarding'?1-w:w;
 Object.assign(c,{x:seat.x+(stand.x-seat.x)*weight,z:seat.z+(stand.z-seat.z)*weight,yaw:car.yaw});
 if(p===1){if(ride.phase==='boarding'){ride.phase='seated';ride.time=0;c.state='seated';Object.assign(c,seat);}else{c.riding=undefined;c.waiting=false;c.state='following';Object.assign(c,stand);c.path=[];c.repath=0;}}return true;
}
