/** Derive parked props from the timeline, so scrubbing and reload never depend on playback history. */
import {clipById} from '../core/anim/clips';
import {VEHICLE_FOR_CLIP} from '../core/props/vehicles';
import {boardingStand,ridingClip} from '../core/props/vehicle-actions';
import {timelineAt,type StudioProject,type ActorTrack} from './project';
export function vehicleStateAt(project:StudioProject,time:number,track:ActorTrack){
 const at=timelineAt(project,time,track),current=track.beats[at.index];
 let source=at.index,parked=false,anchorTime=at.start;
 if(!VEHICLE_FOR_CLIP[current.clip]){
  source=-1;
  for(let i=at.index-1;i>=0;i--){if(VEHICLE_FOR_CLIP[track.beats[i].clip]){if(clipById.get(track.beats[i].clip)?.vehicleTransition?.direction==='alight')source=i;break;}}
  if(source<0){for(let i=at.index+1;i<track.beats.length;i++){if(VEHICLE_FOR_CLIP[track.beats[i].clip]){if(clipById.get(track.beats[i].clip)?.vehicleTransition?.direction==='board')source=i;break;}}}
  if(source<0)return undefined;
  parked=true;anchorTime=track.beats.slice(0,source).reduce((sum,b)=>sum+b.duration,0);
 }
 const beat=track.beats[source],clip=clipById.get(beat.clip)!,visible=beat.showVehicle??track.vehicle!=='none';
 const anchor=parked?timelineAt(project,anchorTime,track):at;
 return {clip,visible,parked,offset:parked?boardingStand(ridingClip(clip.id)):[0,0],x:(anchor.x-at.x),z:(anchor.z-at.z),distance:anchor.z,phase:parked?clip.duration:at.phase};
}
