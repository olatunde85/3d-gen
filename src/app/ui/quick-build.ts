/**
 * Quick build: the sidebar's guided mode. A plain-words summary of the character, then a few steps
 * of options to tap (body, heritage, outfit, colours, hair and face, extras, action). Every tap
 * updates the character straight away; what can't be picked says why when tapped; Undo, Surprise
 * me and Start over are always at hand; and each step links to its full controls in Detailed.
 *
 * It reads everything back from the character's settings (quick-data.ts), so it always matches
 * the character, however it was made: here, in Detailed, from a ready-made character or a link.
 */
import { clipById } from '../../core/anim/clips';
import { DEFAULT_PARAMS, PRESETS, yearsToAge, type HumanParams } from '../../core/params';
import type { Ctx } from './context';
import { $, el } from './dom';
import type { History } from './history';
import * as Q from './quick-data';

type Mode = 'quick' | 'detailed';
const MODE_KEY = '3dgen.mode';
const ROOT = import.meta.env.BASE_URL;

/** The steps, and the Detailed section each one's "Fine-tune" opens. */
const STEPS = [
  { id: 'body', title: 'Body', detailed: 'Body' },
  { id: 'heritage', title: 'Heritage', detailed: 'Ethnicity' },
  { id: 'outfit', title: 'Outfit', detailed: 'Clothing' },
  { id: 'colours', title: 'Colours', detailed: 'Clothing' },
  { id: 'hair', title: 'Hair & face', detailed: 'Hair' },
  { id: 'extras', title: 'Extras', detailed: 'Accessories' },
  { id: 'action', title: 'Action', detailed: '' },
] as const;
type StepId = (typeof STEPS)[number]['id'];
/** The rows of each step (a step is ticked once any of its rows was picked here). */
const ROWS: Record<StepId, string[]> = {
  body: ['gender', 'age', 'build', 'height'],
  heritage: ['heritage'],
  outfit: ['style'],
  colours: ['colours'],
  hair: ['hair', 'hairColour', 'beard', 'eyes', 'expression'],
  extras: ['glasses', 'jewellery', 'earrings', 'hat', 'tattoos', 'bag', 'held'],
  action: ['action'],
};
const READY_SHOWN = 8;

export function quickBuild(ctx: Ctx, hist: History): void {
  const { store, cat } = ctx;
  const root = el('div', { id: 'quick' });
  $('#controls').before(root);
  /** Rows picked here (Surprise me leaves them alone). */
  const chosen = new Set<string>();
  let clip = 'idle', allReady = false;
  const p = () => store.params;

  // --- Mode switch -----------------------------------------------------------------------
  const tabs = new Map<Mode, HTMLButtonElement>();
  const switcher = el('div', { className: 'mode-switch', role: 'tablist', ariaLabel: 'Editing mode' });
  for (const [m, label, hint] of [['quick', 'Quick build', 'Tap to build'], ['detailed', 'Detailed', 'Every setting']] as const) {
    const b = el('button', { role: 'tab', title: hint }, el('b', { textContent: label }), el('span', { textContent: hint }));
    b.addEventListener('click', () => setMode(m));
    tabs.set(m, b);
    switcher.append(b);
  }
  $('#panel header h1').after(switcher);
  function setMode(m: Mode, save = true) {
    document.body.dataset.mode = m;
    tabs.forEach((b, k) => {
      b.ariaSelected = String(k === m);
      b.classList.toggle('on', k === m);
    });
    if (save) {
      try {
        localStorage.setItem(MODE_KEY, m);
      } catch {
        /* storage unavailable */
      }
    }
    if (m === 'quick') render();
  }

  /** Open a Detailed section and bring it into view. */
  function fineTune(title: string) {
    setMode('detailed');
    const d = [...document.querySelectorAll<HTMLDetailsElement>('#controls > details')].find((x) => x.querySelector('summary')?.textContent === title);
    if (!d) return;
    d.open = true;
    d.scrollIntoView({ behavior: 'smooth', block: 'start' });
    d.classList.remove('flash');
    void d.offsetWidth;
    d.classList.add('flash');
  }

  // --- Changes -----------------------------------------------------------------------------
  const toastEl = el('div', { className: 'qb-toast', role: 'status', ariaLive: 'polite' });
  let toastTimer = 0;
  function toast(text: string, kind: 'info' | 'why' = 'info') {
    toastEl.textContent = text;
    toastEl.dataset.kind = kind;
    toastEl.classList.remove('show');
    void toastEl.offsetWidth;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), Math.max(3500, text.length * 55));
  }
  /** Apply a change picked in a row; other controls refresh to match. */
  function apply(row: string, patch: Q.Patch, notes: string[] = []) {
    chosen.add(row);
    store.set(patch);
    store.emit('sync');
    if (notes.length) toast(notes.join(' '));
  }
  function replace(next: HumanParams, note: string) {
    chosen.clear();
    store.replaceAll(next);
    toast(note);
  }

  // --- Building blocks ---------------------------------------------------------------------
  type Pick = Q.Option & { on: boolean };
  /**
   * A row of options (any number can be on). Blocked ones explain themselves when tapped.
   * `blockedNow` judges a tap on the character as it is at that moment (taps can come faster than
   * the panel redraws), for rows whose options depend on other choices.
   */
  function row(key: string, label: string, opts: Pick[], pick: (id: string) => void, kind: 'pills' | 'swatches' | 'thumbs' = 'pills', note?: string, blockedNow?: (id: string) => string | undefined) {
    const list = el('div', { className: `qb-opts qb-${kind}`, role: 'group', ariaLabel: label });
    for (const o of opts) {
      const b = el('button', { className: 'qb-opt', title: o.blocked ?? o.label, ariaPressed: String(o.on) });
      b.dataset.k = `${key}:${o.id}`;
      if (o.on) b.classList.add('on');
      if (o.blocked) {
        b.classList.add('blocked');
        b.ariaDisabled = 'true';
      }
      if (kind === 'swatches') {
        b.ariaLabel = o.label;
        if (o.swatch) b.style.setProperty('--sw', o.swatch);
        else b.classList.add('text');
        b.append(el('span', { className: 'qb-sw' }), o.swatch ? '' : el('span', { className: 'qb-sw-label', textContent: o.label }));
      } else {
        if (o.thumb) b.append(el('img', { src: ROOT + o.thumb, alt: '', loading: 'lazy' }));
        b.append(el('span', { textContent: o.label }));
      }
      b.addEventListener('click', () => {
        const why = blockedNow ? blockedNow(o.id) : o.blocked;
        if (why) toast(why, 'why');
        else pick(o.id);
      });
      list.append(b);
    }
    return el('div', { className: 'qb-row' }, el('div', { className: 'qb-label', textContent: label }), list, ...(note ? [el('div', { className: 'qb-note', textContent: note })] : []));
  }
  /**
   * A colour row: the palette, plus "Custom" for any colour. Custom opens the system colour picker;
   * its dot previews the colour while choosing and the character updates once it's picked.
   */
  function colourRow(key: string, label: string, palette: Q.Option[], current: string, pick: (hex: string) => void) {
    const cur = current.toLowerCase();
    const known = palette.some((c) => c.swatch?.toLowerCase() === cur);
    const r = row(key, label, palette.map((c) => ({ ...c, on: c.swatch?.toLowerCase() === cur })), (id) => pick(palette.find((c) => c.id === id)!.swatch!), 'swatches');
    const input = el('input', { type: 'color', className: 'qb-color-input', tabIndex: -1, value: /^#[0-9a-f]{6}$/i.test(current) ? current : '#888888' });
    const dot = el('span', { className: `qb-sw${known ? ' rainbow' : ''}` });
    if (!known) dot.style.setProperty('--sw', current);
    const btn = el('button', { className: `qb-opt qb-custom${known ? '' : ' on'}`, title: `${label}: any colour`, ariaPressed: String(!known) }, dot, el('span', { textContent: known ? 'Custom…' : 'Custom' }));
    btn.dataset.k = `${key}:${label}:custom`;
    btn.addEventListener('click', () => {
      try {
        input.showPicker();
      } catch {
        input.click();
      }
    });
    input.addEventListener('input', () => {
      dot.classList.remove('rainbow');
      dot.style.setProperty('--sw', input.value);
    });
    input.addEventListener('change', () => pick(input.value));
    // (The input sits under the button, so the picker opens there.)
    r.querySelector('.qb-opts')!.append(el('span', { className: 'qb-custom-wrap' }, btn, input));
    return r;
  }

  // --- The steps -----------------------------------------------------------------------------
  function bodyStep(q: HumanParams) {
    const g = Q.genderOf(q);
    return [
      row('gender', 'Gender', Q.GENDERS.map((o) => ({ ...o, on: o.id === g })), (id) => {
        if (id === Q.genderOf(p())) return;
        const { patch, notes } = Q.genderPatch(p(), id as Q.Gender, chosen);
        apply('gender', patch, notes);
      }),
      row('age', 'Age', Q.AGES.map((a) => ({ id: a.id, label: `${a.label} · ${a.years}`, on: a.id === Q.ageOf(q) })), (id) => {
        const a = Q.AGES.find((x) => x.id === id)!, now = p();
        const patch: Q.Patch = { age: yearsToAge(a.years) };
        const notes: string[] = [];
        // Adult-only things go when the character becomes a teen.
        if (a.years < 18) {
          if (now.tattoos.length) {
            patch.tattoos = [];
            notes.push('Tattoos are only for adult characters, so they were removed (Undo brings them back).');
          }
          const st = Q.styleById.get(Q.styleOf(now) ?? '');
          if (st?.adult) {
            Object.assign(patch, Q.applyStyle(now, Q.styleById.get('casual')!));
            notes.push(`${st.label} is only for adults, so the outfit is now Casual.`);
          }
        }
        apply('age', patch, notes);
      }),
      row('build', 'Build', Q.BUILDS.map((b) => ({ id: b.id, label: b.label, on: b.id === Q.buildOf(q) })), (id) => {
        const b = Q.BUILDS.find((x) => x.id === id)!;
        apply('build', { muscle: b.muscle, weight: b.weight });
      }),
      row('height', 'Height', Q.HEIGHTS.map((h) => ({ id: h.id, label: h.label, on: h.id === Q.heightOf(q) })), (id) => apply('height', { height: Q.HEIGHTS.find((x) => x.id === id)!.height })),
    ];
  }

  function heritageStep(q: HumanParams) {
    const now = Q.heritageOf(q);
    return [
      row('heritage', 'Heritage', Q.HERITAGES.map((h) => ({ id: h.id, label: h.label, on: h.id === now })), (id) => apply('heritage', Q.heritagePatch(id, chosen)),
        'pills', 'Sets the skin, face and eye colour. Blend them exactly in Detailed.'),
    ];
  }

  function outfitStep(q: HumanParams) {
    const now = Q.styleOf(q), g = Q.genderOf(q);
    const rows = Q.STYLE_GROUPS.map((group) => {
      const styles = Q.STYLES.filter((s) => s.group === group);
      return row('style', group, styles.map((s) => ({
        id: s.id, label: s.label, on: s.id === now, blocked: Q.styleBlocked(s, q, cat),
        thumb: `quick-thumbs/${s.id}-${s[g] ? g : g === 'man' ? 'woman' : 'man'}.png`,
      })), (id) => apply('style', Q.applyStyle(p(), Q.styleById.get(id)!)), 'thumbs', undefined, (id) => Q.styleBlocked(Q.styleById.get(id)!, p(), cat));
    });
    if (!now) rows.unshift(el('div', { className: 'qb-note qb-own', textContent: 'Wearing an outfit of their own (from Detailed or a ready-made character). Pick a style to replace it.' }));
    return rows;
  }

  function coloursStep(q: HumanParams) {
    const targets = Q.colourTargets(q);
    if (!targets.length) return [el('div', { className: 'qb-note', textContent: "This outfit's colours are fixed. Pick another outfit, or adjust it in Detailed." })];
    return targets.flatMap((t) => {
      const title = targets.length > 1 ? `${t.label}: ` : '';
      if (!t.key)
        return [colourRow('colours', `${title}Tint`, Q.TINTS, t.color, (c) => apply('colours', { outfitTint: c })),
          el('div', { className: 'qb-note', textContent: "A tint shades this outfit's own colours. For any colour you like, pick an outfit such as Business suit, Streetwear, Soldier or Buba & sokoto." })];
      const set = (patch: { pattern?: string; color?: string; color2?: string }) =>
        apply('colours', { garmentStyles: { ...p().garmentStyles, [t.key]: { pattern: t.pattern, color: t.color, color2: t.color2, ...p().garmentStyles[t.key], ...patch } } });
      return [
        ...(t.patterns.length > 1 ? [row('colours', `${title}Fabric`, t.patterns.map((id) => ({ id, label: Q.patternName(id), on: id === t.pattern })), (id) => set({ pattern: id }))] : []),
        colourRow('colours', `${title}${t.names[0]}`, Q.PALETTE, t.color, (c) => set({ color: c })),
        ...(t.color2 ? [colourRow('colours', `${title}${t.names[1]}`, Q.PALETTE, t.color2, (c) => set({ color2: c }))] : []),
      ];
    });
  }

  function hairStep(q: HumanParams) {
    const man = Q.genderOf(q) === 'man';
    const hc = Q.hairColourOf(q);
    return [
      row('hair', 'Hairstyle', Q.HAIRS.map((h) => ({ ...h, thumb: `quick-thumbs/hair-${h.id}.png`, on: h.id === q.hair })), (id) => {
        // A colour the new hairstyle can't take goes back to natural.
        const next = { ...p(), hair: id };
        const colour = Q.hairColourOf(p());
        const keep = colour && !Q.hairColours(next).find((c) => c.id === colour)?.blocked;
        apply('hair', { hair: id, ...(keep ? Q.applyHairColour(next, colour) : Q.applyHairColour(next, 'natural')) },
          colour && colour !== 'natural' && !keep ? [`${Q.HAIRS.find((h) => h.id === id)!.label} can't be made ${Q.HAIR_COLOURS.find((c) => c.id === colour)!.label.toLowerCase()}, so it has its natural colour.`] : []);
      }, 'thumbs'),
      // Bald: the colour row colours the beard, if there is one.
      ...(q.hair !== 'none'
        ? [row('hairColour', 'Hair colour', Q.hairColours(q).map((c) => ({ ...c, on: c.id === hc })), (id) => apply('hairColour', Q.applyHairColour(p(), id)), 'swatches', undefined, (id) => Q.hairColours(p()).find((c) => c.id === id)?.blocked)]
        : man && q.facialHair !== 'none'
          ? [row('hairColour', 'Beard colour', Q.HAIR_COLOURS.map((c) => ({ ...c, on: c.id === Q.beardColourOf(q) })), (id) => apply('hairColour', Q.applyBeardColour(id)), 'swatches')]
          : []),
      ...(man ? [row('beard', 'Facial hair', Q.BEARDS.map((b) => ({ ...b, on: b.id === q.facialHair })), (id) => apply('beard', { facialHair: id as HumanParams['facialHair'] }))] : []),
      row('eyes', 'Eyes', Q.EYES.map((e) => ({ ...e, on: e.id === q.eyes })), (id) => apply('eyes', { eyes: id }), 'swatches'),
      row('expression', 'Expression', Q.EXPRESSION_OPTIONS.map((e) => ({ ...e, on: e.id === q.expression })), (id) => apply('expression', { expression: id as HumanParams['expression'] })),
    ];
  }

  function extrasStep(q: HumanParams) {
    const headwear = Q.outfitHeadwear(q), hat = Q.hatOf(q);
    return [
      row('glasses', 'Glasses', Q.GLASSES.map((o) => ({ ...o, on: o.id === Q.glassesOf(q) })), (id) => apply('glasses', Q.applyGlasses(p(), id))),
      row('hat', 'Hat', Q.HATS.map((o) => ({ ...o, on: o.id === hat })), (id) => apply('hat', Q.applyHat(p(), id), headwear && id !== 'outfit' ? [`The outfit's ${headwear.toLowerCase()} was taken off.`] : []),
        'pills', headwear ? `Wearing the outfit's ${headwear.toLowerCase()}. Pick None to take it off.` : undefined),
      row('jewellery', 'Jewellery & more', Q.JEWELLERY.map((o) => ({ ...o, on: q.accessories.includes(o.id) })), (id) => apply('jewellery', Q.toggleAccessory(p(), id)), 'pills', 'Tap to add or remove; pick as many as you like.'),
      row('earrings', 'Earrings', Q.EARRING_OPTIONS.map((o) => ({ ...o, on: o.id === q.earrings })), (id) => apply('earrings', { earrings: id as HumanParams['earrings'] })),
      ...(q.earrings !== 'none' ? [row('earrings', 'Metal', Q.METALS.map((o) => ({ ...o, on: o.id === q.earringMetal })), (id) => apply('earrings', { earringMetal: id as HumanParams['earringMetal'] }), 'swatches')] : []),
      row('tattoos', 'Tattoos', Q.tattooOptions(q).map((o) => ({ ...o, on: q.tattoos.includes(o.id as HumanParams['tattoos'][number]) })), (id) => {
        const t = id as HumanParams['tattoos'][number], now = p().tattoos;
        apply('tattoos', { tattoos: now.includes(t) ? now.filter((x) => x !== t) : [...now, t] });
      }, 'pills', undefined, (id) => Q.tattooOptions(p()).find((o) => o.id === id)?.blocked),
      row('bag', 'Bag', Q.BAGS.map((o) => ({ ...o, on: o.id === q.carry })), (id) => apply('bag', { carry: id as HumanParams['carry'] })),
      row('held', 'In hand', Q.HELD.map((o) => ({ ...o, on: o.id === q.weapon })), (id) => {
        apply('held', { weapon: id as HumanParams['weapon'] }, id !== 'none' && id !== 'knife' ? ['New moves for it are in Action below.'] : []);
      }),
    ];
  }

  function actionStep(q: HumanParams) {
    return [
      row('action', 'Play', Q.actions(q).map((a) => ({ id: a.id, label: clipById.get(a.id)?.name.replace(/ \((chair|low ready|guard)\)$/, '') ?? a.id, on: a.id === clip })), (id) => {
        chosen.add('action');
        ctx.playClip(id);
      }, 'pills', 'All animations are in the bar above the character.'),
    ];
  }

  const build: Record<StepId, (q: HumanParams) => Node[]> = { body: bodyStep, heritage: heritageStep, outfit: outfitStep, colours: coloursStep, hair: hairStep, extras: extrasStep, action: actionStep };
  /** One line on where each step stands. */
  const nowText: Partial<Record<StepId, (q: HumanParams) => string>> = {
    body: (q) => [Q.genderOf(q) === 'man' ? 'Man' : 'Woman', Q.AGES.find((a) => a.id === Q.ageOf(q))!.label, Q.BUILDS.find((b) => b.id === Q.buildOf(q))!.label].join(' · '),
    heritage: (q) => Q.HERITAGES.find((h) => h.id === Q.heritageOf(q))!.label,
    outfit: (q) => Q.styleById.get(Q.styleOf(q) ?? '')?.label ?? 'Their own',
    hair: (q) => Q.HAIRS.find((h) => h.id === q.hair)?.label ?? 'Their own',
    action: () => clipById.get(clip)?.name ?? 'Bind pose',
  };

  // --- Surprise me, Start over, ready-made characters ----------------------------------------
  const pickOne = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
  /** Random choices for every row not picked here, valid together (one rebuild). */
  function surprise() {
    let q: HumanParams = { ...p() };
    const set = (patch: Q.Patch) => (q = { ...q, ...patch });
    const free = (r: string) => !chosen.has(r);
    if (free('gender')) set(Q.genderPatch(q, pickOne(['man', 'woman'] as const), new Set([...chosen, 'hair'])).patch);
    const g = Q.genderOf(q);
    if (free('age')) set({ age: yearsToAge(pickOne([24, 30, 35, 42, 52, 64])) });
    if (free('build')) { const b = pickOne(Q.BUILDS); set({ muscle: b.muscle, weight: b.weight }); }
    if (free('height')) set({ height: pickOne(Q.HEIGHTS).height });
    if (free('heritage')) set(Q.heritagePatch(pickOne(Q.HERITAGES).id, chosen));
    if (free('style')) {
      const ok = Q.STYLES.filter((s) => !Q.styleBlocked(s, q, cat));
      set(Q.applyStyle(q, pickOne(ok)));
    }
    if (free('colours') && Math.random() < 0.6)
      for (const t of Q.colourTargets(q)) {
        if (!t.key) set({ outfitTint: pickOne(Q.TINTS).swatch! });
        else set({ garmentStyles: { ...q.garmentStyles, [t.key]: { pattern: pickOne(t.patterns), color: pickOne(Q.PALETTE).swatch, color2: pickOne(Q.PALETTE).swatch } } });
      }
    if (free('hair')) set({ hair: pickOne(Q.SURPRISE_HAIR[g]) });
    if (free('hairColour')) {
      const ok = Q.hairColours(q).filter((c) => !c.blocked && !['pink', 'blue', 'purple'].includes(c.id));
      set(Q.applyHairColour(q, Math.random() < 0.5 || !ok.length ? 'natural' : pickOne(ok).id));
    }
    if (free('beard')) set({ facialHair: g === 'man' ? pickOne(['none', 'none', 'stubble', 'mustache', 'goatee', 'short_beard', 'full_beard'] as const) : 'none' });
    if (free('eyes')) {
      const dark = Q.heritageOf(q) !== 'caucasian';
      set({ eyes: pickOne(dark ? ['blackbrown', 'darkbrown', 'brown'] : Q.EYES.map((e) => e.id)) });
    }
    if (free('expression')) set({ expression: pickOne(['neutral', 'neutral', 'happy', 'determined'] as const) });
    store.replaceAll({ ...q, name: 'character', seed: Math.floor(Math.random() * 1e6) });
    toast(chosen.size ? 'New random picks, keeping the ones you chose.' : 'A random character. Tap anything below to change it.');
  }

  function readyMade() {
    const names = Object.keys(PRESETS);
    const shown = allReady ? names : names.slice(0, READY_SHOWN);
    const list = el('div', { className: 'qb-opts qb-pills', role: 'group', ariaLabel: 'Ready-made characters' });
    for (const name of shown) {
      const b = el('button', { className: 'qb-opt', textContent: name.replace(/^The /, '') });
      b.dataset.k = `ready:${name}`;
      b.addEventListener('click', () => replace({ ...DEFAULT_PARAMS, ...PRESETS[name], name, detail: p().detail }, `${name} is ready. Change anything below to make it yours.`));
      list.append(b);
    }
    const more = el('button', { className: 'qb-opt qb-more', textContent: allReady ? 'Show fewer' : `Show all ${names.length}` });
    more.dataset.k = 'ready:more';
    more.addEventListener('click', () => {
      allReady = !allReady;
      render();
    });
    list.append(more);
    return el('section', { className: 'qb-step qb-ready' },
      el('div', { className: 'qb-head' }, el('h2', {}, 'Start from a ready-made character ', el('span', { className: 'qb-opt-tag', textContent: '(optional)' }))), list);
  }

  // --- Rendering ---------------------------------------------------------------------------------
  function sentence(q: HumanParams) {
    const s = el('p', { className: 'qb-sentence' });
    for (const part of Q.summary(q)) {
      const gap = /^[,.]/.test(part.text) || !s.childNodes.length ? '' : ' ';
      if (gap) s.append(gap);
      if (!part.step) {
        s.append(part.text);
        continue;
      }
      const b = el('button', { className: 'qb-chip', textContent: part.text, title: `Change in ${STEPS.find((x) => x.id === part.step)!.title}` });
      b.dataset.k = `chip:${part.step}:${part.text}`;
      b.addEventListener('click', () => focusStep(part.step as StepId));
      s.append(b);
    }
    return s;
  }
  function focusStep(id: StepId) {
    const sec = root.querySelector<HTMLElement>(`[data-step="${id}"]`);
    if (!sec) return;
    sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    sec.classList.remove('flash');
    void sec.offsetWidth;
    sec.classList.add('flash');
    sec.querySelector<HTMLElement>('.qb-opt.on, .qb-opt')?.focus({ preventScroll: true });
  }

  function render() {
    if (document.body.dataset.mode !== 'quick') return;
    const q = p();
    const focused = (document.activeElement as HTMLElement | null)?.dataset?.k;
    const undo = el('button', { className: 'qb-act', textContent: '↶ Undo', title: 'Undo (Ctrl/Cmd+Z)', disabled: !hist.canUndo() });
    undo.addEventListener('click', () => hist.undo());
    const redo = el('button', { className: 'qb-act', textContent: '↷ Redo', title: 'Redo (Shift+Ctrl/Cmd+Z)', disabled: !hist.canRedo() });
    redo.addEventListener('click', () => hist.redo());
    const surpriseBtn = el('button', { className: 'qb-act primary', textContent: '🎲 Surprise me', title: 'Random picks for everything you haven\'t chosen yet' });
    surpriseBtn.addEventListener('click', surprise);
    const restart = el('button', { className: 'qb-act', textContent: 'Start over', title: 'Back to a plain starting character' });
    restart.addEventListener('click', () => replace({ ...DEFAULT_PARAMS, name: 'character', detail: q.detail }, 'Started over. Undo brings your character back.'));
    for (const [b, k] of [[undo, 'act:undo'], [redo, 'act:redo'], [surpriseBtn, 'act:surprise'], [restart, 'act:restart']] as const) b.dataset.k = k;

    const steps = STEPS.map((s, i) => {
      const done = ROWS[s.id].some((r) => chosen.has(r));
      const head = el('div', { className: 'qb-head' },
        el('span', { className: `qb-num${done ? ' done' : ''}`, textContent: done ? '✓' : String(i + 1), ariaLabel: done ? 'Chosen' : `Step ${i + 1}` }),
        el('h2', { textContent: s.title }), el('span', { className: 'qb-now', textContent: nowText[s.id]?.(q) ?? '' }));
      const sec = el('section', { className: 'qb-step' }, head, ...build[s.id](q));
      sec.dataset.step = s.id;
      if (s.detailed) {
        const fine = el('button', { className: 'qb-fine', textContent: `Fine-tune ${s.title.toLowerCase()} in Detailed ›` });
        fine.dataset.k = `fine:${s.id}`;
        fine.addEventListener('click', () => fineTune(s.detailed));
        sec.append(fine);
      }
      return sec;
    });

    root.replaceChildren(
      el('section', { className: 'qb-summary' },
        el('div', { className: 'qb-kicker', textContent: 'Your character' }), sentence(q),
        el('div', { className: 'qb-actions' }, undo, redo, surpriseBtn, restart),
        el('div', { className: 'qb-hint', textContent: 'Tap any option below: the character updates as you go. Tap a highlighted word above to jump to it.' })),
      readyMade(),
      ...steps,
      el('section', { className: 'qb-done' },
        el('p', { textContent: "Happy with your character? Download it with the button under the character, or share it." }),
        (() => {
          const b = el('button', { textContent: 'Fine-tune everything in Detailed ›' });
          b.dataset.k = 'fine:all';
          b.addEventListener('click', () => setMode('detailed'));
          return b;
        })()),
      toastEl,
    );
    if (focused) root.querySelector<HTMLElement>(`[data-k="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
  }

  let queued = 0;
  const later = () => {
    if (!queued) queued = requestAnimationFrame(() => {
      queued = 0;
      render();
    });
  };
  store.on('params', later);
  store.on('sync', later);
  store.on('clip', (id) => {
    clip = id;
    later();
  });
  hist.onChange(later);

  // New visitors start in Quick build; people who already made a character keep Detailed until
  // they switch (then their choice is remembered).
  const stored = (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };
  setMode((stored(MODE_KEY) as Mode | null) ?? (stored('3dgen.human') !== null ? 'detailed' : 'quick'), false);
}
