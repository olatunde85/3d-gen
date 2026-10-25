/**
 * The web app: creates the services and mounts each part of the UI (see ./ui/). Parts talk
 * through the store's events, not each other's variables.
 */
import { AssetLibrary, fetchSource } from '../core/assets';
import { clipById } from '../core/anim/clips';
import { DEFAULT_PARAMS, PRESETS } from '../core/params';
import { Engine } from './engine';
import { decodeCharacter } from './share';
import { animationBar } from './ui/animation';
import type { Ctx } from './ui/context';
import { $ } from './ui/dom';
import { exportPanel } from './ui/export-panel';
import { generation } from './ui/generation';
import { header } from './ui/header';
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
viewer.rootMotion = store.exportSettings.rootMotion;
store.on('export', () => (viewer.rootMotion = store.exportSettings.rootMotion));

// URL options: #c=<shared character> | #preset=<name> | &clip=<id> &skeleton &export &face
const hash = new URLSearchParams(location.hash.slice(1));
const shared = hash.get('c');
const fromLink = shared ? decodeCharacter(shared, store.params.detail) : null;
const presetName = hash.get('preset');
if (fromLink) store.params = fromLink;
else if (presetName && PRESETS[presetName]) store.params = { ...DEFAULT_PARAMS, ...PRESETS[presetName], name: presetName, detail: store.params.detail };
store.emit('sync');
gen.regenerate();
const clipName = hash.get('clip');
if (clipName && clipById.has(clipName)) anim.setActive(clipName);
if (hash.has('skeleton')) {
  $<HTMLInputElement>('#skeleton').checked = true;
  viewer.setSkeleton(true);
}
if (hash.has('export')) xp.open();
// Scripted recordings (demo videos) drive the viewer and clips directly.
if (hash.has('demo')) Object.assign(window, { ara: { viewer, store, play: (id: string) => anim.playClip(id) } });
if (hash.has('face')) {
  $<HTMLInputElement>('#face').checked = true;
  viewer.focusFace(true);
}
