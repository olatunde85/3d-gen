/** Cast operations share one limit and deterministic, non-overlapping starting arrangements. */
import { CAST, MAX_ACTORS, beat, durationOf, newActor, presetCode, type ActorTrack, type StudioProject } from './project';
export const ARRANGEMENTS=['side','conversation','opposed'] as const;
export type Arrangement=typeof ARRANGEMENTS[number];
export const ARRANGEMENT_LABELS:Record<Arrangement,string>={side:'Side by side',conversation:'Conversation',opposed:'Facing each other'};
export function addCastActor(project:StudioProject):ActorTrack|undefined{
  if(project.actors.length>=MAX_ACTORS)return;
  const id=Array.from({length:MAX_ACTORS},(_,i)=>`actor-${String.fromCharCode(97+i)}`).find(id=>!project.actors.some(a=>a.id===id))!;
  const first=project.actors[0],actor=newActor(presetCode(CAST[project.actors.length%CAST.length]),'medium',id),duration=durationOf(project);
  const offsets=[[1.9,0],[-1.9,0],[.95,1.65],[-.95,1.65],[0,-1.9],[1.9,-1.9],[-1.9,-1.9]];
  for(let z=-10;z<=10;z+=2)for(let x=-10;x<=10;x+=2)offsets.push([x-first.x,z-first.z]);
  const free=offsets.map(([x,z])=>({x:round(first.x+x),z:round(first.z+z)})).find(p=>Math.abs(p.x)<=12&&Math.abs(p.z)<=12&&project.actors.every(a=>Math.hypot(p.x-a.x,p.z-a.z)>=1.5));
  if(!free)throw Error('Move the existing cast to make room for another character.');
  Object.assign(actor,free,{y:first.y,yaw:first.yaw});
  if(duration>=.3&&duration<=36)actor.beats=actor.beats.map(b=>({...b,duration:duration/3}));
  else{actor.beats=[];for(let left=duration;left>.001;left-=12)actor.beats.push(beat('idle',Math.min(12,left)));}
  project.actors.push(actor);return actor;
}
export function arrangeCast(actors:ActorTrack[],kind:Arrangement){
  const count=actors.length;if(count<2)return;
  for(const [i,a]of actors.entries()){
    a.y=0;
    if(count===2){a.x=i?.95:-.95;a.z=0;a.yaw=kind==='side'?0:(i?-1:1)*(kind==='opposed'?90:35);continue;}
    if(kind==='side'){a.x=round((i-(count-1)/2)*1.9);a.z=0;a.yaw=0;}
    else if(kind==='conversation'){
      const radius=Math.max(2.2,(count-1)*.75),angle=(-65+130*i/(count-1))*Math.PI/180;
      a.x=round(Math.sin(angle)*radius);a.z=round(-Math.cos(angle)*radius);a.yaw=round(Math.atan2(-a.x,1.3-a.z)*180/Math.PI);
    }else{
      const left=Math.ceil(count/2),onLeft=i<left,index=onLeft?i:i-left,sideCount=onLeft?left:count-left;
      a.x=onLeft?-1.4:1.4;a.z=round((index-(sideCount-1)/2)*1.9);a.yaw=onLeft?90:-90;
    }
  }
}
const round=(n:number)=>Math.round(n*1000)/1000;

/** Infer the actual placement, so edits/Undo/reloads never display a stale arrangement. */
export function castArrangement(actors:ActorTrack[]):Arrangement|''{
  if(actors.length<2)return '';
  for(const kind of ARRANGEMENTS){
    const arranged=actors.map(actor=>({...actor}));arrangeCast(arranged,kind);
    if(actors.every((actor,i)=>(['x','y','z']as const).every(key=>Math.abs(actor[key]-arranged[i][key])<.0001)&&Math.abs(((actor.yaw-arranged[i].yaw+540)%360)-180)<.0001))return kind;
  }
  return '';
}
