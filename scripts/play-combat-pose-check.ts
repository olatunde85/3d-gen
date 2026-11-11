/** Actual character rigs: pistol actions keep limb lengths and recorded lower-body motion. */
import assert from 'node:assert/strict';
import {nodeLibrary} from './node-assets';
import {buildHuman} from '../src/core/human';
import {DEFAULT_PARAMS,PRESETS} from '../src/core/params';
import {Animator} from '../src/core/anim/evaluate';
import {clipById} from '../src/core/anim/clips';
import {combatClip} from '../src/play/combat-animation';
import {makeCombatant,defaultLoadout} from '../src/play/combat';
import {hitReactionFrame,HIT_REACTION_DURATION} from '../src/play/hit-reaction';
const lib=await nodeLibrary();let checks=0;
for(const patch of [{...PRESETS['The Prison Escapee']},{...PRESETS['The Female Executive'],height:.2},{...PRESETS['The Soldier'],height:.9,weight:.8}]){
 const ch=await buildHuman(lib,{...DEFAULT_PARAMS,...patch,detail:'low',rig:'game',faceShapes:false,weapon:'pistol',carry:'none'}),rig=ch.rig!,animator=new Animator(rig),head=rig.bones.findIndex(b=>b.name==='Head'),hips=rig.bones.findIndex(b=>b.name==='Hips');
 for(const action of ['pistol_idle','pistol_walk','pistol_run','walk_back','pistol_strafe_left','pistol_strafe_right','reload']){
  const base=clipById.get(action==='reload'?'pistol_walk':action)!,c=makeCombatant({...defaultLoadout(),weapon:'pistol'});c.aiming=true;
  for(const pitch of [-45,0,60])for(let i=0;i<=12;i++){
   const t=i/12*base.duration;c.fireAge=action==='reload'?Infinity:i/24;c.reload=action==='reload'?1.8-i/12*1.79:0;const clip=combatClip(base,c),frame=animator.frame(clip,t,{rootMotion:false,weaponPitch:pitch,weaponYaw:15}),positions=animator.positions(frame),original=animator.frame(base,t,{rootMotion:false});
   assert.ok(!frame.scale,'no body scaling');assert.ok(frame.rot.every(q=>q.every(Number.isFinite)&&Math.abs(Math.hypot(...q)-1)<1e-5));
   for(let j=0;j<rig.bones.length;j++){const b=rig.bones[j],parent=b.parent;if(parent>=0){const a=positions[j],p=positions[parent],rest=rig.bones[parent].head;assert.ok(Math.abs(Math.hypot(...a.map((v,k)=>v-p[k]))-Math.hypot(...b.head.map((v,k)=>v-rest[k])))<1e-5,'unchanged limb length');}if(/(Hips|UpLeg|Leg|Foot|ToeBase)$/.test(b.name))assert.ok(frame.rot[j].every((v,k)=>Math.abs(v-original.rot[j][k])<1e-5),'recorded lower body remains unchanged');}
   assert.ok(positions[head][1]-positions[hips][1]>.3,'upright torso');
  }
  checks++;console.log('OK',action,ch.height.toFixed(2)+'m');
 }
 const throwClip=clipById.get('throw_grenade')!,socket=rig.bones.findIndex(b=>b.name==='WeaponR');
 for(let i=0;i<=66;i++){
  const frame=animator.frame(throwClip,i/66*throwClip.duration,{rootMotion:false,weaponPose:'hidden'}),positions=animator.positions(frame);
  assert.ok(frame.rot.every(q=>q.every(Number.isFinite)&&Math.abs(Math.hypot(...q)-1)<1e-5),'grenade throw rotations stay finite');
  for(const [bone,scale]of frame.scale??[])assert.ok(bone===socket&&scale.every(v=>v===0),'only the pistol prop is hidden; the body is never scaled');
  for(let j=0;j<rig.bones.length;j++){const b=rig.bones[j];if(b.parent<0)continue;const parent=rig.bones[b.parent],length=Math.hypot(...positions[j].map((v,k)=>v-positions[b.parent][k])),rest=Math.hypot(...b.head.map((v,k)=>v-parent.head[k]));assert.ok(Math.abs(length-rest)<1e-5,'throw preserves every limb length');}
  assert.ok(positions[head][1]-positions[hips][1]>.3,'throw keeps an upright torso');
 }
 checks++;console.log('OK grenade_throw',ch.height.toFixed(2)+'m');
 for(const direction of ['front','back','left','right']as const){
  const base=animator.frame(clipById.get('pistol_walk')!,.4,{rootMotion:false}),snapshot=structuredClone(base),c=makeCombatant({...defaultLoadout(),weapon:'pistol'});c.hitDirection=direction;
  const hands=['LeftHand','RightHand'].map(name=>rig.bones.findIndex(b=>b.name===name)),original=animator.positions(base),distance=(p:number[][])=>Math.hypot(...p[hands[0]].map((v,k)=>v-p[hands[1]][k]));
  for(const age of [0,.1,.32,.79,HIT_REACTION_DURATION,1]){
   c.hitAge=age;const frame=hitReactionFrame(animator,base,c),positions=animator.positions(frame);
   assert.deepEqual(frame.rootPos,base.rootPos,'impact never moves the camera anchor');assert.equal(frame.scale,base.scale,'no body scaling');
   assert.ok(frame.rot.every(q=>q.every(Number.isFinite)&&Math.abs(Math.hypot(...q)-1)<1e-5),'finite unit rotations');
   for(let j=0;j<rig.bones.length;j++)if(/(Hips|UpLeg|Leg|Foot|ToeBase)$/.test(rig.bones[j].name))assert.deepEqual(frame.rot[j],base.rot[j],'lower-body motion remains intact');
   assert.ok(Math.abs(distance(positions)-distance(original))<1e-5,'two-hand weapon grip stays together');
   if(age===.1)assert.ok(frame.rot.some((q,j)=>q.some((v,k)=>Math.abs(v-base.rot[j][k])>.01)),'visible flinch');
   if(age>=HIT_REACTION_DURATION)assert.equal(frame,base,'fully recovers to current locomotion');
   assert.deepEqual(base,snapshot,'base pose is never mutated');assert.deepEqual(hitReactionFrame(animator,base,c),frame,'reaction cannot accumulate');
  }
  c.hitAge=.1;const contact=hitReactionFrame(animator,base,c,true),positions=animator.positions(contact);
  for(const i of hands)assert.deepEqual(positions[i],original[i],'planted hand contacts stay fixed');
  c.health=0;assert.equal(hitReactionFrame(animator,base,c),base,'death animation takes precedence');
  checks++;console.log('OK hit_'+direction,ch.height.toFixed(2)+'m');
 }
}
console.log(`${checks} character/combat animation combinations passed.`);
