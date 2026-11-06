import { beatId, parseProject, type StudioProject } from '../project';
import { decodeCharacter } from '../../app/share';
import { SOUND_EFFECTS, soundEffectById } from './effects-catalog';
import { MAX_SOUND_EFFECTS, type SoundEffectCue } from './schema';
import { AudioPlayback } from './mix';
interface EffectsEditor{
 project():StudioProject;time():number;actor():string|undefined;canEdit():boolean;pause():void;
 edit(fn:(project:StudioProject)=>void,remember?:boolean):Promise<boolean>;changed():void;stopOther():void;
}
export function setupEffectsEditor(editor:EffectsEditor){
 const $=<T extends HTMLElement>(id:string)=>document.getElementById('fx-'+id)as T,input=(id:string)=>$<HTMLInputElement>(id),select=(id:string)=>$<HTMLSelectElement>(id),button=(id:string)=>$<HTMLButtonElement>(id);
 const preview=new AudioPlayback();let selected='',previewToken=0;
 const current=()=>editor.project().audio.effects.find(c=>c.id===selected),status=(message:string)=>{$('status').textContent=message;};
 const label=(cue:SoundEffectCue)=>`${cue.start.toFixed(2)}s · ${cue.name}`;
 for(const id of ['library','sound'])for(const category of new Set(SOUND_EFFECTS.map(s=>s.category))){const group=document.createElement('optgroup');group.label=category;for(const effect of SOUND_EFFECTS.filter(s=>s.category===category))group.append(new Option(effect.name,effect.id));select(id).append(group);}
 function describe(){const effect=soundEffectById(select('library').value)!;$('description').textContent=`${effect.description} ${effect.duration.toFixed(2)}s.`;}
 function render(){
  const cues=editor.project().audio.effects;if(!cues.some(c=>c.id===selected))selected=cues[0]?.id??'';
  select('cue').replaceChildren();for(const c of cues)select('cue').append(new Option(label(c),c.id));select('cue').value=selected;
  $('count').textContent=`${cues.length} / ${MAX_SOUND_EFFECTS}`;const cue=current();$('fields').hidden=!cue;$('empty').hidden=!!cue;
  if(cue){for(const key of ['name','start','duration','offset','speed','volume','pan']as const)if(document.activeElement!==input(key))input(key).value=String(key==='name'?cue.name:key==='volume'||key==='pan'?Math.round(cue[key]*100):Number(cue[key].toFixed(4)));select('sound').value=cue.sound;
   select('actor').replaceChildren(new Option('Scene sound',''));for(const [i,a]of editor.project().actors.entries())select('actor').append(new Option(`${i+1} · ${decodeCharacter(a.character,a.detail)?.name||a.id}`,a.id));select('actor').value=cue.actor??'';input('offset').max=String(soundEffectById(cue.sound)!.duration-.001);}
  for(const e of document.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLButtonElement>('#sound-effects-panel input,#sound-effects-panel select,#sound-effects-panel button'))e.disabled=!editor.canEdit();
  button('add').disabled=!editor.canEdit()||cues.length>=MAX_SOUND_EFFECTS;button('duplicate').disabled=!editor.canEdit()||!cue||cues.length>=MAX_SOUND_EFFECTS;describe();
 }
 function stop(){previewToken++;preview.stop();button('preview').textContent='Preview cue';button('audition').textContent='Listen';}
 async function commit(fn:(p:StudioProject)=>void){stop();try{const next=structuredClone(editor.project());fn(next);parseProject(JSON.stringify(next));if(!await editor.edit(fn))return false;editor.changed();status('');render();return true;}catch(error){status((error as Error).message);return false;}}
 async function patch(value:Partial<SoundEffectCue>){await commit(p=>{const cue=p.audio.effects.find(c=>c.id===selected);if(cue)Object.assign(cue,value);});}
 button('add').addEventListener('click',async()=>{const sound=soundEffectById(select('library').value)!,start=Math.min(59.9,editor.time());selected=beatId();if(await commit(p=>p.audio.effects.push({id:selected,name:sound.name,sound:sound.id,...(editor.actor()?{actor:editor.actor()}:{}),start,duration:Math.min(sound.duration,60-start),offset:0,speed:1,volume:1,pan:0})))status('Effect added. Set its start time to match the action.');});
 select('library').addEventListener('change',()=>{stop();describe();});select('cue').addEventListener('change',()=>{stop();selected=select('cue').value;render();});
 for(const key of ['name','start','duration','offset','speed','volume','pan']as const)input(key).addEventListener('change',()=>void patch({[key]:key==='name'?input(key).value:Number(input(key).value)/(key==='volume'||key==='pan'?100:1)}));
 select('actor').addEventListener('change',()=>void patch({actor:select('actor').value||undefined}));
 select('sound').addEventListener('change',()=>{const cue=current(),sound=soundEffectById(select('sound').value)!;if(cue)void patch({sound:sound.id,name:sound.name,offset:0,duration:Math.min(sound.duration/cue.speed,60-cue.start)});});
 button('fit').addEventListener('click',()=>{const cue=current();if(cue)void patch({duration:Math.min((soundEffectById(cue.sound)!.duration-cue.offset)/cue.speed,60-cue.start)});});
 button('delete').addEventListener('click',()=>void commit(p=>{p.audio.effects=p.audio.effects.filter(c=>c.id!==selected);}));
 button('duplicate').addEventListener('click',async()=>{const cue=current();if(!cue)return;const copy={...cue,id:beatId(),start:Math.min(60-cue.duration,cue.start+cue.duration)};if(await commit(p=>p.audio.effects.push(copy))){selected=copy.id;render();}});
 async function play(audition=false){
  if(preview.active){stop();return;}editor.pause();editor.stopOther();const token=++previewToken,sound=soundEffectById(select('library').value)!,cue=audition?{id:'audition',name:sound.name,sound:sound.id,start:0,duration:sound.duration,offset:0,speed:1,volume:1,pan:0}:current();if(!cue)return;
  const project=structuredClone(editor.project());project.audio.speech=[];project.audio.music.track='none';project.audio.effects=[{...cue,start:0}];project.audio.muted=false;project.texts=[];project.shots=[{id:'audition',shot:'wide',target:'all',duration:.1}];for(const actor of project.actors)actor.beats=[{id:'audition',clip:'idle',duration:.1,move:false}];
  const target=button(audition?'audition':'preview');target.textContent='Preparing…';try{const started=await preview.play(project,0,()=>{if(token===previewToken)stop();},cue.duration);if(token===previewToken)target.textContent=started?'Stop preview':audition?'Listen':'Preview cue';}catch(error){if(token===previewToken){stop();status((error as Error).message);}}
 }
 button('preview').addEventListener('click',()=>void play());button('audition').addEventListener('click',()=>void play(true));
 return{render,stop,select:(id:string)=>{selected=id;render();},selected:()=>selected};
}
