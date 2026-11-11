/** Studio's shared aircraft, native entry and fitted passenger performance. */
import {Group,SpotLight} from 'three';
import {Vehicle} from '../core/props/vehicle';
import {RiderFit} from '../core/props/vehicle-kit';
import {clipById} from '../core/anim/clips';
import {boardingFrame} from '../core/anim/boarding';
import {boardingScale} from '../core/props/vehicle-actions';
import {vehicleLift,DEFAULT_VEHICLE_STYLE} from '../core/props/vehicles';
import {newProject,newActor,beat,type StudioProject} from '../studio/project';
import {VehicleStage} from '../studio/vehicle-stage';
import {passengerFrame} from '../studio/vehicle-performance';
import {hitReactionFrame} from './hit-reaction';
import {seatedDefeatFrame} from './stance-animation';
import {AIR_DURATION} from './air';
import type {EscapeGame} from './runtime';
import type {GameActor} from './actor';
export class AirView {
 readonly group=new Group();readonly vehicle:Vehicle;readonly fit;private project:StudioProject;
 private spotlight=new SpotLight('#d7e7ff',42,35,.4,.65,1);private pilot?:GameActor;
 constructor(readonly hero:GameActor,readonly companion?:GameActor,readonly overwatch=false){const render=hero.render;
  this.project=newProject();this.project.actors=[hero,...(companion?[companion]:[])].map((_actor,i)=>({...newActor(undefined,'medium',i?'guest':'pilot'),x:0,y:0,z:0,yaw:0,beats:[{...beat('board_helicopter',2.2),vehicleId:'air',vehicleSeat:i?'front-passenger':'operator',weaponPose:'hidden'},{...beat('fly_helicopter',6),vehicleId:'air',vehicleSeat:i?'front-passenger':'operator',weaponPose:'hidden'},{...beat('alight_helicopter',2.2),vehicleId:'air',vehicleSeat:i?'front-passenger':'operator',weaponPose:'hidden'}]}));
  let cabinRoof=0;if(companion){const state=this.stage(2.3).actor(this.project.actors[1]),guest=companion.render,A=guest.animator,frame=passengerFrame(A,this.project.actors[1].beats[1],0,state,guest.scale,0),contacts=new RiderFit(guest.character.rig!,A,clipById.get('fly_helicopter')!,'helicopter').fromFrame(frame);cabinRoof=contacts.headTop.y+.16*guest.scale;}
  this.vehicle=new Vehicle('helicopter',render.character.rig!,render.animator,clipById.get('fly_helicopter')!,{...DEFAULT_VEHICLE_STYLE,color:'#44594e'},{cabinRoof});this.vehicle.filmMotion=true;this.group.add(this.vehicle.group,this.spotlight,this.spotlight.target);
  const stage=this.stage(0),guest=companion?stage.actor(this.project.actors[1]):undefined,s=boardingScale(render.character.rig!),b=this.vehicle.bounds,hip=this.vehicle.fit.average('hip'),scale=this.vehicle.fit.scale;
  this.fit={stand:{x:-1.3*s,z:0},guest:guest?{x:guest.x+guest.stand![0]*boardingScale(companion!.render.character.rig!),z:guest.z+guest.stand![1]*boardingScale(companion!.render.character.rig!)}:{x:2.3*scale,z:0},hull:{minX:-.68*scale,maxX:1.54*scale,minZ:hip.z-1.9*scale,maxZ:hip.z+1.6*scale},scale};
  if(!Number.isFinite(b.max.y))throw Error('Aircraft fitting failed.');if(overwatch){this.pilot=hero.clone();this.group.add(this.pilot.render.group);}
 }
 private stage(t:number){return new VehicleStage(this.project,t,new Map([[this.project.actors[0].id,this.hero.render.vehicleBody],...(this.companion?[[this.project.actors[1].id,this.companion.render.vehicleBody]as const]:[])]));}
 update(g:EscapeGame){const air=g.air;if(this.overwatch){const x=g.player.x+Math.sin(g.time*.13)*5,z=g.player.z-8,y=14;this.vehicle.group.position.set(x,y,z);this.vehicle.group.rotation.y=0;this.vehicle.update(g.time,undefined,undefined,clipById.get('fly_helicopter')!,false);const f=this.hero.render.animator.frame(clipById.get('fly_helicopter')!,g.time,{vehicleMotion:false,vehicleLift:vehicleLift('helicopter',this.hero.render.scale),weaponPose:'hidden'});this.pilot!.applyFrame(f,{x,y,z},0);this.spotlight.position.set(x,y+1,z);this.spotlight.target.position.set(g.player.x,0,g.player.z);return;}
  if(!air)return;const transition=air.phase==='boarding'||air.phase==='alighting',t=air.phase==='boarding'?Math.min(2.2,air.time/AIR_DURATION*2.2):air.phase==='alighting'?8.2+Math.min(2.2,air.time/AIR_DURATION*2.2):2.2+(g.time%5.9),stage=this.stage(t),clip=clipById.get(air.phase==='boarding'?'board_helicopter':air.phase==='alighting'?'alight_helicopter':'fly_helicopter')!;
  this.vehicle.group.position.set(air.x,air.y,air.z);this.vehicle.group.rotation.y=air.yaw;this.vehicle.update(air.phase==='waiting'||air.phase==='approach'?0:transition?air.time/AIR_DURATION*2.2:g.time,undefined,undefined,clip,air.phase==='waiting'||air.phase==='approach');this.spotlight.intensity=0;if(this.companion&&transition){const door=this.vehicle.group.getObjectByName('Door_left'),right=this.vehicle.group.getObjectByName('Door_right');if(door&&right)door.rotation.y=-right.rotation.y;}
  if(air.phase==='waiting'||air.phase==='approach')return;
  for(const [i,actor]of [this.hero,...(this.companion?[this.companion]:[])].entries()){const state=stage.actor(this.project.actors[i]),A=actor.render.animator,c=i?g.companion!.combat:g.playerCombat,lift=vehicleLift('helicopter',actor.render.scale),frame=i?passengerFrame(A,this.project.actors[i].beats[air.phase==='boarding'?0:air.phase==='alighting'?2:1],transition?Math.min(2.2,air.time/AIR_DURATION*2.2):g.time,state,actor.render.scale,g.time):transition?boardingFrame(A,clip,Math.min(2.2,air.time/AIR_DURATION*2.2),clipById.get('idle')!,clipById.get('fly_helicopter')!,lift,'fly_helicopter'):A.frame(clip,g.time,{vehicleMotion:false,vehicleLift:lift,weaponPose:'hidden'}),local={x:state.x,z:state.z},cosa=Math.cos(air.yaw),sina=Math.sin(air.yaw),point={x:air.x+cosa*local.x+sina*local.z,y:air.y,z:air.z-sina*local.x+cosa*local.z};
   const socket=A.rig.bones.findIndex(b=>b.name==='WeaponR');if(socket>=0){frame.scale??=new Map();frame.scale.set(socket,[0,0,0]);}
   actor.applyFrame(c.health===0?seatedDefeatFrame(A,frame,actor.deathElapsed):hitReactionFrame(A,frame,c,true),point,air.yaw);
  }
 }
 dispose(){this.vehicle.dispose();this.pilot?.dispose();this.group.removeFromParent();}
}
