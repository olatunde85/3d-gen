/** Studio moves the complete rider/vehicle group; clip playback remains unchanged. */
import {clipById} from '../core/anim/clips';
import {VEHICLE_FOR_CLIP} from '../core/props/vehicles';
import type {Vec3} from '../core/math';
export const VEHICLE_SPEED={bicycle:1.2,car:1.6,sports_car:1.6,suv:1.6,motorcycle:1.8,horse:.9,canoe:.65,kayak:.8,rowboat:.7,motorboat:1.4}as const;
export function studioTravel(clip:string,speed?:number):Vec3|undefined{
 const id=VEHICLE_FOR_CLIP[clip];return id?[0,0,(id==='rowboat'?-1:1)*(speed??VEHICLE_SPEED[id])]:clipById.get(clip)?.travel;
}
