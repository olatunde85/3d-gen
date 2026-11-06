import { durationOf, parseProject, beatId, type StudioProject } from '../project';
import { MAX_SPEECH, MUSIC_TRACKS, VOICE_EFFECTS, EFFECT_LABELS, STUDIO_VOICES, VOICE_LABELS, speechActor, type SpeechCue } from './schema';
import { getAsset, importAudio, wavBlob, type AudioAsset } from './assets';
import { AudioPlayback, renderSoundtrack } from './mix';
import { generateSpeech, deviceVoices, previewDeviceSpeech, stopDeviceSpeech, releaseSpeechEngine } from './tts';
import { setupEffectsEditor } from './effects-ui';
import { audioProjectBundle } from './bundle';
interface SoundEditor {
  project():StudioProject;time():number;actor():string|undefined;pause():void;canEdit():boolean;
  edit(fn:(project:StudioProject)=>void,remember?:boolean):Promise<boolean>;
  download(blob:Blob,name:string):void;changed():void;
}
export function setupSoundEditor(editor:SoundEditor){
  const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T,input=(id:string)=>$<HTMLInputElement>('sound-'+id),select=(id:string)=>$<HTMLSelectElement>('sound-'+id),button=(id:string)=>$<HTMLButtonElement>('sound-'+id);
  const dialog=$<HTMLDialogElement>('sound-dialog'),body=$<HTMLTextAreaElement>('sound-script'),picker=select('cue'),message=$('sound-message'),preview=new AudioPlayback();
  let activeTab:'dialogue'|'effects'='dialogue';
  let preferredDeviceVoice='',readyAsset='';const peaks=new Map<string,Float32Array>();
  let selected='',busy=false,controller:AbortController|undefined,lastTyped='',lastTyping=0,recording:MediaRecorder|undefined,stream:MediaStream|undefined,recordTimer=0,recordTick=0,recordToken=0,discardRecording=false,waveToken=0;
  const effects=setupEffectsEditor({...editor,canEdit:()=>editor.canEdit()&&!busy&&recording?.state!=='recording',stopOther:()=>stopPreview()});
  const current=()=>editor.project().audio.speech.find(c=>c.id===selected);
  const status=(text:string)=>{message.textContent=text;};
  async function commit(fn:(p:StudioProject)=>void,remember=true){const p=structuredClone(editor.project());fn(p);try{parseProject(JSON.stringify(p));return await editor.edit(fn,remember);}catch(error){status((error as Error).message);return false;}}
  const lock=()=>{for(const e of dialog.querySelectorAll<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement|HTMLButtonElement>('input,textarea,select,button'))e.disabled=busy||recording?.state==='recording';button('cancel').hidden=!controller;button('cancel').disabled=false;if(recording?.state==='recording'){button('record').disabled=false;button('close').disabled=false;}};
  function voices(){const old=select('device-voice').value||preferredDeviceVoice,available=deviceVoices();select('device-voice').replaceChildren();for(const voice of available)select('device-voice').append(new Option(`${voice.name} · ${voice.lang}${voice.localService?' · on device':' · voice service'}`,voice.voiceURI));if(available.some(v=>v.voiceURI===old))select('device-voice').value=old;else select('device-voice').value=(available.find(v=>v.localService)??available[0])?.voiceURI??'';}
  if(typeof speechSynthesis!=='undefined')speechSynthesis.addEventListener('voiceschanged',voices);select('device-voice').addEventListener('change',()=>preferredDeviceVoice=select('device-voice').value);voices();
  function takeActions(ready:boolean){
    const cue=current(),locked=busy||recording?.state==='recording';
    button('generate').textContent=ready&&cue?.source==='tts'?'Regenerate this clip':'Generate this clip';
    button('generate').disabled=locked||!cue?.text.trim();button('attach').textContent=ready?'Replace audio':'Attach audio';
    button('preview').disabled=locked||!ready;button('fit').disabled=locked||!ready;
  }
  async function waveform(cue:SpeechCue|undefined){
    const token=++waveToken,canvas=$<HTMLCanvasElement>('sound-waveform'),ctx=canvas.getContext('2d')!;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.strokeStyle='#454e5e';ctx.beginPath();ctx.moveTo(0,canvas.height/2);ctx.lineTo(canvas.width,canvas.height/2);ctx.stroke();
    if(!cue?.asset){readyAsset='';return;}const asset=await getAsset(cue.asset).catch(()=>undefined);if(token!==waveToken)return;if(!asset){readyAsset='';takeActions(false);$('sound-asset-status').textContent='Attach this recording again, or generate a new voice from the script.';return;}readyAsset=cue.asset;takeActions(true);$('sound-asset-status').textContent='Voice ready · included in playback and export.';
    let values=peaks.get(cue.asset);if(!values){const data=new DataView(await asset.blob.arrayBuffer());if(token!==waveToken)return;const frames=(data.byteLength-44)/(2*asset.channels);values=new Float32Array(canvas.width);
      for(let x=0;x<canvas.width;x++){const start=Math.floor(x/canvas.width*frames),end=Math.floor((x+1)/canvas.width*frames);for(let i=start;i<end;i+=Math.max(1,Math.floor((end-start)/24)))values[x]=Math.max(values[x],Math.abs(data.getInt16(44+i*asset.channels*2,true)/32768));}peaks.set(cue.asset,values);}
    const mid=canvas.height/2;ctx.strokeStyle='#dcb884';ctx.lineWidth=1;for(let x=0;x<canvas.width;x++){ctx.beginPath();ctx.moveTo(x,mid-values[x]*mid*.9);ctx.lineTo(x,mid+values[x]*mid*.9);ctx.stroke();}
    ctx.fillStyle='rgba(224,183,133,.13)';ctx.fillRect(cue.offset/asset.duration*canvas.width,0,Math.min(1,cue.duration*cue.speed/asset.duration)*canvas.width,canvas.height);
  }
  function render(){
    const audio=editor.project().audio;if(!audio.speech.some(c=>c.id===selected))selected=audio.speech[0]?.id??'';
    picker.replaceChildren();for(const c of audio.speech)picker.append(new Option(`${c.start.toFixed(1)}s · ${c.name}${!c.asset?' · needs audio':''}`,c.id));picker.value=selected;
    const cue=current();$('sound-fields').hidden=!cue;$('sound-empty').hidden=!!cue;$('sound-count').textContent=`${audio.speech.length} / ${MAX_SPEECH}`;
    select('music').value=audio.music.track;const track=MUSIC_TRACKS.find(t=>t.id===audio.music.track);$('sound-music-credit').textContent=track?.artist?`${track.artist} · ${Math.floor(track.duration/60)}:${Math.floor(track.duration%60).toString().padStart(2,'0')}`:'';input('music-window').checked=audio.music.duration!==undefined||audio.music.start!==undefined;$('sound-music-timing').hidden=!input('music-window').checked;input('music-start').value=String(audio.music.start??0);input('music-duration').value=String(audio.music.duration??Math.max(.1,durationOf(editor.project())-(audio.music.start??0)));input('music-volume').value=String(Math.round(audio.music.volume*100));input('ducking').checked=audio.music.ducking;input('muted').checked=audio.muted;input('fade-in').value=String(audio.music.fadeIn);input('fade-out').value=String(audio.music.fadeOut);
    if(cue){
      if(document.activeElement!==body)body.value=cue.text;
      for(const key of ['name','start','duration','offset','speed','volume','pan']as const)if(document.activeElement!==input(key))input(key).value=String(key==='volume'||key==='pan'?Math.round(cue[key]*100):cue[key]);
      select('effect').value=cue.effect;select('voice').value=cue.voice;select('actor').replaceChildren(new Option('Narrator','narrator'));editor.project().actors.forEach((a,i)=>select('actor').append(new Option(`Character ${i+1}`,speechActor(a.id))));select('actor').value=cue.actor;
      $('sound-asset-status').textContent=cue.asset?'Checking the audio library…':'Generate a voice from this script, or attach your own audio.';
    }
    lock();takeActions(!!cue?.asset&&cue.asset===readyAsset);const pending=audio.speech.filter(c=>!c.asset&&c.text.trim()).length;button('generate-all').disabled=busy||recording?.state==='recording'||!pending;button('generate-all').textContent=pending?`Generate all speech (${pending})`:'Generate all speech';$('sound-generation-summary').textContent=pending?`${pending} ${pending===1?'line is':'lines are'} ready for a voice. Existing audio will be kept.`:audio.speech.length?'All scripted lines have audio.':'Add dialogue or import a film to generate its voices.';button('add').disabled=busy||recording?.state==='recording'||audio.speech.length>=MAX_SPEECH;button('record').disabled=busy||!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined';effects.render();void waveform(cue);
  }
  async function update(patch:Partial<SpeechCue>,remember=true){if(!current())return;await commit(p=>{const c=p.audio.speech.find(c=>c.id===selected);if(c)Object.assign(c,patch);},remember);editor.changed();render();}
  function stopPreview(){effects.stop();preview.stop();stopDeviceSpeech();button('preview').textContent='Preview voice';}
  function open(id?:string,focusTake=false){if(!editor.canEdit())return;editor.pause();stopPreview();setTab('dialogue');if(id)selected=id;lastTyped='';render();voices();if(!dialog.open)dialog.showModal();if(focusTake)button(current()?.text.trim()?'generate-all':'attach').focus();else dialog.scrollTop=0;}
  function setTab(tab:'dialogue'|'effects'){
    stopPreview();activeTab=tab;$('sound-dialogue-panel').hidden=tab!=='dialogue';$('sound-effects-panel').hidden=tab!=='effects';
    for(const item of ['dialogue','effects']as const){button('tab-'+item).setAttribute('aria-selected',String(item===tab));button('tab-'+item).tabIndex=item===tab?0:-1;}
  }
  function openEffects(id?:string){if(!editor.canEdit()||busy||recording?.state==='recording')return;open();if(id)effects.select(id);setTab('effects');$<HTMLElement>(id?'fx-start':'fx-library').focus();}
  for(const tab of ['dialogue','effects']as const)button('tab-'+tab).addEventListener('click',()=>setTab(tab));
  dialog.querySelector('[role="tablist"]')!.addEventListener('keydown',event=>{const e=event as KeyboardEvent;if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const tab=e.key==='Home'?'dialogue':e.key==='End'?'effects':activeTab==='dialogue'?'effects':'dialogue';setTab(tab);button('tab-'+tab).focus();});
  $('open-effects').addEventListener('click',()=>openEffects());
  $('open-sound').addEventListener('click',()=>open());button('close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('cancel',event=>{if(busy){event.preventDefault();controller?.abort();}else if(recording?.state==='recording'){event.preventDefault();stopRecording(true);}});
  dialog.addEventListener('close',()=>{stopPreview();stopRecording(true);recordToken++;controller?.abort();releaseSpeechEngine();});
  for(const id of VOICE_EFFECTS)select('effect').append(new Option(EFFECT_LABELS[id],id));for(const id of STUDIO_VOICES)select('voice').append(new Option(VOICE_LABELS[id],id));select('music').append(new Option('No music','none'));for(const category of new Set(MUSIC_TRACKS.filter(t=>t.file).map(t=>t.category))){const group=document.createElement('optgroup');group.label=category;for(const track of MUSIC_TRACKS.filter(t=>t.category===category))group.append(new Option(`${track.name} · ${track.artist}`,track.id));select('music').append(group);}
  picker.addEventListener('change',()=>{stopPreview();selected=picker.value;lastTyped='';render();});
  button('add').addEventListener('click',async()=>{selected=beatId();const start=Math.min(editor.time(),59.9);await commit(p=>{if(p.audio.speech.length<MAX_SPEECH)p.audio.speech.push({source:'tts',id:selected,name:'Dialogue',actor:editor.actor()?speechActor(editor.actor()!):'narrator',text:'Hello from Ara Studio.',voice:'F1',start,duration:Math.min(3,60-start),offset:0,speed:1,volume:1,pan:0,effect:'natural'});});editor.changed();render();});
  body.addEventListener('input',()=>{const cue=current();if(!cue)return;stopPreview();const now=performance.now(),remember=lastTyped!==selected||now-lastTyping>750;lastTyping=now;lastTyped=selected;void update({text:body.value,...(cue.source==='tts'?{asset:undefined}:{})},remember);});
  for(const key of ['name','start','duration','offset','speed','volume','pan']as const)input(key).addEventListener('change',()=>{lastTyped='';stopPreview();void update({[key]:key==='name'?input(key).value:Number(input(key).value)/(key==='volume'||key==='pan'?100:1)});});
  for(const key of ['effect','actor','voice']as const)select(key).addEventListener('change',()=>{lastTyped='';stopPreview();void update({[key]:select(key).value,...(key==='voice'&&current()?.source==='tts'?{asset:undefined}:{})});});
  const attach=async(asset:AudioAsset,source:'file'|'recording',replace=false)=>{
    const start=Math.min(editor.time(),59.9),duration=Math.min(asset.duration,60-start);if(duration<.1)throw Error('Move earlier in the film to add this recording.');
    if(replace&&current())await update({asset:asset.id,source,offset:0,duration:Math.min(asset.duration/current()!.speed,60-current()!.start)});
    else{if(editor.project().audio.speech.length>=MAX_SPEECH)throw Error(`Use at most ${MAX_SPEECH} speech clips.`);selected=beatId();await commit(p=>p.audio.speech.push({source,id:selected,name:asset.name,actor:editor.actor()?speechActor(editor.actor()!):'narrator',text:'',voice:'F1',asset:asset.id,start,duration,offset:0,speed:1,volume:1,pan:0,effect:'natural'}));editor.changed();render();}
  };
  let replaceUpload=false;const file=input('file');button('upload').addEventListener('click',()=>{replaceUpload=false;file.click();});button('attach').addEventListener('click',()=>{replaceUpload=true;file.click();});
  file.addEventListener('change',async()=>{const chosen=file.files?.[0];if(!chosen||busy)return;busy=true;lock();status('Importing audio…');try{const asset=await importAudio(chosen,chosen.name);await attach(asset,'file',replaceUpload);status('Audio saved on this device. Save an audio project bundle to move it to another device.');}catch(error){status((error as Error).message);}finally{file.value='';busy=false;render();}});
  function stopRecording(discard=false){discardRecording=discard;clearTimeout(recordTimer);clearInterval(recordTick);if(recording?.state==='recording'){if(!discard){busy=true;lock();status('Saving recording…');}recording.stop();}stream?.getTracks().forEach(t=>t.stop());stream=undefined;button('record').textContent='Record speech';}
  button('record').addEventListener('click',async()=>{
    if(recording?.state==='recording'){stopRecording();return;}const token=++recordToken;discardRecording=false;
    try{status('Waiting for microphone permission…');const media=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});if(token!==recordToken||!dialog.open){media.getTracks().forEach(t=>t.stop());return;}stream=media;const chunks:BlobPart[]=[];
      const mime=['audio/webm;codecs=opus','audio/mp4'].find(type=>MediaRecorder.isTypeSupported(type));recording=new MediaRecorder(media,mime?{mimeType:mime}:undefined);const active=recording;
      active.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};active.onerror=()=>{stopRecording(true);status('Microphone recording failed. Try uploading audio instead.');};
      active.onstop=async()=>{clearTimeout(recordTimer);clearInterval(recordTick);media.getTracks().forEach(t=>t.stop());recording=undefined;button('record').textContent='Record speech';if(discardRecording||token!==recordToken){busy=false;render();return;}busy=true;lock();try{const asset=await importAudio(new Blob(chunks,{type:active.mimeType}),'Microphone recording');await attach(asset,'recording');status('Recording added.');}catch(error){status((error as Error).message);}finally{busy=false;render();}};
      active.start();lock();const began=performance.now();recordTick=window.setInterval(()=>{button('record').textContent=`Stop recording · ${Math.floor((performance.now()-began)/1000)}s`;},250);recordTimer=window.setTimeout(()=>stopRecording(),59000);status('Recording. Click Stop recording when you finish.');
    }catch(error){stopRecording(true);status(`Microphone unavailable: ${(error as Error).message}`);}
  });
  async function generate(all=false){
    const cues=all?editor.project().audio.speech.filter(c=>!c.asset&&c.text.trim()):current()?[current()!]:[];if(!cues.length){status('Add dialogue text first.');return;}stopPreview();busy=true;controller=new AbortController();lock();
    try{for(const c of cues){if(!c.text.trim())throw Error('Enter the script before generating a new take.');status('Loading the local speech engine…');const asset=await generateSpeech(c.text,c.voice,status,controller.signal);const duration=asset.duration/c.speed;
        if(input('fit-generated').checked&&c.start+duration>60)throw Error(`This take lasts ${duration.toFixed(1)}s and will not fit. Move the clip earlier or shorten the script.`);
        await commit(p=>{const cue=p.audio.speech.find(cue=>cue.id===c.id);if(cue)Object.assign(cue,{source:'tts',asset:asset.id,offset:0,...(input('fit-generated').checked?{duration:Math.max(.1,duration)}:{})});});editor.changed();}
      status('Speech generated and saved on this device.');
    }catch(error){status(controller.signal.aborted?'Speech generation cancelled.':(error as Error).message);}finally{controller=undefined;busy=false;render();}
  }
  button('generate').addEventListener('click',()=>void generate());button('generate-all').addEventListener('click',()=>void generate(true));button('cancel').addEventListener('click',()=>controller?.abort());
  button('device-read').addEventListener('click',()=>{const cue=current();if(!cue?.text.trim()){status('Enter a script for the device read-through.');return;}stopPreview();try{previewDeviceSpeech(cue.text,select('device-voice').value,Number(input('device-rate').value),Number(input('device-pitch').value),cue.volume);status('Device read-through: rate/pitch only. Use generated or uploaded audio for effects and MP4 export.');}catch(error){status((error as Error).message);}});button('device-stop').addEventListener('click',stopDeviceSpeech);
  button('fit').addEventListener('click',async()=>{const cue=current();if(!cue?.asset)return;try{const asset=await getAsset(cue.asset);if(!asset)throw Error('Reattach this recording first.');const duration=(asset.duration-cue.offset)/cue.speed;if(duration<.1||cue.start+duration>60)throw Error('The audio does not fit here. Adjust its start or trim.');await update({duration});}catch(error){status((error as Error).message);}});
  button('delete').addEventListener('click',async()=>{stopPreview();await commit(p=>{p.audio.speech=p.audio.speech.filter(c=>c.id!==selected);});editor.changed();render();});
  button('preview').addEventListener('click',async()=>{if(preview.active){stopPreview();return;}const cue=current();if(!cue)return;try{stopDeviceSpeech();const p=structuredClone(editor.project());p.audio.speech=[cue];p.audio.effects=[];p.audio.music.track='none';p.audio.muted=false;button('preview').textContent='Preparing…';const started=await preview.play(p,cue.start,()=>{button('preview').textContent='Preview voice';},cue.duration);button('preview').textContent=started?'Stop preview':'Preview voice';}catch(error){stopPreview();status((error as Error).message);}});
  const musicEdit=async(fn:(p:StudioProject)=>void)=>{stopPreview();await commit(fn);editor.changed();render();};
  input('music-window').addEventListener('change',()=>void musicEdit(p=>{if(input('music-window').checked){p.audio.music.start=0;p.audio.music.duration=durationOf(p);}else{delete p.audio.music.start;delete p.audio.music.duration;}}));
  for(const key of ['start','duration']as const)input(`music-${key}`).addEventListener('change',()=>void musicEdit(p=>p.audio.music[key]=Number(input(`music-${key}`).value)));
  select('music').addEventListener('change',()=>void musicEdit(p=>p.audio.music.track=select('music').value as typeof p.audio.music.track));input('music-volume').addEventListener('change',()=>void musicEdit(p=>p.audio.music.volume=Number(input('music-volume').value)/100));input('ducking').addEventListener('change',()=>void musicEdit(p=>p.audio.music.ducking=input('ducking').checked));input('muted').addEventListener('change',()=>void musicEdit(p=>p.audio.muted=input('muted').checked));
  for(const [id,key]of [['fade-in','fadeIn'],['fade-out','fadeOut']]as const)input(id).addEventListener('change',()=>void musicEdit(p=>p.audio.music[key]=Number(input(id).value)));
  button('music-preview').addEventListener('click',async()=>{if(preview.active){stopPreview();return;}try{const p=structuredClone(editor.project());p.audio.speech=[];p.audio.effects=[];p.audio.muted=false;await preview.play(p,p.audio.music.start??0,()=>{},p.audio.music.duration);status('Playing the music bed. Use Stop to stop the preview.');}catch(error){status((error as Error).message);}});button('stop').addEventListener('click',stopPreview);
  button('wav').addEventListener('click',async()=>{busy=true;lock();try{status('Rendering soundtrack…');const buffer=await renderSoundtrack(editor.project());if(!buffer)throw Error('Add audio and unmute the film first.');editor.download(wavBlob(Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i)),buffer.sampleRate),'ara-soundtrack.wav');status('Soundtrack saved.');}catch(error){status((error as Error).message);}finally{busy=false;render();}});
  button('bundle').addEventListener('click',async()=>{busy=true;lock();try{editor.download(await audioProjectBundle(editor.project()),'ara-film.ara-studio.zip');status('Project and recordings saved together.');}catch(error){status((error as Error).message);}finally{busy=false;render();}});
  window.addEventListener('pagehide',()=>{stopPreview();stopRecording(true);controller?.abort();releaseSpeechEngine();});
  return{render,open,openEffects,tab:()=>activeTab,selectedEffect:effects.selected,deviceVoice:()=>select('device-voice').value||preferredDeviceVoice,restore:(state:{deviceVoice:string;rate:number;pitch:number;fit:boolean;tab?:'dialogue'|'effects';selectedEffect?:string})=>{if(state.selectedEffect)effects.select(state.selectedEffect);setTab(state.tab==='effects'?'effects':'dialogue');preferredDeviceVoice=state.deviceVoice;voices();input('device-rate').value=String(state.rate);input('device-pitch').value=String(state.pitch);input('fit-generated').checked=state.fit;},select:(id:string)=>{selected=id;render();},stop:stopPreview,isBusy:()=>busy||recording?.state==='recording'};
}
