/** Fixed-step projectiles. Prediction and live play use exactly the same swept collisions. */
import {boxHit,type Point3} from './combat';
import {stanceHeight,type MotorBody,type Volume} from './motor';
export const GRENADE={release:.82,duration:2.2,fuse:2.6,radius:.055,blast:5,damage:150,gravity:9.8,maxRange:16}as const;
export interface Grenade {id:number;position:Point3;velocity:Point3;age:number}
export interface Explosion {id:number;position:Point3;time:number}
export interface GrenadeThrow {time:number;released:boolean;target:Point3;yaw:number}
export function throwOrigin(body:MotorBody,yaw=body.yaw):Point3 {
 const scale=body.animationScale??body.height/1.8;
 if(body.grenadeRelease){const p=body.grenadeRelease;return {x:body.x+p.x*Math.cos(yaw)+p.z*Math.sin(yaw),y:body.y+p.y,z:body.z+p.z*Math.cos(yaw)-p.x*Math.sin(yaw)};}
 // Right hand at the release key: slightly right of centre and forward of the torso.
 return {x:body.x+(.38*Math.sin(yaw)-.2*Math.cos(yaw))*scale,y:body.y+body.height*.66,z:body.z+(.38*Math.cos(yaw)+.2*Math.sin(yaw))*scale};
}
export function grenadeLaunch(body:MotorBody,target:Point3,id=0):Grenade {
 const yaw=Math.atan2(target.x-body.x,target.z-body.z),position=throwOrigin(body,yaw),dx=target.x-position.x,dz=target.z-position.z,distance=Math.hypot(dx,dz),range=Math.min(GRENADE.maxRange,distance),flight=.65+range*.045,vertical=Math.max(-3,Math.min(5,target.y))-position.y;
 return {id,position,velocity:{x:distance>.001?dx/distance*range/flight:0,y:(vertical+GRENADE.gravity*flight*flight/2)/flight,z:distance>.001?dz/distance*range/flight:0},age:0};
}
/** Release cannot begin on the far side of cover just because the arm reaches through it. */
export function safeLaunch(body:MotorBody,target:Point3,volumes:readonly Volume[],id=0):Grenade {
 const grenade=grenadeLaunch(body,target,id),from={x:body.x,y:grenade.position.y,z:body.z},delta={x:grenade.position.x-from.x,y:0,z:grenade.position.z-from.z};
 let nearest=1;
 for(const v of volumes){const t=boxHit(from,delta,{x:v.minX-GRENADE.radius,y:0,z:v.minZ-GRENADE.radius},{x:v.maxX+GRENADE.radius,y:v.h+GRENADE.radius,z:v.maxZ+GRENADE.radius},nearest);if(t!==undefined){nearest=t;const f=Math.max(0,t-.02);grenade.position={x:from.x+delta.x*f,y:from.y,z:from.z+delta.z*f};}}
 return grenade;
}
export function advanceGrenade(g:Grenade,dt:number,volumes:readonly Volume[]){
 g.age+=dt;g.velocity.y-=GRENADE.gravity*dt;
 let remaining=dt;
 for(let bounce=0;bounce<5&&remaining>1e-6;bounce++){
  const p=g.position,v=g.velocity,delta={x:v.x*remaining,y:v.y*remaining,z:v.z*remaining};let fraction=1,normal:Point3|undefined;
  if(delta.y<0&&p.y+delta.y<GRENADE.radius){fraction=Math.max(0,(GRENADE.radius-p.y)/delta.y);normal={x:0,y:1,z:0};}
  for(const volume of volumes){
   const min={x:volume.minX-GRENADE.radius,y:-GRENADE.radius,z:volume.minZ-GRENADE.radius},max={x:volume.maxX+GRENADE.radius,y:volume.h+GRENADE.radius,z:volume.maxZ+GRENADE.radius},t=boxHit(p,delta,min,max,fraction);
   if(t===undefined||t>fraction)continue;
   const hit={x:p.x+delta.x*t,y:p.y+delta.y*t,z:p.z+delta.z*t};
   const faces=([['x',min.x,-1],['x',max.x,1],['y',max.y,1],['z',min.z,-1],['z',max.z,1]]as const).map(([axis,value,sign])=>({axis,sign,gap:Math.abs(hit[axis]-value)})).sort((a,b)=>a.gap-b.gap),face=faces[0];
   // Ignore a touching face when moving away from it.
   if(t<1e-7&&delta[face.axis]*face.sign>=0)continue;
   fraction=t;normal={x:0,y:0,z:0};normal[face.axis]=face.sign;
  }
  p.x+=delta.x*fraction;p.y+=delta.y*fraction;p.z+=delta.z*fraction;
  if(!normal)break;
  p.x+=normal.x*.0001;p.y+=normal.y*.0001;p.z+=normal.z*.0001;
  const dot=v.x*normal.x+v.y*normal.y+v.z*normal.z;
  v.x-=1.38*dot*normal.x;v.y-=1.38*dot*normal.y;v.z-=1.38*dot*normal.z;
  if(normal.y>0){v.x*=.72;v.z*=.72;if(Math.abs(v.y)<.3)v.y=0;}
  remaining*=1-fraction;
 }
}
export function predictGrenade(body:MotorBody,target:Point3,volumes:readonly Volume[]){
 const g=safeLaunch(body,target,volumes),points:Point3[]=[{...g.position}];
 for(let i=0;g.age<GRENADE.fuse-1e-7;i++){advanceGrenade(g,1/60,volumes);if(i%4===3)points.push({...g.position});}
 points.push({...g.position});return {points,landing:{...g.position}};
}
/** Sample three body heights: a low crate shields legs, a full wall shields everything. */
export function blastDamage(origin:Point3,body:MotorBody,volumes:readonly Volume[]):number {
 const distance=Math.hypot(origin.x-body.x,origin.y-(body.y+stanceHeight(body)*.45),origin.z-body.z);
 if(distance>=GRENADE.blast)return 0;
 let exposed=0;
 for(const height of [.2,.55,.85]){
  const delta={x:body.x-origin.x,y:body.y+stanceHeight(body)*height-origin.y,z:body.z-origin.z};
  if(!volumes.some(v=>{const t=boxHit(origin,delta,{x:v.minX,y:0,z:v.minZ},{x:v.maxX,y:v.h,z:v.maxZ},1);return t!==undefined&&t<1-1e-5;}))exposed++;
 }
 return exposed?Math.max(1,Math.round(GRENADE.damage*Math.min(1,(GRENADE.blast-distance)/(GRENADE.blast-1.2))*exposed/3)):0;
}
