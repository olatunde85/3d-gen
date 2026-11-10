/** Actual short, medium and tall rigs: low poses, gunshot falls and measured pickup contacts. */
import assert from 'node:assert/strict';
import {nodeLibrary} from './node-assets';
import {buildHuman} from '../src/core/human';
import {DEFAULT_PARAMS,PRESETS} from '../src/core/params';
import {Animator} from '../src/core/anim/evaluate';
import {clipById} from '../src/core/anim/clips';
import {Vehicle} from '../src/core/props/vehicle';
import {vehicleStyleForChoice,DEFAULT_VEHICLE_STYLE} from '../src/core/props/vehicles';
import {crouchLocomotion,defeatClip,seatedDefeatFrame} from '../src/play/stance-animation';
import {combatClip} from '../src/play/combat-animation';
import {makeCombatant,defaultLoadout} from '../src/play/combat';
import {measurePickup} from '../src/play/driving-view';
import {EscapeGame,type Input} from '../src/play/runtime';
import {defaultMission} from '../src/play/mission';
import {carPoint,carLocal} from '../src/play/driving';
import {vehicleVolumes} from '../src/play/vehicle-surfaces';
import {traversalClip} from '../src/play/traversal-animation';
const lib=await nodeLibrary(),idle:Input={x:0,z:0,sprint:false,interact:false};let checks=0;
for(const patch of [{...PRESETS['The Female Executive'],height:.2},{...PRESETS['The Prison Escapee']},{...PRESETS['The Soldier'],height:.9,weight:.8}]){
 const ch=await buildHuman(lib,{...DEFAULT_PARAMS,...patch,rig:'game',detail:'low',weapon:'pistol',carry:'none',faceShapes:false}),rig=ch.rig!,anim=new Animator(rig),head=rig.bones.findIndex(b=>b.name==='Head');
 const rigid=(frame:ReturnType<Animator['frame']>)=>{const P=anim.positions(frame);assert.ok(frame.rot.every(q=>q.every(Number.isFinite)&&Math.abs(Math.hypot(...q)-1)<1e-5));for(let i=0;i<rig.bones.length;i++){const b=rig.bones[i];if(b.parent<0)continue;const r=rig.bones[b.parent];assert.ok(Math.abs(Math.hypot(...P[i].map((v,k)=>v-P[b.parent][k]))-Math.hypot(...b.head.map((v,k)=>v-r.head[k])))<1e-5,'limb lengths never change');}return P;};
 for(const moving of [false,true])for(const armed of [false,true])for(const reloading of [false,true]){if(reloading&&!armed)continue;const c=makeCombatant({...defaultLoadout(),weapon:'pistol'});c.aiming=!reloading;
  const base=crouchLocomotion(moving);for(let i=0;i<=18;i++){c.reload=reloading?1.79-i/18*1.78:0;const frame=anim.frame(armed?combatClip(base,c):base,base.duration*i/18,{rootMotion:false,weaponPose:armed?undefined:'hidden',weaponPitch:armed?25:0}),P=rigid(frame);assert.ok(P[head][1]<ch.height*.85,'head stays low throughout aim and reload');for(const name of ['LeftFoot','RightFoot','LeftToeBase','RightToeBase']){const j=rig.bones.findIndex(b=>b.name===name);assert.ok(P[j][1]>-.04,'feet do not sink below the ground');}}
  checks++;console.log('OK crouch',moving?'walk':'idle',armed?'pistol':'unarmed',reloading?'reload':'',ch.height.toFixed(2)+'m');
 }
 for(const direction of ['front','back']as const)for(const crouched of [false,true]){const clip=defeatClip(direction,crouched);if(crouched){const start=rigid(anim.frame(clip,0,{rootMotion:false,weaponPose:'hidden'})),low=rigid(anim.frame(crouchLocomotion(false),0,{rootMotion:false,weaponPose:'hidden'}));assert.ok(start[head][1]<low[head][1]+.08,'a crouched victim does not stand up to fall');}for(let i=0;i<=36;i++)rigid(anim.frame(clip,clip.duration*i/36,{rootMotion:false,weaponPose:'hidden'}));const final=rigid(anim.frame(clip,clip.duration,{rootMotion:false,weaponPose:'hidden'}));assert.ok(final[head][1]<ch.height*.3,'defeat ends on the ground, not standing');assert.deepEqual(anim.frame(clip,clip.duration,{rootMotion:false,weaponPose:'hidden'}),anim.frame(clip,clip.duration,{rootMotion:false,weaponPose:'hidden'}));checks++;console.log('OK gunshot fall',direction,ch.height.toFixed(2)+'m');}
 const seated=anim.frame(clipById.get('drive_pickup')!,0);rigid(seatedDefeatFrame(anim,seated,2));checks++;
 const vehicle=new Vehicle('pickup',rig,anim,clipById.get('drive_pickup')!,vehicleStyleForChoice('pickup',DEFAULT_VEHICLE_STYLE)),fit=measurePickup(vehicle,rig,.34),g=new EscapeGame({...defaultMission(),story:'getaway'});g.player.height=ch.height;g.player.animationScale=vehicle.fit.scale;g.configureCar(fit);g.start();g.enemies.forEach(e=>e.combat.health=0);const car=g.car!,hood=fit.surfaces!.find(v=>v.id==='hood')!,cab=fit.surfaces!.find(v=>v.id==='cab')!,cx=(hood.box.minX+hood.box.maxX)/2,dir={x:-Math.sin(car.yaw),z:-Math.cos(car.yaw)};
 assert.ok(hood.h<cab.h&&fit.surfaces!.find(v=>v.id==='bed')!.h<hood.h);Object.assign(g.player,carPoint(car,{x:cx,z:hood.box.maxZ+.7}),{yaw:car.yaw+Math.PI});
 for(const surface of [hood,cab]){g.update(1/60,{...idle,...dir,jump:true});assert.ok(g.traversal,'native vehicle has a reachable '+surface.id);const traversal=g.traversal!,clip=traversalClip(traversal);for(let i=0;i<=30;i++)rigid(anim.frame(clip,clip.duration*i/30,{rootMotion:false,weaponPose:'hidden'}));for(let n=0;n<360&&g.traversal;n++)g.update(1/60,idle);assert.equal(g.traversal,undefined);assert.ok(Math.abs(g.player.y-surface.h)<.001);if(surface.id==='hood')for(let n=0;n<120&&carLocal(car,g.player).z>cab.box.maxZ+.85;n++)g.update(1/60,{...idle,...dir});}
 assert.ok(vehicleVolumes(car).some(v=>v.id==='pickup-cab'&&Math.abs(v.h-g.player.y)<.001));checks++;console.log('OK measured hood and roof climb',ch.height.toFixed(2)+'m');
 const tail=fit.surfaces!.find(v=>v.id==='tailgate')!,bed=fit.surfaces!.find(v=>v.id==='bed')!,rearDir={x:Math.sin(car.yaw),z:Math.cos(car.yaw)};Object.assign(g.player,carPoint(car,{x:cx,z:tail.box.minZ-.8}),{y:0,vy:0,grounded:true,landing:0,yaw:car.yaw});
 g.update(1/60,{...idle,...rearDir,jump:true});assert.ok(g.traversal?.landingDrop,'rear pull-up lands inside the bed');const rear=g.traversal!,rearClip=traversalClip(rear);let penetration=0;
 for(let i=0;i<=90;i++){const P=rigid(anim.frame(rearClip,rearClip.duration*i/90,{rootMotion:false,weaponPose:'hidden'}));for(const name of ['LeftFoot','RightFoot','LeftToeBase','RightToeBase']){const j=rig.bones.findIndex(b=>b.name===name),p=P[j];if(p[2]>rear.near+.025&&p[2]<rear.near+tail.box.maxZ-tail.box.minZ-.025)penetration=Math.max(penetration,rear.rise-p[1]);}}
 assert.ok(penetration<.09*fit.scale,'feet clear the tailgate: '+penetration);const end=rigid(anim.frame(rearClip,rearClip.duration,{rootMotion:false,weaponPose:'hidden'})),standing=rigid(anim.frame(clipById.get('idle')!,0,{rootMotion:false,weaponPose:'hidden'}));assert.ok(Math.abs(end[head][1]-standing[head][1]-bed.h)<.08,'upright at the real bed height');
 for(let n=0;n<360&&g.traversal;n++)g.update(1/60,idle);assert.ok(Math.abs(g.player.y-bed.h)<.001);vehicle.dispose();checks++;console.log('OK measured rear tailgate-to-bed climb',ch.height.toFixed(2)+'m','foot penetration',penetration.toFixed(3));
}
console.log(`${checks} cover/fall/vehicle pose combinations passed.`);
