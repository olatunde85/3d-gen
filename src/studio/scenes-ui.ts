/** The scene strip above the timeline: a film's scenes in order, with the open scene's name, transition and order. */
import { sceneById } from './catalog';
import { MAX_SCENES, filmDuration } from './film';
import { durationOf, type StudioProject, type Transition } from './project';

interface SceneEditor {
  film(): StudioProject[];
  index(): number;
  canEdit(): boolean;
  open(index: number): void;
  add(duplicate: boolean): void;
  remove(): void;
  move(offset: -1 | 1): void;
  rename(name: string): void;
  transition(kind: Transition): void;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const seconds = (t: number) => t >= 60 ? `${Math.floor(t / 60)}:${Math.round(t % 60).toString().padStart(2, '0')}` : `${Number(t.toFixed(1))}s`;

export function setupScenes(editor: SceneEditor) {
  const list = $('scene-cards'), name = $<HTMLInputElement>('scene-title'), transition = $<HTMLSelectElement>('scene-transition');
  $('scene-add').addEventListener('click', () => editor.add(false));
  $('scene-duplicate').addEventListener('click', () => editor.add(true));
  $('scene-remove').addEventListener('click', () => editor.remove());
  $('scene-earlier').addEventListener('click', () => editor.move(-1));
  $('scene-later').addEventListener('click', () => editor.move(1));
  name.addEventListener('change', () => editor.rename(name.value));
  transition.addEventListener('change', () => editor.transition(transition.value as Transition));
  function render() {
    const scenes = editor.film(), open = editor.index(), editable = editor.canEdit(), many = scenes.length > 1;
    list.replaceChildren(...scenes.map((s, i) => {
      const card = document.createElement('button'), label = document.createElement('strong'), note = document.createElement('small');
      card.className = 'scene-chip';card.type = 'button';card.dataset.scene = String(i);
      card.setAttribute('aria-pressed', String(i === open));card.disabled = !editable && i !== open;
      label.textContent = `${i + 1} · ${s.sceneName || sceneById.get(s.template)!.name}`;
      note.textContent = `${seconds(durationOf(s))}${i > 0 && s.transition === 'fade' ? ' · fade in' : ''}`;
      card.append(label, note);card.title = `Open scene ${i + 1}`;
      card.addEventListener('click', () => { if (i !== editor.index()) editor.open(i); });
      return card;
    }));
    $('scene-total').textContent = many ? `${scenes.length} scenes · ${seconds(filmDuration(scenes))}` : `1 scene · up to ${MAX_SCENES}`;
    const scene = scenes[open];
    if (document.activeElement !== name) name.value = scene.sceneName ?? '';
    name.placeholder = `Scene ${open + 1}`;
    transition.value = scene.transition ?? 'cut';
    $('scene-transition-field').hidden = open === 0;
    $('scene-details').hidden = !many;
    for (const id of ['scene-add', 'scene-duplicate']) ($(id) as HTMLButtonElement).disabled = !editable || scenes.length >= MAX_SCENES;
    ($('scene-remove') as HTMLButtonElement).disabled = !editable || !many;
    ($('scene-earlier') as HTMLButtonElement).disabled = !editable || open === 0;
    ($('scene-later') as HTMLButtonElement).disabled = !editable || open === scenes.length - 1;
    name.disabled = transition.disabled = !editable;
  }
  return { render };
}
