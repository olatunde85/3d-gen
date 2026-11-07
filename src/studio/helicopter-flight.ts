import {JET_MANOEUVRES} from '../core/props/vehicle-actions';
export const isFlightClip=(id:string)=>/^(?:fly|tumble)_(?:helicopter|jet)$/.test(id)||!!JET_MANOEUVRES[id];
/** Deterministic flight envelopes. Pilot and guests use one world transform, never scaled skeletons. */
import type {ActorTrack,Beat} from './project';
const smooth=(n:number)=>{const x=Math.max(0,Math.min(1,n));return x*x*(3-2*x);};
export const DEFAULT_FLIGHT_HEIGHT=3,MAX_FLIGHT_HEIGHT=30,DEFAULT_JET_CRUISE=8;
export const flightHeight=(b:Beat)=>isFlightClip(b.clip)?(b.flightHeight??(JET_MANOEUVRES[b.clip]?DEFAULT_JET_CRUISE:b.move||b.clip.startsWith('tumble_')?DEFAULT_FLIGHT_HEIGHT:0)):0;
const family=(b:Beat)=>b.clip.split('_').at(-1);
const key=(b:Beat)=>b.vehicleId??`own-${b.clip.split('_').at(-1)}`;
const linked=(a:Beat|undefined,b:Beat)=>!!a&&isFlightClip(a.clip)&&family(a)===family(b)&&key(a)===key(b);
/** Cruise height a take-off climbs to (or a landing starts from): its own, else the adjoining flight's, else the default. */
function cruise(track:ActorTrack,index:number){
 const b=track.beats[index],kind=JET_MANOEUVRES[b.clip]?.kind;if(!kind)return flightHeight(b);
 const n=track.beats[index+(kind==='takeoff'?1:-1)],neighbour=linked(n,b)&&!JET_MANOEUVRES[n!.clip]?flightHeight(n!):0;
 return b.flightHeight??(neighbour>0?neighbour:DEFAULT_JET_CRUISE);
}
/**
 * Each continuous pilot span takes off once and lands once. Height changes ease between beats.
 * A jet's take-off beat climbs after its ground roll, and a landing beat descends to touchdown then rolls out;
 * a span that starts or ends with one of them skips the automatic ramp at that end.
 */
export function helicopterHeight(track:ActorTrack,index:number,time:number){
 const b=track.beats[index];if(!isFlightClip(b.clip))return 0;
 let first=index,last=index;while(first>0&&linked(track.beats[first-1],b))first--;
 while(last<track.beats.length-1&&linked(track.beats[last+1],b))last++;
 const start=track.beats.slice(0,first).reduce((n,b)=>n+b.duration,0),end=track.beats.slice(0,last+1).reduce((n,b)=>n+b.duration,0),rowStart=track.beats.slice(0,index).reduce((n,b)=>n+b.duration,0);
 const kind=JET_MANOEUVRES[b.clip]?.kind,u=(time-rowStart)/b.duration;
 if(kind==='takeoff')return cruise(track,index)*smooth((u-.5)/.5);
 if(kind==='land')return cruise(track,index)*(1-smooth(u/.6));
 const max=Math.max(...track.beats.slice(first,last+1).map(flightHeight)),ramp=Math.min((end-start)/3,Math.max(1.2,max/2.5));
 const height=flightHeight(b),previous=index>first?cruise(track,index-1):height,h=previous+(height-previous)*smooth((time-rowStart)/Math.min(1.2,b.duration/2));
 const up=JET_MANOEUVRES[track.beats[first].clip]?1:smooth((time-start)/ramp),down=JET_MANOEUVRES[track.beats[last].clip]?1:smooth((end-time)/ramp);
 return h*up*down;
}
