/**
 * App state: the character parameters, the built character and the export settings. Parts of
 * the UI subscribe to changes instead of calling each other:
 *  - 'sync': parameters were replaced (preset, randomize, link), so controls refresh;
 *  - 'params': any parameter change (a new build is needed);
 *  - 'export': export settings changed;
 *  - 'character': a new character was built;
 *  - 'clip': a clip started playing in the viewer ('bind' for the bind pose).
 */
import type { Character } from '../../core/human';
import { DEFAULT_PARAMS, type HumanParams } from '../../core/params';
import { DEFAULT_EXPORT, type ExportSettings } from '../../export';

type Events = { sync: []; params: []; export: []; character: [Character, HumanParams, number]; clip: [string] };

export class Store {
  params: HumanParams = loadSaved() ?? { ...DEFAULT_PARAMS, name: 'Athletic man' };
  current: Character | undefined;
  readonly exportSettings: ExportSettings = loadExportSettings();
  private listeners: { [K in keyof Events]: ((...a: Events[K]) => void)[] } = { sync: [], params: [], export: [], character: [], clip: [] };

  on<K extends keyof Events>(event: K, fn: (...a: Events[K]) => void): void {
    this.listeners[event].push(fn);
  }
  emit<K extends keyof Events>(event: K, ...a: Events[K]): void {
    for (const fn of this.listeners[event]) fn(...a);
  }

  /** Change some parameters and rebuild (controls refresh when age or the outfit change: they gate others). */
  set(patch: Partial<HumanParams>): void {
    this.params = { ...this.params, ...patch };
    if ('age' in patch || 'outfit' in patch) this.emit('sync');
    this.emit('params');
  }

  /** Replace every parameter (preset, randomize) and rebuild. */
  replaceAll(p: HumanParams): void {
    this.params = p;
    this.emit('sync');
    this.emit('params');
  }

  /** Change parameters without a rebuild (the character's name). */
  setQuiet(patch: Partial<HumanParams>): void {
    this.params = { ...this.params, ...patch };
  }

  /** A newly built character, from the parameters it was built with. */
  setCharacter(ch: Character, p: HumanParams, ms: number): void {
    this.current = ch;
    try {
      localStorage.setItem('3dgen.human', JSON.stringify(p));
    } catch {
      /* storage unavailable */
    }
    this.emit('character', ch, p, ms);
  }

  setExport(patch: Partial<ExportSettings>): void {
    Object.assign(this.exportSettings, patch);
    try {
      localStorage.setItem('3dgen.export', JSON.stringify(this.exportSettings));
    } catch {
      /* storage unavailable */
    }
    // Rigged modes need a skeleton.
    if (this.exportSettings.mode !== 'static' && this.params.rig === 'none') this.set({ rig: 'game' });
    this.emit('export');
  }
}

function loadSaved(): HumanParams | null {
  try {
    const s = localStorage.getItem('3dgen.human');
    return s ? { ...DEFAULT_PARAMS, ...JSON.parse(s) } : null;
  } catch {
    return null;
  }
}

function loadExportSettings(): ExportSettings {
  try {
    return { ...DEFAULT_EXPORT, ...JSON.parse(localStorage.getItem('3dgen.export') ?? '{}') };
  } catch {
    return { ...DEFAULT_EXPORT };
  }
}
