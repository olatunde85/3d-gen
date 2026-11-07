import {aerialHeight} from './aerial-motion';
/** A film-time vehicle plan. Future props wait at their first entry; abandoned props stay put. */
import {clipById,type Clip} from '../core/anim/clips';
import {boardingStand,ridingClip} from '../core/props/vehicle-actions';
import {VEHICLE_FOR_CLIP,VEHICLE_CLIP,vehicleLift,type VehicleId} from '../core/props/vehicles';
import type {Vec3} from '../core/math';
import {timelineAt,trackDuration,type ActorTrack,type Beat,type StudioProject} from './project';
import {vehicleCatalog,vehicleKey,type VehicleSeat} from './vehicle-seats';
import {HELICOPTER} from '../core/props/helicopter-layout';
import {helicopterHeight} from './helicopter-flight';
import {studioTravel} from './motion';
export interface VehicleBody {scale:number;boardingScale:number;weapon?:string;hip(clip:string,model?:VehicleId):Vec3}
export interface StagePoint {x:number;y:number;z:number;yaw:number}
interface Row {actor:ActorTrack;beat:Beat;index:number;start:number;end:number;offset:Vec3;vehicle?:string}
export interface StagedVehicle extends StagePoint {id:string;model:VehicleId;scale:number;owner:ActorTrack;clip:Clip;reference:Clip;phase:number;distance:number;parked:boolean;visible:boolean;active?:Row}
export interface StagedActor extends StagePoint {vehicle?:StagedVehicle;seat:VehicleSeat;seatShift:Vec3;stand?:[number,number];passenger:boolean;deckFloor:number}
const fallback:VehicleBody={scale:1,boardingScale:1,hip:()=>[0,1,0]};
const turn=(x:number,z:number,yaw:number)=>{const a=yaw*Math.PI/180;return{x:x*Math.cos(a)+z*Math.sin(a),z:-x*Math.sin(a)+z*Math.cos(a)};};
export class VehicleStage {
 readonly vehicles=new Map<string,StagedVehicle>();
 private rows=new Map<string,Row[]>();
 private catalog;
 constructor(readonly project:StudioProject,readonly time:number,readonly bodies:ReadonlyMap<string,VehicleBody>){
  this.catalog=vehicleCatalog(project);
  for(const actor of project.actors){
   const body=bodies.get(actor.id)??fallback,first=actor.beats.find(b=>VEHICLE_FOR_CLIP[b.clip]),initial=first&&clipById.get(first.clip)?.vehicleTransition?.direction==='board'?boardingStand(ridingClip(first.clip)):[0,0];
   let standing:Vec3=[initial[0]*body.boardingScale,0,initial[1]*body.boardingScale],offset:Vec3=[0,0,0],start=0;
   const rows:Row[]=[],parked=new Map<string,Vec3>();
   actor.beats.forEach((beat,index)=>{
    const model=VEHICLE_FOR_CLIP[beat.clip],vehicle=model?vehicleKey(actor,beat):undefined,transition=clipById.get(beat.clip)?.vehicleTransition;
    if(vehicle){
     const prev=rows.at(-1),continuing=prev?.vehicle===vehicle&&!(transition?.direction==='board'&&clipById.get(prev.beat.clip)?.vehicleTransition?.direction==='alight');
     if(!continuing){const stand=transition?.direction==='board'?boardingStand(ridingClip(beat.clip)):[0,0],known=parked.get(vehicle),at=timelineAt(project,start,actor);offset=known?[known[0]-at.x*body.scale,0,known[2]-at.z*body.scale]:[standing[0]-stand[0]*body.boardingScale,0,standing[2]-stand[1]*body.boardingScale];}
    }else offset=[...standing];
    rows.push({actor,beat,index,start,end:start+beat.duration,offset:[...offset],vehicle});
    if(vehicle){const end=timelineAt(project,start+beat.duration,actor);parked.set(vehicle,[end.x*body.scale+offset[0],0,end.z*body.scale+offset[2]]);}
    if(transition?.direction==='alight'){const stand=boardingStand(ridingClip(beat.clip));standing=[offset[0]+stand[0]*body.boardingScale,0,offset[2]+stand[1]*body.boardingScale];}
    start+=beat.duration;
   });this.rows.set(actor.id,rows);
  }
  for(const entry of this.catalog.values()){
   const rows=this.rows.get(entry.actor.id)!.filter(r=>r.vehicle===entry.id&&(r.beat.vehicleSeat??'operator')==='operator');
   const row=rows.find(r=>time>=r.start&&time<r.end)??[...rows].reverse().find(r=>time>=r.end)??rows[0];
   const sample=Math.max(row.start,Math.min(row.end,time)),point=this.nominal(row,sample),at=timelineAt(project,sample,entry.actor),active=time>=row.start&&time<row.end||time>=trackDuration(entry.actor)&&row===this.rows.get(entry.actor.id)!.at(-1)&&!clipById.get(row.beat.clip)?.vehicleTransition;
   const clip=clipById.get(row.beat.clip)!,visible=row.beat.showVehicle??entry.actor.vehicle!=='none';
   this.vehicles.set(entry.id,{...point,id:entry.id,model:entry.model,scale:bodies.get(entry.actor.id)?.scale??1,owner:entry.actor,clip,reference:clipById.get(entry.beat.clip)!,phase:active?at.phase:clip.duration,distance:at.z*(bodies.get(entry.actor.id)?.scale??1),parked:!active,visible,active:active?row:undefined});
  }
 }
 private nominal(row:Row,time:number):StagePoint{
  const at=timelineAt(this.project,time,row.actor),body=this.bodies.get(row.actor.id)??fallback,d=turn(at.x*body.scale+row.offset[0],at.z*body.scale+row.offset[2],row.actor.yaw);
  return{x:row.actor.x+d.x,y:row.actor.y+helicopterHeight(row.actor,row.index,time)+aerialHeight(row.actor,row.index,time),z:row.actor.z+d.z,yaw:row.actor.yaw};
 }
 private seat(row:Row,vehicle:StagedVehicle):{shift:Vec3;stand?:[number,number]}{
  const seat=row.beat.vehicleSeat??'operator';if(seat==='operator')return{shift:[0,0,0]};
  const owner=this.bodies.get(vehicle.owner.id)??fallback,guest=this.bodies.get(row.actor.id)??fallback,s=owner.scale,hip=owner.hip(VEHICLE_CLIP[vehicle.model]);
  let target:Vec3;
  if(vehicle.model==='helicopter')target=[hip[0]+(seat==='front-passenger'||seat==='rear-left'?HELICOPTER.seatWidth*s:0),hip[1],hip[2]+(seat.startsWith('rear')?-HELICOPTER.seatPitch*s:0)];
  else if(vehicle.model==='motorboat')target=[(seat==='passenger-left'?.52:-.52)*s,.81*s,hip[2]-1.30*s];
  else if(vehicle.model==='motorcycle')target=[hip[0],hip[1]+.04*s,hip[2]-.65*s];
  else if(vehicle.model==='canoe'||vehicle.model==='rowboat')target=[hip[0],hip[1],hip[2]-.8*s];
  else target=[hip[0]+(seat==='rear-left'?.08:seat==='rear-right'?-.80:-.72)*s,hip[1],hip[2]+(seat.startsWith('rear')?-.91*s:0)];
  const pose=vehicle.model==='motorcycle'?'ride_motorcycle':'sit_passenger',own=guest.hip(pose,vehicle.model),shift=target.map((v,i)=>v-own[i])as Vec3;
  const boat=['motorboat','canoe','rowboat'].includes(vehicle.model),gate=boardingStand(VEHICLE_CLIP[vehicle.model]);
  if(vehicle.model==='helicopter'){const left=seat==='front-passenger'||seat==='rear-left',x=(left?HELICOPTER.standLeft:HELICOPTER.standRight)*owner.boardingScale,z=seat.startsWith('rear')?hip[2]-HELICOPTER.seatPitch*s:hip[2];return{shift,stand:[(x-shift[0])/guest.boardingScale,(z-shift[2]-own[2])/guest.boardingScale]};}
  return {shift,...(boat?{stand:[(gate[0]*owner.boardingScale-shift[0])/guest.boardingScale,(gate[1]*owner.boardingScale-shift[2])/guest.boardingScale]as [number,number]}:{})};
 }
 private onVehicle(row:Row,time:number):StagedActor{
  // Evaluate at the entry/exit boundary too, independent of the currently rendered time.
  const stage=time===this.time?this:new VehicleStage(this.project,time,this.bodies),vehicle=stage.vehicles.get(row.vehicle!)!,{shift,stand}=stage.seat(row,vehicle),offset=turn(shift[0],shift[2],vehicle.yaw);
  return {x:vehicle.x+offset.x,y:vehicle.y,z:vehicle.z+offset.z,yaw:vehicle.yaw,vehicle,seat:row.beat.vehicleSeat??'operator',seatShift:shift,stand,passenger:(row.beat.vehicleSeat??'operator')!=='operator',deckFloor:vehicleLift(vehicle.model,this.bodies.get(vehicle.owner.id)?.scale??1)};
 }
 actor(track:ActorTrack):StagedActor{
  const rows=this.rows.get(track.id)!,at=timelineAt(this.project,this.time,track),row=rows[at.index];
  if(row.vehicle)return this.onVehicle(row,clipById.get(row.beat.clip)?.vehicleTransition?.direction==='alight'?Math.min(this.time,row.end):this.time);
  // Ground spans connect the two actual doorway/gunwale positions, not two unrelated actor origins.
  let first=at.index,last=at.index;while(first>0&&!rows[first-1].vehicle)first--;while(last<rows.length-1&&!rows[last+1].vehicle)last++;
  const before=rows[first-1],after=rows[last+1],start=rows[first].start,end=rows[last].end,nominal=this.nominal(row,this.time);
  const boundary=(r:Row,t:number)=>{const point=this.onVehicle(r,t),body=this.bodies.get(track.id)??fallback,transition=clipById.get(r.beat.clip)?.vehicleTransition,stand=transition?(point.stand??boardingStand(ridingClip(r.beat.clip))):[0,0],d=turn(stand[0]*body.boardingScale,stand[1]*body.boardingScale,point.yaw);return {...point,x:point.x+d.x,z:point.z+d.z};};
  const a=this.nominal(rows[first],start),b=this.nominal(rows[last],end),from=before?boundary(before,start):undefined,to=after?boundary(after,end):undefined;
  const distance=(t:number)=>{let sum=0;for(let i=first;i<=last;i++){const r=rows[i],dt=Math.max(0,Math.min(r.end,t)-r.start);if(r.beat.move){const x=this.nominal(r,r.start),z=this.nominal(r,r.start+dt);sum+=Math.hypot(z.x-x.x,z.z-x.z);}}return sum;};
  const total=distance(end),u=total>1e-8?distance(this.time)/total:after&&!before?1:0;
  const dx0=from?from.x-a.x:to?to.x-b.x:0,dz0=from?from.z-a.z:to?to.z-b.z:0,dx1=to?to.x-b.x:dx0,dz1=to?to.z-b.z:dz0;
  let yaw=nominal.yaw;
  const travel=row.beat.move?studioTravel(row.beat.clip,row.beat.travelSpeed):undefined;
  if(travel&&total>1e-8){const body=this.bodies.get(track.id)??fallback,v=turn(travel[0]*body.scale,travel[2]*body.scale,yaw),speed=Math.hypot(v.x,v.z),vx=v.x+(dx1-dx0)*speed/total,vz=v.z+(dz1-dz0)*speed/total;if(Math.hypot(vx,vz)>1e-6)yaw=(Math.atan2(vx,vz)-Math.atan2(travel[0],travel[2]))*180/Math.PI;}
  return {...nominal,yaw,x:nominal.x+dx0+(dx1-dx0)*u,z:nominal.z+dz0+(dz1-dz0)*u,seat:'operator',seatShift:[0,0,0],passenger:false,deckFloor:0};
 }
 /** All physical doors used now, including passengers entering while the driver waits. */
 transitions(id:string){return [...this.rows.values()].flatMap(rows=>rows.filter(r=>r.vehicle===id&&this.time>=r.start&&this.time<r.end&&clipById.get(r.beat.clip)?.vehicleTransition).map(row=>({clip:clipById.get(row.beat.clip)!,time:this.time-row.start,seat:row.beat.vehicleSeat??'operator'})));}
 armed(id:string){return this.project.actors.some(actor=>{const row=this.rows.get(actor.id)![timelineAt(this.project,this.time,actor).index],weapon=this.bodies.get(actor.id)?.weapon;return row.vehicle===id&&weapon&&weapon!=='none'&&weapon!=='grenade'&&row.beat.weaponPose!=='hidden'&&!clipById.get(row.beat.clip)?.vehicleTransition;});}
}
