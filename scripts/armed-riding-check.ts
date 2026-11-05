/** Mounted weapons preserve riding mechanics and contacts; the complete film stays portable. */
import assert from 'node:assert/strict';
import {nodeLibrary} from './node-assets';
import {buildHuman} from '../src/core/human';
import {DEFAULT_PARAMS} from '../src/core/params';
import {Animator} from '../src/core/anim/evaluate';
import {clipById} from '../src/core/anim/clips';
import {defaultWeaponYaw,PADDLING_CLIPS} from '../src/core/anim/riding-weapons';
import {VEHICLE_FITS,vehicleLift,DEFAULT_VEHICLE_STYLE,isCar} from '../src/core/props/vehicles';
import {Vehicle} from '../src/core/props/vehicle';
import {boneFor} from '../src/core/rig/poses';
import {qmul,qrot,qaxis,type Q} from '../src/core/anim/quat';
import {newProject,parseProject} from '../src/studio/project';
import {encodeCharacter} from '../src/app/share';
import {parseStudioInput,generateAssistGuide} from '../src/studio/assist';
import {reconcileWeaponActions} from '../src/studio/equipment';
const lib=await nodeLibrary(),smoke=process.argv.includes('--smoke');let checks=0,maxAngle=0;
const distance=(a:number[],b:number[])=>Math.hypot(...a.map((x,d)=>x-b[d]));
for(const rig of smoke?['game']as const:['game','game_lite','full']as const)for(const restPose of smoke?['A']as const:['A','T']as const)for(const weapon of ['pistol','rifle','sword','knife']as const){
 const ch=await buildHuman(lib,{...DEFAULT_PARAMS,rig,restPose,weapon,detail:'low',outfit:'none',hair:'none',carry:'none',vehicle:'auto',faceShapes:false}),B=ch.rig!.bones,A=new Animator(ch.rig!),idx=(name:string)=>B.findIndex(b=>b.name===boneFor(rig,name)),scale=ch.height/1.8;
 assert.equal(ch.rig!.weapon,weapon);
 for(const {clip:id,id:model}of VEHICLE_FITS){
  const clip=clipById.get(id)!,lift=vehicleLift(model,scale),prop=new Vehicle(model,ch.rig!,A,clip,DEFAULT_VEHICLE_STYLE);
  for(const pose of weapon==='pistol'||weapon==='rifle'?['hold','aim','fire']as const:['hold','aim']as const){
   for(const fraction of [0,.12,.31,.6,.87,1]){
    const t=fraction*clip.duration,f=A.frame(clip,t,{vehicleLift:lift,weaponPose:pose}),p=A.positions(f),ref=A.frame(clip,PADDLING_CLIPS.has(id)?0:t,{vehicleLift:lift,weaponPose:'hidden'}),base=A.positions(ref);
    assert.equal(f.ridingWeapon,weapon);assert.ok(f.vehicleControls);assert.ok(!f.scale?.has(B.findIndex(b=>b.name==='WeaponR')));
    for(const name of ['Hips','LeftUpLeg','RightUpLeg','LeftLeg','RightLeg','LeftFoot','RightFoot','LeftHand'])assert.ok(distance(p[idx(name)],base[idx(name)])<1e-6,`${rig}/${weapon}/${id}/${pose} changes ${name}`);
    assert.ok(f.rot.every(q=>q.every(Number.isFinite)&&Math.abs(Math.hypot(...q)-1)<1e-5));
    // The fitted wheel/bars must use their real control hand, never follow the weapon hand.
    prop.update(t,f);const contact=prop.group.getObjectByName('Steering_wheel')??prop.group.getObjectByName('Handlebars'),at=contact?.position.toArray();
    prop.update(t,ref);if(at)assert.ok(distance(at,contact!.position.toArray())<1e-6,`${id} drags its controls`);
    prop.update(t,f);if(isCar(model))prop.group.traverse(o=>{if(o.name.startsWith('Window_'))assert.equal(o.scale.y,.001);});
    if((weapon==='pistol'||weapon==='rifle')&&pose==='aim'){
     const world:Q[]=[];B.forEach((b,i)=>world[i]=b.parent<0?f.rot[i]:qmul(world[b.parent],f.rot[i]));const socket=B.findIndex(b=>b.name==='WeaponR');
     const actual=qrot(qmul(world[socket],ch.weapon!.rot),[0,0,1]),wanted=qrot(qaxis([0,1,0],defaultWeaponYaw(id)),[0,0,1]);
     const angle=Math.acos(Math.min(1,Math.max(-1,actual.reduce((sum,x,d)=>sum+x*wanted[d],0))))*180/Math.PI;maxAngle=Math.max(maxAngle,angle);assert.ok(angle<12,`${weapon}/${id} points ${angle.toFixed(1)}° away from its aim direction`);
    }
   }
   checks++;
  }
  const hidden=A.frame(clip,.2,{weaponPose:'hidden'});assert.deepEqual(hidden.scale?.get(B.findIndex(b=>b.name==='WeaponR')),[0,0,0]);
  const a=A.positions(A.frame(clip,.2,{weaponPose:'aim',weaponYaw:-.01})),b=A.positions(A.frame(clip,.2,{weaponPose:'aim',weaponYaw:.01}));
  assert.ok(distance(a[idx('RightHand')],b[idx('RightHand')])<.001,'aim jumps across the body at zero heading');
  prop.dispose();
 }
 for(const id of ['board_horse','alight_motorcycle'])assert.deepEqual(A.frame(clipById.get(id)!,.5).scale?.get(B.findIndex(b=>b.name==='WeaponR')),[0,0,0]);
}
const p=newProject();p.actors[0].character=encodeCharacter({...DEFAULT_PARAMS,weapon:'pistol'});p.actors[0].beats=[{id:'b',clip:'board_motorcycle',duration:3.4,move:false},{id:'r',clip:'ride_motorcycle',duration:3,move:true,weaponPose:'fire',weaponYaw:-65},{id:'e',clip:'alight_motorcycle',duration:3.4,move:false},{id:'w',clip:'pistol_walk',duration:2,move:true,weaponPose:'hidden'}];
const parsed=parseProject(JSON.stringify(p));assert.deepEqual(parsed.actors[0].beats.map(b=>[b.clip,b.weaponPose,b.weaponYaw]),p.actors[0].beats.map(b=>[b.clip,b.weaponPose,b.weaponYaw]));assert.deepEqual(parseStudioInput(JSON.stringify(p),lib.catalog),parsed);
for(const bad of [{weaponPose:'dance'},{weaponYaw:111},{clip:'walk',weaponPose:'aim'},{clip:'board_horse',weaponPose:'fire'}]){const q=structuredClone(p);Object.assign(q.actors[0].beats[1],bad);assert.throws(()=>parseProject(JSON.stringify(q)));}
const blade=structuredClone(p);blade.actors[0].character=encodeCharacter({...DEFAULT_PARAMS,weapon:'sword'});assert.throws(()=>parseProject(JSON.stringify(blade)));
reconcileWeaponActions(blade.actors[0]);assert.equal(blade.actors[0].beats[1].weaponPose,'hold');assert.doesNotThrow(()=>parseProject(JSON.stringify(blade)));
blade.actors[0].character=encodeCharacter({...DEFAULT_PARAMS,weapon:'none'});reconcileWeaponActions(blade.actors[0]);assert.equal(blade.actors[0].beats[1].weaponPose,undefined);assert.equal(blade.actors[0].beats[1].weaponYaw,undefined);assert.equal(blade.actors[0].beats[3].weaponPose,'hidden');assert.doesNotThrow(()=>parseProject(JSON.stringify(blade)));
const guide=generateAssistGuide(lib.catalog);assert.ok(guide.includes('Armed riding:'));assert.ok(guide.includes('weaponPose'));assert.ok(!guide.includes('Keep carry:none and weapon:none during vehicle performances.'));assert.ok(guide.length<250_000);
console.log(`Armed riding: ${checks} weapon/vehicle/pose/rig combinations, exact seat/leg/control contacts, hidden transitions, JSON and guide passed; max muzzle error ${maxAngle.toFixed(3)}°.`);
