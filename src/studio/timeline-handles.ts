import {clipKey,clipWindow,dropIndex,moveTimelineClip,reorderTimelineClip,resizeTimelineClip,type TimelineClip,type TrimEdge} from './timeline-resize';
import {durationOf,type StudioProject} from './project';
interface Editor {
 project():StudioProject;canEdit():boolean;
 begin(ref:TimelineClip):void;preview(p:StudioProject,ref:TimelineClip):void;end(cancelled:boolean):void;
 error(message:string):void;
}
/** Pixels a clip must be dragged before it moves, so a click still selects it. */
const SLOP=5;
const sequential=(ref:TimelineClip):ref is Extract<TimelineClip,{index:number}>=>ref.kind==='camera'||ref.kind==='action';
const items=(p:StudioProject,ref:Extract<TimelineClip,{index:number}>)=>ref.kind==='camera'?p.shots:p.actors.find(a=>a.id===ref.actor)!.beats;
/**
 * Capture on the persistent scroller: repainting clips cannot interrupt a drag. Edges trim a clip; the clip itself
 * reorders actions and shots in their track, and moves text, speech, effects and music in time.
 */
export function timelineHandles(scroll:HTMLElement,editor:Editor){
 let selection='',frame=0,suppressClick=false;
 let drag:{ref:TimelineClip;edge?:TrimEdge;original:StudioProject;x:number;scroll:number;scale:number;pointer:number;error:string;clientX:number;last:number;lane:number;grab:number}|undefined;
 let pending:{ref:TimelineClip;x:number;pointer:number;lane:number;scale:number}|undefined;
 const tracks=scroll.querySelector<HTMLElement>('.timeline-track')!,ruler=scroll.querySelector<HTMLElement>('.ruler')!;
 function decorate(button:HTMLButtonElement,ref:TimelineClip){
  const wrapper=document.createElement('div');wrapper.className='timeline-clip';wrapper.dataset.clip=clipKey(ref);wrapper.classList.toggle('selected',sequential(ref)?button.classList.contains('selected'):selection===clipKey(ref));
  for(const key of ['width','left','top','flex']as const){wrapper.style[key]=button.style[key];button.style[key]='';}
  if(button.classList.contains('text-beat'))wrapper.classList.add('timed-clip');
  button.dataset.move='true';button.title=`${button.title?button.title+' · ':''}${sequential(ref)?'Drag to reorder · Alt+Left/Right':'Drag to move · Alt+Left/Right'}`;
  wrapper.append(button);
  for(const edge of ['start','end']as const){const handle=document.createElement('button');handle.className=`trim-handle trim-${edge}`;handle.dataset.resizeEdge=edge;handle.setAttribute('aria-label',`Adjust ${edge} of ${button.getAttribute('aria-label')??button.textContent}`);
   const pinned=edge==='start'&&sequential(ref)&&ref.index===0;
   if(pinned){handle.dataset.pinned='true';handle.disabled=true;handle.title='This track starts at 0. Drag the right edge to change its duration.';}else handle.title=edge==='start'&&sequential(ref)?'Drag the boundary between this clip and the previous clip':'Drag to adjust timing · Escape to cancel';
   wrapper.append(handle);
  }
  button.addEventListener('click',()=>{selection=clipKey(ref);for(const clip of tracks.querySelectorAll('.timeline-clip.selected'))clip.classList.remove('selected');wrapper.classList.add('selected');},{capture:true});return wrapper;
 }
 function layout(){if(!drag)return;const width=drag.scale*durationOf(editor.project());tracks.style.width=ruler.style.width=`${width}px`;}
 function move(){if(!drag)return;const seconds=(drag.clientX-drag.x+scroll.scrollLeft-drag.scroll)/drag.scale;
  try{
   if(drag.edge){editor.preview(resizeTimelineClip(drag.original,drag.ref,drag.edge,seconds),drag.ref);}
   else if(sequential(drag.ref)){
    // The dragged clip's centre, in its track's seconds, picks the slot; the rest close up around it.
    const durations=items(drag.original,drag.ref).map(b=>b.duration),centre=(drag.clientX-drag.lane+scroll.scrollLeft-drag.scroll)/drag.scale-drag.grab+durations[drag.ref.index]/2;
    const to=dropIndex(durations,drag.ref.index,centre);editor.preview(reorderTimelineClip(drag.original,drag.ref,to),{...drag.ref,index:to});
   }else editor.preview(moveTimelineClip(drag.original,drag.ref,seconds),drag.ref);
   drag.error='';layout();
  }catch(error){drag.error=(error as Error).message;}
 }
 function tick(now:number){if(!drag)return;const r=scroll.getBoundingClientRect(),dt=Math.min(32,now-drag.last);drag.last=now;
  const velocity=drag.clientX<r.left+35?-Math.min(1,(r.left+35-drag.clientX)/35):drag.clientX>r.right-35?Math.min(1,(drag.clientX-r.right+35)/35):0;
  if(velocity){const before=scroll.scrollLeft;scroll.scrollLeft+=velocity*dt*.5;if(before!==scroll.scrollLeft)move();}frame=requestAnimationFrame(tick);
 }
 function start(ref:TimelineClip,edge:TrimEdge|undefined,x:number,pointer:number,lane:number,scale:number){
  const original=structuredClone(editor.project());selection=clipKey(ref);
  const grab=sequential(ref)?(x-lane)/scale-clipWindow(original,ref).start:0;
  drag={ref,edge,original,x,clientX:x,scroll:scroll.scrollLeft,scale,pointer,error:'',last:performance.now(),lane,grab};
  scroll.setPointerCapture(pointer);scroll.classList.add(edge?'trimming':'moving');editor.begin(ref);layout();frame=requestAnimationFrame(tick);
 }
 function end(cancelled:boolean){pending=undefined;if(!drag)return;const current=drag;drag=undefined;cancelAnimationFrame(frame);if(scroll.hasPointerCapture(current.pointer))scroll.releasePointerCapture(current.pointer);
  tracks.style.width=ruler.style.width='';scroll.classList.remove('trimming','moving');editor.end(cancelled);if(!cancelled&&current.error)editor.error(current.error);suppressClick=true;setTimeout(()=>suppressClick=false,0);
 }
 /** Seconds per pixel of the track the clip sits in, and where that track starts on screen. */
 const geometry=(wrapper:HTMLElement)=>{const lane=wrapper.parentElement!.getBoundingClientRect(),total=durationOf(editor.project());return{lane:lane.left,scale:lane.width/total};};
 scroll.addEventListener('pointerdown',event=>{
  if(!editor.canEdit()||event.button!==0||drag)return;
  const target=event.target as HTMLElement,handle=target.closest<HTMLButtonElement>('[data-resize-edge]');
  if(handle){if(handle.disabled)return;event.preventDefault();event.stopPropagation();const wrapper=handle.closest<HTMLElement>('[data-clip]')!,ref=JSON.parse(wrapper.dataset.clip!)as TimelineClip;
   start(ref,handle.dataset.resizeEdge as TrimEdge,event.clientX,event.pointerId,0,tracks.getBoundingClientRect().width/durationOf(editor.project()));return;}
  const body=target.closest<HTMLElement>('[data-move]');if(!body||(body as HTMLButtonElement).disabled)return;
  const wrapper=body.closest<HTMLElement>('[data-clip]')!,{lane,scale}=geometry(wrapper);
  pending={ref:JSON.parse(wrapper.dataset.clip!)as TimelineClip,x:event.clientX,pointer:event.pointerId,lane,scale};
 });
 scroll.addEventListener('pointermove',event=>{
  if(pending&&!drag&&event.pointerId===pending.pointer){
   if(Math.abs(event.clientX-pending.x)<SLOP)return;
   const p=pending;pending=undefined;if(!editor.canEdit())return;start(p.ref,undefined,p.x,p.pointer,p.lane,p.scale);
  }
  if(!drag||event.pointerId!==drag.pointer)return;event.preventDefault();drag.clientX=event.clientX;move();
 });
 scroll.addEventListener('pointerup',event=>{if(drag&&event.pointerId===drag.pointer){event.preventDefault();end(false);}else pending=undefined;});
 scroll.addEventListener('pointercancel',()=>end(true));scroll.addEventListener('lostpointercapture',()=>{if(drag)end(true);});
 scroll.addEventListener('click',event=>{if(suppressClick||(event.target as HTMLElement).closest('[data-resize-edge]')){event.preventDefault();event.stopImmediatePropagation();}},true);
 window.addEventListener('keydown',event=>{if(drag){event.preventDefault();event.stopImmediatePropagation();if(event.key==='Escape')end(true);}},true);
 window.addEventListener('blur',()=>end(true));window.addEventListener('resize',()=>end(true));
 document.addEventListener('visibilitychange',()=>{if(document.hidden)end(true);});
 // Keyboard access uses one reversible edit for each nudge: arrows on an edge trim it, Alt+arrows on a clip move it.
 scroll.addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight'].includes(event.key)||!editor.canEdit())return;
  const target=event.target as HTMLElement,handle=target.closest<HTMLButtonElement>('[data-resize-edge]'),body=!handle&&event.altKey?target.closest<HTMLElement>('[data-move]'):null;
  if((!handle||handle.disabled)&&!body)return;event.preventDefault();event.stopPropagation();
  const key=(handle??body)!.closest<HTMLElement>('[data-clip]')!.dataset.clip!,ref=JSON.parse(key)as TimelineClip,step=event.key==='ArrowLeft'?-1:1;selection=key;
  try{
   let next:StudioProject,moved=ref;
   if(handle)next=resizeTimelineClip(editor.project(),ref,handle.dataset.resizeEdge as TrimEdge,step*(event.shiftKey?.1:1/30));
   else if(sequential(ref)){const to=ref.index+step;if(to<0||to>=items(editor.project(),ref).length)return;next=reorderTimelineClip(editor.project(),ref,to);moved={...ref,index:to};}
   else next=moveTimelineClip(editor.project(),ref,step*(event.shiftKey?.1:1/30));
   editor.begin(ref);editor.preview(next,moved);editor.end(false);
   scroll.querySelector<HTMLButtonElement>(handle?`[data-clip='${key}'] [data-resize-edge='${handle.dataset.resizeEdge}']`:`[data-clip='${clipKey(moved)}'] [data-move]`)?.focus({preventScroll:true});
  }catch(error){editor.error((error as Error).message);}
 });
 return{decorate};
}
