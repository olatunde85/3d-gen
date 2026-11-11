/** Contact and anatomy audit for fitted traversal across character proportions. */
import assert from 'node:assert/strict';
import {nodeLibrary} from './node-assets';
import {buildHuman} from '../src/core/human';
import {DEFAULT_PARAMS,PRESETS} from '../src/core/params';
import {Animator} from '../src/core/anim/evaluate';
import {clipById} from '../src/core/anim/clips';
import {traversalClip} from '../src/play/traversal-animation';
import {planTraversal,type MotorBody,type Volume} from '../src/play/motor';
const lib=await nodeLibrary();let checks=0;
for(const patch of [{...PRESETS['The Prison Escapee']},{...PRESETS['The Female Executive'],height:.2},{...PRESETS['The Soldier'],height:.9,weight:.8}]){
 const ch=await buildHuman(lib,{...DEFAULT_PARAMS,...patch,detail:'low',rig:'game',faceShapes:false,weapon:'none',carry:'none'}),rig=ch.rig!,animator=new Animator(rig),scale=Math.max(...rig.bones.flatMap(b=>[b.head[1],b.tail[1]]))/1.8;
 for(const kind of ['vault','climb']as const){
  const h=kind==='vault'?.85*scale:1.3*scale,volume:Volume={id:'cargo',minX:-1.5,maxX:1.5,minZ:kind==='vault'?-.175:-1,maxZ:kind==='vault'?.175:1,h,climbable:true};
  const body:MotorBody={x:0,z:kind==='vault'?1.3*scale:1.5,y:0,vy:0,height:ch.height,animationScale:scale,radius:.34,grounded:true,airTime:0,landing:0,yaw:Math.PI,speed:0};
  const plan=planTraversal(body,{x:0,z:-1},[volume]);assert.equal(plan?.kind,kind);const clip=traversalClip(plan!),idle=animator.positions(animator.frame(clipById.get('idle')!,0));
  let worstPenetration=0;
  for(let i=0;i<=100;i++){
   const frame=animator.frame(clip,clip.duration*i/100),positions=animator.positions(frame);assert.ok(!frame.scale,'no skeleton scaling');assert.ok(frame.rot.every(q=>q.every(Number.isFinite)&&Math.abs(Math.hypot(...q)-1)<1e-5));
   for(let j=0;j<rig.bones.length;j++){const parent=rig.bones[j].parent;if(parent>=0){const a=positions[j],b=positions[parent],c=rig.bones[j].head,d=rig.bones[parent].head;assert.ok(Math.abs(Math.hypot(...a.map((v,k)=>v-b[k]))-Math.hypot(...c.map((v,k)=>v-d[k])))<1e-5,'unchanged limb length');}}
   for(const name of ['LeftFoot','RightFoot','LeftToeBase','RightToeBase']){const index=rig.bones.findIndex(b=>b.name===name);if(index<0)continue;const p=positions[index],forward=p[2],near=plan!.near,far=near+plan!.depth;if(forward>near+.025&&forward<far-.025)worstPenetration=Math.max(worstPenetration,h-p[1]);}
  }
  assert.ok(worstPenetration<.09,`${kind}: foot inside cargo by ${worstPenetration.toFixed(3)} m`);
  if(kind==='climb'){const end=animator.positions(animator.frame(clip,clip.duration)),head=rig.bones.findIndex(b=>b.name==='Head'),hips=rig.bones.findIndex(b=>b.name==='Hips');assert.ok(end[head][1]-end[hips][1]>.35);assert.ok(Math.abs(end[head][1]-idle[head][1]-h)<.08,'upright on the top');}
  checks++;console.log('OK',kind,ch.height.toFixed(2)+'m','max foot penetration',worstPenetration.toFixed(3)+'m');
 }
}
console.log(`${checks} fitted character/animation combinations passed.`);
