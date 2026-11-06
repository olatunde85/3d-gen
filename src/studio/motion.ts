/** Studio moves the complete rider/vehicle group; clip playback remains unchanged. */
import {clipById} from '../core/anim/clips';
import {RIDING_VEHICLES} from '../core/props/vehicles';
import type {Vec3} from '../core/math';
import {TROT} from '../core/props/horse-gait';
export const VEHICLE_SPEED={bicycle:1.2,car:1.6,sports_car:1.6,suv:1.6,motorcycle:1.8,horse:TROT.speed,canoe:.65,kayak:.8,rowboat:.7,motorboat:1.4}as const;
export function studioTravel(clip:string,speed?:number):Vec3|undefined{
 const id=RIDING_VEHICLES[clip];return id?[0,0,(id==='rowboat'?-1:1)*(speed??VEHICLE_SPEED[id])]:clipById.get(clip)?.travel;
}
