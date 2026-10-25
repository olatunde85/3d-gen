/** The sidebar: every character control, in display order. */
import { EXPRESSIONS, EXPRESSION_LABELS, type ExpressionId } from '../../core/face';
import { FACIAL_HAIR, FACIAL_HAIR_LABELS, type FacialHairId } from '../../core/looks';
import { ageToYears, DETAILS, yearsToAge, type HumanParams } from '../../core/params';
import type { Ctx } from './context';
import { color, macro, NONE, picker, section, selectRow, slider } from './controls';
import { $, el } from './dom';
import { accessoriesPanel, piecesPanel } from './sidebar-clothing';
import { earringPanel, hairPanel, tattooPanel, vehiclePanel, weaponPanel } from './sidebar-looks';

export function sidebar(ctx: Ctx): void {
  const { store, cat } = ctx;
  const p = () => store.params;
  const controls = $('#controls');
  controls.append(
    section('Body', true,
      slider(ctx, 'Gender', () => p().gender, (v) => store.set({ gender: v }), 0, 1, 0.01, (v) => (v < 0.35 ? 'female' : v > 0.65 ? 'male' : 'mixed')),
      slider(ctx, 'Age', () => ageToYears(p().age), (v) => store.set({ age: yearsToAge(v) }), 12, 90, 1, (v) => `${v.toFixed(0)} y`),
      macro(ctx, 'Muscle', 'muscle'), macro(ctx, 'Weight', 'weight'), macro(ctx, 'Height', 'height'), macro(ctx, 'Proportions', 'proportions'),
      macro(ctx, 'Breast size', 'breastSize'), macro(ctx, 'Breast firmness', 'breastFirmness'),
    ),
    section('Ethnicity', false,
      el('div', { className: 'hint', textContent: 'Blended mix; also picks the matching skin texture in Auto mode.' }),
      macro(ctx, 'African', 'african'), macro(ctx, 'Asian', 'asian'), macro(ctx, 'Caucasian', 'caucasian'),
    ),
    section('Skin & eyes', true,
      picker(ctx, cat.skins, 'skin', [{ id: 'auto', name: 'Auto' }]), color(ctx, 'Skin tint', 'skinTint'),
      el('div', { className: 'sub', textContent: 'Eyes' }), picker(ctx, cat.eyes, 'eyes'),
      el('div', { className: 'sub', textContent: 'Eyebrows' }), picker(ctx, cat.eyebrows, 'eyebrows', NONE),
      el('div', { className: 'sub', textContent: 'Eyelashes' }), picker(ctx, cat.eyelashes, 'eyelashes', NONE),
    ),
    section('Hair', true, hairPanel(ctx)),
    section('Expression', true,
      selectRow(ctx, 'Expression', EXPRESSIONS.map((e) => [e, EXPRESSION_LABELS[e]]), () => p().expression, (v) => store.set({ expression: v as ExpressionId })),
      el('div', { className: 'hint', textContent: 'The resting face in the viewer and in every exported animation. Characters also blink and glance around.' }),
      selectRow(ctx, 'Teeth', [['none', 'None'], ...(cat.teeth ?? []).map((t): [string, string] => [t.id, t.id === 'teeth_base' ? 'Natural' : t.name.replace(/^Teeth shape /, 'Shape ')])], () => p().teeth, (v) => store.set({ teeth: v })),
    ),
    section('Facial hair', false,
      selectRow(ctx, 'Style', FACIAL_HAIR.map((f) => [f, FACIAL_HAIR_LABELS[f]]), () => p().facialHair, (v) => store.set({ facialHair: v as FacialHairId })),
      color(ctx, 'Beard colour', 'beardColor', false),
    ),
    section('Tattoos', false, tattooPanel(ctx)),
    section('Clothing', true,
      el('div', { className: 'hint', textContent: 'Pick a full outfit, or "Separate pieces" to combine tops, bottoms, wrappers and accessories.' }),
      picker(ctx, cat.outfits, 'outfit', [{ id: 'none', name: 'Separate pieces' }]), color(ctx, 'Outfit tint', 'outfitTint'),
      piecesPanel(ctx),
      el('div', { className: 'sub', textContent: 'Footwear' }),
      picker(ctx, cat.shoes, 'shoes', [{ id: 'none', name: 'Barefoot' }, { id: 'sandals', name: 'Sandals' }, { id: 'combat_boots', name: 'Combat boots' }]),
      el('div', { className: 'sub', textContent: 'Hat' }), picker(ctx, cat.hats, 'hat', NONE),
    ),
    section('Accessories', true, accessoriesPanel(ctx), earringPanel(ctx)),
    section('Props', false, weaponPanel(ctx), vehiclePanel(ctx)),
  );

  // Detail sliders, grouped like MakeHuman: one section per category.
  const categories = new Map<string, Node[]>();
  for (const g of cat.sliders) {
    const list = categories.get(g.category) ?? [];
    list.push(el('div', { className: 'sub', textContent: g.group }));
    for (const s of g.sliders)
      list.push(slider(ctx, s.label, () => p().modifiers[s.id] ?? 0, (v) => store.set({ modifiers: { ...p().modifiers, [s.id]: v } }), s.bipolar ? -1 : 0, 1));
    categories.set(g.category, list);
  }
  for (const [name, kids] of categories) controls.append(section(`${name} details`, false, ...kids));

  // Output: mesh detail level and resetting the detail sliders.
  const reset = el('button', { textContent: 'Reset detail sliders' });
  reset.addEventListener('click', () => store.replaceAll({ ...p(), modifiers: {} }));
  const detail = el('select');
  for (const d of DETAILS) detail.append(new Option({ low: 'Low (game LOD, ~5k tris)', medium: 'Medium (~30k tris)', high: 'High / HD (~120k tris, subdivided)' }[d], d));
  detail.addEventListener('change', () => store.set({ detail: detail.value as HumanParams['detail'] }));
  store.on('sync', () => (detail.value = p().detail));
  detail.value = p().detail;
  controls.append(section('Output', true, el('div', { className: 'ctl wide' }, el('span', { textContent: 'Detail' }), detail), reset));
}
