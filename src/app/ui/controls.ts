/** Reusable sidebar controls bound to the store's parameters. */
import type { CatalogItem } from '../../core/assets';
import type { HumanParams } from '../../core/params';
import type { Ctx } from './context';
import { el } from './dom';

export const NONE = [{ id: 'none', name: 'None' }];

export function section(title: string, open: boolean, ...kids: Node[]) {
  const d = el('details', { open });
  d.append(el('summary', { textContent: title }), el('div', {}, ...kids));
  return d;
}

export function slider(ctx: Ctx, label: string, get: () => number, put: (v: number) => void, min = 0, max = 1, step = 0.01, fmt = (v: number) => v.toFixed(2)) {
  const input = el('input', { type: 'range', min: String(min), max: String(max), step: String(step) });
  const out = el('output');
  const show = () => { input.value = String(get()); out.textContent = fmt(get()); };
  input.addEventListener('input', () => { put(Number(input.value)); out.textContent = fmt(Number(input.value)); });
  input.addEventListener('dblclick', () => { put(min < 0 ? 0 : (min + max) / 2); show(); });
  ctx.store.on('sync', show);
  show();
  return el('div', { className: 'ctl' }, el('span', { textContent: label }), input, out);
}

/** Slider for a 0..1 parameter. */
export const macro = (ctx: Ctx, label: string, key: keyof HumanParams) =>
  slider(ctx, label, () => ctx.store.params[key] as number, (v) => ctx.store.set({ [key]: v }));

export type ColorKey = 'skinTint' | 'hairTint' | 'outfitTint' | 'hairColor' | 'beardColor' | 'tattooInk';
/** Colour picker. `live` updates while dragging; otherwise on release (for colours that repaint textures). */
export function color(ctx: Ctx, label: string, key: ColorKey, live = true) {
  const input = el('input', { type: 'color' });
  input.addEventListener(live ? 'input' : 'change', () => ctx.store.set({ [key]: input.value }));
  ctx.store.on('sync', () => (input.value = ctx.store.params[key]));
  input.value = ctx.store.params[key];
  return el('div', { className: 'ctl wide' }, el('span', { textContent: label }), input);
}

/** Thumbnail grid choosing one catalog item. */
/** Extra picker entries: `src` is a ready image URL; `pick` replaces the default (set the key to the id). */
export interface PickerExtra {
  id: string;
  name: string;
  src?: string;
  pick?: () => void;
}

export function picker(ctx: Ctx, items: CatalogItem[], key: keyof HumanParams, extra: PickerExtra[] = [], after: PickerExtra[] = []) {
  const grid = el('div', { className: 'picker' });
  const buttons = new Map<string, HTMLButtonElement>();
  for (const it of [...extra, ...items, ...after] as (PickerExtra | CatalogItem)[]) {
    const src = 'src' in it && it.src ? it.src : 'thumb' in it && it.thumb ? ctx.lib.source.url!(it.thumb as string) : '';
    const thumb = src ? el('img', { src, alt: '', loading: 'lazy' }) : it.name;
    const b = el('button', { title: it.name }, thumb, el('span', { className: 'cap', textContent: it.name }));
    b.addEventListener('click', () => ('pick' in it && it.pick ? it.pick() : ctx.store.set({ [key]: it.id })));
    buttons.set(it.id, b);
    grid.append(b);
  }
  const show = () => buttons.forEach((b, id) => b.classList.toggle('on', ctx.store.params[key] === id));
  ctx.store.on('sync', show);
  show();
  // Cheap reactivity: re-highlight after any change.
  grid.addEventListener('click', () => requestAnimationFrame(show));
  return grid;
}

export function selectRow(ctx: Ctx, label: string, options: [string, string][], get: () => string, put: (v: string) => void) {
  const sel = el('select');
  for (const [v, l] of options) sel.append(new Option(l, v));
  sel.addEventListener('change', () => put(sel.value));
  ctx.store.on('sync', () => (sel.value = get()));
  sel.value = get();
  return el('div', { className: 'ctl wide' }, el('span', { textContent: label }), sel);
}
