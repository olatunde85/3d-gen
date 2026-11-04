/** Physical modifier lifecycles, omitted releases, focus routing and saved character transforms. */
interface Harness {
 enabled:boolean;step(name:string,fn:()=>Promise<void>):Promise<void>;evaluate<T=unknown>(source:string):Promise<T>;
 waitFor(source:string,what:string,ms?:number):Promise<void>;ready():Promise<void>;pause(ms?:number):Promise<unknown>;
 send<T=Record<string,unknown>>(method:string,params?:object):Promise<T>;
}
export async function checkStudioShortcuts(h:Harness){
 if(!h.enabled)return;const{step,evaluate:e,waitFor:w,ready,send,pause}=h;
 const event=(type:string,key:string,code=key,modifiers=0,autoRepeat=false)=>send('Input.dispatchKeyEvent',{type,key,code,modifiers,autoRepeat});
 const tap=async(key:string,modifiers=0)=>{await event('keyDown',key,key,modifiers);await event('keyUp',key,key,modifiers);};
 await step('Shortcuts commit Command turns even when the arrow release is omitted',async()=>{
  await ready();await e('studio.setProject(structuredClone(studio.project))');await ready();await e('document.getElementById("film").focus();window.__shortcutBase=JSON.stringify(studio.project);window.__shortcutYaw=studio.project.actors[0].yaw;');
  await event('keyDown','Meta','MetaLeft',4);await event('keyDown','ArrowRight','ArrowRight',4);await event('keyDown','ArrowRight','ArrowRight',4,true);await event('keyUp','Meta','MetaLeft',0);
  if(!await e('Math.abs(studio.project.actors[0].yaw-__shortcutYaw-10)<.001'))throw Error('Command + Right did not turn');
  await w('!document.getElementById("actor-yaw").disabled&&!studio.scene.freezeCamera','Command release commits the turn',5000);
  await e('window.dispatchEvent(new Event("blur"))');if(!await e('Math.abs(studio.project.actors[0].yaw-__shortcutYaw-10)<.001'))throw Error('Completed turn was reverted on blur');
  await e('document.getElementById("undo").click()');await ready();if(!await e('JSON.stringify(studio.project)===__shortcutBase'))throw Error('Held Command turn did not Undo as one edit');
 });
 await step('Shortcuts use real Control and Command presses for turning and elevation',async()=>{
  for(const modifier of [{key:'Control',code:'ControlLeft',mask:2},{key:'Meta',code:'MetaLeft',mask:4}]){
   await e('document.getElementById("film").focus();window.__beforeModifier=structuredClone(studio.project)');
   await event('keyDown',modifier.key,modifier.code,modifier.mask);await tap('ArrowLeft',modifier.mask);await tap('ArrowUp',modifier.mask);await event('keyUp',modifier.key,modifier.code,0);
   if(!await e('Math.abs(studio.project.actors[0].yaw-__beforeModifier.actors[0].yaw+5)<.001&&Math.abs(studio.project.actors[0].y-__beforeModifier.actors[0].y-.05)<.001&&JSON.stringify(studio.project.view)===JSON.stringify(__beforeModifier.view)&&!document.getElementById("actor-yaw").disabled'))throw Error('Incorrect '+modifier.key+' modifier transform');
   // The late arrow keyup after the modifier must not undo, duplicate or lock a completed gesture.
   await event('keyDown',modifier.key,modifier.code,modifier.mask);await event('keyDown','ArrowRight','ArrowRight',modifier.mask);await event('keyUp',modifier.key,modifier.code,0);await event('keyUp','ArrowRight','ArrowRight',0);
   if(!await e('!document.getElementById("actor-yaw").disabled&&Math.abs(studio.project.actors[0].yaw-__beforeModifier.actors[0].yaw)<.001'))throw Error('Late keyup left controls locked');
  }
 });
 await step('Shortcuts focus the preview on character selection and protect text editing',async()=>{
  await e('document.getElementById("title").focus();document.querySelector(".cast-member").click()');if(!await e('document.activeElement.id==="film"'))throw Error('Selecting a cast member did not focus preview controls');
  const r=await e<{x:number;y:number}>(`(()=>{const a=studio.scene.actor,p=a.group.position.clone();p.y+=a.height*.55;p.project(studio.scene.camera);const r=studio.scene.canvas.getBoundingClientRect();return{x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};})()`);
  await e('document.getElementById("title").focus()');await send('Input.dispatchMouseEvent',{type:'mousePressed',...r,button:'left',buttons:1,clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...r,button:'left',buttons:0,clickCount:1});if(!await e('document.activeElement.id==="film"&&!!studio.scene.selectionId'))throw Error('Picking a character did not focus the preview');
  await e('window.__textPose=JSON.stringify(studio.project.actors);document.getElementById("title").focus()');await event('keyDown','Meta','MetaLeft',4);await tap('ArrowLeft',4);await event('keyUp','Meta','MetaLeft',0);if(!await e('JSON.stringify(studio.project.actors)===__textPose'))throw Error('Editing a title turned the character');
  await e('document.getElementById("actor-yaw").focus()');await tap('ArrowRight',2);if(!await e('JSON.stringify(studio.project.actors)===__textPose'))throw Error('Editing a number turned the character');
 });
 await step('Shortcuts recover from lost focus and leave unselected arrows orbiting the set',async()=>{
  await e('document.getElementById("film").focus();window.__beforeLostFocus=studio.project.actors[0].yaw');await event('keyDown','Meta','MetaLeft',4);await event('keyDown','ArrowRight','ArrowRight',4);await e('window.dispatchEvent(new Event("blur"))');await event('keyUp','Meta','MetaLeft',0);
  if(!await e('!document.getElementById("actor-yaw").disabled&&!studio.scene.freezeCamera&&Math.abs(studio.project.actors[0].yaw-__beforeLostFocus-5)<.001'))throw Error('Lost focus left placement active or reverted the turn');
  await tap('Escape');await e('window.__unselectedPose=JSON.stringify(studio.project.actors);window.__unselectedView=studio.project.view.azimuth;document.getElementById("film").focus()');await tap('ArrowLeft');if(!await e('JSON.stringify(studio.project.actors)===__unselectedPose&&studio.project.view.azimuth!==__unselectedView'))throw Error('Unselected arrows do not orbit');
  await e('document.querySelector(".cast-member").click();document.getElementById("film").focus()');await event('keyDown','Meta','MetaLeft',4);await event('keyDown','ArrowLeft','ArrowLeft',4);const saved=await e<string>('JSON.stringify(studio.project.actors)');await e('window.dispatchEvent(new Event("pagehide"))');const origin=await e<number>('performance.timeOrigin');await send('Page.reload');await w(`performance.timeOrigin!==${origin}&&window.studio?.ready`,'reloaded turn');await pause(150);if(await e<string>('JSON.stringify(studio.project.actors)')!==saved)throw Error('Reload lost the turn');
 });
}
