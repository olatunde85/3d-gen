/**
 * Clip-authored vehicle manoeuvres: runway, flight, bail-out and gunner actions. Renderer-free, shared by
 * the builder preview, exports and Studio. The builder and exports play the motion baked into the clip;
 * Studio flies the aircraft along the film's own route and height instead.
 */
import {qaxis,qmul,qrot,type Q} from '../anim/quat';
import type {Vec3} from '../math';
export type ManoeuvreKind='taxi'|'takeoff'|'land'|'bailout'|'gun'|'crash';
/** Road vehicles a driver can dive out of as they crash. */
export const CRASH_VEHICLES=[['car','drive_car'],['sports_car','drive_sports_car'],['suv','drive_suv'],['pickup','drive_pickup'],['motorcycle','ride_motorcycle'],['bicycle','ride_bicycle']]as const;
export const VEHICLE_MANOEUVRES:Readonly<Record<string,{ride:string;kind:ManoeuvreKind}>>={
 taxi_jet:{ride:'fly_jet',kind:'taxi'},takeoff_jet:{ride:'fly_jet',kind:'takeoff'},land_jet:{ride:'fly_jet',kind:'land'},
 bailout_jet:{ride:'fly_jet',kind:'bailout'},bailout_helicopter:{ride:'fly_helicopter',kind:'bailout'},gun_tank:{ride:'drive_tank',kind:'gun'},
 ...Object.fromEntries(CRASH_VEHICLES.flatMap(([model,ride])=>[`crash_${model}`,`crash_fall_${model}`].map(id=>[id,{ride,kind:'crash'as const}]))),
};
export const manoeuvre=(clip:string)=>VEHICLE_MANOEUVRES[clip]?.kind;
/** Default speeds in metres per second. */
export const JET_SPEED=18,TAXI_SPEED=8;
/** Builder/export heights; Studio uses the film's flight height. */
export const DEMO_ALTITUDE=2.5,BAILOUT_ALTITUDE=4.5;
const smooth=(n:number)=>{const x=Math.max(0,Math.min(1,n));return x*x*(3-2*x);};
const D=Math.PI/180;
const ease=(x:number)=>x*x*x-x*x*x*x/2;
/**
 * Seconds of full-speed travel covered after `local` seconds of a beat. Take-off accelerates from a
 * standstill to cruise over its ground roll; landing holds approach speed, then brakes to a stop.
 */
export function travelTime(clip:string,local:number,duration:number){
 const u=Math.max(0,Math.min(1,local/duration)),kind=manoeuvre(clip);
 if(kind==='takeoff'){const a=.55,x=Math.min(u/a,1);return duration*(a*ease(x)+Math.max(0,u-a));}
 if(kind==='land'){const b=.6,c=.4,x=Math.max(0,(u-b)/c);return duration*(Math.min(u,b)+c*(x-ease(x)));}
 return local;
}
/** Take-off climbs after its ground roll; landing descends to touchdown at 60%, then rolls out. */
export function jetHeight(clip:string,u:number,cruise:number){
 const kind=manoeuvre(clip);
 return kind==='takeoff'?cruise*smooth((u-.5)/.5):kind==='land'?cruise*(1-smooth(u/.6)):kind==='taxi'?0:cruise;
}
export interface FlightState {pitch:number;roll:number;bob:number;retract:number;throttle:number}
/**
 * How a flown jet sits: pitch follows the flight path (radians) plus a little angle of attack, wings bank a
 * beat behind fly_jet's six-second stick cycle (`phase` seconds), and the gear folds once clear of the ground.
 */
export function jetFlightState(clip:string,u:number,phase:number,time:number,height:number,path:number,moving:boolean):FlightState{
 const kind=manoeuvre(clip),air=smooth((height-.3)/2);
 let pitch=path+3*D*air,roll=0;
 if(kind==='takeoff')pitch+=8*D*smooth((u-.38)/.1)*(1-air);
 else if(kind==='land')pitch+=4*D*smooth((u-.45)/.1)*(1-smooth((u-.62)/.06));
 else if(kind!=='taxi'){const a=phase/6*Math.PI*2;roll=(6*Math.sin(a-.7)+.8*Math.sin(time*Math.PI*2/3*2))*D*air;pitch+=1.2*D*Math.sin(2*a-.5)*air;}
 pitch=Math.max(-15*D,Math.min(18*D,pitch));
 const throttle=kind==='takeoff'?.35+.65*smooth(u/.1):kind==='land'?(u<.6?.35:.1):kind==='taxi'?.25:moving?.6:height>.1?.5:.15;
 // Every term repeats over fly_jet's six-second loop, so the builder preview and exports loop seamlessly.
 return {pitch,roll,bob:.06*air*Math.sin(time*Math.PI*2/3),retract:smooth((height-.6)/1.6),throttle};
}
export interface VehicleMotion {rotation:Q;translation:Vec3;retract:number;throttle:number;distance:number}
/** Pitch and bank about the main-gear contact (`pivotZ`), then lift and bob. */
export function attitudeMotion(s:FlightState,height:number,pivotZ:number,distance=0):VehicleMotion{
 const rotation=qmul(qaxis([1,0,0],-s.pitch/D),qaxis([0,0,1],s.roll/D)),pivot:Vec3=[0,0,pivotZ],p=qrot(rotation,pivot);
 return {rotation,translation:[pivot[0]-p[0],pivot[1]-p[1]+height+s.bob,pivot[2]-p[2]],retract:s.retract,throttle:s.throttle,distance};
}
/**
 * Builder/export motion of the rider and aircraft together for jet clips, played in place: the wheels turn
 * with the distance a film would cover, the jet lifts to a demonstration height and pitches with its climb.
 * Bail-outs hold the aircraft at a safe height while the occupant leaves it.
 */
export function clipVehicleMotion(clip:string,time:number,duration:number,pivotZ:number):VehicleMotion|undefined{
 const kind=manoeuvre(clip),u=Math.max(0,Math.min(1,time/duration));
 if(kind==='bailout')return {rotation:[0,0,0,1],translation:[0,BAILOUT_ALTITUDE,0],retract:1,throttle:.6,distance:0};
 if(clip!=='fly_jet'&&!['taxi','takeoff','land'].includes(kind!))return undefined;
 const speed=kind==='taxi'?TAXI_SPEED:JET_SPEED,at=(t:number)=>({h:jetHeight(clip,Math.max(0,Math.min(1,t/duration)),DEMO_ALTITUDE),d:speed*travelTime(clip,Math.max(0,t),duration)});
 const a=at(time-.08),c=at(time+.08),here=at(time),path=clip==='fly_jet'?0:Math.atan2(c.h-a.h,Math.max(1e-4,c.d-a.d));
 return attitudeMotion(jetFlightState(clip,u,time,time,here.h,path,true),here.h,pivotZ,clip==='fly_jet'?0:here.d);
}
/**
 * How far the aircraft has pulled ahead of a bailing occupant (metres along the heading). The jet keeps flying
 * once the pilot is out; the helicopter holds its hover.
 */
export function bailoutDrift(clip:string,time:number){return clip==='bailout_jet'?6*Math.max(0,time-.8)**2:0;}
/**
 * Bail-out paths (seconds; metres scaled to the rider): out through the open (right, -X) side, up and clear of the
 * airframe, then turning belly-down into free fall. The last values are where free fall continues.
 */
export const BAILOUT_PATHS:Readonly<Record<string,{T:number[];x:number[];lift:number[];pitch:number[];pose:[number,number]}>>={
 bailout_jet:{T:[0,.3,.6,.85,1.15,1.6,2.1,2.6],x:[0,0,0,-.15,-.7,-1.4,-2,-2.4],lift:[0,.02,-.05,1,1.4,.9,-.8,-3.2],pitch:[0,0,-5,0,25,60,80,85],pose:[.7,1.1]},
 bailout_helicopter:{T:[0,.35,.8,1.2,1.6,2.1,2.6],x:[0,0,-.45,-1,-1.5,-1.9,-2.2],lift:[0,.05,.2,.25,-.3,-1.6,-3.4],pitch:[0,0,10,25,55,80,85],pose:[.5,1.4]},
};
/**
 * Crash escape (seconds; metres scaled to the rider): turn to the driver's door, dive out to the left (+X),
 * shoulder-roll along the ground and stand, turning back to face the original heading.
 */
export const CRASH_PATH={T:[0,.3,.6,.85,1.1,1.35,1.6,1.9,2.3,2.8,3.6],x:[0,.1,.7,1.3,1.7,2,2.3,2.6,2.8,2.9,2.9],yaw:[0,20,70,90,90,90,90,90,90,60,0],
 pitch:[0,0,30,60,100,180,270,340,360,360,360],drop:[0,0,.3,.5,.8,.9,.85,.6,.4,.1,0],y:[0,0,.25,.2,0,0,0,0,0,0,0],floor:[1,1,1,.6,0,0,0,0,0,0,0]};
export const CRASH_DURATION=3.6;
/**
 * Crash and fall down: thrown out of the driver's door, twisting in the air, landing hard and tumbling onto
 * the back, ending in Get up (from back)'s starting pose about 3 m to the left.
 */
export const CRASH_FALL_PATH={T:[0,.3,.6,.85,1.1,1.4,1.7,2.1,2.6,3.4],x:[0,.1,.8,1.5,2,2.5,2.9,3.1,3.2,3.2],y:[0,0,.35,.25,0,0,0,0,0,0],yaw:[0,20,60,80,70,40,15,0,0,0],
 pitch:[0,0,-20,-50,-80,-100,-95,-88,-88,-88],drop:[0,0,.3,.6,.9,1,1,1,1,1],z:[0,0,0,0,-.1,-.3,-.4,-.46,-.46,-.46],floor:[1,1,1,.5,0,0,0,0,0,0]};
export const CRASH_FALL_DURATION=3.4;
/** Where the occupant ends after leaving a vehicle mid-action: [x scaled to the rider, metres behind it, height change]. */
export const vehicleExit=(clip:string,duration:number)=>{
 if(manoeuvre(clip)==='crash')return {x:(clip.startsWith('crash_fall_')?CRASH_FALL_PATH:CRASH_PATH).x.at(-1)!,lift:0,behind:0};
 const p=BAILOUT_PATHS[clip];return p?{x:p.x.at(-1)!,lift:p.lift.at(-1)!,behind:bailoutDrift(clip,duration)}:undefined;
};
