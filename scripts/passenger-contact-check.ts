/** Different body sizes share an operator-fitted cabin without scaling limbs or sinking through decks. */
import assert from 'node:assert/strict';
import {nodeLibrary} from './node-assets';
import {buildHuman} from '../src/core/human';
import {DEFAULT_PARAMS} from '../src/core/params';
import {Animator} from '../src/core/anim/evaluate';
import {clipById} from '../src/core/anim/clips';
import {VEHICLE_IDS,VEHICLE_CLIP,vehicleLift,type VehicleId} from '../src/core/props/vehicles';
import {boardingScale} from '../src/core/props/vehicle-actions';
import {boneFor} from '../src/core/rig/poses';
import {newProject,newActor,beat} from '../src/studio/project';
import {VehicleStage,type VehicleBody} from '../src/studio/vehicle-stage';
import {seatsForVehicle} from '../src/studio/vehicle-seats';
import {passengerFrame} from '../src/studio/vehicle-performance';
const lib=await nodeLibrary(),owner=await buildHuman(lib,{...DEFAULT_PARAMS,detail:'low',rig:'game',hair:'none',outfit:'none',carry:'none',weapon:'none'});
function profile(A:Animator):VehicleBody{const B=A.rig.bones,scale=Math.max(...B.flatMap(b=>[b.head[1],b.tail[1]]))/1.8,hip=B.findIndex(b=>b.name===boneFor(A.rig.type,'Hips'));return{scale,boardingScale:boardingScale(A.rig),hip:(id,model)=>A.positions(A.frame(clipById.get(id)!,0,{vehicleLift:vehicleLift(model??(Object.entries(VEHICLE_CLIP).find(([,c])=>c===id)?.[0]as VehicleId)??'car',scale),weaponPose:'hidden'}))[hip]};}
const host=profile(new Animator(owner.rig!));let checks=0,maxAnkle=0;
const gap=(a:number[],b:number[])=>Math.hypot(...a.map((v,i)=>v-b[i]));
for(const rig of ['game','game_lite','full']as const)for(const restPose of ['A','T']as const){
 const character=await buildHuman(lib,{...DEFAULT_PARAMS,rig,restPose,height:restPose==='A'?.15:.9,gender:restPose==='A'?0:1,weight:.45,detail:'low',hair:'none',outfit:'none',carry:'none',weapon:'none'}),A=new Animator(character.rig!),guest=profile(A),B=character.rig!.bones;
 for(const model of VEHICLE_IDS)for(const seat of seatsForVehicle(model).filter(s=>s!=='operator')){
  const passenger=model==='car'?'car_passenger':model==='sports_car'?'sports_car_passenger':model==='suv'?seat==='rear-left'?'suv':'suv_passenger':model;
  const board=clipById.get(`board_${passenger}`)!,ride=clipById.get(VEHICLE_CLIP[model])!,alight=clipById.get(`alight_${passenger}`)!,p=newProject();
  p.actors=[{...newActor(undefined,'low','driver'),beats:[{...beat(VEHICLE_CLIP[model],12),vehicleId:'shared'}]},{...newActor(undefined,'low','guest'),beats:[{...beat(board.id,board.duration),vehicleId:'shared',vehicleSeat:seat}]}];
  const state=new VehicleStage(p,0,new Map([['driver',host],['guest',guest]])).actor(p.actors[1]),b={...p.actors[1].beats[0]},r={...b,clip:ride.id},e={...b,clip:alight.id};
  const end=passengerFrame(A,b,board.duration,state,guest.scale,0),seated=passengerFrame(A,r,0,state,guest.scale,0),P=A.positions(end),S=A.positions(seated);
  assert.ok(Math.max(...P.map((v,i)=>gap(v,S[i])))<1e-6,`${rig}/${restPose}/${model}/${seat}: board/ride endpoint differs`);
  for(let i=0;i<=12;i++){
   const t=i/12,frame=passengerFrame(A,b,t*board.duration,state,guest.scale,0),reverse=passengerFrame(A,e,(1-t)*alight.duration,state,guest.scale,0),positions=A.positions(frame),reversed=A.positions(reverse);
   assert.ok(Math.max(...positions.map((v,j)=>gap(v,reversed[j])))<1e-6,'alighting must reverse the same fixed-length path');
   for(const [j,bone]of B.entries())if(bone.parent>=0&&bone.name!=='WeaponR'){const rest=gap(bone.head,B[bone.parent].head),posed=gap(positions[j],positions[bone.parent]);assert.ok(Math.abs(rest-posed)<1e-5,`${model}/${seat} changes ${bone.name} length`);}
   assert.ok(frame.rot.every(q=>q.every(Number.isFinite)&&Math.abs(Math.hypot(...q)-1)<1e-5));
   for(const side of ['Left','Right']){const foot=B.findIndex(b=>b.name===boneFor(rig,`${side}Foot`));if(model==='motorcycle'){const angle=2*Math.acos(Math.min(1,Math.abs(frame.rot[foot].reduce((n,x,d)=>n+x*A.restLocal[foot][d],0))))*180/Math.PI;maxAnkle=Math.max(maxAnkle,angle);assert.ok(angle<65,'pillion ankle is folded');}if(i===12&&model!=='motorcycle')assert.ok(positions[foot][1]>=state.deckFloor+.06*guest.scale,'passenger foot sinks through the cabin/deck');}
  }
  checks++;
 }
}
console.log(`Passenger contacts: ${checks} model/seat/rig/bind/body cases; exact endpoints, reversible footwork, rigid limbs, deck clearance and pillion ankles passed (${maxAnkle.toFixed(1)}° max).`);
