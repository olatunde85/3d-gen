/** Height-aware movement and safe contextual traversal; no character meshes are scaled. */
import {blocked,move,clearPath,distance,rectLocal,type Rect,type Point,WORLD} from './world';
export interface Volume extends Rect {h:number;baseY?:number;id:string;climbable:boolean}
export interface MotorBody extends Point {grenadeRelease?:{x:number;y:number;z:number};y:number;vy:number;height:number;animationScale?:number;crouch?:number;radius:number;grounded:boolean;airTime:number;landing:number;yaw:number;speed:number}
export interface Traversal {landingDrop?:number;kind:'vault'|'climb';block:string;from:{x:number;y:number;z:number};to:{x:number;y:number;z:number};normal:Point;near:number;depth:number;rise:number;scale:number;time:number;duration:number;approach:boolean}
/** Standing height stays immutable; stance changes sight and hit geometry, never mesh scale. */
export const stanceHeight=(b:MotorBody)=>b.height*(1-.33*(b.crouch??0));
export const bodyScale=(b:MotorBody)=>b.animationScale??b.height/1.8;
const contains=(point:Point,v:Rect,margin=0)=>{const p=v.obb?rectLocal(point,v.obb):point,r=v.obb?.box??v;return p.x>=r.minX+margin&&p.x<=r.maxX-margin&&p.z>=r.minZ+margin&&p.z<=r.maxZ-margin;};
export function supportAt(p:Point,maxY:number,volumes:readonly Volume[],radius=0):number {let y=0;for(const v of volumes)if(v.climbable&&v.h<=maxY+.001&&(radius?blocked(p,radius,[v]):contains(p,v,.06)))y=Math.max(y,v.h);return y;}
export const atHeight=(volumes:readonly Volume[],y:number,height=1.8)=>volumes.filter(v=>v.h>y+.025&&(v.baseY??0)<y+height-.025);
export function sight(from:MotorBody,to:MotorBody,volumes:readonly Volume[]):boolean {
 const ay=from.y+stanceHeight(from)*.87,by=to.y+stanceHeight(to)*.82;
 return !volumes.some(v=>{const a=v.obb?rectLocal(from,v.obb):from,b=v.obb?rectLocal(to,v.obb):to,r=v.obb?.box??v;let lo=0,hi=1;for(const axis of ['x','z']as const){const min=axis==='x'?r.minX:r.minZ,max=axis==='x'?r.maxX:r.maxZ,d=b[axis]-a[axis];if(Math.abs(d)<1e-8){if(a[axis]<min||a[axis]>max)return false;}else{const x=(min-a[axis])/d,y=(max-a[axis])/d;lo=Math.max(lo,Math.min(x,y));hi=Math.min(hi,Math.max(x,y));if(lo>hi)return false;}}const y0=ay+(by-ay)*lo,y1=ay+(by-ay)*hi;return Math.min(y0,y1)<v.h&&Math.max(y0,y1)>(v.baseY??0);});
}

/** Gravity continues after walking off a roof. Landing only occurs on a swept, supporting top. */
export function motorStep(body:MotorBody,dx:number,dz:number,dt:number,volumes:readonly Volume[],jump=false,bounds:Rect=WORLD){
 body.landing=Math.max(0,body.landing-dt);const wasGrounded=body.grounded;
 if(jump&&body.grounded){body.vy=5.5*Math.sqrt(bodyScale(body));body.grounded=false;body.airTime=0;body.landing=0;}
 const beforeY=body.y;
 if(!body.grounded){body.vy-=14*dt;body.y+=body.vy*dt;body.airTime+=dt;if(body.vy>0){const head=stanceHeight(body),ceiling=volumes.filter(v=>(v.baseY??0)>beforeY+head-.001&&(v.baseY??0)<=body.y+head&&blocked(body,body.radius,[v])).sort((a,b)=>(a.baseY??0)-(b.baseY??0))[0];if(ceiling){body.y=ceiling.baseY!-head;body.vy=0;}}}
 const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.06));
 for(let i=0;i<steps;i++){
  const tryAxis=(axis:'x'|'z',delta:number)=>{const p={x:body.x,z:body.z};p[axis]+=delta;p[axis]=Math.max((axis==='x'?bounds.minX:bounds.minZ)+.2+body.radius,Math.min((axis==='x'?bounds.maxX:bounds.maxZ)-.2-body.radius,p[axis]));let solids=atHeight(volumes,body.y,stanceHeight(body));const hits=solids.filter(v=>blocked(p,body.radius,[v]));
   // A real step must be low, walkable and have clear standing space above it.
   if(body.grounded&&hits.length&&hits.every(v=>v.climbable&&v.h-body.y<=.26*Math.max(.9,bodyScale(body)))){const top=Math.max(...hits.map(v=>v.h));solids=atHeight(volumes,top,stanceHeight(body));if(!blocked(p,body.radius,solids)){body.y=top;body[axis]=p[axis];return;}}
   if(!blocked(p,body.radius,solids))body[axis]=p[axis];
  };
  tryAxis('x',dx/steps);tryAxis('z',dz/steps);
 }
 const floor=supportAt(body,Math.max(beforeY,body.y),volumes,body.radius);
 if(body.vy<=0&&body.y<=floor+.001){body.y=floor;body.vy=0;body.grounded=true;if(!wasGrounded&&body.airTime>.12)body.landing=.5;body.airTime=0;}
 else if(body.y>floor+.025&&body.grounded){body.grounded=false;body.vy=0;body.airTime=0;}
}
function rayEntry(p:Point,dir:Point,v:Rect):{distance:number;normal:Point}|undefined {
 if(v.obb){const o=v.obb,c=Math.cos(o.yaw),s=Math.sin(o.yaw),hit=rayEntry(rectLocal(p,o),{x:c*dir.x-s*dir.z,z:s*dir.x+c*dir.z},o.box);return hit?{...hit,normal:{x:c*hit.normal.x+s*hit.normal.z,z:-s*hit.normal.x+c*hit.normal.z}}:undefined;}
 let near=-Infinity,far=Infinity,normal={x:0,z:0};for(const axis of ['x','z']as const){const min=axis==='x'?v.minX:v.minZ,max=axis==='x'?v.maxX:v.maxZ,d=dir[axis];if(Math.abs(d)<1e-8){if(p[axis]<min||p[axis]>max)return;}else{const a=(min-p[axis])/d,b=(max-p[axis])/d,t=Math.min(a,b);if(t>near){near=t;normal=axis==='x'?{x:Math.sign(d),z:0}:{x:0,z:Math.sign(d)};}far=Math.min(far,Math.max(a,b));if(near>far)return;}}if(near<0||near>1.6)return;return {distance:near,normal};
}
/** Size and clearance choose the action. Walls and the locked mission gate are never climbable. */
export function planTraversal(body:MotorBody,dir:Point,volumes:readonly Volume[]):Traversal|undefined {
 if(!body.grounded||body.landing>0)return;const n=Math.hypot(dir.x,dir.z),forward=n>.1?{x:dir.x/n,z:dir.z/n}:{x:Math.sin(body.yaw),z:Math.cos(body.yaw)},scale=bodyScale(body);
 const candidates=volumes.map(v=>({v,hit:rayEntry(body,forward,v)})).filter((p):p is {v:Volume;hit:{distance:number;normal:Point}}=>!!p.hit).sort((a,b)=>a.hit.distance-b.hit.distance);
 const candidate=candidates[0];if(!candidate)return;const {v,hit}=candidate;if(v.obb)return orientedTraversal(body,forward,volumes,v.obb);if(v.id==='pickup-tailgate'&&hit.normal.z>0)return rearPickupTraversal(body,volumes,v);if(!v.climbable)return;const rise=v.h-body.y;if(rise<.28*scale||rise>1.65*scale)return;
 const normal=hit.normal,alongX=!!normal.x,depth=alongX?v.maxX-v.minX:v.maxZ-v.minZ,width=alongX?v.maxZ-v.minZ:v.maxX-v.minX,margin=body.radius+.12;
 if(width<margin*2)return;
 const lateral=alongX?Math.max(v.minZ+margin,Math.min(v.maxZ-margin,body.z)):Math.max(v.minX+margin,Math.min(v.maxX-margin,body.x));
 const edge=alongX?{x:normal.x>0?v.minX:v.maxX,z:lateral}:{x:lateral,z:normal.z>0?v.minZ:v.maxZ};
 const vault=rise>=.55*scale&&rise<=1.05*scale&&depth<=.65*scale;
 // Narrow barriers need no roof landing, unlike a climb.
 if(!vault&&(depth<body.radius+.2||rise<(v.id.startsWith('pickup-')?.5:.7)*scale))return;
 const near=vault?1.1*scale:body.radius+.08,from={x:edge.x-normal.x*near,y:body.y,z:edge.z-normal.z*near},inside=body.radius+.15;
 const to=vault?{x:edge.x+normal.x*(depth+1.35*scale),y:body.y,z:edge.z+normal.z*(depth+1.35*scale)}:{x:edge.x+normal.x*inside,y:v.h,z:edge.z+normal.z*inside};
 const groundSolids=atHeight(volumes,body.y);if(!clearPath(body,from,groundSolids,body.radius))return;
 const others=volumes.filter(o=>o.id!==v.id);
 if(blocked(to,body.radius,atHeight(others,to.y))||!vault&&!contains(to,v,inside-.03))return;
 if(vault&&Math.abs(supportAt(to,body.y+.2,volumes)-body.y)>.1)return;
 for(let i=0;i<=24;i++){const t=i/24,p={x:from.x+(to.x-from.x)*t,z:from.z+(to.z-from.z)*t},y=body.y+(vault?rise+.2:rise)*Math.sin(Math.PI*Math.min(1,t*1.2));if(blocked(p,body.radius,atHeight(others,Math.min(y,to.y+body.height))))return;}
 return {kind:vault?'vault':'climb',block:v.id,from,to,normal,near,depth,rise,scale,time:0,duration:vault?1.2:2.8,approach:distance(body,from)>.04};
}
/** Pull over the rear edge, then lower into the real bed instead of balancing on the thin tailgate. */
function rearPickupTraversal(body:MotorBody,volumes:readonly Volume[],gate:Volume):Traversal|undefined{
 const bed=volumes.find(v=>v.id==='pickup-bed');if(!bed||bed.h<=body.y+.1||gate.h<=bed.h||gate.h-body.y>1.65*bodyScale(body))return;
 const ledge:Volume={...bed,minZ:gate.minZ,h:gate.h,id:'pickup-rear-ledge',climbable:true},other=volumes.filter(v=>v!==gate&&v!==bed);
 const margin=body.radius+.12,x=Math.max(bed.minX+margin,Math.min(bed.maxX-margin,body.x));
 const t=planTraversal({...body,x},{x:0,z:1},[ledge,...other]);if(!t||t.kind!=='climb'||!clearPath(body,t.from,atHeight(volumes,body.y),body.radius))return;
 t.to={...t.to,y:bed.h,z:Math.max(t.to.z,bed.minZ+body.radius+.2,gate.maxZ+body.radius+.2)};
 if(!contains(t.to,bed,body.radius+.1)||blocked(t.to,body.radius,atHeight([...other,gate],bed.h)))return;
 const plan={...t,block:gate.id,landingDrop:gate.h-bed.h};
 for(let i=0;i<=32;i++){const point=traversalPosition({...plan,time:plan.duration*i/32});if(blocked(point,body.radius,atHeight(other,point.y)))return;}
 return plan;
}
/** Both the movement body and fitted contact animation share the final descent into a lower surface. */
export function traversalLandingDrop(t:Traversal,time:number){const u=Math.max(0,Math.min(1,(time-2.35)/.45));return (t.landingDrop??0)*u*u*(3-2*u);}
/** Solve contacts in the truck's own axes; transform the fitted motion back into the set. */
function orientedTraversal(body:MotorBody,dir:Point,volumes:readonly Volume[],o:NonNullable<Rect['obb']>):Traversal|undefined{
 const c=Math.cos(o.yaw),s=Math.sin(o.yaw),turn=(p:Point)=>({x:c*p.x+s*p.z,z:-s*p.x+c*p.z}),world=(p:Point)=>{const q=turn(p);return {x:o.x+q.x,z:o.z+q.z};};
 const local=volumes.map(v=>{if(v.obb&&Math.abs(v.obb.x-o.x)<1e-6&&Math.abs(v.obb.z-o.z)<1e-6&&Math.abs(v.obb.yaw-o.yaw)<1e-6)return {...v,...v.obb.box,obb:undefined};const corners=[{x:v.minX,z:v.minZ},{x:v.maxX,z:v.minZ},{x:v.minX,z:v.maxZ},{x:v.maxX,z:v.maxZ}].map(p=>rectLocal(p,o));return {...v,obb:undefined,minX:Math.min(...corners.map(p=>p.x)),maxX:Math.max(...corners.map(p=>p.x)),minZ:Math.min(...corners.map(p=>p.z)),maxZ:Math.max(...corners.map(p=>p.z))};});
 const t=planTraversal({...body,...rectLocal(body,o),yaw:body.yaw-o.yaw},{x:c*dir.x-s*dir.z,z:s*dir.x+c*dir.z},local);return t?{...t,from:{...t.from,...world(t.from)},to:{...t.to,...world(t.to)},normal:turn(t.normal)}:undefined;
}
const curve=(times:number[],values:number[],t:number)=>{let i=0;while(i<times.length-2&&t>times[i+1])i++;const u=Math.max(0,Math.min(1,(t-times[i])/(times[i+1]-times[i]))),s=u*u*(3-2*u);return values[i]+(values[i+1]-values[i])*s;};
export function fittedForward(t:Traversal,z:number){const scale=t.scale;if(t.kind==='climb')return z/.62*distance(t.from,t.to);const near=1.1,far=1.45;return z<=near?z*scale:z<far?t.near+(z-near)/.35*t.depth:t.near+t.depth+(z-far)*scale;}
export function traversalPosition(t:Traversal):{x:number;y:number;z:number}{
 const elapsed=Math.min(t.time,t.duration),vault=t.kind==='vault';
 const forward=vault?curve([0,.2,.35,.5,.65,.8,.95,1.2],[0,.45,.85,1.2,1.6,2.05,2.45,2.8],elapsed):curve([0,.5,.95,1.35,1.75,2.2,2.8],[-.02,-.07,-.05,.12,.24,.5,.62],elapsed);
 const h=vault?curve([0,.2,.35,.5,.65,.8,.95,1.2],[0,0,.15,.25,.2,0,0,0],elapsed)*t.scale:curve([0,.5,.95,1.35,1.75,2.2,2.8],[0,.5,1.02,1.37,1.6,2,2.15],elapsed)/2.15*t.rise;
 const z=fittedForward(t,forward);return {x:t.from.x+t.normal.x*z,y:t.from.y+h-traversalLandingDrop(t,elapsed),z:t.from.z+t.normal.z*z};
}
export function approachTraversal(body:MotorBody,t:Traversal,dt:number,volumes:readonly Volume[]):boolean {
 const d=distance(body,t.from);if(d<.04){body.x=t.from.x;body.z=t.from.z;body.yaw=Math.atan2(t.normal.x,t.normal.z);t.approach=false;body.speed=0;return true;}const amount=Math.min(d,1.8*dt),p=move(body,(t.from.x-body.x)/d*amount,(t.from.z-body.z)/d*amount,body.radius,atHeight(volumes,body.y));body.speed=distance(body,p)/dt;body.x=p.x;body.z=p.z;body.yaw=Math.atan2(t.normal.x,t.normal.z);return false;
}
