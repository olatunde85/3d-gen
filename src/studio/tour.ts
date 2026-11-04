import './tour.css';
import { TOUR_STEPS, TOUR_STORAGE_KEY } from './tour-content';
import { tourDemo } from './tour-demo';
interface TourOptions {
  canOpen():boolean;
  /** Pause playback and expose the editor; return a function restoring its previous layout. */
  begin():()=>void;
}
interface Rect {left:number;top:number;right:number;bottom:number;width:number;height:number}
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
export function setupStudioTour(options:TourOptions){
  const trigger=document.getElementById('open-tour') as HTMLButtonElement;
  const dialog=document.createElement('dialog');dialog.id='studio-tour';dialog.className='studio-tour';dialog.setAttribute('aria-labelledby','studio-tour-title');dialog.setAttribute('aria-describedby','studio-tour-body');
  dialog.innerHTML=`<div class="tour-spotlight" aria-hidden="true"></div><section class="tour-card">
    <div class="tour-top"><span>ARA STUDIO / QUICK TOUR</span><button type="button" class="tour-close" aria-label="Close guided tour">✕</button></div>
    <div class="tour-progress" aria-hidden="true"><span></span></div>
    <div class="tour-copy" aria-live="polite" aria-atomic="true"><p class="tour-count"></p><h2 id="studio-tour-title"></h2><p id="studio-tour-body"></p></div>
    <div class="tour-demo" aria-hidden="true"></div><div class="tour-keys"></div>
    <div class="tour-nav"><button type="button" class="tour-skip">Skip tour</button><div><button type="button" class="tour-back">Back</button><button type="button" class="tour-next">Show me around <span aria-hidden="true">→</span></button></div></div>
    <p class="tour-navigation-hint">← → steps <span>·</span> Esc close <span>·</span> Illustrations show how the controls work.</p>
  </section>`;
  document.body.append(dialog);
  const $=<T extends HTMLElement>(selector:string)=>dialog.querySelector<T>(selector)!;
  const card=$<HTMLElement>('.tour-card'),spotlight=$<HTMLElement>('.tour-spotlight'),next=$<HTMLButtonElement>('.tour-next'),back=$<HTMLButtonElement>('.tour-back');
  let index=0,frame=0,pending=false,seen=false,restoreLayout:(()=>void)|undefined,opener:HTMLElement|undefined,finished=false;
  let scrolls:{element:HTMLElement;left:number;top:number}[]=[],pageScroll={x:0,y:0};
  const motion=matchMedia('(prefers-reduced-motion: reduce)');let copyAnimation:Animation|undefined;
  const reduced=()=>motion.matches;
  motion.addEventListener('change',()=>{if(reduced()){copyAnimation?.cancel();copyAnimation=undefined;}});
  const hasSeen=()=>{try{return seen||localStorage.getItem(TOUR_STORAGE_KEY)==='1';}catch{return seen;}};
  function markSeen(){seen=true;pending=false;try{localStorage.setItem(TOUR_STORAGE_KEY,'1');}catch{/* Tour dismissal still lasts for this page when storage is unavailable. */}}
  function targets(){return TOUR_STEPS[index].targets.map(selector=>document.querySelector<HTMLElement>(selector)).filter((el):el is HTMLElement=>!!el&&el.getBoundingClientRect().width>0&&el.getBoundingClientRect().height>0);}
  function clipped(el:HTMLElement):Rect|undefined{
    let {left,top,right,bottom}=el.getBoundingClientRect();
    for(let parent=el.parentElement;parent&&parent!==document.body;parent=parent.parentElement){
      const style=getComputedStyle(parent),rect=parent.getBoundingClientRect();
      if(/auto|scroll|hidden|clip/.test(style.overflowX)){left=Math.max(left,rect.left);right=Math.min(right,rect.right);}
      if(/auto|scroll|hidden|clip/.test(style.overflowY)){top=Math.max(top,rect.top);bottom=Math.min(bottom,rect.bottom);}
    }
    if(right<=left||bottom<=top)return;return{left,top,right,bottom,width:right-left,height:bottom-top};
  }
  function position(){
    if(!dialog.open)return;const viewport=dialog.getBoundingClientRect(),width=viewport.width,height=viewport.height,gap=16,margin=12;
    card.style.width=`${Math.min(370,width-margin*2)}px`;card.style.maxHeight=`${Math.max(80,height-margin*2)}px`;
    const bounds=targets().map(clipped).filter((r):r is Rect=>!!r);
    let rect:Rect|undefined;
    if(bounds.length){const left=clamp(Math.min(...bounds.map(r=>r.left))-viewport.left-7,margin,width-margin),top=clamp(Math.min(...bounds.map(r=>r.top))-viewport.top-7,margin,height-margin);
      const right=clamp(Math.max(...bounds.map(r=>r.right))-viewport.left+7,left,width-margin),bottom=clamp(Math.max(...bounds.map(r=>r.bottom))-viewport.top+7,top,height-margin);
      rect={left,top,right,bottom,width:right-left,height:bottom-top};}
    dialog.dataset.target=rect&&rect.width>0&&rect.height>0?'visible':'none';
    const cw=card.getBoundingClientRect().width,ch=card.getBoundingClientRect().height;
    if(!rect||!rect.width||!rect.height){card.style.left=`${(width-cw)/2}px`;card.style.top=`${(height-ch)/2}px`;return;}
    for(const [key,value]of Object.entries({left:rect.left,top:rect.top,width:rect.width,height:rect.height}))spotlight.style.setProperty(key,`${value}px`);
    const r=rect,candidates=[
      {x:r.right+gap,y:r.top},{x:r.left-cw-gap,y:r.top},{x:(r.left+r.right-cw)/2,y:r.bottom+gap},{x:(r.left+r.right-cw)/2,y:r.top-ch-gap},
      {x:margin,y:margin},{x:width-cw-margin,y:margin},{x:margin,y:height-ch-margin},{x:width-cw-margin,y:height-ch-margin},
    ].map(p=>({x:clamp(p.x,margin,width-cw-margin),y:clamp(p.y,margin,height-ch-margin)}));
    const overlap=(p:{x:number;y:number})=>Math.max(0,Math.min(p.x+cw,r.right)-Math.max(p.x,r.left))*Math.max(0,Math.min(p.y+ch,r.bottom)-Math.max(p.y,r.top));
    const best=candidates.reduce((a,b)=>overlap(b)<overlap(a)?b:a);card.style.left=`${best.x}px`;card.style.top=`${best.y}px`;
  }
  function schedulePosition(){cancelAnimationFrame(frame);frame=requestAnimationFrame(position);}
  function render(){
    const step=TOUR_STEPS[index];dialog.dataset.step=String(index);$('.tour-count').textContent=`${String(index+1).padStart(2,'0')} / ${TOUR_STEPS.length}`;
    $('#studio-tour-title').textContent=step.title;$('#studio-tour-body').textContent=step.body;
    $('.tour-progress span').style.width=`${(index+1)/TOUR_STEPS.length*100}%`;
    const demo=$('.tour-demo');demo.dataset.demo=step.demo;demo.innerHTML=tourDemo(step.demo);
    const keys=$('.tour-keys');keys.replaceChildren();keys.hidden=!step.keys?.length;
    for(const row of step.keys??[]){const line=document.createElement('p'),caps=document.createElement('span');for(const key of row.keys){const cap=document.createElement('kbd');cap.textContent=key;caps.append(cap);}const label=document.createElement('span');label.textContent=row.label;line.append(caps,label);keys.append(line);}
    back.disabled=index===0;if(back.disabled&&document.activeElement===back)next.focus({preventScroll:true});next.textContent=index===0?'Show me around →':index===TOUR_STEPS.length-1?'Start creating':'Next →';$('.tour-skip').textContent=index===TOUR_STEPS.length-1?'Close tour':'Skip tour';
    card.scrollTop=0;const elements=targets();elements[0]?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});if(elements.length>1)elements.at(-1)?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
    position();schedulePosition();copyAnimation?.cancel();if(!reduced())copyAnimation=$('.tour-copy').animate([{opacity:0,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)'}],{duration:180});
  }
  function close(done=false){finished=done;markSeen();dialog.close();cleanup();}
  function advance(delta:number){const target=index+delta;if(target>=TOUR_STEPS.length){close(true);return;}index=clamp(target,0,TOUR_STEPS.length-1);render();}
  function open(from?:HTMLElement){
    if(dialog.open||!options.canOpen()||document.querySelector('dialog[open]'))return false;
    pending=false;finished=false;opener=from??(document.activeElement instanceof HTMLElement?document.activeElement:undefined);
    pageScroll={x:scrollX,y:scrollY};scrolls=[...document.querySelectorAll<HTMLElement>('.library,.inspector,#set-list,.timeline-scroll')].map(element=>({element,left:element.scrollLeft,top:element.scrollTop}));
    restoreLayout=options.begin();index=0;dialog.classList.add('tour-opening');dialog.showModal();dialog.scrollTop=0;dialog.scrollLeft=0;render();dialog.scrollTop=0;dialog.scrollLeft=0;
    void spotlight.getBoundingClientRect();requestAnimationFrame(()=>dialog.classList.remove('tour-opening'));next.focus({preventScroll:true});return true;
  }
  function cleanup(){
    if(!restoreLayout)return;markSeen();copyAnimation?.cancel();copyAnimation=undefined;cancelAnimationFrame(frame);restoreLayout?.();restoreLayout=undefined;
    for(const s of scrolls){s.element.scrollLeft=s.left;s.element.scrollTop=s.top;}window.scrollTo({left:pageScroll.x,top:pageScroll.y,behavior:'instant'});
    const focus=finished?document.getElementById('film'):opener&&opener!==document.body&&opener.isConnected?opener:document.getElementById('film')??trigger;focus?.focus({preventScroll:true});
  }
  dialog.addEventListener('close',()=>{if(!dialog.open)cleanup();});
  next.addEventListener('click',()=>advance(1));back.addEventListener('click',()=>advance(-1));$('.tour-close').addEventListener('click',()=>close());$('.tour-skip').addEventListener('click',()=>close());
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('keydown',event=>{
    event.stopPropagation();
    if(event.key==='Tab'){
      const controls=[...dialog.querySelectorAll<HTMLElement>('button,a[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(el=>!el.hasAttribute('disabled')&&!el.closest('[hidden]')&&el.getClientRects().length);
      const at=controls.indexOf(document.activeElement as HTMLElement);event.preventDefault();controls[(at+(event.shiftKey?-1:1)+controls.length)%controls.length]?.focus();
    }else if(event.key==='Escape'){event.preventDefault();close();}
    else if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();advance(event.key==='ArrowRight'?1:-1);}
  });
  trigger.addEventListener('click',()=>open(trigger));
  document.addEventListener('keydown',event=>{
    if(event.key!=='?'||event.ctrlKey||event.metaKey||event.altKey||(event.target as HTMLElement).closest('input,select,textarea,[contenteditable="true"],dialog[open]'))return;
    if(open()){event.preventDefault();event.stopImmediatePropagation();}
  },true);
  function maybeOpen(){if(pending&&!document.hidden&&!hasSeen()&&!dialog.open&&options.canOpen()&&!document.querySelector('dialog[open]'))open();}
  const observer=new MutationObserver(()=>{if(pending)requestAnimationFrame(maybeOpen);});observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
  document.addEventListener('visibilitychange',maybeOpen);window.addEventListener('resize',schedulePosition);document.addEventListener('scroll',schedulePosition,true);
  window.visualViewport?.addEventListener('resize',schedulePosition);new ResizeObserver(schedulePosition).observe(card);
  return{open,ready:()=>{pending=!hasSeen();if(pending)requestAnimationFrame(maybeOpen);}};
}
