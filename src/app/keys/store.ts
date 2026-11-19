/**
 * The visitor's own API keys, kept only in this browser. "Remember on this device" uses localStorage; otherwise the
 * keys last for this browser session (sessionStorage). Every Ara app on the site shares them, and a change in one tab
 * reaches the others.
 */
import { PROVIDERS, type ProviderId } from './providers';

export interface SavedKey {
  key: string;
  /** When the key last passed a check (ms since epoch). */
  checked?: number;
  /** What the check found, shown in Keys: an account name, remaining voice characters and so on. */
  note?: string;
  /** Anthropic organisation keys need the workspace to use. */
  workspace?: string;
}
export interface KeySettings {
  keys: Partial<Record<ProviderId, SavedKey>>;
  /** The AI that writes for Assist: a provider with a saved key, and one of its models. */
  ai?: { provider: ProviderId; model: string };
  /** Voices a new dialogue line starts with, and the voices offered first. */
  voice?: { provider: ProviderId; voice: string };
  /** Generate cloud voices for new dialogue straight after Assist builds a film or game. */
  autoVoices: boolean;
  remember: boolean;
}

const KEY = 'ara.keys.v1';
const empty = (): KeySettings => ({ keys: {}, autoVoices: true, remember: true });
const listeners = new Set<(s: KeySettings) => void>();
let current: KeySettings | undefined;

function storage(remember: boolean): Storage | undefined {
  try { return remember ? localStorage : sessionStorage; } catch { return undefined; }
}
function clean(raw: unknown): KeySettings {
  const s = empty();
  if (!raw || typeof raw !== 'object') return s;
  const r = raw as Partial<KeySettings>;
  for (const id of Object.keys(PROVIDERS) as ProviderId[]) {
    const k = r.keys?.[id];
    if (k && typeof k.key === 'string' && k.key.length >= 8 && k.key.length <= 400) s.keys[id] = { key: k.key.trim(), ...(typeof k.checked === 'number' ? { checked: k.checked } : {}), ...(typeof k.note === 'string' ? { note: k.note.slice(0, 200) } : {}), ...(typeof k.workspace === 'string' && k.workspace ? { workspace: k.workspace.slice(0, 120) } : {}) };
  }
  if (r.ai && r.ai.provider in PROVIDERS && typeof r.ai.model === 'string') s.ai = { provider: r.ai.provider, model: r.ai.model.slice(0, 160) };
  if (r.voice && r.voice.provider in PROVIDERS && typeof r.voice.voice === 'string') s.voice = { provider: r.voice.provider, voice: r.voice.voice.slice(0, 120) };
  if (typeof r.autoVoices === 'boolean') s.autoVoices = r.autoVoices;
  if (typeof r.remember === 'boolean') s.remember = r.remember;
  return s;
}
function read(): KeySettings {
  for (const remember of [true, false]) {
    try { const text = storage(remember)?.getItem(KEY); if (text) return { ...clean(JSON.parse(text)), remember }; } catch { /* Unreadable: start again. */ }
  }
  return empty();
}

export function keySettings(): KeySettings { return current ??= read(); }

/** Saves a change, in the storage the visitor chose, and tells every listener (and other tabs). */
export function updateKeys(change: (s: KeySettings) => void): KeySettings {
  const next = structuredClone(keySettings());
  change(next);
  // Settings without a key are dropped, so a removed key never leaves a choice that can't work.
  if (next.ai && !next.keys[next.ai.provider]) next.ai = undefined;
  if (next.voice && !next.keys[next.voice.provider]) next.voice = undefined;
  current = next;
  const text = JSON.stringify(next);
  try { storage(!next.remember)?.removeItem(KEY); } catch { /* Not available. */ }
  try { storage(next.remember)?.setItem(KEY, text); } catch { /* Private mode: the keys last until the page closes. */ }
  for (const fn of listeners) fn(next);
  return next;
}

export function forgetAllKeys() { updateKeys(s => { s.keys = {}; s.ai = undefined; s.voice = undefined; }); }

export function onKeysChange(fn: (s: KeySettings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The key for a provider, or undefined when it isn't connected. */
export const keyFor = (id: ProviderId) => keySettings().keys[id];

if (typeof window !== 'undefined') window.addEventListener('storage', e => {
  if (e.key !== KEY) return;
  current = read();
  for (const fn of listeners) fn(current);
});
