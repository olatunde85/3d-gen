/** Landing page: plays the demo videos in a lightbox (loaded only when asked for). */
// Served with the site (CDN-cached), so viral traffic costs nothing extra.
const VIDEOS: Record<string, { src: string; poster: string }> = {
  demo: { src: `${import.meta.env.BASE_URL}media/ara-3d-gen-demo.mp4`, poster: './docs/media/video-poster.jpg' },
  'whats-new': { src: `${import.meta.env.BASE_URL}media/ara-3d-gen-whats-new.mp4`, poster: './docs/media/whats-new-poster.jpg' },
};

const modal = document.querySelector<HTMLDialogElement>('.video-modal')!;
const video = modal.querySelector('video')!;

function open(which: string) {
  const v = VIDEOS[which] ?? VIDEOS.demo;
  if (video.getAttribute('src') !== v.src) {
    video.poster = v.poster;
    video.src = v.src;
  }
  modal.showModal();
  void video.play().catch(() => {
    /* autoplay blocked: the controls are there */
  });
}
function close() {
  video.pause();
  modal.close();
}

document.querySelectorAll<HTMLElement>('[data-video]').forEach((b) => b.addEventListener('click', () => open(b.dataset.video || 'demo')));
modal.querySelector('.close')!.addEventListener('click', close);
// Click outside the video closes it; Esc closes the dialog natively.
modal.addEventListener('click', (e) => e.target === modal && close());
modal.addEventListener('close', () => video.pause());
