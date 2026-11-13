/** Game setup → Customize: the game's name, How to play and colours, for the whole game. */
import type { PlayProject } from './project';
import { defaultHowToPlay, gameNameOf } from './customize';
import { themeEditor } from './theme-editor';

type Shared = Pick<PlayProject, 'gameName' | 'howToPlay' | 'theme'>;
/** `root` is the whole game being edited; `update` writes a game-wide field to it (and wherever it is mirrored). */
export function setupCustomize(root: () => PlayProject, update: <K extends keyof Shared>(key: K, value: Shared[K] | undefined) => void) {
  const dialog = document.getElementById('customize') as HTMLDialogElement, name = document.getElementById('customize-name') as HTMLInputElement, how = document.getElementById('customize-how') as HTMLTextAreaElement;
  const theme = themeEditor(() => root().theme, (value) => update('theme', value));
  const paint = () => { const p = root();name.value = gameNameOf(p);how.value = p.howToPlay ?? defaultHowToPlay(p);theme.paint(); };
  // A field matching its default, or left empty, is not saved: the default keeps following the game.
  name.addEventListener('input', () => { const v = name.value.trim();update('gameName', v && v !== root().identity.title ? v : undefined); });
  name.addEventListener('blur', () => { if (!name.value.trim()) name.value = gameNameOf(root()); });
  how.addEventListener('input', () => { const v = how.value.trim();update('howToPlay', v && v !== defaultHowToPlay(root()) ? v : undefined); });
  how.addEventListener('blur', () => { if (!how.value.trim()) how.value = defaultHowToPlay(root()); });
  document.getElementById('customize-reset')!.onclick = () => { update('gameName', undefined);update('howToPlay', undefined);update('theme', undefined);paint(); };
  document.getElementById('customize-done')!.onclick = () => dialog.close();
  document.getElementById('customize-close')!.onclick = () => dialog.close();
  document.getElementById('customize-game')!.onclick = () => { paint();dialog.showModal();name.focus(); };
  return { paint: theme.paint };
}
