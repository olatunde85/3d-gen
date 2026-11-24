/**
 * The Packs window: import animation files (FBX, GLB, glTF, BVH) or whole folders straight into a pack, add a pack by
 * its address or file, rename and regroup imported animations, download a pack to share it, and remove packs. One
 * window for the builder, Studio and Play, styled like Keys.
 */
import '../keys/keys.css';
import './packs.css';
import { loadedPack, loadedPacks, onPacksChange, PACK_CATEGORIES, PACK_EXTENSION } from '../../core/packs';
import type { ImportFile } from '../../core/packs/build';
import { addPack, editablePack, editPack, importFiles, packFile, removePack, restorePacks, unusablePacks } from './store';
import { droppedFiles } from '../files';

const html = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const ANIMATION_FILE = /\.(fbx|glb|gltf|bvh)$/i;
let dialog: HTMLDialogElement | undefined;
let afterClose: (() => void) | undefined;
let inUse: () => readonly string[] = () => [];
/** The imported pack whose animations are open for editing. */
let editing = '';
/** The pack the last import went into, offered for the next one. */
let lastInto = '';

export interface OpenPacks {
  /** Called once the window closes. */
  then?: () => void;
  /** IDs of the packs the open work uses, which can't be removed while it does. */
  inUse?: () => readonly string[];
}

/** Opens Packs. */
export function openPacks(options: OpenPacks = {}) {
  dialog ??= create();
  afterClose = options.then;
  inUse = options.inUse ?? (() => []);
  void restorePacks().then(render);
  render();
  if (!dialog.open) dialog.showModal();
  dialog.querySelector<HTMLElement>('[data-r="choose"]')!.focus();
}

/** A short count of what the loaded packs add, for the buttons that open this window ("2 packs · 14 animations"). */
export function packSummary(): string {
  const packs = loadedPacks();
  if (!packs.length) return '';
  const n = packs.reduce((s, p) => s + p.animations.length, 0);
  return `${packs.length} pack${packs.length === 1 ? '' : 's'} · ${n} animation${n === 1 ? '' : 's'}`;
}

function create() {
  const d = document.body.appendChild(document.createElement('dialog'));
  d.className = 'ak-keys ak-packs'; d.id = 'packs-dialog'; d.setAttribute('aria-labelledby', 'packs-title');
  d.innerHTML = `
    <div class="ak-top"><span class="ak-eyebrow">PACKS</span><button class="ak-icon" data-r="close" aria-label="Close Packs">✕</button></div>
    <h2 id="packs-title">Add animations</h2>
    <p class="ak-muted">Bring animations from Mixamo, Blender or motion capture. Ara fits them to every character, and they work in the builder, Studio and Play.</p>
    <section class="ak-add pk-import" aria-labelledby="packs-import">
      <h3 id="packs-import" class="sr-only">Import animations</h3>
      <div class="pk-drop" data-r="drop">
        <strong>Drop animation files or a folder here</strong>
        <span class="ak-muted ak-small">FBX (such as Mixamo downloads), GLB, glTF or BVH. Names and groups are filled in for you.</span>
        <button class="ak-btn ak-primary" data-r="choose">Choose files…</button>
      </div>
      <div class="pk-into"><label for="packs-into">Into</label><select id="packs-into" data-r="into"></select></div>
      <p class="ak-detect" data-r="status" role="status" aria-live="polite"></p>
      <input data-r="file" type="file" multiple accept=".fbx,.glb,.gltf,.bvh,.json,application/json" hidden />
    </section>
    <details class="pk-address">
      <summary>Add a pack by its address</summary>
      <div class="ak-paste"><label class="sr-only" for="packs-url">Pack address</label><input id="packs-url" data-r="url" type="url" autocomplete="off" spellcheck="false" placeholder="https://…/moves${PACK_EXTENSION}" /><button class="ak-btn" data-r="add">Add</button></div>
    </details>
    <section class="ak-section" aria-labelledby="packs-list-title">
      <div class="ak-section-head"><h3 id="packs-list-title">In this browser</h3><span class="ak-muted ak-small" data-r="summary"></span></div>
      <ul class="ak-list" data-r="list"></ul>
    </section>
    <section class="ak-privacy" aria-label="About packs">
      <ul>
        <li>Packs hold data only, never code, and Ara checks every one before using it.</li>
        <li>Share packs only with animations you may share; some services let you use their animations but not pass the files on.</li>
      </ul>
      <div class="ak-footer"><a class="ak-small" href="/docs/packs/" target="_blank" rel="noopener">How packs work ↗</a><button class="ak-btn" data-r="done">Done</button></div>
    </section>`;
  const $ = <E extends HTMLElement = HTMLElement>(r: string) => d.querySelector<E>(`[data-r="${r}"]`)!;
  const url = $<HTMLInputElement>('url'), file = $<HTMLInputElement>('file'), drop = $('drop');
  let busy = false;
  const say = (text: string, kind: '' | 'ok' | 'bad' | 'busy' = '') => { $('status').textContent = text;$('status').className = `ak-detect ${kind}`; };
  const lock = (on: boolean) => { busy = on;d.classList.toggle('pk-busy', on);for (const r of ['add', 'choose']) $<HTMLButtonElement>(r).disabled = on; };
  const count = (n: number) => `${n} animation${n === 1 ? '' : 's'}`;

  /** Animation files become a pack (or join one); pack files are added as they are. */
  async function take(files: File[], folder?: string) {
    if (busy || !files.length) return;
    lock(true);
    try {
      const packs = files.filter((f) => /\.json$/i.test(f.name)), anims = files.filter((f) => ANIMATION_FILE.test(f.name));
      for (const p of packs) { const added = await addPack({ text: await p.text() });say(`Added ${added.pack.name}: ${count(added.animations.length)}.`, 'ok'); }
      if (!anims.length) { if (!packs.length) say('Choose FBX, GLB, glTF or BVH animation files, or a pack file.', 'bad');return; }
      const into = $<HTMLSelectElement>('into').value;
      say(`Reading ${anims.length} file${anims.length === 1 ? '' : 's'}…`, 'busy');
      const input: ImportFile[] = await Promise.all(anims.map(async (f) => ({ name: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
      const result = await importFiles(input, {
        into: into || undefined, name: folder ? folder.replace(/[_-]+/g, ' ') : undefined,
        progress: (done, total, label) => say(done < total ? `Converting ${done + 1} of ${total}: ${label}` : 'Finishing…', 'busy'),
      });
      lastInto = editing = result.pack.id;
      const skipped = result.skipped.length ? ` Skipped ${result.skipped.length}: ${result.skipped.slice(0, 3).map((s) => `${s.file} (${s.reason})`).join('; ')}${result.skipped.length > 3 ? '…' : ''}.` : '';
      say(`Imported ${count(result.added.length)} into ${result.loaded.label}. Rename them or change their groups below.${skipped}`, 'ok');
    } catch (error) { say((error as Error).message, 'bad'); }
    finally { lock(false);render(); }
  }

  $('choose').addEventListener('click', () => file.click());
  file.addEventListener('change', () => { const files = [...(file.files ?? [])];file.value = '';void take(files); });
  drop.addEventListener('dragover', (e) => { e.preventDefault();drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', async (e) => {
    e.preventDefault();drop.classList.remove('over');
    if (!e.dataTransfer) return;
    const { files, folder } = await droppedFiles(e.dataTransfer);
    void take(files, folder);
  });
  $('add').addEventListener('click', async () => {
    const v = url.value.trim();
    if (!v) return url.focus();
    if (busy) return;
    lock(true);say('Adding the pack…', 'busy');
    try { const p = await addPack({ url: v });url.value = '';say(`Added ${p.pack.name}: ${count(p.animations.length)}.`, 'ok'); }
    catch (error) { say((error as Error).message, 'bad'); }
    finally { lock(false);render(); }
  });
  url.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault();$('add').click(); } });

  d.addEventListener('click', async (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!el) return;
    const id = el.dataset.id!, name = loadedPack(id)?.label ?? id;
    if (el.dataset.act === 'edit') { editing = editing === id ? '' : id;render();return; }
    if (el.dataset.act === 'download') {
      const f = packFile(id), a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(f), download: f.name });
      a.click();setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      say(`Downloaded ${f.name}. Host it online to share films that use it (see How packs work).`, 'ok');
      return;
    }
    if (el.dataset.act === 'drop-anim') {
      const pack = loadedPack(id)!;
      if (pack.pack.animations!.length === 1) { el.closest('li')?.querySelector<HTMLElement>('[data-act="remove"]')?.click();return; }
      editPack(id, (p) => { p.animations = p.animations!.filter((a) => a.id !== el.dataset.anim); });
      render();return;
    }
    if (el.dataset.act === 'remove') {
      if (!confirm(`Remove ${name}? ${editablePack(id) ? 'Download it first to keep a copy.' : 'Films that use it load it again from its address.'}`)) return;
      await removePack(id);
      if (editing === id) editing = '';
      say(`Removed ${name}.`);render();
    }
  });
  // Renaming and regrouping apply as soon as a field changes.
  d.addEventListener('change', (e) => {
    const el = e.target as HTMLInputElement | HTMLSelectElement;
    const id = el.dataset.id, anim = el.dataset.anim;
    if (!id || !el.dataset.field) return;
    try {
      editPack(id, (p) => {
        if (el.dataset.field === 'pack-name') p.name = el.value.trim().slice(0, 60) || p.name;
        const a = p.animations!.find((x) => x.id === anim);
        if (a && el.dataset.field === 'name') a.name = el.value.trim().slice(0, 60) || a.name;
        if (a && el.dataset.field === 'category') a.category = el.value as typeof a.category;
      });
    } catch (error) { say((error as Error).message, 'bad'); }
    render();
  });
  for (const r of ['close', 'done']) $(r).addEventListener('click', () => d.close());
  d.addEventListener('close', () => { say('');const then = afterClose;afterClose = undefined;then?.(); });
  onPacksChange(() => { if (d.open && !busy) render(); });
  return d;
}

/** Packs the Studio film saved in this browser uses: kept from any app, so that film always opens. */
function savedFilmPacks(): string[] {
  try {
    const film = JSON.parse(localStorage.getItem('ara.studio.project.v2') ?? 'null') as { packs?: { id?: unknown }[] } | null;
    return Array.isArray(film?.packs) ? film.packs.map((p) => p?.id).filter((id): id is string => typeof id === 'string') : [];
  } catch { return []; }
}

function render() {
  if (!dialog) return;
  const $ = (r: string) => dialog!.querySelector<HTMLElement>(`[data-r="${r}"]`)!;
  const packs = loadedPacks(), used = new Set([...inUse(), ...savedFilmPacks()]), editable = packs.filter((p) => !p.url);
  // Into: a new pack, or an imported one (the last used first).
  const into = $('into') as HTMLSelectElement, chosen = into.value || lastInto;
  into.replaceChildren(new Option('A new pack', ''), ...editable.map((p) => new Option(p.label, p.pack.id)));
  into.value = editable.some((p) => p.pack.id === chosen) ? chosen : '';
  $('summary').textContent = packSummary();
  const rows = packs.map(({ pack, url, animations, label }) => {
    const mine = !url, open = mine && editing === pack.id, inFilm = used.has(pack.id);
    const about = [pack.author && `by ${pack.author}`, pack.license].filter(Boolean).join(' · ');
    const remove = inFilm ? `<span class="ak-tag" title="Your Studio film uses it: take its animations out of the film to remove it">In use</span>` : `<button class="ak-link" data-act="remove" data-id="${html(pack.id)}" aria-label="Remove ${html(label)}">Remove</button>`;
    const actions = [
      mine ? `<button class="ak-link" data-act="edit" data-id="${html(pack.id)}" aria-expanded="${open}">${open ? 'Close' : 'Edit'}</button>` : '',
      mine ? `<button class="ak-link" data-act="download" data-id="${html(pack.id)}">Download</button>` : '',
      pack.homepage ? `<a class="ak-small" href="${html(pack.homepage)}" target="_blank" rel="noopener">About ↗</a>` : '',
      remove,
    ].join('');
    const editor = !open ? '' : `<div class="pk-edit">
      <label class="pk-pack-name"><span>Pack name</span><input data-id="${html(pack.id)}" data-field="pack-name" value="${html(pack.name)}" maxlength="60" /></label>
      <ul>${pack.animations!.map((a) => `<li>
        <input aria-label="Name" data-id="${html(pack.id)}" data-anim="${html(a.id)}" data-field="name" value="${html(a.name)}" maxlength="60" />
        <select aria-label="Group" data-id="${html(pack.id)}" data-anim="${html(a.id)}" data-field="category">${PACK_CATEGORIES.map((c) => `<option${c === a.category ? ' selected' : ''}>${html(c)}</option>`).join('')}</select>
        <span class="ak-muted ak-small">${a.motion.duration.toFixed(1)} s${a.motion.loop ? ' · loops' : ''}</span>
        ${inFilm ? '' : `<button class="ak-link" data-act="drop-anim" data-id="${html(pack.id)}" data-anim="${html(a.id)}" aria-label="Remove ${html(a.name)}">✕</button>`}
      </li>`).join('')}</ul></div>`;
    return `<li class="ak-provider on">
      <span class="ak-name"><span class="ak-dot" aria-hidden="true"></span>${html(label)}<span class="ak-tag">${animations.length} animation${animations.length === 1 ? '' : 's'}</span></span>
      <span class="ak-actions">${actions}</span>
      <span class="ak-info">${html([about, pack.description, url ? `From ${url}` : 'Imported in this browser'].filter(Boolean).join(' — '))}</span>
      ${editor}
    </li>`;
  });
  for (const [id, problem] of unusablePacks) rows.push(`<li class="ak-provider problem"><span class="ak-name"><span class="ak-dot" aria-hidden="true"></span>${html(id)}</span><span class="ak-actions"><button class="ak-link" data-act="remove" data-id="${html(id)}">Remove</button></span><span class="ak-info">${html(problem)}</span></li>`);
  // Keep focus in a field being edited when the list redraws.
  const focused = document.activeElement as HTMLElement | null, key = focused?.dataset.field ? `${focused.dataset.id}|${focused.dataset.anim ?? ''}|${focused.dataset.field}` : '';
  $('list').innerHTML = rows.join('') || '<li class="ak-provider off"><span class="ak-info">No packs yet. Drop some animation files above.</span></li>';
  if (key) dialog.querySelector<HTMLElement>(`[data-field="${key.split('|')[2]}"][data-id="${key.split('|')[0]}"]${key.split('|')[1] ? `[data-anim="${key.split('|')[1]}"]` : ':not([data-anim])'}`)?.focus();
}
