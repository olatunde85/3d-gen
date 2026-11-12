import type {Clip} from './clips/types';
import {VEHICLE_FOR_CLIP,VEHICLE_LABELS,bodiesFor,type VehicleBody} from '../props/vehicles';
const SHORT:Record<VehicleBody,string>={danfo:'danfo',van:'van',bus:'bus',truck:'box truck',keke:'keke',quad:'quad',scooter:'scooter',kart:'kart',saloon:'saloon',muscle:'muscle car'};
export function animationGroup(c:Clip):string{
 if(c.category!=='Vehicles')return c.category;
 // Every clip for one vehicle (ride, board/alight, stunts, take-off/landing) shares that vehicle's group, which also
 // names the further bodies that ride the same way, such as the danfo and bus with the SUV.
 const id=VEHICLE_FOR_CLIP[c.id],bodies=bodiesFor(id).map(b=>SHORT[b]);
 return `Vehicles · ${bodies.length?`${({sports_car:'Sports car',pickup:'Pickup'} as Record<string,string>)[id]??VEHICLE_LABELS[id]}, ${bodies.join(', ')}`:VEHICLE_LABELS[id]}`;
}
export function animationMatches(c:Clip,query:string,category=''){
 return (!category||c.category===category||animationGroup(c)===category)&&query.toLowerCase().trim().split(/\s+/).every(w=>`${c.id} ${c.id.replace(/_/g,'')} ${c.name} ${VEHICLE_LABELS[VEHICLE_FOR_CLIP[c.id]]??''} ${animationGroup(c)}`.toLowerCase().includes(w));
}
