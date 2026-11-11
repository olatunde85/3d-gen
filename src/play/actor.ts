import {isGun} from './weapons';
import {crouchLocomotion,defeatClip,seatedDefeatFrame} from './stance-animation';
import {GameBlood} from './blood-view';
/** Existing Ara renderer and clips, fitted to gameplay movement and contact surfaces. */
import {Sphere,Vector3} from 'three';
import {StudioActor} from '../studio/actor';
import {clipById} from '../core/anim/clips';
import type {Character} from '../core/human';
import type {Frame} from '../core/anim/evaluate';
import {qslerp} from '../core/anim/quat';
import {traversalClip} from './traversal-animation';
import type {Traversal} from './motor';
import {INTERACTIONS,type Body, type EscapeGame} from './runtime';
import type {Combatant} from './combat';
import {combatClip,weaponLocomotion} from './combat-animation';
import {grenadeProp,disposeGrenade} from './grenade-view';
import {GRENADE,type GrenadeThrow} from './grenades';
import {boardingFrame} from '../core/anim/boarding';
import {boardingScale} from '../core/props/vehicle-actions';
import {vehicleLift,VEHICLE_CLIP} from '../core/props/vehicles';
import {drivingClip} from './driving-view';
import {carPoint,DRIVE,type CarState} from './driving';
import {hitReactionFrame} from './hit-reaction';
import {pickupPassengerFrame,type PassengerPose} from './passenger-view';
import type {CompanionState} from './companion';
export class GameActor {
 readonly render:StudioActor;private blood:GameBlood;private heldGrenade=grenadeProp();
 passengerFit?:PassengerPose;vehicleFrame?:Frame;private wasDriving=false;
 readonly grenadeRelease:{x:number;y:number;z:number};
 private lastHealth=Infinity;private phase=0;private pose?:Frame;private traversal?:Traversal;private fitted?:ReturnType<typeof traversalClip>;private equipTime=0;
 private previous?:{x:number;z:number};private movementYaw=0;private deathTime=0;private defeatDuration=2.6;
 constructor(ch:Character,private texture:(name:string)=>string){this.render=new StudioActor(ch,this.texture);this.blood=new GameBlood(this.render);this.render.mesh.boundingSphere=new Sphere(new Vector3(0,ch.height/2,0),ch.height);this.render.mesh.frustumCulled=true;const socket=this.render.mesh.skeleton.bones.find(b=>b.name==='WeaponR');if(socket){socket.parent?.add(this.heldGrenade);this.heldGrenade.position.copy(socket.position);this.heldGrenade.quaternion.copy(socket.quaternion);}this.heldGrenade.visible=false;this.heldGrenade.scale.setScalar(this.render.scale);const frame=this.render.animator.frame(clipById.get('throw_grenade')!,GRENADE.release,{rootMotion:false,weaponPose:'hidden'}),index=ch.rig!.bones.findIndex(b=>b.name==='WeaponR'),point=this.render.animator.positions(frame)[index];this.grenadeRelease={x:point[0],y:point[1],z:point[2]};}
 clone(){return new GameActor(this.render.character,this.texture);}
 applyFrame(f:Frame,p:{x:number;y:number;z:number},yaw:number){const mesh=this.render.mesh;mesh.frustumCulled=false;f.rot.forEach((q,i)=>{mesh.skeleton.bones[i].quaternion.set(...q);mesh.skeleton.bones[i].scale.set(...(f.scale?.get(i)??[1,1,1]));});for(const [i,v]of f.rootPos)mesh.skeleton.bones[i].position.set(...v);this.render.group.position.set(p.x,p.y,p.z);this.render.group.rotation.y=yaw;this.heldGrenade.visible=false;}
 /** A weapon variant shares the exact body recipe and can retain its locomotion phase. */
 adoptMotion(source:GameActor,pickup=false){this.phase=source.phase;this.pose=source.pose?structuredClone(source.pose):undefined;this.previous=source.previous?{...source.previous}:undefined;this.movementYaw=source.movementYaw;this.equipTime=pickup?1.15:0;}
 get deathElapsed(){return this.deathTime;}
 get defeatFinished(){return this.deathTime>=this.defeatDuration;}
 reset(body:Body,time:number,combat?:Combatant){this.blood.reset(combat?.health??100);this.wasDriving=false;this.vehicleFrame=undefined;this.phase=0;this.pose=undefined;this.traversal=undefined;this.fitted=undefined;this.previous=undefined;this.equipTime=0;this.movementYaw=body.yaw;this.deathTime=combat&&combat.health<=0?2:0;this.update(body,1,time,undefined,false,undefined,combat);}
 update(body:Body,dt:number,time:number,action?:EscapeGame['action'],won=false,traversal?:Traversal,combat?:Combatant,throwing?:GrenadeThrow,car?:CarState,passenger?:CompanionState['riding']){
  if(combat&&this.lastHealth===0&&combat.health>0)this.blood.reset(combat.health);if(combat)this.lastHealth=combat.health;
  const dead=!!combat&&combat.health<=0;if(dead){this.deathTime+=dt;this.defeatDuration=car?.phase!==undefined&&car.phase!=='parked'?1.1:defeatClip(combat.hitDirection,(body.crouch??0)>.05).duration;}else this.deathTime=0;
  if(car&&passenger&&passenger.phase!=='approaching'&&this.passengerFit){this.wasDriving=true;this.heldGrenade.visible=false;const base=pickupPassengerFrame(this.render.animator,passenger,this.passengerFit,time),f=combat?.health===0?seatedDefeatFrame(this.render.animator,base,this.deathTime):combat?hitReactionFrame(this.render.animator,base,combat,true):base,mesh=this.render.mesh;mesh.frustumCulled=false;f.rot.forEach((q,i)=>{mesh.skeleton.bones[i].quaternion.set(...q);mesh.skeleton.bones[i].scale.set(...(f.scale?.get(i)??[1,1,1]));});for(const [i,p]of f.rootPos)mesh.skeleton.bones[i].position.set(...p);const origin=carPoint(car,{x:this.passengerFit.shift[0],z:this.passengerFit.shift[2]});this.render.group.position.set(origin.x,0,origin.z);this.render.group.rotation.y=car.yaw;this.pose=undefined;return;}
  if(car&&!passenger&&car.phase!=='parked'){this.updateVehicle(car,time,combat);return;}
  if(this.wasDriving){this.pose=undefined;this.previous=undefined;this.wasDriving=false;this.vehicleFrame=undefined;}

  if(this.previous&&Math.hypot(body.x-this.previous.x,body.z-this.previous.z)>.001)this.movementYaw=Math.atan2(body.x-this.previous.x,body.z-this.previous.z);this.previous={x:body.x,z:body.z};
  if(action?.approach)action=undefined;
  const active=!dead&&traversal&&!traversal.approach?traversal:undefined;if(active!==this.traversal){if(dead)this.pose=undefined;else if(this.traversal&&this.pose&&!active){const from=this.traversal.from,to=this.traversal.to,forward=(to.x-from.x)*this.traversal.normal.x+(to.z-from.z)*this.traversal.normal.z;for(const [i,p]of this.pose.rootPos)this.pose.rootPos.set(i,[p[0],p[1]-(to.y-from.y),p[2]-forward]);}this.traversal=active;this.fitted=active?traversalClip(active):undefined;}
  const moving=body.speed>.08,id=dead?'death_backward':combat?.melee?'punch':throwing?'throw_grenade':action?INTERACTIONS[action.kind].clip:won?'cheer':!body.grounded?'jump_air':body.landing>0?'jump_land':moving?(traversal?.approach&&((traversal.from.x-body.x)*traversal.normal.x+(traversal.from.z-body.z)*traversal.normal.z)<0?'walk_back':body.speed>2.65?'run':'walk'):'idle';
  const busy=!!combat?.melee||!!action||!!throwing||!!traversal||!body.grounded||body.landing>0||won||dead,armed=!!combat&&isGun(combat.weapon);
  const relative=Math.atan2(Math.sin(this.movementYaw-body.yaw),Math.cos(this.movementYaw-body.yaw));
  const low=!busy&&(body.crouch??0)>.05,base=low?crouchLocomotion(moving):weaponLocomotion(combat?.weapon??'none',moving,body.speed,combat?.aiming??false,relative),clip=dead?defeatClip(combat.hitDirection,(body.crouch??0)>.05):!busy&&armed?combatClip(base,combat):low?base:this.fitted??clipById.get(id)!;
  const stride=Math.hypot(...(clip.travel??[0,0,0]))*this.render.scale;
  this.phase+=dt*(moving&&stride>.05?body.speed/stride:1);
  const t=dead?Math.min(clip.duration,this.deathTime):combat?.melee?combat.melee.time:throwing?throwing.time:active?active.time:body.landing>0&&!action?Math.min(.6,.6-body.landing):action?Math.min(clip.duration,action.time/INTERACTIONS[action.kind].duration*clip.duration):this.phase%clip.duration;
  const sampleClip=!active&&(!body.grounded||body.landing>0)?{...clip,sample:(time:number)=>{const s=clip.sample(time);return {...s,root:{...s.root,lift:0}};}}:clip;
  const aimYaw=combat?.aim&&(combat.aiming||combat.fireAge<.5)?Math.atan2(combat.aim.x-body.x,combat.aim.z-body.z)-body.yaw:0;
  const target=this.render.animator.frame(sampleClip,t,{rootMotion:false,faceTime:time,...(armed?busy&&!dead?{weaponPose:'hidden' as const}:{weaponYaw:dead?0:Math.atan2(Math.sin(aimYaw),Math.cos(aimYaw))*180/Math.PI,weaponPitch:dead?0:combat.aiming?combat.pitch*180/Math.PI:0}:isGun(this.render.character.params.weapon)?{weaponPose:'hidden' as const}:{})}),weight=1-Math.exp(-dt*(action?16:12));
  if(this.equipTime>0&&!dead&&!busy){const progress=1-this.equipTime/1.15,reach=this.render.animator.frame(clipById.get('pick_up')!,progress*3.4,{rootMotion:false,weaponPose:'hidden'}),blend=Math.sin(Math.PI*progress)*.72;this.render.character.rig!.bones.forEach((bone,i)=>{if(/^(Spine\d?|Right(Shoulder|Arm|ForeArm|Hand))$/.test(bone.name))target.rot[i]=qslerp(target.rot[i],reach.rot[i],blend);});if(progress<.56){const socket=this.render.character.rig!.bones.findIndex(b=>b.name==='WeaponR');if(socket>=0){target.scale??=new Map();target.scale.set(socket,[0,0,0]);}}this.equipTime=Math.max(0,this.equipTime-dt);}
  if(this.pose&&!active){const previous=this.pose;target.rot=target.rot.map((q,i)=>qslerp(previous.rot[i],q,weight));for(const [i,p]of target.rootPos){const from=previous.rootPos.get(i)??p;target.rootPos.set(i,p.map((v,d)=>from[d]+(v-from[d])*weight)as [number,number,number]);}}
  this.pose=target;const visible=combat?hitReactionFrame(this.render.animator,target,combat,!!active||!!action||!!throwing):target,mesh=this.render.mesh;mesh.frustumCulled=!active;
  visible.rot.forEach((q,i)=>{mesh.skeleton.bones[i].quaternion.set(...q);mesh.skeleton.bones[i].scale.set(...(visible.scale?.get(i)??[1,1,1]));});
  for(const [i,p]of visible.rootPos)mesh.skeleton.bones[i].position.set(...p);
  visible.morph?.forEach((v,i)=>{if(mesh.morphTargetInfluences)mesh.morphTargetInfluences[i]=v;});
  this.heldGrenade.visible=!dead&&!!throwing&&!throwing.released;
  this.render.group.position.set(active?.from.x??body.x,dead?Math.max(combat.deathFloor??body.y,body.y-7*this.deathTime*this.deathTime):active?.from.y??body.y,active?.from.z??body.z);this.render.group.rotation.y=body.yaw;this.blood.update(combat,dt,clip,t);
 }
 private updateVehicle(car:CarState,time:number,combat?:Combatant){
  this.wasDriving=true;this.heldGrenade.visible=false;const model=car.fit.model??'pickup',ride=VEHICLE_CLIP[model],transition=car.phase==='boarding'||car.phase==='alighting',clip=clipById.get(car.phase==='boarding'?`board_${model}`:car.phase==='alighting'?`alight_${model}`:ride)!,lift=vehicleLift(model,this.render.scale),scale=boardingScale(this.render.character.rig!);
  const base=transition?boardingFrame(this.render.animator,clip,car.time/(car.phase==='boarding'?DRIVE.boarding:DRIVE.alighting)*clip.duration,clipById.get('idle')!,clipById.get(ride)!,lift,ride,[car.fit.stand.x/scale,car.fit.stand.z/scale]):this.render.animator.frame(drivingClip(car.steer,model),0,{vehicleLift:lift,weaponPose:combat&&isGun(combat.weapon)?combat.fireAge<.22?'fire':combat.aiming?'aim':'hold':'hidden',weaponYaw:combat?.aim?Math.atan2(Math.sin(Math.atan2(combat.aim.x-car.x,combat.aim.z-car.z)-car.yaw),Math.cos(Math.atan2(combat.aim.x-car.x,combat.aim.z-car.z)-car.yaw))*180/Math.PI:80,weaponPitch:combat?.aiming?(combat.pitch??0)*180/Math.PI:0,rootMotion:false,vehicleMotion:false,faceTime:time});
  const socket=this.render.character.rig!.bones.findIndex(b=>b.name==='WeaponR');base.scale??=new Map();if(socket>=0&&(transition||!combat||!isGun(combat.weapon)))base.scale.set(socket,[0,0,0]);this.vehicleFrame=base;
  const f=combat?.health===0?seatedDefeatFrame(this.render.animator,base,this.deathTime):combat?hitReactionFrame(this.render.animator,base,combat,true):base,mesh=this.render.mesh;mesh.frustumCulled=false;
  f.rot.forEach((q,i)=>{mesh.skeleton.bones[i].quaternion.set(...q);mesh.skeleton.bones[i].scale.set(...(f.scale?.get(i)??[1,1,1]));});for(const [i,p]of f.rootPos)mesh.skeleton.bones[i].position.set(...p);f.morph?.forEach((v,i)=>{if(mesh.morphTargetInfluences)mesh.morphTargetInfluences[i]=v;});
  this.render.group.position.set(car.x,0,car.z);this.render.group.rotation.y=car.yaw;this.pose=undefined;
 }
 dispose(){this.blood.dispose();disposeGrenade(this.heldGrenade);this.render.dispose();}
}
