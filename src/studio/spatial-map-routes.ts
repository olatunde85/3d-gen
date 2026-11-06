/** Verified conservative reference lanes; never label an untested coordinate safe. */
import {footprint,hull,spatialConflict} from './spatial-geometry';
import type {LocationMap,Rect,SpatialPose,VehicleEnvelope} from './spatial-types';
const pose=(x:number,z:number,yaw=0):SpatialPose=>({x,y:0,z,yaw});
export function populateStaging(map:LocationMap,envelopes:Record<string,VehicleEnvelope>){
 const car:Rect=[Math.min(...['car','sports_car','suv','motorcycle'].map(id=>envelopes[id].bounds[0])),Math.min(...['car','sports_car','suv','motorcycle'].map(id=>envelopes[id].bounds[1])),Math.max(...['car','sports_car','suv','motorcycle'].map(id=>envelopes[id].bounds[2])),Math.max(...['car','sports_car','suv','motorcycle'].map(id=>envelopes[id].bounds[3]))];
 const verify=(mode:'pedestrian'|'ground-vehicle'|'boat',start:SpatialPose,end:SpatialPose,bounds:Rect,margin:number)=>!spatialConflict(map,hull([...footprint(start,bounds,margin),...footprint(end,bounds,margin)]),mode,0,mode==='pedestrian'?2.2:2.8,[],{boatEdgeTolerance:0});
 for(const mode of ['pedestrian','ground-vehicle','boat']as const){
  if(mode==='boat'&&!map.water.length)continue;if(mode==='ground-vehicle'&&map.bounds[2]-map.bounds[0]<30)continue;
  const bounds:Rect=mode==='pedestrian'?[-.3,-.3,.3,.3]:mode==='boat'?envelopes.motorboat.bounds:car,margin=mode==='pedestrian'?.15:.25;
  const candidates:SpatialPose[][]=[];
  if(mode==='boat')for(const w of map.water){const z=Math.max(map.bounds[1]+8,w[3]-12);for(const x of [14,-14,25,-25,0])candidates.push([pose(x,z,180),pose(x,z-35,180)]);}
  else if(map.bounds[2]-map.bounds[0]>30){
   for(const r of map.regions.filter(r=>r.kind===(mode==='ground-vehicle'?'road':'walkway'))){const [x0,z0,x1,z1]=r.bounds,x=(x0+x1)/2,z=(z0+z1)/2;if(z1-z0>x1-x0)candidates.push([pose(x,Math.max(z0+8,12)),pose(x,Math.min(z1-8,50))]);else candidates.push([pose(-18,z,90),pose(18,z,90)]);}
   for(const x of mode==='pedestrian'?(map.id==='highway'?[8,-28]:[0,-2,2,12,-12]):[8,-8,0,18,-18])candidates.push([pose(x,14),pose(x,44)]);
  }else for(const x of [0,-1,1,-2,2])candidates.push([pose(x,0),pose(x,Math.min(map.bounds[3]-.6,3.8))]);
  for(const [start,end]of candidates){if(Math.hypot(end.x-start.x,end.z-start.z)<1||!verify(mode,start,end,bounds,margin))continue;
   const id=`${mode}-lane-${map.routes.filter(r=>r.mode===mode).length+1}`;
   map.routes.push({id,mode,start,end,clearance:margin,stop:'Stop at end. Beyond the end is unverified; re-check the entire extension before using it.'});
   const models=mode==='pedestrian'?['pedestrian']:mode==='boat'?['motorboat']:['car','sports_car','suv','motorcycle'];
   for(const [index,model]of models.entries()){
    if(map.starts.some(s=>s.models.includes(model)&&mode!=='pedestrian'))continue;
    const distance=mode==='ground-vehicle'?index*9:0,angle=start.yaw*Math.PI/180,placed={...start,x:start.x+Math.sin(angle)*distance,z:start.z+Math.cos(angle)*distance};
    const own:Rect=model==='pedestrian'?bounds:envelopes[model].bounds;
    if(map.starts.some(s=>Math.hypot(s.pose.x-placed.x,s.pose.z-placed.z)<(mode==='pedestrian'?3:7))||!verify(mode,placed,placed,own,margin))continue;
    map.starts.push({mode,models:[model],pose:placed,clearance:margin});
   }
   if(map.routes.filter(r=>r.mode===mode).length>=2)break;
  }
 }
 if(map.id==='harbour'){
  const stand=pose(.85,-11.5,180),vehicle=pose(2.47,-11.92,180),departure=pose(2.47,-45,180),approach=pose(.85,-3,180);
  if(verify('pedestrian',approach,stand,[-.25,-.25,.25,.25],.08)&&verify('boat',vehicle,departure,envelopes.motorboat.bounds,.025))map.boarding.push({id:'east-pier-motorboat',model:'motorboat',stand,vehicle,approach,departure,note:'Reference scale=boardingScale=1 only. Stand on the east edge of boarding-pier; boat waits east of it, bow toward -Z. Solve actor origin using the full centred timeline and boardingStand; never put actor.x/z directly at stand. Shared guests use the same vehicleId and inherit the operator’s boat. Stop before boarding; no automatic turn or pathfinding.'});
  map.notes.push('Harbour shoreline runs east–west at z=-7.5. Land is z>-7.5; water is z<-7.5 within the water rectangle. Boarding pier x=-1.2..1.2,z=-14..-4 overrides water as walkable land. The rail has an opening for the pier. Decorative moored hulls at x≈±9,z=-11 are solid obstacles.');
 }
 if(!map.routes.length)map.notes.push('No clear reference travel lane was verified for this location. Use stationary staging or inspect geometry and validate a custom route.');
 if(!map.boarding.length&&map.water.length)map.notes.push('No verified boarding anchor here. Do not assume a shoreline is a dock or that a boat can be boarded safely at the origin.');
}
