/**
 * Landing page: the Studio reel and the Ara Play promo playing muted while on screen, either with sound in a lightbox, scroll
 * reveals and counting numbers.
 */
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
  animation="walk 2s, wave, cheer"
  expression="happy"></ara-character>`,
    character: { preset: 'The Priest', animation: 'walk 2s, wave, cheer', expression: 'happy' },
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
  const ATTRS = ['preset', 'animation', 'weapon', 'expression'];
  let current = 'library';
  const show = (name: string, focus = false) => {
    const tab = TABS[name];current = name;devx.dataset.tab = name;
    for (const t of tabs) { const on = t.dataset.tab === name;t.setAttribute('aria-selected', String(on));t.tabIndex = on ? 0 : -1;if (on && focus) t.focus(); }
    panel.setAttribute('aria-labelledby', `devx-tab-${name}`);
    file.textContent = tab.file;code.innerHTML = highlight(tab.code, tab.lang);caption.textContent = tab.caption;
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
  new IntersectionObserver((entries, observer) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    observer.disconnect();void import('../../packages/cli/src/embed');
  }, { rootMargin: '400px 0px' }).observe(devx);
}

// --- The live character in the hero: the cast below swaps who's on stage ------------------------------------------
const hero = document.getElementById('hero-character');
if (hero) {
  const name = document.getElementById('hero-name')!, edit = document.getElementById('hero-edit') as HTMLAnchorElement;
  const cards = [...document.querySelectorAll<HTMLAnchorElement>('.hero-cast .cast-card')];
  const show = (card: HTMLAnchorElement) => {
    hero.setAttribute('preset', card.dataset.preset!);hero.setAttribute('animation', card.dataset.animation!);
    name.textContent = card.dataset.preset!;edit.href = card.href;
    for (const c of cards) c.setAttribute('aria-current', String(c === card));
  };
  for (const card of cards) card.addEventListener('click', (e) => {
    // A plain click puts the character on stage; with a modifier key the link opens the builder as usual.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();show(card);
  });
  const first = cards.find((c) => c.dataset.preset === hero.getAttribute('preset'));
  if (first) first.setAttribute('aria-current', 'true');
  hero.setAttribute('assets-url', `${import.meta.env.BASE_URL}assets/`);
  // The 3D starts once the page has loaded, so the text and images come first.
  const start = () => void import('../../packages/cli/src/embed');
  if (document.readyState === 'complete') setTimeout(start, 200);
  else addEventListener('load', () => setTimeout(start, 200), { once: true });
}
