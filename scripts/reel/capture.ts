/** Render every reel scene with Studio's own MP4 export. Run: npm run test:studio -- --reel, then npm run build:studio-reel. */
import { writeFileSync } from 'node:fs';
import { REEL } from '../../src/studio/examples/reel';
interface Harness {
 enabled:boolean;step(name:string,fn:()=>Promise<void>):Promise<void>;evaluate<T=unknown>(source:string):Promise<T>;
 ready():Promise<void>;pause(ms?:number):Promise<unknown>;folder:string;send<T=Record<string,unknown>>(method:string,params?:object):Promise<T>;
}
export async function captureStudioReel(h:Harness){
 if(!h.enabled)return;const{step,evaluate:e,ready,pause,folder,send}=h;
 // REEL_SCENES=5,6 re-renders only those scenes (1-based); the rest keep their earlier renders.
 const only=process.env.REEL_SCENES?.split(',').map(Number);
 for(const [i,scene] of REEL.entries())if(!only||only.includes(i+1))await step(`Reel scene ${i+1}: ${scene.name}`,async()=>{
  await ready();await e(`(async()=>{await studio.setProject(${JSON.stringify(scene.film())});})()`);await ready();await pause(800);
  await e(`(()=>{const p=structuredClone(studio.project);window.__reel={done:0,total:1,ready:false};studio.exportMovie(studio.scene,p,{width:1920,height:1080,signal:new AbortController().signal,progress:(done,total)=>Object.assign(__reel,{done,total})}).then(blob=>{window.__reelMovie=blob;__reel.ready=true;},error=>{__reel.error=error.message;});})()`);
  const deadline=Date.now()+20*60*1000;let last=0;
  for(;;){
   const status=await e<{done:number;total:number;ready:boolean;error?:string}>('window.__reel');
   if(status.error)throw Error(status.error);if(status.ready)break;if(Date.now()>deadline)throw Error(`${scene.name} render timed out`);
   if(status.done-last>=60){last=status.done;console.log(`${scene.name}: ${status.done} / ${status.total} frames`);}await pause(1000);
  }
  const data=await e<string>(`new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(__reelMovie);})`);
  const bytes=Buffer.from(data.split(',')[1],'base64'),file=`${folder}/reel-${String(i+1).padStart(2,'0')}.mp4`;writeFileSync(file,bytes);console.log(`Saved ${file} (${(bytes.length/1024/1024).toFixed(2)} MiB)`);
 });
 // The ending zooms out of the finale into the editor showing it: a 1920×1080 screenshot and where the picture sits in it.
 await step('Reel editor screenshot',async()=>{
  await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});
  try{
   await ready();await e(`(async()=>{await studio.setProject(${JSON.stringify(REEL.at(-1)!.film())});})()`);await ready();
   await e(`document.getElementById('deselect-actor')?.click()`);await e('studio.seek(6.4)');await pause(1500);
   const rect=await e<{x:number;y:number;width:number;height:number}>(`(()=>{const r=document.getElementById('film').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};})()`);
   const {data}=await send<{data:string}>('Page.captureScreenshot',{format:'png'});
   writeFileSync(`${folder}/reel-editor.png`,Buffer.from(data,'base64'));writeFileSync(`${folder}/reel-editor.json`,JSON.stringify({width:1920,height:1080,film:rect,time:6.4}));
   console.log('Editor screenshot, picture at',JSON.stringify(rect));
  }finally{await send('Emulation.clearDeviceMetricsOverride');}
 });
}
