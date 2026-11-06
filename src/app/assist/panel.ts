/**
 * LLM Assist: describe something, get JSON from any AI chat, review it and build.
 * Shared by the character builder and Ara Studio.
 */
import './panel.css';
import { extractJson, fixRequest, hadSurroundingText } from './extract';

export interface AssistDraft { brief: string; json: string; context: boolean; open: boolean; guideOpen: boolean; reference?:string }

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
  guide(brief: string, current: boolean, reference?:string): string;
  parse(json: string): T;
  describe(value: T): { headline: string; facts: string[]; warnings?:string[] };
  /** Optional machine-readable reference beside the guide (Studio location maps). */
  reference?:{label:string;choices:{id:string;name:string}[];current():string;file(id:string):{name:string;text:string};all?:{name:string;text():string}};
  revisionContext?(value:T):string;
  example(): unknown;
  /** Applies the result; throws a readable error if it can't. */
  build(value: T): Promise<void>;
  canOpen(): boolean | Promise<boolean>;
  /** Optional local preparation of a validated reply before building (Studio dialogue). */
  prepare?: {
    note:string;
    needed(value:T):boolean;
    run(value:T,options:{signal:AbortSignal;progress(message:string):void;updated(value:T):void}):Promise<T>;
    write(value:T,json:string):string;
  };
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
        ${cfg.reference?`<label for="${id}-reference">${html(cfg.reference.label)}</label><select id="${id}-reference" data-r="reference">${cfg.reference.choices.map(c=>`<option value="${html(c.id)}">${html(c.name)}</option>`).join('')}</select><div class="ai-row"><button class="ai-btn" id="${id}-save-map" data-r="save-reference">Save map .json</button>${cfg.reference.all?'<button class="ai-link" data-r="save-all-references">All location maps</button>':''}</div><p class="ai-note">The guide includes this set’s full staging map. Choose the location you want to film.</p>`:''}

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
        ${cfg.prepare?`<p class="ai-note">${html(cfg.prepare.note)}</p>`:''}
        <label class="sr-only" for="${id}-json">${Noun} JSON</label>
        <textarea id="${id}-json" class="ai-json" data-r="json" rows="12" spellcheck="false" aria-describedby="${id}-status" placeholder="Paste the assistant's whole reply here. Ara finds the JSON in it."></textarea>
        <div class="ai-result" id="${id}-status" data-r="result" role="status" aria-live="polite"></div>
        <div class="ai-preparation" data-r="preparation" hidden><p class="ai-note" id="${id}-speech-status" data-r="preparation-status" role="status"></p><div class="ai-row"><button class="ai-btn" id="${id}-speech-cancel" data-r="preparation-cancel">Stop generation</button><button class="ai-btn" id="${id}-speech-retry" data-r="preparation-retry" hidden>Retry speech generation</button></div></div>
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
  let preparing=false,preparationTimer=0,preparationToken=0,preparationText='',preparationRetry=false;
  let preparationController:AbortController|undefined;

  // ---- Drafts ----
  const reference=cfg.reference?$<HTMLSelectElement>('reference'):undefined;
  let referenceChosen=false;
  if(reference)reference.value=cfg.reference!.current();
  const state = (): AssistDraft => ({ brief: brief.value, json: draft.value, context: context.checked, open: dialog.open, guideOpen: details.open,...(reference&&referenceChosen?{reference:reference.value}:{}) });
  const persist = () => {
    clearTimeout(saveTimer);
    if (cfg.storageKey) try { localStorage.setItem(cfg.storageKey, JSON.stringify(state())); } catch { /* Drafts are a convenience. */ }
  };
  const schedule = () => { clearTimeout(saveTimer); saveTimer = window.setTimeout(persist, 250); };

  // ---- Guide ----
  const refreshGuide = () => {
    if (!guideStale) return guide.value;
    guide.value = cfg.guide(brief.value, context.checked,reference?.value); guideStale = false;
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
      const { headline, facts, warnings=[] } = cfg.describe(parsed);
      result.classList.add('ok');
      result.innerHTML = `<p class="ai-result-title"><span aria-hidden="true">${preparing?'…':'✓'}</span> ${preparing?'Preparing dialogue voices':'Ready to build'}</p><p class="ai-headline">${html(headline)}</p>
        <ul class="ai-facts">${facts.map(f => `<li>${html(f)}</li>`).join('')}</ul>${warnings.length?`<div class="ai-staging-notes"><b>Staging needs review</b><ul>${warnings.map(w=>`<li>${html(w)}</li>`).join('')}</ul><button class="ai-btn" data-r="fix-staging">Copy staging fix request</button></div>`:''}${cleaned ? '<p class="ai-note">Found the JSON in the reply and ignored the text around it.</p>' : ''}`;
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
    stopPreparation();
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
    schedule();queuePreparation();
  }

  // ---- Busy state ----
  function lock() {
    for (const el of dialog.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement>('button,input,textarea')) el.disabled = building;
    build.disabled = building || preparing || !parsed;
    dialog.setAttribute('aria-busy', String(building||preparing));
    renderPreparation();
  }

  // ---- Optional automatic preparation ----
  function renderPreparation(){
    if(!cfg.prepare)return;
    $('preparation').hidden=!preparationText;
    $('preparation-status').textContent=preparationText;
    $('preparation-cancel').hidden=!preparing;$('preparation-retry').hidden=!preparationRetry;
  }
  function stopPreparation(message=''){
    preparationToken++;clearTimeout(preparationTimer);preparationController?.abort();preparationController=undefined;
    preparing=false;preparationText=message;preparationRetry=!!message&&!!parsed&&!!cfg.prepare?.needed(parsed);renderPreparation();
  }
  function queuePreparation(){
    if(!cfg.prepare||!parsed||!dialog.open||!cfg.prepare.needed(parsed))return;
    const source=parsed,token=++preparationToken,control=new AbortController();preparationController=control;
    preparing=true;preparationText='Preparing dialogue voices automatically…';preparationRetry=false;showResult();
    preparationTimer=window.setTimeout(async()=>{
      const active=()=>token===preparationToken&&!control.signal.aborted;
      const update=(value:T)=>{if(!active())return;parsed=value;draft.value=cfg.prepare!.write(value,extractJson(draft.value));schedule();draft.dispatchEvent(new Event('change',{bubbles:true}));showResult();};
      try{
        const value=await cfg.prepare!.run(source,{signal:control.signal,progress:message=>{if(active()){preparationText=message;renderPreparation();}},updated:update});
        if(!active())return;update(value);preparing=false;preparationController=undefined;preparationText='Dialogue voices are ready and saved on this device.';showResult();persist();
      }catch(e){
        if(!active())return;preparing=false;preparationController=undefined;preparationRetry=true;preparationText=(e as Error).message+' Completed voices have been kept. Retry, or build the film and use Sound.';showResult();
      }
    },300);
  }
  $('preparation-cancel')?.addEventListener('click',()=>{stopPreparation('Speech generation stopped. Completed voices have been kept.');showResult();persist();});
  $('preparation-retry')?.addEventListener('click',queuePreparation);

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
  const saveReference=(file:{name:string;text:string})=>{const url=URL.createObjectURL(new Blob([file.text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60_000);};
  reference?.addEventListener('change',()=>{referenceChosen=true;staleGuide();schedule();});
  if(cfg.reference){$('save-reference').addEventListener('click',()=>saveReference(cfg.reference!.file(reference!.value)));if(cfg.reference.all)$('save-all-references').addEventListener('click',()=>saveReference({name:cfg.reference!.all!.name,text:cfg.reference!.all!.text()}));}
  details.addEventListener('toggle', () => { if (details.open && dialog.open) refreshGuide(); schedule(); });

  // ---- Review ----
  result.addEventListener('click', async e => {
    const r = (e.target as HTMLElement).closest<HTMLElement>('[data-r]')?.dataset.r;
    if (r === 'fix') {
      const status = result.querySelector('[data-r="fix-status"]')!;
      try { await navigator.clipboard.writeText(fixRequest(error, noun)); status.textContent = 'Fix request copied. Send it in the same chat, then paste the new reply here.'; }
      catch { status.textContent = fixRequest(error, noun); }
    }
    if(r==='fix-staging'&&parsed){const warnings=cfg.describe(parsed).warnings??[],text=`Revise the film JSON to resolve these spatial-staging findings. Use the selected location map, calculate every transition and validate the entire path. Preserve the rest of the film. Return complete importable JSON.\n\n${warnings.join('\n')}\n\nLOCATION REFERENCE\n${cfg.revisionContext?.(parsed)??''}\n\nCURRENT JSON\n${draft.value}`;try{await navigator.clipboard.writeText(text);(e.target as HTMLElement).textContent='Fix request copied';}catch{guide.value=text;details.open=true;guide.focus();guide.select();}}
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
  draft.addEventListener('input', () => { check(); schedule();queuePreparation(); });
  $('open').addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const chosen = file.files?.[0]; file.value = '';
    if (!chosen) return;
    if (chosen.size > 200_000) { stopPreparation();draft.value = ''; error = 'Use a file smaller than 200 KB.'; parsed = undefined; showResult(); return; }
    setReply(await chosen.text());
  });
  $('example').addEventListener('click', () => setReply(JSON.stringify(cfg.example())));
  build.addEventListener('click', async () => {
    if(building||preparing)return;
    check();
    if (!parsed) return;
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
  dialog.addEventListener('close',()=>{stopPreparation();persist();});
  window.addEventListener('pagehide',()=>{stopPreparation();persist();});

  async function open() {
    if (!await cfg.canOpen()) return;
    if(reference&&!referenceChosen)reference.value=cfg.reference!.current();
    // A context-based guide reflects the current state, which may have changed since it was made.
    guideStale = true; check();
    if (!dialog.open) dialog.showModal();
    refreshGuide();queuePreparation();
    (brief.value.trim() ? (parsed ? build : draft) : brief).focus();
    persist();
  }
  function restore(d: Partial<AssistDraft>) {
    brief.value = typeof d.brief === 'string' ? d.brief.slice(0, 6000) : '';
    draft.value = typeof d.json === 'string' ? d.json.slice(0, 200_000) : '';
    context.checked = d.context === true; details.open = d.guideOpen === true;
    if(reference&&cfg.reference!.choices.some(c=>c.id===d.reference)){reference.value=d.reference!;referenceChosen=true;}
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
