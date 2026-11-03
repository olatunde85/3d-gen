/**
 * Studio integration: real renderer, timeline edits, responsive layouts and encoded MP4 playback.
 * Fails on page errors; saves review images and a real film under out/studio-review.
 *   npm run test:studio          (set CHROME=/path/to/chrome if not on macOS default)
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import type { Readable, Writable } from 'node:stream';
import { build } from 'vite';
import sharp from 'sharp';

const winDirs = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter((d): d is string => !!d);
const CHROME = process.env.CHROME ?? [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium', '/usr/bin/microsoft-edge',
  ...winDirs.flatMap((d) => [join(d, 'Google', 'Chrome', 'Application', 'chrome.exe'), join(d, 'Microsoft', 'Edge', 'Application', 'msedge.exe')]),
].find(existsSync);
if (!CHROME) throw new Error('No Chrome, Chromium or Edge found: set CHROME=/path/to/browser');

const DIST = join(import.meta.dirname, '../dist');
await build({ logLevel: 'error' });
const TYPES: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.pack': 'application/octet-stream', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json',
};
const server = createServer((req, res) => {
  let path = normalize(join(DIST, decodeURIComponent((req.url ?? '/').split('?')[0])));
  if (existsSync(path) && statSync(path).isDirectory()) path = join(path, 'index.html');
  if (!path.startsWith(DIST) || !existsSync(path)) {
    res.statusCode = 404;
    res.end();
    return;
  }
  res.setHeader('Content-Type', TYPES[extname(path)] ?? 'application/octet-stream');
  res.end(readFileSync(path));
});
await new Promise<void>((r) => server.listen(4422, r));

// --- Chrome over the DevTools pipe (fds 3 and 4) ---------------------------------------------
const profile = mkdtempSync(join(tmpdir(), 'ui-check-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--autoplay-policy=no-user-gesture-required', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run',
  `--user-data-dir=${profile}`, '--remote-debugging-pipe', '--window-size=1400,900', 'about:blank',
], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
const toChrome = chrome.stdio[3] as Writable, fromChrome = chrome.stdio[4] as Readable;
// Chrome keeps writing to its profile until it has exited, so wait for that before removing it.
const cleanup = async () => {
  const exited = chrome.exitCode !== null ? Promise.resolve() : new Promise<void>((r) => chrome.once('exit', () => r()));
  chrome.kill();
  server.close();
  await exited;
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
};

let nextId = 0, session: string | undefined, buf = '';
const pending = new Map<number, (m: { result?: unknown; error?: { message: string } }) => void>();
const errors: string[] = [];
fromChrome.on('data', (c: Buffer) => {
  buf += c.toString('utf8');
  let i;
  while ((i = buf.indexOf('\0')) >= 0) {
    const m = JSON.parse(buf.slice(0, i));
    buf = buf.slice(i + 1);
    if (m.id !== undefined) pending.get(m.id)?.(m);
    else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a: { value?: unknown; description?: string }) => a.value ?? a.description).join(' '));
  }
});
function send<T = Record<string, unknown>>(method: string, params: object = {}, withSession = true): Promise<T> {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result as T)));
    toChrome.write(JSON.stringify({ id, method, params, ...(withSession && session ? { sessionId: session } : {}) }) + '\0');
  });
}
async function evaluate<T>(js: string): Promise<T> {
  const r = await send<{ result: { value: T }; exceptionDetails?: { text: string; exception?: { description?: string } } }>('Runtime.evaluate', { expression: js, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}
async function waitFor(js: string, what: string, ms = 120000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await evaluate<boolean>(js).catch(() => false)) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`timed out waiting for ${what}`);
}


process.on('SIGINT',()=>{cleanup();process.exit(130)});
const folder='out/studio-expansion';mkdirSync(folder,{recursive:true});
const passed:string[]=[];
async function step(name:string,fn:()=>Promise<void>){await fn();passed.push(name);console.log('OK',name)}
const pause=(ms=200)=>new Promise(r=>setTimeout(r,ms));
const shot=async(name:string)=>{const {data}=await send<{data:string}>('Page.captureScreenshot',{format:'png'});writeFileSync(`${folder}/${name}.png`,Buffer.from(data,'base64'))};
const change=async(id:string,value:string)=>evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
const search=async(id:string,value:string)=>evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
const ready=()=>waitFor('window.studio?.ready','cast to finish building',120000);
const upload=async(text:string)=>evaluate(`(()=>{const dt=new DataTransfer();dt.items.add(new File([${JSON.stringify(text)}],'review.ara-studio.json',{type:'application/json'}));const e=document.querySelector('#project-file');e.files=dt.files;e.dispatchEvent(new Event('change'));})()`);
const saveData=async(expression:string,name:string)=>{const url=await evaluate<string>(expression);writeFileSync(`${folder}/${name}.png`,Buffer.from(url.split(',')[1],'base64'))};
try{
 const {targetId}=await send<{targetId:string}>('Target.createTarget',{url:'about:blank'},false);
 ({sessionId:session}=await send<{sessionId:string}>('Target.attachToTarget',{targetId,flatten:true},false));
 await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1500,height:1100,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:'http://localhost:4422/studio/#demo'});
 await step('Studio loads a textured character and 50 searchable scenes',async()=>{
  await ready();if(!await evaluate('window.studio.sets.length===50 && document.querySelectorAll("[data-set]").length===50'))throw Error('Missing scene catalogue');
  await search('scene-search','resort pool');if(!await evaluate('document.querySelectorAll("[data-set]").length===1 && !!document.querySelector("[data-set=resort-pool]")'))throw Error('Scene search');
  await change('scene-category','Homes');if(!await evaluate('!document.querySelector("#scene-empty").hidden'))throw Error('Category filter');await search('scene-search','');await change('scene-category','');
  await evaluate('window.studio.seek(1.5)');await pause();await shot('editor');
 });
 await step('Every scene renders within bounded GPU resources',async()=>{
  const metrics=await evaluate<{maxGeometries:number;maxTextures:number;maxCalls:number;finalGeometries:number;initialTextures:number;finalTextures:number}>(`(()=>{const s=window.studio.scene,p=structuredClone(window.studio.project);const initialTextures=s.renderer.info.memory.textures;s.resize(640,360);p.caption=false;p.view.zoom=1.25;let maxGeometries=0,maxTextures=0,maxCalls=0;window.__sceneFrames={};
  for(const location of window.studio.sets){p.template=location.id;s.render(p,1.5);maxGeometries=Math.max(maxGeometries,s.renderer.info.memory.geometries);maxTextures=Math.max(maxTextures,s.renderer.info.memory.textures);maxCalls=Math.max(maxCalls,s.renderer.info.render.calls);window.__sceneFrames[location.id]=s.output.toDataURL();}
  p.template='portrait';s.render(p,1.5);const finalGeometries=s.renderer.info.memory.geometries;s.resize(1280,720);s.render(window.studio.project,1.5);return{maxGeometries,maxTextures,maxCalls,finalGeometries,initialTextures,finalTextures:s.renderer.info.memory.textures}})()`);
  console.log('Scene resource budget:',metrics);if(metrics.maxGeometries>180||metrics.finalGeometries>35||metrics.maxTextures>80||metrics.maxCalls>350||metrics.finalTextures>metrics.initialTextures+1)throw Error('Scene resources grew without bounds');
  const frames=await evaluate<Record<string,string>>('window.__sceneFrames');for(const [id,url]of Object.entries(frames))writeFileSync(`${folder}/set-${id}.png`,Buffer.from(url.split(',')[1],'base64'));
  const tiles=await Promise.all(Object.entries(frames).map(async([id,url],i)=>({input:await sharp(Buffer.from(url.split(',')[1],'base64')).resize(320,180).extend({bottom:24,background:'#1b2027'}).composite([{input:Buffer.from(`<svg width="320" height="204"><text x="10" y="197" font-size="12" fill="#e0c5a3">${id}</text></svg>`)}]).png().toBuffer(),left:i%5*320,top:Math.floor(i/5)*204})));
  await sharp({create:{width:1600,height:2040,channels:3,background:'#1b2027'}}).composite(tiles).png().toFile(`${folder}/all-50-scenes.png`);
 });
 await step('Animation search exposes all 77 original performances',async()=>{
  if(!await evaluate('document.querySelector("#animation-count").textContent.includes("77 / 77")'))throw Error('Missing animations');
  await search('animation-search','laugh');await change('action','laugh');if(!await evaluate("window.studio.project.actors[0].beats[0].clip==='laugh'"))throw Error('Action search selection');
  await evaluate("document.querySelector('#clip-length').click()");if(!await evaluate('window.studio.project.actors[0].beats[0].duration===2.4'))throw Error('Clip timing');
  await evaluate("document.querySelector('#undo').click();document.querySelector('#undo').click()");await search('animation-search','');
  const invalid=await evaluate<string[]>(`(()=>{const p=structuredClone(window.studio.project),a=window.studio.scene.actor,fail=[];for(const option of document.querySelectorAll('#action option')){p.actors[0].beats=[{id:'test',clip:option.value,duration:3,move:false}];for(const t of [0,0.2,0.8]){const f=a.frame(p,t,p.actors[0]);if(f.rot.some(q=>q.some(v=>!Number.isFinite(v))||Math.abs(Math.hypot(...q)-1)>0.001)||[...f.rootPos.values()].some(p=>p.some(v=>!Number.isFinite(v))))fail.push(option.value);}}return fail})()`);
  if(invalid.length)throw Error('Invalid poses: '+invalid.join(','));
 });
 await step('Seated and cycling props scrub deterministically',async()=>{
  for(const clip of ['sit_idle','ride_bicycle']){
   await change('action',clip);await evaluate('window.studio.seek(1.1)');await pause();await saveData('window.studio.scene.output.toDataURL()',clip);
   const state=()=>evaluate<string>('JSON.stringify(window.studio.scene.actor.group.children.map(o=>({visible:o.visible,children:o.children.map(c=>({p:c.position.toArray(),r:c.rotation.toArray(),children:c.children.map(g=>g.rotation.toArray())}))})))');
   const a=await state();await evaluate('window.studio.seek(2.6)');await pause();await evaluate('window.studio.seek(1.1)');await pause();if(a!==await state())throw Error('Stateful prop on '+clip);
  }
  await change('action','idle');
 });
 await step('Two characters reuse existing geometry and have independent tracks',async()=>{
  const initial=await evaluate<string>('JSON.stringify({actor:window.studio.project.actors[0],shots:window.studio.project.shots})');
  const first=await evaluate<string>('window.studio.scene.actor.mesh.uuid');await evaluate("document.querySelector('#add-actor').click()");await ready();
  if(!await evaluate('window.studio.project.actors.length===2 && window.studio.scene.actors.size===2'))throw Error('Second character');
  if(await evaluate<string>('window.studio.scene.actor.mesh.uuid')!==first)throw Error('First character rebuilt unnecessarily');
  const preserved=await evaluate<string>('JSON.stringify({actor:window.studio.project.actors[0],shots:window.studio.project.shots})');if(JSON.stringify({...JSON.parse(initial).actor,beats:JSON.parse(initial).actor.beats.map((b:any)=>({...b,id:''}))})!==JSON.stringify({...JSON.parse(preserved).actor,beats:JSON.parse(preserved).actor.beats.map((b:any)=>({...b,id:''}))})||JSON.stringify(JSON.parse(initial).shots.map((s:any)=>({...s,id:''})))!==JSON.stringify(JSON.parse(preserved).shots.map((s:any)=>({...s,id:''}))))throw Error('Adding cast changed existing direction');
  await change('timeline-selection','actor-b:1');if(!await evaluate("document.querySelector('#action').value==='talk'"))throw Error('Timeline navigation');await change('timeline-selection','actor-b:0');
  await change('action','laugh');if(!await evaluate("window.studio.project.actors[1].beats[0].clip==='laugh' && window.studio.project.actors[0].beats[0].clip==='idle'"))throw Error('Tracks are coupled');
  await change('blocking','conversation');await evaluate('window.studio.seek(1.5)');await pause();await shot('two-characters');
  await evaluate("document.querySelector('.track-lane:first-child .beat').click()");await change('shot-target','actor-b');await change('shot','close');await pause();await shot('second-character-close');
  if(!await evaluate("window.studio.project.shots[0].target==='actor-b'"))throw Error('Camera subject');
  await evaluate("document.querySelectorAll('.cast-member')[1].click();document.querySelector('#remove-actor').click()");await ready();
  if(!await evaluate("window.studio.project.actors.length===1 && window.studio.project.shots[0].target==='all'"))throw Error('Removing actor left a missing camera subject');
  await evaluate("document.querySelector('#undo').click()");await ready();if(!await evaluate('window.studio.project.actors.length===2'))throw Error('Undo lost the removed actor');
  await change('timeline-selection','camera:0');await change('shot-target','all');await change('shot','wide');
 });
 await step('Both actors, props and camera evaluate identically after seeking',async()=>{
  const result=await evaluate<boolean>(`(()=>{const s=window.studio.scene,p=window.studio.project;const capture=()=>JSON.stringify({camera:s.camera.matrixWorld.elements,actors:[...s.actors].map(([id,a])=>({id,world:a.group.matrixWorld.elements,bones:a.mesh.skeleton.bones.map(b=>b.matrixWorld.elements),face:a.mesh.morphTargetInfluences}))});s.render(p,1.5);const first=capture();s.render(p,7.2);s.render(p,1.5);return first===capture()})()`);
  if(!result)throw Error('Scene state depends on seek order');
 });
 await step('Mouse orbit, wheel zoom and keyboard rotation are saved',async()=>{
  const r=await evaluate<{x:number;y:number}>('(()=>{const r=document.querySelector("#film").getBoundingClientRect();return{x:r.x+r.width*.5,y:r.y+r.height*.5}})()');
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:r.x,y:r.y,button:'left',buttons:1,clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:r.x+95,y:r.y+25,button:'left',buttons:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:r.x+95,y:r.y+25,button:'left',buttons:0,clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:r.x,y:r.y,deltaX:0,deltaY:130});await pause(300);
  if(!await evaluate('Math.abs(window.studio.project.view.azimuth)>5 && window.studio.project.view.zoom>1'))throw Error('Orbit/zoom did not persist');
  await evaluate("document.querySelector('#film').focus()");const old=await evaluate<number>('window.studio.project.view.azimuth');await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowLeft',code:'ArrowLeft'});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowLeft',code:'ArrowLeft'});
  if(await evaluate<number>('window.studio.project.view.azimuth')===old)throw Error('Keyboard orbit');await shot('orbit-view');
  await evaluate("document.querySelector('#view-reset').click()");
  if(!await evaluate('(()=>{const p=structuredClone(window.studio.project);p.view.elevation=-35;window.studio.scene.render(p,1);return window.studio.scene.camera.position.y>=0.12})()'))throw Error('Camera went below floor');
 });
 await step('Two-character framing and controls fit a narrow screen',async()=>{
  await evaluate("document.querySelector('#portrait').click();window.studio.seek(1)");await pause();
  if(!await evaluate(`(()=>{const s=window.studio.scene;return[...s.actors.values()].every(a=>[0,a.height].every(y=>{const p=a.group.position.clone();p.y+=y;p.project(s.camera);return Math.abs(p.x)<1&&Math.abs(p.y)<1}))})()`))throw Error('Cast clipped by portrait framing');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await pause();if(!await evaluate('document.documentElement.scrollWidth<=innerWidth'))throw Error('Mobile overflow');await shot('mobile');
  await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
  const touch=await evaluate<{x:number;y:number}>('(()=>{const r=document.querySelector("#film").getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()');
  const oldZoom=await evaluate<number>('window.studio.project.view.zoom');
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touch.x-25,y:touch.y,id:1},{x:touch.x+25,y:touch.y,id:2}]});
  await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touch.x-50,y:touch.y,id:1},{x:touch.x+50,y:touch.y,id:2}]});
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await pause();
  if(await evaluate<number>('window.studio.project.view.zoom')>=oldZoom)throw Error('Touch pinch did not zoom');
  await send('Emulation.setTouchEmulationEnabled',{enabled:false});
  await send('Emulation.setDeviceMetricsOverride',{width:1500,height:1100,deviceScaleFactor:1,mobile:false});await evaluate("document.querySelector('#view-reset').click();document.querySelector('#landscape').click()");
 });
 await step('Saved v1 films migrate and v2 files preserve the full cast',async()=>{
  const original=await evaluate<string>('JSON.stringify(window.studio.project)');
  const p=JSON.parse(original),a=p.actors[0];await upload(JSON.stringify({kind:'ara-studio',version:1,title:'An older film',detail:a.detail,character:a.character,template:'portrait',camera:'locked',aspect:'landscape',caption:true,beats:[{id:'old',clip:'wave',duration:3,shot:'medium',move:false}]}));await ready();
  if(!await evaluate("window.studio.project.version===2 && window.studio.project.actors.length===1 && window.studio.project.title==='An older film'"))throw Error('v1 migration');
  await upload(original);await ready();if(!await evaluate('window.studio.project.actors.length===2'))throw Error('v2 cast lost');
  const before=await evaluate<string>('JSON.stringify(window.studio.project)');await upload('{broken json');await pause();if(before!==await evaluate<string>('JSON.stringify(window.studio.project)'))throw Error('Invalid file changed project');
  await evaluate('window.__beforeReload=true');await send('Page.reload');await waitFor('!window.__beforeReload && window.studio?.ready','saved cast after reload',120000);
  if(!await evaluate('window.studio.project.actors.length===2'))throw Error('Autosave lost cast');
 });
 await step('Two-character MP4 exports, decodes and keeps camera/actor timing',async()=>{
  const p=await evaluate<Record<string,any>>('structuredClone(window.studio.project)');p.title='A meeting by the pool';p.template='resort-pool';p.view={azimuth:0,elevation:0,zoom:1};p.camera='locked';p.aspect='landscape';
  p.actors[0].beats=[{id:'a',clip:'wave',duration:2,move:false},{id:'b',clip:'idle',duration:2,move:false}];p.actors[1].beats=[{id:'a',clip:'idle',duration:2,move:false},{id:'b',clip:'talk',duration:2,move:false}];
  p.shots=[{id:'a',duration:2,shot:'wide',target:'all'},{id:'b',duration:1,shot:'medium',target:p.actors[0].id},{id:'c',duration:1,shot:'medium',target:p.actors[1].id}];
  await upload(JSON.stringify(p));await ready();await evaluate('window.studio.seek(1)');await pause();await shot('pool-duet-editor');
  await evaluate("document.querySelector('#open-export').click()");await change('resolution','720');await waitFor("!document.querySelector('#start-export').disabled",'encoder',15000);await evaluate("document.querySelector('#start-export').click()");
  await waitFor("!document.querySelector('#download-film').hidden || (!document.querySelector('#start-export').hidden && document.querySelector('#export-message').textContent)",'two-character movie',360000);
  if(!await evaluate("!document.querySelector('#download-film').hidden"))throw Error(await evaluate<string>("document.querySelector('#export-message').textContent"));
  await waitFor("document.querySelector('#export-preview').readyState>=1",'video decode',20000);
  const metadata=await evaluate<{duration:number;width:number;height:number}>("(()=>{const v=document.querySelector('#export-preview');return{duration:v.duration,width:v.videoWidth,height:v.videoHeight}})()");
  if(Math.abs(metadata.duration-4)>0.04||metadata.width!==1280||metadata.height!==720)throw Error(JSON.stringify(metadata));
  const encoded=await evaluate<string>(`(async()=>{const bytes=new Uint8Array(await(await fetch(document.querySelector('#download-film').href)).arrayBuffer());let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s)})()`);writeFileSync(`${folder}/ara-studio-duet-720p.mp4`,Buffer.from(encoded,'base64'));await shot('export-ready');await evaluate("document.querySelector('#close-export').click()");
 });
 await step('Full HD portrait film includes both characters',async()=>{
  await evaluate('window.studio.seek(1)');await pause();
  const result=await evaluate<{encoded:string;width:number;height:number;duration:number}>(`(async()=>{const p=structuredClone(window.studio.project);p.aspect='portrait';for(const a of p.actors)a.beats=[{...a.beats[0],duration:1}];p.shots=[{...p.shots[0],duration:1,shot:'wide',target:'all'}];
  const blob=await window.studio.exportMovie(window.studio.scene,p,{width:1080,height:1920,signal:new AbortController().signal,progress:()=>{}});const video=document.createElement('video'),url=URL.createObjectURL(blob);video.src=url;
  await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=()=>reject(Error('Portrait film did not decode'))});const bytes=new Uint8Array(await blob.arrayBuffer());let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));
  const result={encoded:btoa(s),width:video.videoWidth,height:video.videoHeight,duration:video.duration};URL.revokeObjectURL(url);window.studio.seek(1);return result})()`);
  if(result.width!==1080||result.height!==1920||Math.abs(result.duration-1)>0.04)throw Error('Incorrect Full HD portrait output');writeFileSync(`${folder}/ara-studio-duet-1080p.mp4`,Buffer.from(result.encoded,'base64'));
 });
 await step('Export cancellation restores both actors and the preview',async()=>{
  await evaluate("document.querySelector('#open-export').click();document.querySelector('#render-again').click()");await waitFor("!document.querySelector('#start-export').disabled",'encoder',15000);await evaluate("document.querySelector('#start-export').click()");await pause(100);await evaluate("document.querySelector('#cancel-export').click()");await waitFor("document.querySelector('#export-message').textContent.includes('cancelled')",'cancel',20000);
  if(!await evaluate('window.studio.scene.actors.size===2 && window.studio.scene.canvas.width===1280'))throw Error('Export changed preview');await evaluate("document.querySelector('#close-export').click()");
 });
 await step('Editing one character in the builder preserves the other actor and film',async()=>{
  await evaluate("document.querySelectorAll('.cast-member')[1].click()");const before=await evaluate<string>('JSON.stringify(window.studio.project)');
  await evaluate("document.querySelector('#edit-character').click()");await waitFor("location.pathname==='/app/' && document.querySelector('#stats')?.textContent && document.querySelector('#loading')?.hidden",'builder',120000);
  const hash=await evaluate<string>('location.hash');await send('Page.navigate',{url:'http://localhost:4422/app/?review=duet'+hash+'&demo'});await waitFor("window.ara?.store.current && document.querySelector('#loading').hidden",'builder inspection',120000);
  await evaluate("window.ara.store.set({name:'Second actor, revised',height:0.8,rig:'full',restPose:'T',detail:'high'})");await evaluate("document.querySelector('#studio-btn').click()");await waitFor("location.pathname==='/studio/' && document.querySelector('#project-name') && document.querySelector('#loading')?.hidden",'return to film',120000);
  const returned=await evaluate<string>("localStorage.getItem('ara.studio.project.v2')"),a=JSON.parse(before),b=JSON.parse(returned);
  if(b.actors.length!==2||b.actors[0].character!==a.actors[0].character||b.template!==a.template||b.title!==a.title||JSON.stringify(b.shots)!==JSON.stringify(a.shots)||JSON.stringify(b.actors[1].beats)!==JSON.stringify(a.actors[1].beats)||b.actors[1].character===a.actors[1].character)throw Error('Builder round trip changed another part of the film');
  if(b.actors[1].detail!=='high')throw Error('Character detail lost on return');await shot('mixed-rig-cast');
 });
 if(errors.length)throw Error(errors.join('\n'));console.log('Studio expansion browser checks passed:',passed.length);
}catch(error){await shot('failure').catch(()=>{});console.log('Failure page:',await evaluate('({url:location.href,body:document.body.innerText.slice(-3000)})').catch(()=>null));if(errors.length)console.log('Browser errors:',errors);throw error;}finally{await cleanup()}
