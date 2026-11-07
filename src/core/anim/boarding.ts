/** Rig-fitted entry choreography. Targets are in the parked vehicle's frame, never scaled limbs. */
import type {Animator,Frame} from './evaluate';
import type {Clip,Sample} from './clips';
import type {Vec3} from '../math';
import {qslerp,qmul,type Q} from './quat';
import {boneFor} from '../rig/poses';
import {boardingStand,boardingScale,boardProgress,tankRoof} from '../props/vehicle-actions';

const mix=(a:number,b:number,w:number)=>a+(b-a)*w;
const lerp=(a:Vec3,b:Vec3,w:number):Vec3=>a.map((x,i)=>mix(x,b[i],w)) as Vec3;
const smooth=(x:number)=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};
interface Key {p:number;x:number;z:number;y:number;pose:number;lean:number;L:Vec3;R:Vec3;hand:number}
interface Fitted {keys:Key[];frames:Frame[];idle:Frame;ride:Frame;endpoint:Frame;scale:number;floorShift:number;endShift:number;floor:number;floorJoints:number[];left:number;right:number;handL:number;handR:number;hands:[Vec3,Vec3];idleWorld:Q[];ridePositions:Vec3[];centres:Vec3[];hips:[number,number]}
const cache=new WeakMap<Animator,Map<string,Fitted>>();

function fit(A:Animator,idleClip:Clip,rideClip:Clip,lift:number,choreography=rideClip.id,stand?:[number,number]):Fitted {
 const B=A.rig.bones,s=boardingScale(A.rig);
 const index=(n:string)=>B.findIndex(b=>b.name===boneFor(A.rig.type,n));
 const left=index('LeftFoot'),right=index('RightFoot'),handL=index('LeftHand'),handR=index('RightHand');
 const idleActual=A.frame(idleClip,0,{weaponPose:'hidden'}),endpoint=A.frame(rideClip,0,{vehicleLift:lift,weaponPose:'hidden',vehicleMotion:false}),hipY=(P:Vec3[])=>(P[index('LeftUpLeg')][1]+P[index('RightUpLeg')][1])/2;
 const idleY=hipY(A.positions(idleActual)),rideY=hipY(A.positions(endpoint)),bindY=(B[index('LeftUpLeg')].head[1]+B[index('RightUpLeg')].head[1])/2;
 const rideReference=rideClip.sample(0).root.ground?Math.min(B[left].head[1],B[right].head[1])-Math.min(...[left,right].map(i=>A.positions(endpoint)[i][1]-rideY))+lift:bindY+(rideClip.sample(0).root.y??0)*s+lift;
 const shift=(f:Frame,dy:number):Frame=>({...f,rot:[...f.rot],rootPos:new Map([...f.rootPos].map(([i,p])=>[i,[p[0],p[1]+dy,p[2]]as Vec3]))});
 // Foot/toe grounding differs between skeletons. Choreograph in the common anatomical frame,
 // then restore the original grounding as a uniform translation, keeping all leg mechanics identical.
 const idle=shift(idleActual,bindY-idleY),ride=shift(endpoint,rideReference-rideY),ip=A.positions(idle),rp=A.positions(ride);
 const floorShift=idleY-bindY,endShift=rideY-rideReference;
 const ref=(p:Vec3)=>p.map(x=>x/s) as Vec3,feet=[ref(rp[left]),ref(rp[right])],rideId=choreography;
 const [standX,standZ]=stand??boardingStand(rideId),sign=Math.sign(standX),side=(p:Vec3):Vec3=>[p[0]*sign,p[1],p[2]];
 const standFeet=[ref(ip[left]),ref(ip[right])].map(p=>[p[0]+standX,p[1],p[2]+standZ] as Vec3);
 const hips:[number,number]=[index('LeftUpLeg'),index('RightUpLeg')],centre=(P:Vec3[])=>lerp(P[hips[0]],P[hips[1]],.5);
 const root=centre(ip),rroot=centre(rp),dy=(rroot[1]-root[1])/s;
 const finalL=feet[0],finalR=feet[1],outer=sign>0?standFeet[0]:standFeet[1],inner=sign>0?standFeet[1]:standFeet[0];
 const keys:Key[]=[];
 const add=(p:number,x:number,y:number,z:number,pose:number,lean:number,L:Vec3,R:Vec3,hand:number)=>keys.push({p,x,y,z,pose,lean,L,R,hand});
 add(0,standX,0,standZ,0,0,standFeet[0],standFeet[1],0);
 const car=rideId.includes('car')||rideId.includes('suv')||rideId.includes('pickup')||rideId==='sit_passenger';
 if(car){
  // Open the door first. Lower outside the roof, sit sideways, then bring the trailing leg in.
  const floor=lift/s,inside=sign>0?finalR:finalL;
  const pair=(out:Vec3,inn:Vec3):[Vec3,Vec3]=>sign>0?[out,inn]:[inn,out];
  add(.20,standX,0,standZ,0,3,...pair(outer,inner),.35);
  add(.38,standX*.78,dy*.72,standZ, .45,18,...pair(outer,side([.36,floor+.22,.18])),.55);
  add(.57,standX*.26,dy,0,.9,12,...pair(side([.68,.10,.22]),inside),.7);
  add(.76,0,dy,0,1,4,...pair(sign>0?finalL:finalR,inside),.9);
  add(.88,0,dy,0,1,0,finalL,finalR,.65);
 }else if(rideId==='drive_tank'){
  // Up the tread steps onto the fender and hull roof, then down through the driver's hatch.
  const head=B[index('Head')],roof=tankRoof(rp[index('Head')][1]+Math.hypot(...head.tail.map((x,d)=>x-head.head[d])),s)/s,fender=1.17,hx=rroot[0]/s,hz=rroot[2]/s,floor=lift/s;
  add(.10,standX,0,standZ,0,4,standFeet[0],standFeet[1],.3);
  add(.22,standX*.86,.15,standZ,.05,10,standFeet[0],[1.13,.40,-.55],.9);
  add(.34,1.0,.80,-.55,.05,12,[1.13,.78,-.55],[.82,fender,-.40],1);
  add(.46,.80,fender+.05,-.55,.05,8,[.85,fender,-.75],[.42,roof,hz-.55],1);
  add(.54,.25,roof,hz-.62,.05,4,[.38,roof,hz-.62],[.12,roof,hz-.62],.4);
  add(.62,hx+.18,roof-.15,hz-.5,.2,8,[.38,roof,hz-.62],[hx+.05,roof-.45,hz-.05],.25);
  // Standing on the floor inside, head out of the hatch, before sitting down.
  add(.78,hx,floor+.1,hz-.12,.6,4,[hx+.12,floor,hz+.05],[hx-.1,floor,hz+.05],.15);
  add(.93,0,dy,0,1,0,finalL,finalR,.1);
 }else if(rideId==='fly_helicopter'||rideId==='fly_jet'){
  // Open the cabin door, step onto the skid, transfer weight onto the deck, then sit.
  // This is a step-through doorway, never the saddle swing or gunwale crossing.
  const floor=lift/s,pair=(out:Vec3,inn:Vec3):[Vec3,Vec3]=>sign>0?[out,inn]:[inn,out];
  const inside=sign>0?finalR:finalL;
  add(.16,standX,0,standZ,0,4,...pair(outer,inner),.45);
  add(.34,standX*.84,.08,standZ,.12,9,...pair(outer,side([Math.abs(standX)*.56,floor*.56,.12])),.7);
  add(.52,standX*.36,dy+.14,0,.65,10,...pair(side([Math.abs(standX)*.56,floor*.55,.10]),inside),.8);
  add(.72,0,dy,0,1,3,finalL,finalR,.8);
  add(.88,0,dy,0,1,0,finalL,finalR,.4);
 }else if(rideId==='ride_horse'){
  // Left stirrup, rise over the saddle, swing the right leg behind the cantle, settle.
  add(.18,.78,0,-.12,0,12,standFeet[0],[.64,.13,-.27],.65);
  add(.35,.61,.08,-.10,.25,20,finalL,[.80,.04,-.15],1);
  add(.53,.19,dy+.17,-.05,.65,14,finalL,[.14,1.46,-.66],1);
  add(.70,0,dy+.09,0,.9,7,finalL,[-.55,1.00,-.30],1);
  add(.86,0,dy,0,1,0,finalL,finalR,1);
 }else if(rideId==='ride_bicycle'||rideId==='ride_motorcycle'){
  const height=rideId==='ride_motorcycle'?1.12:1.16;
  add(.18,.72,0,0,0,13,standFeet[0],[.59,.10,-.20],.75);
  add(.40,.43,-.04,0,.3,22,[.64,.035,0],[.28,height,-.45],1);
  add(.59,.06,dy+.10,0,.8,12,[.45,.05,0],[-.31,.90,-.33],1);
  add(.76,0,dy+.02,0,1,2,[.32,.13,.12],finalR,1);
  add(.88,0,dy,0,1,0,finalL,finalR,1);
 }else{
  const motor=rideId==='drive_boat',rim=motor?.78:rideId==='paddle_kayak'?.38:.49;
  // Brace on the gunwale. The leading foot clears it before weight transfers inside.
  add(.16,standX,0,standZ,0,12,standFeet[0],[standX-.18,.13,standZ+.08],.8);
  add(.34,standX*.78,-.15,standZ,.15,18,standFeet[0],[motor?.72:.25,rim+.18,standZ+.08],1);
  add(.52,standX*.35,motor?.05:-.30,standZ*.5,.40,12,[standX*.73,rim+.14,standZ],motor?[.32,.38,.04]:finalR,1);
  add(.70,0,dy+.13,0,.85,6,[.25,rim+.18,standZ+.06],finalR,.8);
  add(.86,0,dy,0,1,0,finalL,finalR,.55);
 }
 add(1,0,dy,0,1,0,finalL,finalR,0);
 const groundY=Math.max(...standFeet.map(p=>p[1]));
 for(const key of keys)for(const foot of [key.L,key.R])foot[1]=Math.max(groundY,foot[1]);
 const centres:Vec3[]=[];
 const frames=keys.map(k=>{
  const base:Frame={rot:idle.rot.map((q,i)=>qslerp(q,ride.rot[i],k.pose)),rootPos:new Map()};
  for(const [i,p]of idle.rootPos){const end=ride.rootPos.get(i)??p;base.rootPos.set(i,[mix(p[0],end[0],k.pose)+k.x*s,p[1]+k.y*s,mix(p[2],end[2],k.pose)+k.z*s]);}
  // A small temporary forward inclination, balanced through neck/head, for roof and saddle clearance.
  if(k.lean){const sample:Sample={bones:{Spine:[k.lean*.65,0,0],Spine1:[k.lean*.35,0,0],Neck:[-k.lean*.5,0,0],Head:[-k.lean*.35,0,0]},root:{}};
   const delta=A.frame({...idleClip,sample:()=>sample},0);for(const name of ['Spine','Spine1','Neck','Head']){const i=index(name);base.rot[i]=qslerp(base.rot[i],delta.rot[i],.65);}}
  const desired:Vec3=[mix(root[0],rroot[0],k.pose)+k.x*s,root[1]+k.y*s,mix(root[2],rroot[2],k.pose)+k.z*s];
  const actual=centre(A.positions(base)),shift=desired.map((x,d)=>x-actual[d]);
  for(const [i,p]of base.rootPos)base.rootPos.set(i,p.map((x,d)=>x+shift[d])as Vec3);
  centres.push(desired);return base;
 });
 const hands:[Vec3,Vec3]=[ref(rp[handL]),ref(rp[handR])];
 // A fixed support, not a steering wheel/paddle dragged along with a reaching hand.
 if(car){const h=(rp[index('Hips')][1]/s)+.08;hands[sign>0?0:1]=[standX*.58,h,.16];}
 else if(rideId==='drive_tank'){const head=B[index('Head')],roof=tankRoof(rp[index('Head')][1]+Math.hypot(...head.tail.map((x,d)=>x-head.head[d])),s)/s+.03,hz=rroot[2]/s;hands[0]=[.55,roof,hz-.55];hands[1]=[.55,roof,hz-.15];}
 else if(rideId==='fly_jet'){const k=lift/(.55*s);hands[0]=[sign*.54*k,rroot[1]/s+.06*k,.18*k];hands[1]=[sign*.54*k,rroot[1]/s+.06*k,.35*k];}
 else if(rideId==='fly_helicopter'){hands[0]=[standX*.58,rroot[1]/s+.35,.20];hands[1]=[standX*.58,rroot[1]/s+.28,.37];}
 else if(rideId==='ride_horse'){hands[0]=[.17,rroot[1]/s+.24,.28];hands[1]=[-.12,rroot[1]/s+.24,.28];}
 else if(!rideId.startsWith('ride_')){const rim=rideId==='drive_boat'?.98:rideId==='paddle_kayak'?.42:.53;hands[0]=[standX*.48,rim,.25];hands[1]=[standX*.40,rim,.50];}
 const idleWorld:Q[]=[];B.forEach((b,i)=>idleWorld[i]=b.parent<0?idle.rot[i]:qmul(idleWorld[b.parent],idle.rot[i]));
 const floorJoints=B.flatMap((b,i)=>/^(Left|Right)(Foot|ToeBase|Toe_End)$|^(foot|toe\d-\d)\.[LR]$/.test(b.name)?[i]:[]),floor=Math.min(...floorJoints.map(i=>A.positions(idleActual)[i][1]));
 return {keys,frames,idle,ride,endpoint,scale:s,floorShift,endShift,floor,floorJoints,left,right,handL,handR,hands,idleWorld,ridePositions:rp,centres,hips};
}

export function boardingFrame(A:Animator,clip:Clip,time:number,idle:Clip,ride:Clip,lift:number,choreography=ride.id,stand?:[number,number]):Frame {
 let entries=cache.get(A);if(!entries){entries=new Map();cache.set(A,entries);}
 const key=`${ride.id}:${lift}:${choreography}:${stand?.join(',')??''}`;let fitted=entries.get(key);if(!fitted){fitted=fit(A,idle,ride,lift,choreography,stand);if(entries.size>=32)entries.delete(entries.keys().next().value!);entries.set(key,fitted);}
 const f=fitted,p=boardProgress(clip.vehicleTransition!,time,clip.duration);
 // Endpoints are exact, including the rig's root offset and local rotations.
 if(p>=1)return {rot:[...f.endpoint.rot],rootPos:new Map(f.endpoint.rootPos)};
 let n=f.keys.findIndex((_,i)=>i<f.keys.length-1&&p<f.keys[i+1].p);if(n<0)n=f.keys.length-2;
 const a=f.keys[n],b=f.keys[n+1],w=smooth((p-a.p)/(b.p-a.p));
 const frame:Frame={rot:f.frames[n].rot.map((q,i)=>qslerp(q,f.frames[n+1].rot[i],w)),rootPos:new Map([...f.frames[n].rootPos].map(([i,pos])=>[i,lerp(pos,f.frames[n+1].rootPos.get(i)!,w)]))};
 // Full rigs pivot behind the pelvis. Keep the actual hip midpoint on the same path as game rigs.
 const P=A.positions(frame),actual=lerp(P[f.hips[0]],P[f.hips[1]],.5),desired=lerp(f.centres[n],f.centres[n+1],w);
 for(const [i,pos]of frame.rootPos)frame.rootPos.set(i,pos.map((x,d)=>x+desired[d]-actual[d])as Vec3);
 if(p<=0){for(const [i,pos]of frame.rootPos)frame.rootPos.set(i,[pos[0],pos[1]+f.floorShift,pos[2]]);return frame;}
 const unconstrained=[...frame.rot],positions=A.positions(frame),foot=(a:Vec3,b:Vec3)=>lerp(a,b,w).map(x=>x*f.scale)as Vec3;
 for(const [side,aFoot,bFoot,i]of [['Left',a.L,b.L,f.left],['Right',a.R,b.R,f.right]]as const){
  const target=foot(aFoot,bFoot),swing=side==='Right'&&(choreography==='ride_horse'||choreography==='ride_bicycle'||choreography==='ride_motorcycle');
  const world:Q[]=[];A.rig.bones.forEach((bone,j)=>world[j]=bone.parent<0?frame.rot[j]:qmul(world[bone.parent],frame.rot[j]));
  const orientation=qslerp(f.idleWorld[i],world[i],smooth((target[1]/f.scale-.12)/.18));
  A.pinLimb(frame,side,'leg',target,swing?[-.8,-1,.2]:[side==='Left'?.3:-.3,.12,1],orientation);
  if(swing){
   // A raised foot follows its shin. Holding the shoe upright in world space while the
   // calf swings over the saddle folds/twists the ankle and collapses its skinned vertices.
   // Retain floor contact as the foot lands, then release the ankle during the leg swing.
   const airborne=smooth((target[1]/f.scale-.16)/.16);
   frame.rot[i]=qslerp(frame.rot[i],unconstrained[i],airborne);
  }
 }
 const support=mix(a.hand,b.hand,w),arrive=smooth((p-.76)/.24);
 for(const [side,i,j]of [['Left',f.handL,0],['Right',f.handR,1]]as const){
  const goal=lerp(f.hands[j],f.ridePositions[i].map(x=>x/f.scale)as Vec3,arrive).map(x=>x*f.scale)as Vec3;
  A.pinLimb(frame,side,'arm',lerp(positions[i],goal,support),[side==='Left'?1:-1,-.7,-.3]);
 }
 // Fade constraints at both exact endpoints: a different bend pole must never pop the knee.
 const constraint=smooth(p/.08)*(1-smooth((p-.82)/.18));
 frame.rot=frame.rot.map((q,i)=>qslerp(unconstrained[i],q,constraint));
 const grounding=mix(f.floorShift,f.endShift,smooth(p));
 const posed=A.positions(frame),low=Math.min(...f.floorJoints.map(i=>posed[i][1]))+grounding,raise=Math.max(0,f.floor-low);
 for(const [i,pos]of frame.rootPos)frame.rootPos.set(i,[pos[0],pos[1]+grounding+raise,pos[2]]);
 return frame;
}
