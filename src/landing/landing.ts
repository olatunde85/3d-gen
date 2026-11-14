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
