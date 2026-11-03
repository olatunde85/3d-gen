import { generateCharacterGuide, parseCharacterInput, characterExample } from '../character-assist';
import { ageToYears, type HumanParams } from '../../core/params';
import type { Ctx } from './context';
import { $ } from './dom';
export function characterAssist(ctx:Ctx){
  const key='ara.character.assist.v1',dialog=document.createElement('dialog');dialog.className='character-assist-modal';dialog.id='character-assist-dialog';dialog.setAttribute('aria-labelledby','character-assist-title');
  dialog.innerHTML=`<div class="ca-header"><span>LLM ASSIST · CHARACTER BUILDER</span><button id="ca-close" aria-label="Close character LLM Assist">✕</button></div>
    <h2 id="character-assist-title">Describe your character</h2><p class="ca-intro">Give your AI assistant the builder guide, then bring back its JSON to create one editable character.</p>
    <div class="ca-columns"><section><h3>1. Brief your AI assistant</h3><label for="ca-brief">Who do you want to create?</label><textarea id="ca-brief" rows="4" maxlength="6000" placeholder="A confident explorer in her thirties, with cornrows, cargo shorts and a backpack."></textarea>
      <label class="ca-check"><input id="ca-context" type="checkbox" /> Include my current character as the starting point</label><div class="ca-actions"><button id="ca-copy" class="primary">Copy guide</button><button id="ca-download">Save guide .txt</button></div>
      <p id="ca-copy-status" class="ca-note" role="status">Includes body and face controls, installed assets, clothing, props, presets, JSON schema and an example.</p>
      <details id="ca-details"><summary>View the generated guide</summary><textarea id="ca-guide" rows="7" readonly spellcheck="false" aria-label="Character LLM guide"></textarea></details>
      <p class="ca-note ca-local">Use your preferred AI assistant. Nothing is sent automatically.</p></section>
    <section><h3>2. Bring back character JSON</h3><div class="ca-actions"><button id="ca-open">Open JSON</button><button id="ca-example">Try an example</button></div><label for="ca-json">Or paste the complete character JSON</label>
      <textarea id="ca-json" rows="13" maxlength="100000" spellcheck="false" aria-describedby="ca-status" placeholder='{"kind":"ara-character","version":1,"params":{…}}'></textarea><p id="ca-status" class="ca-note" role="status" aria-live="polite"></p>
      <button id="ca-build" class="primary" disabled>Build character ↗</button><p class="ca-note">Character creation only. For scenes, text and films, use LLM Assist in Ara Studio. Undo restores your previous character.</p></section></div><input id="ca-file" type="file" accept=".json,application/json" hidden />`;
  document.body.append(dialog);
  const input=<T extends HTMLInputElement|HTMLTextAreaElement|HTMLButtonElement=HTMLInputElement>(id:string)=>$<T>('#ca-'+id);
  const brief=input<HTMLTextAreaElement>('brief'),draft=input<HTMLTextAreaElement>('json'),guide=input<HTMLTextAreaElement>('guide'),context=input('context'),status=$('#ca-status'),build=input<HTMLButtonElement>('build'),file=input('file');
  let parsed:HumanParams|undefined,busy=false,timer=0;
  const persist=()=>{clearTimeout(timer);try{localStorage.setItem(key,JSON.stringify({brief:brief.value,json:draft.value,context:context.checked,open:dialog.open,guideOpen:$<HTMLDetailsElement>('#ca-details').open}));}catch{/* Draft recovery is optional when browser storage is unavailable. */}};
  const schedule=()=>{clearTimeout(timer);timer=window.setTimeout(persist,250);};
  const updateGuide=()=>{guide.value=generateCharacterGuide(ctx.cat,brief.value,context.checked?ctx.store.params:undefined);};
  function validate(){
    parsed=undefined;draft.setAttribute('aria-invalid','false');status.classList.remove('error');
    if(!draft.value.trim())status.textContent='Paste character JSON or open a .json file.';
    else try{parsed=parseCharacterInput(draft.value,ctx.cat);status.textContent=`${parsed.name||'Character'} · ${ageToYears(parsed.age).toFixed(0)} years · ${parsed.detail} detail · ${parsed.rig} rig`;}
    catch(error){status.textContent=(error as Error).message;status.classList.add('error');draft.setAttribute('aria-invalid','true');}
    build.disabled=busy||!parsed;
  }
  function lock(){for(const e of dialog.querySelectorAll<HTMLInputElement|HTMLTextAreaElement|HTMLButtonElement>('input,textarea,button'))e.disabled=busy;build.disabled=busy||!parsed;dialog.setAttribute('aria-busy',String(busy));}
  const download=(value:string,name:string)=>{const url=URL.createObjectURL(new Blob([value],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);};
  async function open(){await ctx.whenIdle();updateGuide();validate();if(!dialog.open)dialog.showModal();persist();}
  $('#character-assist-btn').addEventListener('click',()=>void open());$('#ca-close').addEventListener('click',()=>{if(!busy)dialog.close();});
  dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});dialog.addEventListener('close',persist);
  brief.addEventListener('input',()=>{updateGuide();schedule();});context.addEventListener('change',()=>{updateGuide();schedule();});draft.addEventListener('input',()=>{validate();schedule();});$<HTMLDetailsElement>('#ca-details').addEventListener('toggle',schedule);
  $('#ca-copy').addEventListener('click',async()=>{updateGuide();try{await navigator.clipboard.writeText(guide.value);$('#ca-copy-status').textContent='Guide copied. Paste it into your AI assistant.';}catch{$<HTMLDetailsElement>('#ca-details').open=true;guide.focus();guide.select();$('#ca-copy-status').textContent='Guide selected. Press Ctrl/Cmd+C to copy.';}});
  $('#ca-download').addEventListener('click',()=>{updateGuide();download(guide.value,'ara-character-llm-guide.txt');});
  $('#ca-example').addEventListener('click',()=>{draft.value=JSON.stringify(characterExample(),null,2);validate();persist();});
  $('#ca-open').addEventListener('click',()=>file.click());file.addEventListener('change',async()=>{const chosen=file.files?.[0];if(!chosen||busy)return;busy=true;lock();try{if(chosen.size>100_000)throw Error('Use character JSON smaller than 100 KB.');draft.value=await chosen.text();validate();}catch(error){parsed=undefined;status.textContent=(error as Error).message;status.classList.add('error');}finally{busy=false;file.value='';lock();persist();}});
  build.addEventListener('click',async()=>{
    validate();if(!parsed||busy)return;busy=true;lock();const previous=structuredClone(ctx.store.params);persist();
    try{await ctx.whenIdle();const next=parsed;ctx.store.replaceAll(next);status.textContent='Building your character…';await ctx.whenIdle();
      if(JSON.stringify(ctx.store.current?.params)!==JSON.stringify(next)){ctx.store.replaceAll(previous);await ctx.whenIdle();throw Error('The character could not be built. Your previous character has been restored.');}
      // Keep a return-to-Studio token, but do not replay the old character link on refresh.
      const url=new URL(location.href),hash=new URLSearchParams(url.hash.slice(1));hash.delete('c');hash.delete('preset');hash.delete('detail');url.hash=hash.toString();window.history.replaceState(window.history.state,'',url);
      dialog.close();
    }catch(error){status.textContent=(error as Error).message;status.classList.add('error');}
    finally{busy=false;lock();persist();}
  });
  window.addEventListener('pagehide',persist);window.addEventListener('beforeunload',persist);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')persist();});
  try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(saved&&typeof saved==='object'){
    brief.value=typeof saved.brief==='string'?saved.brief.slice(0,6000):'';draft.value=typeof saved.json==='string'?saved.json.slice(0,100000):'';context.checked=saved.context===true;$<HTMLDetailsElement>('#ca-details').open=saved.guideOpen===true;if(saved.open===true)void open();
  }}catch{/* Ignore damaged draft metadata; the character has its own saved settings. */}
}
