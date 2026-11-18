/**
 * Ara at work: a row of wireframe Ara characters (the figures the embed shows while a character loads) filling the
 * width, with a soft light passing through them one after another. Purely visual; progress is announced to screen
 * readers only.
 */
import './thinking.css';
import MALE from './img/loading-figure-male.png';
import FEMALE from './img/loading-figure-female.png';

export const ARA_MARK = `<svg class="ara-mark" viewBox="0 0 64 64" aria-hidden="true"><defs><mask id="ara-think-cut" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64"><rect width="64" height="64" fill="#fff"/><path d="M10.5 56.5C15 49.5 23 46.5 31 45.5S38.5 44 40.5 43.3" transform="translate(0 -1.6)" fill="none" stroke="#000" stroke-width="11.2" stroke-linecap="round"/></mask></defs><g class="ara-body" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M32 22L20.9 45.6" stroke-width="9" mask="url(#ara-think-cut)"/><path d="M10.5 56.5C15 49.5 23 46.5 31 45.5S38.5 44 40.5 43.3" stroke-width="8"/><path d="M32 22L48.5 57" stroke-width="9"/></g><circle class="ara-head" cx="32" cy="9.5" r="6.5"/></svg>`;

export interface Thinking {
  /** What stage it's at, and an optional detail such as "3.2k characters", for screen readers. */
  phase(stage: 'thinking' | 'writing' | 'checking' | 'fixing', detail?: string): void;
  stop(): void;
  element: HTMLElement;
}

const SAY = { thinking: 'Ara is thinking', writing: 'Ara is writing', checking: 'Ara is checking the result', fixing: 'Ara is fixing a detail' };

export function thinking(_kind: string, into: HTMLElement): Thinking {
  const el = document.createElement('div');
  el.className = 'ara-thinking';
  el.style.setProperty('--ara-male', `url("${MALE}")`);
  el.style.setProperty('--ara-female', `url("${FEMALE}")`);
  el.innerHTML = '<span class="ara-figures" aria-hidden="true"></span><span class="ara-status" role="status"></span>';
  into.append(el);
  const row = el.querySelector<HTMLElement>('.ara-figures')!;
  // As many figures as fit, alternating a man and a woman; each one's light starts a step after the last.
  const fill = () => {
    const per = row.clientHeight * 360 / 900 + 3, n = Math.max(3, Math.min(40, Math.floor((row.clientWidth + 3) / per)));
    if (row.childElementCount === n) return;
    row.style.setProperty('--n', String(n));
    row.replaceChildren(...Array.from({ length: n }, (_, i) => { const f = document.createElement('i'); f.style.setProperty('--i', String(i)); if (i % 2) f.className = 'f'; return f; }));
  };
  const watch = new ResizeObserver(fill); watch.observe(row); fill();
  const status = el.querySelector<HTMLElement>('.ara-status')!;
  let last = '';
  const api: Thinking = {
    element: el,
    phase(stage, detail = '') {
      el.dataset.stage = stage;
      const text = SAY[stage];
      // Announce stage changes, not every new character.
      if (text !== last) { last = text; status.textContent = `${text}${detail ? ` (${detail})` : ''}…`; }
    },
    stop() { watch.disconnect(); el.remove(); },
  };
  api.phase('thinking');
  return api;
}
