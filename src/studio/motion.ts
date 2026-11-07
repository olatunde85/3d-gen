/** Studio moves the complete rider/vehicle group; clip playback remains unchanged. */
import {clipById} from '../core/anim/clips';
import {RIDING_VEHICLES} from '../core/props/vehicles';
import {JET_MANOEUVRES} from '../core/props/vehicle-actions';
import type {Vec3} from '../core/math';
import {TROT} from '../core/props/horse-gait';
export const MAX_TRAVEL_SPEED=30, STAGE_LIMIT=200;
export const VEHICLE_SPEED={bicycle:3.6,car:4.8,sports_car:4.8,suv:4.8,motorcycle:5.4,horse:TROT.speed*3,canoe:1.95,kayak:2.4,rowboat:2.1,motorboat:4.2,helicopter:12,pickup:4.8,tank:3.6,jet:18}as const;
export function studioTravel(clip:string,speed?:number):Vec3|undefined{
 const id=RIDING_VEHICLES[clip]??(JET_MANOEUVRES[clip]?'jet':undefined);return id?[0,0,(id==='rowboat'?-1:1)*(speed??VEHICLE_SPEED[id])]:clipById.get(clip)?.travel;
}
const ease=(x:number)=>x*x*x-x*x*x*x/2;
/**
 * Seconds of full-speed travel covered after `local` seconds of a beat. Take-off accelerates from a
 * standstill to cruise over its ground roll; landing holds approach speed, then brakes to a stop.
 */
export function travelTime(clip:string,local:number,duration:number){
 const u=Math.max(0,Math.min(1,local/duration)),kind=JET_MANOEUVRES[clip]?.kind;
 if(kind==='takeoff'){const a=.55,x=Math.min(u/a,1);return duration*(a*ease(x)+Math.max(0,u-a));}
 if(kind==='land'){const b=.6,c=.4,x=Math.max(0,(u-b)/c);return duration*(Math.min(u,b)+c*(x-ease(x)));}
 return local;
}
/** Take-off and landing always travel; the jet cannot climb or flare in place. */
export const forcedTravel=(clip:string)=>!!JET_MANOEUVRES[clip];
