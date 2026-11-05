/** Exercise project replacement, cancellation, recovery and real downloads in the editor. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { wavBlob } from '../src/studio/audio/assets';
interface Harness {
 enabled:boolean;folder:string;step(name:string,fn:()=>Promise<void>):Promise<void>;evaluate<T=unknown>(source:string):Promise<T>;
 waitFor(source:string,what:string,ms?:number):Promise<void>;ready():Promise<void>;pause(ms?:number):Promise<unknown>;shot(name:string):Promise<void>;
 send<T=Record<string,unknown>>(method:string,params?:object,withSession?:boolean):Promise<T>;
}
export async function checkStudioNewProject(h:Harness){
 if(!h.enabled)return;const {step,evaluate:e,waitFor:w,ready,pause,shot,send}=h;
 const click=(id:string)=>e(`(()=>{const el=document.getElementById(${JSON.stringify(id)});el.focus();el.click();})()`);
 const key=async(key:string)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:key==='Escape'?27:undefined});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:key==='Escape'?27:undefined});};
 const reload=async()=>{const before=await e<number>('performance.timeOrigin');await send('Page.reload');await w(`performance.timeOrigin!==${before}&&window.studio?.ready`,'recovered project');};
 const start=async(save=false)=>{await click('new-project');await click(save?'save-new-project':'confirm-new-project');await w('!document.getElementById("new-project-dialog").open&&studio.ready','new project');};
 const savedFile=async(name:string)=>{const path=join(h.folder,name);for(let i=0;i<100&&!existsSync(path);i++)await pause(100);assert.ok(existsSync(path),'Project download missing: '+name);return readFileSync(path);};
 let original='';
 await step('New project cancellation and Escape preserve the entire film',async()=>{
  await ready();await e(`(async()=>{const p=structuredClone(studio.project);p.title='Film to keep';p.template='beach';p.view={azimuth:25,elevation:5,zoom:1.2};p.actors.push({...structuredClone(p.actors[0]),id:'guest',x:2});p.texts=[{id:'hello',text:'Keep this dialogue',style:'speech',anchor:'guest',start:0,duration:3,x:0,y:-.12,size:28,color:'#141414',background:'#ffffff'}];p.audio.music.track='tropical-pop';await studio.setProject(p);})()`);await ready();
  original=await e<string>('JSON.stringify(studio.project)');await click('new-project');
  assert.ok(await e('document.getElementById("new-project-dialog").open&&document.activeElement.id==="cancel-new-project"'));
  await shot('new-project-confirmation');await click('cancel-new-project');assert.equal(await e<string>('JSON.stringify(studio.project)'),original);
  await click('new-project');await key('Escape');await w('!document.getElementById("new-project-dialog").open','Escape closes confirmation');assert.ok(await e('!document.getElementById("new-project-dialog").open&&document.activeElement.id==="new-project"'));assert.equal(await e<string>('JSON.stringify(studio.project)'),original);
 });
 await step('New project clears film content, stale editor drafts and exported film',async()=>{
  await e(`(()=>{for(const [id,value]of [['scene-search','office'],['animation-search','walk'],['assist-brief','Old film idea'],['assist-json','{unfinished']]){const el=document.getElementById(id);el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));}document.getElementById('place-actor').click();studio.seek(5);const preview=document.getElementById('export-preview');preview.src=URL.createObjectURL(new Blob(['old movie']));document.getElementById('download-film').href=preview.src;history.replaceState(null,'','#demo&studioReturn=old');})()`);
  await start();
  assert.ok(await e(`(()=>{const p=studio.project;return p.title==='Untitled film'&&p.template==='portrait'&&p.actors.length===1&&p.actors[0].beats.length===1&&p.actors[0].beats[0].clip==='idle'&&p.shots.length===1&&p.shots[0].shot==='wide'&&p.camera==='locked'&&!p.caption&&!p.texts.length&&!p.audio.speech.length&&!p.audio.effects.length&&p.audio.music.track==='none'&&p.view.azimuth===0&&document.getElementById('scrub').value==='0'&&document.getElementById('place-actor').ariaPressed==='false'&&document.getElementById('scene-search').value===''&&document.getElementById('animation-search').value===''&&document.getElementById('assist-brief').value===''&&document.getElementById('assist-json').value===''&&!document.getElementById('export-preview').hasAttribute('src')&&!document.getElementById('download-film').hasAttribute('href')&&!location.hash.includes('studioReturn')&&document.activeElement.id==='film';})()`));
  await shot('new-project-fresh-film');
 });
 await step('New project survives reload and Undo restores the previous film',async()=>{
  const blank=await e<string>('JSON.stringify(studio.project)');await reload();assert.equal(await e<string>('JSON.stringify(studio.project)'),blank);
  assert.ok(await e('!document.getElementById("undo").disabled&&document.getElementById("assist-json").value===""'));
  await click('undo');await ready();assert.equal(await e<string>('JSON.stringify(studio.project)'),original);
 });
 await step('New project can save the current JSON before replacing it',async()=>{
  await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:join(process.cwd(),h.folder)},false);
  const path=join(h.folder,'film-to-keep.ara-studio.json');rmSync(path,{force:true});await start(true);
  assert.deepEqual(JSON.parse(strFromU8(await savedFile('film-to-keep.ara-studio.json'))),JSON.parse(original));
  await click('undo');await ready();assert.equal(await e<string>('JSON.stringify(studio.project)'),original);
 });
 await step('New project bundles attached audio and Undo keeps the recording usable',async()=>{
  const wav=new Uint8Array(await wavBlob([Float32Array.from({length:8000},(_,i)=>Math.sin(i*.1)*.05)],8000).arrayBuffer());
  const id=createHash('sha256').update(wav).digest('hex'),project=JSON.parse(original);
  project.audio.speech=[{id:'line',source:'file',name:'Recorded line',actor:project.actors[0].id,text:'Keep my recording',voice:'F1',start:0,duration:1,offset:0,speed:1,volume:1,effect:'natural',asset:id}];
  const bundle=zipSync({'project.json':strToU8(JSON.stringify(project)),[`audio/${id}.wav`]:wav});
  await e(`(()=>{const bytes=Uint8Array.from(atob(${JSON.stringify(Buffer.from(bundle).toString('base64'))}),c=>c.charCodeAt(0));const dt=new DataTransfer();dt.items.add(new File([bytes],'recorded-film.zip',{type:'application/zip'}));const el=document.getElementById('project-file');el.files=dt.files;el.dispatchEvent(new Event('change'));})()`);
  await w(`studio.ready&&studio.project.audio.speech[0]?.asset===${JSON.stringify(id)}`,'imported recording');
  const recorded=await e<string>('JSON.stringify(studio.project)');rmSync(join(h.folder,'film-to-keep.ara-studio.zip'),{force:true});await start(true);
  const files=unzipSync(await savedFile('film-to-keep.ara-studio.zip'));assert.deepEqual(JSON.parse(strFromU8(files['project.json'])),JSON.parse(recorded));assert.deepEqual(files[`audio/${id}.wav`],wav);
  await reload();await click('undo');await ready();assert.equal(await e<string>('JSON.stringify(studio.project)'),recorded);
  await click('open-sound');await w('document.getElementById("sound-asset-status").textContent.includes("Voice ready")','recording retained after Undo');await click('sound-close');
 });
 await step('New project keeps the current film when saving its audio fails',async()=>{
  await e(`(async()=>{const p=structuredClone(studio.project);p.audio.speech[0].asset='${'f'.repeat(64)}';await studio.setProject(p);})()`);await ready();const before=await e<string>('JSON.stringify(studio.project)');
  await click('new-project');await click('save-new-project');await w('document.getElementById("new-project-message").textContent.includes("missing")&&!document.getElementById("cancel-new-project").disabled','save failure');
  assert.ok(await e('document.getElementById("new-project-dialog").open'));assert.equal(await e<string>('JSON.stringify(studio.project)'),before);await click('cancel-new-project');
 });
 await step('New project controls and confirmation fit mobile and desktop screens',async()=>{
  for(const size of [{width:390,height:844},{width:844,height:390},{width:1024,height:768},{width:1500,height:1100}]){
   await send('Emulation.setDeviceMetricsOverride',{...size,deviceScaleFactor:1,mobile:size.width<951});await pause();
   assert.ok(await e(`(()=>{const buttons=[...document.querySelectorAll('.file-tools button')];return buttons.every(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;})&&document.documentElement.scrollWidth<=innerWidth;})()`),`Top bar overflow at ${size.width}`);
   await click('new-project');assert.ok(await e(`(()=>{const d=document.getElementById('new-project-dialog'),r=d.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&d.scrollWidth<=d.clientWidth;})()`));if(size.width===390)await shot('new-project-mobile');await key('Escape');await w('!document.getElementById("new-project-dialog").open','mobile confirmation closed');
  }
 });
}
