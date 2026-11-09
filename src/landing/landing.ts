/**
 * Landing page: the cinematic and Studio reel in a lightbox (loaded only when asked for), the Studio reel playing
 * muted while it is on screen, scroll reveals and counting numbers.
 */
// Served with the site (CDN-cached), so viral traffic costs nothing extra.
const VIDEOS: Record<string, { src: string; poster: string }> = {
  cinematic: { src: `${import.meta.env.BASE_URL}media/ARA_3D_GEN_Cinematic_Cut_v9_4K.mp4`, poster: './docs/media/cinematic-poster.jpg' },
  studio: { src: `${import.meta.env.BASE_URL}media/ara-studio-reel.mp4`, poster: `${import.meta.env.BASE_URL}media/ara-studio-reel-poster.jpg` },
};
(window as unknown as { __landing: boolean }).__landing = true;
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

const modal = document.querySelector<HTMLDialogElement>('.video-modal')!;
const video = modal.querySelector('video')!;
const reel = document.querySelector<HTMLVideoElement>('.reel-video');

function open(which: string) {
  const v = VIDEOS[which] ?? VIDEOS.cinematic;
  if (video.getAttribute('src') !== v.src) {
    video.poster = v.poster;
    video.src = v.src;
  }
  reel?.pause();
  modal.showModal();
  void video.play().catch(() => {
    /* autoplay blocked: the controls are there */
  });
}
function close() {
  video.pause();
  modal.close();
}

document.querySelectorAll<HTMLElement>('[data-video]').forEach((b) => b.addEventListener('click', () => open(b.dataset.video || 'cinematic')));
modal.querySelector('.close')!.addEventListener('click', close);
// Click outside the video closes it; Esc closes the dialog natively.
modal.addEventListener('click', (e) => e.target === modal && close());
modal.addEventListener('close', () => {
  video.pause();
  if (reel && reel.dataset.visible === 'true' && !still) void reel.play().catch(() => {});
});

// The reel loads when it comes near the screen and plays muted only while it is visible.
if (reel) {
  if (still) {
    reel.preload = 'metadata';
    reel.src = VIDEOS.studio.src;
    reel.controls = true;
  } else {
    new IntersectionObserver(([entry]) => {
      reel.dataset.visible = String(entry.isIntersecting);
      if (entry.isIntersecting) {
        if (!reel.getAttribute('src')) reel.src = VIDEOS.studio.src;
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
