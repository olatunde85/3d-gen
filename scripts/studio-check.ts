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
const folder='out/studio-review';mkdirSync(folder,{recursive:true});
const passed:string[]=[];
async function step(name:string,fn:()=>Promise<void>){await fn();passed.push(name);console.log('OK',name)}
const shot=async(name:string)=>{const {data}=await send<{data:string}>('Page.captureScreenshot',{format:'png'});writeFileSync(folder+'/'+name+'.png',Buffer.from(data,'base64'))};
try{
 const {targetId}=await send<{targetId:string}>('Target.createTarget',{url:'about:blank'},false);
 ({sessionId:session}=await send<{sessionId:string}>('Target.attachToTarget',{targetId,flatten:true},false));
 await send('Runtime.enable');await send('Page.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:1500,height:1050,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:'http://localhost:4422/studio/#demo'});
 await step('Studio loads a textured, rigged character',async()=>{
  await waitFor('window.studio?.ready','Studio character',120000);
  const info=await evaluate<{width:number;height:number;name:string}>(`({width:window.studio.scene.canvas.width,height:window.studio.scene.canvas.height,name:window.studio.scene.actor.character.params.name})`);
  if(info.width!==1280||info.height!==720||!info.name)throw Error(JSON.stringify(info));
 });
 await evaluate('window.studio.seek(1.5)');await new Promise(r=>setTimeout(r,300));await shot('portrait-editor');
 await step('Scrubbing reproduces the same pose and picture',async()=>{
  const state = 'JSON.stringify({bones:window.studio.scene.actor.mesh.skeleton.bones.map(b=>b.matrixWorld.elements),morph:window.studio.scene.actor.mesh.morphTargetInfluences,camera:window.studio.scene.camera.matrixWorld.elements})';
  await evaluate('window.studio.seek(1.5)');await new Promise(r=>setTimeout(r,200));
  const a=await evaluate<string>('window.studio.scene.render(window.studio.project,1.5);window.studio.scene.output.toDataURL()');
  const stateA=await evaluate<string>(state);
  await evaluate('window.studio.seek(7)');await new Promise(r=>setTimeout(r,200));
  await evaluate('window.studio.seek(1.5)');await new Promise(r=>setTimeout(r,200));
  const b=await evaluate<string>('window.studio.scene.render(window.studio.project,1.5);window.studio.scene.output.toDataURL()');
  if(stateA!==await evaluate<string>(state))throw Error('Revisiting a timestamp changed bones, face or camera');
  // Check evaluated state exactly; allow tightly bounded rasterization rounding in software GL.
  const [first,second]=await Promise.all([a,b].map(url=>sharp(Buffer.from(url.split(',')[1],'base64')).raw().toBuffer()));
  let changed=0,max=0,total=0;
  for(let i=0;i<first.length;i++){const d=Math.abs(first[i]-second[i]);if(d)changed++;max=Math.max(max,d);total+=d;}
  console.log('Repeat-render pixel difference:',{changed,max,mean:total/first.length});
  if(changed>first.length*0.0005||max>32||total/first.length>0.005)throw Error('Same timestamp rendered a visibly different picture');
 });
 await step('All three templates render',async()=>{
  for(const name of ['portrait','runway','courtyard']){
   await evaluate(`document.querySelector('[data-set="${name}"]').click();window.studio.seek(1.5)`);
   await new Promise(r=>setTimeout(r,400));
   const url=await evaluate<string>('window.studio.scene.output.toDataURL()');
   writeFileSync(folder+'/'+name+'-frame.png',Buffer.from(url.split(',')[1],'base64'));
   await shot(name+'-editor');
  }
 });
 await step('Shot editing and undo preserve the project',async()=>{
  const before=await evaluate<string>('JSON.stringify(window.studio.project)');
  await evaluate(`(()=>{const s=document.querySelector('#shot');s.value='close';s.dispatchEvent(new Event('change'));})()`);
  if(!await evaluate("window.studio.project.beats[0].shot === 'close'"))throw Error('Shot did not change');
  await evaluate("document.querySelector('#undo').click()");
  const after=await evaluate<string>('JSON.stringify(window.studio.project)');
  // Imported recipes normalise internal IDs; the editable scene must match.
  if(JSON.parse(before).beats[0].shot!==JSON.parse(after).beats[0].shot)throw Error('Undo failed');
  await evaluate("document.querySelector('#add-beat').click()");
  if(!await evaluate('window.studio.project.beats.length === 4'))throw Error('Add action failed');
  await evaluate("document.querySelector('#remove-beat').click()");
  if(!await evaluate('window.studio.project.beats.length === 3'))throw Error('Remove action failed');
  const title=await evaluate<string>('window.studio.project.title');
  await evaluate("(()=>{const i=document.querySelector('#title');i.focus();i.value='First title';i.dispatchEvent(new Event('input'));i.value='A revised title';i.dispatchEvent(new Event('input'));i.blur();document.querySelector('#undo').click()})()");
  if(await evaluate<string>('window.studio.project.title')!==title)throw Error('Title typing should undo in one step');
 });
 await step('Portrait layout and narrow mobile layout fit',async()=>{
  await evaluate("document.querySelector('#portrait').click()");await new Promise(r=>setTimeout(r,200));
  if(!await evaluate('window.studio.scene.output.height > window.studio.scene.output.width'))throw Error('Portrait render dimensions');
  await shot('vertical-editor');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await new Promise(r=>setTimeout(r,300));
  if(!await evaluate('document.documentElement.scrollWidth <= innerWidth && document.querySelector(".director").getBoundingClientRect().width >= innerWidth - 2'))throw Error('Mobile overflow');await shot('mobile-editor');
  await send('Emulation.setDeviceMetricsOverride',{width:1500,height:1050,deviceScaleFactor:1,mobile:false});
  await evaluate("document.querySelector('#landscape').click();document.querySelector('[data-set=portrait]').click()");
 });
 console.log('Encoder availability:',await evaluate('window.studio.supportsMp4(1280,720)'));
 await step('Actual MP4 exports, decodes and has the correct length',async()=>{
  await evaluate("document.querySelector('#open-export').click();const r=document.querySelector('#resolution');r.value='720';r.dispatchEvent(new Event('change'))");
  await waitFor("!document.querySelector('#start-export').disabled",'MP4 support',15000);
  await evaluate("document.querySelector('#start-export').click()");
  await waitFor("!document.querySelector('#download-film').hidden || (!document.querySelector('#start-export').hidden && document.querySelector('#export-message').textContent)",'MP4 generation',240000);
  const status=await evaluate<string>("document.querySelector('#export-message').textContent");console.log(status);
  if(!await evaluate("!document.querySelector('#download-film').hidden"))throw Error(status);
  await waitFor("document.querySelector('#export-preview').readyState >= 1",'video metadata',20000);
  const metadata=await evaluate<{duration:number;width:number;height:number}>("(()=>{const v=document.querySelector('#export-preview');return {duration:v.duration,width:v.videoWidth,height:v.videoHeight}})()");
  if(Math.abs(metadata.duration-9)>0.04||metadata.width!==1280||metadata.height!==720)throw Error(JSON.stringify(metadata));
  const encoded=await evaluate<string>(`(async()=>{const b=await(await fetch(document.querySelector('#download-film').href)).arrayBuffer();const bytes=new Uint8Array(b);let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s)})()`);
  writeFileSync(folder+'/ara-studio-portrait-720p.mp4',Buffer.from(encoded,'base64'));await shot('export-ready');
  await evaluate("document.querySelector('#close-export').click();document.querySelector('#open-export').click()");
  if(!await evaluate("!document.querySelector('#download-film').hidden"))throw Error('Closing the dialog lost access to the completed film');
  await evaluate("document.querySelector('#close-export').click()");
 });
 await step('Export cancellation restores the preview',async()=>{
  await evaluate("document.querySelector('#open-export').click(); if(!document.querySelector('#render-again').hidden)document.querySelector('#render-again').click()");await waitFor("!document.querySelector('#start-export').disabled",'encoder',10000);
  await evaluate("document.querySelector('#start-export').click()");await new Promise(r=>setTimeout(r,100));await evaluate("document.querySelector('#cancel-export').click()");
  await waitFor("document.querySelector('#export-message').textContent.includes('cancelled')",'cancellation',20000);
  if(!await evaluate('window.studio.scene.canvas.width === 1280 && window.studio.scene.canvas.height === 720'))throw Error('Preview dimensions not restored');
  await evaluate("document.querySelector('#close-export').click()");
 });
 await step('Full HD portrait MP4 encodes and plays',async()=>{
  await evaluate('window.studio.seek(0)');await new Promise(r=>setTimeout(r,200));
  const result=await evaluate<{encoded:string;width:number;height:number;duration:number}>(`(async()=>{
   const p=structuredClone(window.studio.project);p.aspect='portrait';p.beats=[{...p.beats[0],duration:1}];
   const blob=await window.studio.exportMovie(window.studio.scene,p,{width:1080,height:1920,signal:new AbortController().signal,progress:()=>{}});
   const video=document.createElement('video'),url=URL.createObjectURL(blob);video.src=url;await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=()=>reject(Error('Full HD film failed to decode'))});
   const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
   const result={encoded:btoa(binary),width:video.videoWidth,height:video.videoHeight,duration:video.duration};URL.revokeObjectURL(url);window.studio.seek(0);return result;
  })()`);
  if(result.width!==1080||result.height!==1920||Math.abs(result.duration-1)>0.04)throw Error('Incorrect Full HD movie '+JSON.stringify({...result,encoded:undefined}));
  writeFileSync(folder+'/ara-studio-portrait-1080p.mp4',Buffer.from(result.encoded,'base64'));
 });
 await step('Project files round-trip and reject invalid content safely',async()=>{
  const original=await evaluate<string>('JSON.stringify(window.studio.project)');
  await evaluate(`(()=>{window.__saved=null;const click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download?.endsWith('.json'))fetch(this.href).then(r=>r.text()).then(text=>window.__saved={name:this.download,text});else click.call(this)};document.querySelector('#save-project').click()})()`);
  await waitFor('!!window.__saved','saved project file',5000);
  const saved=await evaluate<{name:string;text:string}>('window.__saved');
  if(JSON.parse(saved.text).character!==JSON.parse(original).character)throw Error('Saved character changed');
  const imported={...JSON.parse(saved.text),title:'A restored story',camera:'orbit',aspect:'portrait'};
  const upload=async(text:string)=>evaluate(`(()=>{let dt=new DataTransfer();dt.items.add(new File([${JSON.stringify(text)}],'review.ara-studio.json',{type:'application/json'}));let i=document.querySelector('#project-file');i.files=dt.files;i.dispatchEvent(new Event('change'));})()`);
  await upload(JSON.stringify(imported));
  await waitFor("window.studio.project.title === 'A restored story'",'opened project',5000);
  if(!await evaluate("window.studio.project.aspect==='portrait' && window.studio.project.camera==='orbit'"))throw Error('Settings did not restore');
  const valid=await evaluate<string>('JSON.stringify(window.studio.project)');
  await upload('{broken json');await new Promise(r=>setTimeout(r,300));
  if(await evaluate<string>('JSON.stringify(window.studio.project)')!==valid)throw Error('Invalid file changed the scene');
  await evaluate('window.__beforeReload=true');
  await send('Page.reload');await waitFor('!window.__beforeReload && window.studio?.ready','restored project after reload',120000);
  if(!await evaluate("window.studio.project.title === 'A restored story' && window.studio.project.aspect === 'portrait'"))throw Error('Autosave did not restore');
  await shot('restored-project');
 });
 await step('Character builder hands its exact recipe and detail to Studio',async()=>{
  await send('Page.navigate',{url:'http://localhost:4422/app/#demo&preset=The%20Priest'});
  await waitFor("window.ara?.viewer.mesh && document.querySelector('#loading').hidden && document.querySelector('#stats').textContent",'builder character',120000);
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await new Promise(r=>setTimeout(r,200));
  if(!await evaluate("(()=>{const r=document.querySelector('#export').getBoundingClientRect();return r.left>=0 && r.right<=innerWidth})()"))throw Error('Builder toolbar overflows on mobile');
  await shot('builder-mobile');await send('Emulation.setDeviceMetricsOverride',{width:1500,height:1050,deviceScaleFactor:1,mobile:false});
  await evaluate("window.ara.store.set({detail:'high',rig:'full',restPose:'T',height:0.8,name:'Studio handoff review'})");
  const expected=await evaluate<string>('JSON.stringify(window.ara.store.params)');
  await evaluate("document.querySelector('#studio-btn').click()");
  // Navigation intentionally omits demo capabilities; reload with the same handoff and test flag.
  await waitFor("location.pathname === '/studio/' && document.querySelector('#loading')?.hidden",'handed over character',120000);
  const hash=await evaluate<string>('location.hash');
  await send('Page.navigate',{url:'http://localhost:4422/studio/?review=handoff'+hash+'&demo'});
  await waitFor('window.studio?.ready','handoff inspection',120000);
  const actual=await evaluate<string>('JSON.stringify(window.studio.scene.actor.character.params)');
  const a=JSON.parse(actual),b=JSON.parse(expected);for(const key of Object.keys(b)){if(key==='animations'||key==='rig'&&b.rig==='none')continue;if(JSON.stringify(a[key])!==JSON.stringify(b[key]))throw Error('Handoff changed '+key)}
  if(!await evaluate("window.studio.project.detail==='high' && window.studio.scene.actor.mesh.skeleton.bones.length>150"))throw Error('Full rig or high detail lost');
  await evaluate('window.studio.seek(1.5)');await new Promise(r=>setTimeout(r,200));await shot('builder-handoff');
  await evaluate('window.studio.seek(7.5)');await new Promise(r=>setTimeout(r,200));await shot('builder-handoff-close');
  await evaluate("document.querySelector('#edit-character').click()");
  await waitFor("location.pathname==='/app/' && document.querySelector('#loading')?.hidden && document.querySelector('#stats')?.textContent",'return to builder',120000);
  const returned=await evaluate<string>("localStorage.getItem('3dgen.human')");
  const back=JSON.parse(returned);for(const key of Object.keys(b))if(JSON.stringify(back[key])!==JSON.stringify(b[key]))throw Error('Returning to builder changed '+key);
 });
 if(errors.length)throw Error(errors.join('\n'));
 console.log('Studio browser checks passed:',passed.length);
}catch(error){await shot('failure').catch(()=>{});console.log('Failure page:',await evaluate('({url:location.href,body:document.body.innerText.slice(-2500)})').catch(()=>null));if(errors.length)console.log('Browser errors:',errors);throw error;}finally{await cleanup()}
