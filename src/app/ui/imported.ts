/**
 * Imported characters in the builder: open a rigged model (GLB, glTF, FBX) with Open character or by dropping it on
 * the view. It plays every animation and content pack and exports with them baked in. Ara's body, clothing and look
 * controls step aside while it's shown (they shape Ara's own characters); Back to Ara characters returns to them.
 */
import { triangleCount } from '../../core/mesh';
import { CARRIED, CARRY_LABELS, type CarryId } from '../../core/props/carry';
import type { Equipment } from '../../core/props/equip';
import { VEHICLE_FOR_CLIP } from '../../core/props/vehicles';
import { WEAPONS, WEAPON_LABELS, type WeaponId } from '../../core/props/weapons';
import { equipSaved, importCharacterFile, importedCharacters, openCharacter, registerTextures, removeCharacter, renameCharacter, SITE_MODEL_LIMIT, type OpenedCharacter } from '../characters/store';
import type { Ctx } from './context';
import { droppedFiles } from '../files';
import { $, el } from './dom';
import { carryClip, WEAPON_IDLE } from './sidebar-looks';

export const MODEL_FILE = /\.(glb|gltf|vrm|fbx)$/i;
const html = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
// Every carried item but the backpack, which is clothing fitted over Ara's own bodies.
const CARRY_CHOICES = CARRIED.filter((c) => c !== 'backpack');
const NO_PROPS: Equipment = { weapon: 'none', carry: 'none' };

export function importedCharacterUi(ctx: Ctx) {
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
    const ch = await engine.use(c.character, c.textures, c.equipment ?? NO_PROPS);
    current = c;
    viewer.show(ch);
    $('#loading').hidden = true;
    $('#stats').textContent = `${(ch.height * 100).toFixed(0)} cm · ${c.report.bones} bones · ${triangleCount(ch.mesh).toLocaleString()} tris · ${ch.mesh.materials.length} materials · imported`;
    store.useImported(ch);
    await render();
  }

  /**
   * Opens a model file: converts it, keeps it in this browser and shows it. `beside`: files that came with it (its
   * textures, from a folder or a multiple choice), which it finds by the names it gives them.
   */
  async function openFile(file: File, beside: readonly File[] = []) {
    if (file.size > SITE_MODEL_LIMIT) {
      const mb = (n: number) => `${Math.round(n / 1e6)} MB`;
      status(`${file.name} is ${mb(file.size)}; the builder opens models up to ${mb(SITE_MODEL_LIMIT)}, as it runs in your browser. Make it smaller (smaller textures do most: npx @gltf-transform/cli optimize ${file.name} smaller.glb), or use the command line, which takes up to 200 MB: npx ara3d export --model "${file.name}".`);
      return;
    }
    status('');
    try {
      await ctx.whenIdle();
      loading(`Opening ${file.name}…`);
      const c = await importCharacterFile(file, (stage) => loading(`${file.name}: ${stage}…`), beside);
      loading('Showing it…');
      await show(c);
      const found = c.report.files ?? [], mats = found.filter((f) => f.endsWith('.mat')).length, images = found.length - mats;
      const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
      const textures = found.length ? ` It found ${[images && plural(images, 'texture'), mats && plural(mats, 'material colour')].filter(Boolean).join(' and ')} beside it.` : '';
      status(`Opened ${c.name}. It plays every animation and exports with them.${textures}`);
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
    const r = current.report, eq = current.equipment ?? NO_PROPS;
    panel.innerHTML = `
      <div class="imp-head"><span class="imp-eyebrow">IMPORTED CHARACTER</span><button class="imp-link" data-act="leave">Back to Ara characters</button></div>
      <label class="imp-name">Name <input data-r="name" value="${html(current.name)}" maxlength="60" /></label>
      <p class="imp-facts">${(r.height * 100).toFixed(0)} cm · ${r.bones} bones (${r.animated} animated) · ${r.restPose}-pose${r.faceShapes.length ? ` · ${r.faceShapes.length} face shapes` : ''}</p>
      <p class="hint">Every animation and content pack plays on it, and Export bakes them into GLB or FBX. Its own look stays as modelled, so Ara's body and clothing controls don't apply.</p>
      ${r.notes.length ? `<ul class="imp-notes">${r.notes.map((n) => `<li>${html(n)}</li>`).join('')}</ul>` : ''}
      <div class="imp-props">
        <span class="imp-eyebrow">PROPS</span>
        <label class="ctl wide"><span>Held weapon</span><select data-e="weapon">${WEAPONS.map((w) => `<option value="${w}"${w === eq.weapon ? ' selected' : ''}>${WEAPON_LABELS[w]}</option>`).join('')}</select></label>
        <label class="ctl wide"><span>Carry</span><select data-e="carry">${CARRY_CHOICES.map((c) => `<option value="${c}"${c === eq.carry ? ' selected' : ''}>${CARRY_LABELS[c]}</option>`).join('')}</select></label>
        <label class="acc"><input type="checkbox" data-e="vehicle"${eq.vehicle !== 'none' ? ' checked' : ''} /> Vehicles in riding and driving animations</label>
        <p class="hint">Fitted to its own hands and body: a weapon in its right hand on a WeaponR socket bone, a bag in its left hand, and the phone, broom, parcel and gym weights in the animations that use them.</p>
      </div>
      <div class="imp-actions"><button data-act="remove">Remove from this browser</button></div>`;
  }

  /** Gives the character its props (they're kept with it), then plays `clip` to show them. */
  async function equip(next: Equipment, clip?: string) {
    if (!current) return;
    current = { ...current, equipment: next };
    void equipSaved(current.id, next);
    const ch = await engine.use(current.character, [], next);
    if (store.imported !== current.id) return;
    viewer.show(ch);
    store.useImported(ch);
    if (clip) ctx.playClip(clip);
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
    const prop = input.dataset.e, eq = current?.equipment ?? NO_PROPS;
    if (prop === 'weapon') return equip({ ...eq, weapon: input.value as WeaponId }, WEAPON_IDLE[input.value as WeaponId]);
    if (prop === 'carry') return equip({ ...eq, carry: input.value as CarryId }, carryClip(input.value as CarryId));
    if (prop === 'vehicle') return equip({ ...eq, vehicle: input.checked ? 'auto' : 'none' });
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
  view.addEventListener('drop', async (e) => {
    view.classList.remove('dropping');
    if (!e.dataTransfer || ![...e.dataTransfer.files].length) return;
    e.preventDefault();
    const { files } = await droppedFiles(e.dataTransfer);
    void openFiles(files);
  });

  /** A model and the files with it (a folder, several files): the model is opened, the rest are its textures. */
  function openFiles(files: readonly File[]) {
    const models = files.filter((f) => MODEL_FILE.test(f.name));
    if (!models.length) { status('Drop a character model (GLB, glTF, VRM or FBX), with its textures or its whole folder.');return; }
    // FBX first (it is the one that needs the textures beside it), then the others; the rest of the drop goes with it.
    const order = ['fbx', 'glb', 'gltf', 'vrm'], model = [...models].sort((a, b) => order.indexOf(a.name.split('.').pop()!.toLowerCase()) - order.indexOf(b.name.split('.').pop()!.toLowerCase()))[0];
    void openFile(model, files.filter((f) => f !== model));
  }

  // A riding or driving animation brings its vehicle, unless vehicles were turned off.
  store.on('clip', (id) => {
    const eq = current?.equipment ?? NO_PROPS;
    if (store.imported && current && VEHICLE_FOR_CLIP[id] && eq.vehicle === undefined) void equip({ ...eq, vehicle: 'auto' });
  });
  store.on('imported', () => { void render();void listYours(); });
  void listYours();
  return {
    openFile, openFiles,
    /** Reopens the imported character the builder showed last, if it was one. */
    restore: () => (store.imported ? openSaved(store.imported) : Promise.resolve()),
  };
}
