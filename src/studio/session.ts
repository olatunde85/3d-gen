/** Local editor recovery is separate from portable film recipes. */
import type { AssistDraft } from '../app/assist/panel';
import { ANIMATION_CATEGORIES } from './animations';
import { SCENE_CATEGORIES } from './catalog';
import { durationOf, parseProject, type StudioProject } from './project';
export const SESSION_KEY = 'ara.studio.editor.v1';
export interface EditorState {
  selectedActor: string; selected: number; characterSelected: boolean; cameraSelection: boolean;
  time: number; repeat: boolean; clickToPlace: boolean;
  sceneSearch: string; sceneCategory: string; animationSearch: string; animationCategory: string;
  resolution: '720' | '1080';
  text: {open:boolean;selected:string};
  sound:{open:boolean;selected:string;deviceVoice:string;rate:number;pitch:number;fit:boolean};
  assist: AssistDraft;
  scroll: { library: number; inspector: number; sets: number; page: number };
}
export interface EditorSession { version: 1; project: StudioProject; editor: EditorState; history: string[] }
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, max = 200) => typeof value === 'string' ? value.slice(0, max) : '';
const finite = (value: unknown, min: number, max: number, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
export function readEditorSession(source: string | null): EditorSession | undefined {
  if (!source || source.length > 4_000_000) return;
  try {
    const raw = record(JSON.parse(source));
    if (raw.version !== 1) return;
    const project = parseProject(JSON.stringify(raw.project)), state = record(raw.editor), assist = record(state.assist), scroll = record(state.scroll);
    const actor = project.actors.find(a => a.id === state.selectedActor) ?? project.actors[0];
    const characterSelected = state.characterSelected === true && actor.id === state.selectedActor;
    const cameraSelection = !characterSelected || state.cameraSelection === true;
    const textState=record(state.text),sound=record(state.sound);
    const editor: EditorState = {
      selectedActor: actor.id, characterSelected, cameraSelection,
      selected: Math.floor(finite(state.selected, 0, (cameraSelection ? project.shots : actor.beats).length - 1)),
      time: finite(state.time, 0, durationOf(project)), repeat: state.repeat !== false, clickToPlace: characterSelected && state.clickToPlace === true,
      sceneSearch: text(state.sceneSearch), sceneCategory: SCENE_CATEGORIES.some(category => category === state.sceneCategory) ? String(state.sceneCategory) : '',
      animationSearch: text(state.animationSearch), animationCategory: ANIMATION_CATEGORIES.some(category => category === state.animationCategory) ? String(state.animationCategory) : '',
      resolution: state.resolution === '720' ? '720' : '1080',
      text:{open:textState.open===true,selected:project.texts.some(c=>c.id===textState.selected)?String(textState.selected):project.texts[0]?.id??''},
      sound:{open:sound.open===true,selected:project.audio.speech.some(c=>c.id===sound.selected)?String(sound.selected):project.audio.speech[0]?.id??'',deviceVoice:text(sound.deviceVoice,500),rate:finite(sound.rate,.1,10,1),pitch:finite(sound.pitch,0,2,1),fit:sound.fit!==false},
      assist: { brief: text(assist.brief, 6000), json: text(assist.json, 200_000), context: assist.context === true, open: assist.open === true, guideOpen: assist.guideOpen === true },
      scroll: { library: finite(scroll.library, 0, 100_000), inspector: finite(scroll.inspector, 0, 100_000), sets: finite(scroll.sets, 0, 100_000), page: finite(scroll.page, 0, 100_000) },
    };
    const history: string[] = [];
    if (Array.isArray(raw.history)) for (const item of raw.history.slice(-30)) {
      if (typeof item !== 'string') continue;
      try { history.push(JSON.stringify(parseProject(item))); } catch { /* Recover the film even if an old undo entry no longer validates. */ }
    }
    return { version: 1, project, editor, history };
  } catch { return; }
}
