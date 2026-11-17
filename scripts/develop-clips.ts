/**
 * Renders the landing page's Develop tabs and the developers page's embed demos as short looping videos for phones,
 * which show these instead of live characters: the same characters, lights and framing as the embed, written to
 * public/media/develop/*.mp4. Needs the
 * library built (npx vite build --config packages/cli/vite.lib.config.ts), the character data in public/assets and
 * ffmpeg.
 *   npx tsx scripts/develop-clips.ts [names...]
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import type { Readable, Writable } from 'node:stream';

const root = resolve(import.meta.dirname, '..'), out = join(root, 'public/media/develop');
const SIZE = 600, FPS = 30;
/** Each video: the character (a preset or { random }), its options and the clip that loops. */
const CLIPS: [string, string | { random: number }, object, string][] = [
  ['library', 'The Soldier', { weapon: 'rifle' }, 'rifle_idle'],
  ['embed', 'The Priest', {}, 'talk_gestures'],
  ['cli', 'The Female Executive', {}, 'model_walk'],
  ['mcp', 'The Cyberpunk Hacker', { weapon: 'rifle' }, 'rifle_walk'],
  // The developers page's embed demos.
  ['demo-priest', 'The Priest', {}, 'walk'],
  ['demo-executive', 'The Female Executive', { colors: { outfit: '#1d2a44', carry: '#8a1c1c' } }, 'model_walk'],
  ['demo-random', { random: 7 }, {}, 'texting'],
];
const PAGE = `<!doctype html><html><body style="margin:0;background:#000">
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/examples/jsm/":"/three/examples/jsm/","ara3d":"/ara3d/index.js"}}</script>
<script type="module">
import * as THREE from 'three';
import { createCharacter } from 'ara3d';
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(${SIZE}, ${SIZE});renderer.setPixelRatio(1);renderer.toneMapping = THREE.ACESFilmicToneMapping;renderer.toneMappingExposure = 1.05;
document.body.append(renderer.domElement);
// The Develop preview's background, painted into the frame.
const bg = document.createElement('canvas');bg.width = bg.height = 512;
const g = bg.getContext('2d'), fill = g.createRadialGradient(256, 205, 0, 256, 205, 360);
fill.addColorStop(0, '#1a1b22');fill.addColorStop(1, '#0f0f12');g.fillStyle = fill;g.fillRect(0, 0, 512, 512);
const background = new THREE.CanvasTexture(bg);background.colorSpace = THREE.SRGBColorSpace;
const shadeCanvas = document.createElement('canvas');shadeCanvas.width = shadeCanvas.height = 128;
const s = shadeCanvas.getContext('2d'), sf = s.createRadialGradient(64, 64, 0, 64, 64, 64);
sf.addColorStop(0, 'rgba(0,0,0,0.42)');sf.addColorStop(0.55, 'rgba(0,0,0,0.18)');sf.addColorStop(1, 'rgba(0,0,0,0)');s.fillStyle = sf;s.fillRect(0, 0, 128, 128);
const shadeMap = new THREE.CanvasTexture(shadeCanvas);shadeMap.colorSpace = THREE.SRGBColorSpace;
let state;
window.load = async (input, options, clipId) => {
  const hero = await createCharacter(input, { assetsUrl: '/assets/', animations: [clipId], detail: 'medium', ...options });
  const scene = new THREE.Scene();scene.background = background;
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a2f3a, 1.7));
  const key = new THREE.DirectionalLight(0xffffff, 2.3);key.position.set(2.5, 4, 3);scene.add(key);
  const rim = new THREE.DirectionalLight(0x9db9ff, 1.2);rim.position.set(-3, 2.5, -3);scene.add(rim);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ map: shadeMap, transparent: true, depthWrite: false }));disc.rotation.x = -Math.PI / 2;scene.add(disc);
  scene.add(hero.scene);
  const clip = hero.clip(clipId), mixer = new THREE.AnimationMixer(hero.scene);mixer.clipAction(clip).play();
  // Framed as the embed does it: from the front-right, fitting every pose of the clip.
  const box = new THREE.Box3();
  for (const at of [0, 0.25, 0.5, 0.75]) { mixer.setTime(clip.duration * at);hero.scene.updateMatrixWorld(true);box.union(new THREE.Box3().setFromObject(hero.scene, true)); }
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
  const distance = (Math.max(size.y, Math.max(size.x, size.z)) / (2 * Math.tan((camera.fov * Math.PI) / 360))) * 1.3;
  camera.position.copy(center).add(new THREE.Vector3(0.35, 0.1, 1).normalize().multiplyScalar(distance));camera.lookAt(center);
  disc.scale.setScalar(Math.max(0.6, Math.max(size.x, size.z) * 0.75));
  state = { scene, camera, mixer, duration: clip.duration };
  return clip.duration;
};
window.frame = (t) => { state.mixer.setTime(t);renderer.render(state.scene, state.camera);return renderer.domElement.toDataURL('image/jpeg', 0.95); };
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
const port = (server.address() as { port: number }).port, profile = mkdtempSync(join(tmpdir(), 'ara-clips-')), frames = mkdtempSync(join(tmpdir(), 'ara-clip-frames-'));
const chrome = spawn(process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--use-angle=metal', `--user-data-dir=${profile}`, '--remote-debugging-pipe', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
const input = chrome.stdio[3] as Writable, output = chrome.stdio[4] as Readable, pending = new Map<number, (m: any) => void>();
let seq = 0, session = '', buf = '';
output.on('data', (c: Buffer) => { buf += c;let n;while ((n = buf.indexOf('\0')) >= 0) { const m = JSON.parse(buf.slice(0, n));buf = buf.slice(n + 1);if (m.id) { pending.get(m.id)?.(m);pending.delete(m.id); } } });
const send = (method: string, params: object = {}, attach = true) => new Promise<any>((ok, fail) => { const id = ++seq;pending.set(id, (m) => m.error ? fail(Error(m.error.message)) : ok(m.result));input.write(JSON.stringify({ id, method, params, ...(attach && session ? { sessionId: session } : {}) }) + '\0'); });
const evaluate = async (e: string) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);return r.result.value; };
try {
  mkdirSync(out, { recursive: true });
  const { targetId } = await send('Target.createTarget', { url: `http://127.0.0.1:${port}/` }, false);
  session = (await send('Target.attachToTarget', { targetId, flatten: true }, false)).sessionId;
  for (let i = 0; i < 100 && !(await evaluate('!!window.ready').catch(() => false)); i++) await new Promise((r) => setTimeout(r, 100));
  const only = process.argv.slice(2);
  for (const [name, character, options, clip] of CLIPS) {
    if (only.length && !only.includes(name)) continue;
    const duration: number = await evaluate(`window.load(${JSON.stringify(character)}, ${JSON.stringify(options)}, ${JSON.stringify(clip)})`);
    // One whole cycle, so the video loops without a jump.
    const count = Math.round(duration * FPS);
    for (let f = 0; f < count; f++) {
      const data: string = await evaluate(`window.frame(${(f / count) * duration})`);
      writeFileSync(join(frames, `${name}-${String(f).padStart(4, '0')}.jpg`), Buffer.from(data.split(',')[1], 'base64'));
    }
    const file = join(out, `${name}.mp4`);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', join(frames, `${name}-%04d.jpg`), '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', file]);
    console.log(`${name}: ${count} frames, ${(statSync(file).size / 1024).toFixed(0)} KB -> ${file}`);
  }
} finally {
  chrome.kill();server.close();await new Promise((r) => { chrome.once('exit', r);setTimeout(r, 3000); });
  for (const dir of [profile, frames]) try { rmSync(dir, { recursive: true, force: true }); } catch { /* A leftover temp folder is harmless. */ }
}
