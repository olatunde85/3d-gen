/** Equipped parcel follows ordinary movement without changing recorded legs or root motion. */
import assert from 'node:assert/strict';
import {nodeLibrary} from './node-assets';
import {buildHuman} from '../src/core/human';
import {DEFAULT_PARAMS} from '../src/core/params';
import {Animator} from '../src/core/anim/evaluate';
import {CLIPS} from '../src/core/anim/clips';
import {carriesParcel} from '../src/core/anim/clips/interaction';
import {boneFor} from '../src/core/rig/poses';
import {qconj,qrot} from '../src/core/anim/quat';
import {parcelStateAt} from '../src/studio/parcel';
import {newProject,beat} from '../src/studio/project';
const distance=(a:number[],b:number[])=>Math.hypot(...a.map((v,i)=>v-b[i]));
const lib=await nodeLibrary();let checked=0;
const movement=CLIPS.filter(carriesParcel);
for(const rig of ['game','game_lite','full']as const)for(const restPose of ['A','T']as const)for(const [name,body]of [['average',{}],['short female',{gender:0,height:.15,weight:.3,proportions:.2}],['tall broad',{gender:1,height:.9,weight:.85,muscle:.9}]]as const){
 const ch=await buildHuman(lib,{...DEFAULT_PARAMS,...body,rig,restPose,carry:'parcel',weapon:'none',detail:'low',outfit:'none',hair:'none',faceShapes:false});
 const B=ch.rig!.bones,A=new Animator(ch.rig!),index=B.findIndex(b=>b.name==='Parcel'),bare=new Animator({...ch.rig!,bones:B.slice(0,index)}),scale=Math.max(...B.flatMap(b=>[b.head[1],b.tail[1]]))/1.8;
 const idx=(name:string)=>B.findIndex(b=>b.name===boneFor(rig,name)),label=`${rig} ${restPose} ${name}`;
 for(const c of movement){
  for(let i=0;i<=40;i++){
   const time=c.duration*i/40,frame=A.frame(c,time),p=A.positions(frame),ref=bare.positions(bare.frame(c,time));
   for(const name of ['Hips','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot','Head'])assert.ok(distance(p[idx(name)],ref[idx(name)])/scale<.001,label+' '+c.id+' changes '+name);
   const mid=p[idx('LeftHand')].map((v,d)=>(v+p[idx('RightHand')][d])/2);
   assert.ok(distance(mid,p[index])/scale<.09,label+' '+c.id+' detached parcel');
   assert.ok(Math.abs(distance(p[idx('LeftHand')],p[idx('RightHand')])/scale-.46)<.015,label+' '+c.id+' grip separation');
   // The box is a rigid solid. Neither knee/shin nor the thigh centreline may enter it.
   for(const side of ['Left','Right'])for(const [from,to]of [['UpLeg','Leg'],['Leg','Foot']])for(let step=0;step<=8;step++){
    const point=p[idx(side+from)].map((v,d)=>v+(p[idx(side+to)][d]-v)*step/8-p[index][d]);
    const local=qrot(qconj(frame.rot[index]),point as [number,number,number]).map(v=>v/scale);
    assert.ok(!(Math.abs(local[0])<.21&&Math.abs(local[1])<.16&&Math.abs(local[2])<.17),label+' '+c.id+' parcel intersects leg');
   }
   if(c.travel){const moving=A.positions(A.frame(c,time,{rootMotion:true}));for(let d=0;d<3;d++)assert.ok(Math.abs(moving[index][d]-p[index][d]-c.travel[d]*time*scale)<.001,label+' '+c.id+' parcel root travel');}
  }
  checked++;
 }
 console.log('OK parcel',label);
}
const track=newProject().actors[0];track.beats=[beat('run',2,true),beat('put_down',3.4),beat('idle',1),beat('walk',2,true),beat('pick_up',3.4),beat('run',2,true)];
assert.equal(parcelStateAt(track,1).grounded,false);
assert.equal(parcelStateAt(track,4).grounded,false);
for(const time of [6,8]){const state=parcelStateAt(track,time);assert.equal(state.grounded,true);assert.ok(Math.abs(state.releasedAt!-3.6)<1e-9);}
assert.equal(parcelStateAt(track,9).grounded,false);
assert.equal(parcelStateAt(track,12).grounded,false);
console.log(`Parcel checks: ${checked} movement/body combinations, unchanged gait/root travel, two-hand contact, leg clearance and drop/re-pickup state passed.`);
