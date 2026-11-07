/** How a flown jet sits in a film: pitch follows the film's actual climb, wings bank with the stick, gear folds once clear of the ground. */
import {clipById} from '../core/anim/clips';
import {VEHICLE_FOR_CLIP} from '../core/props/vehicles';
import {jetFlightState,manoeuvre,type FlightState} from '../core/props/vehicle-motion';
import {helicopterHeight} from './helicopter-flight';
import {timelineAt,type ActorTrack,type StudioProject} from './project';
export type JetAttitude=FlightState;
/** Radians and metres for the pilot's jet at `time`, or undefined when the actor is not flying a jet. */
export function jetAttitude(project:StudioProject,track:ActorTrack,time:number,scale:number):JetAttitude|undefined{
 const at=timelineAt(project,time,track),b=track.beats[at.index],clip=clipById.get(b.clip)!;
 if(VEHICLE_FOR_CLIP[b.clip]!=='jet'||(b.vehicleSeat??'operator')!=='operator')return undefined;
 if(clip.vehicleTransition)return {pitch:0,roll:0,bob:0,retract:0,throttle:0};
 const height=(t:number)=>{const p=timelineAt(project,t,track);return {h:helicopterHeight(track,p.index,t),x:p.x*scale,z:p.z*scale};};
 const dt=.08,a=height(Math.max(0,time-dt)),c=height(time+dt),h=height(time).h;
 if(clip.vehicleStunt)return {pitch:0,roll:0,bob:0,retract:jetFlightState(b.clip,0,0,time,h,0,true).retract,throttle:.7};
 // Flight-path angle from the actual climb over ground speed.
 const run=Math.hypot(c.x-a.x,c.z-a.z),path=run>1e-4?Math.atan2(c.h-a.h,run):0;
 const state=jetFlightState(b.clip,at.local/b.duration,at.phase,time,h,path,b.move);
 // While the pilot bails out the wings stay level.
 return manoeuvre(b.clip)==='bailout'?{...state,roll:0}:state;
}
