import {PHONE_LAYOUT} from './responsive';
/**
 * Animation bar (quick clips, previous / next, root motion, speed, progress) and the animation
 * browser, a drawer that slides in from the right edge of the view.
 */
import {animationGroup,animationMatches} from '../../core/anim/groups';
import { CLIPS, clipById } from '../../core/anim/clips';
import { stagePropFor } from '../../core/anim/stage';
import type { Ctx } from './context';
import { $, el } from './dom';

/** Quick buttons for the most common clips; everything else is in the browser. */
const QUICK = ['bind', 'idle', 'walk', 'run'];

export function animationBar(ctx: Ctx): { playClip: (id: string) => void; setActive: (id: string) => void } {
  const { store, viewer } = ctx;
  const animBar = $('#anim-bar');
  const quick = el('div', {className:'anim-quick',role:'group',ariaLabel:'Quick animations'}),player=el('div',{className:'anim-player'}),options=el('div',{id:'anim-options',className:'anim-options'});
  const progress = el('div', { className: 'anim-progress' }, el('div'));
  // Idle plays by default ("rigged idle").
  let activeClip = 'idle';
  const animButtons = new Map<string, HTMLButtonElement>();

  const playClip = (id: string) => {
    activeClip = id;
    viewer.play(id === 'bind' ? null : clipById.get(id) ?? null);
    animButtons.forEach((b, k) => b.classList.toggle('on', k === id));
    const other = !QUICK.includes(id);
    browseBtn.classList.toggle('on', other);
    browseBtn.setAttribute('aria-label',other?`Browse animations: ${clipById.get(id)!.name}`:'Browse all animations');
    browseLabel.textContent = other ? clipById.get(id)!.name : 'All animations';
    browser.sync();
    store.emit('clip', id);
  };

  for (const id of QUICK) {
    const b = el('button', { textContent: id === 'bind' ? 'Bind pose' : clipById.get(id)!.name });
    b.addEventListener('click', () => playClip(id));
    animButtons.set(id, b);
    quick.append(b);
  }
  // Previous / next step through every clip in list order.
  const step = (d: number) => {
    const i = CLIPS.findIndex((c) => c.id === activeClip);
    playClip(CLIPS[(i + d + CLIPS.length) % CLIPS.length].id);
  };
  const prevBtn = el('button', { className: 'anim-step', textContent: '‹', title: 'Previous animation',ariaLabel:'Previous animation' });
  const nextBtn = el('button', { className: 'anim-step', textContent: '›', title: 'Next animation',ariaLabel:'Next animation' });
  prevBtn.addEventListener('click', () => step(-1));
  nextBtn.addEventListener('click', () => step(1));
  const browseLabel = el('span', { textContent: 'All animations' });
  const browseBtn = el('button', { className: 'anim-browse', title: `Browse all ${CLIPS.length} animations` }, browseLabel, el('span', { className: 'caret', textContent: '▾' }));
  const settings=el('button',{className:'anim-settings',title:'Playback options',ariaLabel:'Playback options',ariaExpanded:'false',ariaControls:'anim-options'});
  const sliders=document.createElementNS('http://www.w3.org/2000/svg','svg');sliders.setAttribute('viewBox','0 0 24 24');sliders.setAttribute('width','18');sliders.setAttribute('height','18');sliders.setAttribute('fill','none');sliders.setAttribute('stroke','currentColor');sliders.setAttribute('stroke-width','1.6');sliders.setAttribute('stroke-linecap','round');sliders.setAttribute('aria-hidden','true');sliders.innerHTML='<path d="M4 7h7m4 0h5M4 17h1m4 0h11"/><circle cx="13" cy="7" r="2"/><circle cx="7" cy="17" r="2"/>';settings.append(sliders);
  const closeSettings=()=>settings.setAttribute('aria-expanded','false');
  settings.addEventListener('click',()=>settings.setAttribute('aria-expanded',String(settings.getAttribute('aria-expanded')!=='true')));
  document.addEventListener('pointerdown',e=>{if(!options.contains(e.target as Node)&&!settings.contains(e.target as Node))closeSettings();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&settings.getAttribute('aria-expanded')==='true'){closeSettings();settings.focus();}});
  player.append(prevBtn,browseBtn,nextBtn,settings);animBar.append(quick,player,options);
  const browser = animationBrowser(animBar, browseBtn, () => activeClip, playClip);

  const rmBox = el('input', { type: 'checkbox' });
  rmBox.addEventListener('change', () => store.setExport({ rootMotion: rmBox.checked }));
  const rmLabel = el('label', { className: 'acc rm', title: 'Locomotion clips travel forward / sideways (also used for export)' }, rmBox, 'Root motion');
  const propBox = el('input', { type: 'checkbox' });
  propBox.addEventListener('change', () => store.setExport({ stageProps: propBox.checked }));
  const propLabel = el('label', { className: 'acc rm', title: 'Show the ladder, obstacle, ledge wall or cover (also included in exports)' }, propBox, 'Props');
  propLabel.hidden = true;
  const bloodBox = el('input', { type: 'checkbox', checked: viewer.blood });
  bloodBox.addEventListener('change', () => (viewer.blood = bloodBox.checked));
  const bloodLabel = el('label', { className: 'acc rm', title: 'Show blood with the gunshot reactions (preview only, not exported)' }, bloodBox, 'Blood');
  bloodLabel.hidden = true;
  const speed = el('select', { title: 'Playback speed' });
  for (const s of ['0.25', '0.5', '1', '1.5']) speed.append(new Option(`${s}×`, s));
  speed.value = '1';
  speed.addEventListener('change', () => (viewer.speed = Number(speed.value)));
  options.append(rmLabel,propLabel,bloodLabel,speed);animBar.append(progress);
  rmBox.setAttribute('aria-label','Root motion');speed.setAttribute('aria-label','Playback speed');
  viewer.onTick = (clip, t) => {
    const staged = !!clip && !!stagePropFor(clip.id);
    if (propLabel.hidden === staged) propLabel.hidden = !staged;
    const shot = !!clip?.wounds;
    if (bloodLabel.hidden === shot) bloodLabel.hidden = !shot;
    (progress.firstChild as HTMLElement).style.width = clip ? `${(t / clip.duration) * 100}%` : '0%';
  };

  const syncRootMotion = () => { rmBox.checked = store.exportSettings.rootMotion; propBox.checked = store.exportSettings.stageProps !== false; };
  syncRootMotion();
  store.on('export', syncRootMotion);
  // A new character: show the bar if it's rigged and keep the current clip playing.
  store.on('character', (ch) => {
    animBar.style.display = ch.rig ? '' : 'none';
    if (ch.rig && !viewer.playing && activeClip !== 'bind') playClip(activeClip);
  });
  return { playClip, setActive: (id) => (activeClip = id) };
}

/** Animation browser: search, category tabs and a grid of every clip. */
function animationBrowser(animBar: HTMLElement, browseBtn: HTMLButtonElement, active: () => string, playClip: (id: string) => void) {
  const pop = el('div', { id: 'anim-pop', role: 'dialog', ariaLabel: 'Animations' });
  pop.setAttribute('aria-hidden', 'true');
  const search = el('input', { type: 'search', placeholder: `Search ${CLIPS.length} animations…`, className: 'anim-search' });
  const close = el('button', { className: 'anim-close', textContent: '×', title: 'Close' });
  const tabs = el('div', { className: 'anim-tabs', role: 'tablist' });
  const grid = el('div', { className: 'anim-grid' });
  const cats = [...new Set(CLIPS.map(animationGroup))];
  let cat = 'All';
  const tabButtons = new Map<string, HTMLButtonElement>();
  for (const c of ['All', ...cats]) {
    const n = c === 'All' ? CLIPS.length : CLIPS.filter((x) => animationGroup(x) === c).length;
    const b = el('button', { className: 'anim-tab', role: 'tab' }, c, el('span', { className: 'n', textContent: String(n) }));
    b.addEventListener('click', () => { cat = c; render(); });
    tabButtons.set(c, b);
    tabs.append(b);
  }
  const clipButton = (c: (typeof CLIPS)[number]) => {
    const b = el('button', { className: 'anim-clip', title: `${c.name} · ${c.duration.toFixed(1)} s${c.loop ? ', loops' : ''}` },
      el('span', { textContent: c.name }), c.loop ? el('span', { className: 'loop', textContent: '↻', title: 'Loops' }) : '');
    b.dataset.id = c.id;
    b.classList.toggle('on', c.id === active());
    b.addEventListener('click', () => {if(matchMedia(PHONE_LAYOUT).matches){toggle(false);browseBtn.focus({preventScroll:true});requestAnimationFrame(()=>playClip(c.id));}else playClip(c.id);});
    return b;
  };
  function render() {
    tabButtons.forEach((b, k) => { b.classList.toggle('on', k === cat); b.setAttribute('aria-selected', String(k === cat)); });
    const q = search.value.trim().toLowerCase();
    const match = (c: (typeof CLIPS)[number]) => animationMatches(c,q,cat==='All'?'':cat);
    grid.replaceChildren();
    const groups = q || cat !== 'All' ? [[q ? 'Results' : cat, CLIPS.filter((c) => match(c))] as const] : cats.map((k) => [k, CLIPS.filter((c) => animationGroup(c) === k)] as const);
    for (const [name, list] of groups) {
      if (!list.length) continue;
      if (groups.length > 1) grid.append(el('div', { className: 'anim-group', textContent: name }));
      for (const c of list) grid.append(clipButton(c));
    }
    if (!grid.childElementCount) grid.append(el('div', { className: 'hint', textContent: 'No animations match.' }));
  }
  search.addEventListener('input', () => render());
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') (grid.querySelector('.anim-clip') as HTMLButtonElement | null)?.click();
    if (e.key === 'Escape') toggle(false);
  });
  const isOpen = () => pop.classList.contains('open');
  const toggle = (open = !isOpen()) => {
    pop.hidden=!open&&matchMedia(PHONE_LAYOUT).matches;
    pop.classList.toggle('open', open);
    pop.setAttribute('aria-hidden', String(!open));
    browseBtn.setAttribute('aria-expanded', String(open));
    if (open) {
      animBar.dispatchEvent(new Event('open-animation-browser',{bubbles:true}));
      render();
      search.focus({ preventScroll: true });
      grid.querySelector('.anim-clip.on')?.scrollIntoView({ block: 'nearest' });
    }
  };
  browseBtn.addEventListener('click', () => toggle());
  close.addEventListener('click', () => {toggle(false);browseBtn.focus();});
  // Stays open while browsing (the character remains in view); Esc, × or the button close it.
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) toggle(false); });
  pop.append(el('div', { className: 'anim-pop-head' }, el('span', { className: 'anim-pop-title', textContent: 'Animations' }), close), search, tabs, grid);
  animBar.after(pop);
  return { sync: () => grid.querySelectorAll<HTMLButtonElement>('.anim-clip').forEach((b) => b.classList.toggle('on', b.dataset.id === active())) };
}
