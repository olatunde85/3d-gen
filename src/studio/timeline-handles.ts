import {clipKey,resizeTimelineClip,type TimelineClip,type TrimEdge} from './timeline-resize';
import {durationOf,type StudioProject} from './project';
interface Editor {
 project():StudioProject;canEdit():boolean;
 begin(ref:TimelineClip):void;preview(p:StudioProject,ref:TimelineClip):void;end(cancelled:boolean):void;
 error(message:string):void;
}
/** Capture on the persistent scroller: repainting clips cannot interrupt a trim. */
export function timelineHandles(scroll:HTMLElement,editor:Editor){
 let selection='',drag:{ref:TimelineClip;edge:TrimEdge;original:StudioProject;x:number;scroll:number;scale:number;pointer:number;error:string;clientX:number;last:number}|undefined,frame=0,suppressClick=false;
 const tracks=scroll.querySelector<HTMLElement>('.timeline-track')!,ruler=scroll.querySelector<HTMLElement>('.ruler')!;
 function decorate(button:HTMLButtonElement,ref:TimelineClip){
  const wrapper=document.createElement('div');wrapper.className='timeline-clip';wrapper.dataset.clip=clipKey(ref);wrapper.classList.toggle('selected',ref.kind==='camera'||ref.kind==='action'?button.classList.contains('selected'):selection===clipKey(ref));
  for(const key of ['width','left','top','flex']as const){wrapper.style[key]=button.style[key];button.style[key]='';}
  if(button.classList.contains('text-beat'))wrapper.classList.add('timed-clip');
  wrapper.append(button);
  for(const edge of ['start','end']as const){const handle=document.createElement('button');handle.className=`trim-handle trim-${edge}`;handle.dataset.resizeEdge=edge;handle.setAttribute('aria-label',`Adjust ${edge} of ${button.getAttribute('aria-label')??button.textContent}`);
   const pinned=edge==='start'&&(ref.kind==='camera'||ref.kind==='action')&&ref.index===0;
   if(pinned){handle.dataset.pinned='true';handle.disabled=true;handle.title='This track starts at 0. Drag the right edge to change its duration.';}else handle.title=edge==='start'&&(ref.kind==='camera'||ref.kind==='action')?'Drag the boundary between this clip and the previous clip':'Drag to adjust timing · Escape to cancel';
   wrapper.append(handle);
  }
  button.addEventListener('click',()=>{selection=clipKey(ref);for(const clip of tracks.querySelectorAll('.timeline-clip.selected'))clip.classList.remove('selected');wrapper.classList.add('selected');},{capture:true});return wrapper;
 }
 function layout(){if(!drag)return;const width=drag.scale*durationOf(editor.project());tracks.style.width=ruler.style.width=`${width}px`;}
 function move(){if(!drag)return;try{const next=resizeTimelineClip(drag.original,drag.ref,drag.edge,(drag.clientX-drag.x+scroll.scrollLeft-drag.scroll)/drag.scale);drag.error='';editor.preview(next,drag.ref);layout();}catch(error){drag.error=(error as Error).message;}}
 function tick(now:number){if(!drag)return;const r=scroll.getBoundingClientRect(),dt=Math.min(32,now-drag.last);drag.last=now;
  const velocity=drag.clientX<r.left+35?-Math.min(1,(r.left+35-drag.clientX)/35):drag.clientX>r.right-35?Math.min(1,(drag.clientX-r.right+35)/35):0;
  if(velocity){const before=scroll.scrollLeft;scroll.scrollLeft+=velocity*dt*.5;if(before!==scroll.scrollLeft)move();}frame=requestAnimationFrame(tick);
 }
 function end(cancelled:boolean){if(!drag)return;const current=drag;drag=undefined;cancelAnimationFrame(frame);if(scroll.hasPointerCapture(current.pointer))scroll.releasePointerCapture(current.pointer);
  tracks.style.width=ruler.style.width='';scroll.classList.remove('trimming');editor.end(cancelled);if(!cancelled&&current.error)editor.error(current.error);suppressClick=true;setTimeout(()=>suppressClick=false,0);
 }
 scroll.addEventListener('pointerdown',event=>{
  const handle=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-resize-edge]');if(!handle||handle.disabled||!editor.canEdit()||event.button!==0||drag)return;
  event.preventDefault();event.stopPropagation();const wrapper=handle.closest<HTMLElement>('[data-clip]')!,ref=JSON.parse(wrapper.dataset.clip!)as TimelineClip;
  const original=structuredClone(editor.project()),scale=tracks.getBoundingClientRect().width/durationOf(original);selection=clipKey(ref);
  drag={ref,edge:handle.dataset.resizeEdge as TrimEdge,original,x:event.clientX,clientX:event.clientX,scroll:scroll.scrollLeft,scale,pointer:event.pointerId,error:'',last:performance.now()};
  scroll.setPointerCapture(event.pointerId);scroll.classList.add('trimming');editor.begin(ref);layout();frame=requestAnimationFrame(tick);
 });
 scroll.addEventListener('pointermove',event=>{if(!drag||event.pointerId!==drag.pointer)return;event.preventDefault();drag.clientX=event.clientX;move();});
 scroll.addEventListener('pointerup',event=>{if(drag&&event.pointerId===drag.pointer){event.preventDefault();end(false);}});
 scroll.addEventListener('pointercancel',()=>end(true));scroll.addEventListener('lostpointercapture',()=>end(true));
 scroll.addEventListener('click',event=>{if(suppressClick||(event.target as HTMLElement).closest('[data-resize-edge]')){event.preventDefault();event.stopImmediatePropagation();}},true);
 window.addEventListener('keydown',event=>{if(drag){event.preventDefault();event.stopImmediatePropagation();if(event.key==='Escape')end(true);}},true);
 window.addEventListener('blur',()=>end(true));window.addEventListener('resize',()=>end(true));
 document.addEventListener('visibilitychange',()=>{if(document.hidden)end(true);});
 // Keyboard access uses one reversible edit for each nudge.
 scroll.addEventListener('keydown',event=>{const handle=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-resize-edge]');if(!handle||handle.disabled||!['ArrowLeft','ArrowRight'].includes(event.key)||!editor.canEdit())return;event.preventDefault();event.stopPropagation();const key=handle.closest<HTMLElement>('[data-clip]')!.dataset.clip!,ref=JSON.parse(key)as TimelineClip;selection=key;editor.begin(ref);try{editor.preview(resizeTimelineClip(editor.project(),ref,handle.dataset.resizeEdge as TrimEdge,(event.key==='ArrowLeft'?-1:1)*(event.shiftKey?.1:1/30)),ref);editor.end(false);scroll.querySelector<HTMLButtonElement>(`[data-clip='${key}'] [data-resize-edge='${handle.dataset.resizeEdge}']`)?.focus({preventScroll:true});}catch(error){editor.end(true);editor.error((error as Error).message);}});
 return{decorate};
}
