import type {Clip} from './clips/types';
import {VEHICLE_FOR_CLIP,VEHICLE_LABELS} from '../props/vehicles';
export function animationGroup(c:Clip):string{
 if(c.category!=='Vehicles')return c.category;
 const id=VEHICLE_FOR_CLIP[c.id],family=id==='horse'?'Horse':id==='tank'?'Tracked vehicles':id==='helicopter'||id==='jet'?'Aircraft':['canoe','kayak','rowboat','motorboat'].includes(id)?'Watercraft':'Road vehicles';
 return `Vehicles · ${family}${c.vehicleTransition?' · Board / alight':c.id.startsWith('tumble_')?' · Tumbles':''}`;
}
export function animationMatches(c:Clip,query:string,category=''){
 return (!category||c.category===category||animationGroup(c)===category)&&query.toLowerCase().trim().split(/\s+/).every(w=>`${c.id} ${c.id.replace(/_/g,'')} ${c.name} ${VEHICLE_LABELS[VEHICLE_FOR_CLIP[c.id]]??''} ${animationGroup(c)}`.toLowerCase().includes(w));
}
