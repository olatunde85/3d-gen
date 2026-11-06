/** Extract before material batching: the map is measured from the very same set recipes. */
import * as T from 'three';
import type {StudioSet} from '../src/studio/sets';
import {isOutdoorScene,type SetId} from '../src/studio/catalog';
import type {LocationMap,Rect,SpatialObstacle,SpatialRegion} from '../src/studio/spatial-types';
const round=(n:number)=>Math.round(n*1000)/1000;
const rect=(b:{minX:number;minZ:number;maxX:number;maxZ:number}):Rect=>[b.minX,b.minZ,b.maxX,b.maxZ];
const area=(r:Rect)=>(r[2]-r[0])*(r[3]-r[1]);
const overlaps=(a:Rect,b:Rect,gap=.025)=>a[0]<=b[2]+gap&&a[2]>=b[0]-gap&&a[1]<=b[3]+gap&&a[3]>=b[1]-gap;
export function measureLocation(id:SetId,set:StudioSet):LocationMap {
 const data=set.group.userData,bounds:Rect=data.roomBounds?rect(data.roomBounds):isOutdoorScene(id)?[-180,-180,180,180]:id==='runway'?[-2.7,-35,2.7,35]:[-6,-5.5,6,5.5];
 const water:Rect[]=(data.waterAreas??[]).map(rect),obstacles:SpatialObstacle[]=[];
 set.group.updateMatrixWorld(true);
 set.group.traverse(o=>{
  const m=o as T.Mesh;if(!m.isMesh)return;
  m.geometry.computeBoundingBox();const b=m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld);
  // Flush floor paint, water, road markings and overhead decor are surfaces, not barriers.
  if(b.max.y<=.12||b.min.y>=40||b.max.x<bounds[0]||b.min.x>bounds[2]||b.max.z<bounds[1]||b.min.z>bounds[3])return;
  const footprint:Rect=[b.min.x,b.min.z,b.max.x,b.max.z].map(round)as Rect;
  // Give rendered planes their physical barrier semantics even when the camera sees a cutaway.
  if(footprint[2]-footprint[0]<.02){footprint[0]-=.01;footprint[2]+=.01;}if(footprint[3]-footprint[1]<.02){footprint[1]-=.01;footprint[3]+=.01;}
  obstacles.push({bounds:footprint,bottom:round(Math.max(0,b.min.y)),top:round(b.max.y)});
 });
 // Conservative unions reduce hundreds of furniture pieces into compact solid footprints.
 // Merge only similar vertical bands, keeping an overpass distinct from the road underneath.
 const merged:SpatialObstacle[]=[];
 for(const item of obstacles){let a=item;for(let i=0;i<merged.length;){const b=merged[i];const union:Rect=[Math.min(a.bounds[0],b.bounds[0]),Math.min(a.bounds[1],b.bounds[1]),Math.max(a.bounds[2],b.bounds[2]),Math.max(a.bounds[3],b.bounds[3])];if(Math.abs(a.bottom-b.bottom)<.6&&overlaps(a.bounds,b.bounds)&&area(union)<=(area(a.bounds)+area(b.bounds))*1.15){
   a={bounds:[Math.min(a.bounds[0],b.bounds[0]),Math.min(a.bounds[1],b.bounds[1]),Math.max(a.bounds[2],b.bounds[2]),Math.max(a.bounds[3],b.bounds[3])],bottom:Math.min(a.bottom,b.bottom),top:Math.max(a.top,b.top)};merged.splice(i,1);i=0;
  }else i++;}merged.push(a);}
 merged.sort((a,b)=>a.bounds[0]-b.bounds[0]||a.bounds[1]-b.bounds[1]||a.bottom-b.bottom);
 return {id,bounds,land:{bounds,exceptWater:true},water,regions:(data.spatialRegions??[])as SpatialRegion[],obstacles:merged,
  seats:set.seats.map(s=>({x:round(s.x),y:round(s.y),z:round(s.z),yaw:round(s.yaw*180/Math.PI)})),routes:[],starts:[],boarding:[],notes:[
   'Water rectangles are exact rendered surface extents. Land is the bounds minus water, with dock overlays restoring land.',
   'Obstacle rectangles are conservative world-axis-aligned geometry envelopes. A cutaway wall still blocks a route; overhead obstacles have bottom/top heights.',
   'The map covers static set geometry only. It is not a physics, pathfinding, terrain-height or actor-collision simulation.'
  ]};
}
