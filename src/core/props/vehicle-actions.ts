/** Shared transition metadata; deliberately independent of the clip registry and renderer. */
import {HELICOPTER} from './helicopter-layout';
import type {Rig} from '../rig/rig';
/** Anatomical height, excluding the game rig's extrapolated HeadTop_End tail. */
export function boardingScale(rig:Rig){return rig.bones.find(b=>b.name==='Head'||b.name==='head')!.tail[1]/1.8;}
export const VEHICLE_TRANSITIONS = [
  ['bicycle', 'ride_bicycle', 'bicycle', 1.6],
  ['car', 'drive_car', 'convertible (driver)', 1.8],
  ['car_passenger', 'sit_passenger', 'convertible (passenger)', 1.8],
  ['sports_car', 'drive_sports_car', 'sports car (driver)', 2.0],
  ['sports_car_passenger', 'sit_sports_car_passenger', 'sports car (passenger)', 2.0],
  ['suv', 'drive_suv', 'SUV (driver)', 2.1],
  ['suv_passenger', 'sit_suv_passenger', 'SUV (passenger)', 2.1],
  ['motorcycle', 'ride_motorcycle', 'motorcycle', 1.7],
  ['horse', 'ride_horse', 'horse', 2.2],
  ['canoe', 'paddle_canoe', 'canoe', 1.9],
  ['kayak', 'paddle_kayak', 'kayak', 2.1],
  ['rowboat', 'row_boat', 'rowing boat', 1.9],
  ['motorboat', 'drive_boat', 'motorboat', 2.0],
  ['pickup','drive_pickup','pickup (driver)',2.1],
  ['pickup_passenger','sit_pickup_passenger','pickup (passenger)',2.1],
  ['tank','drive_tank','tank',3.0],
  ['jet','fly_jet','jet cockpit',2.8],
  ['helicopter', 'fly_helicopter', 'helicopter', 2.2],
] as const;
export interface VehicleTransition { ride: string; direction: 'board' | 'alight' }
export const TRANSITION_BY_CLIP: Readonly<Record<string, VehicleTransition>> = Object.fromEntries(
  VEHICLE_TRANSITIONS.flatMap(([id, ride]) => (['board', 'alight'] as const).map(direction => [`${direction}_${id}`, { ride, direction }])),
);
export const VEHICLE_STUNTS=[['bicycle','ride_bicycle'],['car','drive_car'],['sports_car','drive_sports_car'],['suv','drive_suv'],['pickup','drive_pickup'],['motorcycle','ride_motorcycle'],['tank','drive_tank'],['canoe','paddle_canoe'],['kayak','paddle_kayak'],['rowboat','row_boat'],['motorboat','drive_boat'],['helicopter','fly_helicopter'],['jet','fly_jet']]as const;
export const STUNT_BY_CLIP:Readonly<Record<string,{ride:string;model:string}>>=Object.fromEntries(VEHICLE_STUNTS.map(([model,ride])=>[`tumble_${model}`,{ride,model}]));
export const ridingClip = (id: string) => TRANSITION_BY_CLIP[id]?.ride ?? STUNT_BY_CLIP[id]?.ride ?? id;
/** Stand beside the appropriate door, saddle or gunwale, facing the vehicle's heading. */
export function boardingStand(ride: string): [number, number] {
  if(ride==='drive_tank')return [1.65,-.7];
  if(ride==='fly_jet')return [1.22,-.12];
  if(ride==='fly_helicopter')return [HELICOPTER.standRight,0];
  const side = ride.includes('passenger') ? -1 : 1;
  const distance = ride.includes('pickup')?1.13:ride.includes('suv') ? 1.13 : ride.includes('sports_car') ? 1.09 : ride.includes('car') || ride==='sit_passenger' ? .95 : ride==='drive_boat' ? 1.62 : ride==='row_boat' ? .95 : ride==='ride_horse' ? .90 : .76;
  return [side * distance, ride==='drive_boat' ? -.42 : ride==='ride_horse' ? -.12 : 0];
}
export const boardProgress = (transition: VehicleTransition, time: number, duration: number) => {
  const p = Math.max(0, Math.min(1, time / duration)); return transition.direction==='board' ? p : 1-p;
};
const smooth=(x:number)=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};
export const doorOpenAt = (p:number) => smooth((p-.08)/.16)*(1-smooth((p-.82)/.16));
