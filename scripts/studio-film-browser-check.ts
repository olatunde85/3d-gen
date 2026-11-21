/** Films of several scenes in the real editor: the scene strip, switching, playing through, undo, reload, saving and export. */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
interface Harness {
 enabled:boolean;folder:string;step(name:string,fn:()=>Promise<void>):Promise<void>;evaluate<T=unknown>(source:string):Promise<T>;
 waitFor(source:string,what:string,ms?:number):Promise<void>;ready():Promise<void>;pause(ms?:number):Promise<unknown>;shot(name:string):Promise<void>;
 send<T=Record<string,unknown>>(method:string,params?:object,withSession?:boolean):Promise<T>;
}
export async function checkStudioFilm(h:Harness){
 if(!h.enabled)return;const {step,evaluate:e,waitFor:w,ready,pause,shot,send}=h;
 const click=(selector:string)=>e(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Missing ${selector}');el.click();})()`);
 const change=(id:string,value:string)=>e(`(()=>{const el=document.getElementById(${JSON.stringify(id)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 const settled=()=>w('studio.ready&&!document.getElementById("loading").offsetParent','scene to settle',120000);
 const film=()=>e<{template:string;sceneName?:string;transition?:string;actors:{id:string}[]}[]>('studio.film');
 await step('Film scenes: the strip adds a scene with the same set and cast, without rebuilding anyone',async()=>{
  await ready();
  await e(`(async()=>{const p=structuredClone(studio.project);p.title='Night journey';p.template='city-bus';p.actors=[{...p.actors[0],x:0,y:0,z:1.6,yaw:0,beats:[{id:'a',clip:'idle',duration:2,move:false}]},{...p.actors[0],id:'friend',x:.8,y:0,z:-1.3,yaw:0,beats:[{id:'b',clip:'sit_idle',duration:2,move:false}]}];p.shots=[{id:'s',duration:2,shot:'wide',target:'all'}];p.texts=[];p.audio={...p.audio,speech:[],effects:[],music:{...p.audio.music,track:'none'}};await studio.setFilm([p],0);})()`);
  await settled();assert.equal(await e('document.getElementById("scene-cards").children.length'),1);assert.ok(await e('document.getElementById("play-all").hidden'));
  await e('for(const a of studio.scene.actors.values())a.group.userData.marker="first"');
  await click('#scene-add');await settled();
  const scenes=await film();assert.equal(scenes.length,2);assert.equal(await e('studio.sceneIndex'),1);
  assert.equal(scenes[1].template,'city-bus');assert.deepEqual(scenes[1].actors.map(a=>a.id),['actor-a','friend']);
  assert.ok(await e('[...studio.scene.actors.values()].every(a=>a.group.userData.marker==="first")'),'the cast was rebuilt');
  assert.ok(await e('!document.getElementById("play-all").hidden&&document.getElementById("scene-cards").children[1].getAttribute("aria-pressed")==="true"'));
 });
 await step('Film scenes: each scene has its own set, name and transition; the title is shared',async()=>{
  await e(`(()=>{const card=document.querySelector('[data-set="airliner-cabin"]')??(()=>{const s=document.getElementById('scene-search');s.value='airliner';s.dispatchEvent(new Event('input',{bubbles:true}));return document.querySelector('[data-set="airliner-cabin"]');})();card.click();})()`);
  await settled();await change('scene-title','Flying home');await settled();await change('scene-transition','fade');await settled();
  let scenes=await film();assert.equal(scenes[0].template,'city-bus');assert.equal(scenes[1].template,'airliner-cabin');
  assert.equal(scenes[1].sceneName,'Flying home');assert.equal(scenes[1].transition,'fade');assert.equal(scenes[0].transition,undefined);
  assert.match(await e<string>('document.getElementById("scene-name").textContent'),/^Scene 2 · Airliner cabin/);
  const title=await e<string>('studio.project.title');assert.ok((await e<{title:string}[]>('studio.film')).every(s=>s.title===title));
  // The sitter takes a real airliner seat.
  const seats=await e<{x:number;z:number}[]>('studio.scene.seatsFor(studio.project)');assert.ok(seats.length>=50);
  const sitter=await e<{x:number;z:number}>('studio.project.actors.find(a=>a.id==="friend")');assert.ok(seats.some(s=>Math.hypot(s.x-sitter.x,s.z-sitter.z)<.4),'the sitter is not on a seat');
  await e('studio.seek(.2)');await pause(300);await shot('film-scene-airliner');
  await click('[data-scene="0"]');await settled();assert.equal(await e('studio.sceneIndex'),0);assert.equal(await e('studio.project.template'),'city-bus');
  await e('studio.seek(1.95)');await pause(200);await shot('film-scene-bus-fading');
  assert.ok(await e<number>('studio.scene.darkness')>.5,'the end of scene 1 fades out before a fade');
  await click('#scene-earlier').catch(()=>{});assert.equal((await film()).length,2);
  await click('#undo');await settled();scenes=await film();assert.equal(scenes[1].transition,undefined,'Undo brings back the cut');
  await click('#undo');await settled();
 });
 await step('Film scenes: All scenes plays straight on into the next scene',async()=>{
  await click('[data-scene="0"]');await settled();await click('#play-all');assert.equal(await e('document.getElementById("play-all").getAttribute("aria-pressed")'),'true');
  await e('studio.seek(1.6)');await click('#play');
  await w('studio.sceneIndex===1&&studio.ready','playback to reach scene 2',20000);await pause(400);
  assert.ok(await e('document.getElementById("play").getAttribute("aria-label")==="Pause film"'),'playback stopped at the scene change');
  await click('#play');await click('#play-all');
 });
 await step('Film scenes: reload reopens every scene, and Save project writes a version 3 film',async()=>{
  const before=JSON.stringify(await film());
  const origin=await e<number>('performance.timeOrigin');await send('Page.reload');await w(`performance.timeOrigin!==${origin}&&window.studio?.ready`,'reload',120000);await settled();
  assert.equal(JSON.stringify(await film()),before);assert.equal(await e('studio.sceneIndex'),1);
  await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:join(process.cwd(),h.folder)},false);
  const name=join(h.folder,'night-journey.ara-studio.json');if(existsSync(name))rmSync(name);
  await click('#save-project');for(let i=0;i<100&&!existsSync(name);i++)await pause(100);
  const saved=JSON.parse(readFileSync(name,'utf8'));assert.equal(saved.version,3);assert.equal(saved.scenes.length,2);assert.equal(saved.title,'Night journey');
 });
 await step('Film scenes: the strip deletes, duplicates and reorders scenes, up to five',async()=>{
  await click('#scene-duplicate');await settled();assert.equal((await film()).length,3);
  await click('#scene-earlier');await settled();assert.equal(await e('studio.sceneIndex'),1);
  for(let i=0;i<2;i++){await click('#scene-add');await settled();}
  assert.equal((await film()).length,5);assert.ok(await e('document.getElementById("scene-add").disabled&&document.getElementById("scene-duplicate").disabled'));
  await shot('film-scene-strip-five');
  await click('#scene-remove');await settled();assert.equal((await film()).length,4);
  await click('#undo');await settled();assert.equal((await film()).length,5);
  for(let i=0;i<3;i++){await click('#scene-remove');await settled();}
  assert.equal((await film()).length,2);
 });
 await step('Film scenes: the MP4 export plays every scene, one after another',async()=>{
  const total=await e<number>('studio.film.reduce((t,s)=>t+Math.ceil(Math.max(s.shots.reduce((a,b)=>a+b.duration,0),...s.actors.map(a=>a.beats.reduce((x,y)=>x+y.duration,0)))*30-1e-7)/30,0)');
  await click('#open-export');await change('resolution','720');await w('!document.getElementById("start-export").disabled','export ready',30000);
  assert.match(await e<string>('document.getElementById("export-length").textContent'),/2 scenes/);
  await click('#start-export');await w('!document.getElementById("download-film").hidden','the film to render',300000);
  const seconds=await e<number>(`new Promise(r=>{const v=document.createElement('video');v.preload='metadata';v.onloadedmetadata=()=>r(v.duration);v.src=document.getElementById('download-film').href;})`);
  assert.ok(Math.abs(seconds-total)<.1,`The film is ${seconds}s, not ${total}s`);
  assert.equal(await e('studio.sceneIndex'),1,'the open scene comes back after export');
  await click('#close-export');await settled();
 });
 await step('Film scenes: the strip fits a phone screen',async()=>{
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});await pause(600);
  assert.ok(await e('document.documentElement.scrollWidth<=window.innerWidth+1'),'the page scrolls sideways');
  assert.ok(await e('(()=>{const r=document.querySelector(".scene-strip").getBoundingClientRect();return r.width>0&&r.right<=window.innerWidth+1})()'),'the strip overflows');
  await e('document.querySelector(".scene-strip").scrollIntoView({block:"center"})');await pause(200);await shot('film-scene-strip-phone');
  await send('Emulation.setDeviceMetricsOverride',{width:1500,height:1100,deviceScaleFactor:1,mobile:false});await pause(400);
 });
}
