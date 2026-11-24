/**
 * Building characters: one build in flight at a time; changes made meanwhile are folded into the
 * next build. Each finished build is shown right away, so dragging a slider updates progressively.
 */
import { autoSkin, type Character } from '../../core/human';
import { triangleCount } from '../../core/mesh';
import { ageToYears } from '../../core/params';
import type { Ctx } from './context';
import { $ } from './dom';

/**
 * Busy indicator for the viewport: a status pill with the current stage and a thin progress
 * shimmer. It only appears for work that takes a noticeable time (no flicker on quick updates)
 * and stays up long enough to read.
 */
function busyIndicator() {
  const pill = $('#status'), text = $('#status-text'), bar = $('#busy-bar');
  let showTimer = 0, shownAt = 0, active = false;
  const show = () => {
    shownAt = performance.now();
    pill.classList.add('show');
    bar.classList.add('show');
  };
  return {
    start(label: string) {
      text.textContent = label;
      if (active) return;
      active = true;
      clearTimeout(showTimer);
      if (!pill.classList.contains('show')) showTimer = window.setTimeout(show, 160);
    },
    stage(label: string) {
      if (text.textContent === label) return;
      text.textContent = label;
      text.classList.remove('swap');
      void text.offsetWidth; // restart the fade-in
      text.classList.add('swap');
    },
    end() {
      active = false;
      clearTimeout(showTimer);
      const wait = pill.classList.contains('show') ? Math.max(0, 350 - (performance.now() - shownAt)) : 0;
      showTimer = window.setTimeout(() => {
        if (active) return;
        pill.classList.remove('show');
        bar.classList.remove('show');
      }, wait);
    },
  };
}

/** Wires parameter changes to builds. Returns `whenIdle` for work that must see the latest build. */
export function generation(ctx: Omit<Ctx, 'whenIdle' | 'playClip'>): { regenerate: () => void; whenIdle: () => Promise<void> } {
  const { store, engine, viewer, cat } = ctx;
  const busy = busyIndicator();
  let building = false, dirty = false;
  let idleWaiters: (() => void)[] = [];

  async function pump() {
    building = true;
    busy.start('Updating…');
    while (dirty) {
      dirty = false;
      const p = store.params;
      const t0 = performance.now();
      let ch: Character;
      try {
        ch = await engine.build(p, (stage) => {
          busy.stage(`${stage}…`);
          if (!store.current) $('#loading-text').textContent = `${stage}…`;
        });
      } catch (e) {
        console.error(e);
        busy.stage(`Failed: ${(e as Error).message}`);
        if (!store.current) $('#loading-text').textContent = `Could not build the character: ${(e as Error).message}`;
        continue;
      }
      viewer.show(ch);
      $('#loading').hidden = true;
      const ms = performance.now() - t0;
      const skin = p.skin === 'auto' ? ` · skin: ${autoSkin(p, cat.skins).name}` : '';
      $('#stats').textContent =
        `${(ch.height * 100).toFixed(0)} cm · ${ageToYears(p.age).toFixed(0)} yrs · ` +
        `${triangleCount(ch.mesh).toLocaleString()} tris · ${ch.mesh.materials.length} materials · ` +
        `${ms.toFixed(0)} ms${skin}`;
      store.setCharacter(ch, p, ms);
    }
    building = false;
    busy.end();
    idleWaiters.forEach((r) => r());
    idleWaiters = [];
  }

  const regenerate = () => {
    // An imported character isn't built from params: nothing to rebuild until Ara's own comes back.
    if (store.imported) return;
    dirty = true;
    if (!building) void pump();
  };
  store.on('params', regenerate);
  return { regenerate, whenIdle: () => (building ? new Promise<void>((r) => idleWaiters.push(r)) : Promise.resolve()) };
}
