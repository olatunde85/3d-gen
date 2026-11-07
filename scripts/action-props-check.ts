import assert from 'node:assert/strict';
import {nodeLibrary} from './node-assets';
import {buildHuman} from '../src/core/human';
import {DEFAULT_PARAMS} from '../src/core/params';
import {Animator} from '../src/core/anim/evaluate';
import {clipById} from '../src/core/anim/clips';
import {boneFor} from '../src/core/rig/poses';
import {qmul,qrot,type Q} from '../src/core/anim/quat';
import {animationGroup} from '../src/core/anim/groups';
import {searchAnimations} from '../src/studio/animations';
import {newProject,parseProject} from '../src/studio/project';
import {encodeCharacter} from '../src/app/share';
import {parseStudioInput} from '../src/studio/assist';
const lib=await nodeLibrary();let checks=0;
for(const rig of ['game','game_lite','full']as const)for(const weapon of ['pistol','rifle','grenade']as const){
 const ch=await buildHuman(lib,{...DEFAULT_PARAMS,rig,weapon,carry:'none',hair:'none',outfit:'none',detail:'low',faceShapes:false}),A=new Animator(ch.rig!),B=ch.rig!.bones;
 const idx=(n:string)=>B.findIndex(b=>b.name===boneFor(rig,n));
 if(weapon==='grenade'){
  const clip=clipById.get('throw_grenade')!,g=B.findIndex(b=>b.name==='Grenade');assert.ok(g>=0);
  const release=A.frame(clip,.82),before=A.frame(clip,.81),after=A.frame(clip,1.2),last=A.frame(clip,clip.duration);
  assert.ok(Math.hypot(...release.rootPos.get(g)!.map((x,i)=>x-before.rootPos.get(g)![i]))<.08);
  assert.ok(after.rootPos.get(g)![2]>release.rootPos.get(g)![2]+1);
  assert.ok(last.rootPos.get(g)![1]<.1);assert.deepEqual(A.frame(clip,1.2),after);
  assert.ok(A.bake(clip).frames.every(f=>f.rot.every(q=>q.every(Number.isFinite))));checks++;continue;
 }
 for(const clip of ['ride_motorcycle','drive_suv','ride_horse',weapon==='pistol'?'pistol_aim_one_hand':'rifle_aim'])for(const pitch of [-45,0,60])for(const yaw of [-80,0,80]){
  const f=A.frame(clipById.get(clip)!,.3,{weaponPose:'aim',weaponYaw:yaw,weaponPitch:pitch}),P=A.positions(f);
  assert.ok(f.rot.every(q=>q.every(Number.isFinite)&&Math.abs(Math.hypot(...q)-1)<1e-5));
  for(const side of ['Left','Right'])for(const [a,b]of [['Arm','ForeArm'],['ForeArm','Hand']]){
   const i=idx(side+a),j=idx(side+b),length=(p:number[][])=>Math.hypot(...p[j].map((x,k)=>x-p[i][k]));assert.ok(Math.abs(length(P)-length(B.map(b=>b.head)))<1e-5);
  }
  const world:Q[]=[];B.forEach((b,i)=>world[i]=b.parent<0?f.rot[i]:qmul(world[b.parent],f.rot[i]));const d=qrot(qmul(world[B.findIndex(b=>b.name==='WeaponR')],ch.weapon!.rot),[0,0,1]);
  assert.ok(Math.abs(Math.asin(d[1])*180/Math.PI-pitch)<12,`${rig}/${weapon}/${clip}/${pitch}: ${d}`);checks++;
 }
}
assert.equal(animationGroup(clipById.get('board_helicopter')!),'Vehicles · Helicopter / chopper');assert.equal(searchAnimations('chopper').length,5);assert.deepEqual(searchAnimations('','Vehicles · Motorcycle').map(c=>c.id).sort(),['alight_motorcycle','board_motorcycle','crash_fall_motorcycle','crash_motorcycle','ride_motorcycle','tumble_motorcycle']);
const p=newProject();p.actors[0].character=encodeCharacter({...DEFAULT_PARAMS,weapon:'pistol'});p.actors[0].beats=[{id:'a',clip:'pistol_aim_one_hand',duration:3,move:false,weaponYaw:30,weaponPitch:45}];assert.deepEqual(parseStudioInput(JSON.stringify(p),lib.catalog),parseProject(JSON.stringify(p)));
for(const pitch of [-46,61,'up']){const q=structuredClone(p);q.actors[0].beats[0].weaponPitch=pitch as number;assert.throws(()=>parseProject(JSON.stringify(q)));}
console.log(`Action props: ${checks} rig/weapon/direction cases; fixed limb lengths, muzzle elevation, release, deterministic seek, JSON and grouping passed.`);
