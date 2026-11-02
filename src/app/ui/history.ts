/**
 * Undo / redo for the character, whichever part of the UI changed it. A change is recorded once it
 * settles (dragging a slider is one step), and Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z and Ctrl+Y work
 * anywhere outside text fields.
 */
import type { HumanParams } from '../../core/params';
import type { Store } from './store';

export interface History {
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  /** Called whenever undo / redo availability may have changed. */
  onChange(fn: () => void): void;
}

export function history(store: Store): History {
  const snap = (p: HumanParams) => JSON.stringify(p);
  let current = snap(store.params), timer = 0;
  const past: string[] = [], future: string[] = [], listeners: (() => void)[] = [];
  const changed = () => listeners.forEach((fn) => fn());
  // Record the settled state (a burst of changes counts once).
  const commit = () => {
    clearTimeout(timer);
    const now = snap(store.params);
    if (now === current) return;
    past.push(current);
    if (past.length > 100) past.shift();
    current = now;
    future.length = 0;
    changed();
  };
  store.on('params', () => {
    clearTimeout(timer);
    timer = window.setTimeout(commit, 450);
  });
  const go = (from: string[], to: string[]) => {
    commit();
    const s = from.pop();
    if (s === undefined) return;
    to.push(current);
    current = s;
    store.replaceAll(JSON.parse(s));
    // The rebuild this triggers settles on `current`, so it isn't recorded again.
    changed();
  };
  const h: History = {
    undo: () => go(past, future),
    redo: () => go(future, past),
    canUndo: () => past.length > 0 || snap(store.params) !== current,
    canRedo: () => future.length > 0,
    onChange: (fn) => void listeners.push(fn),
  };
  window.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('input[type=text], input[type=number], textarea, select, [contenteditable]')) return;
    const mod = e.metaKey || e.ctrlKey, key = e.key.toLowerCase();
    if (mod && key === 'z') {
      e.preventDefault();
      if (e.shiftKey) h.redo();
      else h.undo();
    } else if (mod && key === 'y') {
      e.preventDefault();
      h.redo();
    }
  });
  return h;
}
