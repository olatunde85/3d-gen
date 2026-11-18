/**
 * The Keys window: paste a key, Ara recognises the provider and checks it, then lists what's connected, which AI writes
 * for Assist and which voices Sound offers. One window for the builder, Studio and Play.
 */
import './keys.css';
import { PROVIDERS, detectProvider, checkKey, aiModels, ORDER, type ProviderId, type ModelInfo } from './providers';
import { keySettings, updateKeys, onKeysChange, forgetAllKeys, type KeySettings } from './store';
import { ProviderError } from './http';

/** A pasted key without spaces, line breaks or quotes around it. */
const cleanKey = (s: string) => s.replace(/\s+/g, '').replace(/^["'`]+|["'`]+$/g, '');
const html = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
let dialog: HTMLDialogElement | undefined;
let afterClose: (() => void) | undefined;
/** Problems found by the last check of each key, until it's checked again. */
const problems = new Map<ProviderId, string>();
const models = new Map<ProviderId, ModelInfo[]>();

export interface OpenKeys {
  /** Which part to bring forward: the AI writer or the voices. */
  focus?: 'ai' | 'voice';
  /** Called once the window closes, for example to retry what needed a key. */
  then?: () => void;
}

/** Opens Keys. */
export function openKeys(options: OpenKeys = {}) {
  dialog ??= create();
  afterClose = options.then;
  render();
  if (!dialog.open) dialog.showModal();
  const input = dialog.querySelector<HTMLInputElement>('[data-r="paste"]')!;
  const target = options.focus && dialog.querySelector<HTMLElement>(`[data-section="${options.focus}"]`);
  if (target && hasRole(options.focus!)) target.scrollIntoView({ block: 'nearest' });
  input.focus();
  void refreshModels();
}

const hasRole = (role: 'ai' | 'voice', s: KeySettings = keySettings()) => ORDER.some(id => s.keys[id] && PROVIDERS[id].roles.includes(role));

function create() {
  const d = document.body.appendChild(document.createElement('dialog'));
  d.className = 'ak-keys'; d.id = 'keys-dialog'; d.setAttribute('aria-labelledby', 'keys-title');
  d.innerHTML = `
    <div class="ak-top"><span class="ak-eyebrow">YOUR KEYS</span><button class="ak-icon" data-r="close" aria-label="Close Keys">✕</button></div>
    <h2 id="keys-title">Use your own AI and voices</h2>
    <p class="ak-muted">Connect your own account to let Assist write here and to give characters natural voices. You pay the provider directly, usually a few cents. Keys stay in this browser.</p>
    <section class="ak-add" aria-labelledby="keys-add">
      <h3 id="keys-add">Add a key</h3>
      <div class="ak-paste"><label class="sr-only" for="keys-paste">API key</label><input id="keys-paste" data-r="paste" type="password" autocomplete="off" spellcheck="false" placeholder="Paste a key from any provider below" /><button class="ak-btn ak-primary" data-r="connect">Connect</button></div>
      <div class="ak-workspace" data-r="workspace-row" hidden><label class="sr-only" for="keys-workspace">Anthropic workspace ID</label><input id="keys-workspace" data-r="workspace" placeholder="Workspace ID, such as wrkspc_…" autocomplete="off" spellcheck="false" /><button class="ak-btn" data-r="workspace-save">Use workspace</button></div>
      <p class="ak-detect" data-r="detect" role="status" aria-live="polite"></p>
      <div class="ak-pick" data-r="pick" hidden>${ORDER.map(id => `<button class="ak-btn" data-pick="${id}">${PROVIDERS[id].name}</button>`).join('')}</div>
      <label class="ak-check"><input type="checkbox" data-r="remember" /><span>Remember keys on this device. Turn off on a shared computer: keys are then forgotten when the browser closes.</span></label>
    </section>
    <section class="ak-section" data-section="ai" aria-labelledby="keys-ai">
      <div class="ak-section-head"><h3 id="keys-ai">AI for Assist</h3><span class="ak-muted ak-small">Writes characters, films and games</span></div>
      <ul class="ak-list" data-r="ai-list"></ul>
      <div class="ak-choice" data-r="ai-choice" hidden><label for="keys-model">Assist writes with</label><select id="keys-model" data-r="model"></select><p class="ak-muted ak-small" data-r="model-note"></p></div>
    </section>
    <section class="ak-section" data-section="voice" aria-labelledby="keys-voice">
      <div class="ak-section-head"><h3 id="keys-voice">Voices</h3><span class="ak-muted ak-small">Speak dialogue in Studio and Play</span></div>
      <ul class="ak-list" data-r="voice-list"></ul>
      <label class="ak-check" data-r="auto-row" hidden><input type="checkbox" data-r="auto" /><span>Voice new dialogue automatically when Assist builds a film or game. Each line uses a little of your voice provider’s allowance.</span></label>
    </section>
    <section class="ak-privacy" aria-label="Privacy">
      <ul>
        <li>Your key goes only to its provider, straight from this page. Ara has no server in between and never sees it.</li>
        <li>Set a monthly spending limit in your provider’s settings if you want a hard cap.</li>
      </ul>
      <div class="ak-footer"><button class="ak-link" data-r="forget-all">Remove all keys</button><button class="ak-btn" data-r="done">Done</button></div>
    </section>`;
  const $ = <E extends HTMLElement = HTMLElement>(r: string) => d.querySelector<E>(`[data-r="${r}"]`)!;
  const paste = $<HTMLInputElement>('paste'), detect = $('detect');
  let checking = false, pending: { id: ProviderId; key: string } | undefined;

  const say = (text: string, kind: '' | 'ok' | 'bad' | 'busy' = '') => { detect.textContent = text; detect.className = `ak-detect ${kind}`; };
  paste.addEventListener('input', () => {
    $('workspace-row').hidden = true; pending = undefined;
    $('pick').hidden = true;
    const key = cleanKey(paste.value);
    if (!key) return say('');
    const found = detectProvider(key);
    say(found ? `Looks like a ${PROVIDERS[found].name} key.` : 'Press Connect, then choose which service this key is for.');
  });
  const connect = async (id: ProviderId, key: string, workspace?: string) => {
    checking = true; $<HTMLButtonElement>('connect').disabled = true;
    say(`Checking with ${PROVIDERS[id].name}…`, 'busy');
    try {
      const result = await checkKey(id, { key, workspace });
      updateKeys(s => {
        s.keys[id] = { key, checked: Date.now(), note: result.note, ...(workspace ? { workspace } : {}) };
        // The first AI connected writes for Assist; the first voice provider starts each new line.
        if (PROVIDERS[id].roles.includes('ai') && !s.ai && result.models?.length) s.ai = { provider: id, model: result.models[0].id };
      });
      if (result.models) models.set(id, result.models);
      problems.delete(id);
      paste.value = ''; $('workspace-row').hidden = true; $('pick').hidden = true; pending = undefined;
      const roles = PROVIDERS[id].roles;
      say(`Connected to ${PROVIDERS[id].name}. ${roles.length > 1 ? 'It covers Assist and voices.' : roles[0] === 'ai' ? 'Assist can write here now.' : 'Its voices are in Sound now.'}`, 'ok');
    } catch (error) {
      const e = error as ProviderError;
      if (e.problem === 'workspace') { pending = { id, key }; $('workspace-row').hidden = false; $<HTMLInputElement>('workspace').focus(); }
      say(e.message, 'bad');
    } finally { checking = false; $<HTMLButtonElement>('connect').disabled = false; render(); }
  };
  $('connect').addEventListener('click', () => {
    const key = cleanKey(paste.value);
    if (!key || checking) return paste.focus();
    const id = detectProvider(key);
    if (id) return void connect(id, key);
    // Unrecognised: the visitor says which service it's for. Ara never tries a key on other services.
    say('Which service is this key for?');
    $('pick').hidden = false;
    $('pick').querySelector('button')?.focus();
  });
  $('pick').addEventListener('click', e => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-pick]')?.dataset.pick as ProviderId | undefined;
    const key = cleanKey(paste.value);
    if (id && key) { $('pick').hidden = true; void connect(id, key); }
  });
  paste.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('connect').click(); } });
  $('workspace-save').addEventListener('click', () => {
    const ws = $<HTMLInputElement>('workspace').value.trim();
    if (pending && ws) void connect(pending.id, pending.key, ws);
  });
  $<HTMLInputElement>('remember').addEventListener('change', e => updateKeys(s => { s.remember = (e.target as HTMLInputElement).checked; }));
  $<HTMLInputElement>('auto').addEventListener('change', e => updateKeys(s => { s.autoVoices = (e.target as HTMLInputElement).checked; }));
  $<HTMLSelectElement>('model').addEventListener('change', e => {
    const [provider, ...rest] = (e.target as HTMLSelectElement).value.split(':');
    updateKeys(s => { s.ai = { provider: provider as ProviderId, model: rest.join(':') }; });
  });
  d.addEventListener('click', async e => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!el) return;
    const id = el.dataset.id as ProviderId;
    if (el.dataset.act === 'remove') { updateKeys(s => { delete s.keys[id]; }); problems.delete(id); models.delete(id); render(); }
    if (el.dataset.act === 'recheck') {
      const saved = keySettings().keys[id]; if (!saved) return;
      el.textContent = 'Checking…'; (el as HTMLButtonElement).disabled = true;
      try { const r = await checkKey(id, saved); problems.delete(id); if (r.models) models.set(id, r.models); updateKeys(s => { if (s.keys[id]) Object.assign(s.keys[id]!, { checked: Date.now(), note: r.note }); }); }
      catch (error) { problems.set(id, (error as Error).message); }
      render();
    }
  });
  $('forget-all').addEventListener('click', () => { if (confirm('Remove every key saved in this browser?')) { forgetAllKeys(); problems.clear(); models.clear(); render(); } });
  for (const r of ['close', 'done']) $(r).addEventListener('click', () => d.close());
  d.addEventListener('close', () => { paste.value = ''; say(''); const then = afterClose; afterClose = undefined; then?.(); });
  onKeysChange(() => { if (d.open) render(); });
  return d;
}

function row(id: ProviderId, s: KeySettings, role: 'ai' | 'voice') {
  const p = PROVIDERS[id], saved = s.keys[id], problem = problems.get(id);
  const state = saved ? problem ? 'problem' : 'on' : 'off';
  const info = problem ?? (saved ? saved.note ?? 'Connected' : p.blurb[role] ?? '');
  return `<li class="ak-provider ${state}">
    <span class="ak-name"><span class="ak-dot" aria-hidden="true"></span>${html(p.name)}${p.free ? `<span class="ak-tag">${html(p.free)}</span>` : ''}${!saved ? `<span class="ak-tag" title="Keys start with this">${html(p.prefix)}</span>` : ''}</span>
    <span class="ak-actions">${saved
      ? `<button class="ak-link" data-act="recheck" data-id="${id}">Check</button><button class="ak-link" data-act="remove" data-id="${id}" aria-label="Remove ${html(p.name)} key">Remove</button>`
      : `<a class="ak-small" href="${p.keyUrl}" target="_blank" rel="noopener">Get a key ↗</a>`}</span>
    <span class="ak-info">${html(info)}</span>
  </li>`;
}

function render() {
  if (!dialog) return;
  const s = keySettings(), $ = <E extends HTMLElement = HTMLElement>(r: string) => dialog!.querySelector<E>(`[data-r="${r}"]`)!;
  $<HTMLInputElement>('remember').checked = s.remember;
  $('ai-list').innerHTML = ORDER.filter(id => PROVIDERS[id].roles.includes('ai')).map(id => row(id, s, 'ai')).join('');
  $('voice-list').innerHTML = ORDER.filter(id => PROVIDERS[id].roles.includes('voice')).map(id => row(id, s, 'voice')).join('');
  $('auto-row').hidden = !hasRole('voice', s);
  $<HTMLInputElement>('auto').checked = s.autoVoices;
  const choice = $('ai-choice'), select = $<HTMLSelectElement>('model');
  const connected = ORDER.filter(id => s.keys[id] && PROVIDERS[id].roles.includes('ai'));
  choice.hidden = !connected.length;
  select.replaceChildren();
  for (const id of connected) {
    const group = document.createElement('optgroup'); group.label = PROVIDERS[id].name;
    const list = models.get(id) ?? (s.ai?.provider === id ? [{ id: s.ai.model, name: s.ai.model }] : []);
    for (const m of list) group.append(new Option(m.note ? `${m.name} · ${m.note}` : m.name, `${id}:${m.id}`));
    if (!list.length) group.append(Object.assign(new Option('Loading models…', ''), { disabled: true }));
    select.append(group);
  }
  if (s.ai) select.value = `${s.ai.provider}:${s.ai.model}`;
  const chosen = s.ai && models.get(s.ai.provider)?.find(m => m.id === s.ai!.model);
  $('model-note').textContent = chosen?.detail ?? (s.ai ? '' : 'Choose which model writes for Assist.');
}

/** Loads the model list for each connected AI provider, for the model picker. */
async function refreshModels() {
  const s = keySettings();
  await Promise.all(ORDER.filter(id => s.keys[id] && PROVIDERS[id].roles.includes('ai') && !models.has(id)).map(async id => {
    try { models.set(id, await aiModels(id, s.keys[id]!)); problems.delete(id); }
    catch (error) { problems.set(id, (error as Error).message); }
  }));
  render();
}
