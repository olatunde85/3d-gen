/** Authored descent, derived from the timeline so seeking/export produce the same altitude. */
import type {ActorTrack,Beat} from './project';
export const AERIAL_HEIGHTS:Readonly<Record<string,number>>={skydive:20,parachute_deploy:12,parachute_glide:8,parachute_land:2};
export const isAerialClip=(clip:string)=>clip in AERIAL_HEIGHTS;
export const aerialStartHeight=(beat:Beat)=>beat.flightHeight??AERIAL_HEIGHTS[beat.clip]??0;
export function aerialHeight(track:ActorTrack,index:number,time:number){
 const beat=track.beats[index];if(!isAerialClip(beat.clip))return 0;
 const start=track.beats.slice(0,index).reduce((n,b)=>n+b.duration,0),next=track.beats[index+1],from=aerialStartHeight(beat),to=beat.clip==='parachute_land'?0:next&&isAerialClip(next.clip)?aerialStartHeight(next):from;
 const u=Math.max(0,Math.min(1,(time-start)/(beat.duration*(beat.clip==='parachute_land'?.65/3:1)))),w=u*u*(3-2*u);return from+(to-from)*w;
}
