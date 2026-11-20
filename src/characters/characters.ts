/**
 * The characters page: every preset as a card with its portrait, found by search (name, category and what they wear)
 * and filtered by category and body. A card opens the character in the builder; Download builds it there and saves a
 * rigged, animated .glb.
 */
import { PRESETS, type HumanParams } from '../core/params';
import { garmentById } from '../core/garments/catalog';
import { OUTFIT_SETS } from '../core/garments/sets';
import { siteMenu } from '../landing/nav';
import { GROUPS, presetGroup, type Group } from './groups';
import { presetSlug } from './slug';

siteMenu();
const BASE = import.meta.env.BASE_URL;
const $ = <T extends HTMLElement>(selector: string) => document.querySelector(selector) as T;

const setLabel = new Map(OUTFIT_SETS.map((s) => [s.id, s.label]));
const label = (id?: string) => (id && id !== 'none' ? garmentById.get(id)?.label ?? setLabel.get(id) ?? '' : '');
const display = (name: string) => name.replace(/^The /, '');

interface Card { name: string; group: Group; body: 'men' | 'women'; wears: string[]; vehicle: boolean; search: string }
const cards: Card[] = Object.entries(PRESETS).map(([name, p]: [string, Partial<HumanParams>]) => {
  const wears = [p.outfit, p.top, p.jacket, p.bottom, p.hat, ...(p.accessories ?? [])].map(label).filter(Boolean);
  const group = presetGroup(name), body = (p.gender ?? 1) < 0.5 ? 'women' : 'men', vehicle = !!p.vehicle && p.vehicle !== 'none';
  return { name, group, body, wears, vehicle, search: [name, group, body === 'women' ? 'woman female' : 'man male', ...wears, vehicle ? `vehicle ${p.vehicle}` : ''].join(' ').toLowerCase() };
});

// --- Filters -----------------------------------------------------------------------------------------------------
const FILTERS: { id: string; text: string; test: (c: Card) => boolean }[] = [
  { id: 'all', text: 'All', test: () => true },
  ...GROUPS.map((g) => ({ id: g, text: g, test: (c: Card) => c.group === g })),
  { id: 'women', text: 'Women', test: (c: Card) => c.body === 'women' },
  { id: 'men', text: 'Men', test: (c: Card) => c.body === 'men' },
  { id: 'vehicle', text: 'With a vehicle', test: (c: Card) => c.vehicle },
];
const params = new URLSearchParams(location.search);
let filter = FILTERS.some((f) => f.id === params.get('filter')) ? params.get('filter')! : 'all';
const input = $<HTMLInputElement>('#chars-q');
input.value = params.get('q') ?? '';

const filters = $('#chars-filters');
for (const f of FILTERS) {
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = f.text; b.dataset.filter = f.id;
  b.onclick = () => { filter = f.id; render(); };
  filters.append(b);
}

// --- Cards -------------------------------------------------------------------------------------------------------
const grid = $('#chars-grid');
const item = new Map<string, HTMLLIElement>();
for (const c of cards) {
  const builder = `${BASE}app/#preset=${encodeURIComponent(c.name)}`;
  const li = document.createElement('li');
  li.className = 'char';
  li.innerHTML = `
    <a class="char-open" href="${builder}">
      <span class="char-pic"><img src="${BASE}media/characters/${presetSlug(c.name)}.webp" alt="" loading="lazy" width="360" height="480" /></span>
      <span class="char-name"></span>
      <span class="char-meta"></span>
    </a>
    <div class="char-actions">
      <a class="char-edit" href="${builder}">Edit</a>
      <a class="char-glb" href="${builder}&download" title="Opens the builder and downloads a rigged, animated .glb">Download .glb</a>
    </div>`;
  li.querySelector('.char-name')!.textContent = display(c.name);
  li.querySelector('.char-meta')!.textContent = c.group;
  li.querySelector('img')!.alt = display(c.name);
  li.querySelector<HTMLAnchorElement>('.char-open')!.title = c.wears.length ? `Wears: ${c.wears.join(', ')}` : '';
  item.set(c.name, li);
  grid.append(li);
}

function render() {
  const words = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const test = FILTERS.find((f) => f.id === filter)!.test;
  let shown = 0;
  for (const c of cards) {
    const show = test(c) && words.every((w) => c.search.includes(w));
    item.get(c.name)!.hidden = !show;
    if (show) shown++;
  }
  for (const b of filters.querySelectorAll<HTMLButtonElement>('button')) b.setAttribute('aria-pressed', String(b.dataset.filter === filter));
  $('#chars-count').textContent = shown === cards.length ? `${cards.length} characters` : `${shown} of ${cards.length} characters`;
  $('#chars-empty').hidden = shown > 0;
  // Keep the search and filter in the address, so a filtered list can be shared.
  const q = new URLSearchParams();
  if (input.value.trim()) q.set('q', input.value.trim());
  if (filter !== 'all') q.set('filter', filter);
  history.replaceState(null, '', `${location.pathname}${q.size ? `?${q}` : ''}`);
}
input.addEventListener('input', render);
render();
