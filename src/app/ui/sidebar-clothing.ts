/** Sidebar: separate clothing pieces, garment styles, underwear and accessories. */
import { GARMENTS, garmentById, OUTFIT_SETS, PATTERNS, setById, setStyles, sharedPieces } from '../../core/garments';
import { ageToYears, type HumanParams } from '../../core/params';
import type { Ctx } from './context';
import { selectRow } from './controls';
import { el } from './dom';

/** Pattern + colour controls for whichever garment currently fills a slot. */
export function styleControls(ctx: Ctx, current: () => string) {
  const { store } = ctx;
  const box = el('div', { className: 'style-box' });
  let shown = '';
  const render = () => {
    const id = current();
    if (id === shown) {
      box.querySelectorAll<HTMLElement>('[data-sync]').forEach((e) => e.dispatchEvent(new Event('sync')));
      return;
    }
    shown = id;
    box.replaceChildren();
    // A garment, or a set whose pieces share one style (sets that don't show their pieces' controls).
    const set = setById.get(id);
    const def = garmentById.get(id) ?? (set?.patterns ? { patterns: set.patterns, color: set.color!, color2: set.color2! } : undefined);
    if (!def) return;
    const st = () => store.params.garmentStyles[id] ?? {};
    const put = (patch: Record<string, string>) =>
      store.set({ garmentStyles: { ...store.params.garmentStyles, [id]: { ...st(), ...patch } } });
    if (def.patterns.length > 1) {
      const sel = el('select');
      sel.dataset.sync = '1';
      for (const p of def.patterns.filter((x) => PATTERNS.includes(x))) sel.append(new Option(p, p));
      sel.value = st().pattern ?? def.patterns[0];
      sel.addEventListener('change', () => put({ pattern: sel.value }));
      sel.addEventListener('sync', () => (sel.value = st().pattern ?? def.patterns[0]));
      box.append(el('div', { className: 'ctl wide' }, el('span', { textContent: 'Pattern' }), sel));
    }
    for (const [key, label, fallback] of [['color', 'Colour', def.color], ['color2', 'Accent', def.color2]] as const) {
      const input = el('input', { type: 'color', value: st()[key] ?? fallback });
      input.dataset.sync = '1';
      input.addEventListener('input', () => put({ [key]: input.value }));
      input.addEventListener('sync', () => (input.value = st()[key] ?? fallback));
      box.append(el('div', { className: 'ctl wide' }, el('span', { textContent: label }), input));
    }
  };
  store.on('sync', render);
  render();
  return box;
}

export function piecesPanel(ctx: Ctx) {
  const { store } = ctx;
  const opts = (slot: 'top' | 'jacket' | 'bottom', none: string): [string, string][] =>
    [['none', none], ...GARMENTS.filter((g) => g.slot === slot && g.id !== 'briefs').map((g) => [g.id, g.label] as [string, string])];
  // Always available: picking a top or bottom while a full outfit is worn switches to separate pieces
  // (an outfit set's pieces and colours carry over).
  const pick = (patch: Partial<HumanParams>) => {
    const set = setById.get(store.params.outfit);
    if (set) patch = { top: set.top, jacket: set.jacket ?? 'none', bottom: set.bottom, garmentStyles: setStyles(set, store.params.garmentStyles), ...patch };
    store.set({ ...patch, outfit: 'none' });
    store.emit('sync');
  };
  const note = el('div', { className: 'hint' });
  const panel = el('div', { className: 'pieces' },
    note,
    el('div', { className: 'sub', textContent: 'Top' }),
    selectRow(ctx, 'Top', opts('top', 'None (shirtless / topless)'), () => store.params.top, (v) => pick({ top: v })),
    styleControls(ctx, () => store.params.top),
    el('div', { className: 'hint', textContent: 'Topless is available for adult characters; under-18 female characters automatically get a top.' }),
    el('div', { className: 'sub', textContent: 'Jacket' }),
    selectRow(ctx, 'Jacket', opts('jacket', 'None'), () => store.params.jacket, (v) => pick({ jacket: v })),
    styleControls(ctx, () => store.params.jacket),
    el('div', { className: 'sub', textContent: 'Bottom' }),
    selectRow(ctx, 'Bottom', opts('bottom', 'None'), () => store.params.bottom, (v) => pick({ bottom: v })),
    styleControls(ctx, () => store.params.bottom),
    underwearToggle(ctx),
  );
  const show = () => {
    const outfit = store.params.outfit !== 'none';
    panel.classList.toggle('inactive', outfit);
    note.textContent = outfit ? 'A full outfit is selected. Choosing a top or bottom switches to separate pieces.' : '';
    note.style.display = outfit ? '' : 'none';
  };
  store.on('sync', show);
  show();
  return panel;
}

/** Underwear on/off. Off (bottomless) is only possible for adult characters. */
function underwearToggle(ctx: Ctx) {
  const { store } = ctx;
  const box = el('input', { type: 'checkbox' });
  const note = el('div', { className: 'hint' });
  box.addEventListener('change', () => store.set({ underwear: box.checked }));
  const show = () => {
    const minor = ageToYears(store.params.age) < 18;
    box.checked = store.params.underwear || minor;
    box.disabled = minor;
    note.textContent = minor
      ? 'Under-18 characters always wear underwear.'
      : 'Untick for no underwear (bottomless), adults only. Also applies under wrappers, aprons and loincloths.';
  };
  store.on('sync', show);
  show();
  return el('div', {}, el('label', { className: 'acc' }, box, 'Underwear (briefs)'), note);
}

export function accessoriesPanel(ctx: Ctx) {
  const { store } = ctx;
  const wrap = el('div', {});
  for (const g of GARMENTS.filter((x) => x.slot === 'acc')) {
    const box = el('input', { type: 'checkbox' });
    box.addEventListener('change', () => {
      const has = store.params.accessories.includes(g.id);
      store.set({ accessories: has ? store.params.accessories.filter((a) => a !== g.id) : [...store.params.accessories, g.id] });
    });
    store.on('sync', () => (box.checked = store.params.accessories.includes(g.id)));
    box.checked = store.params.accessories.includes(g.id);
    wrap.append(el('label', { className: 'acc' }, box, g.label));
    // Colour controls for every accessory except beadwork (fixed bead palettes).
    if (!g.patterns.includes('beadbands')) wrap.append(styleControls(ctx, () => (store.params.accessories.includes(g.id) ? g.id : '')));
  }
  return wrap;
}

/** Outfit sets (paired top and bottom) as entries in the full-outfit picker. */
export function outfitSetEntries(ctx: Ctx) {
  const { store } = ctx;
  return OUTFIT_SETS.map((set) => ({
    id: set.id,
    name: set.label,
    src: `${import.meta.env.BASE_URL}outfit-thumbs/${set.id}.png`,
    pick: () => {
      const p = store.params;
      store.set({
        outfit: set.id,
        accessories: [...p.accessories, ...set.accessories.filter((a) => !p.accessories.includes(a))],
        ...(set.shoes ? { shoes: set.shoes } : {}),
        ...(set.hat ? { hat: set.hat } : {}),
        ...(set.carry ? { carry: set.carry } : {}),
      });
      store.emit('sync');
    },
  }));
}

/**
 * Pattern and colours of the selected outfit set: one set of controls for the pieces sharing a
 * style (plus the shirt under a suit jacket), otherwise controls for the top and for the bottom.
 */
export function outfitSetStyle(ctx: Ctx) {
  const set = () => setById.get(ctx.store.params.outfit);
  const shared = styleControls(ctx, () => (set()?.patterns ? set()!.id : ''));
  const top = styleControls(ctx, () => (set() && !(set()!.patterns && sharedPieces(set()!).includes(set()!.top)) ? set()!.top : ''));
  const bottom = styleControls(ctx, () => (set() && !set()!.patterns && set()!.bottom !== 'none' ? set()!.bottom : ''));
  return el('div', {}, shared, top, bottom);
}

/** Colours of a generated hat (the baseball cap), when worn. */
export function hatStyle(ctx: Ctx) {
  return styleControls(ctx, () => (garmentById.get(ctx.store.params.hat)?.slot === 'hat' ? ctx.store.params.hat : ''));
}

/** Generated hats, as extra entries in the Hat picker. */
export const HAT_ENTRIES = GARMENTS.filter((g) => g.slot === 'hat').map((g) => ({ id: g.id, name: g.label }));

/** Colour (and finish) of generated shoes, when worn: high heels, sneakers, loafers. */
export function shoeStyle(ctx: Ctx) {
  return styleControls(ctx, () => (garmentById.get(ctx.store.params.shoes)?.slot === 'feet' ? ctx.store.params.shoes : ''));
}
