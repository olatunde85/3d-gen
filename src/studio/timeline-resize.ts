/** Timing edits share the same validation as JSON, playback and export. */
import {durationOf,MAX_DURATION,parseProject,type StudioProject} from './project';
export type TimelineClip = {kind:'camera';index:number}|{kind:'action';actor:string;index:number}|{kind:'text'|'speech'|'effect';id:string}|{kind:'music'};
export type TrimEdge='start'|'end';
export const clipKey=(ref:TimelineClip)=>JSON.stringify(ref);
export function clipWindow(p:StudioProject,ref:TimelineClip){
  if(ref.kind==='camera'||ref.kind==='action'){
    const items=ref.kind==='camera'?p.shots:p.actors.find(a=>a.id===ref.actor)!.beats;
    return{start:items.slice(0,ref.index).reduce((sum,b)=>sum+b.duration,0),duration:items[ref.index].duration};
  }
  if(ref.kind==='music')return{start:p.audio.music.start??0,duration:p.audio.music.duration??Math.max(.1,durationOf(p)-(p.audio.music.start??0))};
  const cue=(ref.kind==='text'?p.texts:ref.kind==='speech'?p.audio.speech:p.audio.effects).find(c=>c.id===ref.id)!;
  return{start:cue.start,duration:cue.duration};
}
export function resizeTimelineClip(original:StudioProject,ref:TimelineClip,edge:TrimEdge,delta:number):StudioProject{
  if(!Number.isFinite(delta))throw Error('Use a finite timing adjustment.');
  const p=structuredClone(original),round=(n:number)=>Math.round(n*1e6)/1e6,clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,round(n))),duration=(n:number)=>Math.abs(n-.1)<1e-10?.1:Math.abs(n-12)<1e-10?12:n;
  if(ref.kind==='camera'||ref.kind==='action'){
    const items=ref.kind==='camera'?p.shots:p.actors.find(a=>a.id===ref.actor)!.beats,item=items[ref.index];
    if(edge==='end')item.duration=clamp(item.duration+delta,.1,Math.min(12,MAX_DURATION-items.reduce((s,b,i)=>s+(i===ref.index?0:b.duration),0)));
    else if(ref.index>0){const previous=items[ref.index-1],change=clamp(delta,Math.max(.1-previous.duration,item.duration-12),Math.min(12-previous.duration,item.duration-.1));previous.duration=duration(previous.duration+change);item.duration=duration(item.duration-change);}
  }else{
    const cue=ref.kind==='music'?p.audio.music:(ref.kind==='text'?p.texts:ref.kind==='speech'?p.audio.speech:p.audio.effects).find(c=>c.id===ref.id)!;
    const old=clipWindow(original,ref),min=ref.kind==='effect'?.01:.1;
    if(edge==='end'){cue.start=old.start;cue.duration=clamp(old.duration+delta,min,MAX_DURATION-old.start);}
    else{const end=old.start+old.duration;cue.start=clamp(old.start+delta,0,Math.min(59.9,end-min));cue.duration=Math.max(min,end-cue.start);}
  }
  return parseProject(JSON.stringify(p));
}
