/**
 * Checks the ara3d browser library in headless Chrome: builds characters through the public API, plays a clip with
 * three's AnimationMixer and photographs the result to out/library/. Serves only the test page, the built library,
 * three.js and the character data.
 *   npm run test:library        (set CHROME=/path/to/chrome if it isn't in the default place)
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import type { Readable, Writable } from 'node:stream';

const root = resolve(import.meta.dirname, '..'), out = join(root, 'out/library');
const chromePath = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!existsSync(join(root, 'packages/cli/dist/index.js'))) throw Error('Build the library first: npx vite build --config packages/cli/vite.lib.config.ts');

const PAGE = `<!doctype html><html><body style="margin:0;background:#cfd6dd">
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/examples/jsm/":"/three/examples/jsm/","ara3d":"/ara3d/index.js"}}</script>
<script type="module">
import * as THREE from 'three';
import { createCharacter, createCharacterGLB, PRESET_NAMES, ANIMATIONS, PROPS } from 'ara3d';
window.lists = { presets: PRESET_NAMES.length, clips: ANIMATIONS.length, vehicles: PROPS.vehicles.length };
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });renderer.setSize(900, 700);document.body.append(renderer.domElement);
window.run = async (input, options, view) => {
  let frames = 0, ticking = true;(function tick() { frames++;if (ticking) requestAnimationFrame(tick); })();
  const steps = new Set(), started = performance.now();
  try {
    const hero = await createCharacter(input, { assetsUrl: '/assets/', ...options, onProgress: (label) => steps.add(label) });
    const seconds = (performance.now() - started) / 1000;ticking = false;
    const scene = new THREE.Scene();scene.background = new THREE.Color(0xcfd6dd);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x667788, 2.2));const sun = new THREE.DirectionalLight(0xffffff, 2);sun.position.set(2, 4, 3);scene.add(sun);
    scene.add(hero.scene);for (const p of hero.props) scene.add(p.scene);
    const clip = hero.clip(view.play);
    for (const [root, clips] of [[hero.scene, hero.animations], ...hero.props.map((p) => [p.scene, p.animations])]) {
      const c = root === hero.scene ? clip : clips.find((a) => a.name === clip?.name);
      if (c) { const m = new THREE.AnimationMixer(root);m.clipAction(c).play();m.setTime(view.t ?? 0.45); }
    }
    const camera = new THREE.PerspectiveCamera(30, 9 / 7, 0.1, 50);
    camera.position.set(Math.sin(view.az) * view.dist, 1.5, Math.cos(view.az) * view.dist);camera.lookAt(0, 0.95, 0);renderer.render(scene, camera);
    const result = { seconds, framesWhileBuilding: frames, steps: steps.size, height: hero.height, clips: hero.animations.map((a) => a.name), clipFound: !!clip, props: hero.props.map((p) => p.name), glb: hero.glb.length, name: hero.params.name };
    hero.dispose();return result;
  } catch (error) { ticking = false;return { error: error.message }; }
};
window.glbOnly = async () => { const glb = await createCharacterGLB('The Priest', { assetsUrl: '/assets/', animations: 'none', detail: 'low' });return { size: glb.length, magic: String.fromCharCode(...glb.slice(0, 4)) }; };
window.ready = true;
</script></body></html>`;

// Only these paths are served.
const MOUNTS: [string, string][] = [['/three/', join(root, 'node_modules/three/')], ['/ara3d/', join(root, 'packages/cli/dist/')], ['/assets/', join(root, 'public/assets/')]];
const TYPES: Record<string, string> = { '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.pack': 'application/octet-stream' };
const server = createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
  if (path === '/' || path === '/index.html') { res.setHeader('Content-Type', 'text/html');res.end(PAGE);return; }
  const mount = MOUNTS.find(([prefix]) => path.startsWith(prefix)), file = mount && resolve(mount[1], path.slice(mount[0].length));
  if (!mount || !file || !file.startsWith(mount[1]) || !existsSync(file) || statSync(file).isDirectory()) { res.statusCode = 404;res.end();return; }
  res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');res.end(readFileSync(file));
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const port = (server.address() as { port: number }).port, profile = mkdtempSync(join(tmpdir(), 'ara-library-'));

const chrome = spawn(chromePath, ['--headless=new', '--use-angle=metal', '--no-first-run', `--user-data-dir=${profile}`, '--remote-debugging-pipe', '--window-size=900,700', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
const input = chrome.stdio[3] as Writable, output = chrome.stdio[4] as Readable, pending = new Map<number, (m: any) => void>();
let seq = 0, session = '', buffer = '';
output.on('data', (chunk: Buffer) => {
  buffer += chunk.toString();let n;
  while ((n = buffer.indexOf('\0')) >= 0) { const m = JSON.parse(buffer.slice(0, n));buffer = buffer.slice(n + 1);if (m.id) { pending.get(m.id)?.(m);pending.delete(m.id); } }
});
function send<T = any>(method: string, params: object = {}, attach = true): Promise<T> {
  const id = ++seq;
  return new Promise((ok, fail) => {
    pending.set(id, (m) => (m.error ? fail(Error(m.error.message)) : ok(m.result)));
    input.write(JSON.stringify({ id, method, params, ...(attach && session ? { sessionId: session } : {}) }) + '\0');
  });
}
const evaluate = async <T = any>(expression: string): Promise<T> => {
  const r = await send<any>('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};
const photo = async (name: string) => { const r = await send<{ data: string }>('Page.captureScreenshot', { format: 'png' });writeFileSync(join(out, `${name}.png`), Buffer.from(r.data, 'base64')); };

try {
  const { targetId } = await send<{ targetId: string }>('Target.createTarget', { url: 'about:blank' }, false);
  session = (await send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true }, false)).sessionId;
  await send('Page.enable');await send('Runtime.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/` });
  for (let i = 0; i < 100 && !(await evaluate('!!window.ready').catch(() => false)); i++) await new Promise((r) => setTimeout(r, 100));
  mkdirSync(out, { recursive: true });

  const lists = await evaluate('window.lists');
  assert.deepEqual(lists, { presets: 32, clips: 216, vehicles: 15 });console.log('OK lists', JSON.stringify(lists));
  const cases: [string, unknown, object, object][] = [
    ['soldier-rifle-backpack', 'The Soldier', { animations: ['walk', 'idle'], weapon: 'rifle', carry: 'backpack' }, { play: 'walk', az: 0.6, dist: 4.2 }],
    ['ara-character-file', { preset: 'The Bride', params: { name: 'Ada', ageYears: 30 } }, { animations: ['locomotion'], rootMotion: false }, { play: 'run', az: -0.5, dist: 4.2 }],
    ['motorcycle', 'The Soldier', { animations: ['ride_motorcycle'], vehicle: 'motorcycle', detail: 'low' }, { play: 'ride_motorcycle', az: 1.2, dist: 5.5 }],
  ];
  for (const [name, character, options, view] of cases) {
    const r = await evaluate<any>(`window.run(${JSON.stringify(character)}, ${JSON.stringify(options)}, ${JSON.stringify(view)})`);
    assert.ok(!r.error, `${name}: ${r.error}`);
    assert.ok(r.clipFound, `${name}: clip ${(view as { play: string }).play} missing from ${r.clips}`);
    assert.ok(r.height > 1.4 && r.height < 2.2, `${name}: height ${r.height}`);
    assert.ok(r.steps > 1, `${name}: progress was reported`);
    assert.ok(r.framesWhileBuilding > r.seconds * 10, `${name}: the page kept drawing while the character was built`);
    if (name === 'motorcycle') assert.ok(r.props.some((p: string) => p.includes('motorcycle')), 'motorcycle prop');
    await photo(name);
    console.log(`OK ${name}: ${r.name}, ${r.height.toFixed(2)} m, ${r.clips.length} clips, props ${r.props.join(', ') || 'none'}, ${(r.glb / 1e6).toFixed(1)} MB, ${r.seconds.toFixed(1)} s, ${r.framesWhileBuilding} frames drawn meanwhile`);
  }
  const bad = await evaluate<any>(`window.run('Nope', {}, { play: 'walk', az: 0, dist: 4 })`);
  assert.match(bad.error ?? '', /Unknown preset "Nope"/);console.log('OK unknown preset:', bad.error);
  const glb = await evaluate<any>('window.glbOnly()');
  assert.equal(glb.magic, 'glTF');console.log(`OK createCharacterGLB: ${(glb.size / 1e6).toFixed(1)} MB GLB`);
  console.log(`Library checks passed. Photos in ${out}`);
} finally {
  // Let Chrome exit before removing its profile, which it writes to until then.
  chrome.kill();server.close();await new Promise((r) => { chrome.once('exit', r);setTimeout(r, 3000); });
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* A leftover temp folder is harmless. */ }
}
