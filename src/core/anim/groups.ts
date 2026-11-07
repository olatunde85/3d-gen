import type {Clip} from './clips/types';
import {VEHICLE_FOR_CLIP,VEHICLE_LABELS} from '../props/vehicles';
export function animationGroup(c:Clip):string{
 if(c.category!=='Vehicles')return c.category;
 // Every clip for one vehicle (ride, board/alight, stunts, take-off/landing) shares that vehicle's group.
 return `Vehicles · ${VEHICLE_LABELS[VEHICLE_FOR_CLIP[c.id]]}`;
}
export function animationMatches(c:Clip,query:string,category=''){
 return (!category||c.category===category||animationGroup(c)===category)&&query.toLowerCase().trim().split(/\s+/).every(w=>`${c.id} ${c.id.replace(/_/g,'')} ${c.name} ${VEHICLE_LABELS[VEHICLE_FOR_CLIP[c.id]]??''} ${animationGroup(c)}`.toLowerCase().includes(w));
}
