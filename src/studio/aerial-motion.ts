/** Authored descent, derived from the timeline so seeking/export produce the same altitude. */
import type {ActorTrack,Beat} from './project';
import {bailoutExit} from '../core/props/vehicle-motion';
import {helicopterHeight} from './helicopter-flight';
export const AERIAL_HEIGHTS:Readonly<Record<string,number>>={skydive:20,parachute_deploy:12,parachute_glide:8,parachute_land:2};
export const isAerialClip=(clip:string)=>clip in AERIAL_HEIGHTS;
export const aerialStartHeight=(beat:Beat)=>beat.flightHeight??AERIAL_HEIGHTS[beat.clip]??0;
/**
 * Start height in context. After a bail-out the free fall starts just below the aircraft, and the later
 * aerial defaults shrink in proportion so the descent never climbs back up.
 */
export function aerialStart(track:ActorTrack,index:number,actors:readonly ActorTrack[]=[track]){
 const beat=track.beats[index];if(beat.flightHeight!==undefined)return beat.flightHeight;
 let first=index;while(first>0&&isAerialClip(track.beats[first-1].clip))first--;
 const exit=first>0?bailoutExit(track.beats[first-1].clip,track.beats[first-1].duration):undefined;if(!exit)return aerialStartHeight(beat);
 // A passenger leaves at the pilot's altitude.
 const end=track.beats.slice(0,first).reduce((n,b)=>n+b.duration,0),jump=track.beats[first-1],pilot=jump.vehicleSeat&&jump.vehicleSeat!=='operator'?actors.find(a=>a!==track&&a.beats.some(b=>b.vehicleId===jump.vehicleId&&(b.vehicleSeat??'operator')==='operator')):undefined;
 const altitude=pilot?helicopterHeight(pilot,pilotIndex(pilot,end-1e-6),end-1e-6):helicopterHeight(track,first-1,end-1e-6),top=Math.max(.5,altitude+exit.lift-.4);
 return index===first?top:Math.min(AERIAL_HEIGHTS[beat.clip],top*AERIAL_HEIGHTS[beat.clip]/AERIAL_HEIGHTS[track.beats[first].clip]);
}
const pilotIndex=(track:ActorTrack,time:number)=>{let t=0;for(let i=0;i<track.beats.length;i++){t+=track.beats[i].duration;if(time<t)return i;}return track.beats.length-1;};
export function aerialHeight(track:ActorTrack,index:number,time:number,actors:readonly ActorTrack[]=[track]){
 const beat=track.beats[index];if(!isAerialClip(beat.clip))return 0;
 const start=track.beats.slice(0,index).reduce((n,b)=>n+b.duration,0),next=track.beats[index+1],from=aerialStart(track,index,actors),to=beat.clip==='parachute_land'?0:next&&isAerialClip(next.clip)?aerialStart(track,index+1,actors):from;
 const u=Math.max(0,Math.min(1,(time-start)/(beat.duration*(beat.clip==='parachute_land'?.65/3:1)))),w=u*u*(3-2*u);return from+(to-from)*w;
}
