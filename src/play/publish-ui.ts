/**
 * Game setup → Publish online: an introduction with Cloudflare's terms, live progress through each step, then the
 * game's link and a countdown to claim it into the player's own free Cloudflare account.
 */
import type { AssetLibrary } from '../core/assets';
import type { PlayProject } from './project';
import type { PlayCast } from './cast';
import { publishBlock } from './publish-guard';
import { gameNameOf } from './customize';
import { DEFAULT_THEME } from './theme';
import { publishEndpoint, publishGame, type PublishStep } from './publish';

interface PublishHost { project: () => PlayProject; library: () => AssetLibrary; prepare: (project: PlayProject, progress: (text: string) => void) => Promise<{ cast: PlayCast; dispose: () => void }>; busy: (value: boolean) => void; stopPreview: () => void }
const STEPS: [PublishStep, string, string][] = [
  ['check', 'Checking the game', 'Making sure it can be shared publicly'],
  ['build', 'Packing your game', 'The same files as the game ZIP'],
  ['puzzle', 'Passing the security check', 'A short puzzle that keeps automated sign-ups away'],
  ['account', 'Creating your free Cloudflare space', 'Temporary until you claim it'],
  ['upload', 'Uploading', 'Characters, textures, music and films'],
  ['live', 'Going live', 'Waking up your game’s address'],
];
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => { const e = document.createElement(tag);if (className) e.className = className;if (text) e.textContent = text;return e; };
const ICONS = {
  globe: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.8 2.6 15.2 0 18M12 3c-2.6 2.8-2.6 15.2 0 18"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
  key: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M15 8l2 2"/></svg>',
  shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 6v6c0 5 3.4 8.3 8 9 4.6-.7 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg>',
};

/** The guide to Publish online's limits and other hosts, on the Ara website. */
const HOSTING_GUIDE = 'https://ara3dgen.com/docs/hosting-games/';
const hostingLink = (text: string) => { const a = el('a', 'publish-guide', text);a.href = HOSTING_GUIDE;a.target = '_blank';a.rel = 'noopener';return a; };

export function setupPublishing(host: PublishHost) {
  const button = document.getElementById('publish-game') as HTMLButtonElement | null;if (!button) return;
  const dialog = el('dialog', 'publish');dialog.setAttribute('aria-labelledby', 'publish-heading');document.body.append(dialog);
  let controller: AbortController | undefined, working = false, timer = 0;
  const close = () => { if (working) { controller?.abort();return; } clearInterval(timer);dialog.close(); };
  dialog.addEventListener('cancel', (e) => { e.preventDefault();close(); });
  const head = (eyebrow: string, title: string, lead?: string) => { const h = el('h2', '', title);h.id = 'publish-heading';return [el('span', 'eyebrow', eyebrow), h, ...(lead ? [el('p', 'publish-lead', lead)] : [])]; };
  const actions = (...buttons: HTMLElement[]) => { const row = el('div', 'publish-actions');row.append(...buttons);return row; };
  const action = (label: string, cls: string, run: () => void) => { const b = el('button', cls, label);b.type = 'button';b.onclick = run;return b; };

  function intro() {
    const project = host.project(), title = gameNameOf(project), endpoint = publishEndpoint(), blocked = publishBlock(JSON.stringify(project, null, 2));
    dialog.dataset.stage = 'intro';dialog.replaceChildren(...head('PUBLISH ONLINE', `Put ${title} on the web`, 'Free hosting on Cloudflare, with a link anyone can play. You keep it by claiming it into your own free Cloudflare account.'));
    // The game as it will go out, with a way back to Customize to change its name or colours first.
    const card = el('div', 'publish-identity'), theme = project.theme ?? DEFAULT_THEME, swatch = el('i'), words = el('div');
    swatch.style.setProperty('--p-bg', theme.background);swatch.style.setProperty('--p-accent', theme.accent);swatch.style.setProperty('--p-ink', theme.text);
    words.append(el('strong', '', title), el('small', '', 'Name, How to play and colours from Customize'));
    const edit = action('Edit', 'quiet', () => { close();document.getElementById('customize-game')?.click(); });
    card.append(swatch, words, edit);dialog.append(card);
    const points = el('ul', 'publish-points');
    for (const [icon, strong, rest] of [['bolt', 'Live in about a minute.', ' No sign-up to start.'], ['key', 'Claim within 60 minutes', ' to keep it; unclaimed games are deleted.'], ['globe', 'Plays anywhere', ' on phones and computers, independently of Ara.']] as const) { const li = el('li');li.innerHTML = ICONS[icon];const p = el('p');p.append(el('strong', '', strong), rest);li.append(p);points.append(li); }
    dialog.append(points);
    if (!endpoint || blocked) {
      const note = el('div', 'publish-note');note.innerHTML = ICONS.shield;note.append(el('p', '', blocked ?? 'Publishing online is not set up for this copy of Ara Play. You can still download the game ZIP and host it yourself.'));
      dialog.append(note, actions(action('Close', 'quiet', close)));return;
    }
    const limits = el('details', 'publish-limits'), summary = el('summary', '', 'Limits of this free hosting'), list = el('ul');
    for (const item of ['Deleted after 60 minutes unless you claim it.', 'Once claimed, Cloudflare’s free plan allows about 100,000 requests a day: roughly a couple of thousand plays.', 'Each publish makes a new game at a new address; to change the game, publish again.', 'Up to 200 MB. Visitors may briefly see a Cloudflare check before the game.']) list.append(el('li', '', item));
    limits.append(summary, list, hostingLink('Other ways to host your game'));dialog.append(limits);
    const consent = el('label', 'publish-consent'), box = el('input');box.type = 'checkbox';
    const terms = el('a', '', 'Terms of Service'), privacy = el('a', '', 'Privacy Policy');terms.href = 'https://www.cloudflare.com/website-terms/';privacy.href = 'https://www.cloudflare.com/privacypolicy/';for (const a of [terms, privacy]) { a.target = '_blank';a.rel = 'noopener'; }
    consent.append(box, el('span', '', 'I agree to Cloudflare’s '), terms, el('span', '', ' and '), privacy, el('span', '', ', and I have the rights to everything in this game.'));
    const go = action('Publish game', 'primary', () => void run());go.disabled = true;box.onchange = () => { go.disabled = !box.checked; };
    dialog.append(consent, actions(action('Cancel', 'quiet', close), go));
  }

  async function run() {
    const project = host.project(), projectText = JSON.stringify(project, null, 2), task = new AbortController();controller = task;working = true;host.busy(true);host.stopPreview();
    dialog.dataset.stage = 'progress';dialog.replaceChildren(...head('PUBLISHING', 'Putting your game online', 'Keep this window open. It usually takes about a minute.'));
    const list = el('ol', 'publish-steps'), rows = new Map<PublishStep, { li: HTMLLIElement; bar: HTMLElement; detail: HTMLElement }>();
    for (const [id, label, hint] of STEPS) { const li = el('li'), mark = el('span', 'publish-mark'), text = el('div'), bar = el('div', 'publish-bar'), detail = el('small', '', hint);bar.append(el('i'));text.append(el('span', '', label), detail, bar);li.append(mark, text);li.dataset.state = 'next';list.append(li);rows.set(id, { li, bar, detail }); }
    const cancel = action('Cancel', 'quiet', close);dialog.append(list, actions(cancel));
    let current: PublishStep | undefined;
    const report = (step: PublishStep, fraction?: number, detail?: string) => {
      if (step !== current) { let past = true;for (const [id] of STEPS) { const r = rows.get(id)!;if (id === step) past = false;r.li.dataset.state = id === step ? 'now' : past ? 'done' : 'next'; } current = step; }
      const r = rows.get(step)!;r.bar.hidden = fraction === undefined;if (fraction !== undefined) (r.bar.firstElementChild as HTMLElement).style.width = `${Math.round(fraction * 100)}%`;if (detail) r.detail.textContent = detail;
    };
    let prepared: Awaited<ReturnType<PublishHost['prepare']>> | undefined;
    try {
      const result = await publishGame(projectText, async () => {
        prepared = await host.prepare(project, (text) => { rows.get('build')!.detail.textContent = text; });task.signal.throwIfAborted();
        const { gameFiles } = await import('./export-game');
        return gameFiles(project, prepared.cast, host.library(), task.signal, (text, fraction) => { rows.get('build')!.detail.textContent = text;report('build', fraction * 0.6); });
      }, task.signal, (p) => report(p.step, p.step === 'build' && p.fraction !== undefined ? 0.6 + p.fraction * 0.4 : p.fraction, p.detail));
      done(gameNameOf(project), result.url, result.claimUrl, result.claimExpiresAt);
    } catch (error) {
      if ((error as Error).name === 'AbortError') { dialog.close();return; }
      failed((error as Error).message, current);
    } finally { prepared?.dispose();working = false;host.busy(false); }
  }

  function done(title: string, url: string, claimUrl: string, expiresAt: string) {
    dialog.dataset.stage = 'done';const badge = el('div', 'publish-badge');badge.innerHTML = ICONS.check;
    dialog.replaceChildren(badge, ...head('YOUR GAME IS LIVE', `${title} is online`, 'Share the link with anyone. It works on phones and computers.'));
    const field = el('div', 'publish-link'), link = el('a', '', url.replace(/^https:\/\//, '').replace(/\/$/, ''));link.href = url;link.target = '_blank';link.rel = 'noopener';
    const copy = action('', 'publish-copy', () => { void navigator.clipboard?.writeText(url).then(() => { copy.dataset.copied = 'true';copy.lastChild!.textContent = 'Copied';setTimeout(() => { delete copy.dataset.copied;copy.lastChild!.textContent = 'Copy'; }, 1800); }); });
    copy.innerHTML = ICONS.copy;copy.append(el('span', '', 'Copy'));copy.setAttribute('aria-label', 'Copy the game link');field.append(link, copy);
    const claim = el('div', 'publish-claim'), clock = el('strong', 'publish-clock'), claimButton = el('a', 'primary', 'Claim it on Cloudflare');claimButton.href = claimUrl;claimButton.target = '_blank';claimButton.rel = 'noopener';
    const copyText = el('p', 'micro', 'Signing in or creating a free Cloudflare account moves the game into your account for good. Keep this claim link private: whoever uses it owns the game.');
    const top = el('div', 'publish-claim-top');top.append(el('span', '', 'Keep it: claim within'), clock);claim.append(top, claimButton, copyText);
    const tick = () => { const left = Date.parse(expiresAt) - Date.now();if (!(left > 0)) { clock.textContent = '0:00';claim.dataset.expired = 'true';claimButton.removeAttribute('href');copyText.textContent = 'The claim window has ended. Unclaimed games are deleted shortly; publish again to get a new link.';clearInterval(timer);return; } const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);clock.textContent = `${m}:${String(s).padStart(2, '0')}`;claim.dataset.urgent = String(left < 10 * 60000); };
    tick();clearInterval(timer);timer = window.setInterval(tick, 1000);
    const open = el('a', 'secondary', 'Open game');open.href = url;open.target = '_blank';open.rel = 'noopener';
    const note = el('p', 'publish-footnote', 'To change the game later, publish again: it makes a new game at a new address. For a permanent home, ');note.append(hostingLink('see other ways to host it'), '.');
    dialog.append(field, claim, note, actions(action('Done', 'quiet', close), open));
  }

  function failed(message: string, step?: PublishStep) {
    dialog.dataset.stage = 'error';const label = STEPS.find(([id]) => id === step)?.[1];
    dialog.replaceChildren(...head('NOT PUBLISHED', 'Your game didn’t go online', label ? `It stopped at “${label}”.` : undefined));
    const note = el('div', 'publish-note');note.innerHTML = ICONS.shield;note.append(el('p', '', message));
    dialog.append(note, actions(action('Close', 'quiet', close), action('Try again', 'primary', () => void run())));
  }

  button.onclick = () => { if (working) return;intro();dialog.showModal(); };
}
