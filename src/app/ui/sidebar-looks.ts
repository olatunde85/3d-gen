/** Sidebar: hair, tattoos, earrings and the held weapon. */
import { EARRINGS, EARRING_LABELS, HAIRSTYLES, TATTOOS, TATTOO_LABELS, isProceduralHair, type EarringId, type Metal, type TattooId } from '../../core/looks';
import { ageToYears } from '../../core/params';
import { WEAPONS, WEAPON_LABELS, type WeaponId } from '../../core/props/weapons';
import type { Ctx } from './context';
import { color, NONE, picker, selectRow } from './controls';
import { el } from './dom';

export function hairPanel(ctx: Ctx) {
  const { store } = ctx;
  const tint = color(ctx, 'Hair tint', 'hairTint');
  const own = color(ctx, 'Hair colour', 'hairColor', false);
  const show = () => {
    const proc = isProceduralHair(store.params.hair);
    tint.style.display = proc || store.params.hair === 'none' ? 'none' : '';
    own.style.display = proc ? '' : 'none';
  };
  store.on('sync', show);
  show();
  const grid = picker(ctx, ctx.cat.hair, 'hair', [...NONE, ...HAIRSTYLES]);
  grid.addEventListener('click', () => requestAnimationFrame(show));
  return el('div', {}, grid, tint, own);
}

export function tattooPanel(ctx: Ctx) {
  const { store } = ctx;
  const wrap = el('div', {});
  const note = el('div', { className: 'hint' });
  const boxes: HTMLInputElement[] = [];
  for (const t of TATTOOS) {
    const box = el('input', { type: 'checkbox' });
    box.addEventListener('change', () => {
      const has = store.params.tattoos.includes(t);
      store.set({ tattoos: has ? store.params.tattoos.filter((x) => x !== t) : [...store.params.tattoos, t as TattooId] });
    });
    boxes.push(box);
    wrap.append(el('label', { className: 'acc' }, box, TATTOO_LABELS[t]));
  }
  const show = () => {
    const adult = ageToYears(store.params.age) >= 18;
    TATTOOS.forEach((t, i) => {
      boxes[i].checked = store.params.tattoos.includes(t);
      boxes[i].disabled = !adult;
    });
    note.textContent = adult ? 'Painted on the skin as a separate overlay layer, so they follow body shape and animation.' : 'Tattoos are available for adult (18+) characters only.';
  };
  store.on('sync', show);
  show();
  wrap.addEventListener('change', () => requestAnimationFrame(show));
  wrap.append(color(ctx, 'Ink colour', 'tattooInk', false), note);
  return wrap;
}

export function earringPanel(ctx: Ctx) {
  const { store } = ctx;
  return el('div', {},
    el('div', { className: 'sub', textContent: 'Earrings' }),
    selectRow(ctx, 'Earrings', EARRINGS.map((e) => [e, EARRING_LABELS[e]]), () => store.params.earrings, (v) => store.set({ earrings: v as EarringId })),
    selectRow(ctx, 'Metal', [['gold', 'Gold'], ['silver', 'Silver']], () => store.params.earringMetal, (v) => store.set({ earringMetal: v as Metal })));
}

/** Clip that shows off each weapon when it is picked. */
const WEAPON_IDLE: Partial<Record<WeaponId, string>> = { rifle: 'rifle_idle', pistol: 'pistol_idle', sword: 'sword_idle', knife: 'sword_idle' };

export function weaponPanel(ctx: Ctx) {
  const { store } = ctx;
  const row = selectRow(ctx, 'Held weapon', WEAPONS.map((w) => [w, WEAPON_LABELS[w]]), () => store.params.weapon, (v) => {
    store.set({ weapon: v as WeaponId });
    const clip = WEAPON_IDLE[v as WeaponId];
    if (clip && store.params.rig !== 'none') ctx.playClip(clip);
  });
  const note = el('div', {
    className: 'hint',
    textContent: 'Held in the right hand on a "WeaponR" socket bone, the standard way games attach props. ' +
      'Shooter / sword animations are fitted to it. Export can keep it in the hand or save it as a separate prop file.',
  });
  return el('div', {}, row, note);
}

/** Vehicle props, shown with their riding clip. */
export function vehiclePanel(ctx: Ctx) {
  const { store } = ctx;
  const row = selectRow(ctx, 'Ride', [['none', 'None'], ['bicycle', 'Bicycle']], () => store.params.vehicle, (v) => {
    store.set({ vehicle: v as 'none' | 'bicycle' });
    if (v === 'bicycle' && store.params.rig !== 'none') ctx.playClip('ride_bicycle');
  });
  const note = el('div', { className: 'hint', textContent: 'Shown while the matching animation plays (Bicycle: Ride bicycle), fitted to the character. Preview only for now.' });
  return el('div', {}, row, note);
}
