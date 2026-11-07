/** Studio's render adapter. Uses the generator's unmodified mesh, materials and Animator. */
import * as THREE from 'three';
import type { Character } from '../core/human';
import { Animator, type Frame } from '../core/anim/evaluate';
import { clipById } from '../core/anim/clips';
import { localTransform, quatOf } from '../core/rig/rig';
import type { ActorTrack, StudioProject, Beat } from './project';
import {Vehicle} from '../core/props/vehicle';
import {vehicleFor,vehicleLift,VEHICLE_FOR_CLIP,type VehicleChoice} from '../core/props/vehicles';
import { boneFor } from '../core/rig/poses';
import { timelineAt } from './project';
import { parcelStateAt } from './parcel';
import {VehicleStage,type VehicleBody} from './vehicle-stage';
import {passengerFrame} from './vehicle-performance';
import {doorOpenAt,boardProgress} from '../core/props/vehicle-actions';
import {ridingClip,boardingScale} from '../core/props/vehicle-actions';
import type { Seat } from './sets/builder';
import { hipsAt, isSeated, nearestSeat, seatedAt, SEAT_REACH, type Sitter } from './seating';

export class StudioActor {
  readonly group = new THREE.Group();
  readonly mesh: THREE.SkinnedMesh;
  readonly animator: Animator;
  readonly scale: number;
  readonly height: number;
  framingPadding = 0;
  framingBounds?:THREE.Box3;
  private blockingOffset = new THREE.Vector3();
  /** Camera/selection follow authored entry footwork as well as the actor's travel track. */
  get stagePosition(){return this.group.localToWorld(this.blockingOffset.clone());}
  private bones: THREE.Bone[];
  private sittingHips?: [number, number, number];
  private rides=new Map<string,Vehicle>();
  private vehiclePlan?:VehicleStage;
  private hipCache=new Map<string,[number,number,number]>();
  get vehicleBody():VehicleBody{return {scale:this.scale,boardingScale:boardingScale(this.character.rig!),weapon:this.character.params.weapon,hip:(clip,model)=>{
    const key=`${clip}/${model??''}`;let hip=this.hipCache.get(key);if(!hip){const action=clipById.get(clip)!,id=model??VEHICLE_FOR_CLIP[clip],frame=this.animator.frame(action,0,{vehicleLift:id?vehicleLift(id,this.scale):0,weaponPose:'hidden'}),index=this.character.rig!.bones.findIndex(b=>b.name===boneFor(this.character.rig!.type,'Hips'));hip=this.animator.positions(frame)[index];this.hipCache.set(key,hip);}return hip;
  }};}
  private stage(project:StudioProject,time:number,track=project.actors[0]){return this.vehiclePlan?.project===project&&this.vehiclePlan.time===time?this.vehiclePlan:new VehicleStage(project,time,this.vehiclePlan?.bodies??new Map([[track.id,this.vehicleBody]]));}
  private textures: THREE.Texture[] = [];
  constructor(readonly character: Character, texture: (file: string) => string) {
    const { mesh: m, rig } = character;
    if (!rig || !m.joints || !m.weights) throw new Error('Studio needs a rigged character.');
    this.height = character.height;
    this.scale = Math.max(...rig.bones.flatMap((b) => [b.head[1], b.tail[1]])) / 1.8;
    this.animator = new Animator(rig, character.face);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(m.uvs, 2));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(m.joints, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(m.weights, 4));
    if (m.morphs) {
      geo.morphTargetsRelative = true;
      geo.morphAttributes.position = m.morphs.deltas.map((d, i) => { const a = new THREE.BufferAttribute(d, 3); a.name = m.morphs!.names[i]; return a; });
    }
    const all = new Uint32Array(m.groups.reduce((sum, g) => sum + g.indices.length, 0));
    let offset = 0;
    for (const g of m.groups) { all.set(g.indices, offset); geo.addGroup(offset, g.indices.length, g.material); offset += g.indices.length; }
    geo.setIndex(new THREE.BufferAttribute(all, 1));
    const cache = new Map<string, THREE.Texture>(), loader = new THREE.TextureLoader();
    const get = (file: string, color: boolean) => {
      const key = `${color}:${file}`;
      let t = cache.get(key);
      if (!t) { t = loader.load(texture(file)); t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; cache.set(key, t); this.textures.push(t); }
      return t;
    };
    const materials = m.materials.map((mt) => {
      const material = new THREE.MeshStandardMaterial({ name: mt.name, color: mt.color,
        roughness: mt.roughnessMap ? 1 : mt.roughness, metalness: mt.metalness,
        map: mt.map ? get(mt.map, true) : null, normalMap: mt.normalMap ? get(mt.normalMap, false) : null,
        roughnessMap: mt.roughnessMap ? get(mt.roughnessMap, false) : null,
        side: mt.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
        emissive: mt.emissive ?? '#000000', emissiveIntensity: mt.emissive ? 1.6 : 0,
      });
      if (mt.doubleSided) material.shadowSide = THREE.FrontSide;
      if (mt.alpha === 'mask') { material.alphaTest = 0.5; material.alphaToCoverage = true; }
      if (mt.alpha === 'blend') { material.transparent = true; material.opacity = mt.opacity ?? 1; material.depthWrite = false; if (mt.map) material.alphaTest = 0.01; }
      return material;
    });
    this.mesh = new THREE.SkinnedMesh(geo, materials);
    this.bones = rig.bones.map((b, i) => { const bone = new THREE.Bone(), { t, R } = localTransform(rig.bones, i);
      bone.name = b.name; bone.position.set(...t); bone.quaternion.set(...quatOf(R)); return bone; });
    rig.bones.forEach((b, i) => (b.parent < 0 ? this.mesh : this.bones[b.parent]).add(this.bones[i]));
    this.mesh.updateMatrixWorld(true);
    this.mesh.bind(new THREE.Skeleton(this.bones));
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    // Animated limbs must not be culled against the static bind-pose bounding sphere.
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
  }
  async ready() {
    // TextureLoader is asynchronous. Export must never encode the untextured first frame.
    await Promise.all(this.textures.map((t) => new Promise<void>((resolve, reject) => {
      const image = t.image as HTMLImageElement | undefined;
      if (image?.complete && image.naturalWidth > 0) return resolve();
      const poll = setInterval(() => { const img = t.image as HTMLImageElement | undefined;
        if (img?.complete && img.naturalWidth > 0) { clearInterval(poll); clearTimeout(timeout); resolve(); } }, 30);
      const timeout = setTimeout(() => { clearInterval(poll); reject(new Error('A character texture could not load. Please try again.')); }, 25_000);
    })));
  }
  frame(project: StudioProject, time: number, track = project.actors[0]): Frame {
    const at = timelineAt(project, time, track), b = track.beats[at.index], clip = clipById.get(b.clip)!;
    const faceTime = time + Math.max(0, project.actors.indexOf(track)) * 0.83;
    const local = clip.loop ? at.phase % clip.duration : Math.min(at.phase, clip.duration);
    const parcel=parcelStateAt(track,at.time),id=vehicleFor(this.vehicleChoice(track,b),clip.id);
    const lift=id?vehicleLift(id,this.scale):0;
    const stage=this.stage(project,time,track),state=stage.actor(track);
    let frame = state.passenger?passengerFrame(this.animator,b,local,state,this.scale,faceTime):this.animator.frame(clip, local, { faceTime,parcelGrounded:parcel.grounded,vehicleLift:lift,weaponPose:b.weaponPose,weaponPitch:b.weaponPitch,weaponYaw:b.weaponYaw });
    const previousClip=clipById.get(track.beats[Math.max(0,at.index-1)].clip)!,fromVehicle=VEHICLE_FOR_CLIP[previousClip.id],toVehicle=VEHICLE_FOR_CLIP[clip.id];
    const blend=(!fromVehicle&&!toVehicle)||(!toVehicle&&previousClip.vehicleTransition?.direction==='alight')||(!fromVehicle&&clip.vehicleTransition?.direction==='board')||(clip.vehicleTransition?.direction==='alight'&&ridingClip(previousClip.id)===clip.vehicleTransition.ride);
    if (blend&&at.index && at.local < 0.3 && (track.beats[at.index - 1].clip !== b.clip || !clip.loop)) {
      const previous = track.beats[at.index - 1], fromClip = clipById.get(previous.clip)!;
      const prior = timelineAt(project, Math.max(0, at.start - 0.000001), track);
      const priorPhase = prior.phase + 0.000001;
      const fromTime = fromClip.loop ? priorPhase % fromClip.duration : Math.min(priorPhase, fromClip.duration);
      const priorState=this.stage(project,prior.time,track).actor(track);
      const from = priorState.passenger?passengerFrame(this.animator,previous,fromTime,priorState,this.scale,faceTime):this.animator.frame(fromClip, fromTime, { faceTime,parcelGrounded:parcelStateAt(track,prior.time).grounded,weaponPose:previous.weaponPose,weaponPitch:previous.weaponPitch,weaponYaw:previous.weaponYaw,vehicleLift:vehicleFor(this.vehicleChoice(track,previous),fromClip.id)?vehicleLift(vehicleFor(this.vehicleChoice(track,previous),fromClip.id)!,this.scale):0 });
      // Blend in the current group's coordinates, so a door/seat offset cannot slide a foot at a join.
      const inv=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-state.yaw*Math.PI/180),turn=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),priorState.yaw*Math.PI/180).premultiply(inv),delta=new THREE.Vector3(priorState.x-state.x,priorState.y-state.y,priorState.z-state.z).applyQuaternion(inv);
      for(const [i,p]of from.rootPos)from.rootPos.set(i,new THREE.Vector3(...p).applyQuaternion(turn).add(delta).toArray());
      this.character.rig!.bones.forEach((bone,i)=>{if(bone.parent<0)from.rot[i]=new THREE.Quaternion(...from.rot[i]).premultiply(turn).toArray();});
      const w = at.local / 0.3, ease = w * w * (3 - 2 * w);
      const rootPos = new Map(frame.rootPos);
      for (const [i, p] of rootPos) { const q = from.rootPos.get(i)!; rootPos.set(i, p.map((v, d) => q[d] + (v - q[d]) * ease) as [number, number, number]); }
      const a = new THREE.Quaternion(), c = new THREE.Quaternion();
      frame = { ...frame, rootPos, morph: frame.morph?.map((v, i) => (from.morph?.[i] ?? v) + (v - (from.morph?.[i] ?? v)) * ease), rot: frame.rot.map((q, i) => a.set(...from.rot[i]).slerp(c.set(...q), ease).toArray() as [number, number, number, number]) };
    }
    if(frame.ridingWeapon&&at.index&&at.local<.3){
      const previous=track.beats[at.index-1];
      if(previousClip.vehicleTransition?.direction==='board'||previous.clip===b.clip&&(previous.weaponPose!==b.weaponPose||previous.weaponYaw!==b.weaponYaw||previous.weaponPitch!==b.weaponPitch)){
        const prior=timelineAt(project,Math.max(0,at.start-.000001),track),t=previousClip.loop?(prior.phase+.000001)%previousClip.duration:Math.min(prior.phase+.000001,previousClip.duration);
        const priorState=this.stage(project,prior.time,track).actor(track),from=priorState.passenger?passengerFrame(this.animator,previous,t,priorState,this.scale,faceTime):this.animator.frame(previousClip,t,{vehicleLift:lift,weaponPose:previous.weaponPose,weaponPitch:previous.weaponPitch,weaponYaw:previous.weaponYaw}),rig=this.character.rig!,names=new Set([boneFor(rig.type,'RightShoulder'),boneFor(rig.type,'Neck'),boneFor(rig.type,'Head')]),chain=new Set<number>();
        rig.bones.forEach((bone,i)=>{if(bone.name===boneFor(rig.type,'RightShoulder')||chain.has(bone.parent))chain.add(i);});
        const u=at.local/.3,w=u*u*(3-2*u),a=new THREE.Quaternion(),c=new THREE.Quaternion();
        frame.rot=frame.rot.map((q,i)=>chain.has(i)||names.has(rig.bones[i].name)?a.set(...from.rot[i]).slerp(c.set(...q),w).toArray()as [number,number,number,number]:q);
      }
    }
    this.animator.placeParcel(frame,clip,local,false,parcel.grounded);
    if(lift){const i=this.character.rig!.bones.findIndex(b=>b.name==='Parcel'),p=frame.rootPos.get(i);if(p)frame.rootPos.set(i,[p[0],p[1]+lift,p[2]]);}
    if(parcel.grounded&&parcel.releasedAt!==undefined){
      const index=this.character.rig!.bones.findIndex(b=>b.name==='Parcel'),position=frame.rootPos.get(index);
      if(position){const dropped=timelineAt(project,parcel.releasedAt,track);frame.rootPos.set(index,[position[0]+(dropped.x-at.x)*this.scale,position[1],position[2]+(dropped.z-at.z)*this.scale]);}
    }
    return frame;
  }
  pose(project: StudioProject, time: number, track: ActorTrack = project.actors[0], seats: readonly Seat[] = [],vehicles?:VehicleStage) {
    this.vehiclePlan=vehicles;
    const frame = this.frame(project, time, track);
    frame.rot.forEach((q, i) => {this.bones[i].quaternion.set(...q);this.bones[i].scale.set(...(frame.scale?.get(i)??[1,1,1]));});
    for (const [i, p] of frame.rootPos) this.bones[i].position.set(...p);
    frame.morph?.forEach((w, i) => { if (this.mesh.morphTargetInfluences) this.mesh.morphTargetInfluences[i] = w; });
    const at = timelineAt(project, time, track);
    const stage=this.stage(project,time,track),state=stage.actor(track);
    this.blockingOffset.set(0,0,0);
    if(clipById.get(track.beats[at.index].clip)?.vehicleTransition){
      const root=this.character.rig!.bones.findIndex(b=>b.name===boneFor(this.character.rig!.type,'Hips')),p=frame.rootPos.get(root),rest=this.character.rig!.bones[root];
      if(p)this.blockingOffset.set(p[0]-rest.head[0],0,p[2]-rest.head[2]);
    }
    this.group.position.set(state.x,state.y,state.z);this.group.rotation.y=state.yaw*Math.PI/180;
    this.group.position.y += this.seatLift(project, track, seats, track.beats[at.index].clip, at.phase);
    this.group.updateMatrixWorld(true);
    this.props(project,time,track,frame);
    this.group.updateMatrixWorld(true);
  }
  /** The scale and sitting-hip position the seating needs. */
  get sitter(): Sitter {
    if (!this.sittingHips) {
      const rig = this.character.rig!, hips = rig.bones.findIndex(b => b.name === boneFor(rig.type, 'Hips'));
      this.sittingHips = [...this.animator.positions(this.animator.frame(clipById.get('sit_idle')!, 0))[Math.max(0, hips)]] as [number, number, number];
    }
    return { scale: this.scale, hips: this.sittingHips };
  }
  /** Raises or lowers the sitting pose to the seat's height, easing in while sitting down and out while standing up. */
  private seatLift(project: StudioProject, track: ActorTrack, seats: readonly Seat[], clip: string, phase: number) {
    if (!isSeated(clip) || !seats.length) return 0;
    const at = seatedAt(project, track)!, sitter = this.sitter, hips = hipsAt(track, at, sitter), found = nearestSeat(seats, hips.x, hips.z);
    if (!found || found.distance > SEAT_REACH) return 0;
    const duration = clipById.get(clip)!.duration, t = Math.min(1, phase / duration);
    const weight = clip === 'sit_down' ? t : clip === 'stand_up' ? 1 - t : 1;
    // The pose sits on a surface 8 cm (at reference height) below its hips.
    return (found.seat.y - (sitter.hips[1] - 0.08 * this.scale)) * weight * weight * (3 - 2 * weight);
  }
  private vehicleChoice(track:ActorTrack,b:Beat):VehicleChoice{return (b.showVehicle??track.vehicle!=='none')?'auto':'none';}
  private props(project:StudioProject,time:number,track:ActorTrack,frame:Frame){
    const stage=this.stage(project,time,track),current=stage.actor(track),keep=new Set<string>();this.framingPadding=0;this.framingBounds=undefined;
    for(const state of stage.vehicles.values()){
      if(state.owner.id!==track.id)continue;keep.add(state.id);let ride=this.rides.get(state.id);
      if(ride&&(ride.id!==state.model||ride.fit.clip.id!==ridingClip(state.reference.id))){ride.group.removeFromParent();ride.dispose();this.rides.delete(state.id);ride=undefined;}
      if(!ride){ride=new Vehicle(state.model,this.character.rig!,this.animator,state.reference,this.character.params.vehicleStyle);ride.group.userData.studioVehicle=state.id;this.rides.set(state.id,ride);this.group.add(ride.group);}
      ride.group.visible=state.visible;
      const angle=-this.group.rotation.y,delta=new THREE.Vector3(state.x-this.group.position.x,state.y-this.group.position.y,state.z-this.group.position.z).applyAxisAngle(new THREE.Vector3(0,1,0),angle);
      ride.group.position.copy(delta);ride.group.rotation.y=state.yaw*Math.PI/180-this.group.rotation.y;
      const doors=stage.transitions(state.id),waiting=state.model==='helicopter'&&!!state.active&&!state.active.beat.move&&(state.active.beat.flightHeight??0)===0;
      ride.update(state.clip.loop?state.phase%state.clip.duration:Math.min(state.phase,state.clip.duration),state.parked?undefined:frame,state.distance,state.clip,state.parked||state.model==='helicopter'&&(doors.length>0||waiting));
      if(stage.armed(state.id))ride.group.traverse(o=>{if(o.name.startsWith('Window_'))o.scale.y=.001;});
      ride.group.traverse(o=>{if(o.userData.doorSide){let opening=0;for(const door of doors){const rear=door.seat.startsWith('rear'),side=state.model==='helicopter'?(door.seat==='front-passenger'||door.seat==='rear-left'?1:-1):door.seat==='rear-left'?1:door.seat==='rear-right'||door.seat==='front-passenger'?-1:door.clip.id.includes('passenger')?-1:1;if(!!o.userData.rearDoor===rear&&o.userData.doorSide===side)opening=Math.max(opening,doorOpenAt(boardProgress(door.clip.vehicleTransition!,door.time,door.clip.duration)));}o.rotation.y=-o.userData.doorSide*opening*1.3;}if(o.name==='Canopy'){const opening=Math.max(0,...doors.map(d=>doorOpenAt(boardProgress(d.clip.vehicleTransition!,d.time,d.clip.duration))));o.rotation.z=-opening*1.3;}if(o.name==='Boarding_gate'){const opening=Math.max(0,...doors.map(d=>doorOpenAt(boardProgress(d.clip.vehicleTransition!,d.time,d.clip.duration))));o.rotation.y=opening*1.5;}});
      if(current.vehicle?.id===state.id&&state.visible){this.framingBounds=ride.bounds;const size=this.framingBounds.getSize(new THREE.Vector3());this.framingPadding=Math.max(size.x,size.z)*.43;}
    }
    for(const [id,ride]of this.rides)if(!keep.has(id)){ride.group.removeFromParent();ride.dispose();this.rides.delete(id);}
  }
  detach() { this.group.removeFromParent(); }
  dispose() { this.rides.forEach(r=>r.dispose());this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material[]).forEach((m) => m.dispose());
    this.mesh.skeleton.dispose(); this.textures.forEach((t) => t.dispose()); this.group.removeFromParent(); }
}
