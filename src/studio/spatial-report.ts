/** Advisory checks use the renderer's vehicle plan, including centred travel and persistent props. */
import {clipById} from '../core/anim/clips';
import {VEHICLE_FOR_CLIP} from '../core/props/vehicles';
import {boardingStand,ridingClip} from '../core/props/vehicle-actions';
import {durationOf,timelineAt,type StudioProject,type ActorTrack} from './project';
import {VehicleStage,type VehicleBody,type StagedActor} from './vehicle-stage';
import {locationMap,VEHICLE_ENVELOPES} from './spatial-maps';
import {footprint,hull,spatialConflict,BOAT_EDGE_TOLERANCE,type Polygon} from './spatial-geometry';
import {isSeated} from './seating';
import type {LocationMap,SpatialPose,VehicleEnvelope,Rect} from './spatial-types';

export interface SpatialBody extends VehicleBody {
 height?:number;
 /** Actual fitted prop envelope, before any world placement. */
 envelope?(model:string):VehicleEnvelope|undefined;
 /** Actual root footwork during boarding/alighting, relative to the actor group. */
 boardingPoint?(project:StudioProject,track:ActorTrack,time:number,state:StagedActor):{x:number;z:number};
}
export interface StagingIssue {entity:string;code:string;start:number;end:number;message:string}
export interface StagingSegment {entity:string;mode:string;start:number;end:number;from:SpatialPose;to:SpatialPose;clip?:string}
export interface StagingReport {
 kind:'ara-studio-staging-report';version:1;template:string;accuracy:'fitted-bodies'|'reference-body';
 measurements:Record<string,{scale:number;boardingScale:number;height:number;vehicleEnvelopes:Record<string,VehicleEnvelope>}>;
 issues:StagingIssue[];transitions:StagingSegment[];notes:string[];
}
const round=(n:number)=>Math.round(n*1000)/1000;
const pose=(s:SpatialPose):SpatialPose=>({x:round(s.x),y:round(s.y),z:round(s.z),yaw:round(s.yaw)});
const watercraft=(model:string)=>['motorboat','canoe','kayak','rowboat'].includes(model);
/** Translate an actor so its *actual* first group/doorway position meets the requested point. */
export function placeStart(project:StudioProject,actorId:string,target:{x:number;z:number},bodies:ReadonlyMap<string,VehicleBody>=new Map()){
 const a=project.actors.find(a=>a.id===actorId)!;const stage=new VehicleStage(project,0,bodies),point=stage.actor(a),transition=clipById.get(a.beats[0].clip)?.vehicleTransition;
 const stand=transition?.direction==='board'?(point.stand??boardingStand(ridingClip(a.beats[0].clip))):[0,0],scale=bodies.get(a.id)?.boardingScale??1,r=point.yaw*Math.PI/180;
 a.x+=target.x-point.x-scale*(stand[0]*Math.cos(r)+stand[1]*Math.sin(r));a.z+=target.z-point.z-scale*(-stand[0]*Math.sin(r)+stand[1]*Math.cos(r));
}
export function stagingReport(project:StudioProject,bodies:ReadonlyMap<string,SpatialBody>=new Map(),map:LocationMap=locationMap(project.template)):StagingReport {
 const fitted=project.actors.every(a=>bodies.has(a.id)),measurements:StagingReport['measurements']={};
 for(const actor of project.actors){const body=bodies.get(actor.id),scale=body?.scale??1,vehicleEnvelopes:Record<string,VehicleEnvelope>={};
  for(const beat of actor.beats){const model=VEHICLE_FOR_CLIP[beat.clip];if(!model||(beat.vehicleSeat??'operator')!=='operator'||vehicleEnvelopes[model])continue;const reference=VEHICLE_ENVELOPES[model];vehicleEnvelopes[model]=body?.envelope?.(model)??{bounds:reference.bounds.map(v=>v*scale)as Rect,bottom:reference.bottom*scale,top:reference.top*scale};}
  measurements[actor.id]={scale,boardingScale:body?.boardingScale??1,height:body?.height??1.8,vehicleEnvelopes};
 }
 const report:StagingReport={kind:'ara-studio-staging-report',version:1,template:project.template,accuracy:fitted?'fitted-bodies':'reference-body',measurements,issues:[],transitions:[],notes:[
  fitted?'Uses the loaded characters’ real rig scale and fitted vehicle bounds.':'Provisional: uses reference scale=1. Build the film, then use Check staging for the loaded characters’ real scale and vehicle bounds.',
  'Advisory geometry checks do not move actors, prevent collisions or implement pathfinding. Rectangular prop/body envelopes are conservative; review tight contacts visually.',
  `Boats allow ${BOAT_EDGE_TOLERANCE*100} cm of rectangular-envelope overlap at shorelines/docks. Static obstacles, map limits and land-actor water checks retain their normal clearance.`,
  'Every action boundary is reported on both sides. Straight path spans use swept footprints, not just endpoints. Boarding footwork and helicopter altitude are sampled at 30 fps.',
  'Static set geometry, land/water and parked vehicles are checked; automatic avoidance, animated hand/foot collision, person-to-person collision and prop-to-prop collision are not simulated.',
  'Seated clips snap to registered furniture; their body-versus-seat overlap is intentional and not an obstacle failure. Other walking parts of a seated track still need review.'
 ]};
 const end=durationOf(project),times=new Set<number>([0,end]);
 for(const a of project.actors){let t=0;for(const b of a.beats){times.add(t);t+=b.duration;times.add(Math.min(end,t));}}
 // A finer step is only needed for authored footwork and vertical easing; straight spans are exact sweeps.
 for(let t=0;t<end;t+=1/30)times.add(Math.min(end,t));
 const ordered=[...times].filter(t=>t>=0&&t<=end).sort((a,b)=>a-b),states=new Map<number,VehicleStage>();
 const stage=(t:number)=>{let s=states.get(t);if(!s){s=new VehicleStage(project,t,bodies);states.set(t,s);}return s;};
 const add=(entity:string,code:string,t0:number,t1:number,message:string)=>{
  const old=[...report.issues].reverse().find(i=>i.entity===entity&&i.code===code&&i.message===message&&Math.abs(i.end-t0)<.002);
  if(old)old.end=round(t1);else report.issues.push({entity,code,start:round(t0),end:round(t1),message});
 };
 const ground=(a:ActorTrack,time:number,s:VehicleStage):SpatialPose=>{
  const state=s.actor(a),b=a.beats[timelineAt(project,time,a).index],transition=clipById.get(b.clip)?.vehicleTransition;
  if(!transition)return state;
  const body=bodies.get(a.id),p=body?.boardingPoint?.(project,a,time,state);
  if(p){const r=state.yaw*Math.PI/180;return{...state,x:state.x+p.x*Math.cos(r)+p.z*Math.sin(r),z:state.z-p.x*Math.sin(r)+p.z*Math.cos(r)};}
  // Reference-only transition endpoints; never claim to have checked unknown footwork.
  const at=timelineAt(project,time,a),u=Math.min(1,at.local/clipById.get(b.clip)!.duration),w=transition.direction==='board'?1-u:u,stand=state.stand??boardingStand(ridingClip(b.clip)),r=state.yaw*Math.PI/180,scale=body?.boardingScale??1;
  return {...state,x:state.x+(stand[0]*Math.cos(r)+stand[1]*Math.sin(r))*scale*w,z:state.z+(-stand[0]*Math.sin(r)+stand[1]*Math.cos(r))*scale*w};
 };
 const sweep=(from:SpatialPose,to:SpatialPose,rect:Rect,margin:number):Polygon=>{
  // A change of facing uses a conservative full-turn envelope so no intervening orientation is missed.
  if(Math.abs(from.yaw-to.yaw)>.01){const r=Math.max(...[[rect[0],rect[1]],[rect[0],rect[3]],[rect[2],rect[1]],[rect[2],rect[3]]].map(([x,z])=>Math.hypot(x,z)))+margin;return hull([...footprint({...from,yaw:0},[-r,-r,r,r]),...footprint({...to,yaw:0},[-r,-r,r,r])]);}
  return hull([...footprint(from,rect,margin),...footprint(to,rect,margin)]);
 };
 const check=(entity:string,mode:Parameters<typeof spatialConflict>[2],from:SpatialPose,to:SpatialPose,rect:Rect,height:number,margin:number,t0:number,t1:number,decks:Polygon[]=[])=>{
  const conflict=spatialConflict(map,sweep(from,to,rect,margin),mode,Math.min(from.y,to.y),Math.max(from.y,to.y)+height,decks);
  if(conflict)add(entity,conflict.code,t0,t1,conflict.message);
 };
 // Report each beat's world start/end and facing, not just the nominal actor placement.
 for(const a of project.actors){let t=0;for(const b of a.beats){const stop=t+b.duration,eps=Math.min(1e-6,b.duration/100),s=stage(t+eps),e=stage(stop-eps),model=VEHICLE_FOR_CLIP[b.clip];report.transitions.push({entity:a.id,clip:b.clip,mode:model??'pedestrian',start:round(t),end:round(stop),from:pose(ground(a,t+eps,s)),to:pose(ground(a,stop-eps,e))});t=stop;}}
 for(let i=0;i<ordered.length-1;i++){
  const t0=ordered[i],t1=ordered[i+1];if(t1-t0<1e-7)continue;
  // Avoid applying a neighbouring action's transform across a discontinuous cut.
  const a=stage(t0+1e-8),b=stage(t1-1e-8);
  for(const v of a.vehicles.values()){
   if(!v.visible)continue;const next=b.vehicles.get(v.id)!;const body=bodies.get(v.owner.id),scale=body?.scale??1,raw=body?.envelope?.(v.model),reference=VEHICLE_ENVELOPES[v.model];
   const bounds=raw?.bounds??reference.bounds.map(n=>n*scale)as Rect,height=raw?raw.top-raw.bottom:(reference.top-reference.bottom)*scale;
   const mode=watercraft(v.model)?'boat':v.model==='helicopter'&&Math.min(v.y,next.y)>.15?'air':'ground-vehicle';
   check(`vehicle:${v.id}`,mode,v,next,bounds,height,watercraft(v.model)?0:.08,t0,t1);
  }
  for(const track of project.actors){const state=a.actor(track),beat=track.beats[timelineAt(project,t0+1e-8,track).index],transition=clipById.get(beat.clip)?.vehicleTransition;
   if(isSeated(beat.clip))continue;if(state.vehicle&&!transition)continue;
   const p=ground(track,t0+1e-8,a),q=ground(track,t1-1e-8,b),body=bodies.get(track.id),r=.28*(body?.scale??1),height=body?.height??1.8;
   const decks:Polygon[]=[];
   // An entering/exiting person is supported by the visible vessel's real deck across the gap.
   if(transition&&state.vehicle&&watercraft(state.vehicle.model)){
    const v=state.vehicle,scale=bodies.get(v.owner.id)?.scale??1,raw=bodies.get(v.owner.id)?.envelope?.(v.model),rect=raw?.bounds??VEHICLE_ENVELOPES[v.model].bounds.map(n=>n*scale)as Rect,poly=footprint(v,rect);
    // Exempt only the fitted vessel footprint, not the surrounding water.
    decks.push(poly);
   }
   check(track.id,'pedestrian',p,q,[-r,-r,r,r],height,.025,t0,t1,decks);
  }
 }
 if(report.transitions.some(t=>clipById.get(t.clip??'')?.vehicleTransition)&&!fitted)report.notes.push('Boarding footwork is provisional until the characters are built. No reference result certifies a custom-body dock contact.');
 return report;
}
