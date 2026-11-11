import {isGun,weaponProfile} from './weapons';
import {roleProfile} from './enemy-roles';
/** Independent perception and navigation, with local spacing and a shared hearing response. */
import {AGGRESSION,type EnemyRole} from './enemies';
import {blocked,distance,move,route,type Point,type Rect} from './world';
import {sight,type MotorBody,type Volume} from './motor';
import {chest,traceShot,type Combatant} from './combat';
export type GuardMode='patrol'|'investigate'|'chase'|'search';
export interface EnemyState extends MotorBody,EnemyRole {vehicle?:boolean;combat:Combatant;target:'player'|'companion';mode:GuardMode;awareness:number;lastKnown:Point;patrol:number;repath:number;path:Point[];unseen:number;searchTime:number;stuck:number;scanTime?:number;retreat?:number;moraleBroken?:boolean;foundBodies?:string[]}
export function enemyVolume(e:MotorBody&{id?:string}):Volume{return {minX:e.x-e.radius*.75,maxX:e.x+e.radius*.75,minZ:e.z-e.radius*.75,maxZ:e.z+e.radius*.75,h:e.height,id:e.id??'companion',climbable:false};}
export function investigate(e:EnemyState,point:Point){if(e.combat.health<=0||e.mode==='chase')return;e.mode='investigate';e.lastKnown={...point};e.searchTime=0;e.repath=0;}
export interface EnemyTick {dt:number;player:MotorBody;companion?:MotorBody;companionActive?:boolean;enemies:EnemyState[];patrol:readonly Point[];volumes:readonly Volume[];rects:readonly Rect[];navigationVolumes?:readonly Volume[];bounds?:Rect;protectedPlayer?:boolean;bodies?:boolean;morale?:number;visibility?:number|((body:MotorBody)=>number);emit:(type:string,text:string)=>void}
export function updateEnemies({dt,player,companion,companionActive=false,enemies,patrol,volumes,rects,navigationVolumes=volumes,bounds,protectedPlayer=false,bodies=false,morale=1,visibility=1,emit}:EnemyTick){
 const targets:[('player'|'companion'),MotorBody][]=[['player',player]];if(companion&&companionActive)targets.push(['companion',companion]);
 // Perception reads the same player position for every enemy before any enemy moves.
 for(const e of enemies){
  if(e.combat.health<=0){e.speed=0;continue;}
  if(morale<1&&!e.moraleBroken){e.moraleBroken=true;e.retreat=4;e.awareness=Math.min(.3,e.awareness);e.mode='search';e.searchTime=0;e.repath=0;const choices=patrol.filter(p=>!blocked(p,e.radius,rects)&&route(e,p,rects,e.radius,bounds).length);e.lastKnown=choices.sort((a,b)=>distance(b,player)-distance(a,player))[0]??{x:e.x,z:e.z};}
  if(morale===1&&e.moraleBroken){e.moraleBroken=false;e.retreat=0;}e.retreat=Math.max(0,(e.retreat??0)-dt);
  // Bodies trigger one investigation per observer, including silent takedowns.
  if(bodies)for(const body of enemies)if(body!==e&&body.combat.health<=0&&distance(e,body)<8&&!(e.foundBodies??[]).includes(body.id)&&sight(e,body,volumes)){(e.foundBodies??=[]).push(body.id);e.awareness=Math.max(e.awareness,.65);investigate(e,body);emit('body-found','A guard discovered a fallen squad member.');}
  const original=AGGRESSION[e.aggression],profile={...original,range:original.range*(e.kind==='sniper'?3.6:e.kind&&e.kind!=='guard'?1.4:1)*(morale<1?.85:1),detection:original.detection*morale},visible=protectedPlayer||(e.retreat??0)>0?[]:targets.filter(([,body])=>{const gap=distance(body,e),angle=Math.atan2(body.x-e.x,body.z-e.z),facing=Math.abs(Math.atan2(Math.sin(angle-e.yaw),Math.cos(angle-e.yaw)));const light=typeof visibility==='function'?visibility(body):visibility;return gap<(e.mode==='chase'?profile.range+4:profile.range)*light&&(e.mode==='chase'||facing<Math.PI*.4||gap<2.5)&&sight(e,body,volumes);}).sort((a,b)=>distance(a[1],e)*(a[0]===e.target ? .8 : 1)-distance(b[1],e)*(b[0]===e.target ? .8 : 1)),sees=visible.length>0;
  e.awareness=Math.max(0,Math.min(1,e.awareness+dt*(sees?profile.detection:-.6)));
  if(sees){const [id,body]=visible[0];if(e.target!==id)e.repath=0;e.target=id;e.unseen=0;e.lastKnown={x:body.x,z:body.z};if(e.awareness>=1&&e.mode!=='chase'){e.mode='chase';e.repath=0;emit('spotted',id==='companion'?'Your companion was spotted. Protect them.':'Spotted. Break the enemies’ line of sight.');for(const other of enemies)if(other!==e&&distance(other,e)<10)investigate(other,e.lastKnown);}}
  else e.unseen+=dt;
  if(e.mode==='chase'&&e.unseen>profile.forget){e.mode='search';e.searchTime=0;e.repath=0;emit('lost','An enemy lost sight and is searching your last position.');}
  if(e.mode==='search'||e.mode==='investigate'){e.searchTime+=dt;if(e.searchTime>profile.search){e.mode='patrol';e.searchTime=0;e.repath=0;}}
 }
 // Nearby enemies occupy space, instead of sharing a path and passing through each other.
 for(const [index,e]of enemies.entries()){
  if(e.combat.health<=0){e.speed=0;continue;}
  if(e.vehicle){e.speed=0;continue;}
  const target=e.target==='companion'&&companionActive&&companion?companion:player,targetId=target===companion?'companion':'player';
  // Armed guards stop to aim when they have a clear shot, then pursue again if cover blocks it.
  if(!protectedPlayer&&isGun(e.response)&&e.mode==='chase'&&distance(e,target)<(e.kind?roleProfile(e.kind).range:e.response==='pistol'?14:weaponProfile(e.response).range)&&traceShot(e,chest(target),volumes,[{id:'player',body:player,alive:true},...(companion?[{id:'companion',body:companion,alive:true}]:[]),...enemies.filter(other=>other!==e).map(other=>({id:other.id,body:other,alive:other.combat.health>0}))],e.kind==='sniper'?42:weaponProfile(e.combat.weapon).range).hit===targetId){
   e.speed=0;const angle=Math.atan2(target.x-e.x,target.z-e.z),delta=Math.atan2(Math.sin(angle-e.yaw),Math.cos(angle-e.yaw));e.yaw+=delta*Math.min(1,dt*12);continue;
  }
  if(e.kind==='sniper'){e.speed=0;if(e.mode==='patrol'){e.scanTime=(e.scanTime??0)+dt;const angle=Math.atan2(patrol[0].x-e.x,patrol[0].z-e.z);e.yaw=angle+.45*Math.sin(e.scanTime*.3);}continue;}
  if(e.kind==='heavy'&&e.mode==='chase'&&e.unseen<2.4&&distance(e,target)<roleProfile(e.kind).range){e.speed=0;continue;}
  let goal=e.mode==='patrol'?patrol[e.patrol%patrol.length]:e.lastKnown;
  if(blocked(goal,e.radius,rects)){const choices:Point[]=[];for(const v of navigationVolumes)if(blocked(goal,e.radius,[v])){const pad=e.radius+.15;choices.push({x:v.minX-pad,z:Math.max(v.minZ,Math.min(v.maxZ,goal.z))},{x:v.maxX+pad,z:Math.max(v.minZ,Math.min(v.maxZ,goal.z))},{x:Math.max(v.minX,Math.min(v.maxX,goal.x)),z:v.minZ-pad},{x:Math.max(v.minX,Math.min(v.maxX,goal.x)),z:v.maxZ+pad});}goal=choices.filter(p=>!blocked(p,e.radius,rects)).sort((a,b)=>distance(a,e)-distance(b,e))[0]??goal;}
  if(e.mode==='patrol'&&distance(e,goal)<.55){e.patrol=(e.patrol+1)%patrol.length;goal=patrol[e.patrol];e.repath=0;}
  e.repath-=dt;if(e.repath<=0){
   e.path=route(e,goal,rects,e.radius+.04,bounds);
   // Steering can leave an actor inside the planner's comfort margin at a corner.
   // Recover using its real collision radius, rather than rejecting every route.
   if(!e.path.length)e.path=route(e,goal,rects,e.radius,bounds);
   e.repath=.45+index*.025;
  }
  while(e.path.length&&distance(e,e.path[0])<.22)e.path.shift();
  const point=e.path[0],before={x:e.x,z:e.z},others=[...enemies.filter(other=>other!==e&&other.combat.health>0),...(companion?[companion]:[])];
  if(point){
   const d=distance(e,point),speed=e.mode==='chase'?AGGRESSION[e.aggression].speed*(morale<1?.7:1):e.mode==='investigate'?2.3:1.5;
   let vx=(point.x-e.x)/d,vz=(point.z-e.z)/d;
   for(const other of others){const gap=distance(e,other),space=e.radius+other.radius+.4;if(gap<space&&gap>.001){const push=(space-gap)/space*1.8;vx+=(e.x-other.x)/gap*push;vz+=(e.z-other.z)/gap*push;}}
   const length=Math.hypot(vx,vz),amount=Math.min(d,speed*dt),solids=rects;
   const avoid=(dx:number,dz:number)=>{const next=move(e,dx,dz,e.radius,solids);return others.every(other=>distance(next,other)>=e.radius+other.radius+.005)?next:{x:e.x,z:e.z};};
   if(length>.01){let next=avoid(vx/length*amount,vz/length*amount);
    // Try both sides and, if necessary, yield backwards. A single sidestep can
    // point into an approaching actor and leave a whole queue permanently stuck.
    if(distance(next,e)<amount*.5&&others.some(other=>distance(other,e)<1.5)){
     for(const angle of [Math.PI/4,-Math.PI/4,Math.PI/2,-Math.PI/2,Math.PI*.75,-Math.PI*.75,Math.PI]){
      const c=Math.cos(angle),s=Math.sin(angle),candidate=avoid((vx*c-vz*s)/length*amount,(vx*s+vz*c)/length*amount);
      if(distance(candidate,e)>amount*.5){next=candidate;break;}
     }
    }
    e.x=next.x;e.z=next.z;
   }
  }
  e.speed=distance(before,e)/dt;e.stuck=e.speed<.05?e.stuck+dt:0;if(e.stuck>1){e.repath=0;e.stuck=0;}
  if(e.speed>.03){const yaw=Math.atan2(e.x-before.x,e.z-before.z),delta=Math.atan2(Math.sin(yaw-e.yaw),Math.cos(yaw-e.yaw));e.yaw+=delta*Math.min(1,dt*10);}
 }
}
