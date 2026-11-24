/**
 * Imported characters in the builder: open a rigged model (GLB, glTF, FBX) with Open character or by dropping it on
 * the view. It plays every animation and content pack and exports with them baked in. Ara's body, clothing and look
 * controls step aside while it's shown (they shape Ara's own characters); Back to Ara characters returns to them.
 */
import { triangleCount } from '../../core/mesh';
import { importCharacterFile, importedCharacters, openCharacter, registerTextures, removeCharacter, renameCharacter, SITE_MODEL_LIMIT, type OpenedCharacter } from '../characters/store';
import type { Ctx } from './context';
import { $, el } from './dom';

export const MODEL_FILE = /\.(glb|gltf|fbx)$/i;
const html = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export function importedCharacterUi(ctx: Omit<Ctx, 'playClip'>) {
  const { store, engine, viewer, lib } = ctx;
  const panel = el('section', { id: 'imported-panel', ariaLabel: 'Imported character' });
  panel.hidden = true;
  $('#controls').before(panel);
  // Your characters: every imported character, one click away (shown once there is one).
  const yours = el('div', { id: 'your-characters', ariaLabel: 'Your imported characters' });
  yours.hidden = true;
  $('.character-files').after(yours);
  const status = (text: string) => { const s = $('#character-file-status');s.textContent = text; };
  // The view's loading cover says what's happening while a model opens.
  const loading = (label?: string) => { $('#loading').hidden = !label;if (label) $('#loading-text').textContent = label; };
  let current: OpenedCharacter | undefined;

  async function listYours() {
    const list = await importedCharacters();
    yours.hidden = !list.length;
    yours.replaceChildren(el('span', { className: 'hint', textContent: 'Your characters' }), ...list.map((c) => {
      const b = el('button', { textContent: c.name, title: `Open ${c.name} (${c.fileName})` });
      b.setAttribute('aria-pressed', String(store.imported === c.id));
      b.addEventListener('click', () => { if (store.imported !== c.id) void openSaved(c.id); });
      return b;
    }));
  }

  async function show(c: OpenedCharacter) {
    registerTextures(lib, c.textures);
    const ch = await engine.use(c.character, c.textures);
    current = c;
    viewer.show(ch);
    $('#loading').hidden = true;
    $('#stats').textContent = `${(ch.height * 100).toFixed(0)} cm · ${c.report.bones} bones · ${triangleCount(ch.mesh).toLocaleString()} tris · ${ch.mesh.materials.length} materials · imported`;
    store.useImported(ch);
    await render();
  }

  /** Opens a model file: converts it, keeps it in this browser and shows it. */
  async function openFile(file: File) {
    if (file.size > SITE_MODEL_LIMIT) {
      const mb = (n: number) => `${Math.round(n / 1e6)} MB`;
      status(`${file.name} is ${mb(file.size)}; the builder opens models up to ${mb(SITE_MODEL_LIMIT)}, as it runs in your browser. Make it smaller (smaller textures do most: npx @gltf-transform/cli optimize ${file.name} smaller.glb), or use the command line, which takes up to 200 MB: npx ara3d export --model "${file.name}".`);
      return;
    }
    status('');
    try {
      await ctx.whenIdle();
      loading(`Opening ${file.name}…`);
      const c = await importCharacterFile(file, (stage) => loading(`${file.name}: ${stage}…`));
      loading('Showing it…');
      await show(c);
      status(`Opened ${c.name}. It plays every animation and exports with them.`);
    } catch (error) { status((error as Error).message);loading(store.current ? undefined : 'Could not open the character.'); }
  }

  async function openSaved(id: string) {
    const name = (await importedCharacters()).find((c) => c.id === id)?.name ?? 'your character';
    try {
      loading(`Opening ${name}…`);
      await show(await openCharacter(id, (stage) => loading(`${name}: ${stage}…`)));
    } catch (error) { status((error as Error).message);loading();if (store.imported === id) store.leaveImported(); }
  }

  async function render() {
    document.body.classList.toggle('imported-character', !!store.imported);
    panel.hidden = !store.imported;
    if (!store.imported || !current) return;
    const r = current.report;
    panel.innerHTML = `
      <div class="imp-head"><span class="imp-eyebrow">IMPORTED CHARACTER</span><button class="imp-link" data-act="leave">Back to Ara characters</button></div>
      <label class="imp-name">Name <input data-r="name" value="${html(current.name)}" maxlength="60" /></label>
      <p class="imp-facts">${(r.height * 100).toFixed(0)} cm · ${r.bones} bones (${r.animated} animated) · ${r.restPose}-pose${r.faceShapes.length ? ` · ${r.faceShapes.length} face shapes` : ''}</p>
      <p class="hint">Every animation and content pack plays on it, and Export bakes them into GLB or FBX. Its own look stays as modelled, so Ara's body and clothing controls don't apply.</p>
      ${r.notes.length ? `<ul class="imp-notes">${r.notes.map((n) => `<li>${html(n)}</li>`).join('')}</ul>` : ''}
      <div class="imp-actions"><button data-act="remove">Remove from this browser</button></div>`;
  }

  panel.addEventListener('click', async (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'leave') { current = undefined;store.leaveImported();void render();status(''); }
    if (act === 'remove' && current && confirm(`Remove ${current.name} from this browser? Its file stays wherever you keep it.`)) {
      await removeCharacter(current.id);current = undefined;store.leaveImported();void render();void listYours();status('');
    }
  });
  panel.addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement;
    if (input.dataset.r !== 'name' || !current) return;
    const name = input.value.trim().slice(0, 60) || current.name;
    await renameCharacter(current.id, name);
    void listYours();
    current = { ...current, name, character: { ...current.character, params: { ...current.character.params, name } } };
    if (store.current?.imported === current.id) store.current = { ...store.current, params: { ...store.current.params, name } };
    await engine.use(store.current!, []);
  });

  // Dropping a model file anywhere on the view opens it.
  const view = $('main');
  view.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.items ?? [])].some((i) => i.kind === 'file')) { e.preventDefault();view.classList.add('dropping'); } });
  view.addEventListener('dragleave', () => view.classList.remove('dropping'));
  view.addEventListener('drop', (e) => {
    view.classList.remove('dropping');
    const file = [...(e.dataTransfer?.files ?? [])].find((f) => MODEL_FILE.test(f.name));
    if (!file) return;
    e.preventDefault();
    void openFile(file);
  });

  store.on('imported', () => { void render();void listYours(); });
  void listYours();
  return {
    openFile,
    /** Reopens the imported character the builder showed last, if it was one. */
    restore: () => (store.imported ? openSaved(store.imported) : Promise.resolve()),
  };
}
