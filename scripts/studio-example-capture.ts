/** Render the current Try example for the README. Run: npm run test:studio -- --example */
import { writeFileSync } from 'node:fs';
import { WAREHOUSE_EXAMPLE } from '../src/studio/examples/warehouse';
interface Harness {
 enabled:boolean;step(name:string,fn:()=>Promise<void>):Promise<void>;evaluate<T=unknown>(source:string):Promise<T>;
 ready():Promise<void>;pause(ms?:number):Promise<unknown>;folder:string;
}
export async function captureStudioExample(h:Harness){
 if(!h.enabled)return;const{step,evaluate:e,ready,pause,folder}=h;
 await step('Example warehouse film renders all 30 seconds for the README',async()=>{
  await ready();console.log('Building the five characters from the current Try example…');
  await e(`(async()=>{const p=${JSON.stringify(WAREHOUSE_EXAMPLE)};p.audio.muted=true;await studio.setProject(p);})()`);await ready();await pause(400);
  await e(`(()=>{const p=structuredClone(studio.project);window.__warehouseCapture={done:0,total:900,ready:false};studio.exportMovie(studio.scene,p,{width:960,height:540,signal:new AbortController().signal,progress:(done,total)=>Object.assign(__warehouseCapture,{done,total})}).then(blob=>{window.__warehouseMovie=blob;__warehouseCapture.ready=true;},error=>{__warehouseCapture.error=error.message;});})()`);
  const deadline=Date.now()+15*60*1000;let last=0;
  for(;;){
   const status=await e<{done:number;total:number;ready:boolean;error?:string}>('window.__warehouseCapture');
   if(status.error)throw Error(status.error);if(status.ready)break;if(Date.now()>deadline)throw Error('Warehouse film render timed out');
   if(status.done-last>=90){last=status.done;console.log(`Warehouse frames: ${status.done} / ${status.total}`);}await pause(1000);
  }
  const data=await e<string>(`new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(__warehouseMovie);})`);
  const bytes=Buffer.from(data.split(',')[1],'base64');writeFileSync(`${folder}/warehouse-example.mp4`,bytes);console.log(`Saved ${folder}/warehouse-example.mp4 (${(bytes.length/1024/1024).toFixed(2)} MiB)`);
 });
}
