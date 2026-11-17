/**
 * Renders the embed's loading figures: real Ara characters (a man and a woman at low detail, standing relaxed) as
 * wireframes on a transparent background, written as grayscale PNGs to packages/cli/src/library/loading-figure-*.png. Needs the library built
 * (npx vite build --config packages/cli/vite.lib.config.ts) and the character data in public/assets.
 *   npx tsx scripts/loading-figure.ts
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import type { Readable, Writable } from 'node:stream';
import sharp from 'sharp';

const root = resolve(import.meta.dirname, '..');
const W = 360, H = 900;
const PAGE = `<!doctype html><html><body style="margin:0;background:#000">
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/examples/jsm/":"/three/examples/jsm/","ara3d":"/ara3d/index.js"}}</script>
<script type="module">
import * as THREE from 'three';
import { createCharacter } from 'ara3d';
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
renderer.setSize(${W}, ${H});renderer.setPixelRatio(1);document.body.append(renderer.domElement);
window.wire = async (input, detail) => {
  const hero = await createCharacter(input, { assetsUrl: '/assets/', animations: ['idle'], detail });
  // A relaxed stance: a moment of the idle clip rather than the arms-out bind pose.
  const mixer = new THREE.AnimationMixer(hero.scene);mixer.clipAction(hero.clip('idle')).play();mixer.setTime(0.5);hero.scene.updateMatrixWorld(true);
  const scene = new THREE.Scene();
  hero.scene.traverse((o) => {
    if (!o.isMesh) return;
    const label = (o.name + ' ' + [o.material].flat().map((m) => m.name).join(' ')).toLowerCase();
    // Only the body and its clothes: eyes, teeth, tongue, lashes and brows clutter the head.
    if (/eye|teeth|tooth|tongue|lash|brow|details/.test(label)) { o.visible = false;return; }
    o.material = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.85 });
  });

  scene.add(hero.scene);
  const box = new THREE.Box3().setFromObject(hero.scene, true), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const camera = new THREE.PerspectiveCamera(20, ${W} / ${H}, 0.05, 50);
  const distance = (Math.max(size.y, size.x / camera.aspect) * 1.05) / (2 * Math.tan((camera.fov * Math.PI) / 360));
  camera.position.set(center.x + Math.sin(0.28) * distance, center.y, center.z + Math.cos(0.28) * distance);camera.lookAt(center);
  renderer.setClearColor(0x000000, 0);renderer.render(scene, camera);hero.dispose();
  return renderer.domElement.toDataURL('image/png');
};
window.ready = true;
</script></body></html>`;
const MOUNTS: [string, string][] = [['/three/', join(root, 'node_modules/three/')], ['/ara3d/', join(root, 'packages/cli/dist/')], ['/assets/', join(root, 'public/assets/')]];
const server = createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
  if (path === '/') { res.setHeader('Content-Type', 'text/html');res.end(PAGE);return; }
  const mount = MOUNTS.find(([p]) => path.startsWith(p)), file = mount && resolve(mount[1], path.slice(mount[0].length));
  if (!mount || !file || !file.startsWith(mount[1]) || !existsSync(file) || statSync(file).isDirectory()) { res.statusCode = 404;res.end();return; }
  res.setHeader('Content-Type', extname(file) === '.js' ? 'text/javascript' : 'application/octet-stream');res.end(readFileSync(file));
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const port = (server.address() as { port: number }).port, profile = mkdtempSync(join(tmpdir(), 'ara-wire-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--use-angle=metal', `--user-data-dir=${profile}`, '--remote-debugging-pipe', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
const input = chrome.stdio[3] as Writable, output = chrome.stdio[4] as Readable, pending = new Map<number, (m: any) => void>();
let seq = 0, session = '', buf = '';
output.on('data', (c: Buffer) => { buf += c;let n;while ((n = buf.indexOf('\0')) >= 0) { const m = JSON.parse(buf.slice(0, n));buf = buf.slice(n + 1);if (m.id) { pending.get(m.id)?.(m);pending.delete(m.id); } } });
const send = (method: string, params: object = {}, attach = true) => new Promise<any>((ok, fail) => { const id = ++seq;pending.set(id, (m) => m.error ? fail(Error(m.error.message)) : ok(m.result));input.write(JSON.stringify({ id, method, params, ...(attach && session ? { sessionId: session } : {}) }) + '\0'); });
const evaluate = async (e: string) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);return r.result.value; };
const BARE = { outfit: 'none', top: 'none', jacket: 'none', bottom: 'none', accessories: [], shoes: 'none', carry: 'none', weapon: 'none', hat: 'none', hair: 'none', facialHair: 'none', tattoos: [], earrings: 'none' };
try {
  const { targetId } = await send('Target.createTarget', { url: `http://127.0.0.1:${port}/` }, false);
  session = (await send('Target.attachToTarget', { targetId, flatten: true }, false)).sessionId;
  for (let i = 0; i < 100 && !(await evaluate('!!window.ready').catch(() => false)); i++) await new Promise((r) => setTimeout(r, 100));
  // A man in briefs; a woman in a tank top and briefs.
  for (const [body, character] of [['male', { preset: 'The Soldier', params: BARE }], ['female', { preset: 'The Adventurer', params: { ...BARE, top: 'tank_top' } }]] as const) {
    const data: string = await evaluate(`window.wire(${JSON.stringify(character)}, 'low')`), target = join(root, `packages/cli/src/library/loading-figure-${body}.png`);
    await sharp(Buffer.from(data.split(',')[1], 'base64')).grayscale().png({ compressionLevel: 9 }).toFile(target);
    console.log(`Wrote ${target}`);
  }
} finally { chrome.kill();server.close();await new Promise((r) => { chrome.once('exit', r);setTimeout(r, 3000); });try { rmSync(profile, { recursive: true, force: true }); } catch {} }
