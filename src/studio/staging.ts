/** Cast operations share one limit and deterministic, non-overlapping starting arrangements. */
import type {Detail} from '../core/params';
import { CAST, MAX_ACTIONS, MAX_ACTORS, MAX_DURATION, beat, durationOf, newActor, presetCode, trackDuration, type ActorTrack, type StudioProject } from './project';
import { handshake, PAIRS } from '../core/anim/clips/partners';
export const ARRANGEMENTS=['side','conversation','opposed','handshake'] as const;
export type Arrangement=typeof ARRANGEMENTS[number];
export const ARRANGEMENT_LABELS:Record<Arrangement,string>={side:'Side by side',conversation:'Conversation',opposed:'Facing each other',handshake:'Handshake'};
export function addCastActor(project:StudioProject,custom?:{code:string;detail:Detail}):ActorTrack|undefined{
  if(project.actors.length>=MAX_ACTORS)return;
  const id=Array.from({length:MAX_ACTORS},(_,i)=>`actor-${String.fromCharCode(97+i)}`).find(id=>!project.actors.some(a=>a.id===id))!;
  const first=project.actors[0],actor=newActor(custom?.code??presetCode(CAST[project.actors.length%CAST.length]),custom?.detail??'medium',id),duration=durationOf(project);
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
  if(actors.length!==2)return;
  if(kind==='handshake'){
    // Face to face along X at the handshake spacing, each a little to the other's right so the right hands meet.
    const {x,z}=PAIRS.handshake;
    for(const [i,actor]of actors.entries()){const s=i?1:-1;actor.x=round(s*z/2);actor.y=0;actor.z=round(-s*x/2);actor.yaw=i?-90:90;}
    return;
  }
  for(const [i,actor]of actors.entries()){
    actor.x=i?.95:-.95;actor.y=0;actor.z=0;
    actor.yaw=kind==='side'?0:(i?-1:1)*(kind==='opposed'?90:35);
  }
}
const round=(n:number)=>Math.round(n*1000)/1000;

/**
 * Ends both timelines with a handshake that starts at the same moment: the shorter timeline waits in idle first. Both
 * already ending with a handshake at the same moment leaves them as they are.
 */
export function addHandshake(actors:ActorTrack[]){
  if(actors.length!==2)return;
  const ends=actors.map(trackDuration),last=actors.map(a=>a.beats[a.beats.length-1]);
  if(last.every(b=>b?.clip==='handshake')&&Math.abs(ends[0]-ends[1])<.01)return;
  const start=Math.max(...ends),length=handshake.duration;
  for(const [i,actor]of actors.entries()){
    const wait=start-ends[i],added=1+(wait>.05?1:0);
    if(actor.beats.length+added>MAX_ACTIONS)throw Error(`Make room for the handshake: a character can have up to ${MAX_ACTIONS} actions.`);
    if(start+length>MAX_DURATION)throw Error(`Make room for the handshake: a film can be up to ${MAX_DURATION} seconds.`);
  }
  for(const [i,actor]of actors.entries()){
    const wait=start-ends[i];
    if(wait>.05)actor.beats.push(beat('idle',round(wait)));
    actor.beats.push(beat('handshake',length));
  }
}

/** Infer the actual placement, so edits/Undo/reloads never display a stale arrangement. */
export function castArrangement(actors:ActorTrack[]):Arrangement|''{
  if(actors.length!==2)return '';
  for(const kind of ARRANGEMENTS){
    const arranged=actors.map(actor=>({...actor}));arrangeCast(arranged,kind);
    if(actors.every((actor,i)=>(['x','y','z']as const).every(key=>Math.abs(actor[key]-arranged[i][key])<.0001)&&Math.abs(((actor.yaw-arranged[i].yaw+540)%360)-180)<.0001))return kind;
  }
  return '';
}
