/** Derive attachment from the timeline, so scrubbing and offline rendering agree with playback. */
import { clipById } from '../core/anim/clips';
import type { ActorTrack } from './project';
export interface ParcelState{grounded:boolean;releasedAt?:number}
export function parcelStateAt(track:ActorTrack,time:number):ParcelState{
  let start=0,state:ParcelState={grounded:false};
  for(const [i,beat]of track.beats.entries()){
    const end=start+beat.duration;
    if(time<end||i===track.beats.length-1){
      // Pickup/drop drive the box with their own authored contact timing.
      return ['pick_up','put_down'].includes(beat.clip)?{grounded:false}:state;
    }
    if(beat.clip==='put_down'){
      const release=clipById.get('put_down')!.duration-1.8;
      state=beat.duration>=release?{grounded:true,releasedAt:start+release}:{grounded:false};
    }else if(beat.clip==='pick_up'){
      state=beat.duration>=1.8?{grounded:false}:{grounded:true,releasedAt:state.releasedAt??start};
    }
    start=end;
  }
  return state;
}
