/**
 * Landing page: the Studio reel and the Ara Play promo playing muted while on screen, either with sound in a lightbox, scroll
 * reveals and counting numbers.
 */
import { siteMenu } from './nav';
siteMenu();
// Served with the site (CDN-cached), so viral traffic costs nothing extra.
const REELS: Record<string, { src: string; poster: string; label: string }> = {
  studio: { src: `${import.meta.env.BASE_URL}media/ara-studio-reel.mp4`, poster: `${import.meta.env.BASE_URL}media/ara-studio-reel-poster.jpg`, label: 'Ara 3D Studio reel' },
  play: { src: `${import.meta.env.BASE_URL}media/ara-play-promo.mp4`, poster: `${import.meta.env.BASE_URL}media/ara-play-promo-poster.jpg`, label: 'Ara Play promo' },
};
(window as unknown as { __landing: boolean }).__landing = true;
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

const modal = document.querySelector<HTMLDialogElement>('.video-modal')!;
const video = modal.querySelector('video')!;
const reels = [...document.querySelectorAll<HTMLVideoElement>('.reel-video')];

function open(name: string) {
  const r = REELS[name] ?? REELS.studio;
  if (video.getAttribute('src') !== r.src) { video.src = r.src;video.poster = r.poster; }
  modal.setAttribute('aria-label', r.label);
  for (const reel of reels) reel.pause();
  modal.showModal();
  void video.play().catch(() => {
    /* autoplay blocked: the controls are there */
  });
}
function close() {
  video.pause();
  modal.close();
}

document.querySelectorAll<HTMLElement>('[data-video]').forEach((b) => b.addEventListener('click', () => open(b.dataset.video ?? 'studio')));
modal.querySelector('.close')!.addEventListener('click', close);
// Click outside the video closes it; Esc closes the dialog natively.
modal.addEventListener('click', (e) => e.target === modal && close());
modal.addEventListener('close', () => {
  video.pause();
  for (const reel of reels) if (reel.dataset.visible === 'true' && !still) void reel.play().catch(() => {});
});

// Each reel loads when it comes near the screen and plays muted only while it is visible.
for (const reel of reels) {
  const src = REELS[reel.dataset.reel ?? 'studio']?.src ?? REELS.studio.src;
  if (still) {
    reel.preload = 'metadata';
    reel.src = src;
    reel.controls = true;
  } else {
    new IntersectionObserver(([entry]) => {
      reel.dataset.visible = String(entry.isIntersecting);
      if (entry.isIntersecting) {
        if (!reel.getAttribute('src')) reel.src = src;
        if (!modal.open) void reel.play().catch(() => {});
      } else reel.pause();
    }, { rootMargin: '200px 0px' }).observe(reel);
  }
}

// Sections rise into place once; grids follow one card after another.
document.querySelectorAll<HTMLElement>('.stagger').forEach((grid) => [...grid.children].forEach((c, i) => (c as HTMLElement).style.setProperty('--i', String(i))));
const reveal = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); reveal.unobserve(e.target); }
}, { rootMargin: '0px 0px -8% 0px' });
document.querySelectorAll('.reveal, .stagger').forEach((el) => reveal.observe(el));

// Numbers count up the first time they are seen.
const count = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    count.unobserve(e.target);
    const el = e.target as HTMLElement, target = Number(el.dataset.count), start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 1200);
      el.textContent = String(Math.round(target * (1 - (1 - t) ** 3)));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}, { threshold: 0.6 });
if (!still) document.querySelectorAll<HTMLElement>('[data-count]').forEach((el) => count.observe(el));

// --- Ara for Developers: each tab shows real code next to the character that code makes -------------------------
type Tab = { file: string; code: string; lang: 'js' | 'html' | 'sh' | 'chat'; character: Record<string, string>; caption: string };
const TABS: Record<string, Tab> = {
  library: {
    file: 'main.js', lang: 'js',
    code: `import { createCharacter } from 'ara3d';

const hero = await createCharacter('The Soldier', {
  animations: ['rifle_idle'],
  weapon: 'rifle',
});
scene.add(hero.scene);

const mixer = new THREE.AnimationMixer(hero.scene);
mixer.clipAction(hero.clip('rifle_idle')).play();`,
    character: { preset: 'The Soldier', animation: 'rifle_idle', weapon: 'rifle' },
    caption: 'Live: the character this code makes, built in your browser.',
  },
  embed: {
    file: 'index.html', lang: 'html',
    code: `<script type="module"
  src="https://cdn.jsdelivr.net/npm/ara3d@0/dist/embed.js">
</script>

<ara-character
  preset="The Priest"
  animation="walk 3s, look_around, talk_gestures"
  expression="happy"></ara-character>`,
    character: { preset: 'The Priest', animation: 'walk 3s, look_around, talk_gestures', expression: 'happy' },
    caption: 'Live: this exact tag, running on this page.',
  },
  cli: {
    file: 'Terminal', lang: 'sh',
    code: `$ npx ara3d export --preset "The Female Executive" \\
    --animations model_walk --formats glb,fbx

The Female Executive: 171 cm, 64,374 triangles, 3.1 s
  -> The_Female_Executive.glb (7.4 MB)
  -> The_Female_Executive.fbx (6.5 MB)
Done: 1 character, 2 files (14.0 MB) in 3.3 s`,
    character: { preset: 'The Female Executive', animation: 'model_walk' },
    caption: 'Live: the character in those files, ready for Unity, Unreal, Godot or Blender.',
  },
  mcp: {
    file: 'Claude', lang: 'chat',
    code: `You
Make a cyberpunk hacker with a rifle,
walking, as a GLB for my game.

Claude  ·  ara3d create_character
Made The Cyberpunk Hacker: 151 cm tall,
44,660 triangles, 1 animation, in 1.5 s.
~/ara3d-characters/The_Cyberpunk_Hacker.glb

$ claude mcp add ara3d -- npx -y ara3d mcp`,
    character: { preset: 'The Cyberpunk Hacker', animation: 'rifle_walk', weapon: 'rifle' },
    caption: 'Live: what the assistant made, from one sentence.',
  },
};

/** Captions for the recordings phones show instead of a live character. */
const RECORDED: Record<string, string> = {
  library: 'The character this code makes.', embed: 'The character this tag shows.',
  cli: 'The character in those files, ready for Unity, Unreal, Godot or Blender.', mcp: 'What the assistant made, from one sentence.',
};
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Just enough colour for each kind of snippet: keywords, strings, comments, tags, prompts and speakers. */
function highlight(code: string, lang: Tab['lang']) {
  if (lang === 'js') return code.replace(/('(?:[^'\\]|\\.)*')|\b(import|from|const|await|new)\b|\b([A-Za-z_]\w*)(?=\()|([^'\w]+|\w+)/g,
    (m, str, kw, fn) => str ? `<span class="tok-s">${esc(str)}</span>` : kw ? `<span class="tok-k">${kw}</span>` : fn ? `<span class="tok-f">${fn}</span>` : esc(m));
  if (lang === 'html') return code.replace(/("[^"]*")|(<\/?)([\w-]+)|\b([a-z-]+)(?==)|([^"<\w]+|\w+|<)/g,
    (m, str, open, tag, attr) => str ? `<span class="tok-s">${esc(str)}</span>` : tag ? `${esc(open)}<span class="tok-t">${tag}</span>` : attr ? `<span class="tok-a">${attr}</span>` : esc(m));
  if (lang === 'sh') return code.split('\n').map((line) => line.startsWith('$') ? `<span class="tok-p">$</span>${esc(line.slice(1))}` : `<span class="tok-c">${esc(line)}</span>`).join('\n');
  return code.split('\n').map((line) => line === 'You' || line.startsWith('Claude') ? `<span class="tok-u">${esc(line)}</span>`
    : line.startsWith('$') ? `<span class="tok-p">$</span>${esc(line.slice(1))}` : line.startsWith('~/') ? `<span class="tok-o">${esc(line)}</span>` : esc(line)).join('\n');
}

const devx = document.querySelector<HTMLElement>('.devx');
if (devx) {
  const tabs = [...devx.querySelectorAll<HTMLButtonElement>('[role="tab"]')], panel = devx.querySelector<HTMLElement>('[role="tabpanel"]')!;
  const code = document.getElementById('devx-code')!, file = document.getElementById('devx-file')!, caption = document.getElementById('devx-caption')!;
  const character = document.getElementById('devx-character')!, copy = document.getElementById('devx-copy') as HTMLButtonElement;
  // Phones, tablets and low-memory devices show recordings of these characters: one live 3D character (in the hero) is
  // as much as they comfortably hold. The recordings come from scripts/develop-clips.ts.
  const recorded = matchMedia('(max-width: 860px), (pointer: coarse)').matches || ((navigator as { deviceMemory?: number }).deviceMemory ?? 8) <= 4;
  let video: HTMLVideoElement | undefined;
  if (recorded) {
    video = document.createElement('video');
    Object.assign(video, { muted: true, loop: true, playsInline: true, autoplay: true, preload: 'none', className: 'devx-video' });
    video.setAttribute('aria-hidden', 'true');
    character.replaceWith(video);
  }
  const ATTRS = ['preset', 'animation', 'weapon', 'expression'];
  let current = 'library';
  const show = (name: string, focus = false) => {
    const tab = TABS[name];current = name;devx.dataset.tab = name;
    for (const t of tabs) { const on = t.dataset.tab === name;t.setAttribute('aria-selected', String(on));t.tabIndex = on ? 0 : -1;if (on && focus) t.focus(); }
    panel.setAttribute('aria-labelledby', `devx-tab-${name}`);
    file.textContent = tab.file;code.innerHTML = highlight(tab.code, tab.lang);caption.textContent = tab.caption;
    if (video) { video.src = `${import.meta.env.BASE_URL}media/develop/${name}.mp4`;caption.textContent = RECORDED[name];void video.play().catch(() => {});return; }
    for (const a of ATTRS) { const v = tab.character[a];if (v) character.setAttribute(a, v);else character.removeAttribute(a); }
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => show(t.dataset.tab!));
    // Arrow keys move between tabs, as in any tab list.
    t.addEventListener('keydown', (e) => {
      const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
      if (step) { e.preventDefault();show(tabs[(i + step + tabs.length) % tabs.length].dataset.tab!, true); }
    });
  });
  copy.addEventListener('click', async () => {
    // The copy is what you'd type or paste: commands without their output, the tag, or the code.
    const tab = TABS[current], text = tab.lang === 'sh' ? tab.code.split('\n\n')[0].replace(/^\$ /gm, '') : tab.lang === 'chat' ? 'claude mcp add ara3d -- npx -y ara3d mcp' : tab.code;
    await navigator.clipboard.writeText(text).catch(() => {});
    copy.dataset.copied = '';copy.textContent = 'Copied';
    setTimeout(() => { delete copy.dataset.copied;copy.textContent = 'Copy'; }, 1500);
  });
  show('library');
  // The live character loads when the section comes near the screen, from the site's own copy of the data.
  character.setAttribute('assets-url', `${import.meta.env.BASE_URL}assets/`);
  if (!recorded) new IntersectionObserver((entries, observer) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    observer.disconnect();void import('../../packages/cli/src/embed');
  }, { rootMargin: '400px 0px' }).observe(devx);
}

// --- The live character in the hero: drive them with the on-screen pad, the keyboard or a gamepad -----------------
type Body = { position: { x: number; z: number; set(x: number, y: number, z: number): void }; rotation: { y: number } };
type Driven = HTMLElement & { character?: { scene: Body; params: { name: string } }; playClip(id: string, fade?: number): boolean };
const drivenEl = document.getElementById('hero-character') as Driven | null;
const stageEl = document.querySelector<HTMLElement>('.hero-stage');
if (drivenEl && stageEl) {
  const driven = drivenEl;
  const name = document.getElementById('hero-name')!, edit = document.getElementById('hero-edit') as HTMLAnchorElement;
  const cards = [...document.querySelectorAll<HTMLAnchorElement>('.hero-cast .cast-card')];
  const paces = [...stageEl.querySelectorAll<HTMLButtonElement>('[data-gait]')];
  type Gait = 'idle' | 'walk' | 'run';
  const SPEED: Record<Gait, number> = { idle: 0, walk: 1.1, run: 2.5 };
  // The stage's floor: how far the character can go before turning back (metres; +z is towards the viewer). The sides
  // follow what the camera sees: the stage frames a standing person (about 1.8 m) with room around them.
  const MARGIN = Number(driven.getAttribute('margin')) || 1.3;
  const AREA = { x: 0.8, back: -1.6, front: 0.45 };
  const measure = () => { const { width, height } = stageEl.getBoundingClientRect();AREA.x = Math.max(0.4, (1.8 * MARGIN * width) / Math.max(1, height) / 2 - 0.45); };
  new ResizeObserver(measure).observe(stageEl);measure();
  // The camera looks from slightly right of front, so screen directions are turned by its angle.
  const VIEW = Math.atan2(0.35, 1), right = [Math.cos(VIEW), -Math.sin(VIEW)], away = [-Math.sin(VIEW), -Math.cos(VIEW)];
  let yHeld = true, shoulderHeld = true;
  let gait: Gait = 'idle', playing = '', heading = 0, last = 0, engaged = false, onScreen = true;
  const held = new Set<string>(), keys = new Set<string>();

  const setGait = (g: Gait) => { gait = g;for (const b of paces) b.setAttribute('aria-checked', String(b.dataset.gait === g)); };
  const play = (clip: Gait) => { if (clip !== playing && driven.playClip(clip, 0.22)) playing = clip; };
  const turnTowards = (target: number, rate: number) => {
    const diff = Math.atan2(Math.sin(target - heading), Math.cos(target - heading));
    heading += Math.sign(diff) * Math.min(Math.abs(diff), rate);
  };

  function step(now: number) {
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;last = now;
    requestAnimationFrame(step);
    const body = driven.character?.scene;
    if (!body || !onScreen) return;
    // Input: the pad, arrow keys or WASD, and a connected gamepad's stick or d-pad.
    let ix = 0, iy = 0, pad: Gait | undefined, padRun = false;
    const on = (d: string) => held.has(d) || keys.has(d);
    if (on('left')) ix -= 1;if (on('right')) ix += 1;if (on('up')) iy += 1;if (on('down')) iy -= 1;
    for (const g of navigator.getGamepads?.() ?? []) {
      if (!g) continue;
      const [sx = 0, sy = 0] = g.axes;
      if (Math.hypot(sx, sy) > 0.25) { ix += sx;iy -= sy; }
      if (g.buttons[14]?.pressed) ix -= 1;if (g.buttons[15]?.pressed) ix += 1;if (g.buttons[12]?.pressed) iy += 1;if (g.buttons[13]?.pressed) iy -= 1;
      if (g.buttons[2]?.pressed) pad = 'idle';else if (g.buttons[0]?.pressed) pad = 'walk';else if (g.buttons[1]?.pressed) pad = 'run';
      padRun ||= !!g.buttons[1]?.pressed;
      // LB and RB switch characters, once per press.
      const lb = !!g.buttons[4]?.pressed, rb = !!g.buttons[5]?.pressed;
      if (lb && !shoulderHeld) stepCast(-1);else if (rb && !shoulderHeld) stepCast(1);
      shoulderHeld = lb || rb;
      // Y opens the character in the builder, once per press.
      if (g.buttons[3]?.pressed && !yHeld) location.href = edit.href;
      yHeld = !!g.buttons[3]?.pressed;
    }
    if (pad && pad !== gait) setGait(pad);
    const steering = Math.hypot(ix, iy) > 0.1;
    // Holding a direction while idle walks that way, or runs with Shift; letting go stops again.
    const pace: Gait = gait !== 'idle' ? (keys.has('shift') || padRun ? 'run' : gait) : steering ? (keys.has('shift') || padRun ? 'run' : 'walk') : 'idle';
    if (steering) {
      const wx = right[0] * ix + away[0] * iy, wz = right[1] * ix + away[1] * iy;
      turnTowards(Math.atan2(wx, wz), dt * 9);
    }
    let moving = pace !== 'idle';
    if (moving) {
      const x = body.position.x + Math.sin(heading) * SPEED[pace] * dt, z = body.position.z + Math.cos(heading) * SPEED[pace] * dt;
      const inside = Math.abs(x) <= AREA.x && z >= AREA.back && z <= AREA.front;
      if (inside) body.position.set(x, 0, z);
      // At the edge, turn back towards the middle of the stage (or stop, if someone is steering into it).
      else if (steering) moving = false;
      else turnTowards(Math.atan2(-body.position.x, -body.position.z), dt * 5);
    }
    body.rotation.y = heading;
    play(moving ? pace : 'idle');
  }

  // The on-screen direction pad: held while pressed.
  for (const button of stageEl.querySelectorAll<HTMLButtonElement>('[data-dir]')) {
    const dir = button.dataset.dir!;
    const press = (e: PointerEvent) => { e.preventDefault();engaged = true;held.add(dir);button.classList.add('held');button.setPointerCapture?.(e.pointerId); };
    const release = () => { held.delete(dir);button.classList.remove('held'); };
    button.addEventListener('pointerdown', press);
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) button.addEventListener(type, release);
    button.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  for (const b of paces) b.addEventListener('click', () => { engaged = true;setGait(b.dataset.gait as Gait); });

  // The keyboard drives once someone has used the controls or clicked the stage, and only while it's on screen.
  const KEYS: Record<string, string> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
  stageEl.addEventListener('pointerdown', () => { engaged = true; });
  addEventListener('keydown', (e) => {
    if (!engaged || !onScreen || e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement).tagName)) return;
    const dir = KEYS[e.key] ?? KEYS[e.key.toLowerCase()];
    if (dir) { e.preventDefault();keys.add(dir); }
    else if (e.key === 'Shift') keys.add('shift');
    else if (e.key === 'q' || e.key === 'e') stepCast(e.key === 'q' ? -1 : 1);
    else if (e.key === '1' || e.key === '2' || e.key === '3') setGait((['idle', 'walk', 'run'] as const)[Number(e.key) - 1]);
  });
  addEventListener('keyup', (e) => { const dir = KEYS[e.key] ?? KEYS[e.key.toLowerCase()];if (dir) keys.delete(dir);if (e.key === 'Shift') keys.delete('shift'); });
  addEventListener('blur', () => { keys.clear();held.clear(); });
  new IntersectionObserver(([e]) => { onScreen = e.isIntersecting;if (!onScreen) { engaged = false;keys.clear(); } }).observe(stageEl);

  // The cast below puts another character on stage, standing idle.
  const mark = (card?: HTMLAnchorElement) => { for (const c of cards) c.setAttribute('aria-current', String(c === card)); };
  const putOnStage = (card: HTMLAnchorElement) => {
    if (driven.getAttribute('preset') === card.dataset.preset) return;
    driven.setAttribute('preset', card.dataset.preset!);name.textContent = card.dataset.preset!;edit.href = card.href;mark(card);
  };
  /** L1 and R1: the previous or next character in the cast, round and round. */
  const stepCast = (by: number) => {
    const at = cards.findIndex((c) => c.dataset.preset === driven.getAttribute('preset'));
    putOnStage(cards[(at + by + cards.length) % cards.length]);
  };
  for (const card of cards) card.addEventListener('click', (e) => {
    // A plain click puts the character on stage; with a modifier key the link opens the builder as usual.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();putOnStage(card);
  });
  for (const b of stageEl.querySelectorAll<HTMLButtonElement>('[data-step]')) b.addEventListener('click', () => { engaged = true;stepCast(Number(b.dataset.step)); });
  // A new character starts in the middle, facing the viewer.
  driven.addEventListener('load', () => { heading = 0;playing = 'idle';setGait('idle'); });
  mark(cards.find((c) => c.dataset.preset === driven.getAttribute('preset')));
  requestAnimationFrame(step);

  driven.setAttribute('assets-url', `${import.meta.env.BASE_URL}assets/`);
  // The 3D starts once the page has loaded, so the text and images come first.
  const start = () => void import('../../packages/cli/src/embed');
  if (document.readyState === 'complete') setTimeout(start, 200);
  else addEventListener('load', () => setTimeout(start, 200), { once: true });
}
