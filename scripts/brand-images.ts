/**
 * Renders the site's icons and social cards from the logo (public/favicon.svg and public/logo.svg):
 *   - public/favicon.ico (16, 32, 48), public/apple-touch-icon.png, public/icon-192.png, public/icon-512.png;
 *   - public/og.jpg, the 1200x630 link preview;
 *   - out/brand/github-social.png, the 1280x640 image for the GitHub repository's social preview (Settings → Social
 *     preview), which GitHub takes as an upload rather than from the repository.
 * The cards show real Ara characters, so this needs the library built (npx vite build --config
 * packages/cli/vite.lib.config.ts) and the character data in public/assets.
 *   npx tsx scripts/brand-images.ts
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import type { Readable, Writable } from 'node:stream';
import sharp from 'sharp';

const root = resolve(import.meta.dirname, '..'), pub = join(root, 'public'), out = join(root, 'out/brand');
mkdirSync(out, { recursive: true });

// --- Icons -------------------------------------------------------------------------------------------------------
const icon = readFileSync(join(pub, 'favicon.svg'));
const png = (size: number) => sharp(icon, { density: (72 * size) / 64 * 4 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
for (const [file, size] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]] as const) writeFileSync(join(pub, file), await png(size));
// An .ico holding PNG images: a 6-byte header, a 16-byte entry per image, then the images.
const sizes = [16, 32, 48], images = await Promise.all(sizes.map(png));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(1, 2);header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((size, i) => {
  const at = 6 + 16 * i;
  header.writeUInt8(size, at);header.writeUInt8(size, at + 1);header.writeUInt16LE(1, at + 4);header.writeUInt16LE(32, at + 6);
  header.writeUInt32LE(images[i].length, at + 8);header.writeUInt32LE(offset, at + 12);offset += images[i].length;
});
writeFileSync(join(pub, 'favicon.ico'), Buffer.concat([header, ...images]));
console.log('Wrote favicon.ico, apple-touch-icon.png, icon-192.png and icon-512.png');

// --- Social cards: the logo, the line, and a row of characters ---------------------------------------------------
const CAST = ['The Female Executive', 'The Gangster', 'The Corporate High-Flier', 'The Miami Dealer'];
const CW = 420, CH = 900;
const PAGE = `<!doctype html><html><head><style>
html,body{margin:0;background:#09090b}
.card{position:relative;overflow:hidden;color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display',Inter,system-ui,sans-serif;
  background:radial-gradient(900px 520px at 78% 108%,rgba(109,141,255,.16),transparent 62%),#09090b}
.text{position:absolute;z-index:1;left:var(--pad);top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;width:520px}
.brand{display:flex;align-items:center;gap:18px;font-weight:650;font-size:44px;letter-spacing:-.03em}
.brand img{width:62px;height:62px}.brand b{font-weight:inherit}.brand span{color:#a1a1aa}
h1{margin:40px 0 0;font-weight:650;font-size:50px;line-height:1.04;letter-spacing:-.035em}
p{margin:24px 0 0;font-size:22px;line-height:1.45;color:#d4d4d8}
.url{margin-top:38px;font-size:22px;font-weight:600;color:#f4f4f5;display:flex;align-items:center;gap:10px}
.url i{width:9px;height:9px;border-radius:50%;background:#6d8dff}
.cast{position:absolute;right:var(--pad-r);bottom:5%;height:84%;display:flex;align-items:flex-end}
.cast img{height:100%;margin-left:-150px}.cast img:first-child{margin-left:0}
.floor{position:absolute;right:0;bottom:calc(5% + 6px);height:1px;width:58%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.12))}
</style></head><body>
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/examples/jsm/":"/three/examples/jsm/","ara3d":"/ara3d/index.js"}}</script>
<script type="module">
import * as THREE from 'three';
import { createCharacter } from 'ara3d';
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
renderer.setSize(${CW}, ${CH});renderer.setPixelRatio(1);renderer.toneMapping = THREE.ACESFilmicToneMapping;renderer.toneMappingExposure = 1.05;
renderer.setClearColor(0x000000, 0);
/** One character standing relaxed, lit as on the site, on a transparent background. Every character is framed at the same scale. */
window.portrait = async (preset) => {
  const hero = await createCharacter(preset, { assetsUrl: '/assets/', animations: ['idle'], detail: 'high' });
  const mixer = new THREE.AnimationMixer(hero.scene);mixer.clipAction(hero.clip('idle')).play();mixer.setTime(0.6);hero.scene.updateMatrixWorld(true);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a2f3a, 1.7));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);key.position.set(2.5, 4, 3);scene.add(key);
  const rim = new THREE.DirectionalLight(0x9db9ff, 1.6);rim.position.set(-3, 2.5, -3);scene.add(rim);
  scene.add(hero.scene);
  const camera = new THREE.PerspectiveCamera(22, ${CW} / ${CH}, 0.05, 50), height = 2.1, distance = height / (2 * Math.tan((camera.fov * Math.PI) / 360));
  camera.position.set(Math.sin(0.3) * distance, height / 2 - 0.04, Math.cos(0.3) * distance);camera.lookAt(0, height / 2 - 0.04, 0);
  renderer.render(scene, camera);hero.dispose();
  return renderer.domElement.toDataURL('image/png');
};
window.ready = true;
</script></body></html>`;
const MOUNTS: [string, string][] = [['/three/', join(root, 'node_modules/three/')], ['/ara3d/', join(root, 'packages/cli/dist/')], ['/assets/', join(pub, 'assets/')], ['/public/', pub + '/']];
const server = createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
  if (path === '/') { res.setHeader('Content-Type', 'text/html');res.end(PAGE);return; }
  const mount = MOUNTS.find(([p]) => path.startsWith(p)), file = mount && resolve(mount[1], path.slice(mount[0].length));
  if (!mount || !file || !file.startsWith(mount[1]) || !existsSync(file) || statSync(file).isDirectory()) { res.statusCode = 404;res.end();return; }
  res.setHeader('Content-Type', { '.js': 'text/javascript', '.svg': 'image/svg+xml' }[extname(file)] ?? 'application/octet-stream');res.end(readFileSync(file));
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const port = (server.address() as { port: number }).port, profile = mkdtempSync(join(tmpdir(), 'ara-brand-'));
const chrome = spawn(process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--use-angle=metal', `--user-data-dir=${profile}`, '--remote-debugging-pipe', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
const input = chrome.stdio[3] as Writable, output = chrome.stdio[4] as Readable, pending = new Map<number, (m: any) => void>();
let seq = 0, session = '', buf = '';
output.on('data', (c: Buffer) => { buf += c;let n;while ((n = buf.indexOf('\0')) >= 0) { const m = JSON.parse(buf.slice(0, n));buf = buf.slice(n + 1);if (m.id) { pending.get(m.id)?.(m);pending.delete(m.id); } } });
const send = (method: string, params: object = {}, attach = true) => new Promise<any>((ok, fail) => { const id = ++seq;pending.set(id, (m) => m.error ? fail(Error(m.error.message)) : ok(m.result));input.write(JSON.stringify({ id, method, params, ...(attach && session ? { sessionId: session } : {}) }) + '\0'); });
const evaluate = async (e: string) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);return r.result.value; };
try {
  const { targetId } = await send('Target.createTarget', { url: `http://127.0.0.1:${port}/` }, false);
  session = (await send('Target.attachToTarget', { targetId, flatten: true }, false)).sessionId;
  for (let i = 0; i < 100 && !(await evaluate('!!window.ready').catch(() => false)); i++) await new Promise((r) => setTimeout(r, 100));
  const portraits: string[] = [];
  for (const preset of CAST) portraits.push(await evaluate(`window.portrait(${JSON.stringify(preset)})`));
  for (const [name, width, height, pad] of [['og', 1200, 630, 72], ['github-social', 1280, 640, 88]] as const) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await evaluate(`(() => {
      document.querySelector('.card')?.remove();
      const card = document.createElement('div');card.className = 'card';card.style.cssText = 'width:${width}px;height:${height}px;--pad:${pad}px;--pad-r:${pad - 40}px';
      card.innerHTML = '<div class="text"><div class="brand"><img src="/public/logo.svg" alt=""><b>Ara <span>3D Gen</span></b></div>'
        + '<h1>Realistic 3D characters.<br>Rigged, animated, yours.</h1>'
        + '<p>Free and open source. Build in the browser, export GLB, FBX or OBJ, or use them in code.</p>'
        + '<div class="url"><i></i>ara3dgen.com</div></div><div class="floor"></div><div class="cast">'
        + ${JSON.stringify(portraits)}.map((src) => '<img src="' + src + '">').join('') + '</div>';
      document.body.prepend(card);
      return Promise.all([...card.querySelectorAll('img')].map((img) => img.decode()));
    })()`);
    const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width, height, scale: 1 } });
    const image = Buffer.from(shot.data, 'base64');
    if (name === 'og') { await sharp(image).jpeg({ quality: 88, mozjpeg: true }).toFile(join(pub, 'og.jpg'));console.log('Wrote public/og.jpg'); }
    else { writeFileSync(join(out, `${name}.png`), image);console.log(`Wrote out/brand/${name}.png`); }
  }
} finally {
  chrome.kill();server.close();await new Promise((r) => { chrome.once('exit', r);setTimeout(r, 3000); });
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* A leftover temp folder is harmless. */ }
}
