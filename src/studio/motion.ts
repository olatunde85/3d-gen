/** Studio moves the complete rider/vehicle group; clip playback remains unchanged. */
import {clipById} from '../core/anim/clips';
import {RIDING_VEHICLES} from '../core/props/vehicles';
import {VEHICLE_MANOEUVRES,manoeuvre,travelTime,TAXI_SPEED} from '../core/props/vehicle-motion';
import type {Vec3} from '../core/math';
import {TROT} from '../core/props/horse-gait';
export const MAX_TRAVEL_SPEED=30, STAGE_LIMIT=200;
export const VEHICLE_SPEED={bicycle:3.6,car:4.8,sports_car:4.8,suv:4.8,motorcycle:5.4,horse:TROT.speed*3,canoe:1.95,kayak:2.4,rowboat:2.1,motorboat:4.2,helicopter:12,pickup:4.8,tank:3.6,jet:18}as const;
export function studioTravel(clip:string,speed?:number):Vec3|undefined{
 const id=RIDING_VEHICLES[clip]??RIDING_VEHICLES[VEHICLE_MANOEUVRES[clip]?.ride];return id?[0,0,(id==='rowboat'?-1:1)*(speed??(manoeuvre(clip)==='taxi'?TAXI_SPEED:VEHICLE_SPEED[id]))]:clipById.get(clip)?.travel;
}
export {travelTime};
/** Runway manoeuvres and the jet bail-out always travel; the jet cannot climb, flare or keep flying in place. */
export const forcedTravel=(clip:string)=>['taxi','takeoff','land'].includes(manoeuvre(clip)!)||clip==='bailout_jet';
