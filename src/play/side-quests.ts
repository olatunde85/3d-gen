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
 const finish=near&&far?[...points].sort((a,c)=>distance(c,far)-distance(a,far)).find(p=>distance(p,far)>10&&distance(p,near)>8&&route(far,p,rects,.52,b).length):undefined;
 return ids.map(id=>{
  if(id==='delivery'){if(!near||!far||!finish)throw Error(`sideQuests.delivery: ${world.location} needs a reachable pickup, handoff and final customer.`);return {id,start:near,checkpoints:[far,finish],limit:Math.max(65,Math.ceil((distance(near,far)+distance(far,finish))/2.1)+25),cash:300,status:'available',index:0,elapsed:0};}
  if(id==='bounty'){if(!near)throw Error(`sideQuests.bounty: ${world.location} needs a reachable contact point.`);return {id,start:near,checkpoints:[near],limit:120,cash:250,status:'available',index:0,elapsed:0};}
  if(!world.getaway)throw Error('sideQuests.street-race requires pickup extraction.');
  const start=world.getaway.pickup,course=world.getaway.course?.checkpoints;
  const nearTurn={x:0,z:start.z-7},farTurn=world.getaway.route.at(-1)!;
  const checkpoints=course?.length?course:Array.from({length:10},(_,i)=>i%2?farTurn:nearTurn);
  if(checkpoints.length<2)throw Error('sideQuests.street-race needs at least two road checkpoints.');
  const length=checkpoints.reduce((sum,p,i)=>sum+distance(i?checkpoints[i-1]:start,p),0);
  return {id,start,checkpoints,limit:Math.max(75,Math.ceil(length/8)+25),cash:400,status:'available',index:0,elapsed:0};
 });
}
