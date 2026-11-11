import assert from 'node:assert/strict';
import {nodeLibrary} from './node-assets';
import {buildHuman} from '../src/core/human';
import {DEFAULT_PARAMS,PRESETS} from '../src/core/params';
import {Animator} from '../src/core/anim/evaluate';
import {clipById} from '../src/core/anim/clips';
import {RiderFit} from '../src/core/props/vehicle-kit';
import {Vehicle} from '../src/core/props/vehicle';
import {vehicleStyleForChoice,DEFAULT_VEHICLE_STYLE} from '../src/core/props/vehicles';
import {boardingScale} from '../src/core/props/vehicle-actions';
import {boardingFrame} from '../src/core/anim/boarding';
import {measurePickup,drivingClip} from '../src/play/driving-view';
import {fitPassenger,fitPickupCabin,pickupPassengerFrame} from '../src/play/passenger-view';
import {EscapeGame} from '../src/play/runtime';
import {defaultMission} from '../src/play/mission';
const lib=await nodeLibrary();let checks=0;const bodies:{ch:Awaited<ReturnType<typeof buildHuman>>;anim:Animator}[]=[];
for(const patch of [{...PRESETS['The Prison Escapee']},{...PRESETS['The Female Executive'],height:.2},{...PRESETS['The Soldier'],height:.9,weight:.8}]){
 const ch=await buildHuman(lib,{...DEFAULT_PARAMS,...patch,rig:'game',detail:'low',weapon:'pistol',carry:'none',faceShapes:false}),anim=new Animator(ch.rig!),ride=clipById.get('drive_pickup')!,v=new Vehicle('pickup',ch.rig!,anim,ride,vehicleStyleForChoice('pickup',DEFAULT_VEHICLE_STYLE)),radius=Math.min(.48,Math.max(.28,.34*ch.height/1.75+(ch.params.weight-.5)*.08)),fit=measurePickup(v,ch.rig!,radius),scale=boardingScale(ch.rig!);
 bodies.push({ch,anim});
 for(const location of ['depot','military-base']as const)for(const layout of ['balanced','open','dense']as const)for(let variation=0;variation<3;variation++){const game=new EscapeGame({...defaultMission(),story:'getaway',location,layout,variation});game.player.radius=radius;game.configureCar(fit);}
 for(const location of ['depot','military-base']as const)for(const driveDifficulty of ['standard','hard']as const){const g=new EscapeGame({...defaultMission(),story:'getaway',location,driveDifficulty});g.configureCar(fit);}
 for(const id of ['board_pickup','alight_pickup','drive_pickup'])for(let i=0;i<=24;i++){
  const clip=clipById.get(id)!,frame=id==='drive_pickup'?anim.frame(drivingClip((i/24-.5)),0,{vehicleLift:v.lift,vehicleMotion:false,weaponPose:'hidden'}):boardingFrame(anim,clip,clip.duration*i/24,clipById.get('idle')!,ride,v.lift,'drive_pickup',[fit.stand.x/scale,0]),positions=anim.positions(frame);
  assert.ok(frame.rot.every(q=>q.every(Number.isFinite)&&Math.abs(Math.hypot(...q)-1)<1e-5));for(let j=0;j<ch.rig!.bones.length;j++){const b=ch.rig!.bones[j];if(b.parent<0)continue;const parent=ch.rig!.bones[b.parent],length=Math.hypot(...positions[j].map((v,k)=>v-positions[b.parent][k])),rest=Math.hypot(...b.head.map((v,k)=>v-parent.head[k]));assert.ok(Math.abs(length-rest)<1e-5,'boarding never stretches a limb');}
 }
 const end=boardingFrame(anim,clipById.get('alight_pickup')!,clipById.get('alight_pickup')!.duration,clipById.get('idle')!,ride,v.lift,'drive_pickup',[fit.stand.x/scale,0]),idle=anim.frame(clipById.get('idle')!,0,{weaponPose:'hidden'}),endPoints=anim.positions(end),idlePoints=anim.positions(idle);for(let i=0;i<endPoints.length;i++)assert.ok(Math.hypot(endPoints[i][0]-idlePoints[i][0]-fit.stand.x,endPoints[i][1]-idlePoints[i][1],endPoints[i][2]-idlePoints[i][2])<1e-5,'alighting recovers the exact upright standing pose');
 const passenger=fitPassenger(v,anim,{...new EscapeGame({...defaultMission(),story:'rescue',extraction:'pickup'}).car!,fit}),seatFrame=pickupPassengerFrame(anim,{phase:'seated',time:0},passenger,0);
 for(const id of ['boarding','alighting']as const)for(let i=0;i<=24;i++){
  const frame=pickupPassengerFrame(anim,{phase:id,time:1.05*i/24},passenger,0),P=anim.positions(frame);assert.ok(frame.rot.every(q=>q.every(Number.isFinite)&&Math.abs(Math.hypot(...q)-1)<1e-5));for(let j=0;j<ch.rig!.bones.length;j++){const b=ch.rig!.bones[j];if(b.parent<0)continue;assert.ok(Math.abs(Math.hypot(...P[j].map((v,k)=>v-P[b.parent][k]))-Math.hypot(...b.head.map((v,k)=>v-ch.rig!.bones[b.parent].head[k])))<1e-5,'passenger choreography preserves bone lengths');}
 }
 const passengerEnd=anim.positions(pickupPassengerFrame(anim,{phase:'alighting',time:1.05},passenger,0));for(let i=0;i<passengerEnd.length;i++)assert.ok(Math.hypot(passengerEnd[i][0]+passenger.shift[0]-idlePoints[i][0]-fit.passenger!.stand.x,passengerEnd[i][1]-idlePoints[i][1],passengerEnd[i][2]+passenger.shift[2]-idlePoints[i][2]-fit.passenger!.stand.z)<1e-5,'passenger alights into exact upright idle');
 assert.ok(anim.positions(seatFrame).every(p=>p.every(Number.isFinite)));
 console.log('OK fitted pickup, 18 routes and rigid-limb entry/exit/steering',ch.height.toFixed(2)+'m',JSON.stringify(fit));checks++;v.dispose();
}
for(const host of bodies)for(const guest of bodies){
 const v=new Vehicle('pickup',host.ch.rig!,host.anim,clipById.get('drive_pickup')!,vehicleStyleForChoice('pickup',DEFAULT_VEHICLE_STYLE)),car=new EscapeGame({...defaultMission(),story:'rescue',extraction:'pickup'}).car!;car.fit=measurePickup(v,host.ch.rig!,.4,.48);fitPickupCabin(v,guest.anim,car);const fitted=fitPassenger(v,guest.anim,car),frame=pickupPassengerFrame(guest.anim,{phase:'seated',time:0},fitted,0),contacts=new RiderFit(guest.ch.rig!,guest.anim,clipById.get('sit_pickup_passenger')!,'pickup').fromFrame(frame);
 assert.ok(contacts.headTop.y<v.bounds.max.y-.02,`Passenger head clears roof: driver ${host.ch.height}, guest ${guest.ch.height}, head ${contacts.headTop.y}, roof ${v.bounds.max.y}`);v.dispose();
}
console.log('OK all nine mixed-size passenger pairs have roof clearance');
console.log(`${checks} fitted pickup/body profiles passed.`);
