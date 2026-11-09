import {PHONE_LAYOUT} from './responsive';
/** Phone editor: a resizable control sheet and one entry point to the existing character actions. */
import type {Ctx} from './context';
import {summary} from './quick-data';
import {$,el} from './dom';

const SNAP_NAMES=['peek','edit','full']as const;
const STORAGE='3dgen.mobile.sheet';
export function mobileBuilder(ctx:Ctx){
 const phone=matchMedia(PHONE_LAYOUT),panel=$('#panel'),scroll=$<HTMLElement>('#panel-scroll'),heading=$('#sheet-heading'),handle=$<HTMLButtonElement>('#sheet-handle'),label=$('#sheet-handle-label');
 const action=$<HTMLButtonElement>('#mobile-actions'),actionLabel=$('#mobile-actions-label'),go=$<HTMLButtonElement>('#export-go');
 let snap=0;try{const saved=localStorage.getItem(STORAGE);if(saved&&SNAP_NAMES.includes(saved as typeof SNAP_NAMES[number]))snap=SNAP_NAMES.indexOf(saved as typeof SNAP_NAMES[number]);}catch{/* optional preference */}
 let points=[0,0,0],height=0,drag:{id:number;y:number;start:number;snap:number;lastY:number;lastTime:number;velocity:number;moved:boolean}|undefined,ignoreClickUntil=0,raf=0;
 const menu=el('div',{id:'mobile-action-menu',role:'menu',ariaLabel:'Character actions',tabIndex:-1,hidden:true});
 const commands:[string,string,string][]=[['download','Download model','export-go'],['export','Export options','export-summary'],['studio','Make a film in Studio','studio-btn'],['share','Share character','share-btn'],['save','Save character settings','save-character'],['open','Open character settings','open-character'],['assist','LLM Assist','character-assist-btn']];
 const buttons:HTMLButtonElement[]=[];
 const closeMenu=(focus=false)=>{menu.hidden=true;action.setAttribute('aria-expanded','false');if(focus)action.focus();};
 for(const [id,text,target]of commands){const b=el('button',{type:'button',role:'menuitem',textContent:text});b.dataset.action=id;b.addEventListener('click',()=>{
  closeMenu(true);
  if(['export','share','assist'].includes(id)){setSnap(0);if(id==='export')$('#anim-pop .anim-close').click();}
  $("#"+target).click();
 });buttons.push(b);menu.append(b);if(id==='export'||id==='share')menu.append(el('div',{role:'separator'}));}
 document.body.append(menu);
 const placeMenu=()=>{
  if(menu.hidden)return;const rect=action.getBoundingClientRect(),vh=visualViewport?.height??innerHeight;
  menu.style.maxHeight=Math.max(100,vh-24)+'px';const wanted=menu.offsetHeight,above=rect.top-12,below=vh-heading.getBoundingClientRect().bottom-12,up=above>=wanted||above>below;
  menu.style.maxHeight=Math.max(80,up?above-8:below-8)+'px';menu.style.top=(up?Math.max(8,rect.top-menu.offsetHeight-8):heading.getBoundingClientRect().bottom+8)+'px';
 };
 action.addEventListener('click',()=>{if(!menu.hidden){closeMenu();return;}menu.hidden=false;action.setAttribute('aria-expanded','true');placeMenu();menu.focus({preventScroll:true});});
 menu.addEventListener('keydown',e=>{const k=(e as KeyboardEvent).key,enabled=buttons.filter(b=>!b.disabled),index=enabled.indexOf(document.activeElement as HTMLButtonElement);if(['ArrowDown','ArrowUp','Home','End'].includes(k)){e.preventDefault();enabled[k==='Home'?0:k==='End'?enabled.length-1:index<0?(k==='ArrowUp'?enabled.length-1:0):(index+(k==='ArrowDown'?1:-1)+enabled.length)%enabled.length]?.focus();}});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!menu.hidden){e.preventDefault();e.stopPropagation();closeMenu(true);}},true);
 document.addEventListener('pointerdown',e=>{if(!menu.hidden&&!menu.contains(e.target as Node)&&!action.contains(e.target as Node))closeMenu();});
 // React to the new focus target; focusout may report no destination during a touch click.
 document.addEventListener('focusin',e=>{if(!menu.hidden&&!menu.contains(e.target as Node)&&!action.contains(e.target as Node))closeMenu();});
 const paintHeight=(value:number)=>{
  height=Math.max(points[0],Math.min(points[2],value));panel.style.setProperty('--sheet-height',height+'px');
  const expanded=height>points[0]+12;scroll.inert=phone.matches&&!expanded;handle.setAttribute('aria-expanded',String(expanded));
  label.textContent=expanded?'Character controls':'Edit character';handle.setAttribute('aria-label',expanded?'Collapse character controls. Drag or use arrow keys to resize.':'Expand character controls. Drag or use arrow keys to resize.');
 };
 function setSnap(next:number,save=true){
  snap=Math.max(0,Math.min(2,next));panel.dataset.sheetSnap=SNAP_NAMES[snap];
  if(phone.matches){if(!snap&&scroll.contains(document.activeElement))handle.focus({preventScroll:true});paintHeight(points[snap]);}
  if(save)try{localStorage.setItem(STORAGE,SNAP_NAMES[snap]);}catch{/* optional preference */}
  placeMenu();
 }
 const measure=()=>{
  const hud=$('#view-hud');$('main').style.setProperty('--view-hud-height',hud.offsetHeight+'px');
  if(!phone.matches){document.body.style.removeProperty('--app-height');panel.style.removeProperty('--sheet-height');scroll.inert=false;closeMenu();return;}
  const vh=visualViewport?.height??innerHeight;document.body.style.setProperty('--app-height',vh+'px');
  const safeBottom=parseFloat(getComputedStyle(panel).paddingBottom)||0,peek=heading.offsetHeight+safeBottom+1,max=Math.max(peek,vh-Math.min(240,vh*.45));
  points=[peek,Math.max(peek,Math.min(max,Math.max(peek+90,vh*.46))),max];if(!drag)setSnap(snap,false);placeMenu();
 };
 const sentence=()=>{const parts=summary(ctx.store.params);$('#sheet-summary').textContent=parts.map((p,i)=>(i&&!/^[,.]/.test(p.text)?' ':'')+p.text).join('');};
 sentence();ctx.store.on('params',sentence);ctx.store.on('sync',sentence);
 handle.addEventListener('click',e=>{if(performance.now()<ignoreClickUntil&&e.detail){e.preventDefault();return;}setSnap(snap?0:1);});
 handle.addEventListener('keydown',e=>{const delta=e.key==='ArrowUp'?1:e.key==='ArrowDown'?-1:0;if(delta||e.key==='Home'||e.key==='End'){e.preventDefault();setSnap(e.key==='Home'?0:e.key==='End'?2:snap+delta);}});
 handle.addEventListener('pointerdown',e=>{
  if(!phone.matches||!e.isPrimary||e.button!==0)return;closeMenu();drag={id:e.pointerId,y:e.clientY,start:panel.getBoundingClientRect().height,snap,lastY:e.clientY,lastTime:e.timeStamp,velocity:0,moved:false};handle.setPointerCapture(e.pointerId);panel.classList.add('sheet-dragging');
 });
 handle.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const dt=e.timeStamp-drag.lastTime;if(dt>0)drag.velocity=(drag.lastY-e.clientY)/dt;drag.lastY=e.clientY;drag.lastTime=e.timeStamp;drag.moved||=Math.abs(e.clientY-drag.y)>5;const target=drag.start+drag.y-e.clientY;cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>paintHeight(target));});
 const finish=(e:PointerEvent,cancelled=false)=>{
  if(!drag||drag.id!==e.pointerId)return;const d=drag;drag=undefined;cancelAnimationFrame(raf);panel.classList.remove('sheet-dragging');if(handle.hasPointerCapture(e.pointerId))handle.releasePointerCapture(e.pointerId);
  if(cancelled){setSnap(d.snap,false);return;}if(!d.moved)return;
  ignoreClickUntil=performance.now()+500;const target=Math.max(points[0],Math.min(points[2],d.start+d.y-e.clientY));let next=points.reduce((best,v,i)=>Math.abs(v-target)<Math.abs(points[best]-target)?i:best,0);
  if(Math.abs(d.velocity)>.5&&e.timeStamp-d.lastTime<100)next=d.velocity>0?Math.max(next,Math.min(2,d.snap+1)):Math.min(next,Math.max(0,d.snap-1));setSnap(next);
 };
 handle.addEventListener('pointerup',e=>finish(e));handle.addEventListener('pointercancel',e=>finish(e,true));
 handle.addEventListener('lostpointercapture',e=>{if(drag?.id===e.pointerId)finish(e,true);});
 $('#anim-bar').addEventListener('open-animation-browser',()=>{if(phone.matches){setSnap(0);closeMenu();$('#export-panel').hidden=true;document.querySelector<HTMLElement>('.anim-settings[aria-expanded="true"]')?.click();}});
 let fileFeedback=0;const fileStatus=$('#character-file-status');new MutationObserver(()=>{$('#sheet-file-status').textContent=fileStatus.textContent;clearTimeout(fileFeedback);fileFeedback=window.setTimeout(()=>{$('#sheet-file-status').textContent='';},6000);}).observe(fileStatus,{childList:true,subtree:true,characterData:true});
 new MutationObserver(()=>{buttons[0].disabled=go.disabled;buttons[0].textContent=go.classList.contains('busy')?go.textContent:'Download model';actionLabel.textContent=go.classList.contains('busy')?'Exporting…':'Actions';action.setAttribute('aria-busy',String(go.classList.contains('busy')));}).observe(go,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class','disabled']});
 new ResizeObserver(measure).observe(heading);new ResizeObserver(measure).observe($('#view-hud'));
 phone.addEventListener('change',()=>{drag=undefined;panel.classList.remove('sheet-dragging');measure();});window.addEventListener('resize',measure);visualViewport?.addEventListener('resize',measure);
 measure();
}
