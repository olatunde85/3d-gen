/** Landing page: plays the cinematic video in a lightbox (loaded only when asked for). */
// Served with the site (CDN-cached), so viral traffic costs nothing extra.
const VIDEOS: Record<string, { src: string; poster: string }> = {
  cinematic: { src: `${import.meta.env.BASE_URL}media/ARA_3D_GEN_Cinematic_Cut_v9_4K.mp4`, poster: './docs/media/cinematic-poster.jpg' },
};

const modal = document.querySelector<HTMLDialogElement>('.video-modal')!;
const video = modal.querySelector('video')!;

function open(which: string) {
  const v = VIDEOS[which] ?? VIDEOS.cinematic;
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

document.querySelectorAll<HTMLElement>('[data-video]').forEach((b) => b.addEventListener('click', () => open(b.dataset.video || 'cinematic')));
modal.querySelector('.close')!.addEventListener('click', close);
// Click outside the video closes it; Esc closes the dialog natively.
modal.addEventListener('click', (e) => e.target === modal && close());
modal.addEventListener('close', () => video.pause());
