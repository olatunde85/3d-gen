import {checkMobileBuilder} from './mobile-builder-check';
const mobileOnly=process.argv.includes('--mobile');
const presetsOnly=process.argv.includes('--presets-only');
const singletReview=process.argv.includes('--singlet-review');
const shortsReview=process.argv.includes('--shorts-review');
const racerReview=process.argv.includes('--racer-review');
/**
 * UI smoke test: builds the app, opens it in headless Chrome and drives it through the main
 * flows (load, Quick build, slider, preset, animation browser, export panel, export), failing on
 * any page error. Catches UI wiring mistakes that the core tests can't see.
 *   npm run test:ui          (set CHROME=/path/to/chrome if not on macOS default)
 */
import {unzipSync} from 'fflate';
import sharp from 'sharp';
import {buildGownThumbnails} from './builder-gown-thumbnails';
const gownsOnly=process.argv.includes('--gowns');
import { spawn } from 'node:child_process';
import {mkdirSync,writeFileSync,existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import type { Readable, Writable } from 'node:stream';
import { build } from 'vite';

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
await new Promise<void>((r) => server.listen(4398, r));

// --- Chrome over the DevTools pipe (fds 3 and 4) ---------------------------------------------
const profile = mkdtempSync(join(tmpdir(), 'ui-check-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run',
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

// --- The checks -------------------------------------------------------------------------------
const results: [string, boolean, string?][] = [];
async function step(name: string, fn: () => Promise<void>) {
  if(mobileOnly&&!/loads and builds|^Mobile /.test(name))return;
  if(gownsOnly&&!/loads and builds|^Gown /.test(name))return;
  if(presetsOnly&&!/loads and builds|^Preset expansion/.test(name))return;
  // The preset review renders through the demo hooks, so it runs on its own (npm run test:ui:presets).
  if(!presetsOnly&&/^Preset expansion/.test(name))return;
  try {
    await fn();
    results.push([name, true]);
  } catch (e) {
    results.push([name, false, (e as Error).message]);
  }
  if(mobileOnly){const [,ok,error]=results.at(-1)!;console.log(`${ok?'PASS':'FAIL'} ${name}${error?`: ${error}`:''}`);}
}
/** Resolves after the next finished build (the stats line changes). */
const statsNow = () => evaluate<string>("document.querySelector('#stats').textContent");
const builtAfter = async (before: string, what: string) =>
  waitFor(`(() => { const s = document.querySelector('#stats').textContent; return !!s && s !== ${JSON.stringify(before)} && !document.querySelector('#status').classList.contains('show'); })()`, what);

try {
  const { targetId } = await send<{ targetId: string }>('Target.createTarget', { url: 'about:blank' }, false);
  ({ sessionId: session } = await send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true }, false));
  await send('Runtime.enable');
  await send('Page.enable');
  if(mobileOnly){await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await send('Emulation.setTouchEmulationEnabled',{enabled:true});}
  await send('Page.navigate', { url: 'http://localhost:4398/app/'+(gownsOnly||mobileOnly||presetsOnly?'#demo':'') });

  await step('loads and builds a character', async () => {
    await waitFor("document.querySelector('#loading')?.hidden === true && !!document.querySelector('#stats').textContent", 'the first character');
  });
  await step('Preset expansion renders in the builder', async () => {
    const names = process.env.PRESET_REVIEW_NAMES?.split(',') ?? ['The Resort Guest','The Lifeguard','The Paramedic','The Nurse','The Flight Attendant','The Airline Pilot','The Dispatch Rider','The Street Racer','The Police Officer (USA)','The MMA Fighter','The Mob Boss','The Clown','The Masked Robber'];
    mkdirSync('out/presets',{recursive:true});
    const tiles: { input: Buffer; left: number; top: number }[] = [];
    for (const [i,name] of names.entries()) {
      const before = await statsNow();
      await evaluate(`(() => { const s=document.querySelector('#preset');s.value=${JSON.stringify(name)};s.dispatchEvent(new Event('change')); })()`);
      await builtAfter(before,name);
      const {data} = await send<{data:string}>('Page.captureScreenshot',{format:'png'});
      const screenshot = Buffer.from(data,'base64');
      writeFileSync(`out/presets/${name.toLowerCase().replaceAll(/[^a-z0-9]+/g,'-')}.png`,screenshot);
      tiles.push({input:await sharp(screenshot).extract({left:430,top:80,width:900,height:720}).resize(450,360).png().toBuffer(),left:i%4*450,top:Math.floor(i/4)*360});
    }
    if(names.length>1)await sharp({create:{width:1800,height:1440,channels:3,background:'#eeeae1'}}).composite(tiles).png().toFile('out/presets/contact-sheet.png');
    if(singletReview){
      if(names.at(-1)!=='The Lifeguard'){
        const before=await statsNow();
        await evaluate("(() => { const s=document.querySelector('#preset');s.value='The Lifeguard';s.dispatchEvent(new Event('change')); })()");
        await builtAfter(before,'singlet close-up');
      }
      for(const [view,x,y,z] of [['front',.18,1.48,2.15],['back',.18,1.48,-2.15],['overhead',0,2.35,1.5],['side',1.8,1.8,1.2],['armholes',0,1.55,1.25]]as const){
        await evaluate(`(() => { const v=window.ara.viewer;v.controls.target.set(0,1.36,0);v.camera.position.set(${x},${y},${z});v.controls.update(); })()`);
        await new Promise(r=>setTimeout(r,450));
        const {data}=await send<{data:string}>('Page.captureScreenshot',{format:'png'});
        writeFileSync(`out/presets/singlet-${view}.png`,Buffer.from(data,'base64'));
      }
    }
    if(shortsReview){
      if(names.at(-1)!=='The Resort Guest'){
        const before=await statsNow();
        await evaluate("(() => { const s=document.querySelector('#preset');s.value='The Resort Guest';s.dispatchEvent(new Event('change')); })()");
        await builtAfter(before,'loose shorts review');
      }
      if(process.env.SHORTS_REVIEW_TROPICAL==='1'){
        const before=await statsNow();
        await evaluate("(() => { const s=window.ara.store,p=s.params;s.set({garmentStyles:{...p.garmentStyles,resort_shorts:{pattern:'tropical',color:'#d62e32',color2:'#5ea97b'}}}); })()");
        await builtAfter(before,'tropical loose shorts');
      }
      for(const [view,x,y,z] of [['front',0,.84,1.55],['below',0,.28,1.15],['side',1.15,.58,.65]]as const){
        await evaluate(`(() => { const v=window.ara.viewer;v.controls.target.set(0,.82,0);v.camera.position.set(${x},${y},${z});v.controls.update(); })()`);
        await new Promise(r=>setTimeout(r,450));
        const {data}=await send<{data:string}>('Page.captureScreenshot',{format:'png'});
        writeFileSync(`out/presets/loose-shorts-${view}.png`,Buffer.from(data,'base64'));
      }
    }
    if(racerReview){
      for(const [view,x,y,z] of [['front',0,1.48,2.2],['side',2.05,1.48,0],['back',0,1.48,-2.2]] as const){
        await evaluate(`(() => { const v=window.ara.viewer;v.controls.target.set(0,1.36,0);v.camera.position.set(${x},${y},${z});v.controls.update(); })()`);
        await new Promise(r=>setTimeout(r,450));
        const {data}=await send<{data:string}>('Page.captureScreenshot',{format:'png'});
        writeFileSync(`out/presets/street-racer-jacket-${view}.png`,Buffer.from(data,'base64'));
      }
    }
    if(!singletReview&&!shortsReview&&!racerReview){
    const before = await statsNow();
    await evaluate("(() => { const s=document.querySelector('#preset');s.value='The Dispatch Rider';s.dispatchEvent(new Event('change')); })()");
    await builtAfter(before,'dispatch motorcycle');
    await evaluate("window.ara.play('ride_motorcycle')");
    await waitFor("!!window.ara.viewer.ride && window.ara.viewer.ride.id==='motorcycle'",'dispatch motorcycle preview',10000);
    await evaluate("(() => { const v=window.ara.viewer,t=v.controls.target;v.camera.position.set(t.x+4.2,t.y+2.1,t.z-5.4);v.controls.update(); })()");
    await new Promise(r=>setTimeout(r,500));
    const {data} = await send<{data:string}>('Page.captureScreenshot',{format:'png'});
    writeFileSync('out/presets/dispatch-motorcycle.png',Buffer.from(data,'base64'));
    await evaluate("[...document.querySelectorAll('.mode-switch button')].find(b=>b.textContent.includes('Detailed')).click()");
    await waitFor("!document.querySelector('input[aria-label=\"Motorcycle delivery box\"]').closest('label').hidden",'motorcycle box setting',5000);
    await evaluate("document.querySelector('input[aria-label=\"Motorcycle delivery box\"]').click()");
    await waitFor("window.ara.store.params.vehicleStyle.deliveryBox===false",'delivery box off',5000);
    await evaluate("document.querySelector('input[aria-label=\"Motorcycle delivery box\"]').click()");
    await waitFor("window.ara.store.params.vehicleStyle.deliveryBox===true",'delivery box on',5000);
    }
  });
  await checkMobileBuilder({enabled:mobileOnly,step,evaluate,waitFor,send});
  await buildGownThumbnails({enabled:gownsOnly,step,evaluate,waitFor,send});
  // Quick build: new visitors start there.
  const quick = (k: string) => `document.querySelector('#quick [data-k="${k}"]')`;
  const tap = async (k: string) => evaluate(`${quick(k)}.click()`);
  const sentence = () => evaluate<string>("document.querySelector('.qb-sentence').textContent");
  await step('new visitors start in Quick build', async () => {
    await waitFor(`document.body.dataset.mode === 'quick' && !!document.querySelector('.qb-sentence') && getComputedStyle(document.querySelector('#controls')).display === 'none'`, 'Quick build', 5000);
  });
  await step('Quick build options rebuild and read back', async () => {
    for (const [k, word] of [['gender:woman', 'woman'], ['heritage:african', 'African'], ['style:business', 'business suit'], ['hair:cornrows', 'cornrows']]) {
      const before = await statsNow();
      await tap(k);
      await builtAfter(before, `the rebuild after ${k}`);
      // (The panel redraws on the next frame.)
      await waitFor(`document.querySelector('.qb-sentence').textContent.includes(${JSON.stringify(word)})`, `the summary to say "${word}" after ${k}`, 3000).catch(async () => {
        throw new Error(`summary "${await sentence()}" lacks "${word}" after ${k}`);
      });
      if ((await evaluate<string>(`${quick(k)}.ariaPressed`)) !== 'true') throw new Error(`${k} isn't shown as picked`);
    }
    if ((await evaluate<string>("JSON.parse(localStorage.getItem('3dgen.human')).outfit")) !== 'set_pantsuit') throw new Error("a woman's business suit isn't the pantsuit");
  });
  await step('fast taps each see the latest character', async () => {
    // Two taps before the panel redraws: the outfit must be judged for a woman, not the man drawn.
    let before = await statsNow();
    await tap('gender:man');
    await builtAfter(before, 'the man');
    before = await statsNow();
    await evaluate(`(() => { ${quick('gender:woman')}.click(); ${quick('style:aso_ebi')}.click(); })()`);
    await builtAfter(before, 'the woman in aso-ebi');
    const outfit = await evaluate<string>("JSON.parse(localStorage.getItem('3dgen.human')).outfit");
    if (outfit !== 'set_aso_ebi') throw new Error(`outfit is ${outfit}`);
  });
  await step('unavailable options say why', async () => {
    const before = await statsNow();
    await tap('age:teen');
    await builtAfter(before, 'the teen build');
    await tap('tattoos:chest');
    await waitFor("document.querySelector('.qb-toast').classList.contains('show') && /adult/.test(document.querySelector('.qb-toast').textContent)", 'the reason a teen has no tattoos', 3000);
    if ((await evaluate<string>(`${quick('style:beach')}.ariaDisabled`)) !== 'true') throw new Error("beachwear isn't adults-only");
  });
  await step('undo goes back a step', async () => {
    await new Promise((r) => setTimeout(r, 600)); // the change settles into the history
    const before = await statsNow();
    await evaluate("[...document.querySelectorAll('.qb-act')].find((b) => b.textContent.includes('Undo')).click()");
    await builtAfter(before, 'the undo');
    if (/\b1[0-7]-year-old/.test(await sentence())) throw new Error(`still a teen after undo: ${await sentence()}`);
  });
  await step('Surprise me builds a character', async () => {
    const before = await statsNow();
    await tap('act:surprise');
    await builtAfter(before, 'the surprise build');
  });
  await step('Quick build vehicles pair animations, simplify styling and read back Detailed edits',async()=>{
    const saved=()=>evaluate<{vehicle:string;vehicleStyle:{color:string;variant:string;finish:string}}>("JSON.parse(localStorage.getItem('3dgen.human'))");
    let before=await statsNow();await tap('vehicle:sports_car');await builtAfter(before,'Quick sports car');
    await waitFor(`${quick('vehicle:sports_car')}.ariaPressed==='true' && !!${quick('action:board_sports_car')} && !!${quick('action:alight_sports_car')}`,'sports car actions',3000);
    if((await saved()).vehicle!=='auto')throw Error('Quick vehicle locks the model instead of following the animation');
    for(const key of ['vehicleColour:red','vehicleVariant:sport','vehicleFinish:matte']){before=await statsNow();await tap(key);await builtAfter(before,key);}
    const styled=await saved();if(styled.vehicleStyle.color!=='#b0211f'||styled.vehicleStyle.variant!=='sport'||styled.vehicleStyle.finish!=='matte')throw Error('Quick vehicle style not saved');
    before=await statsNow();await tap('vehicle:horse');await builtAfter(before,'Quick horse');
    await waitFor(`${quick('vehicle:horse')}.ariaPressed==='true' && !!${quick('action:board_horse')}`,'horse actions',3000);
    if(await evaluate(`!!${quick('vehicleFinish:matte')}`))throw Error('Horse shows vehicle paint finish');
    if((await saved()).vehicleStyle.color!=='#b0211f')throw Error('Vehicle switch overwrites custom colours');
    before=await statsNow();await tap('vehicle:kayak');await builtAfter(before,'Quick kayak');
    await tap('action:board_kayak');await waitFor(`${quick('action:board_kayak')}.ariaPressed==='true' && ${quick('vehicle:kayak')}.ariaPressed==='true'`,'kayak boarding',3000);
    await tap('action:paddle_kayak');await waitFor(`${quick('action:paddle_kayak')}.ariaPressed==='true'`,'kayak paddling',3000);
    // A change in Detailed must be shown in Quick without discarding trim or seat colours.
    await evaluate("document.querySelector('#quick [data-k=\"fine:vehicle\"]').click()");
    before=await statsNow();await evaluate(`(()=>{const e=document.querySelector('input[aria-label="Vehicle Body / coat"]');e.value='#345678';e.dispatchEvent(new Event('change'))})()`);await builtAfter(before,'Detailed vehicle colour');
    await evaluate("[...document.querySelectorAll('.mode-switch button')].find(b=>b.textContent.includes('Quick build')).click()");
    await waitFor(`${quick('vehicle:kayak')}.ariaPressed==='true' && document.querySelector('#quick [data-step=vehicle] input[type=color]').value==='#345678'`,'Quick vehicle colour readback',3000);
    mkdirSync('out/vehicles',{recursive:true});await evaluate("document.querySelector('#quick [data-step=vehicle]').scrollIntoView({block:'start'})");const {data}=await send<{data:string}>('Page.captureScreenshot',{format:'png'});writeFileSync('out/vehicles/quick-build.png',Buffer.from(data,'base64'));
    before=await statsNow();await tap('vehicle:none');await builtAfter(before,'On foot');await waitFor(`${quick('vehicle:none')}.ariaPressed==='true' && !${quick('vehicleFinish:matte')}`,'vehicle removed',3000);
  });
  await step('switching to Detailed shows every control', async () => {
    await evaluate("[...document.querySelectorAll('.mode-switch button')].find((b) => b.textContent.includes('Detailed')).click()");
    await waitFor("document.body.dataset.mode === 'detailed' && getComputedStyle(document.querySelector('#controls')).display !== 'none' && getComputedStyle(document.querySelector('#quick')).display === 'none'", 'Detailed', 3000);
  });
  await step('slider rebuilds the character', async () => {
    const before = await statsNow();
    await evaluate(`(() => { const s = [...document.querySelectorAll('#controls .ctl')].find((c) => c.querySelector('span')?.textContent === 'Muscle').querySelector('input'); s.value = '0.9'; s.dispatchEvent(new Event('input')); })()`);
    await builtAfter(before, 'the rebuild after a slider change');
  });
  await step('preset replaces the controls', async () => {
    const before = await statsNow();
    await evaluate(`(() => { const s = document.querySelector('#preset'); s.value = 'The African Warrior'; s.dispatchEvent(new Event('change')); })()`);
    await builtAfter(before, 'the preset build');
    const name = await evaluate<string>("document.querySelector('#name').value");
    if (name !== 'The African Warrior') throw new Error(`name field shows "${name}"`);
  });
  await step('character LLM Assist guides, validates pasted JSON and builds an undoable character', async () => {
    const original=await evaluate<string>("localStorage.getItem('3dgen.human')");
    await evaluate("document.querySelector('#character-assist-btn').click()");await waitFor("document.querySelector('#character-assist-dialog').open",'character Assist');
    if(await evaluate('!!document.querySelector("#character-assist-dialog .ai-starters,#character-assist-dialog .ai-chip")'))throw Error('Builder Assist still has idea pills');
    await evaluate("(()=>{const b=document.querySelector('#ca-brief');b.value='An explorer in cornrows';b.dispatchEvent(new Event('input'));const c=document.querySelector('#ca-context');c.checked=true;c.dispatchEvent(new Event('change'))})()");
    if(!await evaluate("document.querySelector('#ca-guide').value.includes('An explorer in cornrows') && document.querySelector('#ca-guide').value.includes('CURRENT CHARACTER') && document.querySelector('#ca-guide').value.includes('garmentStyles') && document.querySelector('#ca-guide').value.includes('JSON SCHEMA')"))throw Error('Character guide missing capabilities/context');
    await evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>window.__characterGuide=text}});document.querySelector('#ca-copy').click()");await waitFor("window.__characterGuide===document.querySelector('#ca-guide').value",'copied character guide');await evaluate('delete navigator.clipboard');
    await evaluate(`(()=>{const e=document.querySelector('#ca-json');e.value=JSON.stringify({kind:'ara-studio',version:2});e.dispatchEvent(new Event('input'))})()`);
    if(!await evaluate("document.querySelector('#ca-create').disabled && document.querySelector('#ca-status').textContent.includes('Studio')"))throw Error('Character builder accepted film JSON');
    if(await evaluate<string>("localStorage.getItem('3dgen.human')")!==original)throw Error('Invalid JSON changed the character');
    await evaluate("document.querySelector('#ca-example').click()");await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    if(!await evaluate("document.querySelector('#character-assist-dialog').scrollWidth<=document.querySelector('#character-assist-dialog').clientWidth"))throw Error('Character Assist overflows mobile');await send('Emulation.clearDeviceMetricsOverride');
    const before=await statsNow();await evaluate("document.querySelector('#ca-create').click()");await builtAfter(before,'the LLM character');await waitFor("!document.querySelector('#character-assist-dialog').open",'character modal to close');
    if(!await evaluate("(()=>{const p=JSON.parse(localStorage.getItem('3dgen.human'));return p.name==='Desert explorer' && p.hair==='cornrows' && p.carry==='backpack' && document.querySelector('#name').value==='Desert explorer'})()"))throw Error('LLM character settings were not built/read back');
    const current=await statsNow();await send('Input.dispatchKeyEvent',{type:'keyDown',key:'z',code:'KeyZ',modifiers:2});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'z',code:'KeyZ',modifiers:2});await builtAfter(current,'undoing the LLM character');
    if(await evaluate<string>("localStorage.getItem('3dgen.human')")!==original)throw Error('LLM character did not undo as one edit');
  });
  await step('character LLM Assist opens a JSON file and recovers unfinished drafts',async()=>{
    await evaluate("document.querySelector('#character-assist-btn').click()");await waitFor("document.querySelector('#character-assist-dialog').open",'Assist reopen');
    const fileJSON=JSON.stringify({kind:'ara-character',version:1,preset:'The Priest',params:{name:'AI-designed priest',detail:'medium'}});
    await evaluate(`(()=>{const dt=new DataTransfer();dt.items.add(new File([${JSON.stringify(fileJSON)}],'character.json',{type:'application/json'}));const e=document.querySelector('#ca-file');e.files=dt.files;e.dispatchEvent(new Event('change'));})()`);
    await waitFor("document.querySelector('#ca-json').value.includes('AI-designed priest') && !document.querySelector('#ca-create').disabled",'character file validation');
    const before=await statsNow();await evaluate("document.querySelector('#ca-create').click()");await builtAfter(before,'the imported character');await waitFor("!document.querySelector('#character-assist-dialog').open",'imported character modal close');
    if(!await evaluate("JSON.parse(localStorage.getItem('3dgen.human')).name==='AI-designed priest'"))throw Error('Character file was not built');
    await evaluate(`document.querySelector('#character-assist-btn').click()`);await waitFor("document.querySelector('#character-assist-dialog').open",'character draft');
    await evaluate(`(()=>{const e=document.querySelector('#ca-json');e.value='{unfinished';e.dispatchEvent(new Event('input'));window.__characterReload=true})()`);await send('Page.reload');await waitFor("!window.__characterReload && document.querySelector('#loading')?.hidden && document.querySelector('#character-assist-dialog')?.open",'character draft recovery');
    if(!await evaluate("document.querySelector('#ca-json').value==='{unfinished' && document.querySelector('#ca-create').disabled && JSON.parse(localStorage.getItem('3dgen.human')).name==='AI-designed priest'"))throw Error('Character or unfinished draft lost on reload');await evaluate("document.querySelector('#ca-close').click()");
  });
  await step('animation browser plays a clip', async () => {
    await evaluate("document.querySelector('.anim-browse').click()");
    await waitFor("document.querySelector('#anim-pop').classList.contains('open')", 'the browser to open', 5000);
    await evaluate(`(() => { const s = document.querySelector('.anim-search'); s.value = 'jump land'; s.dispatchEvent(new Event('input')); s.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); })()`);
    await waitFor("document.querySelector('.anim-browse span').textContent === 'Jump land'", 'the clip to play', 5000);
    await evaluate("document.querySelector('.anim-close').click()");
  });
  await step('vehicle animations choose their props and keep custom styling without a second selector',async()=>{
    if(await evaluate(`!![...document.querySelectorAll('#controls .ctl')].find(c=>c.querySelector('span')?.textContent==='Ride')`))throw Error('Conflicting ride selector remains');
    const before=await statsNow();await evaluate("document.querySelector('.anim-browse').click()");await evaluate(`(()=>{const s=document.querySelector('.anim-search');s.value='Drive modern sports car';s.dispatchEvent(new Event('input'));s.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));})()`);await builtAfter(before,'automatic fitted coupe');await evaluate("document.querySelector('.anim-close').click()");
    if(!await evaluate(`JSON.parse(localStorage.getItem('3dgen.human')).vehicle==='auto'`))throw Error('Vehicle does not follow the action');
    const previous=await statsNow();await evaluate(`(()=>{const color=document.querySelector('input[aria-label="Vehicle Body / coat"]');color.value='#176a80';color.dispatchEvent(new Event('change'));})()`);await builtAfter(previous,'vehicle colour');
    if(!await evaluate(`JSON.parse(localStorage.getItem('3dgen.human')).vehicleStyle.color==='#176a80'`))throw Error('Vehicle style not saved');
    mkdirSync('out/vehicles',{recursive:true});const {data}=await send<{data:string}>('Page.captureScreenshot',{format:'png'});writeFileSync('out/vehicles/builder-car.png',Buffer.from(data,'base64'));
    await evaluate("document.querySelector('#export-summary').click()");await waitFor("!document.querySelector('#export-panel').hidden",'vehicle export plan');await evaluate(`document.querySelector('#export-panel .xp-card').click()`);
    if(!await evaluate(`document.querySelector('#export-panel').textContent.includes('sports_car_driver')`))throw Error('Static vehicle missing from preview export plan');
    await evaluate(`(()=>{window.__vehicleFile=null;window.__vehicleAnchor=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download&&this.href.startsWith('blob:'))fetch(this.href).then(r=>r.arrayBuffer()).then(buffer=>{const bytes=new Uint8Array(buffer);let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));window.__vehicleFile=btoa(text)});else window.__vehicleAnchor.call(this);};document.querySelector('#export-panel .xp-go').click();})()`);
    await waitFor('!!window.__vehicleFile','static vehicle download',240000);const bytes=await evaluate<string>('window.__vehicleFile');const keys=Object.keys(unzipSync(Buffer.from(bytes,'base64')));if(!keys.some(k=>k.includes('sports_car_driver')))throw Error('Worker export omitted the preview vehicle');await evaluate('HTMLAnchorElement.prototype.click=window.__vehicleAnchor');
    await evaluate("document.querySelector('#export-panel .xp-close').click()");const original=await statsNow();await evaluate(`(()=>{const c=document.querySelector('input[aria-label="Show vehicle"]');c.checked=false;c.dispatchEvent(new Event('change'));})()`);await builtAfter(original,'hiding the vehicle');
  });
  await step('character settings download, reopen exactly and reject invalid files',async()=>{
    await evaluate(`(()=>{window.__settings=null;const original=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download.endsWith('.ara-character.json'))fetch(this.href).then(r=>r.text()).then(text=>window.__settings={text,name:this.download});else original.call(this);};document.querySelector('#save-character').click();})()`);
    await waitFor('!!window.__settings','character settings download');const saved=await evaluate<string>('window.__settings.text');const original=await evaluate<string>("localStorage.getItem('3dgen.human')");
    if(!await evaluate(`JSON.parse(window.__settings.text).kind==='ara-character'&&JSON.stringify(JSON.parse(window.__settings.text).params)===localStorage.getItem('3dgen.human')`))throw Error('Settings download differs from character');
    await evaluate(`(()=>{const name=document.getElementById('name');name.value='Temporary edit';name.dispatchEvent(new Event('input'));})()`);await evaluate(`(()=>{const dt=new DataTransfer();dt.items.add(new File([${JSON.stringify(saved)}],'character.json',{type:'application/json'}));const e=document.querySelector('#character-settings-file');e.files=dt.files;e.dispatchEvent(new Event('change'));})()`);await waitFor("document.getElementById('character-file-status').textContent.startsWith('Opened ')&&!document.getElementById('status').classList.contains('show')",'opening character settings');if(await evaluate<string>("document.getElementById('name').value")!==JSON.parse(saved).params.name)throw Error('Saved name was not restored');
    if(await evaluate<string>("localStorage.getItem('3dgen.human')")!==original)throw Error('Settings changed on reopen');
    await evaluate(`(()=>{const dt=new DataTransfer();dt.items.add(new File(['{bad'],'bad.json',{type:'application/json'}));const e=document.querySelector('#character-settings-file');e.files=dt.files;e.dispatchEvent(new Event('change'));})()`);await waitFor("document.querySelector('#character-file-status').textContent.includes('complete JSON')",'invalid character rejection');
    if(await evaluate<string>("localStorage.getItem('3dgen.human')")!==original)throw Error('Invalid settings changed character');
  });
  await step('export panel opens and closes', async () => {
    await evaluate("document.querySelector('#export-summary').click()");
    await waitFor("!document.querySelector('#export-panel').hidden && !!document.querySelector('#export-panel .xp-go')", 'the export panel', 5000);
    await evaluate("document.querySelector('#export-panel .xp-close').click()");
    await waitFor("document.querySelector('#export-panel').hidden", 'the export panel to close', 5000);
  });
  await step('export downloads a file', async () => {
    // Capture the download instead of saving it.
    await evaluate(`(() => {
      window.__download = null;
      const click = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        if (this.download && this.href.startsWith('blob:')) fetch(this.href).then((r) => r.blob()).then((b) => (window.__download = { name: this.download, size: b.size }));
        else click.call(this);
      };
      document.querySelector('#export-go').click();
    })()`);
    await waitFor('!!window.__download', 'the export', 240000);
    const d = await evaluate<{ name: string; size: number }>('window.__download');
    if (!/\.(glb|fbx|zip|obj)$/.test(d.name) || d.size < 100000) throw new Error(`downloaded ${d.name} (${d.size} bytes)`);
  });
} finally {
  await cleanup();
}

let failed = 0;
for (const [name, ok, msg] of results) {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${msg ? `: ${msg}` : ''}`);
  if (!ok) failed++;
}
if (errors.length) {
  failed++;
  console.log(`FAIL page errors:\n  ${errors.slice(0, 5).join('\n  ')}`);
}
console.log(failed ? 'UI CHECK FAILED' : 'UI works in a real browser');
process.exit(failed ? 1 : 0);
