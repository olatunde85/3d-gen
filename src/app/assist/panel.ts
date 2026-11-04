/**
 * LLM Assist: describe something, get JSON from any AI chat, review it and build.
 * Shared by the character builder and Ara Studio.
 */
import './panel.css';
import { extractJson, fixRequest, hadSurroundingText } from './extract';

export interface AssistDraft { brief: string; json: string; context: boolean; open: boolean; guideOpen: boolean }

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
  contextLabel: string;
  guideFile: string;
  /** The full guide for an AI chat, with the brief and optionally the current state embedded. */
  guide(brief: string, current: boolean): string;
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
        <label class="ai-check"><input type="checkbox" id="${id}-context" data-r="context" /><span>${html(cfg.contextLabel)}</span></label>

        <div class="ai-step"><span class="ai-num">2</span><h3>Get the ${noun} JSON</h3></div>
        <div class="ai-pane">
          <ol class="ai-howto">
            <li><b>Copy the guide.</b> It holds your description and everything the assistant needs.</li>
            <li>Paste it into ChatGPT, Claude, Gemini or another assistant. If the chat says it's too long, attach the .txt file instead.</li>
            <li>Copy the assistant's whole reply and press <b>Paste reply</b> on the right.</li>
          </ol>
          <div class="ai-row"><button class="ai-btn ai-primary" id="${id}-copy" data-r="copy">Copy guide</button><button class="ai-btn" id="${id}-download" data-r="save">Save as .txt</button></div>
          <p class="ai-note" id="${id}-copy-status" data-r="copy-status" role="status"></p>
          <details id="${id}-guide-details" data-r="guide-details"><summary>Preview the guide</summary><textarea class="ai-guide" id="${id}-guide" data-r="guide" rows="8" readonly spellcheck="false" aria-label="LLM guide text"></textarea></details>
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
  const details = $<HTMLDetailsElement>('guide-details');

  let parsed: T | undefined, error = '', cleaned = false, building = false;
  let saveTimer = 0, guideStale = true;

  // ---- Drafts ----
  const state = (): AssistDraft => ({ brief: brief.value, json: draft.value, context: context.checked, open: dialog.open, guideOpen: details.open });
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
      result.innerHTML = `<p class="ai-result-title"><span aria-hidden="true">!</span> Needs a fix</p><p class="ai-error-text"></p>
        <div class="ai-row"><button class="ai-btn" data-r="fix">Copy fix request</button></div>
        <p class="ai-note" data-r="fix-status">Send the fix request to your assistant, then paste its new reply here.</p>`;
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
    for (const el of dialog.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement>('button,input,textarea')) el.disabled = building;
    build.disabled = building || !parsed;
    dialog.setAttribute('aria-busy', String(building));
  }

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
  brief.addEventListener('input', () => { staleGuide(300); schedule(); });
  context.addEventListener('change', () => { staleGuide(); schedule(); });
  brief.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); $('copy').click(); }
  });
  draft.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); build.click(); } });

  // ---- Open and close ----
  $('close').addEventListener('click', () => { if (!building) dialog.close(); });
  dialog.addEventListener('cancel', e => { if (building) e.preventDefault(); });
  dialog.addEventListener('close', persist);
  window.addEventListener('pagehide', persist);

  async function open() {
    if (!await cfg.canOpen()) return;
    // A context-based guide reflects the current state, which may have changed since it was made.
    guideStale = true; check();
    if (!dialog.open) dialog.showModal();
    refreshGuide();
    (brief.value.trim() ? (parsed ? build : draft) : brief).focus();
    persist();
  }
  function restore(d: Partial<AssistDraft>) {
    brief.value = typeof d.brief === 'string' ? d.brief.slice(0, 6000) : '';
    draft.value = typeof d.json === 'string' ? d.json.slice(0, 200_000) : '';
    context.checked = d.context === true; details.open = d.guideOpen === true;
    guideStale = true; check();
  }

  if (cfg.storageKey) try {
    const saved = JSON.parse(localStorage.getItem(cfg.storageKey) || 'null');
    restore(saved && typeof saved === 'object' ? saved : {});
    if (saved?.open === true) void open();
  } catch { restore({}); }
  else restore({});
  return { dialog, open, state, restore };
}
