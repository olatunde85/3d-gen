/** How a flown jet sits in the air: pitch follows the climb, wings bank with the stick, gear folds once clear of the ground. */
import {clipById} from '../core/anim/clips';
import {VEHICLE_FOR_CLIP} from '../core/props/vehicles';
import {JET_MANOEUVRES} from '../core/props/vehicle-actions';
import {helicopterHeight} from './helicopter-flight';
import {timelineAt,type ActorTrack,type StudioProject} from './project';
export interface JetAttitude {pitch:number;roll:number;bob:number;retract:number;throttle:number}
const smooth=(n:number)=>{const x=Math.max(0,Math.min(1,n));return x*x*(3-2*x);};
const D=Math.PI/180;
/** Radians and metres for the pilot's jet at `time`, or undefined when the actor is not flying a jet. */
export function jetAttitude(project:StudioProject,track:ActorTrack,time:number,scale:number):JetAttitude|undefined{
 const at=timelineAt(project,time,track),b=track.beats[at.index],clip=clipById.get(b.clip)!;
 if(VEHICLE_FOR_CLIP[b.clip]!=='jet'||(b.vehicleSeat??'operator')!=='operator')return undefined;
 if(clip.vehicleTransition)return {pitch:0,roll:0,bob:0,retract:0,throttle:0};
 const height=(t:number)=>{const p=timelineAt(project,t,track);return {h:helicopterHeight(track,p.index,t),x:p.x*scale,z:p.z*scale};};
 const dt=.08,a=height(Math.max(0,time-dt)),c=height(time+dt),h=height(time).h,air=smooth((h-.3)/2);
 const retract=smooth((h-.6)/1.6),kind=JET_MANOEUVRES[b.clip]?.kind,u=at.local/b.duration;
 if(clip.vehicleStunt)return {pitch:0,roll:0,bob:0,retract,throttle:.7};
 // Flight-path angle from the actual climb over ground speed, plus a little angle of attack while airborne.
 const run=Math.hypot(c.x-a.x,c.z-a.z),climb=c.h-a.h,path=run>1e-4?Math.atan2(climb,run):0;
 let pitch=path+3*D*air,roll=0;
 if(kind==='takeoff')pitch+=8*D*smooth((u-.38)/.1)*(1-air);
 else if(kind==='land')pitch+=4*D*smooth((u-.45)/.1)*(1-smooth((u-.62)/.06));
 else{
  // The stick leads the bank by a fraction of a second (fly_jet's six-second stick cycle).
  const phase=at.phase/6*Math.PI*2;
  roll=(6*Math.sin(phase-.7)+.8*Math.sin(time*2.3))*D*air;pitch+=1.2*D*Math.sin(2*phase-.5)*air;
 }
 pitch=Math.max(-15*D,Math.min(18*D,pitch));
 const throttle=kind==='takeoff'?.35+.65*smooth(u/.1):kind==='land'?(u<.6?.35:.1):b.move?.6:h>.1?.5:.15;
 return {pitch,roll,bob:.06*air*Math.sin(time*1.7),retract,throttle};
}
