/** Sidebar: separate clothing pieces, garment styles, underwear and accessories. */
import { GARMENTS, garmentById, OUTFIT_SETS, PATTERNS, setById } from '../../core/garments';
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
    const def = garmentById.get(id) ?? setById.get(id);
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
  const opts = (slot: 'top' | 'bottom', none: string): [string, string][] =>
    [['none', none], ...GARMENTS.filter((g) => g.slot === slot && g.id !== 'briefs').map((g) => [g.id, g.label] as [string, string])];
  // Always available: picking a top or bottom while a full outfit is worn switches to separate pieces
  // (an outfit set's pieces and colours carry over).
  const pick = (patch: Partial<HumanParams>) => {
    const set = setById.get(store.params.outfit);
    if (set) {
      const st = store.params.garmentStyles;
      const shared = { pattern: set.patterns[0], color: set.color, color2: set.color2, ...st[set.id] };
      patch = { top: set.top, bottom: set.bottom, garmentStyles: { ...st, [set.top]: shared, ...(set.bottom !== 'none' ? { [set.bottom]: shared } : {}) }, ...patch };
    }
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
      });
      store.emit('sync');
    },
  }));
}

/** Pattern and colours of the selected outfit set (shared by its pieces). */
export function outfitSetStyle(ctx: Ctx) {
  return styleControls(ctx, () => (setById.has(ctx.store.params.outfit) ? ctx.store.params.outfit : ''));
}

/** Colour of the high heels, when worn. */
export function heelsStyle(ctx: Ctx) {
  return styleControls(ctx, () => (ctx.store.params.shoes === 'heels' ? 'heels' : ''));
}
