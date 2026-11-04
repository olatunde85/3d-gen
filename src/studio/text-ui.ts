import { MAX_TEXT_CUES, TEXT_STYLES, TEXT_LABELS, textActorAnchor, parseSubtitles, subtitlesToSrt, type TextCue } from './text';
import { beatId, durationOf, parseProject, type StudioProject } from './project';
interface TextEditor {
  project():StudioProject; time():number; actor():string|undefined; canEdit():boolean;
  edit(fn:(project:StudioProject)=>void,remember?:boolean):Promise<boolean>;
  seek(time:number):void; download(blob:Blob,name:string):void;
}
export function setupTextEditor(editor:TextEditor){
  const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
  const dialog=$<HTMLDialogElement>('text-dialog'),picker=$<HTMLSelectElement>('text-cue'),body=$<HTMLTextAreaElement>('text-body');
  const input=(key:string)=>$<HTMLInputElement>('text-'+key),select=(key:string)=>$<HTMLSelectElement>('text-'+key);
  let selected='',lastTyping=0,lastTypedCue='';
  const current=()=>editor.project().texts.find(c=>c.id===selected);
  function render(){
    const cues=editor.project().texts;if(!cues.some(c=>c.id===selected))selected=cues[0]?.id??'';
    picker.replaceChildren();for(const c of cues){const option=new Option(`${c.start.toFixed(1)}s · ${TEXT_LABELS[c.style]} · ${c.text||'Empty text'}`,c.id);picker.append(option);}picker.value=selected;
    const cue=current();$('text-empty').hidden=!!cue;$('text-fields').hidden=!cue;
    for(const id of ['text-add-subtitle','text-add-plain','text-add-bubble'])$<HTMLButtonElement>(id).disabled=cues.length>=MAX_TEXT_CUES;
    $<HTMLButtonElement>('text-srt-export').disabled=!cues.some(c=>c.style==='subtitle');
    $('text-count').textContent=`${cues.length} / ${MAX_TEXT_CUES} cues`;
    if(!cue)return;
    if(document.activeElement!==body)body.value=cue.text;
    for(const key of ['start','duration','size','color','background']as const)if(document.activeElement!==input(key))input(key).value=String(cue[key]);
    input('x').value=String(Math.round(cue.x*10000)/100);input('y').value=String(Math.round(cue.y*10000)/100);
    select('style').value=cue.style;input('background').parentElement!.hidden=cue.style==='text';select('anchor').replaceChildren(new Option('Fixed in the frame','screen'));
    editor.project().actors.forEach((a,i)=>select('anchor').append(new Option(`Follow character ${i+1}`,textActorAnchor(a.id))));select('anchor').value=cue.anchor;
    $('text-x-label').textContent=cue.anchor==='screen'?'Position X %':'Offset X %';$('text-y-label').textContent=cue.anchor==='screen'?'Position Y %':'Offset Y %';
    input('x').min=input('y').min=cue.anchor==='screen'?'0':'-100';
    $('text-position-note').textContent=cue.anchor==='screen'?'Position is relative to the film frame.':'Offset is relative to the animated head. Negative Y places text above it.';
  }
  function open(id?:string){if(!editor.canEdit())return;if(id)selected=id;render();lastTyping=0;if(!dialog.open)dialog.showModal();}
  $('open-text').addEventListener('click',()=>open());$('close-text').addEventListener('click',()=>dialog.close());picker.addEventListener('change',()=>{selected=picker.value;lastTyping=0;render();});
  for(const style of TEXT_STYLES)select('style').append(new Option(TEXT_LABELS[style],style));
  async function add(style:TextCue['style']){
    const start=Math.min(59.9,editor.time()),anchor=style==='speech'?textActorAnchor(editor.actor()??editor.project().actors[0].id):'screen';selected=beatId();lastTyping=0;
    await editor.edit(p=>{if(p.texts.length>=MAX_TEXT_CUES)return;p.texts.push({id:selected,text:style==='subtitle'?'Your subtitle':style==='text'?'Your text':'Hello!',style,anchor,start,duration:Math.min(3,60-start),x:anchor==='screen'?.5:0,y:anchor==='screen'?(style==='subtitle'?.9:.2):-.12,size:style==='text'?36:28,color:style==='subtitle'||style==='text'?'#ffffff':'#141414',background:style==='subtitle'?'#151820':'#ffffff'});});render();
  }
  $('text-add-subtitle').addEventListener('click',()=>void add('subtitle'));$('text-add-plain').addEventListener('click',()=>void add('text'));$('text-add-bubble').addEventListener('click',()=>void add('speech'));
  const update=async(patch:Partial<TextCue>,remember=true)=>{
    const candidate=structuredClone(editor.project()),cue=candidate.texts.find(c=>c.id===selected);if(!cue)return false;Object.assign(cue,patch);
    try{parseProject(JSON.stringify(candidate));$('text-message').textContent='';return await editor.edit(p=>{const c=p.texts.find(c=>c.id===selected);if(c)Object.assign(c,patch);},remember);}
    catch(error){$('text-message').textContent=(error as Error).message;return false;}
  };
  body.addEventListener('input',()=>{const now=performance.now(),remember=lastTypedCue!==selected||now-lastTyping>750;lastTyping=now;lastTypedCue=selected;void update({text:body.value},remember);});
  for(const key of ['start','duration','size','x','y']as const)input(key).addEventListener('change',()=>{lastTyping=0;lastTypedCue='';void update({[key]:Number(input(key).value)/(key==='x'||key==='y'?100:1)});});
  for(const key of ['color','background']as const)input(key).addEventListener('change',()=>{lastTypedCue='';void update({[key]:input(key).value});});
  select('style').addEventListener('change',()=>{lastTypedCue='';const style=select('style').value as TextCue['style'];void update({style,background:style==='subtitle'?'#151820':style==='shout'?'#ffe584':'#ffffff',color:style==='text'||style==='subtitle'?'#ffffff':'#141414'});});
  select('anchor').addEventListener('change',()=>{lastTypedCue='';const anchor=select('anchor').value;void update({anchor,x:anchor==='screen'?.5:0,y:anchor==='screen'?(current()?.style==='subtitle'?.9:.2):-.12});});
  $('text-delete').addEventListener('click',()=>{lastTyping=0;void editor.edit(p=>{p.texts=p.texts.filter(c=>c.id!==selected);});});
  $('text-preview').addEventListener('click',()=>{const cue=current();if(cue){editor.seek(Math.min(durationOf(editor.project()),cue.start+.01));dialog.close();}});
  const file=$<HTMLInputElement>('text-srt-file');$('text-srt-import').addEventListener('click',()=>file.click());
  file.addEventListener('change',async()=>{const chosen=file.files?.[0];if(!chosen)return;try{
    if(chosen.size>100_000)throw Error('Use an SRT file smaller than 100 KB.');const added=parseSubtitles(await chosen.text());
    if(added.length+editor.project().texts.length>MAX_TEXT_CUES)throw Error(`Keep the total under ${MAX_TEXT_CUES} text cues.`);
    for(const c of added)c.id=beatId();selected=added[0].id;await editor.edit(p=>p.texts.push(...added));$('text-message').textContent=`Imported ${added.length} subtitles.`;
  }catch(error){$('text-message').textContent=(error as Error).message;}finally{file.value='';render();}});
  $('text-srt-export').addEventListener('click',()=>editor.download(new Blob([subtitlesToSrt(editor.project().texts)],{type:'text/plain;charset=utf-8'}),'ara-subtitles.srt'));
  return {render,open,select:(id:string)=>{selected=id;render();}};
}
