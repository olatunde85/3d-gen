/**
 * Sound: Dialogue (a voice for each speaker and the script as a list of lines), Music and Sound effects.
 * One line opens at a time, under itself in the script, with what's said, how it's said and its timing.
 */
import { durationOf, parseProject, beatId, type StudioProject } from '../project';
import { MAX_SPEECH, MUSIC_TRACKS, VOICE_EFFECTS, EFFECT_LABELS, speechActor, resolveSpeechActor, type SpeechCue } from './schema';
import { getAsset, importAudio, wavBlob, type AudioAsset } from './assets';
import { AudioPlayback, renderSoundtrack } from './mix';
import { generateSpeech, releaseSpeechEngine } from './tts';
import { setupEffectsEditor } from './effects-ui';
import { audioProjectBundle } from './bundle';
import { composeMusic, canGenerate } from './generate';
import { thinking, type Thinking } from '../../app/keys/thinking';
import { decodeCharacter } from '../../app/share';
import { DELIVERY_PRESETS, presetFor, voiceMenu, voiceName, supportsDelivery, deliveryHint, defaultVoice, playVoiceSample, generationNote, type VoiceGroup } from '../../app/keys/voices';
import { openKeys } from '../../app/keys/dialog';
import { keySettings, onKeysChange } from '../../app/keys/store';
import { PROVIDERS } from '../../app/keys/providers';

interface SoundEditor {
  project():StudioProject;time():number;actor():string|undefined;pause():void;canEdit():boolean;
  edit(fn:(project:StudioProject)=>void,remember?:boolean):Promise<boolean>;
  download(blob:Blob,name:string):void;changed():void;
}
type Tab='dialogue'|'music'|'effects';
const TABS:Tab[]=['dialogue','music','effects'];
const html=(s:string)=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!));
const seconds=(t:number)=>`${Math.floor(t/60)}:${(t%60).toFixed(1).padStart(4,'0')}`;

export function setupSoundEditor(editor:SoundEditor){
  const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T,input=(id:string)=>$<HTMLInputElement>('sound-'+id),select=(id:string)=>$<HTMLSelectElement>('sound-'+id),button=(id:string)=>$<HTMLButtonElement>('sound-'+id);
  const dialog=$<HTMLDialogElement>('sound-dialog'),message=$('sound-message'),preview=new AudioPlayback(),lines=$<HTMLOListElement>('sound-lines'),cast=$<HTMLUListElement>('sound-cast');
  // The one line editor, moved under whichever line is open.
  const lineEditor=($<HTMLTemplateElement>('sound-line-editor').content.firstElementChild as HTMLElement).cloneNode(true) as HTMLElement;
  lineEditor.hidden=true;lines.after(lineEditor);
  const body=lineEditor.querySelector<HTMLTextAreaElement>('#sound-script')!;
  const field=<T extends HTMLElement>(id:string)=>lineEditor.querySelector<T>('#sound-'+id)!;
  let activeTab:Tab='dialogue',selected='',open_=false,busy=false,controller:AbortController|undefined;
  let lastTyped='',lastTyping=0,recording:MediaRecorder|undefined,stream:MediaStream|undefined,recordTimer=0,recordTick=0,recordToken=0,discardRecording=false,waveToken=0;
  let menu:VoiceGroup[]=[],menuToken=0;
  /** Lines being voiced now, and lines whose last attempt failed (with why). */
  const working=new Set<string>(),failed=new Map<string,string>();
  /** A voice chosen for a speaker who has no typed lines yet; new lines start with it. */
  const chosenVoice=new Map<string,string>();
  const peaks=new Map<string,Float32Array>();
  const effects=setupEffectsEditor({...editor,canEdit:()=>editor.canEdit()&&!busy&&recording?.state!=='recording',stopOther:()=>stopPreview()});
  const project=()=>editor.project(),current=()=>project().audio.speech.find(c=>c.id===selected);
  const status=(text:string)=>{message.textContent=text;};

  // ---- Speakers ----
  function speakers(){
    const p=project(),list:{id:string;name:string;gender?:number}[]=[{id:'narrator',name:'Narrator'}];
    p.actors.forEach((a,i)=>{const c=decodeCharacter(a.character,a.detail);list.push({id:speechActor(a.id),name:c?.name||`Character ${i+1}`,gender:c?.gender});});
    return list;
  }
  const speakerName=(actor:string)=>speakers().find(s=>s.id===actor||s.id===speechActor(resolveSpeechActor(actor)))?.name??'Narrator';
  /** The voice a speaker uses: their typed lines' voice, the one picked for them, or a sensible default. */
  function speakerVoice(actor:string){
    const typed=project().audio.speech.find(c=>c.actor===actor&&c.source==='tts');
    if(typed)return typed.voice;
    if(chosenVoice.has(actor))return chosenVoice.get(actor)!;
    const list=speakers(),index=Math.max(0,list.findIndex(s=>s.id===actor)),gender=list[index]?.gender;
    return defaultVoice(index,gender);
  }

  async function commit(fn:(p:StudioProject)=>void,remember=true){const p=structuredClone(project());fn(p);try{parseProject(JSON.stringify(p));return await editor.edit(fn,remember);}catch(error){status((error as Error).message);return false;}}
  async function update(patch:Partial<SpeechCue>,remember=true){if(!current())return;await commit(p=>{const c=p.audio.speech.find(c=>c.id===selected);if(c)Object.assign(c,patch);},remember);failed.delete(selected);editor.changed();render();}

  // ---- Voice menus ----
  function fillVoices(el:HTMLSelectElement,value:string){
    el.replaceChildren();
    for(const group of menu){const g=document.createElement('optgroup');g.label=group.label;for(const v of group.voices)g.append(new Option(v.detail?`${v.name} · ${v.detail}`:v.name,v.id));el.append(g);}
    if(![...el.options].some(o=>o.value===value)){const g=document.createElement('optgroup');g.label='In this film';g.append(new Option(voiceName(value),value));el.append(g);}
    el.append(new Option('More voices… (connect a voice service)','__keys'));
    el.value=value;
  }
  async function loadVoices(){const token=++menuToken;const next=await voiceMenu().catch(()=>menu);if(token!==menuToken)return;menu=next;render();}

  // ---- Rendering ----
  function lineState(cue:SpeechCue){
    if(working.has(cue.id))return{key:'working',label:'Voicing…'};
    if(failed.has(cue.id))return{key:'failed',label:'Couldn’t voice'};
    if(cue.asset)return{key:'ready',label:cue.source==='tts'?'Voiced':cue.source==='recording'?'Recorded':'Uploaded'};
    return cue.text.trim()?{key:'needs',label:'Needs a voice'}:{key:'empty',label:'Empty'};
  }
  const pending=()=>project().audio.speech.filter(c=>c.source==='tts'&&!c.asset&&c.text.trim());
  function renderCast(){
    const locked=busy||recording?.state==='recording';
    cast.replaceChildren();
    const counts=new Map<string,number>();for(const c of project().audio.speech)counts.set(c.actor,(counts.get(c.actor)??0)+1);
    for(const s of speakers()){
      const li=document.createElement('li'),voice=speakerVoice(s.id),n=counts.get(s.id)??0;
      li.className='sound-speaker';
      li.innerHTML=`<span class="sound-speaker-name">${html(s.name)}<span>${n?`${n} line${n===1?'':'s'}`:'no lines yet'}</span></span>`;
      const pick=document.createElement('select');pick.setAttribute('aria-label',`Voice for ${s.name}`);pick.dataset.speaker=s.id;pick.disabled=locked;fillVoices(pick,voice);
      const sample=document.createElement('button');sample.className='sound-sample';sample.textContent='▶';sample.title=`Hear ${voiceName(voice)}`;sample.setAttribute('aria-label',`Hear the voice for ${s.name}`);sample.dataset.sample=s.id;sample.disabled=locked;
      li.append(pick,sample);cast.append(li);
    }
  }
  function renderLines(){
    const cues=[...project().audio.speech].sort((a,b)=>a.start-b.start);
    if(!cues.some(c=>c.id===selected))selected='';
    $('sound-count').textContent=`${cues.length} / ${MAX_SPEECH}`;$('sound-empty').hidden=cues.length>0;
    lines.replaceChildren();
    for(const cue of cues){
      const li=document.createElement('li'),state=lineState(cue),open=cue.id===selected&&open_;
      li.className=`sound-line ${state.key}${open?' open':''}`;li.dataset.id=cue.id;
      const words=cue.text.trim()||cue.name;
      li.innerHTML=`<button class="sound-line-head" aria-expanded="${open}" data-line="${html(cue.id)}"><span class="sound-time">${seconds(cue.start)}</span><span class="sound-who">${html(speakerName(cue.actor))}</span><span class="sound-words">${html(words)}</span><span class="sound-state">${state.label}</span></button>`;
      if(state.key==='failed')li.insertAdjacentHTML('beforeend',`<p class="sound-line-error">${html(failed.get(cue.id)!)}</p>`);
      lines.append(li);
      if(open)li.append(lineEditor);
    }
    lineEditor.hidden=!current()||!open_;
    if(!lineEditor.isConnected||lineEditor.hidden)lines.after(lineEditor);
  }
  function renderEditor(){
    const cue=current();if(!cue||!open_)return;
    const locked=busy||recording?.state==='recording';
    if(document.activeElement!==body)body.value=cue.text;
    const delivery=field<HTMLInputElement>('delivery');if(document.activeElement!==delivery)delivery.value=cue.delivery??'';
    for(const key of ['name','start','duration','offset','speed','volume','pan']as const){const el=field<HTMLInputElement>(key);if(document.activeElement!==el)el.value=String(key==='volume'||key==='pan'?Math.round(cue[key]*100):cue[key]);}
    const who=field<HTMLSelectElement>('actor');who.replaceChildren(...speakers().map(s=>new Option(s.name,s.id)));who.value=cue.actor;
    field<HTMLSelectElement>('effect').value=cue.effect;
    const typed=cue.source==='tts',canDeliver=typed&&supportsDelivery(cue.voice);
    field('delivery-row').hidden=!canDeliver;
    if(canDeliver){const box=field('delivery-presets');box.replaceChildren(...DELIVERY_PRESETS.map(p=>{const b=document.createElement('button');b.type='button';b.className='sound-preset';b.textContent=p.label;const value=presetFor(cue.voice,p);b.dataset.value=value;b.setAttribute('aria-pressed',String((cue.delivery??'')===value));b.disabled=locked;return b;}));}field('delivery-hint').textContent=canDeliver?deliveryHint(cue.voice):'';
    const generate=field<HTMLButtonElement>('generate');
    generate.textContent=typed?cue.asset?'Voice again':'Voice this line':'Voice from the words';
    generate.disabled=locked||!cue.text.trim();
    field<HTMLButtonElement>('preview').disabled=locked||!cue.asset;field<HTMLButtonElement>('fit').disabled=locked||!cue.asset;
    field('asset-status').textContent=typed?`${voiceName(cue.voice)}${cue.asset?'':' · not voiced yet'}`:cue.source==='recording'?'Your recording. The words are used for subtitles and Assist.':'Your audio file. The words are used for subtitles and Assist.';
    for(const el of lineEditor.querySelectorAll<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement|HTMLButtonElement>('input,textarea,select,button'))if(!['generate','preview','fit'].some(id=>el.id==='sound-'+id))el.disabled=locked;
    void waveform(cue);
  }
  function renderGeneration(){
    const todo=pending(),all=project().audio.speech,locked=busy||recording?.state==='recording';
    const go=button('generate-all');go.closest('.sound-generation')!.classList.toggle('pending',todo.length>0);
    go.disabled=locked||!todo.length;go.textContent=todo.length?`Voice ${todo.length} line${todo.length===1?'':'s'}`:'All lines voiced';
    $('sound-generation-summary').textContent=!all.length?'Add lines to the script to voice them.':todo.length?`${todo.length} line${todo.length===1?' needs':'s need'} a voice`:'Every line has a voice';
    $('sound-generation-detail').innerHTML=generationNote(todo.map(c=>({voice:c.voice,text:c.text})));
  }
  function renderKeysChip(){
    const s=keySettings(),voices=Object.keys(s.keys).filter(id=>PROVIDERS[id as keyof typeof PROVIDERS]?.roles.includes('voice'));
    button('keys').classList.toggle('on',voices.length>0);
    $('sound-keys-label').textContent=voices.length?`Voices: ${voices.map(id=>PROVIDERS[id as keyof typeof PROVIDERS].short).join(', ')}`:'More voices';
  }
  function lock(){
    const locked=busy||recording?.state==='recording';
    for(const id of ['add','upload'])button(id).disabled=locked||project().audio.speech.length>=MAX_SPEECH&&id==='add';
    button('record').disabled=busy||!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined';
    for(const el of lines.querySelectorAll<HTMLButtonElement>('.sound-line-head'))el.disabled=locked;
    $('sound-cancel').hidden=!controller;
  }
  function render(){
    renderMusic();renderKeysChip();renderCast();renderLines();renderEditor();renderGeneration();lock();effects.render();
  }

  async function waveform(cue:SpeechCue){
    const token=++waveToken,canvas=field<HTMLCanvasElement>('waveform'),ctx=canvas.getContext('2d')!;ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.strokeStyle='#3a3a40';ctx.beginPath();ctx.moveTo(0,canvas.height/2);ctx.lineTo(canvas.width,canvas.height/2);ctx.stroke();
    canvas.hidden=!cue.asset;if(!cue.asset)return;
    const asset=await getAsset(cue.asset).catch(()=>undefined);if(token!==waveToken)return;
    if(!asset){field('asset-status').textContent='This line’s audio isn’t in this browser. Voice it again, or open the film saved with its audio.';canvas.hidden=true;return;}
    let values=peaks.get(cue.asset);if(!values){const data=new DataView(await asset.blob.arrayBuffer());if(token!==waveToken)return;const frames=(data.byteLength-44)/(2*asset.channels);values=new Float32Array(canvas.width);
      for(let x=0;x<canvas.width;x++){const start=Math.floor(x/canvas.width*frames),end=Math.floor((x+1)/canvas.width*frames);for(let i=start;i<end;i+=Math.max(1,Math.floor((end-start)/24)))values[x]=Math.max(values[x],Math.abs(data.getInt16(44+i*asset.channels*2,true)/32768));}peaks.set(cue.asset,values);}
    const mid=canvas.height/2;ctx.strokeStyle='#d4d4d8';ctx.lineWidth=1;for(let x=0;x<canvas.width;x++){ctx.beginPath();ctx.moveTo(x,mid-values[x]*mid*.9);ctx.lineTo(x,mid+values[x]*mid*.9);ctx.stroke();}
    ctx.fillStyle='rgba(244,244,245,.08)';ctx.fillRect(cue.offset/asset.duration*canvas.width,0,Math.min(1,cue.duration*cue.speed/asset.duration)*canvas.width,canvas.height);
  }

  // ---- Music ----
  function renderMusic(){
    const audio=project().audio;
    const composedOption=select('music').querySelector<HTMLOptionElement>('option[value="generated"]');
    if(audio.music.track==='generated'){const label=`✦ Composed: ${(audio.music.prompt??'').slice(0,50)}`;if(composedOption)composedOption.textContent=label;else{const none=select('music').querySelector('option[value="none"]');select('music').insertBefore(new Option(label,'generated'),none?.nextSibling??null);}}else composedOption?.remove();
    select('music').value=audio.music.track;const track=MUSIC_TRACKS.find(t=>t.id===audio.music.track);$('sound-music-credit').textContent=audio.music.track==='generated'?(audio.music.asset?'Composed with ElevenLabs for this film.':'Not composed yet: press Compose below, or Voice all lines in Assist.'):track?.artist?`${track.artist} · ${Math.floor(track.duration/60)}:${Math.floor(track.duration%60).toString().padStart(2,'0')}`:'';
    renderCompose();
    input('music-window').checked=audio.music.duration!==undefined||audio.music.start!==undefined;$('sound-music-timing').hidden=!input('music-window').checked;
    input('music-start').value=String(audio.music.start??0);input('music-duration').value=String(audio.music.duration??Math.max(.1,durationOf(project())-(audio.music.start??0)));
    input('music-volume').value=String(Math.round(audio.music.volume*100));input('ducking').checked=audio.music.ducking;input('muted').checked=audio.muted;input('fade-in').value=String(audio.music.fadeIn);input('fade-out').value=String(audio.music.fadeOut);
  }

  // ---- Composing music with ElevenLabs ----
  let composed:AudioAsset|undefined,composing:AbortController|undefined,composeWait:Thinking|undefined;
  function renderCompose(){const on=canGenerate();$('sound-compose-off').hidden=on;$('sound-compose-on').hidden=!on;button('compose-play').hidden=!composed;button('compose-use').hidden=!composed;button('compose-go').textContent=composing?'Stop':composed?'Compose again':'Compose';}
  button('compose-keys').addEventListener('click',()=>openKeys({focus:'voice',then:renderCompose}));
  button('compose-go').addEventListener('click',async()=>{
    if(composing){composing.abort();return;}
    const prompt=$<HTMLTextAreaElement>('sound-compose-prompt').value.trim();if(!prompt){$('sound-compose-prompt').focus();status('Describe the music first.');return;}
    stopPreview();composing=new AbortController();composed=undefined;renderCompose();status('');
    const seconds=Math.max(3,Math.min(60,durationOf(project())));
    composeWait=thinking('music',$('sound-compose-wait'),{patience:'Music can take a minute or two. You can keep working in Studio.'});composeWait.phase('writing',`Composing ${Math.round(seconds)} s of music`);
    try{composed=await composeMusic(prompt,{seconds,instrumental:input('compose-instrumental').checked},composing.signal);status(`Composed ${composed.duration.toFixed(0)} s of music. Play it, then use it as the background music.`);void playComposed();}
    catch(error){status((error as Error).message);}
    finally{composeWait?.stop();composeWait=undefined;composing=undefined;renderCompose();}
  });
  async function playComposed(){
    if(!composed)return;if(preview.active){stopPreview();return;}
    const p=structuredClone(project());p.audio.speech=[];p.audio.effects=[];p.audio.muted=false;p.audio.music={...p.audio.music,track:'generated',prompt:composed.name,asset:composed.id,start:0,duration:composed.duration};
    button('compose-play').textContent='■ Stop';try{await preview.play(p,0,()=>{button('compose-play').textContent='▶ Play';},composed.duration);}catch(error){status((error as Error).message);button('compose-play').textContent='▶ Play';}
  }
  button('compose-play').addEventListener('click',()=>void playComposed());
  button('compose-use').addEventListener('click',async()=>{
    if(!composed)return;const prompt=$<HTMLTextAreaElement>('sound-compose-prompt').value.trim()||composed.name;
    await musicEdit(p=>{p.audio.music={...p.audio.music,track:'generated',prompt:prompt.slice(0,400),instrumental:input('compose-instrumental').checked,asset:composed!.id};delete p.audio.music.start;delete p.audio.music.duration;});
    status('Your composed music is the film’s background music.');
  });
  onKeysChange(()=>{if(dialog.open)renderCompose();});

  // ---- Tabs, opening and closing ----
  function stopPreview(){effects.stop();preview.stop();field('preview').textContent='▶ Play line';button('music-preview').textContent='▶ Play music';}
  function setTab(tab:Tab){
    stopPreview();activeTab=tab;
    for(const item of TABS){$(`sound-${item}-panel`).hidden=item!==tab;button('tab-'+item).setAttribute('aria-selected',String(item===tab));button('tab-'+item).tabIndex=item===tab?0:-1;}
  }
  function open(id?:string,focusTake=false){
    if(!editor.canEdit())return;editor.pause();stopPreview();setTab('dialogue');
    if(id){selected=id;open_=true;}
    lastTyped='';render();void loadVoices();if(!dialog.open)dialog.showModal();
    if(focusTake){const cue=current();(cue&&cue.source==='tts'&&!cue.asset&&pending().length>1?button('generate-all'):cue?field<HTMLButtonElement>('generate'):button('add')).focus();}
    else dialog.scrollTop=0;
    if(id)lines.querySelector(`[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({block:'nearest'});
  }
  function openEffects(id?:string){if(!editor.canEdit()||busy||recording?.state==='recording')return;open();if(id)effects.select(id);setTab('effects');$<HTMLElement>(id?'fx-start':'fx-library').focus();}
  for(const tab of TABS)button('tab-'+tab).addEventListener('click',()=>setTab(tab));
  dialog.querySelector('[role="tablist"]')!.addEventListener('keydown',event=>{
    const e=event as KeyboardEvent;if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();
    const i=TABS.indexOf(activeTab),tab=e.key==='Home'?TABS[0]:e.key==='End'?TABS[TABS.length-1]:TABS[(i+(e.key==='ArrowRight'?1:TABS.length-1))%TABS.length];setTab(tab);button('tab-'+tab).focus();
  });
  $('open-effects').addEventListener('click',()=>openEffects());
  $('open-sound').addEventListener('click',()=>open());button('close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('cancel',event=>{if(busy){event.preventDefault();controller?.abort();}else if(recording?.state==='recording'){event.preventDefault();stopRecording(true);}});
  dialog.addEventListener('close',()=>{stopPreview();stopRecording(true);recordToken++;controller?.abort();releaseSpeechEngine();});
  for(const id of VOICE_EFFECTS)field<HTMLSelectElement>('effect').append(new Option(EFFECT_LABELS[id],id));
  select('music').append(new Option('No music','none'));for(const category of new Set(MUSIC_TRACKS.filter(t=>t.file).map(t=>t.category))){const group=document.createElement('optgroup');group.label=category;for(const track of MUSIC_TRACKS.filter(t=>t.category===category))group.append(new Option(`${track.name} · ${track.artist}`,track.id));select('music').append(group);}
  button('keys').addEventListener('click',()=>openKeys({focus:'voice',then:()=>void loadVoices()}));
  onKeysChange(()=>{if(dialog.open)void loadVoices();});

  // ---- The cast ----
  cast.addEventListener('change',async e=>{
    const pick=(e.target as HTMLElement).closest<HTMLSelectElement>('select[data-speaker]');if(!pick)return;
    const actor=pick.dataset.speaker!,voice=pick.value;
    if(voice==='__keys'){pick.value=speakerVoice(actor);openKeys({focus:'voice',then:()=>void loadVoices()});return;}
    stopPreview();chosenVoice.set(actor,voice);
    // Every typed line of theirs takes the new voice and needs voicing again; recordings and files stay.
    await commit(p=>{for(const c of p.audio.speech)if(c.actor===actor&&c.source==='tts'&&c.voice!==voice){c.voice=voice;c.asset=undefined;if(!supportsDelivery(voice))delete c.delivery;}});
    for(const c of project().audio.speech)if(c.actor===actor)failed.delete(c.id);
    editor.changed();render();
  });
  cast.addEventListener('click',async e=>{
    const b=(e.target as HTMLElement).closest<HTMLButtonElement>('[data-sample]');if(!b)return;
    const actor=b.dataset.sample!,voice=speakerVoice(actor),name=speakerName(actor);
    stopPreview();b.textContent='…';b.disabled=true;
    try{await playVoiceSample(voice,`Hi, I'm ${name==='Narrator'?'the narrator':name}. This is how I sound.`,m=>status(m));status('');}
    catch(error){status((error as Error).message);}
    finally{b.textContent='▶';b.disabled=false;}
  });

  // ---- The script ----
  lines.addEventListener('click',e=>{
    const head=(e.target as HTMLElement).closest<HTMLButtonElement>('[data-line]');if(!head)return;
    stopPreview();const id=head.dataset.line!;
    if(selected===id&&open_){open_=false;}else{selected=id;open_=true;}
    lastTyped='';render();
    if(open_)body.focus();
  });
  const newLine=(actor:string,start:number):SpeechCue=>({source:'tts',id:beatId(),name:'Line',actor,text:'',voice:speakerVoice(actor),start,duration:Math.min(3,60-start),offset:0,speed:1,volume:1,pan:0,effect:'natural'});
  button('add').addEventListener('click',async()=>{
    const actor=editor.actor()?speechActor(editor.actor()!):(current()?.actor??'narrator'),start=Math.min(editor.time(),59.9),cue=newLine(actor,start);
    if(await commit(p=>{if(p.audio.speech.length<MAX_SPEECH)p.audio.speech.push(cue);})){selected=cue.id;open_=true;editor.changed();render();body.focus();}
  });
  body.addEventListener('input',()=>{
    const cue=current();if(!cue)return;stopPreview();
    const now=performance.now(),remember=lastTyped!==selected||now-lastTyping>750;lastTyping=now;lastTyped=selected;
    const name=body.value.trim().split(/\s+/).slice(0,5).join(' ')||'Line';
    void update({text:body.value,...(cue.name==='Line'||cue.name===cue.text.trim().split(/\s+/).slice(0,5).join(' ')?{name}:{}),...(cue.source==='tts'?{asset:undefined}:{})},remember);
  });
  field('delivery-presets').addEventListener('click',e=>{
    const b=(e.target as HTMLElement).closest<HTMLButtonElement>('.sound-preset');if(!b)return;
    // Tapping the chosen preset again clears it.
    const value=b.getAttribute('aria-pressed')==='true'?undefined:b.dataset.value;field<HTMLInputElement>('delivery').value=value??'';
    void update({delivery:value,...(current()?.source==='tts'?{asset:undefined}:{})});
  });
  field('delivery').addEventListener('change',()=>{const v=field<HTMLInputElement>('delivery').value.trim();void update({delivery:v||undefined,...(current()?.source==='tts'?{asset:undefined}:{})});});
  for(const key of ['name','start','duration','offset','speed','volume','pan']as const)field(key).addEventListener('change',()=>{lastTyped='';stopPreview();void update({[key]:key==='name'?field<HTMLInputElement>(key).value:Number(field<HTMLInputElement>(key).value)/(key==='volume'||key==='pan'?100:1)});});
  field('effect').addEventListener('change',()=>{stopPreview();void update({effect:field<HTMLSelectElement>('effect').value as SpeechCue['effect']});});
  field('actor').addEventListener('change',()=>{
    stopPreview();const cue=current();if(!cue)return;const actor=field<HTMLSelectElement>('actor').value,voice=speakerVoice(actor);
    // A typed line moving to another speaker takes that speaker's voice.
    void update({actor,...(cue.source==='tts'&&cue.voice!==voice?{voice,asset:undefined}:{})});
  });

  // ---- Recordings and files ----
  const attach=async(asset:AudioAsset,source:'file'|'recording',replace=false)=>{
    const cue=current();
    if(replace&&cue){await update({asset:asset.id,source,offset:0,duration:Math.min(asset.duration/cue.speed,60-cue.start)});return;}
    const start=Math.min(editor.time(),59.9),duration=Math.min(asset.duration,60-start);if(duration<.1)throw Error('Move the playhead earlier to add this audio.');
    if(project().audio.speech.length>=MAX_SPEECH)throw Error(`A film can have up to ${MAX_SPEECH} lines.`);
    const id=beatId(),actor=editor.actor()?speechActor(editor.actor()!):'narrator';
    await commit(p=>p.audio.speech.push({source,id,name:source==='recording'?'Recording':asset.name.replace(/\.[a-z0-9]+$/i,'').slice(0,80),actor,text:'',voice:speakerVoice(actor),asset:asset.id,start,duration,offset:0,speed:1,volume:1,pan:0,effect:'natural'}));
    selected=id;open_=true;editor.changed();render();
  };
  let replaceUpload=false;const file=input('file');
  button('upload').addEventListener('click',()=>{replaceUpload=false;file.click();});field('attach').addEventListener('click',()=>{replaceUpload=true;file.click();});
  file.addEventListener('change',async()=>{const chosen=file.files?.[0];if(!chosen||busy)return;busy=true;lock();status('Adding the audio…');try{const asset=await importAudio(chosen,chosen.name);await attach(asset,'file',replaceUpload);status('Audio added. It’s kept in this browser.');}catch(error){status((error as Error).message);}finally{file.value='';busy=false;render();}});
  function stopRecording(discard=false){discardRecording=discard;clearTimeout(recordTimer);clearInterval(recordTick);if(recording?.state==='recording'){if(!discard){busy=true;lock();status('Saving the recording…');}recording.stop();}stream?.getTracks().forEach(t=>t.stop());stream=undefined;button('record').textContent='Record';}
  button('record').addEventListener('click',async()=>{
    if(recording?.state==='recording'){stopRecording();return;}const token=++recordToken;discardRecording=false;
    try{status('Allow the microphone to start recording…');const media=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});if(token!==recordToken||!dialog.open){media.getTracks().forEach(t=>t.stop());return;}stream=media;const chunks:BlobPart[]=[];
      const mime=['audio/webm;codecs=opus','audio/mp4'].find(type=>MediaRecorder.isTypeSupported(type));recording=new MediaRecorder(media,mime?{mimeType:mime}:undefined);const active=recording;
      active.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};active.onerror=()=>{stopRecording(true);status('The recording failed. Try uploading a file instead.');};
      active.onstop=async()=>{clearTimeout(recordTimer);clearInterval(recordTick);media.getTracks().forEach(t=>t.stop());recording=undefined;button('record').textContent='Record';if(discardRecording||token!==recordToken){busy=false;render();return;}busy=true;lock();try{const asset=await importAudio(new Blob(chunks,{type:active.mimeType}),'Recording');await attach(asset,'recording');status('Recording added. Type its words in the line for subtitles.');}catch(error){status((error as Error).message);}finally{busy=false;render();}};
      active.start();render();const began=performance.now();recordTick=window.setInterval(()=>{button('record').textContent=`■ Stop · ${Math.floor((performance.now()-began)/1000)}s`;},250);recordTimer=window.setTimeout(()=>stopRecording(),59000);status('Recording… press Stop when you’ve finished (up to a minute).');
    }catch(error){stopRecording(true);status(`The microphone isn’t available: ${(error as Error).message}`);}
  });

  // ---- Voicing ----
  async function generate(ids:string[]){
    const cues=project().audio.speech.filter(c=>ids.includes(c.id)&&c.text.trim());if(!cues.length){status('Type the words first.');return;}
    stopPreview();busy=true;controller=new AbortController();const signal=controller.signal;
    for(const c of cues){working.add(c.id);failed.delete(c.id);}render();
    let done=0,problem='';
    try{
      for(const c of cues){
        status(cues.length>1?`Voicing line ${done+1} of ${cues.length} · ${speakerName(c.actor)}…`:`Voicing ${speakerName(c.actor)}’s line…`);
        try{
          const asset=await generateSpeech(c.text,c.voice,m=>status(cues.length>1?`Line ${done+1} of ${cues.length} · ${m}`:m),signal,c.delivery);
          const duration=Math.max(.1,asset.duration/c.speed);
          if(c.start+duration>60+1e-6)throw Error(`This line lasts ${duration.toFixed(1)} s and runs past the 60-second limit. Start it earlier or shorten it.`);
          await commit(p=>{const cue=p.audio.speech.find(cue=>cue.id===c.id);if(cue&&cue.text===c.text&&cue.voice===c.voice)Object.assign(cue,{source:'tts',asset:asset.id,offset:0,duration});});
          editor.changed();done++;
        }catch(error){
          if(signal.aborted)throw error;
          const text=(error as Error).message;failed.set(c.id,text);problem=text;
          // A problem with the key or the allowance stops the rest; one bad line doesn't.
          if(/key|allowance|credit|quota|limit|connect/i.test(text))break;
        }finally{working.delete(c.id);render();}
      }
      status(problem?(done?`Voiced ${done} of ${cues.length}. ${problem}`:problem):cues.length>1?`Voiced ${done} lines. They’re kept in this browser.`:'Line voiced.');
    }catch(error){status(signal.aborted?`Stopped. ${done?`${done} line${done===1?' was':'s were'} voiced and kept.`:''}`:(error as Error).message);}
    finally{for(const c of cues)working.delete(c.id);controller=undefined;busy=false;render();}
  }
  field('generate').addEventListener('click',()=>{const cue=current();if(!cue)return;if(cue.source!=='tts')void update({source:'tts',asset:undefined}).then(()=>generate([cue.id]));else void generate([cue.id]);});
  button('generate-all').addEventListener('click',()=>void generate(pending().map(c=>c.id)));
  button('cancel').addEventListener('click',()=>controller?.abort());
  field('fit').addEventListener('click',async()=>{const cue=current();if(!cue?.asset)return;try{const asset=await getAsset(cue.asset);if(!asset)throw Error('This line’s audio isn’t in this browser.');const duration=(asset.duration-cue.offset)/cue.speed;if(duration<.1||cue.start+duration>60)throw Error('The audio doesn’t fit here. Start it earlier or trim it.');await update({duration});}catch(error){status((error as Error).message);}});
  field('delete').addEventListener('click',async()=>{stopPreview();const id=selected;await commit(p=>{p.audio.speech=p.audio.speech.filter(c=>c.id!==id);});failed.delete(id);open_=false;editor.changed();render();});
  field('preview').addEventListener('click',async()=>{
    if(preview.active){stopPreview();return;}const cue=current();if(!cue)return;
    try{const p=structuredClone(project());p.audio.speech=[cue];p.audio.effects=[];p.audio.music.track='none';p.audio.muted=false;field('preview').textContent='…';const started=await preview.play(p,cue.start,()=>{field('preview').textContent='▶ Play line';},cue.duration);field('preview').textContent=started?'■ Stop':'▶ Play line';}
    catch(error){stopPreview();status((error as Error).message);}
  });

  // ---- Music controls ----
  const musicEdit=async(fn:(p:StudioProject)=>void)=>{stopPreview();await commit(fn);editor.changed();render();};
  input('music-window').addEventListener('change',()=>void musicEdit(p=>{if(input('music-window').checked){p.audio.music.start=0;p.audio.music.duration=durationOf(p);}else{delete p.audio.music.start;delete p.audio.music.duration;}}));
  for(const key of ['start','duration']as const)input(`music-${key}`).addEventListener('change',()=>void musicEdit(p=>p.audio.music[key]=Number(input(`music-${key}`).value)));
  select('music').addEventListener('change',()=>void musicEdit(p=>{const track=select('music').value as typeof p.audio.music.track;if(track==='generated')return;p.audio.music.track=track;delete p.audio.music.prompt;delete p.audio.music.asset;delete p.audio.music.instrumental;}));input('music-volume').addEventListener('change',()=>void musicEdit(p=>p.audio.music.volume=Number(input('music-volume').value)/100));input('ducking').addEventListener('change',()=>void musicEdit(p=>p.audio.music.ducking=input('ducking').checked));input('muted').addEventListener('change',()=>void musicEdit(p=>p.audio.muted=input('muted').checked));
  for(const [id,key]of [['fade-in','fadeIn'],['fade-out','fadeOut']]as const)input(id).addEventListener('change',()=>void musicEdit(p=>p.audio.music[key]=Number(input(id).value)));
  button('music-preview').addEventListener('click',async()=>{if(preview.active){stopPreview();return;}try{const p=structuredClone(project());p.audio.speech=[];p.audio.effects=[];p.audio.muted=false;if(p.audio.music.track==='none')throw Error('Choose a track first.');button('music-preview').textContent='…';await preview.play(p,p.audio.music.start??0,()=>{button('music-preview').textContent='▶ Play music';},p.audio.music.duration);button('music-preview').textContent='■ Stop';}catch(error){stopPreview();status((error as Error).message);}});button('stop').addEventListener('click',stopPreview);
  button('wav').addEventListener('click',async()=>{busy=true;lock();try{status('Mixing the soundtrack…');const buffer=await renderSoundtrack(project());if(!buffer)throw Error('There’s no sound to save. Add some and unmute the film.');editor.download(wavBlob(Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i)),buffer.sampleRate),'ara-soundtrack.wav');status('Soundtrack saved.');}catch(error){status((error as Error).message);}finally{busy=false;render();}});
  button('bundle').addEventListener('click',async()=>{busy=true;lock();try{editor.download(await audioProjectBundle(project()),'ara-film.ara-studio.zip');status('Film saved with its audio.');}catch(error){status((error as Error).message);}finally{busy=false;render();}});
  window.addEventListener('pagehide',()=>{stopPreview();stopRecording(true);controller?.abort();releaseSpeechEngine();});

  return{render,open,openEffects,tab:()=>activeTab,selected:()=>selected,selectedEffect:effects.selected,
    restore:(state:{tab?:Tab;selectedEffect?:string})=>{if(state.selectedEffect)effects.select(state.selectedEffect);setTab(TABS.includes(state.tab as Tab)?state.tab as Tab:'dialogue');},
    select:(id:string)=>{selected=id;open_=!!id;render();},stop:stopPreview,isBusy:()=>busy||recording?.state==='recording'};
}
