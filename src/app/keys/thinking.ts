/**
 * Waiting on the visitor's AI: a thin progress bar, what it's doing with the time taken ("Writing · 4.2k characters ·
 * 1:05"), and facts about the result as they arrive ("Military base", "3 characters"). Long waits get a note that
 * the visitor can keep working.
 */
import './thinking.css';

export const ARA_MARK = `<svg class="ara-mark" viewBox="0 0 64 64" aria-hidden="true"><defs><mask id="ara-think-cut" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64"><rect width="64" height="64" fill="#fff"/><path d="M10.5 56.5C15 49.5 23 46.5 31 45.5S38.5 44 40.5 43.3" transform="translate(0 -1.6)" fill="none" stroke="#000" stroke-width="11.2" stroke-linecap="round"/></mask></defs><g class="ara-body" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M32 22L20.9 45.6" stroke-width="9" mask="url(#ara-think-cut)"/><path d="M10.5 56.5C15 49.5 23 46.5 31 45.5S38.5 44 40.5 43.3" stroke-width="8"/><path d="M32 22L48.5 57" stroke-width="9"/></g><circle class="ara-head" cx="32" cy="9.5" r="6.5"/></svg>`;

export type Stage = 'sending' | 'thinking' | 'writing' | 'checking' | 'fixing' | 'building';
export interface Thinking {
  /** What it's doing, with an optional detail such as "4.2k characters". */
  phase(stage: Stage, detail?: string): void;
  /** Facts about the result so far, shown as they arrive. */
  facts(list: string[]): void;
  stop(): void;
  element: HTMLElement;
}

const LABEL: Record<Stage, string> = { sending: 'Sending', thinking: 'Thinking', writing: 'Writing', checking: 'Checking', fixing: 'Fixing a detail', building: 'Building' };
const clock = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const html = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export function thinking(_kind: string, into: HTMLElement, options: { patience?: string } = {}): Thinking {
  const el = document.createElement('div');
  el.className = 'ara-wait';
  el.innerHTML = `<div class="ara-bar" aria-hidden="true"><span></span></div>
    <p class="ara-line" role="status"><span class="ara-stage"></span><span class="ara-meta"></span></p>
    <ul class="ara-facts" aria-label="So far"></ul>
    <p class="ara-patience" hidden>${html(options.patience ?? 'Large results can take a few minutes. You can keep working; Ara lets you know when it’s ready.')}</p>`;
  into.append(el);
  const stageEl = el.querySelector<HTMLElement>('.ara-stage')!, meta = el.querySelector<HTMLElement>('.ara-meta')!, list = el.querySelector<HTMLElement>('.ara-facts')!, patience = el.querySelector<HTMLElement>('.ara-patience')!;
  const started = performance.now();
  let stage: Stage = 'sending', detail = '', shown = '';
  const paint = () => {
    const took = performance.now() - started;
    stageEl.textContent = LABEL[stage];
    meta.textContent = [detail, took >= 1000 ? clock(took) : ''].filter(Boolean).map(x => ` · ${x}`).join('');
    patience.hidden = took < 40_000;
  };
  const timer = window.setInterval(paint, 1000);
  paint();
  return {
    element: el,
    phase(next, d = '') { stage = next; detail = d; el.dataset.stage = next; paint(); },
    facts(items) {
      const key = items.join('\u0000');
      if (key === shown) return;
      shown = key;
      list.innerHTML = items.map(f => `<li>${html(f)}</li>`).join('');
    },
    stop() { clearInterval(timer); el.remove(); },
  };
}
