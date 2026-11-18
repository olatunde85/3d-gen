/**
 * Ask Ara: a chat in the corner of the builder, Studio and Play, with the visitor's own AI. It knows the app and
 * what's open, answers how-to questions, and when it writes a character, film or game, one click takes it to Assist
 * is built straight away, with Undo on its card. Conversations last for the browser session.
 */
import './chat.css';
import { write, writer, costOf, money, type Message, type Usage } from './ai';
import { ProviderError } from './http';
import { openKeys } from './dialog';
import { onKeysChange } from './store';
import { ARA_MARK, thinking, type Thinking } from './thinking';

export interface AskAra {
  /** "Character Builder", "Studio" or "Play". */
  appName: string;
  noun: 'character' | 'film' | 'game';
  /** What the app is for and what's on screen, in a few sentences. */
  primer(): string;
  /** The app's full Assist guide, with the current character, film or game. */
  guide(): string | Promise<string>;
  parse(json: string): unknown;
  describe(value: unknown): { headline: string };
  /** Builds this JSON now, as Assist's Build does; resolves to a function that puts back what was there before. */
  apply(json: string, progress?: (p: { stage: string }) => void): Promise<() => Promise<void>>;
  suggestions: string[];
  /** Whether the button should show right now (Play hides it during a game). */
  visible?(): boolean;
  storageKey: string;
}

/** What happened to the result in a reply: being built, built (Undo offered), undone, or failed. */
type Built = { state: 'building' | 'applied' | 'undone' | 'failed'; message?: string };
interface Turn { role: 'user' | 'assistant'; text: string; meta?: string; error?: { message: string; keys: boolean }; built?: Built }

const html = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
function inline(s: string) {
  return html(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<i>$2</i>');
}
/** Light Markdown for replies: paragraphs, lists, headings, code. JSON blocks are handled separately. */
function prose(text: string) {
  const out: string[] = []; let list: 'ul' | 'ol' | '' = '';
  const close = () => { if (list) { out.push(`</${list}>`); list = ''; } };
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*•]\s+(.*)/.exec(line), number = /^\s*\d+[.)]\s+(.*)/.exec(line), head = /^#{1,4}\s+(.*)/.exec(line);
    if (bullet || number) { const want = bullet ? 'ul' : 'ol'; if (list !== want) { close(); out.push(`<${want}>`); list = want; } out.push(`<li>${inline((bullet ?? number)![1])}</li>`); continue; }
    close();
    if (head) out.push(`<p class="ask-head">${inline(head[1])}</p>`);
    else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  close();
  return out.join('');
}

export function mountAskAra(cfg: AskAra) {
  const button = document.body.appendChild(document.createElement('button'));
  button.className = 'ask-ara-fab'; button.type = 'button'; button.id = 'ask-ara';
  button.innerHTML = `${ARA_MARK}<span>Ask Ara</span>`;
  button.setAttribute('aria-haspopup', 'dialog');
  const panel = document.body.appendChild(document.createElement('section'));
  panel.className = 'ask-ara'; panel.id = 'ask-ara-panel'; panel.hidden = true;
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-labelledby', 'ask-ara-title');
  panel.innerHTML = `
    <header class="ask-top">
      <span class="ask-title">${ARA_MARK}<b id="ask-ara-title">Ask Ara</b></span>
      <button class="ask-model" data-r="model" title="Change the AI in Keys"></button>
      <span class="ask-tools"><button class="ask-icon" data-r="new" title="New chat" aria-label="New chat">＋</button><button class="ask-icon" data-r="close" aria-label="Close Ask Ara">✕</button></span>
    </header>
    <div class="ask-scroll" data-r="scroll"><div class="ask-log" data-r="log" aria-live="polite"></div></div>
    <form class="ask-compose" data-r="form">
      <label class="sr-only" for="ask-ara-input">Message Ara</label>
      <textarea id="ask-ara-input" data-r="input" rows="1" maxlength="4000" placeholder="Ask anything, or describe a ${cfg.noun}…"></textarea>
      <button class="ask-send" data-r="send" type="submit" aria-label="Send">↑</button>
      <button class="ask-send ask-stop" data-r="stop" type="button" aria-label="Stop" hidden>■</button>
    </form>`;
  const $ = <E extends HTMLElement = HTMLElement>(r: string) => panel.querySelector<E>(`[data-r="${r}"]`)!;
  const log = $('log'), input = $<HTMLTextAreaElement>('input'), scroll = $('scroll');
  let turns: Turn[] = [], busy: AbortController | undefined;
  try { const saved = JSON.parse(sessionStorage.getItem(cfg.storageKey) || '[]'); if (Array.isArray(saved)) turns = saved.filter(t => t && (t.role === 'user' || t.role === 'assistant') && typeof t.text === 'string').slice(-40); } catch { /* Start fresh. */ }
  /** Undo for each reply built in this visit, by turn. */
  const undos = new Map<number, () => Promise<void>>();
  const save = () => { try { sessionStorage.setItem(cfg.storageKey, JSON.stringify(turns.slice(-40))); } catch { /* A convenience. */ } };

  // ---- Showing the conversation ----
  const atBottom = () => scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 60;
  const toBottom = () => { scroll.scrollTop = scroll.scrollHeight; };
  /** An Ara reply: prose, with each JSON block turned into a card to review and build. */
  function reply(text: string, streaming: boolean, turn = -1): string {
    const built = turns[turn]?.built;
    const parts: string[] = [];
    const re = /```(\w*)\n?([\s\S]*?)(```|$)/g;
    let at = 0, m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      parts.push(prose(text.slice(at, m.index)));
      const done = m[3] === '```', body = m[2].trim();
      const looksJson = m[1] === 'json' || body.startsWith('{');
      if (looksJson && (!done && streaming)) parts.push('<div class="ask-slot" data-slot="writing"></div>');
      else if (looksJson) {
        try {
          const value = cfg.parse(body);
          const Noun = cfg.noun[0].toUpperCase() + cfg.noun.slice(1), headline = html(cfg.describe(value).headline);
          const state = built?.state ?? (streaming ? 'building' : 'applied');
          if (state === 'building') parts.push(`<div class="ask-card ok building"><span class="ask-card-kind">Building your ${cfg.noun}</span><b>${headline}</b><div class="ask-slot-loader" data-loader></div><p class="ask-note" data-progress></p></div>`);
          else if (state === 'applied') parts.push(`<div class="ask-card ok"><span class="ask-card-kind">${Noun} ready</span><b>${headline}</b>${undos.has(turn) ? `<button class="ask-undo" data-undo="${turn}">↶ Undo</button>` : '<p class="ask-note">Use Undo in the app to go back.</p>'}</div>`);
          else if (state === 'undone') parts.push(`<div class="ask-card"><span class="ask-card-kind">Undone</span><b>${headline}</b><button class="ask-undo" data-apply="${turn}">Apply again</button></div>`);
          else parts.push(`<div class="ask-card bad"><span class="ask-card-kind">Couldn’t build it</span><p>${html(built?.message ?? '')}</p><button class="ask-fix" data-apply="${turn}">Try again</button></div>`);
        } catch (error) {
          parts.push(`<div class="ask-card bad"><span class="ask-card-kind">Needs a fix</span><p>${html((error as Error).message)}</p><button class="ask-fix" data-reason="${html(encodeURIComponent((error as Error).message))}">Ask Ara to fix it</button></div>`);
        }
      } else parts.push(`<pre><code>${html(body)}</code></pre>`);
      at = re.lastIndex;
      if (!done) break;
    }
    if (at < text.length) parts.push(prose(text.slice(at)));
    return parts.join('');
  }
  function render() {
    const w = writer();
    $('model').innerHTML = w ? `<span class="ask-dot on"></span>${html(w.label)}` : '<span class="ask-dot"></span>Connect AI';
    $('send').hidden = !!busy; $('stop').hidden = !busy;
    if (!turns.length) {
      log.innerHTML = `<div class="ask-hello">${ARA_MARK}<p><b>Hi, I’m Ara.</b> Ask me how to do something in ${html(cfg.appName)}, or describe a ${cfg.noun} and I’ll make it for you.</p></div>
        ${w ? '' : `<div class="ask-card key"><p>Ara chats with your own AI account. Your key stays in this browser, and you pay the provider directly, usually a cent or two a message. <b>Google Gemini has a free allowance.</b></p><button class="ask-build" data-act="keys">Connect a key</button></div>`}
        <div class="ask-suggest">${cfg.suggestions.map(s => `<button data-suggest="${html(s)}">${html(s)}</button>`).join('')}</div>`;
      return;
    }
    log.innerHTML = turns.map((t, i) => t.role === 'user'
      ? `<div class="ask-msg me"><div class="ask-bubble">${html(t.text).replace(/\n/g, '<br>')}</div></div>`
      : `<div class="ask-msg ara" data-turn="${i}"><span class="ask-avatar">${ARA_MARK}</span><div class="ask-body">${t.error ? `<div class="ask-card bad"><p>${html(t.error.message)}</p><div class="ask-row"><button data-act="retry">Try again</button>${t.error.keys ? '<button data-act="keys">Open Keys</button>' : ''}</div></div>` : reply(t.text, false, i)}${t.meta ? `<p class="ask-meta">${html(t.meta)}</p>` : ''}</div></div>`).join('');
  }

  // ---- Talking ----
  async function ask(text: string) {
    text = text.trim();
    if (!text || busy) return;
    const w = writer();
    if (!w) { openKeys({ focus: 'ai', then: () => { render(); if (writer()) void ask(text); } }); return; }
    turns.push({ role: 'user', text }); save();
    input.value = ''; grow();
    await respond();
  }
  async function respond() {
    const w = writer()!;
    const control = new AbortController(); busy = control;
    const turn: Turn = { role: 'assistant', text: '' };
    turns.push(turn); render(); toBottom();
    const node = log.lastElementChild!.querySelector<HTMLElement>('.ask-body')!;
    let ara: Thinking | undefined = thinking('chat', node), slot: Thinking | undefined;
    try {
      const guide = await cfg.guide();
      const context = `You are Ara, the friendly assistant built into Ara 3D ${cfg.appName}. ${cfg.primer()}

How to answer:
- Be brief, warm and practical, in plain language. Use short paragraphs or a short list; no tables.
- To explain how to do something, name Ara's buttons and panels as they appear on screen.
- When the user asks you to make, change or write a ${cfg.noun}, reply with one short sentence, then ONE complete ${cfg.noun} JSON in a \`\`\`json block that follows the guide below exactly (keep everything the user didn't ask to change). Ara checks it and builds it straight away, and the user can undo it, so say what you made in one short sentence before the JSON.
- If something isn't possible in Ara, say so plainly and suggest the closest thing that is.

THE ${cfg.noun.toUpperCase()} GUIDE (for writing JSON; it includes what is open now)
${guide}`;
      const history: Message[] = [{ role: 'user', text: context }, { role: 'assistant', text: 'Understood. I’m ready to help.' },
        ...turns.slice(0, -1).filter(t => !t.error).slice(-20).map(t => ({ role: t.role, text: t.text }))];
      let painted = 0;
      const result = await write(w.provider, w.saved, { model: w.model, messages: history, maxTokens: 16000, signal: control.signal, onText: (_chars, all) => {
        turn.text = all;
        if (performance.now() - painted < 60) return; painted = performance.now();
        const follow = atBottom();
        ara?.stop(); ara = undefined;
        // One animation for the whole reply, moved into each repaint, so its phrases and glow run smoothly.
        slot?.element.remove();
        node.innerHTML = reply(all, true);
        const writing = node.querySelector<HTMLElement>('[data-slot="writing"]');
        if (writing) { slot ??= thinking(cfg.noun, writing); writing.append(slot.element); const json = /```(?:json)?\n?([\s\S]*)$/.exec(all)?.[1] ?? ''; slot.phase('writing', `${json.length.toLocaleString()} characters`); }
        if (follow) toBottom();
      } });
      turn.text = result.text;
      if (!result.text.trim()) throw new ProviderError(`${w.label} sent an empty reply. Try again, or rephrase.`, result.stop === 'refused' ? 'refused' : 'other');
      if (result.stop === 'length') turn.text += '\n\n*(The reply was cut off at its length limit.)*';
      const cost = costOf(result.usage as Usage, w.info?.price);
      turn.meta = `${w.label}${cost !== undefined ? ` · ${money(cost)}` : ''}`;
    } catch (error) {
      const e = error as ProviderError;
      if (e.problem === 'stopped') { if (!turn.text) turns.pop(); else turn.meta = 'Stopped'; }
      else { turn.text = turn.text || ''; turn.error = { message: e.message, keys: ['key', 'credit', 'permission', 'model', 'blocked', 'workspace'].includes(e.problem) }; }
    } finally {
      ara?.stop(); slot?.stop(); busy = undefined; save(); input.focus();
      if (!turn.error && /```/.test(turn.text)) void build(turns.indexOf(turn)); else { render(); toBottom(); }
    }
  }

  /** Builds the last JSON block of a reply that checks out. */
  async function build(index: number) {
    const turn = turns[index];
    const blocks = [...turn.text.matchAll(/```(?:json)?\n?([\s\S]*?)```/g)].map(m => m[1].trim()).filter(b => b.startsWith('{'));
    const json = blocks.reverse().find(b => { try { cfg.parse(b); return true; } catch { return false; } });
    if (!json) { render(); return; }
    turn.built = { state: 'building' }; render(); toBottom();
    const loader = log.querySelector<HTMLElement>(`[data-turn="${index}"] [data-loader]`);
    const ara = loader ? thinking(cfg.noun, loader) : undefined;
    const note = log.querySelector<HTMLElement>(`[data-turn="${index}"] [data-progress]`);
    try { undos.set(index, await cfg.apply(json, p => { if (note) note.textContent = p.stage; })); turn.built = { state: 'applied' }; }
    catch (error) { turn.built = { state: 'failed', message: (error as Error).message }; }
    finally { ara?.stop(); save(); render(); toBottom(); }
  }

  // ---- Controls ----
  const grow = () => { input.style.height = 'auto'; input.style.height = `${Math.min(160, input.scrollHeight)}px`; };
  input.addEventListener('input', grow);
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); void ask(input.value); } });
  $('form').addEventListener('submit', e => { e.preventDefault(); void ask(input.value); });
  $('stop').addEventListener('click', () => busy?.abort());
  $('model').addEventListener('click', () => openKeys({ focus: 'ai', then: render }));
  $('new').addEventListener('click', () => { busy?.abort(); turns = []; save(); render(); input.focus(); });
  const close = () => { panel.hidden = true; button.hidden = !!cfg.visible && !cfg.visible(); button.setAttribute('aria-expanded', 'false'); button.focus(); };
  $('close').addEventListener('click', close);
  panel.addEventListener('keydown', e => { if (e.key === 'Escape' && !document.querySelector('dialog[open]')) { e.stopPropagation(); close(); } });
  button.addEventListener('click', () => { panel.hidden = false; button.hidden = true; button.setAttribute('aria-expanded', 'true'); render(); toBottom(); input.focus(); });
  log.addEventListener('click', async e => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (!el) return;
    if (el.dataset.suggest) void ask(el.dataset.suggest);
    else if (el.dataset.act === 'keys') openKeys({ focus: 'ai', then: render });
    else if (el.dataset.act === 'retry') { const last = turns[turns.length - 1]; if (last?.role === 'assistant' && last.error) { turns.pop(); await respond(); } }
    else if (el.dataset.undo) {
      const i = Number(el.dataset.undo), undo = undos.get(i); if (!undo || busy) return;
      (el as HTMLButtonElement).disabled = true; el.textContent = 'Undoing…';
      try { await undo(); undos.delete(i); turns[i].built = { state: 'undone' }; } catch (error) { turns[i].built = { state: 'failed', message: (error as Error).message }; }
      save(); render();
    }
    else if (el.dataset.apply) void build(Number(el.dataset.apply));
    else if (el.dataset.reason) void ask(`Ara couldn't use that ${cfg.noun}: ${decodeURIComponent(el.dataset.reason)} Please fix it and send the complete JSON again.`);
  });
  onKeysChange(() => { if (!panel.hidden && !busy) render(); });
  // Play hides the button during a game.
  // Play hides it during a game; an open chat closes when the game starts, so the game gets the controls.
  if (cfg.visible) window.setInterval(() => { const show = cfg.visible!(); if (panel.hidden) button.hidden = !show; else if (!show) { busy?.abort(); panel.hidden = true; button.hidden = true; } }, 500);
  render();
  return { open: () => button.click() };
}
