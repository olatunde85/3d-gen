/**
 * Renders a portrait of every character preset for the characters page: public/media/characters/<slug>.webp, a
 * three-quarter full-length view in the builder's own lighting. Needs a site build in dist/.
 *   npx vite build && npx tsx scripts/character-portraits.ts            all presets
 *   npx tsx scripts/character-portraits.ts "The Nurse" "The Clown"      just these
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import type { Readable, Writable } from 'node:stream';
import sharp from 'sharp';
import { PRESETS } from '../src/core/params';
import { presetSlug } from '../src/characters/slug';

const root = resolve(import.meta.dirname, '..'), dist = join(root, 'dist'), out = join(root, 'public/media/characters');
if (!existsSync(join(dist, 'app/index.html'))) throw Error('Build the site first: npx vite build');
mkdirSync(out, { recursive: true });
const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(PRESETS);

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream', '.ktx2': 'image/ktx2' };
const server = createServer((req, res) => {
  let p = join(dist, decodeURIComponent((req.url ?? '/').split('?')[0]));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  if (!p.startsWith(dist) || !existsSync(p)) { res.statusCode = 404; res.end(); return; }
  res.setHeader('content-type', TYPES[extname(p)] ?? 'application/octet-stream'); res.end(readFileSync(p));
});
await new Promise<void>((r) => server.listen(4483, '127.0.0.1', r));

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profile = mkdtempSync(join(tmpdir(), 'portraits-'));
const chrome = spawn(CHROME, ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run', `--user-data-dir=${profile}`, '--remote-debugging-pipe', '--window-size=1400,1000', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
const to = chrome.stdio[3] as Writable, from = chrome.stdio[4] as Readable;
let id = 0, session: string | undefined, buf = '';
const pending = new Map<number, (m: { result?: unknown; error?: { message: string } }) => void>();
from.on('data', (c: Buffer) => {
  buf += c.toString('utf8'); let i;
  while ((i = buf.indexOf('\0')) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); if (m.id !== undefined) pending.get(m.id)?.(m); }
});
const send = <T = Record<string, unknown>>(method: string, params: object = {}, withSession = true) => new Promise<T>((ok, fail) => {
  const n = ++id;
  pending.set(n, (m) => (m.error ? fail(Error(`${method}: ${m.error.message}`)) : ok(m.result as T)));
  to.write(JSON.stringify({ id: n, method, params, ...(withSession && session ? { sessionId: session } : {}) }) + '\0');
});
const e = async <T = unknown>(js: string) => {
  const r = await send<{ result: { value: T }; exceptionDetails?: { text: string } }>('Runtime.evaluate', { expression: js, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw Error(r.exceptionDetails.text);
  return r.result.value;
};
const wait = async (js: string, ms = 240000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await e<boolean>(js).catch(() => false)) return; await new Promise((r) => setTimeout(r, 200)); } throw Error(`timed out: ${js}`); };
const { targetInfos } = await send<{ targetInfos: { type: string; targetId: string }[] }>('Target.getTargets', {}, false);
session = (await send<{ sessionId: string }>('Target.attachToTarget', { targetId: targetInfos.find((t) => t.type === 'page')!.targetId, flatten: true }, false)).sessionId;
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });

try {
  for (const name of names) {
    await send('Page.navigate', { url: 'about:blank' });
    await send('Page.navigate', { url: `http://127.0.0.1:4483/app/#preset=${encodeURIComponent(name)}&demo` });
    await new Promise((r) => setTimeout(r, 1200));
    await wait('!!window.ara && document.getElementById("loading").hidden && !!window.ara.store.current');
    // Only the 3D view: the builder's bars and buttons over it are hidden.
    await e(`(()=>{const s=document.createElement('style');s.textContent='body *{visibility:hidden!important}#viewport{visibility:visible!important}';document.head.append(s);})()`);
    await new Promise((r) => setTimeout(r, 1500));
    // Frame the whole character from a little to the right, in the canvas's own size.
    const rect = await e<{ x: number; y: number; w: number; h: number }>(`(()=>{const v=ara.viewer,h=ara.store.current.height,a=0.42;
      v.controls.target.set(0,h*0.5,0);v.camera.position.set(Math.sin(a)*h*2.5,h*0.56,Math.cos(a)*h*2.5);v.controls.update();
      const r=document.getElementById('viewport').getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};})()`);
    await new Promise((r) => setTimeout(r, 900));
    // A 3:4 crop from the middle of the canvas.
    const h = rect.h * 0.94, w = h * 0.75, x = rect.x + (rect.w - w) / 2, y = rect.y + rect.h * 0.03;
    const shot = await send<{ data: string }>('Page.captureScreenshot', { format: 'png', clip: { x, y, width: w, height: h, scale: 1 } });
    const file = join(out, `${presetSlug(name)}.webp`);
    writeFileSync(file, await sharp(Buffer.from(shot.data, 'base64')).resize(360, 480).webp({ quality: 78 }).toBuffer());
    console.log(`${name} → ${file.slice(root.length + 1)}`);
  }
} finally {
  chrome.kill(); server.close(); rmSync(profile, { recursive: true, force: true });
}
