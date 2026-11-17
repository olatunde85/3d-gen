/**
 * The developers page: the menu, install tabs, copy buttons and embed demos. The live playground (./developers) loads
 * only on devices with room for it; phones and low-memory devices get the page without it, and recordings of the
 * embed demos instead of live characters.
 */
import { lowMemory } from '../landing/device';
import { siteMenu } from '../landing/nav';

siteMenu();
const $ = <T extends HTMLElement>(selector: string) => document.querySelector(selector) as T;
const ASSETS = `${import.meta.env.BASE_URL}assets/`;

// --- Install tabs and copy buttons -----------------------------------------------------------------------------
const INSTALL: Record<string, string> = { npm: 'npm install ara3d three', cli: 'npx ara3d export --preset "The Soldier"', mcp: 'claude mcp add ara3d -- npx -y ara3d mcp' };
for (const tab of document.querySelectorAll<HTMLButtonElement>('[data-install]')) tab.onclick = () => {
  for (const t of document.querySelectorAll('[data-install]')) t.setAttribute('aria-selected', String(t === tab));
  $('#install-command').textContent = INSTALL[tab.dataset.install!];
};
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-copy]')) button.onclick = async () => {
  await navigator.clipboard.writeText($(button.dataset.copy!).textContent ?? '');
  button.dataset.copied = '';button.textContent = 'Copied';
  setTimeout(() => { delete button.dataset.copied;button.textContent = 'Copy'; }, 1500);
};

// --- The playground: live only where there's room for it ---------------------------------------------------------
if (lowMemory) {
  $('#playground')?.remove();
  for (const link of document.querySelectorAll('a[href="#playground"]')) link.remove();
} else void import('./developers');

// --- Embed demos: recordings (scripts/develop-clips.ts) on phones and low-memory devices -------------------------
const demo = $<HTMLDivElement>('#embed-demo');
if (lowMemory) {
  for (const [i, el] of [...demo.querySelectorAll('ara-character')].entries()) {
    const video = document.createElement('video');
    Object.assign(video, { muted: true, loop: true, playsInline: true, autoplay: true, preload: 'none', className: 'dev-embed-video' });
    video.src = `${import.meta.env.BASE_URL}media/develop/demo-${['priest', 'executive', 'random'][i]}.mp4`;
    video.setAttribute('aria-label', 'A recording of this embed');
    el.replaceWith(video);
  }
} else {
  for (const el of demo.querySelectorAll('ara-character')) el.setAttribute('assets-url', ASSETS);
  new IntersectionObserver((entries, observer) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    observer.disconnect();void import('../../packages/cli/src/embed');
  }, { rootMargin: '200px' }).observe(demo);
}
