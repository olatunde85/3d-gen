import assert from 'node:assert/strict';
import {nodeLibrary} from './node-assets';
import {buildHuman} from '../src/core/human';
import {DEFAULT_PARAMS,PRESETS} from '../src/core/params';
import {Animator} from '../src/core/anim/evaluate';
import {combatClip,weaponLocomotion} from '../src/play/combat-animation';
import {makeCombatant} from '../src/play/combat';
import {vehicleLift} from '../src/core/props/vehicles';
import {boardingScale} from '../src/core/props/vehicle-actions';
import {drivingClip} from '../src/play/driving-view';
import type {Frame} from '../src/core/anim/evaluate';
const lib=await nodeLibrary();let checks=0;
for(const patch of [{...PRESETS['The Prison Escapee']},{...PRESETS['The Female Executive'],height:.2},{...PRESETS['The Soldier'],height:.9,weight:.8}]){const ch=await buildHuman(lib,{...DEFAULT_PARAMS,...patch,detail:'low',rig:'game',faceShapes:false,weapon:'rifle',carry:'none'}),A=new Animator(ch.rig!),B=ch.rig!.bones;
 const valid=(f:Frame)=>{assert.ok(f.rot.every(q=>q.every(Number.isFinite)&&Math.abs(Math.hypot(...q)-1)<1e-5));const P=A.positions(f);for(let i=0;i<B.length;i++){const b=B[i];if(b.parent<0)continue;assert.ok(Math.abs(Math.hypot(...P[i].map((v,k)=>v-P[b.parent][k]))-Math.hypot(...b.head.map((v,k)=>v-B[b.parent].head[k])))<1e-5,'rifle gameplay never stretches bones');}};
 for(const relative of [0,Math.PI/2,-Math.PI/2,Math.PI])for(const moving of [false,true])for(const reload of [0,1.5]){const base=weaponLocomotion('rifle',moving,2,true,relative),c=makeCombatant({weapon:'rifle',health:100,ammunition:96});c.aiming=true;c.reload=reload;for(const pitch of [-45,0,60])for(let i=0;i<=8;i++){const t=base.duration*i/8,f=A.frame(combatClip(base,c),t,{rootMotion:false,weaponPitch:pitch,weaponYaw:15}),original=A.frame(base,t,{rootMotion:false});valid(f);for(let j=0;j<B.length;j++)if(/(Hips|UpLeg|Leg|Foot|ToeBase)$/.test(B[j].name))assert.deepEqual(f.rot[j],original.rot[j]);}checks++;}
 const ride=drivingClip(.2),opts={vehicleMotion:false,vehicleLift:vehicleLift('pickup',boardingScale(ch.rig!)),rootMotion:false};const base=A.frame(ride,0,{...opts,weaponPose:'hidden'}),P=A.positions(base),names=['Hips','LeftHand','LeftFoot','RightFoot'].map(name=>B.findIndex(b=>b.name===name));for(const yaw of [-110,-60,0,60,110])for(const pitch of [-45,0,60]){const f=A.frame(ride,.3,{...opts,weaponPose:'aim',weaponYaw:yaw,weaponPitch:pitch});valid(f);const Q=A.positions(f);for(const i of names)assert.ok(Math.hypot(...P[i].map((v,k)=>v-Q[i][k]))<1e-5,'seat, feet and control hand remain fixed when firing from a pickup');checks++;}
 console.log('OK rifle locomotion/reload and mounted aim across body profile',ch.height.toFixed(2));}
console.log(`${checks} rifle pose configurations passed.`);
