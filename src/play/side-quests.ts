/** Optional paid jobs, staged only on reachable ground and existing measured roads. */
import type {MissionWorld} from './mission';
import {blocked,distance,obstacles,route,type Point} from './world';

export type SideQuestId='delivery'|'street-race'|'bounty';
export interface SideQuest {id:SideQuestId;start:Point;checkpoints:Point[];limit:number;cash:number;status:'available'|'active'|'complete'|'failed';index:number;elapsed:number}
export function parseSideQuests(raw:unknown):SideQuestId[]{
 if(!Array.isArray(raw)||raw.length>3||new Set(raw).size!==raw.length||raw.some(id=>id!=='delivery'&&id!=='street-race'&&id!=='bounty'))throw Error('Choose unique side jobs: delivery, street-race and/or bounty.');
 return raw as SideQuestId[];
}
export function stageSideQuests(world:MissionWorld,ids:readonly SideQuestId[]):SideQuest[]{
 const rects=obstacles(1,world.blocks,world.gate,world.gateWidth),b=world.bounds,points=world.supplyRows.flatMap(z=>world.supplyLanes.map(x=>({x,z}))).filter(p=>p.x>b.minX+2&&p.x<b.maxX-2&&p.z>b.minZ+2&&p.z<b.maxZ-2&&!blocked(p,1.25,rects)&&route(world.start,p,rects,.52,b).length);
 const near=[...points].sort((a,c)=>distance(a,world.start)-distance(c,world.start)).find(p=>distance(p,world.start)>2.5);
 const far=near?[...points].sort((a,c)=>distance(c,near)-distance(a,near)).find(p=>distance(p,near)>12&&route(near,p,rects,.52,b).length):undefined;
 return ids.map(id=>{
  if(id==='delivery'){if(!near||!far)throw Error(`sideQuests.delivery: ${world.location} needs two reachable, separated ground points.`);return {id,start:near,checkpoints:[far],limit:Math.max(45,Math.ceil(distance(near,far)/2.1)+20),cash:200,status:'available',index:0,elapsed:0};}
  if(id==='bounty'){if(!near)throw Error(`sideQuests.bounty: ${world.location} needs a reachable contact point.`);return {id,start:near,checkpoints:[],limit:120,cash:250,status:'available',index:0,elapsed:0};}
  if(!world.getaway)throw Error('sideQuests.street-race requires pickup extraction.');
  const start=world.getaway.pickup,checkpoints=world.getaway.course?.checkpoints?.length?world.getaway.course.checkpoints:world.getaway.route.slice(1);
  if(!checkpoints.length)throw Error('sideQuests.street-race needs a road route.');
  return {id,start,checkpoints,limit:Math.max(45,Math.ceil(world.getaway.route.reduce((sum,p,i,a)=>i?sum+distance(a[i-1],p):0,0)/5)+20),cash:300,status:'available',index:0,elapsed:0};
 });
}
