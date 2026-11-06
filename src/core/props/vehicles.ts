/** Shared vehicle IDs and styling. Geometry and fitting live in vehicle.ts. */
export const VEHICLE_IDS=['bicycle','car','sports_car','suv','motorcycle','horse','canoe','kayak','rowboat','motorboat']as const;
export type VehicleId=typeof VEHICLE_IDS[number];
export const VEHICLE_CHOICES=['none','auto',...VEHICLE_IDS]as const;
export type VehicleChoice=typeof VEHICLE_CHOICES[number];
export const VEHICLE_LABELS:Record<VehicleChoice,string>={none:'None',auto:'Match animation',bicycle:'Bicycle',car:'Classic convertible',sports_car:'Modern sports car',suv:'SUV',motorcycle:'Motorcycle',horse:'Horse',canoe:'Canoe',kayak:'Kayak',rowboat:'Rowing boat',motorboat:'Motorboat'};
import {TRANSITION_BY_CLIP,ridingClip} from './vehicle-actions';
export const RIDING_VEHICLES:Readonly<Record<string,VehicleId>>={ride_bicycle:'bicycle',drive_car:'car',sit_passenger:'car',drive_sports_car:'sports_car',sit_sports_car_passenger:'sports_car',drive_suv:'suv',sit_suv_passenger:'suv',ride_motorcycle:'motorcycle',ride_horse:'horse',paddle_canoe:'canoe',paddle_kayak:'kayak',row_boat:'rowboat',drive_boat:'motorboat'};
export const VEHICLE_FOR_CLIP:Readonly<Record<string,VehicleId>>={...RIDING_VEHICLES,...Object.fromEntries(Object.entries(TRANSITION_BY_CLIP).map(([id,t])=>[id,RIDING_VEHICLES[t.ride]]))};
export const VEHICLE_CLIP:Record<VehicleId,string>={bicycle:'ride_bicycle',car:'drive_car',sports_car:'drive_sports_car',suv:'drive_suv',motorcycle:'ride_motorcycle',horse:'ride_horse',canoe:'paddle_canoe',kayak:'paddle_kayak',rowboat:'row_boat',motorboat:'drive_boat'};
export const VEHICLE_FINISHES=['matte','satin','gloss']as const;
export const VEHICLE_VARIANTS=['classic','sport']as const;
export interface VehicleStyle{color:string;accentColor:string;seatColor:string;finish:typeof VEHICLE_FINISHES[number];variant:typeof VEHICLE_VARIANTS[number]}
export const DEFAULT_VEHICLE_STYLE:VehicleStyle={color:'#8a5535',accentColor:'#c7b293',seatColor:'#292827',finish:'satin',variant:'classic'};
/** Factory paint for a newly chosen modern model; preserve colours the user has edited. */
export function vehicleStyleForChoice(choice:VehicleChoice,style:VehicleStyle):VehicleStyle{
 const untouched=Object.entries(DEFAULT_VEHICLE_STYLE).every(([key,value])=>style[key as keyof VehicleStyle]===value);
 if(!untouched)return {...style};
 if(choice==='sports_car')return {color:'#168c9b',accentColor:'#aeb9c5',seatColor:'#20252c',finish:'gloss',variant:'sport'};
 if(choice==='suv')return {color:'#b71f2b',accentColor:'#34383e',seatColor:'#20252c',finish:'gloss',variant:'classic'};
 return {...style};
}
export function sanitizeVehicleStyle(value:unknown):VehicleStyle{
 const s=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
 const color=(key:'color'|'accentColor'|'seatColor')=>typeof s[key]==='string'&&/^#[a-f0-9]{6}$/i.test(s[key])?s[key] as string:DEFAULT_VEHICLE_STYLE[key];
 return {color:color('color'),accentColor:color('accentColor'),seatColor:color('seatColor'),finish:VEHICLE_FINISHES.includes(s.finish as VehicleStyle['finish'])?s.finish as VehicleStyle['finish']:'satin',variant:VEHICLE_VARIANTS.includes(s.variant as VehicleStyle['variant'])?s.variant as VehicleStyle['variant']:'classic'};
}
export function isPassengerClip(id:string){return ridingClip(id).includes('passenger');}
export function isCar(id:VehicleChoice):id is 'car'|'sports_car'|'suv'{return id==='car'||id==='sports_car'||id==='suv';}
/** Every supported model/role combination, including both occupants for each car design. */
export const VEHICLE_FITS=VEHICLE_IDS.flatMap(id=>(isCar(id)?[VEHICLE_CLIP[id],id==='car'?'sit_passenger':id==='suv'?'sit_suv_passenger':'sit_sports_car_passenger']:[VEHICLE_CLIP[id]]).map(clip=>({id,clip})));
export function vehicleFor(choice:VehicleChoice,clip:string):VehicleId|undefined{
 const id=VEHICLE_FOR_CLIP[clip];return choice==='auto'?id:choice===id?id:isCar(choice)&&id==='car'?choice:undefined;
}
/** Raised cabin/deck floors. Bicycle, motorcycle and horse already have their authored saddle height. */
export function vehicleLift(id:VehicleId,scale:number){return ({car:.32,sports_car:.12,suv:.50,canoe:.15,kayak:.15,rowboat:.15,motorboat:.32,bicycle:0,motorcycle:0,horse:0}[id])*scale;}
