/** Regressions against solved skeletons, across bodies, rigs and bind poses. */
import assert from 'node:assert/strict';
import { nodeLibrary } from './node-assets';
import { buildHuman } from '../src/core/human';
import { DEFAULT_PARAMS } from '../src/core/params';
import { Animator } from '../src/core/anim/evaluate';
import { CLIPS, clipById } from '../src/core/anim/clips';
import { carriesParcel } from '../src/core/anim/clips/interaction';
import { boneFor } from '../src/core/rig/poses';
import { qaxis,qmul,qrot, type Q } from '../src/core/anim/quat';
const lib=await nodeLibrary();
const distance=(a:number[],b:number[])=>Math.hypot(...a.map((x,i)=>x-b[i]));
const affected=['walk_back','strafe_left','strafe_right','jump','jump_running','punch_low','laugh','wave','put_down',...CLIPS.filter(c=>c.category==='Turns'||/^pistol_|^rifle_/.test(c.id)).map(c=>c.id)];
let checks=0;
for(const rig of ['game','game_lite','full']as const)for(const restPose of ['A','T']as const)for(const [name,body]of [['average',{}],['short female',{gender:0,height:.15,weight:.3,proportions:.2}],['tall broad',{gender:1,height:.9,weight:.85,muscle:.9}]]as const){
 const ch=await buildHuman(lib,{...DEFAULT_PARAMS,...body,rig,restPose,detail:'low',outfit:'none',hair:'none',faceShapes:false,carry:'parcel',weapon:'pistol'});
 const B=ch.rig!.bones,A=new Animator(ch.rig!),idx=(name:string)=>B.findIndex(b=>b.name===boneFor(rig,name)),scale=ch.height/1.8;
 const pos=(id:string,t:number)=>A.positions(A.frame(clipById.get(id)!,t));
 const feet=B.map((_,i)=>i).filter(i=>/^(Left|Right)(Foot|ToeBase|Toe_End)$|^(foot|toe\d-\d)\.[LR]$/.test(B[i].name));
 const bind=A.positions(A.bind()),idleFeet=pos('idle',0),floor=Math.min(...feet.flatMap(i=>[bind[i][1],idleFeet[i][1]]));
 const label=`${rig} ${restPose} ${name}`;
 for(const id of affected){const c=clipById.get(id)!;let previous:number[][]|undefined;
  for(let i=0;i<=60;i++){const t=c.duration*i/60,f=A.frame(c,t),p=A.positions(f);assert.ok(f.rot.every(q=>q.every(Number.isFinite)&&Math.abs(Math.hypot(...q)-1)<.0001),label+' '+id+' rotations');
   assert.ok(p.every(p=>p.every(Number.isFinite)),label+' '+id+' positions');
   if(['jump','jump_running','punch_low','strafe_left','strafe_right'].includes(id)||c.category==='Turns')assert.ok(Math.min(...feet.map(i=>p[i][1]))>=floor-.015*scale,`${label} ${id} foot penetrates floor at ${t.toFixed(3)}s: low ${Math.min(...feet.map(i=>p[i][1])).toFixed(3)} vs ${floor.toFixed(3)}`);
   if(previous){const gap=Math.max(...p.map((v,j)=>B[j].name==='Parcel'?0:distance(v,previous![j])))/scale;assert.ok(gap<Math.max(.08,c.duration/60*12),`${label} ${id}: discontinuity ${gap.toFixed(3)} at ${t}`);}previous=p;
  }
  if(c.loop){const a=pos(id,0),b=pos(id,c.duration);assert.ok(Math.max(...a.map((v,j)=>distance(v,b[j])))/scale<.005,label+' '+id+' seam');}checks++;
 }
 for(const id of ['jump','jump_running','punch_low']){const clip=clipById.get(id)!,p=pos(id,clip.duration),idle=A.positions(A.frame(clipById.get('idle')!,0,{parcelGrounded:!carriesParcel(clip)}));assert.ok(Math.max(...p.map((v,j)=>distance(v,idle[j])))/scale<.001,label+' '+id+' upright endpoint');}
 for(let i=0;i<=20;i++){
  const walk=clipById.get('walk')!,back=pos('walk_back',walk.duration*i/20),forward=pos('walk',walk.duration*(1-i/20));
  assert.ok(Math.max(...back.map((v,j)=>distance(v,forward[j])))/scale<.001,label+' exact reverse walk');
 }
 const lean=(id:string)=>Math.max(...Array.from({length:31},(_,i)=>{const p=pos(id,clipById.get(id)!.duration*i/30),h=p[idx('Hips')],head=p[idx('Head')];return Math.abs(Math.atan2(head[2]-h[2],head[1]-h[1])*180/Math.PI);}));
 for(const id of ['strafe_left','strafe_right'])assert.ok(lean(id)<=lean('walk')+2,label+' '+id+' posture bends farther than Walk');
 for(const [armed,base]of [['rifle_walk','walk'],['rifle_walk_back','walk_back'],['rifle_run','run'],['rifle_strafe_left','strafe_left'],['rifle_strafe_right','strafe_right'],['pistol_walk','walk'],['pistol_run','run'],['pistol_strafe_left','strafe_left'],['pistol_strafe_right','strafe_right'],['pistol_sprint','run'],['rifle_sprint','run']]){
  const c=clipById.get(armed)!,b=clipById.get(base)!;
  for(let i=0;i<=20;i++){
   const p=pos(armed,c.duration*i/20),q=pos(base,b.duration*i/20);
   for(const bone of ['Hips','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot'])assert.ok(distance(p[idx(bone)],q[idx(bone)])/scale<.001,label+' '+armed+' changes recorded '+bone);
  }
  for(let d=0;d<3;d++)assert.ok(Math.abs(c.travel![d]*c.duration-b.travel![d]*b.duration)<.0001,label+' stride distance '+armed);
 }
 for(const [id,angle]of [['turn_left_45',45],['turn_right_45',-45],['turn_left_90',90],['turn_right_90',-90],['turn_360',360]]as const){
  const c=clipById.get(id)!,end=pos(id,c.duration),rest=pos('idle',0),root=rest[idx('Hips')];
  // The turn finishes in the same standing pose, rotated through the requested angle.
  for(const bone of ['Head','LeftHand','RightHand','LeftFoot','RightFoot']){
   const want=qrot(qaxis([0,1,0],angle),rest[idx(bone)].map((v,d)=>v-root[d])as [number,number,number]);
   assert.ok(distance(end[idx(bone)].map((v,d)=>v-end[idx('Hips')][d]),want)/scale<.003,label+' turn endpoint '+id);
  }
 }
 const wave=clipById.get('wave')!,f=A.frame(wave,.5),w:Q[]=[];B.forEach((b,i)=>w[i]=b.parent<0?f.rot[i]:qmul(w[b.parent],f.rot[i]));
 assert.ok(qrot(w[idx('Head')],[0,0,1])[2]>.98,label+' forward wave');
 assert.ok(!clipById.get('pistol_aim_one_hand')!.sample(.5).ik?.Left,label+' one-hand aim');
 const parcel=B.findIndex(b=>b.name==='Parcel');assert.ok(parcel>=0&&ch.mesh.materials.some(m=>m.name==='Parcel cardboard'),label+' parcel mesh');
 const parcelFloor=pos('pick_up',0)[parcel];assert.ok(distance(parcelFloor,pos('pick_up',1.5)[parcel])<.001,label+' box moves before grip');
 assert.ok(distance(pos('pick_up',clipById.get('pick_up')!.duration)[parcel],pos('carry_idle',0)[parcel])<.001,label+' pickup/carry box pop');
 assert.ok(distance(pos('put_down',0)[parcel],pos('carry_idle',0)[parcel])<.001,label+' carry/drop box pop');
 for(let i=0;i<=30;i++){
  const pickup=clipById.get('pick_up')!,a=pos('put_down',pickup.duration*i/30),b=pos('pick_up',pickup.duration*(1-i/30));
  assert.ok(Math.max(...a.map((v,j)=>distance(v,b[j])))/scale<.001,label+' drop reverses pickup including parcel');
 }
 for(const id of ['carry_idle','carry_walk'])for(let i=0;i<=20;i++){
  const p=pos(id,clipById.get(id)!.duration*i/20),mid=p[idx('LeftHand')].map((v,d)=>(v+p[idx('RightHand')][d])/2);
  assert.ok(distance(p[parcel],mid)/scale<.09,label+' box detached from hands');
 }
 // Combat: planted feet stay put, nothing jumps, and every move starts and ends in its stance so they chain.
 const chains:Record<string,string>={punch_combo:'fight_idle',kick_front:'fight_idle',kick_roundhouse:'fight_idle',block:'fight_idle',sword_combo:'sword_idle',sword_thrust:'sword_idle',cover_fire:'cover_idle'};
 for(const id of [...CLIPS.filter(c=>c.category==='Combat'&&c.id!=='punch_low').map(c=>c.id),'take_cover','cover_idle','cover_fire']){const c=clipById.get(id)!;let previous:number[][]|undefined;const start=pos(id,0);
  for(let i=0;i<=60;i++){const t=c.duration*i/60,s=c.sample(t),p=pos(id,t);
   for(const side of ['Left','Right']as const)if((s.plant?.[side]??0)>.999){const j=idx(side+'Foot');assert.ok(Math.hypot(p[j][0]-start[j][0],p[j][2]-start[j][2])/scale<.01,`${label} ${id}: planted ${side} foot slides at ${t.toFixed(2)}`);}
   if(previous){const gap=Math.max(...p.map((v,j)=>B[j].name==='Parcel'?0:distance(v,previous![j])))/scale;assert.ok(gap<Math.max(.08,c.duration/60*14),`${label} ${id}: discontinuity ${gap.toFixed(3)} at ${t.toFixed(2)}`);}
   previous=p;
  }
  if(c.loop){const b=pos(id,c.duration);assert.ok(Math.max(...start.map((v,j)=>distance(v,b[j])))/scale<.005,label+' '+id+' seam');}
  const rest=chains[id];if(rest){const r=pos(rest,0),end=pos(id,c.duration),body=B.map((_,j)=>j).filter(j=>!/Hand(Index|Middle|Ring|Pinky|Thumb)|Parcel|Weapon/.test(B[j].name));
   for(const [name,q]of [['start',start],['end',end]]as const)assert.ok(Math.max(...body.map(j=>distance(q[j],r[j])))/scale<.01,`${label} ${id} ${name} does not match ${rest}`);}
  checks++;
 }
 console.log('OK',label);
}
console.log(`Animation improvements: ${checks} clip/body checks across 18 bodies/rigs/binds passed.`);
