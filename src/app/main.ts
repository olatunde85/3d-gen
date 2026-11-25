import {mobileBuilder} from './ui/mobile-builder';
/**
 * The web app: creates the services and mounts each part of the UI (see ./ui/). Parts talk
 * through the store's events, not each other's variables.
 */
import { AssetLibrary, fetchSource } from '../core/assets';
import { clipById } from '../core/anim/clips';
import { DEFAULT_PARAMS, PRESETS } from '../core/params';
import { Engine } from './engine';
import { decodeCharacter, encodeCharacter } from './share';
import { animationBar } from './ui/animation';
import type { Ctx } from './ui/context';
import { $ } from './ui/dom';
import { exportPanel } from './ui/export-panel';
import { generation } from './ui/generation';
import { characterAssist } from './ui/character-assist';
import { header } from './ui/header';
import { history } from './ui/history';
import { quickBuild } from './ui/quick-build';
import { shareDialog } from './ui/share-dialog';
import { sidebar } from './ui/sidebar';
import { Store } from './ui/store';
import { Viewer } from './viewer';
import { restorePacks } from './packs/store';
import { importedCharacterUi } from './ui/imported';

const assetsUrl = new URL(`${import.meta.env.BASE_URL}assets/`, location.href).href;
// Content packs first, with the catalog: saved export choices and the animation browser may use their animations.
const [lib] = await Promise.all([new AssetLibrary(fetchSource(assetsUrl)).initCatalog(), restorePacks()]);
// Building and exporting run in a worker, so the UI and the 3D view never freeze.
const engine = new Engine(lib, assetsUrl);
const viewer = new Viewer($<HTMLCanvasElement>('#viewport'), (f) => lib.textureUrl(f));
const store = new Store();

const base = { lib, cat: lib.catalog, viewer, engine, store };
const gen = generation(base);
const ctx: Ctx = { ...base, whenIdle: gen.whenIdle, playClip: (id) => anim.playClip(id) };

sidebar(ctx);
const anim = animationBar(ctx);
const imported = importedCharacterUi(ctx);
header(ctx, (files) => imported.openFiles(files));
const xp = exportPanel(ctx);
shareDialog(ctx);
$('#studio-btn').addEventListener('click', async () => {
  await ctx.whenIdle();
  const url = new URL(`${import.meta.env.BASE_URL}studio/`, location.href);
  // An imported character goes to Studio as a recipe naming it (Studio opens it from this browser) with its props.
  const recipe = (store.imported && imported.recipe()) || store.params;
  const params = new URLSearchParams({ c: encodeCharacter(recipe), detail: store.params.detail });
  const studioReturn = new URLSearchParams(location.hash.slice(1)).get('studioReturn');
  if (studioReturn) params.set('studioReturn', studioReturn);
  url.hash = params.toString();
  location.assign(url.href);
});
// Imported characters stay in this browser: no share link (it would need their model file). Studio, on the same
// site, opens them from this browser.
const syncImported = () => { for (const id of ['#share-btn']) { const b = $<HTMLButtonElement>(id);b.disabled = !!store.imported;b.title = store.imported ? 'Not yet available for imported characters' : b.dataset.title ??= b.title; } };
for (const id of ['#share-btn']) $<HTMLButtonElement>(id).dataset.title = $<HTMLButtonElement>(id).title;
store.on('imported', syncImported);
syncImported();
const syncPlayback = () => { viewer.rootMotion = store.exportSettings.rootMotion; viewer.stageProps = store.exportSettings.stageProps !== false; viewer.leftFooted = !!store.exportSettings.leftFooted; };
syncPlayback();
store.on('export', syncPlayback);

// URL options: #c=<shared character> | #preset=<name> | &clip=<id> &skeleton &export &download &face
const hash = new URLSearchParams(location.hash.slice(1));
const shared = hash.get('c');
const linkedDetail = hash.get('detail');
const detail = linkedDetail === 'low' || linkedDetail === 'medium' || linkedDetail === 'high' ? linkedDetail : store.params.detail;
const fromLink = shared ? decodeCharacter(shared, detail) : null;
const presetName = hash.get('preset');
// A link to an imported character (Studio's Edit character) opens it from this browser.
const linkedImport = fromLink?.imported ? fromLink : null;
if (fromLink && !linkedImport) store.params = fromLink;
else if (presetName && PRESETS[presetName]) store.params = { ...DEFAULT_PARAMS, ...PRESETS[presetName], name: presetName, detail: store.params.detail };
// A link opens the character it names; otherwise an imported character shown last opens again.
if (((fromLink && !linkedImport) || (presetName && PRESETS[presetName])) && store.imported) store.leaveImported();
store.emit('sync');
if (linkedImport) void imported.openRecipe(linkedImport).then((ok) => { if (!ok && !store.current) gen.regenerate(); });
else if (store.imported) void imported.restore();
else gen.regenerate();
// A character opened from a link (the characters page, a shared link) leaves the address once another character is
// picked or this one is changed, so a reload keeps the character being worked on (it is saved in the browser).
if (presetName || shared) {
  let linked = true;
  store.on('params', () => {
    if (!linked) return;
    linked = false;
    const h = new URLSearchParams(location.hash.slice(1));
    for (const key of ['preset', 'c', 'detail', 'download']) h.delete(key);
    const rest = h.toString();
    window.history.replaceState(window.history.state, '', location.pathname + location.search + (rest ? '#' + rest : ''));
  });
}
// Undo history starts from the character the app opened with; Quick build mounts above the sidebar.
quickBuild(ctx, history(store));
characterAssist(ctx);
mobileBuilder(ctx);
const clipName = hash.get('clip');
if (clipName && clipById.has(clipName)) anim.setActive(clipName);
if (hash.has('skeleton')) {
  $<HTMLInputElement>('#skeleton').checked = true;
  viewer.setSkeleton(true);
}
if (hash.has('export')) xp.open();
// From the characters page: build the character and download it as a .glb at once.
if (hash.has('download')) void (async () => { while (!store.current) await new Promise((r) => setTimeout(r, 200)); await xp.downloadGlb(); })();
// Scripted recordings (demo videos) drive the viewer and clips directly.
if (hash.has('demo')) Object.assign(window, { ara: { viewer, store, engine, play: (id: string) => anim.playClip(id) } });
if (hash.has('face')) {
  $<HTMLInputElement>('#face').checked = true;
  viewer.focusFace(true);
}
