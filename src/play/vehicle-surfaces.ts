/** Parked vehicle collision uses real decks; an occupied truck remains a solid moving obstacle. */
import {carPoint,carObstacle,type CarState} from './driving';
import type {Rect} from './world';
import type {Volume} from './motor';
export interface VehicleSurface {id:string;box:Rect;h:number;climbable:boolean}
export function fallbackPickupSurfaces(car:CarState):VehicleSurface[]{
 const s=car.fit.scale,b=car.fit.box,cx=(b.minX+b.maxX)/2;
 return [
  {id:'hood',box:{minX:cx-.98*s,maxX:cx+.98*s,minZ:.72*s,maxZ:b.maxZ},h:1.25*s,climbable:true},
  {id:'cab',box:{minX:cx-1.01*s,maxX:cx+1.01*s,minZ:-.75*s,maxZ:.72*s},h:car.fit.height,climbable:true},
  {id:'bed',box:{minX:cx-.8*s,maxX:cx+.8*s,minZ:b.minZ+.1*s,maxZ:-.8*s},h:.70*s,climbable:true},
  ...[-1,1].map(side=>({id:'rail-'+side,box:{minX:cx+side*.89*s-.1*s,maxX:cx+side*.89*s+.1*s,minZ:b.minZ,maxZ:-.75*s},h:1.25*s,climbable:false})),
  {id:'tailgate',box:{minX:cx-.98*s,maxX:cx+.98*s,minZ:b.minZ,maxZ:b.minZ+.12*s},h:1.25*s,climbable:false},
 ];
}
export function vehicleVolumes(car:CarState):Volume[]{
 if(car.phase!=='parked')return [{...carObstacle(car),h:car.fit.height,id:'pickup',climbable:false}];
 // Only the pickup has measured surfaces; any other parked vehicle is a single solid of its own measured outline.
 const surfaces=car.fit.surfaces??(car.fit.model&&car.fit.model!=='pickup'?[{id:'body',box:car.fit.box,h:car.fit.height,climbable:false}]:fallbackPickupSurfaces(car));
 return surfaces.map(s=>{
  const corners=[{x:s.box.minX,z:s.box.minZ},{x:s.box.maxX,z:s.box.minZ},{x:s.box.minX,z:s.box.maxZ},{x:s.box.maxX,z:s.box.maxZ}].map(p=>carPoint(car,p));
  return {minX:Math.min(...corners.map(p=>p.x)),maxX:Math.max(...corners.map(p=>p.x)),minZ:Math.min(...corners.map(p=>p.z)),maxZ:Math.max(...corners.map(p=>p.z)),obb:{x:car.x,z:car.z,yaw:car.yaw,box:s.box},h:s.h,id:'pickup-'+s.id,climbable:s.climbable};
 });
}
