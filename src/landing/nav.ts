/** The site menu on small screens: the button opens the links under the bar; a link, Escape or a tap outside closes it. */
export function siteMenu() {
  const bar = document.querySelector<HTMLElement>('.nav'), button = bar?.querySelector<HTMLButtonElement>('.nav-menu');
  if (!bar || !button) return;
  const set = (open: boolean) => { bar.classList.toggle('open', open);button.setAttribute('aria-expanded', String(open));button.setAttribute('aria-label', open ? 'Close menu' : 'Menu'); };
  button.addEventListener('click', () => set(!bar.classList.contains('open')));
  bar.querySelectorAll('nav a').forEach((a) => a.addEventListener('click', () => set(false)));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && bar.classList.contains('open')) { set(false);button.focus(); } });
  addEventListener('pointerdown', (e) => { if (bar.classList.contains('open') && !bar.contains(e.target as Node)) set(false); });
  matchMedia('(min-width: 861px)').addEventListener('change', (m) => { if (m.matches) set(false); });
}
