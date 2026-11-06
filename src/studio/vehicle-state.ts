/** Legacy single-prop query; the renderer uses VehicleStage's complete persistent inventory. */
import {VehicleStage} from './vehicle-stage';
import {timelineAt,type StudioProject,type ActorTrack} from './project';
import {boardingStand,ridingClip} from '../core/props/vehicle-actions';
export function vehicleStateAt(project:StudioProject,time:number,track:ActorTrack){
 const plan=new VehicleStage(project,time,new Map()),actor=plan.actor(track),states=[...plan.vehicles.values()].filter(v=>v.owner.id===track.id),state=actor.vehicle??states.find(v=>v.active)??states[0];if(!state)return;
 const at=timelineAt(project,time,track),a=-track.yaw*Math.PI/180,dx=state.x-track.x,dz=state.z-track.z;
 return {clip:state.clip,visible:state.visible,parked:state.parked,offset:state.parked?boardingStand(ridingClip(state.clip.id)):[0,0],x:dx*Math.cos(a)+dz*Math.sin(a)-at.x,z:-dx*Math.sin(a)+dz*Math.cos(a)-at.z,distance:state.distance,phase:state.phase};
}
