/** Shared vehicle IDs and styling. Geometry and fitting live in vehicle.ts. */
export const VEHICLE_IDS=['bicycle','car','sports_car','suv','motorcycle','horse','canoe','kayak','rowboat','motorboat','helicopter','pickup','tank','jet']as const;
export type VehicleId=typeof VEHICLE_IDS[number];
export const VEHICLE_CHOICES=['none','auto',...VEHICLE_IDS]as const;
export type VehicleChoice=typeof VEHICLE_CHOICES[number];
export const VEHICLE_LABELS:Record<VehicleChoice,string>={none:'None',auto:'Match animation',bicycle:'Bicycle',car:'Classic convertible',sports_car:'Modern sports car',suv:'SUV',motorcycle:'Motorcycle',horse:'Horse',canoe:'Canoe',kayak:'Kayak',rowboat:'Rowing boat',motorboat:'Motorboat',helicopter:'Helicopter / chopper',pickup:'Pickup truck',tank:'Military tank',jet:'Jet aircraft'};
import {TRANSITION_BY_CLIP,STUNT_BY_CLIP,ridingClip} from './vehicle-actions';
import {VEHICLE_MANOEUVRES} from './vehicle-motion';
export const RIDING_VEHICLES:Readonly<Record<string,VehicleId>>={ride_bicycle:'bicycle',drive_car:'car',sit_passenger:'car',drive_sports_car:'sports_car',sit_sports_car_passenger:'sports_car',drive_suv:'suv',sit_suv_passenger:'suv',ride_motorcycle:'motorcycle',ride_horse:'horse',paddle_canoe:'canoe',paddle_kayak:'kayak',row_boat:'rowboat',drive_boat:'motorboat',fly_helicopter:'helicopter',drive_pickup:'pickup',sit_pickup_passenger:'pickup',drive_tank:'tank',fly_jet:'jet'};
export const VEHICLE_FOR_CLIP:Readonly<Record<string,VehicleId>>={...RIDING_VEHICLES,...Object.fromEntries(Object.entries(STUNT_BY_CLIP).map(([id,t])=>[id,RIDING_VEHICLES[t.ride]])),...Object.fromEntries(Object.entries(TRANSITION_BY_CLIP).map(([id,t])=>[id,RIDING_VEHICLES[t.ride]])),...Object.fromEntries(Object.entries(VEHICLE_MANOEUVRES).map(([id,m])=>[id,RIDING_VEHICLES[m.ride]]))};
export const VEHICLE_CLIP:Record<VehicleId,string>={bicycle:'ride_bicycle',car:'drive_car',sports_car:'drive_sports_car',suv:'drive_suv',motorcycle:'ride_motorcycle',horse:'ride_horse',canoe:'paddle_canoe',kayak:'paddle_kayak',rowboat:'row_boat',motorboat:'drive_boat',helicopter:'fly_helicopter',pickup:'drive_pickup',tank:'drive_tank',jet:'fly_jet'};
/**
 * Further bodies built around an existing vehicle's fitted rider; riders, boarding and animation stay those of the
 * base vehicle. A style's `body` picks one for that base vehicle.
 */
export const VEHICLE_BODIES=['danfo','van','bus','truck','keke','quad','scooter','kart','saloon','muscle']as const;
export type VehicleBody=typeof VEHICLE_BODIES[number];
/** The vehicle whose rider posture, boarding and lift each body borrows. */
export const BODY_BASE:Record<VehicleBody,'suv'|'pickup'|'motorcycle'|'sports_car'>={danfo:'suv',van:'suv',bus:'suv',truck:'pickup',keke:'motorcycle',quad:'motorcycle',scooter:'motorcycle',kart:'sports_car',saloon:'sports_car',muscle:'sports_car'};
export const VEHICLE_BODY_LABELS:Record<VehicleBody,string>={danfo:'Danfo minibus',van:'Van',bus:'City bus',truck:'Box truck',keke:'Keke tricycle',quad:'Quad bike',scooter:'Scooter',kart:'Go-kart',saloon:'Saloon',muscle:'Muscle car'};
/** The bodies offered for a base vehicle. */
export const bodiesFor=(id:VehicleId)=>VEHICLE_BODIES.filter(b=>BODY_BASE[b]===id);
/** The body a style asks for, when it suits this base vehicle. */
export const bodyFor=(id:VehicleId,style:Pick<VehicleStyle,'body'>):VehicleBody|undefined=>style.body&&BODY_BASE[style.body]===id?style.body:undefined;
/** A display name for the vehicle a style builds, such as "Danfo minibus" for an SUV ride with that body. */
export const vehicleName=(id:VehicleId,style:Pick<VehicleStyle,'body'>)=>{const body=bodyFor(id,style);return body?VEHICLE_BODY_LABELS[body]:VEHICLE_LABELS[id];};
export const VEHICLE_FINISHES=['matte','satin','gloss']as const;
export const VEHICLE_VARIANTS=['classic','sport']as const;
export const VEHICLE_LIVERIES=['none','stripes','racing','police','taxi']as const;
export const VEHICLE_LIVERY_LABELS:Record<typeof VEHICLE_LIVERIES[number],string>={none:'Plain',stripes:'Stripes',racing:'Race car',police:'Police',taxi:'Taxi'};
/** Painted designs a vehicle can carry: closed cars take every design, the go-kart its race number. */
export function liveriesFor(id:VehicleId,style:Pick<VehicleStyle,'body'>):readonly typeof VEHICLE_LIVERIES[number][]{
 const body=bodyFor(id,style);
 if(body==='saloon'||body==='muscle'||!body&&(id==='sports_car'||id==='suv'||id==='pickup'))return VEHICLE_LIVERIES;
 return body==='kart'?['none','racing']:[];
}
/** `livery` adds painted designs (racing stripes, a race number, police or taxi colours); `number` is the race number; `body` swaps in another body for the same rider (see VEHICLE_BODIES). */
export interface VehicleStyle{color:string;accentColor:string;seatColor:string;finish:typeof VEHICLE_FINISHES[number];variant:typeof VEHICLE_VARIANTS[number];livery?:typeof VEHICLE_LIVERIES[number];number?:number;body?:VehicleBody}
export const DEFAULT_VEHICLE_STYLE:VehicleStyle={color:'#8a5535',accentColor:'#c7b293',seatColor:'#292827',finish:'satin',variant:'classic'};
/** Factory paint for a newly chosen modern model; preserve colours the user has edited. */
export function vehicleStyleForChoice(choice:VehicleChoice,style:VehicleStyle):VehicleStyle{
 const untouched=Object.entries(DEFAULT_VEHICLE_STYLE).every(([key,value])=>style[key as keyof VehicleStyle]===value);
 if(!untouched)return {...style};
 if(choice==='tank')return {color:'#58634a',accentColor:'#353d30',seatColor:'#252924',finish:'matte',variant:'classic'};
 if(choice==='jet')return {color:'#a5b1bb',accentColor:'#3a4652',seatColor:'#232931',finish:'satin',variant:'classic'};
 if(choice==='pickup')return {color:'#294c60',accentColor:'#8d989d',seatColor:'#242c31',finish:'gloss',variant:'classic'};
 if(choice==='sports_car')return {color:'#168c9b',accentColor:'#aeb9c5',seatColor:'#20252c',finish:'gloss',variant:'sport'};
 if(choice==='helicopter')return {color:'#344f5b',accentColor:'#c0c8c6',seatColor:'#252d32',finish:'satin',variant:'classic'};
 if(choice==='suv')return {color:'#b71f2b',accentColor:'#34383e',seatColor:'#20252c',finish:'gloss',variant:'classic'};
 return {...style};
}
const BODY_PAINT:Record<VehicleBody,Pick<VehicleStyle,'color'|'accentColor'>>={danfo:{color:'#f2c22e',accentColor:'#1b1b1b'},van:{color:'#e8e8e4',accentColor:'#3a3f45'},bus:{color:'#2f6db5',accentColor:'#e8e8e4'},truck:{color:'#e8e8e4',accentColor:'#3a3f45'},keke:{color:'#2f8f4e',accentColor:'#f2c22e'},quad:{color:'#d4762a',accentColor:'#2b2f33'},scooter:{color:'#c8312f',accentColor:'#e8e8e4'},kart:{color:'#e04a1f',accentColor:'#f2c22e'},saloon:{color:'#3a4a5c',accentColor:'#aeb9c5'},muscle:{color:'#d4762a',accentColor:'#1b1b1b'}};
const FACTORY_COLORS=new Set([DEFAULT_VEHICLE_STYLE.color,'#58634a','#a5b1bb','#294c60','#168c9b','#344f5b','#b71f2b',...Object.values(BODY_PAINT).map(p=>p.color)]);
/**
 * Choose a vehicle and optionally one of its further bodies. Factory paint follows the choice unless the user has
 * painted it, and a design the new body cannot carry is dropped.
 */
export function vehicleStyleForBody(id:VehicleId,body:VehicleBody|undefined,style:VehicleStyle):VehicleStyle{
 const next:VehicleStyle={...vehicleStyleForChoice(id,style)};delete next.body;
 if(body&&BODY_BASE[body]===id){next.body=body;if(FACTORY_COLORS.has(style.color))Object.assign(next,BODY_PAINT[body]);}
 else if(style.body&&FACTORY_COLORS.has(style.color)){const factory=vehicleStyleForChoice(id,DEFAULT_VEHICLE_STYLE);next.color=factory.color;next.accentColor=factory.accentColor;}
 if(next.livery&&!liveriesFor(id,next).includes(next.livery))delete next.livery;
 return next;
}
export function sanitizeVehicleStyle(value:unknown):VehicleStyle{
 const s=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
 const color=(key:'color'|'accentColor'|'seatColor')=>typeof s[key]==='string'&&/^#[a-f0-9]{6}$/i.test(s[key])?s[key] as string:DEFAULT_VEHICLE_STYLE[key];
 return {color:color('color'),accentColor:color('accentColor'),seatColor:color('seatColor'),finish:VEHICLE_FINISHES.includes(s.finish as VehicleStyle['finish'])?s.finish as VehicleStyle['finish']:'satin',variant:VEHICLE_VARIANTS.includes(s.variant as VehicleStyle['variant'])?s.variant as VehicleStyle['variant']:'classic',...(VEHICLE_LIVERIES.includes(s.livery as never)&&s.livery!=='none'?{livery:s.livery as VehicleStyle['livery']}:{}),...(Number.isInteger(s.number)&&(s.number as number)>=0&&(s.number as number)<100?{number:s.number as number}:{}),...(VEHICLE_BODIES.includes(s.body as VehicleBody)?{body:s.body as VehicleBody}:{})};
}
export function isPassengerClip(id:string){return ridingClip(id).includes('passenger');}
export function isCar(id:VehicleChoice):id is 'car'|'sports_car'|'suv'|'pickup'{return id==='car'||id==='sports_car'||id==='suv'||id==='pickup';}
/** Every supported model/role combination, including both occupants for each car design. */
export const VEHICLE_FITS=VEHICLE_IDS.flatMap(id=>(isCar(id)?[VEHICLE_CLIP[id],id==='pickup'?'sit_pickup_passenger':id==='car'?'sit_passenger':id==='suv'?'sit_suv_passenger':'sit_sports_car_passenger']:[VEHICLE_CLIP[id]]).map(clip=>({id,clip})));
export function vehicleFor(choice:VehicleChoice,clip:string):VehicleId|undefined{
 const id=VEHICLE_FOR_CLIP[clip];return choice==='auto'?id:choice===id?id:isCar(choice)&&id==='car'?choice:undefined;
}
/** Raised cabin/deck floors. Bicycle, motorcycle and horse already have their authored saddle height. */
export function vehicleLift(id:VehicleId,scale:number){return ({car:.32,sports_car:.12,suv:.50,canoe:.15,kayak:.15,rowboat:.15,motorboat:.32,helicopter:.52,bicycle:0,motorcycle:0,horse:0,pickup:.55,tank:.25,jet:.55}[id])*scale;}
