export const isFlightClip=(id:string)=>id==='fly_helicopter'||id==='fly_jet';
/** Deterministic flight envelopes. Pilot and guests use one world transform, never scaled skeletons. */
import type {ActorTrack,Beat} from './project';
const smooth=(n:number)=>{const x=Math.max(0,Math.min(1,n));return x*x*(3-2*x);};
export const DEFAULT_FLIGHT_HEIGHT=3,MAX_FLIGHT_HEIGHT=30;
export const flightHeight=(b:Beat)=>isFlightClip(b.clip)?(b.flightHeight??(b.move?DEFAULT_FLIGHT_HEIGHT:0)):0;
const key=(b:Beat)=>b.vehicleId??`own-${b.clip}`;
/** Each continuous pilot span takes off once and lands once. Height changes ease between beats. */
export function helicopterHeight(track:ActorTrack,index:number,time:number){
 const b=track.beats[index];if(!isFlightClip(b.clip))return 0;
 let first=index,last=index;while(first>0&&track.beats[first-1].clip===b.clip&&key(track.beats[first-1])===key(b))first--;
 while(last<track.beats.length-1&&track.beats[last+1].clip===b.clip&&key(track.beats[last+1])===key(b))last++;
 const start=track.beats.slice(0,first).reduce((n,b)=>n+b.duration,0),end=track.beats.slice(0,last+1).reduce((n,b)=>n+b.duration,0),rowStart=track.beats.slice(0,index).reduce((n,b)=>n+b.duration,0);
 const max=Math.max(...track.beats.slice(first,last+1).map(flightHeight)),ramp=Math.min((end-start)/3,Math.max(1.2,max/2.5));
 const height=flightHeight(b),previous=index>first?flightHeight(track.beats[index-1]):height,h=previous+(height-previous)*smooth((time-rowStart)/Math.min(1.2,b.duration/2));
 return h*smooth((time-start)/ramp)*smooth((end-time)/ramp);
}
