/** Game setup → Atmosphere → Game colours: presets, three custom colours and a live preview of the game screens. */
import { applyTheme, contrast, DEFAULT_THEME, THEME_PRESETS, type GameTheme } from './theme';

export function themeEditor(get: () => GameTheme | undefined, set: (theme: GameTheme | undefined) => void) {
  const presets = document.getElementById('theme-presets')!, note = document.getElementById('theme-note')!, preview = document.getElementById('theme-preview')!;
  const inputs = { accent: document.getElementById('theme-accent') as HTMLInputElement, background: document.getElementById('theme-background') as HTMLInputElement, text: document.getElementById('theme-text') as HTMLInputElement };
  const same = (a: GameTheme, b: GameTheme) => a.accent === b.accent && a.background === b.background && a.text === b.text;
  function paint() {
    const theme = get() ?? DEFAULT_THEME;
    for (const key of ['accent', 'background', 'text'] as const) inputs[key].value = theme[key];
    for (const b of presets.querySelectorAll<HTMLButtonElement>('button')) b.setAttribute('aria-checked', String(same(THEME_PRESETS.find((p) => p.id === b.dataset.preset)!.theme, theme)));
    preview.style.setProperty('--p-bg', theme.background);preview.style.setProperty('--p-ink', theme.text);preview.style.setProperty('--p-accent', theme.accent);
    preview.style.setProperty('--p-on', contrast('#ffffff', theme.accent) >= contrast('#111111', theme.accent) ? '#faf9ee' : '#141414');
    applyTheme(theme);
  }
  function choose(theme: GameTheme) {
    if (contrast(theme.text, theme.background) < 4.5) { note.textContent = 'That text colour is hard to read on this background. Pick a lighter or darker one.';note.dataset.tone = 'bad';paint();return; }
    note.textContent = contrast(theme.accent, theme.background) < 2 ? 'The accent is close to the background, so buttons will stand out less.' : '';delete note.dataset.tone;
    set(same(theme, DEFAULT_THEME) ? undefined : theme);paint();
  }
  for (const { id, name, theme } of THEME_PRESETS) {
    const b = document.createElement('button');b.type = 'button';b.dataset.preset = id;b.setAttribute('role', 'radio');b.title = name;
    b.style.setProperty('--p-bg', theme.background);b.style.setProperty('--p-accent', theme.accent);b.style.setProperty('--p-ink', theme.text);
    b.innerHTML = '<i></i>';b.append(name);b.onclick = () => choose(theme);presets.append(b);
  }
  for (const key of ['accent', 'background', 'text'] as const) inputs[key].addEventListener('input', () => choose({ ...(get() ?? DEFAULT_THEME), [key]: inputs[key].value.toLowerCase() }));
  return { paint };
}
