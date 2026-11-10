/** A grounded escort follows reachable routes; it never warps through props to catch up. */
import {blocked,clearPath,distance,move,route,type Point,type Rect} from './world';
import type {MotorBody} from './motor';
import {makeCombatant,type Combatant,type Health} from './combat';
export interface CompanionState extends MotorBody {
 riding?:{phase:'approaching'|'boarding'|'seated'|'alighting';time:number};
 combat:Combatant;rescued:boolean;located:boolean;waiting:boolean;
 state:'captive'|'following'|'catching-up'|'waiting'|'ground'|'blocked'|'safe'|'boarding'|'seated'|'alighting';
 path:Point[];repath:number;goal?:Point;stuck:number;
}
export function createCompanion(body:MotorBody,spawn:Point&{yaw:number},health:Health):CompanionState {
 return {...body,...spawn,riding:undefined,y:0,vy:0,speed:0,grounded:true,airTime:0,landing:0,radius:.34,combat:makeCombatant({weapon:'none',health,ammunition:24}),rescued:false,located:false,waiting:false,state:'captive',path:[],repath:0,stuck:0};
}
export interface EscortTick {dt:number;companion:CompanionState;player:MotorBody;rects:readonly Rect[];others:readonly (Point&{radius:number})[];exit:Point;bounds?:Rect;busy?:boolean}
export function updateCompanion({dt,companion:c,player,rects,others,exit,bounds,busy=false}:EscortTick){
 c.speed=0;c.y=0;c.vy=0;c.grounded=true;
 if(c.combat.health<=0)return;
 if(!c.rescued){c.state='captive';return;}
 if(c.waiting||busy){c.state='waiting';return;}
 if(player.y>.15||!player.grounded){c.state='ground';c.path=[];c.repath=0;return;}
 const extracting=distance(player,exit)<2.8,gap=distance(c,player);
 if(extracting&&distance(c,exit)<1.8){c.state='safe';return;}
 let goal:Point;
 if(extracting){
  const slots=[{x:exit.x-1,z:exit.z},{x:exit.x+1,z:exit.z},{x:exit.x,z:exit.z-1},{x:exit.x,z:exit.z+1}];
  goal=slots.filter(p=>!blocked(p,c.radius+.04,rects)&&distance(p,player)>c.radius+player.radius+.08).sort((a,b)=>distance(c,a)-distance(c,b))[0]??exit;
 }else{
  if(gap<1.45){c.state='following';c.path=[];return;}
  const behind={x:player.x-Math.sin(player.yaw)*1.35,z:player.z-Math.cos(player.yaw)*1.35};goal=blocked(behind,c.radius+.04,rects)?{x:player.x,z:player.z}:behind;
 }
 c.repath-=dt;if(c.repath<=0||!c.goal||distance(c.goal,goal)>1){c.path=route(c,goal,rects,c.radius+.04,bounds);if(!c.path.length)c.path=route(c,goal,rects,c.radius,bounds);c.repath=.35;c.goal=goal;}
 while(c.path.length&&distance(c,c.path[0])<.18)c.path.shift();
 const point=c.path[0];if(!point){c.state=distance(c,goal)<.3?'following':'blocked';return;}
 const before={x:c.x,z:c.z},d=distance(c,point),speed=extracting||gap>3.5?4.7:2.2,amount=Math.min(d,speed*dt),vx=(point.x-c.x)/d,vz=(point.z-c.z)/d;
 const safe=(dx:number,dz:number)=>{const next=move(c,dx,dz,c.radius,rects);return others.every(o=>{const n=distance(next,o),old=distance(c,o);return n>=c.radius+o.radius+.025||n>old+.001;})?next:{...before};};
 let next=safe(vx*amount,vz*amount);
 if(distance(next,c)<amount*.3)for(const angle of [.4,-.4,.8,-.8,1.2,-1.2,Math.PI/2,-Math.PI/2]){const co=Math.cos(angle),si=Math.sin(angle),candidate=safe((vx*co-vz*si)*amount,(vx*si+vz*co)*amount);if(distance(candidate,c)>amount*.4){next=candidate;break;}}
 c.x=next.x;c.z=next.z;c.speed=distance(before,c)/dt;c.stuck=c.speed<.05?c.stuck+dt:0;
 if(c.stuck>.8){c.repath=0;if(c.goal&&clearPath(c,player,rects,c.radius))c.goal=undefined;}
 c.state=c.stuck>2?'blocked':gap>3.5?'catching-up':'following';
 if(c.speed>.03){const yaw=Math.atan2(c.x-before.x,c.z-before.z),delta=Math.atan2(Math.sin(yaw-c.yaw),Math.cos(yaw-c.yaw));c.yaw+=delta*Math.min(1,dt*14);}
}
