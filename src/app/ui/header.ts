/** Header: presets, name, seed and randomize; and the viewport's view toggles. */
import { DEFAULT_PARAMS, PRESETS, randomParams } from '../../core/params';
import type { Ctx } from './context';
import {characterSettings,characterSettingsName,readCharacterSettings} from '../character-file';
import { $ } from './dom';

export function header(ctx: Ctx): void {
  const { store, cat, viewer } = ctx;
  const fileInput=$<HTMLInputElement>('#character-settings-file'),status=$('#character-file-status');
  $('#save-character').addEventListener('click',async()=>{
    await ctx.whenIdle();const url=URL.createObjectURL(new Blob([characterSettings(store.params)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=characterSettingsName(store.params.name);link.click();setTimeout(()=>URL.revokeObjectURL(url),60_000);status.textContent='Character settings saved. Import this file to add them to Studio.';
  });
  $('#open-character').addEventListener('click',()=>fileInput.click());
  fileInput.addEventListener('change',async()=>{const file=fileInput.files?.[0];if(!file)return;
    try{if(file.size>100_000)throw Error('Use a character JSON smaller than 100 KB.');const params=readCharacterSettings(await file.text(),cat);store.replaceAll(params);status.textContent=`Opened ${params.name||'your character'}.`;}
    catch(error){status.textContent=(error as Error).message;}finally{fileInput.value='';}
  });
  const presetSel = $<HTMLSelectElement>('#preset');
  presetSel.append(new Option('Presets…', ''));
  for (const name of Object.keys(PRESETS)) presetSel.append(new Option(name, name));
  presetSel.addEventListener('change', () => {
    const name = presetSel.value;
    if (!name) return;
    presetSel.value = '';
    store.replaceAll({ ...DEFAULT_PARAMS, ...PRESETS[name], name, detail: store.params.detail });
  });

  const nameInput = $<HTMLInputElement>('#name');
  const seedInput = $<HTMLInputElement>('#seed');
  store.on('sync', () => {
    nameInput.value = store.params.name;
    seedInput.value = String(store.params.seed);
  });
  nameInput.addEventListener('input', () => store.setQuiet({ name: nameInput.value }));
  const randomize = (seed: number) => store.replaceAll({ ...randomParams(seed, cat), detail: store.params.detail, name: `character_${seed}` });
  $('#randomize').addEventListener('click', () => randomize(Math.floor(Math.random() * 1e6)));
  seedInput.addEventListener('change', () => randomize(Number(seedInput.value) || 0));

  $<HTMLInputElement>('#wireframe').addEventListener('change', (e) => viewer.setWireframe((e.target as HTMLInputElement).checked));
  $<HTMLInputElement>('#skeleton').addEventListener('change', (e) => viewer.setSkeleton((e.target as HTMLInputElement).checked));
  $<HTMLInputElement>('#face').addEventListener('change', (e) => viewer.focusFace((e.target as HTMLInputElement).checked));
}
