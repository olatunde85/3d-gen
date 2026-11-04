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
import { checkFiveCast } from './studio-cast-check';
import { checkStudioAudio } from './studio-audio-check';
import { checkStudioEffects } from './studio-effects-check';
import { checkStudioTour } from './studio-tour-check';
import { TOUR_STORAGE_KEY } from '../src/studio/tour-content';

const winDirs = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter((d): d is string => !!d);
const CHROME = process.env.CHROME ?? [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium', '/usr/bin/microsoft-edge',
  ...winDirs.flatMap((d) => [join(d, 'Google', 'Chrome', 'Application', 'chrome.exe'), join(d, 'Microsoft', 'Edge', 'Application', 'msedge.exe')]),
].find(existsSync);
if (!CHROME) throw new Error('No Chrome, Chromium or Edge found: set CHROME=/path/to/browser');

const audioOnly=process.argv.includes('--audio'),castOnly=process.argv.includes('--cast'),effectsOnly=process.argv.includes('--sfx'),tourOnly=process.argv.includes('--tour');
if(castOnly||effectsOnly)process.env.STUDIO_AUDIO_CHECK='1';
if(audioOnly&&!existsSync(join(process.env.STUDIO_TTS_FIXTURE??'out/studio-speech-model','onnx/vocoder.onnx')))throw Error('Run npm run setup:studio-speech first, or set STUDIO_TTS_FIXTURE to the pinned model directory.');
if(audioOnly){process.env.STUDIO_AUDIO_CHECK='1';process.env.VITE_STUDIO_TTS_MODEL_URL='/__tts-model';}
const DIST = join(import.meta.dirname, '../dist');
await build({ logLevel: 'error' });
const TYPES: Record<string, string> = {
  '.mp3':'audio/mpeg','.wasm':'application/wasm','.mjs':'text/javascript','.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.pack': 'application/octet-stream', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json',
};
const server = createServer((req, res) => {
  if(audioOnly&&req.url?.startsWith('/__tts-model/')){const name=req.url.slice('/__tts-model/'.length).split('?')[0];if(!/^(?:onnx\/(?:duration_predictor|text_encoder|vector_estimator|vocoder)\.onnx|onnx\/(?:tts|unicode_indexer)\.json|voice_styles\/[FM][12]\.json)$/.test(name)){res.writeHead(404).end();return;}const file=join(process.env.STUDIO_TTS_FIXTURE??join(import.meta.dirname,'../out/studio-speech-model'),name);if(!existsSync(file)){res.writeHead(404).end();return;}const data=readFileSync(file);res.setHeader('Content-Length',data.length);res.setHeader('Content-Type','application/octet-stream');res.end(data);return;}
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
  '--headless=new', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run',
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
const interactionsOnly=process.argv.includes('--interactions');
const reloadsOnly=process.argv.includes('--reloads');
const textOnly=process.argv.includes('--text');
const assistOnly=process.argv.includes('--assist');
async function step(name:string,fn:()=>Promise<void>){if(tourOnly&&!/^Tour /.test(name))return;if(effectsOnly&&!/Studio loads|Two characters reuse|^Effects /.test(name))return;if(castOnly&&!/Studio loads|Two characters reuse|^Five /.test(name))return;if(audioOnly&&!/Studio loads|Two characters reuse|^Audio /.test(name))return;if(assistOnly&&!/Studio loads|Two characters reuse|^LLM Assist|^LLM-friendly|^Custom character/.test(name))return;if(textOnly&&!/Studio loads|Two characters reuse|^Text /.test(name))return;if(reloadsOnly&&!/Studio loads|Two characters reuse|Reload/.test(name))return;if(interactionsOnly&&/Every scene renders|Animation search exposes|Seated and cycling|MP4 exports|Full HD portrait|Export cancellation|Editing one character/.test(name))return;await fn();passed.push(name);console.log('OK',name)}
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
 if(!tourOnly)await send('Page.addScriptToEvaluateOnNewDocument',{source:`try{localStorage.setItem(${JSON.stringify(TOUR_STORAGE_KEY)},'1')}catch{}`});
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
  const r=await evaluate<{x:number;y:number}>('(()=>{const r=document.querySelector("#film").getBoundingClientRect();return{x:r.x+r.width*.85,y:r.y+r.height*.12}})()');
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:r.x,y:r.y,button:'left',buttons:1,clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:r.x+95,y:r.y+25,button:'left',buttons:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:r.x+95,y:r.y+25,button:'left',buttons:0,clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:r.x,y:r.y,deltaX:0,deltaY:130});await pause(300);
  if(!await evaluate('window.studio.project.view.azimuth < -5 && window.studio.project.view.zoom>1'))throw Error('Orbit/zoom did not persist');
  await evaluate("document.querySelector('#film').focus()");const old=await evaluate<number>('window.studio.project.view.azimuth');await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowLeft',code:'ArrowLeft'});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowLeft',code:'ArrowLeft'});
  if(await evaluate<number>('window.studio.project.view.azimuth')<=old)throw Error('Keyboard orbit direction');await shot('orbit-view');
  await evaluate("document.querySelector('#view-reset').click()");
  if(!await evaluate('(()=>{const p=structuredClone(window.studio.project);p.view.elevation=-35;window.studio.scene.render(p,1);return window.studio.scene.camera.position.y>=0.12})()'))throw Error('Camera went below floor');
 });
 await step('The top-bar title edits, saves and undoes without a duplicate field',async()=>{
  if(!await evaluate("!!document.querySelector('header #title') && !document.querySelector('.inspector #title')"))throw Error('Title is not in the header');
  const original=await evaluate<string>('window.studio.project.title');
  await evaluate("(()=>{const t=document.querySelector('#title');t.focus();t.value='A new working title';t.dispatchEvent(new Event('input'));t.value='A finished title';t.dispatchEvent(new Event('input'));t.blur()})()");
  if(!await evaluate("window.studio.project.title==='A finished title' && JSON.parse(localStorage.getItem('ara.studio.project.v2')).title==='A finished title'"))throw Error('Title did not save');
  await evaluate("document.querySelector('#undo').click()");if(await evaluate<string>('window.studio.project.title')!==original)throw Error('Title editing did not undo as one change');
 });
 await step('Supported equipment attaches to one actor and preserves the other cast member',async()=>{
  await evaluate("document.querySelectorAll('.cast-member')[0].click()");
  const other=await evaluate<string>('window.studio.scene.actors.get(window.studio.project.actors[1].id).mesh.uuid');
  const direction=await evaluate<string>('JSON.stringify({beats:window.studio.project.actors[0].beats,shots:window.studio.project.shots})');
  await change('actor-carry','none');await ready();await change('actor-weapon','pistol');await ready();await change('actor-carry','briefcase');await ready();
  if(!await evaluate("window.studio.scene.actor.character.params.weapon==='pistol' && window.studio.scene.actor.character.params.carry==='briefcase' && window.studio.scene.actor.character.rig.holds.includes('Left') && window.studio.scene.actor.character.mesh.materials.some(m=>m.name==='Gunmetal')"))throw Error('Equipment was not fitted into the character');
  if(await evaluate<string>('window.studio.scene.actors.get(window.studio.project.actors[1].id).mesh.uuid')!==other)throw Error('Equipment rebuilt the other actor');
  if(await evaluate<string>('JSON.stringify({beats:window.studio.project.actors[0].beats,shots:window.studio.project.shots})')!==direction)throw Error('Equipment changed direction');
  await evaluate('window.studio.seek(1)');await pause();await shot('equipment');
  await evaluate("document.querySelector('#undo').click()");await ready();if(!await evaluate("window.studio.scene.actor.character.params.carry==='none' && window.studio.scene.actor.character.params.weapon==='pistol'"))throw Error('Equipment undo');
 });
 await step('Selection determines whether arrows edit the actor or orbit the scene',async()=>{
  const original=await evaluate<string>('JSON.stringify(window.studio.project)');
  await evaluate("document.querySelectorAll('.cast-member')[0].click();document.querySelector('#film').focus()");
  const before=await evaluate<{x:number;y:number;z:number;yaw:number;view:string;other:string}>('({...window.studio.project.actors[0],view:JSON.stringify(window.studio.project.view),other:JSON.stringify(window.studio.project.actors[1])})');
  const key=async(key:string,modifiers=0)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,modifiers});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,modifiers});};
  await key('ArrowRight');
  const moved=await evaluate<{x:number;z:number;view:string;other:string}>('({...window.studio.project.actors[0],view:JSON.stringify(window.studio.project.view),other:JSON.stringify(window.studio.project.actors[1])})');
  if(Math.abs(Math.hypot(moved.x-before.x,moved.z-before.z)-.1)>.002||moved.view!==before.view||moved.other!==before.other)throw Error('Plain arrows did not move only the selected actor');
  const sceneNavigation=await evaluate<string>('JSON.stringify({actors:window.studio.project.actors,view:window.studio.project.view})');
  await evaluate("document.querySelector('[data-set]').focus()");await key('ArrowDown');
  if(await evaluate<string>('JSON.stringify({actors:window.studio.project.actors,view:window.studio.project.view})')!==sceneNavigation||!await evaluate("document.activeElement===document.querySelectorAll('[data-set]')[1]"))throw Error('Scene list navigation also transformed the scene');
  await evaluate("document.querySelector('#film').focus()");
  const keyboardState=await evaluate<string>('JSON.stringify(window.studio.project.actors)');
  for(let i=0;i<3;i++)await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowUp',code:'ArrowUp'});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowUp',code:'ArrowUp'});
  await evaluate("document.querySelector('#undo').click()");await ready();
  if(await evaluate<string>('JSON.stringify(window.studio.project.actors)')!==keyboardState)throw Error('Held arrows did not undo as one move');
  await evaluate("document.querySelector('#film').focus()");
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight'});await key('Escape');await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight'});
  if(await evaluate<string>('JSON.stringify(window.studio.project.actors)')!==keyboardState||!await evaluate('!!window.studio.scene.selectionId'))throw Error('Escape did not cancel the active keyboard move');
  await key('ArrowRight',8);await key('ArrowUp',8);
  if(!await evaluate(`Math.abs(window.studio.project.actors[0].yaw-(${before.yaw+5}))<.001 && Math.abs(window.studio.project.actors[0].y-(${before.y+.05}))<.001`))throw Error('Shift arrows did not rotate/elevate');
  await key('ArrowLeft',2);await key('ArrowDown',2);
  if(!await evaluate(`Math.abs(window.studio.project.actors[0].yaw-(${before.yaw}))<.001 && Math.abs(window.studio.project.actors[0].y-(${before.y}))<.001`))throw Error('Ctrl arrows did not rotate/elevate');
  const actorState=await evaluate<string>('JSON.stringify(window.studio.project.actors)');await evaluate("document.querySelector('#title').focus()");await key('ArrowLeft');
  if(await evaluate<string>('JSON.stringify(window.studio.project.actors)')!==actorState)throw Error('Text editing moved an actor');await evaluate("document.querySelector('#title').blur()");
  const r=await evaluate<{x:number;y:number}>('(()=>{const r=document.querySelector("#film").getBoundingClientRect();return{x:r.x+r.width*.92,y:r.y+r.height*.08}})()');
  await send('Input.dispatchMouseEvent',{type:'mousePressed',...r,button:'left',buttons:1,clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...r,button:'left',buttons:0,clickCount:1});await pause();
  if(!await evaluate("!window.studio.scene.selectionId && [...document.querySelectorAll('.cast-member')].every(b=>b.ariaPressed==='false') && document.querySelector('#actor-weapon').disabled"))throw Error('Background click did not deselect');
  const oldView=await evaluate<number>('window.studio.project.view.azimuth');await key('ArrowLeft');
  if(!await evaluate(`window.studio.project.view.azimuth>(${oldView})`)||await evaluate<string>('JSON.stringify(window.studio.project.actors)')!==actorState)throw Error('Unselected arrows did not orbit the scene');
  await evaluate("document.querySelectorAll('.cast-member')[1].click();document.querySelector('#film').focus()");await key('Escape');
  if(!await evaluate('!window.studio.scene.selectionId'))throw Error('Escape did not deselect');
  await upload(original);await ready();
 });
 await step('Cast arrangements work without a character selection and reflect placement, Undo and reload',async()=>{
  const original=await evaluate<string>('JSON.stringify(studio.project)');
  await evaluate(`(async()=>{const p=structuredClone(studio.project);p.template='portrait';p.camera='locked';p.shots=[{id:'all',shot:'wide',target:'all',duration:3}];p.texts=[];p.audio.speech=[];p.audio.effects=[];p.audio.music.track='none';for(const a of p.actors)a.beats=[{id:'idle',clip:'idle',duration:3,move:false}];window.__stagingBase=p;await studio.setProject(p);document.getElementById('deselect-actor').click();})()`);await ready();
  if(!await evaluate('!studio.scene.selectionId&&!document.getElementById("blocking").disabled&&document.getElementById("actor-x").disabled'))throw Error('Cast controls still require selecting an individual');
  const centre=await evaluate<{x:number;y:number}>('(()=>{const s=document.getElementById("blocking"),r=s.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()');
  if(!await evaluate(`document.elementFromPoint(${centre.x},${centre.y}).id==='blocking'`))throw Error('The character-selection guard still covers the cast menu');
  await send('Input.dispatchMouseEvent',{type:'mousePressed',...centre,button:'left',buttons:1,clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...centre,button:'left',buttons:0,clickCount:1});
  if(!await evaluate('document.activeElement.id==="blocking"'))throw Error('Cast dropdown cannot be focused by pointer');await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});
  for(const count of [2,5]){
   if(count===5){await evaluate(`(async()=>{const p=structuredClone(__stagingBase);for(let i=2;i<5;i++)p.actors.push({...structuredClone(p.actors[0]),id:'stage-'+i});await studio.setProject(p);})()`);await ready();}
   const meshes=await evaluate<string>('JSON.stringify([...studio.scene.actors].map(([id,a])=>[id,a.mesh.uuid]))');
   for(const kind of ['side','conversation','opposed']){
    await change('blocking',kind);await waitFor(`document.getElementById('blocking').value===${JSON.stringify(kind)}&&document.getElementById('notice').textContent.includes('applied to all ${count}')`,'applied cast arrangement');await pause(80);
    await waitFor('!studio.scene.selectionId&&studio.project.actors.every(a=>{const group=studio.scene.actors.get(a.id).group;return Math.abs(group.position.x-a.x)<.001&&Math.abs(group.position.z-a.z)<.001&&Math.abs(group.rotation.y-a.yaw*Math.PI/180)<.001})',`visible ${count}-character ${kind} arrangement`,15000);
    if(await evaluate<string>('JSON.stringify([...studio.scene.actors].map(([id,a])=>[id,a.mesh.uuid]))')!==meshes)throw Error('Arrangement unnecessarily rebuilt the cast');
   }
  }
  await shot('cast-staging-unselected');const arranged=await evaluate<string>('JSON.stringify(studio.project)');await evaluate('document.querySelector(".cast-member").click()');await change('actor-x','2.3');if(!await evaluate('document.getElementById("blocking").value===""'))throw Error('Menu displays a stale arrangement after manual placement');await evaluate('document.getElementById("undo").click()');await ready();if(await evaluate<string>('JSON.stringify(studio.project)')!==arranged||!await evaluate('document.getElementById("blocking").value==="opposed"'))throw Error('Undo did not restore arrangement/menu');
  await evaluate('document.getElementById("deselect-actor").click();window.dispatchEvent(new Event("pagehide"))');const previous=await evaluate<number>('performance.timeOrigin');await send('Page.reload');await waitFor(`performance.timeOrigin!==${previous}&&window.studio?.ready`,'reloaded staged cast');if(!await evaluate('document.getElementById("blocking").value==="opposed"&&!document.getElementById("blocking").disabled&&!studio.scene.selectionId'))throw Error('Reload lost the layout or selection-independent controls');
  await evaluate('(async()=>{const p=structuredClone(studio.project);p.actors=p.actors.slice(0,1);await studio.setProject(p)})()');await ready();if(!await evaluate('document.getElementById("blocking").disabled&&document.getElementById("blocking-hint").textContent.includes("Add another character")'))throw Error('One-character cast has no useful explanation');
  await upload(original);await ready();await evaluate('document.querySelector(".cast-member").click()');
 });
 await step('Desktop controls, equipment and timeline fit the viewport together',async()=>{
  await evaluate("document.querySelectorAll('.cast-member')[0].click()");
  for(const [width,height]of [[1366,768],[1280,720]]){
   await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await pause(300);
   const clipped=await evaluate<string[]>(`(()=>{const ids=['open-text','open-assist','load-project','save-project','open-export','title','scene-search','scene-category','character','actor-weapon','actor-carry','timeline-selection','action','beat-duration','actor-x','actor-y','actor-z','actor-yaw','blocking','camera','landscape','portrait','caption','scrub','play'];return ids.filter(id=>{const r=document.getElementById(id).getBoundingClientRect();return r.width<=0||r.height<=0||r.top<0||r.bottom>innerHeight||r.left<0||r.right>innerWidth})})()`);
   if(clipped.length)throw Error(`${width}×${height} clipped: ${clipped.join(', ')}`);await shot(`compact-${width}`);
  }
  await send('Emulation.setDeviceMetricsOverride',{width:1500,height:1100,deviceScaleFactor:1,mobile:false});await pause();
 });
 await step('Actors can be picked and dragged while placement settings remain usable',async()=>{
  const original=await evaluate<string>('JSON.stringify(window.studio.project)');
  await evaluate("document.querySelectorAll('.cast-member')[0].click()");await change('action','walk');
  await evaluate("(()=>{const e=document.querySelector('#movement');e.checked=true;e.dispatchEvent(new Event('change'))})()");await evaluate('window.studio.seek(1.2)');await pause();
  const actorPoint=()=>evaluate<{x:number;y:number}>(`(()=>{const s=window.studio.scene,a=s.actors.get(window.studio.project.actors[0].id),b=a.mesh.skeleton.bones.find(b=>b.name==='Spine2'),p=a.group.position.clone();if(b)p.setFromMatrixPosition(b.matrixWorld);else p.y+=a.height*.65;p.project(s.camera);const r=s.canvas.getBoundingClientRect();return{x:r.x+(p.x+1)*r.width/2,y:r.y+(1-p.y)*r.height/2}})()`);
  let point=await actorPoint();await evaluate("document.querySelectorAll('.cast-member')[1].click()");
  await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',buttons:0,clickCount:1});await pause();
  if(!await evaluate("document.querySelectorAll('.cast-member')[0].ariaPressed==='true' && window.studio.scene.selectionId===window.studio.project.actors[0].id"))throw Error('Character click did not select its controls');
  const initial=await evaluate<{x:number;z:number;other:string;view:string}>('({x:window.studio.project.actors[0].x,z:window.studio.project.actors[0].z,other:JSON.stringify(window.studio.project.actors[1]),view:JSON.stringify(window.studio.project.view)})');
  point=await actorPoint();await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+65,y:point.y+15,button:'left',buttons:1});
  if(!await evaluate("window.studio.scene.freezeCamera && document.querySelector('#open-export').disabled"))throw Error('Placement camera or controls did not hold still');
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+65,y:point.y+15,button:'left',buttons:0,clickCount:1});await pause();
  const moved=await evaluate<{x:number;z:number;other:string;view:string;travel:boolean}>('({x:window.studio.project.actors[0].x,z:window.studio.project.actors[0].z,other:JSON.stringify(window.studio.project.actors[1]),view:JSON.stringify(window.studio.project.view),travel:window.studio.project.actors[0].beats[0].move})');
  if(Math.hypot(moved.x-initial.x,moved.z-initial.z)<.1||Math.hypot(moved.x-initial.x,moved.z-initial.z)>2.5||moved.other!==initial.other||moved.view!==initial.view||!moved.travel)throw Error('Dragging moved the wrong state');await shot('selected-character');
  await evaluate("document.querySelector('#undo').click()");if(!await evaluate(`Math.abs(window.studio.project.actors[0].x-(${initial.x}))<.001 && Math.abs(window.studio.project.actors[0].z-(${initial.z}))<.001 && window.studio.project.actors[0].beats[0].move`))throw Error('Drag undo lost the travel setting');
  await pause();point=await actorPoint();
  await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1,modifiers:1});await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+55,y:point.y,button:'left',buttons:1,modifiers:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+55,y:point.y,button:'left',buttons:0,clickCount:1,modifiers:1});
  if(!await evaluate(`window.studio.project.view.azimuth< -5 && Math.abs(window.studio.project.actors[0].x-(${initial.x}))<.001`))throw Error('Alt-drag did not orbit over the character');await evaluate("document.querySelector('#view-reset').click()");
  await pause();point=await actorPoint();await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+45,y:point.y-10,button:'left',buttons:1});await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+45,y:point.y-10,button:'left',buttons:0,clickCount:1});
  if(!await evaluate(`Math.abs(window.studio.project.actors[0].x-(${initial.x}))<.001 && Math.abs(window.studio.project.actors[0].z-(${initial.z}))<.001 && !window.studio.scene.freezeCamera`))throw Error('Escape did not cancel placement');
  await pause();
  const target=await evaluate<{x:number;y:number;worldX:number;worldZ:number}>(`(()=>{const s=window.studio.scene,a=s.actor,p=a.group.position.clone();p.x-=.85;p.z+=.6;const worldX=p.x,worldZ=p.z;p.project(s.camera);const r=s.canvas.getBoundingClientRect();return{x:r.x+(p.x+1)*r.width/2,y:r.y+(1-p.y)*r.height/2,worldX,worldZ}})()`);
  await evaluate("document.querySelector('#place-actor').click()");await send('Input.dispatchMouseEvent',{type:'mousePressed',x:target.x,y:target.y,button:'left',buttons:1,clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:target.x,y:target.y,button:'left',buttons:0,clickCount:1});await pause();
  if(!await evaluate(`Math.abs(window.studio.scene.actor.group.position.x-(${target.worldX}))<.025 && Math.abs(window.studio.scene.actor.group.position.z-(${target.worldZ}))<.025`))throw Error('Click placement did not put the actor at the ground point: '+JSON.stringify({target,actual:await evaluate('({selected:window.studio.scene.selectionId,actors:window.studio.project.actors.map(a=>({id:a.id,x:a.x,z:a.z})),world:window.studio.scene.actor.group.position.toArray(),mode:document.querySelector("#place-actor").ariaPressed})')}));
  await evaluate("document.querySelector('#place-actor').click()");await change('actor-x','0.4');if(!await evaluate('window.studio.project.actors[0].x===0.4'))throw Error('Numeric placement stopped working');
  await upload(original);await ready();await evaluate('window.studio.seek(1.5)');await pause();
 });
 await step('Selection marks stay out of the film output and saved frame',async()=>{
  const data=await evaluate<{clean:string;selected:string;preview:string}>(`(()=>{const s=window.studio.scene,p=window.studio.project;s.selectionId=undefined;s.render(p,1.5);const clean=s.output.toDataURL();s.selectionId=p.actors[0].id;s.render(p,1.5);return{clean,selected:s.output.toDataURL(),preview:s.canvas.toDataURL()}})()`);
  const buffers=await Promise.all([data.clean,data.selected,data.preview].map(url=>sharp(Buffer.from(url.split(',')[1],'base64')).raw().toBuffer()));let filmDiff=0,markerDiff=0;
  for(let i=0;i<buffers[0].length;i++){filmDiff+=Math.abs(buffers[0][i]-buffers[1][i]);if(Math.abs(buffers[1][i]-buffers[2][i])>10)markerDiff++;}
  if(filmDiff/buffers[0].length>.005||markerDiff<100)throw Error(`Selection overlay is missing or embedded in output: ${filmDiff}, ${markerDiff}`);
  writeFileSync(`${folder}/selection-preview.png`,Buffer.from(data.preview.split(',')[1],'base64'));writeFileSync(`${folder}/selection-clean-frame.png`,Buffer.from(data.selected.split(',')[1],'base64'));
 });
 await step('Two-character framing and controls fit a narrow screen',async()=>{
  await evaluate("document.querySelector('#portrait').click();window.studio.seek(1)");await pause();
  if(!await evaluate(`(()=>{const s=window.studio.scene;return[...s.actors.values()].every(a=>[0,a.height].every(y=>{const p=a.group.position.clone();p.y+=y;p.project(s.camera);return Math.abs(p.x)<1&&Math.abs(p.y)<1}))})()`))throw Error('Cast clipped by portrait framing');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await pause();if(!await evaluate('document.documentElement.scrollWidth<=innerWidth'))throw Error('Mobile overflow');await shot('mobile');
  await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
  const touch=await evaluate<{x:number;y:number}>('(()=>{const r=document.querySelector("#film").getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()');
  const oldZoom=await evaluate<number>('window.studio.project.view.zoom');
  const positions=await evaluate<string>('JSON.stringify(window.studio.project.actors.map(a=>[a.x,a.y,a.z]))');
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touch.x-25,y:touch.y,id:1},{x:touch.x+25,y:touch.y,id:2}]});
  await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touch.x-50,y:touch.y,id:1},{x:touch.x+50,y:touch.y,id:2}]});
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await pause();
  if(await evaluate<number>('window.studio.project.view.zoom')>=oldZoom)throw Error('Touch pinch did not zoom');
  if(await evaluate<string>('JSON.stringify(window.studio.project.actors.map(a=>[a.x,a.y,a.z]))')!==positions)throw Error('Pinch moved a character');
  if(!await evaluate("document.querySelector('header #title').getBoundingClientRect().width>0"))throw Error('Mobile title is hidden');
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
 await step('Custom character specifications build in Studio through paste and Open, then survive reload and Undo',async()=>{
  const original=await evaluate<string>('JSON.stringify(window.studio.project)'),payload=JSON.parse(original);
  payload.actors[0].character={kind:'ara-character',version:1,preset:'The Female Executive',params:{name:'Ife',ageYears:41,hair:'cornrows',hairColor:'#241a13',expression:'happy',rig:'game_lite',restPose:'T'}};
  payload.actors[1].params={name:'Kofi',gender:1,ageYears:33,hair:'buzz',facialHair:'short_beard',outfit:'set_suit_tie',shoes:'oxfords',carry:'briefcase',height:.62,breastSize:0,garmentStyles:{set_suit_tie:{pattern:'suiting',color:'#26364b',color2:'#354760'}}};
  await evaluate("document.querySelector('#open-assist').click()");const bad=structuredClone(payload);bad.actors[0].character.params.hair='made-up-style';await search('assist-json',JSON.stringify(bad));
  if(!await evaluate("document.querySelector('#assist-create').disabled && document.querySelector('#assist-status').textContent.includes('Character 1:')"))throw Error('Invalid custom appearance was not rejected');
  if(await evaluate<string>('JSON.stringify(window.studio.project)')!==original)throw Error('Custom validation changed the existing film');
  await search('assist-json',JSON.stringify(payload));if(!await evaluate("!document.querySelector('#assist-create').disabled && document.querySelector('#assist-status').textContent.includes('Ife')"))throw Error('Inline character specifications were not accepted');
  await evaluate("document.querySelector('#assist-create').click()");await ready();await waitFor("!document.querySelector('#assist-dialog').open",'custom character film');
  const actual=await evaluate<any>("(()=>{const p=window.studio.project,s=window.studio.scene;return{actors:p.actors.map(a=>s.actors.get(a.id).character.params),beats:p.actors.map(a=>a.beats),shots:p.shots,finite:[...s.actors.values()].every(a=>a.mesh.skeleton.bones.every(b=>b.quaternion.toArray().every(Number.isFinite)))}})()");
  if(actual.actors[0].name!=='Ife'||actual.actors[0].hair!=='cornrows'||actual.actors[0].rig!=='game_lite'||actual.actors[0].restPose!=='T'||actual.actors[0].outfit!=='set_pantsuit'||actual.actors[1].name!=='Kofi'||actual.actors[1].gender!==1||actual.actors[1].facialHair!=='short_beard'||actual.actors[1].carry!=='briefcase'||!actual.finite)throw Error('Custom characters were not built from their inherited parameters');
  if(JSON.stringify(actual.beats)!==JSON.stringify(payload.actors.map((a:any)=>a.beats))||JSON.stringify(actual.shots)!==JSON.stringify(payload.shots))throw Error('Character specifications changed the scene direction');
  await evaluate('window.studio.seek(1.5)');await pause();await shot('custom-character-json-cast');await evaluate("document.querySelector('#undo').click()");await ready();
  if(await evaluate<string>('JSON.stringify(window.studio.project)')!==original)throw Error('Custom film import was not one Undo edit');
  await upload(JSON.stringify(payload));await ready();const saved=await evaluate<string>('JSON.stringify(window.studio.project)');await evaluate('window.__customReload=true');await send('Page.reload');await waitFor('!window.__customReload && window.studio?.ready','custom character recovery');
  if(await evaluate<string>('JSON.stringify(window.studio.project)')!==saved||!await evaluate("[...window.studio.scene.actors.values()].map(a=>a.character.params.name).join(',')==='Ife,Kofi'"))throw Error('Custom appearances were lost after Open/reload');
  await evaluate("document.querySelector('#open-assist').click();(()=>{const e=document.querySelector('#assist-context');e.checked=true;e.dispatchEvent(new Event('change'))})()");
  if(!await evaluate("document.querySelector('#assist-guide').value.includes('CHARACTER CREATION REFERENCE') && document.querySelector('#assist-guide').value.includes('GARMENTS AND ALLOWED PATTERNS') && document.querySelector('#assist-guide').value.includes('\"name\": \"Ife\"') && !document.querySelector('#assist-guide').value.includes(window.studio.project.actors[0].character)"))throw Error('Current film guide did not expose editable character parameters');
  await evaluate("document.querySelector('#assist-close').click();document.querySelector('#undo').click()");await ready();if(await evaluate<string>('JSON.stringify(window.studio.project)')!==original)throw Error('Reload lost Undo for the custom film');
 });
 await step('LLM Assist exports a live guide and validates pasted projects before building',async()=>{
  const original=await evaluate<string>('JSON.stringify(window.studio.project)');
  await evaluate("document.querySelector('#open-assist').click()");
  if(await evaluate('!!document.querySelector("#assist-dialog .ai-starters,#assist-dialog .ai-chip")'))throw Error('Studio Assist still has idea pills');
  await search('assist-brief','Two colleagues meet at the resort pool.');
  await evaluate("(()=>{const e=document.querySelector('#assist-context');e.checked=true;e.dispatchEvent(new Event('change'))})()");
  if(!await evaluate("document.querySelector('#assist-guide').value.includes('Two colleagues meet at the resort pool.') && document.querySelector('#assist-guide').value.includes('CURRENT FILM —') && document.querySelector('#assist-guide').value.includes('JSON SCHEMA') && document.querySelector('#assist-guide').value.includes('pick_up')"))throw Error('LLM guide missing brief, schema or live capabilities');
  await evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copiedGuide=text}}});document.querySelector('#assist-copy').click()");
  await waitFor("window.__copiedGuide===document.querySelector('#assist-guide').value && document.querySelector('#assist-copy-status').textContent.includes('Guide copied')",'copied LLM guide');
  await evaluate('delete navigator.clipboard');
  const guideFile=join(process.cwd(),folder,'ara-studio-llm-guide.txt');if(existsSync(guideFile))rmSync(guideFile);
  await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:join(process.cwd(),folder)},false);
  await evaluate("document.querySelector('#assist-download').click()");
  for(let i=0;i<30&&!existsSync(guideFile);i++)await pause(100);
  if(!existsSync(guideFile)||!readFileSync(guideFile,'utf8').includes('Two colleagues meet at the resort pool.'))throw Error('Guide text file did not download');
  await search('assist-json','{"kind":"ara-studio",broken}');
  if(!await evaluate("document.querySelector('#assist-create').disabled && document.querySelector('#assist-json').getAttribute('aria-invalid')==='true'"))throw Error('Invalid pasted JSON was accepted');
  if(await evaluate<string>('JSON.stringify(window.studio.project)')!==original)throw Error('Validation changed the film');
  await evaluate("document.querySelector('#assist-example').click()");
  await waitFor("!document.querySelector('#assist-create').disabled && document.querySelector('#assist-speech-status').textContent.includes('voices are ready')",'bundled example voices');
  if(!await evaluate("JSON.parse(document.querySelector('#assist-json').value).audio.speech.length===8 && document.querySelector('#assist-brief').placeholder.includes('Agents of Mild Competence') && performance.getEntriesByType('resource').some(r=>r.name.includes('warehouse.ara-studio.zip')) && !performance.getEntriesByType('resource').some(r=>r.name.includes('tts-worker')||r.name.includes('.onnx'))"))throw Error('Example lost dialogue, placeholder or downloaded the speech model');
  if(await evaluate<string>('JSON.stringify(window.studio.project)')!==original)throw Error('Trying an example replaced the film before Build');
  if(!await evaluate("!document.querySelector('#assist-create').disabled && document.querySelector('#assist-status').textContent.includes('Warehouse')"))throw Error('Example did not validate');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await pause();
  if(!await evaluate("document.querySelector('#assist-dialog').scrollWidth<=document.querySelector('#assist-dialog').clientWidth && document.documentElement.scrollWidth<=innerWidth"))throw Error('LLM dialog overflows mobile');
  await shot('llm-assist-mobile');await send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});await pause();await shot('llm-assist');
  await evaluate("document.querySelector('#assist-create').click()");await ready();await waitFor("!document.querySelector('#assist-dialog').open",'assisted film');
  if(!await evaluate("window.studio.project.template==='warehouse' && window.studio.project.actors.length===5 && window.studio.project.audio.effects.length===11 && window.studio.project.actors[0].beats[0].clip==='walk'"))throw Error('Pasted project did not create its scene, actors, equipment and actions');
  await evaluate("document.querySelector('#play').click()");await waitFor('studio.audio.playback.active','warehouse example soundtrack');await evaluate("document.querySelector('#play').click()");
  await shot('llm-assisted-film');await evaluate("document.querySelector('#undo').click()");await ready();
  if(await evaluate<string>('JSON.stringify(window.studio.project)')!==original)throw Error('Undo did not restore the film replaced by LLM Assist');
  await send('Emulation.setDeviceMetricsOverride',{width:1500,height:1100,deviceScaleFactor:1,mobile:false});
 });
 await step('LLM-friendly JSON files open both in Assist and in the ordinary project importer',async()=>{
  const original=await evaluate<string>('JSON.stringify(window.studio.project)');
  await evaluate("document.querySelector('#open-assist').click();(()=>{document.querySelector('#assist-example').click();const e=document.querySelector('#assist-json'),p=JSON.parse(e.value);p.audio.speech=[];e.value=JSON.stringify(p);e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  const fileJSON=await evaluate<string>("(()=>{const p=JSON.parse(document.querySelector('#assist-json').value);p.template='beach';p.title='An assisted beach film';return JSON.stringify(p)})()");
  await evaluate(`(()=>{const dt=new DataTransfer();dt.items.add(new File([${JSON.stringify(fileJSON)}],'llm-film.json',{type:'application/json'}));const e=document.querySelector('#assist-file');e.files=dt.files;e.dispatchEvent(new Event('change'));})()`);
  await waitFor("document.querySelector('#assist-json').value.includes('An assisted beach film') && !document.querySelector('#assist-create').disabled",'assisted file validation');
  await evaluate("document.querySelector('#assist-create').click()");await ready();await waitFor("!document.querySelector('#assist-dialog').open",'assisted file build');
  if(!await evaluate("window.studio.project.template==='beach' && window.studio.project.title==='An assisted beach film'"))throw Error('Assisted JSON file did not load');
  await upload(original);await ready();await upload(fileJSON);await ready();
  if(!await evaluate("window.studio.project.template==='beach' && window.studio.project.actors.length===5"))throw Error('Ordinary Open did not accept the LLM JSON');
  await upload(original);await ready();
 });
 await step('Reload restores selection, playhead, filters, Undo and unfinished LLM Assist drafts',async()=>{
  const original=await evaluate<string>('JSON.stringify(window.studio.project)');
  const actorId=await evaluate<string>('window.studio.project.actors[1].id');
  await change('timeline-selection',`${actorId}:1`);
  const beforeEdit=await evaluate<string>('JSON.stringify(window.studio.project)');await change('actor-x','2.2');
  await search('scene-search','bedroom');await change('scene-category','Homes');await search('animation-search','talk');await change('animation-category','Emotes');
  await search('scrub','4.25');await evaluate("if(document.querySelector('#repeat').ariaPressed==='true')document.querySelector('#repeat').click();document.querySelector('#place-actor').click()");
  await change('resolution','720');await evaluate("document.querySelector('#open-assist').click()");await search('assist-brief','Keep this unfinished film idea');await search('assist-json','{"kind":"ara-studio",');
  await evaluate("const c=document.querySelector('#assist-context');c.checked=true;c.dispatchEvent(new Event('change'));document.querySelector('#assist-guide-details').open=true;window.__reloadingEditor=true");
  const edited=await evaluate<string>('JSON.stringify(window.studio.project)');const playhead=await evaluate<number>("Number(document.querySelector('#scrub').value)");
  await send('Page.reload');await waitFor('!window.__reloadingEditor && window.studio?.ready','recovered editor',120000);
  if(await evaluate<string>('JSON.stringify(window.studio.project)')!==edited)throw Error('Reload changed the edited film');
  const restored=await evaluate<boolean>(`document.querySelector('#timeline-selection').value===${JSON.stringify(actorId+':1')} && Math.abs(Number(document.querySelector('#scrub').value)-(${playhead}))<.001 && document.querySelector('#repeat').ariaPressed==='false' && document.querySelector('#place-actor').ariaPressed==='true' && document.querySelector('#scene-search').value==='bedroom' && document.querySelector('#scene-category').value==='Homes' && document.querySelector('#animation-search').value==='talk' && document.querySelector('#animation-category').value==='Emotes' && document.querySelector('#resolution').value==='720' && !document.querySelector('#undo').disabled && document.querySelector('#assist-dialog').open && document.querySelector('#assist-brief').value==='Keep this unfinished film idea' && document.querySelector('#assist-json').value==='{"kind":"ara-studio",' && document.querySelector('#assist-context').checked && document.querySelector('#assist-create').disabled && document.querySelector('#assist-guide-details').open`);
  if(!restored)throw Error('Editor session state was not fully recovered: '+await evaluate("JSON.stringify({editor:JSON.parse(localStorage.getItem('ara.studio.editor.v1')).editor,selection:document.querySelector('#timeline-selection').value,playhead:document.querySelector('#scrub').value,placement:document.querySelector('#place-actor').ariaPressed})"));
  await shot('recovered-llm-draft');await evaluate("document.querySelector('#assist-close').click();document.querySelector('#undo').click()");await ready();
  if(await evaluate<string>('JSON.stringify(window.studio.project)')!==beforeEdit)throw Error('Recovered Undo did not restore the last edit');
  await search('scene-search','');await change('scene-category','');await search('animation-search','');await change('animation-category','');
  await evaluate("if(document.querySelector('#place-actor').ariaPressed==='true')document.querySelector('#place-actor').click();if(document.querySelector('#repeat').ariaPressed==='false')document.querySelector('#repeat').click();document.querySelector('#deselect-actor').click();window.__reloadingEditor=true");
  await send('Page.reload');await waitFor('!window.__reloadingEditor && window.studio?.ready','unselected editor',120000);
  if(!await evaluate('!window.studio.scene.selectionId'))throw Error('Reload silently selected an unselected character');
  await upload(original);await ready();
 });
 await step('Reload after a builder character link preserves subsequent film edits',async()=>{
  const original=await evaluate<string>('JSON.stringify(window.studio.project)');const code=await evaluate<string>('window.studio.project.actors[0].character');
  await evaluate('window.__incomingLink=true');await send('Page.navigate',{url:'http://localhost:4422/studio/?review=character-link#'+new URLSearchParams({c:code,detail:'medium',demo:''})});
  await waitFor("!window.__incomingLink && window.studio?.ready && !new URLSearchParams(location.hash.slice(1)).has('c')",'consumed character link',120000);
  await evaluate("document.querySelector('[data-set=office]').click();document.querySelector('#add-actor').click()");await ready();
  await search('title','Keep edits after opening a character link');await change('actor-x','1.75');await change('actor-carry','briefcase');await ready();await change('camera','orbit');
  const edited=await evaluate<string>('JSON.stringify(window.studio.project)');await evaluate('window.__incomingLink=true');await send('Page.reload');
  await waitFor('!window.__incomingLink && window.studio?.ready','edited imported film',120000);
  if(await evaluate<string>('JSON.stringify(window.studio.project)')!==edited||!await evaluate("window.studio.project.actors.length===2 && window.studio.project.template==='office'"))throw Error('Reload replayed the character import and erased edits');
  const {identifier}=await send<{identifier:string}>('Page.addScriptToEvaluateOnNewDocument',{source:"localStorage.setItem('ara.studio.editor.v1','{damaged')"});
  await evaluate('window.__incomingLink=true');await send('Page.reload');await waitFor('!window.__incomingLink && window.studio?.ready','fallback recovery',120000);await send('Page.removeScriptToEvaluateOnNewDocument',{identifier});
  if(await evaluate<string>('JSON.stringify(window.studio.project)')!==edited)throw Error('A damaged editor snapshot prevented film recovery');
  await send('Page.addScriptToEvaluateOnNewDocument',{source:"localStorage.removeItem('ara.studio.editor.v1')"}).then(async({identifier})=>{
   await evaluate(`location.hash=${JSON.stringify(new URLSearchParams({c:code,detail:'medium',demo:''}).toString())};window.__legacyReload=true`);await send('Page.reload');await waitFor('!window.__legacyReload && window.studio?.ready','legacy character-link recovery',120000);await send('Page.removeScriptToEvaluateOnNewDocument',{identifier});
  });
  if(await evaluate<string>('JSON.stringify(window.studio.project)')!==edited)throw Error('Reloading a pre-existing character URL lost the saved film');
  await upload(original);await ready();
 });
 await step('Text editor creates timed subtitles and comic bubbles, imports SRT and recovers on reload',async()=>{
  const original=await evaluate<string>('JSON.stringify(window.studio.project)');await evaluate("document.querySelectorAll('.cast-member')[1].click();window.studio.seek(0);document.querySelector('#open-text').click();document.querySelector('#text-add-bubble').click()");
  await search('text-body','Hello from Ara!');await change('text-style','thought');await change('text-size','32');await change('text-x','5');
  if(!await evaluate("window.studio.project.texts.length===1 && window.studio.project.texts[0].style==='thought' && window.studio.project.texts[0].anchor===window.studio.project.actors[1].id && window.studio.project.texts[0].x===.05"))throw Error('Comic text editing/attachment failed');
  await evaluate("document.querySelector('#text-preview').click()");await pause();await shot('comic-thought');
  await evaluate("document.querySelector('#open-text').click();document.querySelector('#text-add-subtitle').click()");await search('text-body','An unexpected meeting.');await change('text-start','1');await change('text-duration','2');
  const srt='1\n00:00:03,000 --> 00:00:04,500\nImported subtitles.\n\n2\n00:00:04,500 --> 00:00:06,000\nA second caption.';
  await evaluate(`(()=>{const dt=new DataTransfer();dt.items.add(new File([${JSON.stringify(srt)}],'captions.srt',{type:'text/plain'}));const e=document.querySelector('#text-srt-file');e.files=dt.files;e.dispatchEvent(new Event('change'));})()`);
  await waitFor('window.studio.project.texts.length===4','SRT import');await search('text-body','Keep this subtitle after reload');await evaluate('window.__textReload=true');await send('Page.reload');await waitFor('!window.__textReload && window.studio?.ready','text recovery');
  if(!await evaluate("document.querySelector('#text-dialog').open && document.querySelector('#text-body').value==='Keep this subtitle after reload' && window.studio.project.texts.length===4"))throw Error('Text edit state was not recovered');
  await shot('text-editor');await evaluate("document.querySelector('#close-text').click();document.querySelectorAll('.cast-member')[1].click();document.querySelector('#remove-actor').click()");await ready();
  if(!await evaluate("window.studio.project.actors.length===1 && window.studio.project.texts.length===3 && window.studio.project.texts.every(c=>c.anchor==='screen')"))throw Error('Deleting an actor left invalid attached text');
  await evaluate("document.querySelector('#undo').click()");await ready();if(!await evaluate('window.studio.project.texts.length===4 && window.studio.project.actors.length===2'))throw Error('Undo lost actor-attached text');
  await upload(original);await ready();
 });
 await step('Text wraps, follows animated characters, respects timing and renders every comic style',async()=>{
  const original=await evaluate<string>('JSON.stringify(window.studio.project)');
  const frames=await evaluate<Record<string,string>>(`(()=>{const s=window.studio.scene,p=structuredClone(window.studio.project),frames={};p.caption=false;p.camera='locked';p.shots=[{id:'all',duration:6,shot:'wide',target:'all'}];p.actors[0].beats=[{id:'walk',clip:'walk',duration:6,move:true}];
    p.texts=[{id:'bubble',text:'Hello, world!\\nA story begins.',start:0,duration:5,style:'speech',anchor:p.actors[0].id,x:0,y:-.12,size:28,color:'#141414',background:'#ffffff'}];
    s.resize(1280,720);s.render(p,.5);s.freezeCamera=true;s.render(p,.5);const first=s.textLayouts[0]?.anchor;s.render(p,2);const second=s.textLayouts[0]?.anchor;s.freezeCamera=false;
    if(!first||!second||Math.hypot(first.x-second.x,first.y-second.y)<.005)throw Error('Bubble did not follow the animated head');
    for(const style of ['subtitle','text','speech','thought','shout']){p.texts[0].style=style;p.texts[0].background=style==='shout'?'#ffe584':style==='subtitle'?'#151820':'#ffffff';p.texts[0].color=style==='subtitle'||style==='text'?'#ffffff':'#141414';p.texts[0].anchor=style==='subtitle'?'screen':p.actors[0].id;p.texts[0].x=style==='subtitle'?.5:0;p.texts[0].y=style==='subtitle'?.9:-.12;s.render(p,1);const b=s.textLayouts[0];if(!b||b.x<0||b.y<0||b.x+b.width>1280||b.y+b.height>720)throw Error('Clipped '+style);frames[style]=s.output.toDataURL();}
    s.render(p,5);if(s.textLayouts.length)throw Error('Text remained after its end');p.texts[0].start=2;s.render(p,1);if(s.textLayouts.length)throw Error('Text appeared before its start');
    p.aspect='portrait';p.texts[0].start=0;p.texts[0].style='speech';p.texts[0].text='A longer comic bubble wraps clearly in a portrait film, too.';s.resize(1080,1920);s.render(p,1);const b=s.textLayouts[0];if(!b||b.x<0||b.y<0||b.x+b.width>1080||b.y+b.height>1920)throw Error('Portrait text clipped');frames.portrait=s.output.toDataURL();s.resize(1280,720);s.render(window.studio.project,0);return frames;})()`);
  for(const [style,url]of Object.entries(frames))writeFileSync(`${folder}/text-${style}.png`,Buffer.from(url.split(',')[1],'base64'));
  await upload(original);await ready();
 });
 await step('Two-character MP4 exports, decodes and keeps camera/actor timing',async()=>{
  const p=await evaluate<Record<string,any>>('structuredClone(window.studio.project)');p.title='A meeting by the pool';p.template='resort-pool';p.view={azimuth:0,elevation:0,zoom:1};p.camera='locked';p.aspect='landscape';
  p.actors[0].beats=[{id:'a',clip:'wave',duration:2,move:false},{id:'b',clip:'idle',duration:2,move:false}];p.actors[1].beats=[{id:'a',clip:'idle',duration:2,move:false},{id:'b',clip:'talk',duration:2,move:false}];
  p.shots=[{id:'a',duration:2,shot:'wide',target:'all'},{id:'b',duration:1,shot:'medium',target:p.actors[0].id},{id:'c',duration:1,shot:'medium',target:p.actors[1].id}];
  p.texts=[{id:'video-subtitle',text:'An Ara Studio film',style:'subtitle',anchor:'screen',start:0,duration:4,x:.5,y:.9,size:30,color:'#ffffff',background:'#151820'},{id:'video-bubble',text:'Welcome!',style:'speech',anchor:p.actors[0].id,start:0,duration:2,x:0,y:-.12,size:28,color:'#141414',background:'#ffffff'}];
  await upload(JSON.stringify(p));await ready();await evaluate('window.studio.seek(1)');await pause();await shot('pool-duet-editor');
  await evaluate("document.querySelector('#open-export').click()");await change('resolution','720');await waitFor("!document.querySelector('#start-export').disabled",'encoder',15000);await evaluate("document.querySelector('#start-export').click()");
  await waitFor("!document.querySelector('#download-film').hidden || (!document.querySelector('#start-export').hidden && document.querySelector('#export-message').textContent)",'two-character movie',360000);
  if(!await evaluate("!document.querySelector('#download-film').hidden"))throw Error(await evaluate<string>("document.querySelector('#export-message').textContent"));
  await waitFor("document.querySelector('#export-preview').readyState>=1",'video decode',20000);
  const metadata=await evaluate<{duration:number;width:number;height:number}>("(()=>{const v=document.querySelector('#export-preview');return{duration:v.duration,width:v.videoWidth,height:v.videoHeight}})()");
  if(Math.abs(metadata.duration-4)>0.04||metadata.width!==1280||metadata.height!==720)throw Error(JSON.stringify(metadata));
  const pictures=await evaluate<{withText:string;withoutText:string;decoded:string}>(`(async()=>{const s=window.studio.scene,p=window.studio.project;s.render(p,1);const withText=s.output.toDataURL();s.render({...p,texts:[]},1);const withoutText=s.output.toDataURL();s.render(p,1);const v=document.querySelector('#export-preview');await new Promise(resolve=>{v.onseeked=resolve;v.currentTime=1});const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d').drawImage(v,0,0);return{withText,withoutText,decoded:c.toDataURL()}})()`);
  const pixels=await Promise.all([pictures.withText,pictures.withoutText,pictures.decoded].map(url=>sharp(Buffer.from(url.split(',')[1],'base64')).removeAlpha().raw().toBuffer()));let withError=0,withoutError=0,count=0;
  for(let i=0;i<pixels[0].length;i++)if(Math.abs(pixels[0][i]-pixels[1][i])>40){withError+=Math.abs(pixels[0][i]-pixels[2][i]);withoutError+=Math.abs(pixels[1][i]-pixels[2][i]);count++;}
  if(count<1000||withError>withoutError*.55)throw Error('Decoded MP4 did not preserve the subtitles/comic text');
  const encoded=await evaluate<string>(`(async()=>{const bytes=new Uint8Array(await(await fetch(document.querySelector('#download-film').href)).arrayBuffer());let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s)})()`);writeFileSync(`${folder}/ara-studio-duet-720p.mp4`,Buffer.from(encoded,'base64'));await shot('export-ready');await evaluate("document.querySelector('#close-export').click()");
 });
 await step('Full HD portrait film includes both characters',async()=>{
  await evaluate('window.studio.seek(1)');await pause();
  const result=await evaluate<{encoded:string;width:number;height:number;duration:number}>(`(async()=>{const p=structuredClone(window.studio.project);p.aspect='portrait';for(const a of p.actors)a.beats=[{...a.beats[0],duration:1}];p.shots=[{...p.shots[0],duration:1,shot:'wide',target:'all'}];p.texts=p.texts.map(c=>({...c,start:0,duration:1}));
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
  await evaluate("document.querySelector('#character-assist-btn').click()");await waitFor("document.querySelector('#character-assist-dialog').open",'builder LLM Assist');
  await evaluate("(()=>{const e=document.querySelector('#ca-json');e.value=JSON.stringify({kind:'ara-character',version:1,params:{...window.ara.store.params,name:'Second actor, revised',height:.8,rig:'full',restPose:'T',detail:'high'}});e.dispatchEvent(new Event('input'));document.querySelector('#ca-create').click()})()");
  await waitFor("!document.querySelector('#character-assist-dialog').open && window.ara.store.current.params.name==='Second actor, revised'",'LLM character build',120000);
  await shot('character-llm-builder');await evaluate("document.querySelector('#studio-btn').click()");await waitFor("location.pathname==='/studio/' && document.querySelector('#project-name') && document.querySelector('#loading')?.hidden",'return to film',120000);
  const returned=await evaluate<string>("localStorage.getItem('ara.studio.project.v2')"),a=JSON.parse(before),b=JSON.parse(returned);
  if(b.actors.length!==2||b.actors[0].character!==a.actors[0].character||b.template!==a.template||b.title!==a.title||JSON.stringify(b.shots)!==JSON.stringify(a.shots)||JSON.stringify(b.actors[1].beats)!==JSON.stringify(a.actors[1].beats)||b.actors[1].character===a.actors[1].character)throw Error('Builder round trip changed another part of the film');
  if(b.actors[1].detail!=='high')throw Error('Character detail lost on return');await shot('mixed-rig-cast');
 });
 await checkStudioTour({enabled:tourOnly,step,evaluate,waitFor,ready,pause,shot,send});
 await checkFiveCast({enabled:castOnly,step,evaluate,waitFor,change,search,ready,pause,shot,send,folder});
 await checkStudioEffects({enabled:effectsOnly,step,evaluate,waitFor,change,search,ready,pause,shot,send,folder});
 await checkStudioAudio({enabled:audioOnly,step,evaluate,waitFor,change,search,ready,pause,shot,send,folder});
 if(errors.length)throw Error(errors.join('\n'));console.log('Studio expansion browser checks passed:',passed.length);
}catch(error){await shot('failure').catch(()=>{});console.log('Failure page:',await evaluate('({url:location.href,notice:document.querySelector("#notice")?.textContent,loading:document.querySelector("#loading-label")?.textContent,active:document.activeElement?.id})').catch(()=>null));if(errors.length)console.log('Browser errors:',errors);throw error;}finally{await cleanup()}
