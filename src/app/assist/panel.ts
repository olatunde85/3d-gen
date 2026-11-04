/**
 * LLM Assist: describe something, get JSON from any AI chat (or generate it here with your own
 * Anthropic key), review it and build. Shared by the character builder and Ara Studio.
 */
import './panel.css';
import { extractJson, fixRequest, hadSurroundingText } from './extract';
import { MODELS, checkConnection, costOf, forgetConnection, generate, loadConnection, maskKey, modelOf, saveConnection, StillInvalid, type Progress, type Usage } from './claude';

export interface AssistDraft { brief: string; json: string; context: boolean; open: boolean; guideOpen: boolean; mode?: Mode }
type Mode = 'chat' | 'claude';

export interface AssistConfig<T> {
  /** An existing empty <dialog> to fill, or one is created. */
  dialog?: HTMLDialogElement;
  /** Prefix for element ids. */
  id: string;
  app: string;
  noun: 'film' | 'character';
  title: string;
  intro: string;
  placeholder: string;
  starters: [label: string, brief: string][];
  contextLabel: string;
  guideFile: string;
  /** The full guide for an AI chat, with the brief and optionally the current state embedded. */
  guide(brief: string, current: boolean): string;
  /** In-app generation: the fixed guide (cached) and a prompt carrying the brief and current state. */
  request(brief: string, current: boolean): { system: string; prompt: string };
  parse(json: string): T;
  describe(value: T): { headline: string; facts: string[] };
  example(): unknown;
  /** Applies the result; throws a readable error if it can't. */
  build(value: T): Promise<void>;
  canOpen(): boolean | Promise<boolean>;
  footnote: string;
  /** Where drafts persist when the host doesn't save them itself. */
  storageKey?: string;
}

/** Ideas shown at once; "More ideas" pages through the rest. */
const IDEAS = 4;
const html = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const pretty = (text: string) => { try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return text; } };
const tokens = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n);

export function assistPanel<T>(cfg: AssistConfig<T>) {
  const id = cfg.id, noun = cfg.noun, Noun = noun[0].toUpperCase() + noun.slice(1);
  const dialog = cfg.dialog ?? document.body.appendChild(document.createElement('dialog'));
  dialog.id ||= `${id}-dialog`;
  dialog.classList.add('ai-assist');
  dialog.setAttribute('aria-labelledby', `${id}-title`);
  dialog.innerHTML = `
    <div class="ai-top"><span class="ai-eyebrow">LLM ASSIST · ${html(cfg.app)}</span><button class="ai-icon" id="${id}-close" data-r="close" aria-label="Close LLM Assist">✕</button></div>
    <h2 id="${id}-title">${html(cfg.title)}</h2>
    <p class="ai-intro">${html(cfg.intro)}</p>
    <div class="ai-grid">
      <section class="ai-col" aria-labelledby="${id}-s1">
        <div class="ai-step"><span class="ai-num">1</span><h3 id="${id}-s1">Describe your ${noun}</h3></div>
        <label class="sr-only" for="${id}-brief">Describe your ${noun}</label>
        <textarea id="${id}-brief" class="ai-brief" data-r="brief" rows="4" maxlength="6000" placeholder="${html(cfg.placeholder)}"></textarea>
        <div class="ai-starters" role="group" aria-label="Example ideas"><span>Ideas</span><span class="ai-chips" data-r="chips"></span>${cfg.starters.length > IDEAS ? '<button class="ai-link" data-r="more-ideas">More ideas ↻</button>' : ''}</div>
        <label class="ai-check"><input type="checkbox" id="${id}-context" data-r="context" /><span>${html(cfg.contextLabel)}</span></label>

        <div class="ai-step"><span class="ai-num">2</span><h3>Get the ${noun} JSON</h3></div>
        <div class="ai-tabs" role="tablist" aria-label="How to get the JSON">
          <button role="tab" id="${id}-tab-chat" data-mode="chat" aria-controls="${id}-pane-chat">Any AI chat</button>
          <button role="tab" id="${id}-tab-claude" data-mode="claude" aria-controls="${id}-pane-claude">Generate here <span class="ai-badge">API key</span></button>
        </div>
        <div class="ai-pane" role="tabpanel" id="${id}-pane-chat" aria-labelledby="${id}-tab-chat">
          <ol class="ai-howto">
            <li><b>Copy the guide.</b> It holds your description and everything the assistant needs.</li>
            <li>Paste it into ChatGPT, Claude, Gemini or another assistant. If the chat says it's too long, attach the .txt file instead.</li>
            <li>Copy the assistant's whole reply and press <b>Paste reply</b> on the right.</li>
          </ol>
          <div class="ai-row"><button class="ai-btn ai-primary" id="${id}-copy" data-r="copy">Copy guide</button><button class="ai-btn" id="${id}-download" data-r="save">Save as .txt</button></div>
          <p class="ai-note" id="${id}-copy-status" data-r="copy-status" role="status"></p>
          <details id="${id}-guide-details" data-r="guide-details"><summary>Preview the guide</summary><textarea class="ai-guide" id="${id}-guide" data-r="guide" rows="8" readonly spellcheck="false" aria-label="LLM guide text"></textarea></details>
        </div>
        <div class="ai-pane" role="tabpanel" id="${id}-pane-claude" aria-labelledby="${id}-tab-claude">
          <div data-r="no-key">
            <p class="ai-note ai-lead">Skip the copy and paste: Ara asks Claude for you and checks the answer, fixing mistakes automatically.</p>
            <label class="ai-field" for="${id}-key">Your Anthropic API key</label>
            <div class="ai-row ai-key-row"><input id="${id}-key" data-r="key" type="password" autocomplete="off" spellcheck="false" placeholder="sk-ant-…" /><button class="ai-btn" data-r="key-save">Connect</button></div>
            <p class="ai-note" data-r="key-status" role="status"></p>
            <p class="ai-note">The key stays in this browser and is sent only to Anthropic. Usage is billed to your Anthropic account. <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">Create a key ↗</a></p>
          </div>
          <div data-r="has-key" hidden>
            <div class="ai-conn"><span class="ai-dot" aria-hidden="true"></span><span data-r="key-label"></span><button class="ai-link" data-r="forget">Disconnect</button></div>
            <label class="ai-field" for="${id}-model">Model</label>
            <select id="${id}-model" data-r="model">${MODELS.map(m => `<option value="${m.id}">${m.name} · ${m.note}</option>`).join('')}</select>
            <div class="ai-row"><button class="ai-btn ai-primary ai-wide" id="${id}-generate" data-r="generate">Generate ${noun} <span aria-hidden="true">✦</span></button></div>
            <div class="ai-progress" data-r="progress" hidden><span class="ai-spin" aria-hidden="true"></span><span data-r="progress-text" role="status" aria-live="polite"></span><button class="ai-link" data-r="stop">Stop</button></div>
            <p class="ai-note" data-r="usage"></p>
          </div>
        </div>
      </section>
      <section class="ai-col ai-review" aria-labelledby="${id}-s3">
        <div class="ai-step"><span class="ai-num">3</span><h3 id="${id}-s3">Review and build</h3></div>
        <div class="ai-row"><button class="ai-btn" id="${id}-paste" data-r="paste">Paste reply</button><button class="ai-btn" id="${id}-open" data-r="open">Open file</button><button class="ai-link" id="${id}-example" data-r="example">Try an example</button></div>
        <label class="sr-only" for="${id}-json">${Noun} JSON</label>
        <textarea id="${id}-json" class="ai-json" data-r="json" rows="12" spellcheck="false" aria-describedby="${id}-status" placeholder="Paste the assistant's whole reply here. Ara finds the JSON in it."></textarea>
        <div class="ai-result" id="${id}-status" data-r="result" role="status" aria-live="polite"></div>
        <button class="ai-btn ai-primary ai-wide ai-build" id="${id}-create" data-r="build" disabled>Build ${noun} <span aria-hidden="true">↗</span></button>
        <p class="ai-note">${html(cfg.footnote)}</p>
      </section>
    </div>
    <input type="file" id="${id}-file" data-r="file" accept=".json,.txt,application/json,text/plain" hidden />`;

  const $ = <E extends HTMLElement = HTMLElement>(r: string) => dialog.querySelector<E>(`[data-r="${r}"]`)!;
  const brief = $<HTMLTextAreaElement>('brief'), context = $<HTMLInputElement>('context'), guide = $<HTMLTextAreaElement>('guide');
  const draft = $<HTMLTextAreaElement>('json'), result = $('result'), build = $<HTMLButtonElement>('build'), file = $<HTMLInputElement>('file');
  const details = $<HTMLDetailsElement>('guide-details'), model = $<HTMLSelectElement>('model'), keyInput = $<HTMLInputElement>('key');

  let parsed: T | undefined, error = '', cleaned = false, mode: Mode = 'chat', building = false, running: AbortController | undefined;
  let saveTimer = 0, guideStale = true;

  // ---- Drafts ----
  const state = (): AssistDraft => ({ brief: brief.value, json: draft.value, context: context.checked, open: dialog.open, guideOpen: details.open, mode });
  const persist = () => {
    clearTimeout(saveTimer);
    if (cfg.storageKey) try { localStorage.setItem(cfg.storageKey, JSON.stringify(state())); } catch { /* Drafts are a convenience. */ }
  };
  const schedule = () => { clearTimeout(saveTimer); saveTimer = window.setTimeout(persist, 250); };

  // ---- Guide ----
  const refreshGuide = () => {
    if (!guideStale) return guide.value;
    guide.value = cfg.guide(brief.value, context.checked); guideStale = false;
    $('copy-status').textContent = `About ${tokens(Math.round(guide.value.length / 4))} tokens. Use a capable model for the best results.`;
    return guide.value;
  };
  let guideTimer = 0;
  /** The guide is large, so typing refreshes it once the user pauses. */
  const staleGuide = (wait = 0) => {
    guideStale = true; clearTimeout(guideTimer);
    if (!dialog.open) return; // Built when needed; the host's catalogue may still be loading.
    if (wait) guideTimer = window.setTimeout(refreshGuide, wait); else refreshGuide();
  };

  // ---- Checking ----
  function showResult() {
    result.className = 'ai-result';
    if (parsed) {
      const { headline, facts } = cfg.describe(parsed);
      result.classList.add('ok');
      result.innerHTML = `<p class="ai-result-title"><span aria-hidden="true">✓</span> Ready to build</p><p class="ai-headline">${html(headline)}</p>
        <ul class="ai-facts">${facts.map(f => `<li>${html(f)}</li>`).join('')}</ul>${cleaned ? '<p class="ai-note">Found the JSON in the reply and ignored the text around it.</p>' : ''}`;
    } else if (error) {
      result.classList.add('error');
      const canAuto = mode === 'claude' && !!loadConnection();
      result.innerHTML = `<p class="ai-result-title"><span aria-hidden="true">!</span> Needs a fix</p><p class="ai-error-text"></p>
        <div class="ai-row">${canAuto ? '<button class="ai-btn" data-r="auto-fix">Ask Claude to fix it</button>' : ''}<button class="ai-btn" data-r="fix">Copy fix request</button></div>
        <p class="ai-note" data-r="fix-status">${canAuto ? '' : 'Send the fix request to your assistant, then paste its new reply here.'}</p>`;
      result.querySelector('.ai-error-text')!.textContent = error;
    } else result.innerHTML = `<p class="ai-note ai-empty">Your ${noun} appears here once there's JSON to check.</p>`;
    lock();
  }
  function check() {
    parsed = undefined; error = ''; cleaned = false;
    const raw = draft.value;
    if (raw.trim()) {
      const json = extractJson(raw);
      cleaned = hadSurroundingText(raw, json);
      try { parsed = cfg.parse(json); } catch (e) { error = (e as Error).message; }
    }
    draft.setAttribute('aria-invalid', String(!!error));
    showResult();
  }
  /** Replace the editor with the clean JSON from a reply, then check it. */
  function setReply(text: string) {
    const json = extractJson(text);
    const clean = json.startsWith('{') ? pretty(json) : text;
    draft.value = clean; check();
    cleaned = hadSurroundingText(text, json) && clean !== text; showResult();
    schedule();
  }

  // ---- Busy state ----
  function lock() {
    const generating = !!running;
    for (const el of dialog.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('button,input,textarea,select')) {
      const r = el.dataset.r;
      el.disabled = building || generating && r !== 'stop' && r !== 'close' && !el.dataset.mode;
    }
    build.disabled = building || generating || !parsed;
    dialog.setAttribute('aria-busy', String(building || generating));
  }

  // ---- Modes and connection ----
  function setMode(next: Mode) {
    mode = next;
    for (const tab of dialog.querySelectorAll<HTMLButtonElement>('[role=tab]')) {
      const on = tab.dataset.mode === mode;
      tab.setAttribute('aria-selected', String(on)); tab.tabIndex = on ? 0 : -1;
      dialog.querySelector<HTMLElement>(`#${tab.getAttribute('aria-controls')}`)!.hidden = !on;
    }
    showResult(); schedule();
  }
  function showConnection() {
    const c = loadConnection();
    $('no-key').hidden = !!c; $('has-key').hidden = !c;
    if (c) { $('key-label').textContent = `Connected · ${maskKey(c.key)}`; model.value = c.model; }
  }
  $('key-save').addEventListener('click', async () => {
    const key = keyInput.value.trim(), status = $('key-status');
    if (!/^sk-ant-[\w-]{20,}$/.test(key)) { status.textContent = 'That doesn\'t look like an Anthropic API key. It starts with sk-ant-.'; status.className = 'ai-note bad'; return; }
    const button = $<HTMLButtonElement>('key-save');
    button.disabled = true; status.className = 'ai-note'; status.textContent = 'Checking the key…';
    try {
      const connection = { key, model: MODELS[0].id };
      await checkConnection(connection);
      saveConnection(connection); keyInput.value = ''; status.textContent = '';
      showConnection(); showResult(); $('generate').focus();
    } catch (e) { status.textContent = (e as Error).message; status.className = 'ai-note bad'; }
    finally { button.disabled = false; }
  });
  keyInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('key-save').click(); } });
  $('forget').addEventListener('click', () => { forgetConnection(); showConnection(); showResult(); keyInput.focus(); });
  model.addEventListener('change', () => { const c = loadConnection(); if (c) saveConnection({ ...c, model: modelOf(model.value).id }); });

  // ---- Generating here ----
  const phaseText = (p: Progress) => {
    const tries = p.attempt > 1 ? ` (attempt ${p.attempt})` : '';
    switch (p.phase) {
      case 'connecting': return `Sending your brief to ${modelOf(model.value).name}…`;
      case 'thinking': return `Planning the ${noun}${tries}…`;
      case 'writing': return `Writing the ${noun}${tries} · ${tokens(Math.round(p.chars / 3.5))} tokens`;
      case 'checking': return `Checking it against Ara${tries}…`;
      case 'fixing': return `Fixing: ${p.error ?? 'a problem Ara found'}`;
    }
  };
  const usageText = (u: Usage, attempts: number) => {
    const read = u.cacheRead ? `, ${tokens(u.cacheRead)} reused` : '';
    return `${attempts > 1 ? `${attempts} attempts · ` : ''}${tokens(u.input + u.cacheWrite + u.cacheRead)} tokens in${read} · ${tokens(u.output)} out · about $${costOf(u, model.value).toFixed(2)}`;
  };
  async function runClaude(fixing?: { json: string; error: string }) {
    const connection = loadConnection();
    if (!connection || running) return;
    if (!brief.value.trim() && !context.checked && !fixing) {
      $('usage').textContent = `Describe your ${noun} first, or tick the box to start from your current one.`; brief.focus(); return;
    }
    running = new AbortController(); lock();
    const progress = $('progress'), text = $('progress-text');
    progress.hidden = false; $('usage').textContent = '';
    const { system, prompt } = cfg.request(brief.value, context.checked);
    const request = fixing ? `${prompt}\n\nYOUR EARLIER DRAFT\n${fixing.json}\n\n${fixRequest(fixing.error, noun)}` : prompt;
    try {
      const out = await generate({ connection: { ...connection, model: modelOf(model.value).id }, system, prompt: request, kind: noun,
        accept: cfg.parse, onProgress: p => { text.textContent = phaseText(p); }, signal: running.signal });
      $('usage').textContent = usageText(out.usage, out.attempts);
      running = undefined; setReply(out.json); build.focus();
    } catch (e) {
      if (e instanceof StillInvalid) { $('usage').textContent = `${usageText(e.usage, 3)}. Claude couldn't fully fix it. Edit the JSON or try again.`; running = undefined; setReply(e.json); }
      else $('usage').textContent = (e as Error).message;
    } finally { running = undefined; progress.hidden = true; lock(); schedule(); }
  }
  $('generate').addEventListener('click', () => void runClaude());
  $('stop').addEventListener('click', () => running?.abort());

  // ---- Chat route ----
  $('copy').addEventListener('click', async () => {
    const text = refreshGuide(), status = $('copy-status');
    try { await navigator.clipboard.writeText(text); status.textContent = 'Guide copied. Paste it into your AI assistant, then bring its reply back here.'; }
    catch { details.open = true; guide.focus(); guide.select(); status.textContent = 'Guide selected. Press Ctrl/Cmd+C to copy it.'; }
  });
  $('save').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([refreshGuide()], { type: 'text/plain;charset=utf-8' })), a = document.createElement('a');
    a.href = url; a.download = cfg.guideFile; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60_000);
    $('copy-status').textContent = `Saved ${cfg.guideFile}. Attach it to your assistant's chat.`;
  });
  details.addEventListener('toggle', () => { if (details.open && dialog.open) refreshGuide(); schedule(); });

  // ---- Review ----
  result.addEventListener('click', async e => {
    const r = (e.target as HTMLElement).closest<HTMLElement>('[data-r]')?.dataset.r;
    if (r === 'auto-fix') void runClaude({ json: extractJson(draft.value), error });
    if (r === 'fix') {
      const status = result.querySelector('[data-r="fix-status"]')!;
      try { await navigator.clipboard.writeText(fixRequest(error, noun)); status.textContent = 'Fix request copied. Send it in the same chat, then paste the new reply here.'; }
      catch { status.textContent = fixRequest(error, noun); }
    }
  });
  $('paste').addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) throw Error('empty');
      setReply(text);
    } catch { draft.focus(); result.className = 'ai-result'; result.innerHTML = '<p class="ai-note">Your browser blocked clipboard access. Press Ctrl/Cmd+V to paste here.</p>'; }
  });
  draft.addEventListener('paste', e => {
    const text = e.clipboardData?.getData('text/plain');
    const replacingAll = !draft.value.trim() || draft.selectionStart === 0 && draft.selectionEnd === draft.value.length;
    if (!text || !replacingAll) return; // Editing inside existing JSON: paste normally.
    e.preventDefault(); setReply(text);
  });
  draft.addEventListener('input', () => { check(); schedule(); });
  $('open').addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const chosen = file.files?.[0]; file.value = '';
    if (!chosen) return;
    if (chosen.size > 200_000) { draft.value = ''; error = 'Use a file smaller than 200 KB.'; parsed = undefined; showResult(); return; }
    setReply(await chosen.text());
  });
  $('example').addEventListener('click', () => setReply(JSON.stringify(cfg.example())));
  build.addEventListener('click', async () => {
    check();
    if (!parsed || building) return;
    building = true; lock();
    const label = build.innerHTML;
    build.textContent = `Building your ${noun}…`;
    try { await cfg.build(parsed); dialog.close(); }
    catch (e) { error = (e as Error).message; parsed = undefined; showResult(); }
    finally { building = false; build.innerHTML = label; check(); persist(); }
  });

  // ---- Describe ----
  let ideaPage = 0;
  const showIdeas = () => {
    const pages = Math.ceil(cfg.starters.length / IDEAS);
    $('chips').innerHTML = cfg.starters.map(([label], i) => [label, i] as const).slice(ideaPage % pages * IDEAS, ideaPage % pages * IDEAS + IDEAS)
      .map(([label, i]) => `<button class="ai-chip" data-starter="${i}" title="${html(cfg.starters[i][1])}">${html(label)}</button>`).join('');
    lock();
  };
  showIdeas();
  dialog.querySelector('[data-r="more-ideas"]')?.addEventListener('click', () => { ideaPage++; showIdeas(); });
  dialog.querySelector('.ai-starters')!.addEventListener('click', e => {
    const i = (e.target as HTMLElement).closest<HTMLElement>('[data-starter]')?.dataset.starter;
    if (i === undefined) return;
    brief.value = cfg.starters[Number(i)][1]; brief.dispatchEvent(new Event('input')); brief.focus();
  });
  brief.addEventListener('input', () => { staleGuide(300); schedule(); });
  context.addEventListener('change', () => { staleGuide(); schedule(); });
  brief.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); (mode === 'claude' && loadConnection() ? $('generate') : $('copy')).click(); }
  });
  draft.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); build.click(); } });

  // ---- Tabs, open and close ----
  const tabs = [...dialog.querySelectorAll<HTMLButtonElement>('[role=tab]')];
  for (const tab of tabs) {
    tab.addEventListener('click', () => setMode(tab.dataset.mode as Mode));
    tab.addEventListener('keydown', e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const next = tabs[(tabs.indexOf(tab) + 1) % tabs.length]; next.focus(); next.click();
    });
  }
  $('close').addEventListener('click', () => { if (!building) dialog.close(); });
  dialog.addEventListener('cancel', e => { if (building) e.preventDefault(); });
  dialog.addEventListener('close', persist);
  window.addEventListener('pagehide', persist);

  async function open() {
    if (!await cfg.canOpen()) return;
    // A context-based guide reflects the current state, which may have changed since it was made.
    guideStale = true; showConnection(); check();
    if (!dialog.open) dialog.showModal();
    refreshGuide();
    (brief.value.trim() ? (parsed ? build : draft) : brief).focus();
    persist();
  }
  function restore(d: Partial<AssistDraft>) {
    brief.value = typeof d.brief === 'string' ? d.brief.slice(0, 6000) : '';
    draft.value = typeof d.json === 'string' ? d.json.slice(0, 200_000) : '';
    context.checked = d.context === true; details.open = d.guideOpen === true;
    setMode(d.mode === 'claude' || d.mode === 'chat' ? d.mode : loadConnection() ? 'claude' : 'chat');
    guideStale = true; check();
  }

  if (cfg.storageKey) try {
    const saved = JSON.parse(localStorage.getItem(cfg.storageKey) || 'null');
    restore(saved && typeof saved === 'object' ? saved : {});
    if (saved?.open === true) void open();
  } catch { restore({}); }
  else restore({});
  showConnection();
  return { dialog, open, state, restore };
}
