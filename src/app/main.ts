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

const assetsUrl = new URL(`${import.meta.env.BASE_URL}assets/`, location.href).href;
const lib = await new AssetLibrary(fetchSource(assetsUrl)).initCatalog();
// Building and exporting run in a worker, so the UI and the 3D view never freeze.
const engine = new Engine(lib, assetsUrl);
const viewer = new Viewer($<HTMLCanvasElement>('#viewport'), (f) => lib.textureUrl(f));
const store = new Store();

const base = { lib, cat: lib.catalog, viewer, engine, store };
const gen = generation(base);
const ctx: Ctx = { ...base, whenIdle: gen.whenIdle, playClip: (id) => anim.playClip(id) };

sidebar(ctx);
const anim = animationBar(ctx);
header(ctx);
const xp = exportPanel(ctx);
shareDialog(ctx);
$('#studio-btn').addEventListener('click', async () => {
  await ctx.whenIdle();
  const url = new URL(`${import.meta.env.BASE_URL}studio/`, location.href);
  const params = new URLSearchParams({ c: encodeCharacter(store.params), detail: store.params.detail });
  const studioReturn = new URLSearchParams(location.hash.slice(1)).get('studioReturn');
  if (studioReturn) params.set('studioReturn', studioReturn);
  url.hash = params.toString();
  location.assign(url.href);
});
const syncPlayback = () => { viewer.rootMotion = store.exportSettings.rootMotion; viewer.stageProps = store.exportSettings.stageProps !== false; };
syncPlayback();
store.on('export', syncPlayback);

// URL options: #c=<shared character> | #preset=<name> | &clip=<id> &skeleton &export &download &face
const hash = new URLSearchParams(location.hash.slice(1));
const shared = hash.get('c');
const linkedDetail = hash.get('detail');
const detail = linkedDetail === 'low' || linkedDetail === 'medium' || linkedDetail === 'high' ? linkedDetail : store.params.detail;
const fromLink = shared ? decodeCharacter(shared, detail) : null;
const presetName = hash.get('preset');
if (fromLink) store.params = fromLink;
else if (presetName && PRESETS[presetName]) store.params = { ...DEFAULT_PARAMS, ...PRESETS[presetName], name: presetName, detail: store.params.detail };
store.emit('sync');
gen.regenerate();
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
if (hash.has('demo')) Object.assign(window, { ara: { viewer, store, play: (id: string) => anim.playClip(id) } });
if (hash.has('face')) {
  $<HTMLInputElement>('#face').checked = true;
  viewer.focusFace(true);
}
