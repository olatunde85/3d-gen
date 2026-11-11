/** A grounded waiting aircraft and one deterministic boarding / departure sequence. */
import {clearPath,distance,move,route,type Point,type Rect} from './world';
import type {MotorBody} from './motor';
export interface AirFit {stand:Point;guest:Point;hull:Rect;scale:number}
export interface AirState extends Point {y:number;yaw:number;phase:'waiting'|'approach'|'boarding'|'seated'|'alighting'|'departing';time:number;fit?:AirFit;approach?:AirApproach}
export const AIR_DURATION=1.1;
export function airOffset(a:AirState,p:Point){const c=Math.cos(a.yaw),s=Math.sin(a.yaw);return{x:a.x+c*p.x+s*p.z,z:a.z-s*p.x+c*p.z};}
export function airStand(a:AirState,guest=false){return airOffset(a,guest?a.fit?.guest??{x:2.3,z:0}:a.fit?.stand??{x:-1.6,z:0});}
export function airHull(a:AirState){const b=a.fit?.hull??{minX:-.7,maxX:1.6,minZ:-2,maxZ:1.7};return {...b,obb:{x:a.x,z:a.z,yaw:a.yaw,box:b}};}

/** Each occupant follows a capsule-safe ground route to their own fitted doorway. */
interface ApproachRoute {path:Point[];repath:number;stuck:number}
export interface AirApproach {pilot:ApproachRoute;guest?:ApproachRoute;deadline:number}
type Person=Point&{radius:number};
const PERSON_GAP=.035,APPROACH_SPEED=1.6;
function personRect(p:Person):Rect{return {minX:p.x-p.radius,maxX:p.x+p.radius,minZ:p.z-p.radius,maxZ:p.z+p.radius};}
function approachPath(body:MotorBody,to:Point,solids:readonly Rect[],bounds:Rect,people:readonly Person[]){
 // An already touching pair must be able to step apart before the other capsule
 // becomes a planning obstacle; each actual step still checks their separation.
 const occupied=people.filter(p=>distance(body,p)>body.radius+p.radius+PERSON_GAP).map(personRect),rects=[...solids,...occupied];
 const path=route(body,to,rects,body.radius+.04,bounds);return path.length?path:route(body,to,rects,body.radius,bounds);
}
export function beginAirApproach(air:AirState,pilot:MotorBody,guest:MotorBody|undefined,solids:readonly Rect[],bounds:Rect,people:readonly Person[]=[]):AirApproach{
 const rects=[...solids,airHull(air)],pilotPath=approachPath(pilot,airStand(air),rects,bounds,[...(guest?[guest]:[]),...people]),guestPath=guest?approachPath(guest,airStand(air,true),rects,bounds,[pilot,...people]):[];
 const length=(from:Point,path:Point[])=>path.reduce((sum,p,i)=>sum+distance(i?path[i-1]:from,p),0);
 return {pilot:{path:pilotPath,repath:.35,stuck:0},...(guest?{guest:{path:guestPath,repath:.35,stuck:0}}:{}),deadline:Math.min(30,Math.max(6,Math.max(length(pilot,pilotPath),guest?length(guest,guestPath):0)/APPROACH_SPEED+5))};
}
export function advanceAirApproach(air:AirState,plan:AirApproach,dt:number,pilot:MotorBody,guest:MotorBody|undefined,solids:readonly Rect[],bounds:Rect,people:readonly Person[]=[]):'ready'|'moving'|'blocked'{
 const rects=[...solids,airHull(air)];
 const advance=(body:MotorBody,to:Point,state:ApproachRoute,others:readonly Person[])=>{
  const before={x:body.x,z:body.z};body.speed=0;
  if(distance(body,to)<.045&&others.every(p=>distance(body,p)>=body.radius+p.radius+PERSON_GAP)){body.yaw=air.yaw;return true;}
  state.repath-=dt;if(state.repath<=0){state.path=approachPath(body,to,rects,bounds,others);state.repath=.35;}
  while(state.path.length>1&&distance(body,state.path[0])<.15&&clearPath(body,state.path[1],rects,body.radius))state.path.shift();
  const point=state.path[0];if(point){const gap=distance(body,point),amount=Math.min(gap,APPROACH_SPEED*dt),vx=gap>.001?(point.x-body.x)/gap:0,vz=gap>.001?(point.z-body.z)/gap:0;
   const attempt=(angle:number)=>{const c=Math.cos(angle),s=Math.sin(angle),next=move(body,(vx*c-vz*s)*amount,(vx*s+vz*c)*amount,body.radius,rects);return others.every(p=>distance(next,p)>=body.radius+p.radius+PERSON_GAP||distance(next,p)>distance(body,p)+.001)?next:before;};
   let next=attempt(0);if(distance(next,before)<amount*.3)for(const angle of [.45,-.45,.9,-.9,1.3,-1.3,Math.PI/2,-Math.PI/2,2.4,-2.4,Math.PI]){const candidate=attempt(angle);if(distance(candidate,before)>amount*.4){next=candidate;break;}}
   body.x=next.x;body.z=next.z;body.speed=distance(before,body)/dt;
   if(distance(body,point)<.045)state.path.shift();
   if(body.speed>.03){const want=Math.atan2(body.x-before.x,body.z-before.z),delta=Math.atan2(Math.sin(want-body.yaw),Math.cos(want-body.yaw));body.yaw+=delta*Math.min(1,dt*14);}
  }
  state.stuck=body.speed<.03?state.stuck+dt:0;return false;
 };
 const pilotReady=advance(pilot,airStand(air),plan.pilot,[...(guest?[guest]:[]),...people]),guestReady=!guest||advance(guest,airStand(air,true),plan.guest!,[pilot,...people]);
 if(pilotReady&&guestReady)return 'ready';if(air.time>plan.deadline||plan.pilot.stuck>2.5||plan.guest&&plan.guest.stuck>2.5)return 'blocked';return 'moving';
}
