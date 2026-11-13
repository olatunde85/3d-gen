/**
 * A game's colours: an accent for buttons, highlights and progress, a background and a text colour. Everything else
 * (soft tints, borders, muted text, the text on an accent button, the arcade highlight on dark cards) is derived so
 * any choice stays readable. Editor dialogs keep Ara's own colours; the game screens take the theme.
 */
export interface GameTheme { accent: string; background: string; text: string }
export const DEFAULT_THEME: GameTheme = { accent: '#274f45', background: '#eeede5', text: '#203332' };
export const THEME_PRESETS: { id: string; name: string; theme: GameTheme }[] = [
  { id: 'ara', name: 'Ara', theme: DEFAULT_THEME },
  { id: 'midnight', name: 'Midnight', theme: { accent: '#7c9cff', background: '#11151d', text: '#e8ecf4' } },
  { id: 'sunset', name: 'Sunset', theme: { accent: '#d9562e', background: '#fbefe3', text: '#3b2219' } },
  { id: 'ocean', name: 'Ocean', theme: { accent: '#1b7899', background: '#e7f1f4', text: '#15313b' } },
  { id: 'neon', name: 'Neon', theme: { accent: '#ff3d9a', background: '#110c1f', text: '#f4ecff' } },
  { id: 'forest', name: 'Forest', theme: { accent: '#3d7a35', background: '#eef3e6', text: '#1d2c1b' } },
  { id: 'royal', name: 'Royal', theme: { accent: '#6a3fc2', background: '#f3effa', text: '#25193b' } },
  { id: 'savanna', name: 'Savanna', theme: { accent: '#b8741a', background: '#f6eedc', text: '#33260f' } },
];
const HEX = /^#[0-9a-fA-F]{6}$/;
export function parseTheme(raw: unknown): GameTheme {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('theme must be {accent, background, text} colours.');
  const t = raw as Record<string, unknown>;
  for (const key of Object.keys(t)) if (!['accent', 'background', 'text'].includes(key)) throw Error(`Unsupported theme setting: ${key}.`);
  const out = { ...DEFAULT_THEME };
  for (const key of ['accent', 'background', 'text'] as const) if (t[key] !== undefined) { if (typeof t[key] !== 'string' || !HEX.test(t[key] as string)) throw Error(`theme.${key} must be a six-digit hex colour like #274f45.`);out[key] = (t[key] as string).toLowerCase(); }
  if (contrast(out.text, out.background) < 4.5) throw Error('theme.text needs more contrast against theme.background to stay readable.');
  return out;
}
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const toHex = (c: number[]) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
const mix = (a: string, b: string, t: number) => { const x = rgb(a), y = rgb(b);return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
export const luminance = (hex: string) => { const [r, g, b] = rgb(hex).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);return (x + 0.05) / (y + 0.05); };
/** The theme's colours and the ones derived from them, as CSS custom properties. */
export function themeVariables(theme: GameTheme = DEFAULT_THEME): Record<string, string> {
  const { accent, background, text } = theme, dark = luminance(background) < 0.2;
  // The arcade highlight sits on dark cards: lift a dark accent toward white until it reads clearly.
  let bright = accent;for (let i = 0; i < 8 && contrast(bright, '#10181c') < 6; i++) bright = mix(bright, '#ffffff', 0.18);
  return {
    '--green': accent, '--bg': background, '--ink': text,
    '--paper': dark ? mix(background, '#ffffff', 0.06) : mix(background, '#ffffff', 0.35),
    '--muted': mix(text, background, 0.4), '--line': mix(text, background, 0.78),
    '--accent-soft': mix(accent, background, 0.82), '--on-accent': contrast('#ffffff', accent) >= contrast('#111111', accent) ? '#faf9ee' : '#141414',
    '--arcade-accent': bright, '--scheme': dark ? 'dark' : 'light',
  };
}
/** Colour the game screens. Calling it again with another theme replaces the previous one. */
export function applyTheme(theme?: GameTheme) {
  const root = document.documentElement, vars = themeVariables(theme);
  for (const [key, value] of Object.entries(vars)) root.style.setProperty(key, value);
  root.style.colorScheme = vars['--scheme'];root.dataset.themeScheme = vars['--scheme'];
}
