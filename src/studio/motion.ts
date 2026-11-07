/** Studio moves the complete rider/vehicle group; clip playback remains unchanged. */
import {clipById} from '../core/anim/clips';
import {RIDING_VEHICLES} from '../core/props/vehicles';
import type {Vec3} from '../core/math';
import {TROT} from '../core/props/horse-gait';
export const MAX_TRAVEL_SPEED=30, STAGE_LIMIT=200;
export const VEHICLE_SPEED={bicycle:3.6,car:4.8,sports_car:4.8,suv:4.8,motorcycle:5.4,horse:TROT.speed*3,canoe:1.95,kayak:2.4,rowboat:2.1,motorboat:4.2,helicopter:12,pickup:4.8,tank:3.6,jet:18}as const;
export function studioTravel(clip:string,speed?:number):Vec3|undefined{
 const id=RIDING_VEHICLES[clip];return id?[0,0,(id==='rowboat'?-1:1)*(speed??VEHICLE_SPEED[id])]:clipById.get(clip)?.travel;
}
