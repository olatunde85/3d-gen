/** The Export panel, the export bar's summary and download button, and running exports. */
import { CLIPS } from '../../core/anim/clips';
import { stagePropFor } from '../../core/anim/stage';
import { RIG_LABELS, type RigType } from '../../core/rig/skeletons';
import { MODE_LABELS, planExport } from '../../export';
import type { Ctx } from './context';
import { $, el } from './dom';

export function exportPanel(ctx: Ctx): { open: () => void } {
  const { store, viewer, engine } = ctx;
  const settings=()=>({...store.exportSettings,vehiclePreviewClip:viewer.playing?.id});
  const panel = $('#export-panel');
  const summaryText = $('#export-summary-text');
  const goBtn = $<HTMLButtonElement>('#export-go');
  $('#export-summary').addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    render();
  });

  /** Export progress shown on the download buttons (re-applied when the panel re-renders). */
  let exportState: { label: string; frac: number; done?: boolean; failed?: boolean } | null = null;

  /** Rebuild the panel and the export-bar summary from the current plan. */
  function render() {
    const current = store.current;
    if (!current) return;
    const plan = planExport(current, settings());
    summaryText.textContent = plan.summary;
    goBtn.dataset.label = `⬇ ${plan.download}`;
    if (!exportState) goBtn.textContent = goBtn.dataset.label;
    goBtn.title = `Download ${plan.download}`;
    paintButtons();
    if (panel.hidden) return;
    const s = store.exportSettings, params = store.params, set = store.set.bind(store), setExport = store.setExport.bind(store);
    const h = (t: string) => el('div', { className: 'xp-h', textContent: t });
    const radio = <T extends string>(value: T, cur: T, label: string, on: (v: T) => void, extra: Record<string, unknown> = {}) => {
      const b = el('button', { className: 'seg' + (value === cur ? ' on' : ''), textContent: label, ...extra });
      b.addEventListener('click', () => on(value));
      return b;
    };
    const check = (label: string, val: boolean, on: (v: boolean) => void) => {
      const box = el('input', { type: 'checkbox', checked: val });
      box.addEventListener('change', () => on(box.checked));
      return el('label', { className: 'acc' }, box, label);
    };
    const select = (opts: [string, string][], val: string, on: (v: string) => void) => {
      const sel = el('select');
      for (const [v, l] of opts) sel.append(new Option(l, v));
      sel.value = val;
      sel.addEventListener('change', () => on(sel.value));
      return sel;
    };

    const kids: Node[] = [];
    const close = el('button', { className: 'xp-close', textContent: '✕', title: 'Close' });
    close.addEventListener('click', () => {
      panel.hidden = true;
    });
    kids.push(el('div', { className: 'xp-title' }, el('span', { textContent: 'Export' }), close));

    // 1. Mode
    kids.push(h('1 · What to export'));
    const cards = el('div', { className: 'xp-cards' });
    for (const m of ['static', 'rigged', 'animated'] as const) {
      const c = el('button', { className: 'xp-card' + (plan.settings.mode === m ? ' on' : '') },
        el('b', { textContent: MODE_LABELS[m].title }), el('span', { textContent: MODE_LABELS[m].blurb }));
      c.addEventListener('click', () => setExport({ mode: m }));
      cards.append(c);
    }
    kids.push(cards);

    // 2. Rig
    if (s.mode !== 'static') {
      kids.push(h('2 · Skeleton'));
      kids.push(el('div', { className: 'ctl wide' }, el('span', { textContent: 'Skeleton' }),
        select((['game', 'game_lite', 'full'] as RigType[]).map((k) => [k, RIG_LABELS[k]]), params.rig === 'none' ? 'game' : params.rig, (v) => set({ rig: v as RigType }))));
      kids.push(el('div', { className: 'ctl wide' }, el('span', { textContent: 'Rest pose' }),
        select([['A', 'A-pose (natural)'], ['T', 'T-pose (Mixamo / Unity Humanoid)']], params.restPose, (v) => set({ restPose: v as 'A' | 'T' }))));
      kids.push(check('Facial bones (jaw + eyes)', params.faceBones, (v) => set({ faceBones: v })));
      kids.push(check('Facial blend shapes (expressions, blinking)', params.faceShapes, (v) => set({ faceShapes: v })));
      if (params.faceShapes) kids.push(check('Speech mouth shapes (visemes, ~0.7 MB)', params.speechShapes, (v) => set({ speechShapes: v })));
      if (current.rig) kids.push(el('div', { className: 'rig-status', textContent: `✓ Auto-rigged: ${current.rig.bones.length} bones · ${current.rig.restPose}-pose bind · 4 weights per vertex` }));
    }

    // 3. Animations
    if (s.mode === 'animated') {
      kids.push(h('3 · Animations'));
      const allBtn = el('button', { className: 'mini', textContent: 'All' });
      allBtn.addEventListener('click', () => setExport({ clips: CLIPS.map((c) => c.id) }));
      const noneBtn = el('button', { className: 'mini', textContent: 'None' });
      noneBtn.addEventListener('click', () => setExport({ clips: [] }));
      kids.push(el('div', { className: 'xp-row' }, el('span', { className: 'hint', textContent: `${s.clips.length} of ${CLIPS.length} selected` }), allBtn, noneBtn));
      for (const cat of [...new Set(CLIPS.map((c) => c.category))]) {
        const grid = el('div', { className: 'xp-clips' });
        for (const c of CLIPS.filter((x) => x.category === cat)) {
          const on = s.clips.includes(c.id);
          const box = el('input', { type: 'checkbox', checked: on });
          box.addEventListener('change', () => setExport({ clips: on ? s.clips.filter((x) => x !== c.id) : [...s.clips, c.id] }));
          const play = el('button', { className: 'mini', textContent: '▶', title: `Preview ${c.name}` });
          play.addEventListener('click', () => ctx.playClip(c.id));
          grid.append(el('label', { className: 'xp-clip' }, box, el('span', { textContent: c.name }), el('small', { textContent: `${c.duration.toFixed(1)}s ${c.loop ? '↻' : ''}` }), play));
        }
        const ids = CLIPS.filter((x) => x.category === cat).map((x) => x.id);
        const allOn = ids.every((id) => s.clips.includes(id));
        const catBtn = el('button', { className: 'xp-cat', textContent: `${cat} ${allOn ? '☑' : '☐'}`, title: allOn ? `Deselect all ${cat}` : `Select all ${cat}` });
        catBtn.addEventListener('click', () =>
          setExport({ clips: allOn ? s.clips.filter((c) => !ids.includes(c)) : [...new Set([...s.clips, ...ids])] }));
        kids.push(catBtn, grid);
      }
      kids.push(el('div', { className: 'xp-row' },
        radio('embedded', s.packaging, 'One file, all clips inside', (v) => setExport({ packaging: v })),
        radio('separate', s.packaging, 'Zip: one file per clip', (v) => setExport({ packaging: v }))));
      if (s.packaging === 'separate') kids.push(check('Include the mesh in every clip file (bigger; off = skeleton + animation only)', s.clipMesh, (v) => setExport({ clipMesh: v })));
      kids.push(check('Root motion (walk / run / strafe travel instead of playing in place)', s.rootMotion, (v) => setExport({ rootMotion: v })));
      kids.push(check('Mark looping clips in their names ("Walk-loop", auto-loops in Godot)', s.loopSuffix, (v) => setExport({ loopSuffix: v })));
    }

    // 4. Format
    kids.push(h(`${s.mode === 'static' ? '2' : s.mode === 'rigged' ? '3' : '4'} · Format`));
    kids.push(el('div', { className: 'xp-row' },
      radio('glb', s.format, 'GLB', (v) => setExport({ format: v }), { title: 'glTF binary: web, Godot, Blender, three.js' }),
      radio('fbx', s.format, 'FBX', (v) => setExport({ format: v }), { title: 'Unity, Unreal, Maya, 3ds Max, Blender' }),
      radio('obj', s.format, 'OBJ', (v) => setExport({ format: v }), {
        title: s.mode === 'static' ? 'Wavefront OBJ + textures (static)' : 'OBJ cannot store a rig or animations',
        disabled: s.mode !== 'static',
      }),
      radio('all', s.format, 'All formats', (v) => setExport({ format: v }), { title: 'Every format in one zip' })));

    if (current.weapon) {
      kids.push(h('Weapon'));
      kids.push(el('div', { className: 'xp-row' },
        radio('held', s.weaponFile, `In the hand (one file)`, (v) => setExport({ weaponFile: v }), { title: 'Weapon is part of the character mesh, skinned to the WeaponR bone' }),
        radio('separate', s.weaponFile, 'Separate prop file', (v) => setExport({ weaponFile: v }), { title: 'Character without the weapon + the weapon as its own file, to attach to WeaponR in your engine' })));
    }

    const staged = (s.mode === 'animated' ? s.clips : [viewer.playing?.id ?? '']).some((id) => stagePropFor(id));
    if (current.rig && staged) kids.push(check('Include stage props (ladder, obstacle, ledge wall, cover) as separate files', s.stageProps !== false, (v) => setExport({ stageProps: v })));
    if(current.params.vehicle!=='none')kids.push(check('Include fitted vehicle props as separate files',s.vehicleFile!==false,v=>setExport({vehicleFile:v})));
    // Summary of exactly what will be downloaded
    kids.push(h('You will download'));
    const list = el('ul', { className: 'xp-files' });
    for (const f of plan.files)
      list.append(el('li', { className: f.kind === 'meta' ? 'meta' : '' }, el('code', { textContent: f.path }), el('span', { textContent: f.desc })));
    kids.push(el('div', { className: 'xp-download' }, el('b', { textContent: plan.download }), el('span', { className: 'hint', textContent: plan.zipped ? `zip with ${plan.files.length} items` : 'single file' })), list);
    for (const n of plan.notes) kids.push(el('div', { className: 'xp-note', textContent: `ⓘ ${n}` }));
    const dl = el('button', { className: 'primary xp-go', textContent: `⬇ Download ${plan.download}` });
    dl.addEventListener('click', doExport);
    kids.push(dl);
    panel.replaceChildren(...kids);
    paintButtons();
  }

  function paintButtons() {
    const buttons = [goBtn, ...panel.querySelectorAll<HTMLButtonElement>('.xp-go')];
    for (const b of buttons) {
      if (exportState && !b.dataset.label) b.dataset.label = b.textContent ?? '';
      b.classList.toggle('busy', !!exportState && !exportState.done && !exportState.failed);
      b.classList.toggle('done', !!exportState?.done);
      b.classList.toggle('failed', !!exportState?.failed);
      b.disabled = !!exportState && !exportState.done && !exportState.failed;
      b.style.setProperty('--p', `${Math.round((exportState?.frac ?? 0) * 100)}%`);
      if (!exportState) {
        if (b.dataset.label) b.textContent = b.dataset.label;
        continue;
      }
      const icon = exportState.done ? '✓' : exportState.failed ? '!' : '';
      b.replaceChildren(
        icon ? el('span', { className: 'ico', textContent: icon }) : el('span', { className: 'spin' }),
        el('span', { className: 'lbl', textContent: exportState.label }),
      );
    }
  }

  async function doExport() {
    if (!store.current || (exportState && !exportState.done && !exportState.failed)) return;
    exportState = { label: 'Preparing…', frac: 0 };
    paintButtons();
    try {
      await ctx.whenIdle(); // export the character as currently shown in the controls
      const chosen=settings(),plan = planExport(store.current, chosen);
      const previewPng = plan.zipped ? await viewer.snapshot() : undefined;
      const file = await engine.export(chosen, previewPng, (label, frac) => {
        exportState = { label: `${label}…`, frac: frac ?? exportState!.frac };
        paintButtons();
      });
      exportState = { label: `Saved ${file.name}`, frac: 1, done: true };
      paintButtons();
      const url = URL.createObjectURL(new Blob([file.data as BlobPart], { type: file.mime }));
      const a = el('a', { href: url, download: file.name });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      exportState = { label: `Export failed: ${(e as Error).message}`, frac: 0, failed: true };
      paintButtons();
    }
    setTimeout(() => {
      exportState = null;
      paintButtons();
    }, exportState?.failed ? 4000 : 1800);
  }
  goBtn.addEventListener('click', doExport);

  store.on('export', render);
  store.on('character', render);
  return {
    open: () => {
      panel.hidden = false;
      render();
    },
  };
}
