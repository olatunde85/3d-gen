/** Real first-run onboarding, spotlight geometry, keyboard isolation and untouched film state. */
import { TOUR_STEPS, TOUR_STORAGE_KEY } from '../src/studio/tour-content';
interface Harness {
 enabled:boolean;step(name:string,fn:()=>Promise<void>):Promise<void>;evaluate<T=unknown>(source:string):Promise<T>;
 waitFor(source:string,what:string,ms?:number):Promise<void>;ready():Promise<void>;pause(ms?:number):Promise<unknown>;shot(name:string):Promise<void>;
 send<T=Record<string,unknown>>(method:string,params?:object):Promise<T>;
}
export async function checkStudioTour(h:Harness){
 if(!h.enabled)return;const{step,evaluate:e,waitFor:w,ready,pause,shot,send}=h;
 const click=async(selector:string)=>{await e(`document.querySelector(${JSON.stringify(selector)}).click()`);};
 const key=async(value:string,code=value,modifiers=0)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key:value,code,modifiers});await send('Input.dispatchKeyEvent',{type:'keyUp',key:value,code,modifiers:0});};
 const reload=async()=>{const before=await e<number>('performance.timeOrigin');await send('Page.reload');await w(`performance.timeOrigin!==${before}&&window.studio?.ready`,'new document and cast');};
 const close=()=>click('.tour-close');
 const open=async()=>{await click('#open-tour');await w('document.getElementById("studio-tour").open','manual tour',15000);};
 const cardFits=()=>e(`(()=>{const d=document.querySelector('#studio-tour'),c=d.querySelector('.tour-card').getBoundingClientRect(),v=d.getBoundingClientRect();return c.left>=v.left+10&&c.top>=v.top+10&&c.right<=v.right-10&&c.bottom<=v.bottom-10&&c.width>250&&d.scrollWidth<=d.clientWidth;})()`);
 await step('Tour opens on first load only after the real character is ready',async()=>{
  await ready();await w('document.getElementById("studio-tour").open','first-use guide');
  if(!await e('document.querySelector("#loading").hidden&&document.activeElement.classList.contains("tour-next")&&document.querySelector("#studio-tour").getAttribute("aria-labelledby")==="studio-tour-title"&&document.querySelector(".tour-back").disabled'))throw Error('First-run readiness, focus or accessible name');
  await e('window.__tourFilm=JSON.stringify(studio.project);window.__tourUndo=document.getElementById("undo").disabled;window.__tourTime=document.getElementById("scrub").value;');await shot('tour-welcome');
 });
 await step('Tour animates gestures and highlights the actual controls without editing the film',async()=>{
  for(let index=0;index<TOUR_STEPS.length;index++){
   await w(`document.getElementById('studio-tour').dataset.step===${JSON.stringify(String(index))}`,'tour step');await pause(300);
   if(!await cardFits())throw Error('Tour card outside desktop viewport at '+index);
   const geometry=await e<{visible:boolean;width:number;height:number}>(`(()=>{const d=document.getElementById('studio-tour'),s=d.querySelector('.tour-spotlight').getBoundingClientRect();return{visible:d.dataset.target==='visible',width:s.width,height:s.height};})()`);
   if(!geometry.visible||geometry.width<20||geometry.height<15)throw Error('Spotlight missing at '+index);
   if(!await e('JSON.stringify(studio.project)===__tourFilm&&document.getElementById("undo").disabled===__tourUndo&&document.getElementById("scrub").value===__tourTime'))throw Error('Tour changed the film or its Undo history');
   if(index===3){const before=await e<string>('getComputedStyle(document.querySelector(".tour-demo .tour-person")).transform');await pause(550);if(before===await e<string>('getComputedStyle(document.querySelector(".tour-demo .tour-person")).transform'))throw Error('Drag illustration is not animated');await shot('tour-drag');}
   if(index===5){if(!await e('document.querySelector(".tour-keys").textContent.includes("Ctrl / ⌘")&&document.getElementById("studio-tour-body").textContent.includes("Ctrl")'))throw Error('Turn/elevation shortcut missing');await shot('tour-character-keys');}
   if(index===6){if(!await e('document.getElementById("studio-tour-body").textContent.includes("Deselect first")&&document.querySelector(".tour-keys").textContent.includes("Home")'))throw Error('Orbit controls missing');await shot('tour-orbit');}
   if(index===TOUR_STEPS.length-1){await shot('tour-finish');break;}await click('.tour-next');
  }
  await click('.tour-next');await w('!document.getElementById("studio-tour").open&&document.activeElement.id==="film"','finished tour and preview focus');
  if(!await e(`localStorage.getItem(${JSON.stringify(TOUR_STORAGE_KEY)})==='1'&&document.activeElement.id==='film'`))throw Error('Finish did not persist or focus the preview');
 });
 await step('Tour remembers dismissal across reload and replays from the left panel',async()=>{
  await e('window.dispatchEvent(new Event("pagehide"))');await reload();await pause(350);if(await e('document.getElementById("studio-tour").open'))throw Error('Completed tour reopened');
  await e('document.getElementById("open-tour").focus()');await open();await key('ArrowRight');if(!await e('document.getElementById("studio-tour").dataset.step==="1"'))throw Error('Next via arrow');await key('ArrowLeft');if(!await e('document.getElementById("studio-tour").dataset.step==="0"'))throw Error('Back via arrow');
  for(let i=0;i<9;i++){await key('Tab');if(!await e('document.activeElement.closest("#studio-tour")!==null'))throw Error('Focus escaped the modal');}
  const film=await e<string>('JSON.stringify(studio.project)');await key('Escape');await w('!document.getElementById("studio-tour").open&&document.activeElement.id==="open-tour"','Escape closes and restores focus',15000);if(!await e('document.activeElement.id==="open-tour"')||await e<string>('JSON.stringify(studio.project)')!==film)throw Error('Escape changed the film or lost focus');
  await open();await click('.tour-skip');await w('!document.getElementById("studio-tour").open','skip');
 });
 await step('Tour teaches working movement, turn, elevation and orbit shortcuts',async()=>{
  await click('.cast-member');await e('document.getElementById("film").focus();window.__keysBefore=structuredClone(studio.project)');await key('ArrowRight');
  if(!await e('Math.hypot(studio.project.actors[0].x-__keysBefore.actors[0].x,studio.project.actors[0].z-__keysBefore.actors[0].z)>.09&&JSON.stringify(studio.project.view)===JSON.stringify(__keysBefore.view)'))throw Error('Unmodified arrows did not move only the selected character');
  await key('ArrowLeft','ArrowLeft',2);if(!await e('studio.project.actors[0].yaw!==__keysBefore.actors[0].yaw'))throw Error('Ctrl + arrow did not turn');await key('ArrowUp','ArrowUp',2);if(!await e('Math.abs(studio.project.actors[0].y-__keysBefore.actors[0].y-.05)<1e-7'))throw Error('Ctrl + arrow did not elevate');
  await key('ArrowRight','ArrowRight',4);if(!await e('Math.abs(studio.project.actors[0].yaw-__keysBefore.actors[0].yaw)<1e-7'))throw Error('Command + arrow did not turn');await key('ArrowUp','ArrowUp',4);if(!await e('Math.abs(studio.project.actors[0].y-__keysBefore.actors[0].y-.1)<1e-7'))throw Error('Command + arrow did not elevate');
  await key('Escape');await e('window.__unselectedActor=JSON.stringify(studio.project.actors[0]);window.__orbitBefore=studio.project.view.azimuth');await key('ArrowRight');if(!await e('JSON.stringify(studio.project.actors[0])===__unselectedActor&&studio.project.view.azimuth!==__orbitBefore'))throw Error('Arrows did not switch to orbit after deselect');await key('Home');
  await key('f','KeyF');if(!await e('document.querySelector(".workspace").classList.contains("wide")'))throw Error('F expand');
  await key('?','Slash',8);await w('document.getElementById("studio-tour").open','question-mark shortcut');if(await e('document.querySelector(".workspace").classList.contains("wide")'))throw Error('Tour did not expose hidden panels');if(!await e('localStorage.getItem("ara.studio.wide")==="1"'))throw Error('Tour persisted a temporary layout');await close();await w('document.querySelector(".workspace").classList.contains("wide")','expanded layout restored');
  await e('document.getElementById("film").focus()');await key('f','KeyF');
 });
 await step('Tour fits every step on mobile and in a short landscape viewport',async()=>{
  for(const size of [{width:390,height:844,mobile:true},{width:844,height:390,mobile:true}]){
   await send('Emulation.setDeviceMetricsOverride',{...size,deviceScaleFactor:1});await pause(150);const scroll=await e<{x:number;y:number}>('({x:scrollX,y:scrollY})');await open();
   for(let i=0;i<TOUR_STEPS.length;i++){await pause(90);if(!await cardFits())throw Error(`Tour card outside ${size.width}x${size.height} at ${i}: `+JSON.stringify(await e('(()=>{const d=document.getElementById("studio-tour"),c=d.querySelector(".tour-card");return{card:c.getBoundingClientRect().toJSON(),dialog:d.getBoundingClientRect().toJSON(),scroll:d.scrollWidth,client:d.clientWidth,scrollLeft:d.scrollLeft};})()')));if(!await e('document.getElementById("studio-tour").dataset.target==="visible"'))throw Error('Mobile target not visible '+i);if(!await e('(()=>{const b=document.querySelector(".tour-next").getBoundingClientRect();return b.top>=0&&b.bottom<=innerHeight;})()'))throw Error('Mobile navigation is not visible '+i);if(i===6)await shot(`tour-mobile-${size.width}`);if(i<TOUR_STEPS.length-1)await click('.tour-next');}
   await close();await w('!document.getElementById("studio-tour").open','mobile close');if(!await e(`Math.abs(scrollX-${scroll.x})<2&&Math.abs(scrollY-${scroll.y})<2`))throw Error('Tour lost the page scroll');
  }
  await send('Emulation.setDeviceMetricsOverride',{width:1500,height:1100,mobile:false,deviceScaleFactor:1});
 });
 await step('Tour respects reduced motion and waits for a recovered editor dialog',async()=>{
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await w('matchMedia("(prefers-reduced-motion: reduce)").matches','reduced-motion preference',10000);await open();await pause(250);
  if(!await e('document.getElementById("studio-tour").getAnimations({subtree:true}).every(a=>a.playState!=="running")'))throw Error('Reduced-motion guide still animates: '+JSON.stringify(await e('document.getElementById("studio-tour").getAnimations({subtree:true}).map(a=>({state:a.playState,name:a.animationName,target:a.effect?.target?.className,time:a.currentTime}))')));await close();await send('Emulation.setEmulatedMedia',{features:[]});
  await click('#open-assist');await e(`(()=>{const b=document.getElementById('assist-brief');b.value='Keep this unfinished idea';b.dispatchEvent(new Event('input',{bubbles:true}));localStorage.removeItem(${JSON.stringify(TOUR_STORAGE_KEY)});window.dispatchEvent(new Event('pagehide'));})()`);await reload();await w('document.getElementById("assist-dialog").open','recovered Assist');await pause(250);
  if(await e('document.getElementById("studio-tour").open')||!await e('document.getElementById("assist-brief").value==="Keep this unfinished idea"'))throw Error('Tour interrupted the recovered draft');await click('#assist-close');await w('document.getElementById("studio-tour").open','deferred first-use tour');await close();
 });
}
