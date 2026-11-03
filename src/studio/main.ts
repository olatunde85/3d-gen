import { AssetLibrary, fetchSource } from '../core/assets';
import { DEFAULT_PARAMS, PRESETS } from '../core/params';
import { CLIPS, clipById } from '../core/anim/clips';
import { Engine } from '../app/engine';
import { decodeCharacter } from '../app/share';
import { StudioActor } from './actor';
import { StudioScene } from './scene';
import { exportMovie, supportsMp4 } from './export';
import { CAST, MAX_ACTIONS, MAX_SHOTS, MAX_DURATION, beat, beatId, durationOf, newActor, newProject, parseProject, presetCode, shotAt, timelineAt, trackDuration, type ActorTrack, type StudioProject } from './project';
import { SETS, SCENE_CATEGORIES, sceneById, searchScenes } from './catalog';
import { ANIMATION_CATEGORIES, searchAnimations, actionNote } from './animations';
import { orbitControls } from './orbit';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id), select = (id: string) => $<HTMLSelectElement>(id), button = (id: string) => $<HTMLButtonElement>(id);
const BASE = import.meta.env.BASE_URL, STORAGE = 'ara.studio.project.v2', HANDOFF = 'ara.studio.handoff';
if (import.meta.env.DEV) $<HTMLAnchorElement>('video-licence').href = 'https://github.com/Vanilagy/mediabunny/blob/main/LICENSE';
const THUMBS: Record<string, string> = {
  'The Female Executive': new URL('../../docs/media/presets/female-executive.jpg', import.meta.url).href,
  'The Adventurer': new URL('../../docs/media/presets/adventurer.jpg', import.meta.url).href,
  'The Priest': new URL('../../docs/media/presets/priest.jpg', import.meta.url).href,
  'The Miami Dealer': new URL('../../docs/media/presets/miami-dealer.jpg', import.meta.url).href,
  'The Corporate High-Flier': new URL('../../docs/media/presets/corporate-high-flier.jpg', import.meta.url).href,
  'The Gangster': new URL('../../docs/media/presets/gangster.jpg', import.meta.url).href,
};
const scene = new StudioScene($<HTMLCanvasElement>('film'));
let project = newProject(), time = 0, selectedActor = project.actors[0].id, selected = 0, cameraSelection = false;
let playing = false, repeat = true, loading = true, exporting = false, dirty = true, titleEditing = false;
let engine: Engine, lib: AssetLibrary;
let movieUrl = '', renderedRecipe = '', movieInfo = '', noticeTimer = 0, capabilityToken = 0;
let controller: AbortController | undefined;
const history: string[] = [], builtRecipes = new Map<string, string>();
const actorTrack = () => project.actors.find(a => a.id === selectedActor) ?? project.actors[0];
const actorName = (a: ActorTrack) => decodeCharacter(a.character, a.detail)?.name || 'Your character';
const filename = () => (project.title || 'ara-film').normalize('NFKD').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'ara-film';
function notify(text: string) { $('notice').textContent = text; $('notice').classList.add('show'); clearTimeout(noticeTimer); noticeTimer = window.setTimeout(() => $('notice').classList.remove('show'), 6000); }
function download(blob: Blob, name: string) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60_000); }
const codeTime = (t: number) => `${Math.floor(t / 60).toString().padStart(2, '0')}:${Math.floor(t % 60).toString().padStart(2, '0')}:${Math.min(29, Math.floor((t % 1) * 30 + 0.001)).toString().padStart(2, '0')}`;
function remember() { history.push(JSON.stringify(project)); if (history.length > 30) history.shift(); }
function save() { try { localStorage.setItem(STORAGE, JSON.stringify(project)); $('save-status').textContent = 'Saved on this device'; } catch { $('save-status').textContent = 'Use Save project to keep a copy'; } }
function setPlaying(on: boolean) { playing = on && !loading && !exporting; if (playing && time >= durationOf(project) - 0.001) time = 0;
  button('play').textContent = playing ? 'Ⅱ' : '▶'; button('play').setAttribute('aria-label', playing ? 'Pause film' : 'Play film'); dirty = true; }
function lock() {
  for (const e of document.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>('.workspace button,.workspace input,.workspace select,.file-tools button')) e.disabled = loading || exporting;
  if (!loading && !exporting) {
    const items = cameraSelection ? project.shots : actorTrack().beats;
    button('undo').disabled = !history.length; button('remove-beat').disabled = items.length === 1;
    button('earlier').disabled = selected === 0; button('later').disabled = selected === items.length - 1;
    button('add-beat').disabled = actorTrack().beats.length >= MAX_ACTIONS || trackDuration(actorTrack()) > MAX_DURATION - 0.1;
    button('add-shot').disabled = project.shots.length >= MAX_SHOTS || project.shots.reduce((s, b) => s + b.duration, 0) > MAX_DURATION - 0.1;
    button('add-actor').disabled = project.actors.length >= 2;
    input('movement').disabled = !clipById.get(actorTrack().beats[Math.min(selected, actorTrack().beats.length-1)].clip)?.travel;
    select('blocking').disabled = project.actors.length < 2;
  }
  $('loading').hidden = !loading;
}
function dimensions(size = 720) { return project.aspect === 'landscape' ? { width: Math.round(size * 16 / 9), height: size } : { width: size, height: Math.round(size * 16 / 9) }; }
function renderPosition() {
  const total = durationOf(project);
  $('timecode').replaceChildren(document.createTextNode(codeTime(time) + ' '));
  const rest = document.createElement('span'); rest.textContent = `/ ${codeTime(total)}`; $('timecode').append(rest);
  input('scrub').value = String(time); $('playhead').style.left = `${time / total * 100}%`;
  for (const el of document.querySelectorAll<HTMLElement>('.beat')) {
    const index = Number(el.dataset.index), id = el.dataset.actor;
    const at = id ? timelineAt(project, time, project.actors.find(a => a.id === id)!).index : shotAt(project,time).index;
    el.classList.toggle('active', index === at);
  }
}
function renderScenes() {
  const focused=(document.activeElement as HTMLElement)?.dataset.set;
  const results = searchScenes(input('scene-search').value, select('scene-category').value);
  $('scene-count').textContent = `${results.length} / ${SETS.length}`; $('scene-empty').hidden = !!results.length; $('set-list').replaceChildren();
  for (const s of results) {
    const card = document.createElement('button'); card.className = `set-card scene-card family-${s.family}`; card.dataset.set = s.id; card.style.setProperty('--scene-accent',s.accent);
    card.setAttribute('aria-pressed',String(project.template===s.id));card.classList.toggle('active',project.template===s.id);card.tabIndex=(s.id===project.template||!results.some(r=>r.id===project.template)&&s===results[0])?0:-1;
    const tag=document.createElement('small'),name=document.createElement('strong'),description=document.createElement('span');
    tag.textContent=`${s.category} · ${s.mood}`;name.textContent=s.name;description.textContent=s.subtitle;card.append(tag,name,description);
    card.addEventListener('click',()=>void edit(p=>{p.template=s.id;}));$('set-list').append(card);
  }
  if(focused)$('set-list').querySelector<HTMLButtonElement>(`[data-set="${focused}"]`)?.focus({preventScroll:true});
}
function renderAnimations() {
  const b = actorTrack().beats[Math.min(selected, actorTrack().beats.length-1)], clips = searchAnimations(input('animation-search').value,select('animation-category').value);
  const picker = select('action'); picker.replaceChildren();
  if(!clips.some(c=>c.id===b.clip))picker.append(new Option(`${clipById.get(b.clip)!.name} · current`,b.clip));
  for(const category of ANIMATION_CATEGORIES){const group=document.createElement('optgroup');group.label=category;for(const c of clips.filter(c=>c.category===category))group.append(new Option(c.name,c.id));if(group.children.length)picker.append(group);}
  picker.value=b.clip;$('animation-count').textContent=`${clips.length} / ${CLIPS.length}`;$('action-note').textContent=actionNote(b.clip);
}
function renderTracks() {
  const total=durationOf(project);$('tracks').replaceChildren();
  const row=(label:string,id:string|undefined,items: {duration:number}[])=>{
    const lane=document.createElement('div');lane.className='track-lane';const heading=document.createElement('div');heading.className='track-name';heading.textContent=label;lane.append(heading);
    const blocks=document.createElement('div');blocks.className='track-blocks';
    items.forEach((raw,i)=>{
      const camera=!id, item=raw as typeof project.shots[number] & typeof project.actors[number]['beats'][number];
      const el=document.createElement('button');el.className=`beat${(cameraSelection===camera&&(!id||id===selectedActor)&&i===selected)?' selected':''}`;el.dataset.index=String(i);if(id)el.dataset.actor=id;
      el.style.width=`${item.duration/total*100}%`;el.style.flex='0 0 auto';
      const title=document.createElement('strong'),note=document.createElement('small');title.textContent=camera?`${i+1}. ${item.shot==='wide'?'Full body':item.shot==='close'?'Close-up':'Medium'}`:clipById.get(item.clip)!.name;
      note.textContent=`${Number(item.duration.toFixed(2))}s${camera?' · '+(item.target==='all'?'Cast':`Character ${project.actors.findIndex(a=>a.id===item.target)+1}`):item.move?' · travel':''}`;
      el.append(title,note);el.setAttribute('aria-label',`${label}: ${title.textContent}, ${note.textContent}`);el.setAttribute('aria-pressed',String(el.classList.contains('selected')));
      el.addEventListener('click',()=>{cameraSelection=camera;if(id)selectedActor=id;selected=i;time=items.slice(0,i).reduce((sum,b)=>sum+b.duration,0);setPlaying(false);renderUI();});blocks.append(el);
    });
    const length=items.reduce((s,b)=>s+b.duration,0);if(total-length>0.05){const hold=document.createElement('div');hold.className='track-hold';hold.style.flex='1';hold.textContent='Hold';blocks.append(hold);}
    lane.append(blocks);$('tracks').append(lane);
  };
  row('CAMERA',undefined,project.shots);for(const [i,a]of project.actors.entries())row(`${i+1} · ${actorName(a)}`,a.id,a.beats);
}
function renderUI() {
  if(!project.actors.some(a=>a.id===selectedActor))selectedActor=project.actors[0].id;
  const a=actorTrack(), ai=project.actors.indexOf(a), items=cameraSelection?project.shots:a.beats;
  selected=Math.max(0,Math.min(selected,items.length-1));
  $('project-name').textContent=project.title||'Untitled film';$('scene-name').textContent=sceneById.get(project.template)!.name;renderScenes();
  $('cast-roster').replaceChildren();for(const [i,actor]of project.actors.entries()){
    const b=document.createElement('button');b.className='cast-member';b.setAttribute('aria-pressed',String(actor.id===selectedActor));b.textContent=`${i+1} · ${actorName(actor)}`;
    b.addEventListener('click',()=>{selectedActor=actor.id;cameraSelection=false;selected=0;renderUI();});$('cast-roster').append(b);
  }
  $('add-actor').hidden=project.actors.length===2;$('remove-actor').hidden=project.actors.length===1;
  const params=decodeCharacter(a.character,a.detail)??DEFAULT_PARAMS,picker=select('character');picker.replaceChildren();
  const isPreset=!!PRESETS[params.name]&&presetCode(params.name)===a.character;
  if(!isPreset)picker.append(new Option(`${params.name||'Your character'} · custom`,'__custom'));
  for(const name of [...CAST,...Object.keys(PRESETS).filter(n=>!CAST.includes(n))])picker.append(new Option(name.replace(/^The /,''),name));picker.value=isPreset?params.name:'__custom';
  $<HTMLAnchorElement>('edit-character').href=`${BASE}app/#${new URLSearchParams({c:a.character,detail:a.detail})}`;
  $('cast-card').replaceChildren();if(isPreset&&THUMBS[params.name]){const img=new Image();img.src=THUMBS[params.name];img.alt=params.name;$('cast-card').append(img);}
  const info=document.createElement('div'),name=document.createElement('strong'),note=document.createElement('span');name.textContent=params.name;note.textContent=`Character ${ai+1} · ${a.detail} detail`;info.append(name,note);$('cast-card').append(info);
  const total=durationOf(project);input('scrub').max=String(total);$('duration-label').textContent=`${Number(total.toFixed(2))} seconds`;
  $('ruler').replaceChildren();for(let i=0;i<=4;i++){const tick=document.createElement('span');tick.textContent=`${Number((total*i/4).toFixed(1))}s`;$('ruler').append(tick);}
  const choices=select('timeline-selection');choices.replaceChildren();
  const shots=document.createElement('optgroup');shots.label='Camera';project.shots.forEach((s,i)=>shots.append(new Option(`${i+1}. ${s.shot} · ${s.duration}s`,`camera:${i}`)));choices.append(shots);
  for(const [i,actor]of project.actors.entries()){const group=document.createElement('optgroup');group.label=`${i+1} · ${actorName(actor)}`;actor.beats.forEach((b,j)=>group.append(new Option(`${j+1}. ${clipById.get(b.clip)!.name} · ${b.duration}s`,`${actor.id}:${j}`)));choices.append(group);}
  choices.value=`${cameraSelection?'camera':selectedActor}:${selected}`;
  renderTracks();$('beat-title').textContent=cameraSelection?`Camera shot ${selected+1}`:`Character ${ai+1} · action ${selected+1}`;$('shot-count').textContent=`${selected+1} of ${items.length}`;
  $('action-settings').hidden=cameraSelection;$('shot-settings').hidden=!cameraSelection;
  if(cameraSelection){const s=project.shots[selected];select('shot').value=s.shot;input('shot-duration').value=String(s.duration);select('shot-target').replaceChildren(new Option('Entire cast','all'));for(const [i,actor]of project.actors.entries())select('shot-target').append(new Option(`Character ${i+1} · ${actorName(actor)}`,actor.id));select('shot-target').value=s.target;}
  else{const b=a.beats[selected];renderAnimations();input('beat-duration').value=String(b.duration);input('movement').checked=b.move;}
  $('blocking-title').textContent=`Character ${ai+1} placement`;for(const key of ['x','y','z','yaw']as const)input(`actor-${key}`).value=String(a[key]);select('blocking').value='';
  select('camera').value=project.camera;input('title').value=project.title;input('caption').checked=project.caption;$('stage').dataset.aspect=project.aspect;
  $('view-readout').textContent=`${Math.round(project.view.azimuth)}° · ${project.view.zoom.toFixed(1)}×`;
  for(const aspect of ['landscape','portrait'])button(aspect).setAttribute('aria-pressed',String(project.aspect===aspect));
  lock();renderPosition();dirty=true;
}
async function syncActors() {
  const next=new Map<string,StudioActor>(),made:StudioActor[]=[];
  try{
    for(const a of project.actors){const recipe=`${a.detail}:${a.character}`,existing=scene.actors.get(a.id);
      if(existing&&builtRecipes.get(a.id)===recipe){next.set(a.id,existing);continue;}
      const params=decodeCharacter(a.character,a.detail);if(!params)throw Error('The character recipe could not be opened.');
      $('loading-label').textContent=`Building character ${project.actors.indexOf(a)+1}…`;
      const ch=await engine.build({...params,rig:params.rig==='none'?'game':params.rig,animations:true},label=>$('loading-label').textContent=label);
      const actor=new StudioActor(ch,file=>lib.textureUrl(file));made.push(actor);await actor.ready();next.set(a.id,actor);
    }
    await scene.setActors(next,project);builtRecipes.clear();for(const a of project.actors)builtRecipes.set(a.id,`${a.detail}:${a.character}`);
  }catch(e){for(const actor of made)if(![...scene.actors.values()].includes(actor))actor.dispose();throw e;}
}
async function apply(next: StudioProject, keepHistory=true) {
  if(loading||exporting)return;
  let valid:StudioProject;try{valid=parseProject(JSON.stringify(next));}catch(e){notify((e as Error).message);renderUI();return;}
  const previous=project;if(keepHistory)remember();project=valid;time=Math.min(time,durationOf(project));setPlaying(false);
  const needsBuild=project.actors.length!==scene.actors.size||project.actors.some(a=>builtRecipes.get(a.id)!==`${a.detail}:${a.character}`);
  if(needsBuild){loading=true;renderUI();try{await syncActors();}catch(e){project=previous;if(keepHistory)history.pop();notify(`Character unchanged: ${(e as Error).message}`);}finally{loading=false;}}
  const {width,height}=dimensions();scene.resize(width,height);renderUI();save();
}
function edit(fn:(p:StudioProject)=>void){const next=structuredClone(project);fn(next);return apply(next);}
function undo(){if(loading||exporting||!history.length)return;void apply(parseProject(history.pop()!),false);}
input('scene-search').placeholder=`Search ${SETS.length} scenes…`;input('animation-search').placeholder=`Search ${CLIPS.length} animations…`;
for(const c of SCENE_CATEGORIES)select('scene-category').append(new Option(c,c));
input('scene-search').addEventListener('input',renderScenes);select('scene-category').addEventListener('change',renderScenes);
$('set-list').addEventListener('keydown',e=>{if(!['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const cards=[...$('set-list').querySelectorAll<HTMLButtonElement>('button')];const at=cards.indexOf(document.activeElement as HTMLButtonElement),to=e.key==='Home'?0:e.key==='End'?cards.length-1:Math.max(0,Math.min(cards.length-1,at+(['ArrowUp','ArrowLeft'].includes(e.key)?-1:1)));cards.forEach((b,i)=>b.tabIndex=i===to?0:-1);cards[to]?.focus();});
select('timeline-selection').addEventListener('change',()=>{const [id,index]=select('timeline-selection').value.split(':');cameraSelection=id==='camera';if(!cameraSelection)selectedActor=id;selected=Number(index);const items=cameraSelection?project.shots:actorTrack().beats;time=items.slice(0,selected).reduce((sum,b)=>sum+b.duration,0);setPlaying(false);renderUI();});
for(const c of ANIMATION_CATEGORIES)select('animation-category').append(new Option(c,c));
input('animation-search').addEventListener('input',renderAnimations);select('animation-category').addEventListener('change',renderAnimations);
select('character').addEventListener('change',()=>{const value=select('character').value;if(value!=='__custom')void edit(p=>p.actors.find(a=>a.id===selectedActor)!.character=presetCode(value));});
button('add-actor').addEventListener('click',()=>void edit(p=>{if(p.actors.length>=2)return;const first=p.actors[0],duration=durationOf(p);const a=newActor(presetCode('The Adventurer'),'medium',p.actors.some(a=>a.id==='actor-b')?'actor-a':'actor-b');a.x=first.x+1.9<=12?first.x+1.9:first.x-1.9;a.y=first.y;a.z=first.z;a.yaw=first.yaw;if(duration>=0.3&&duration<=36)a.beats=a.beats.map(b=>({...b,duration:duration/3}));else{a.beats=[];for(let left=duration;left>0.001;left-=12)a.beats.push(beat('idle',Math.min(12,left)));}p.actors.push(a);selectedActor=a.id;selected=0;cameraSelection=false;}));
button('remove-actor').addEventListener('click',()=>void edit(p=>{if(p.actors.length<=1)return;const removed=actorTrack().id;p.actors=p.actors.filter(a=>a.id!==removed);for(const s of p.shots)if(s.target===removed)s.target='all';selectedActor=p.actors[0].id;selected=0;cameraSelection=false;}));
for(const key of ['x','y','z','yaw']as const)input(`actor-${key}`).addEventListener('change',()=>void edit(p=>p.actors.find(a=>a.id===selectedActor)![key]=Number(input(`actor-${key}`).value)));
select('blocking').addEventListener('change',()=>{const value=select('blocking').value;if(!value)return;void edit(p=>{if(p.actors.length<2)return;for(const [i,a]of p.actors.entries()){a.x=i?0.95:-0.95;a.z=0;a.y=0;a.yaw=value==='side'?0:(i?-1:1)*(value==='opposed'?90:35);}});});
button('undo').addEventListener('click',undo);button('play').addEventListener('click',()=>setPlaying(!playing));button('restart').addEventListener('click',()=>{time=0;dirty=true;renderPosition();});
button('repeat').addEventListener('click',()=>{repeat=!repeat;button('repeat').classList.toggle('on',repeat);button('repeat').setAttribute('aria-pressed',String(repeat));});
input('scrub').addEventListener('input',()=>{setPlaying(false);time=Number(input('scrub').value);dirty=true;renderPosition();});
select('action').addEventListener('change',()=>void edit(p=>{const b=p.actors.find(a=>a.id===selectedActor)!.beats[selected];b.clip=select('action').value;b.move=false;}));
input('beat-duration').addEventListener('change',()=>void edit(p=>p.actors.find(a=>a.id===selectedActor)!.beats[selected].duration=Number(input('beat-duration').value)));
button('clip-length').addEventListener('click',()=>void edit(p=>{const b=p.actors.find(a=>a.id===selectedActor)!.beats[selected];b.duration=Math.min(12,clipById.get(b.clip)!.duration);}));
input('movement').addEventListener('change',()=>void edit(p=>p.actors.find(a=>a.id===selectedActor)!.beats[selected].move=input('movement').checked));
select('shot').addEventListener('change',()=>void edit(p=>p.shots[selected].shot=select('shot').value as typeof p.shots[number]['shot']));
select('shot-target').addEventListener('change',()=>void edit(p=>p.shots[selected].target=select('shot-target').value));
input('shot-duration').addEventListener('change',()=>void edit(p=>p.shots[selected].duration=Number(input('shot-duration').value)));
select('camera').addEventListener('change',()=>void edit(p=>p.camera=select('camera').value as typeof p.camera));
for(const aspect of ['landscape','portrait']as const)button(aspect).addEventListener('click',()=>void edit(p=>p.aspect=aspect));
input('title').addEventListener('blur',()=>titleEditing=false);input('title').addEventListener('input',()=>{if(loading||exporting)return;if(!titleEditing){remember();titleEditing=true;}project.title=input('title').value.slice(0,60);$('project-name').textContent=project.title||'Untitled film';save();lock();dirty=true;});
input('caption').addEventListener('change',()=>void edit(p=>p.caption=input('caption').checked));
button('view-reset').addEventListener('click',()=>void edit(p=>p.view={azimuth:0,elevation:0,zoom:1}));
orbitControls($<HTMLCanvasElement>('film'),()=>project.view,()=>!loading&&!exporting,()=>{remember();setPlaying(false);},v=>{project.view=v;dirty=true;$('view-readout').textContent=`${Math.round(v.azimuth)}° · ${v.zoom.toFixed(1)}×`;},()=>{lock();save();});
button('add-beat').addEventListener('click',()=>void edit(p=>{const a=p.actors.find(a=>a.id===selectedActor)!;const d=Math.min(3,MAX_DURATION-trackDuration(a));if(d<0.1||a.beats.length>=MAX_ACTIONS)return;a.beats.push(beat('idle',d));cameraSelection=false;selected=a.beats.length-1;}));
button('add-shot').addEventListener('click',()=>void edit(p=>{const d=Math.min(3,MAX_DURATION-p.shots.reduce((s,b)=>s+b.duration,0));if(d<0.1||p.shots.length>=MAX_SHOTS)return;p.shots.push({id:beatId(),duration:d,shot:'wide',target:'all'});cameraSelection=true;selected=p.shots.length-1;}));
button('remove-beat').addEventListener('click',()=>void edit(p=>{const items=cameraSelection?p.shots:p.actors.find(a=>a.id===selectedActor)!.beats;if(items.length>1)items.splice(selected,1);selected=Math.max(0,selected-1);}));
for(const [id,offset]of [['earlier',-1],['later',1]]as const)button(id).addEventListener('click',()=>void edit(p=>{const items=cameraSelection?p.shots:p.actors.find(a=>a.id===selectedActor)!.beats,to=selected+offset;if(to<0||to>=items.length)return;[items[selected],items[to]]=[items[to],items[selected]];selected=to;}));
button('save-project').addEventListener('click',()=>{save();download(new Blob([JSON.stringify(project,null,2)],{type:'application/json'}),`${filename()}.ara-studio.json`);notify('Editable project saved.');});
button('load-project').addEventListener('click',()=>input('project-file').click());input('project-file').addEventListener('change',async()=>{const file=input('project-file').files?.[0];if(!file)return;try{if(file.size>100_000)throw Error('Choose a project smaller than 100 KB.');const p=parseProject(await file.text());selected=0;cameraSelection=false;await apply(p);}catch(e){notify((e as Error).message);}finally{input('project-file').value='';}});
button('snapshot').addEventListener('click',()=>{scene.render(project,time);scene.output.toBlob(b=>{if(b)download(b,`${filename()}-frame.png`);},'image/png');});
$('edit-character').addEventListener('click',e=>{if(loading||exporting){e.preventDefault();return;}try{const token=crypto.randomUUID();sessionStorage.setItem(HANDOFF,JSON.stringify({token,actorId:actorTrack().id,project}));$<HTMLAnchorElement>('edit-character').href=`${BASE}app/#${new URLSearchParams({c:actorTrack().character,detail:actorTrack().detail,studioReturn:token})}`;}catch{ /* The ordinary character link still works if session storage is unavailable. */ }});
document.addEventListener('keydown',e=>{if((e.target as HTMLElement).closest('input,select,textarea,button')||$<HTMLDialogElement>('export-dialog').open)return;if(e.code==='Space'){e.preventDefault();setPlaying(!playing);}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo();}});
let lastTime=performance.now();
function tick(now:number){const elapsed=Math.min(0.1,Math.max(0,(now-lastTime)/1000));lastTime=now;if(!exporting&&!loading&&scene.actors.size){if(playing){time+=elapsed;const total=durationOf(project);if(time>=total){if(repeat)time%=total;else{time=total;setPlaying(false);}}dirty=true;}if(dirty){scene.render(project,time);renderPosition();dirty=false;}}requestAnimationFrame(tick);}
requestAnimationFrame(tick);
const dialog = $<HTMLDialogElement>('export-dialog');
async function updateCapability() {
  const token = ++capabilityToken, size = Number(select('resolution').value), { width, height } = dimensions(size);
  button('start-export').disabled = true; $('export-message').textContent = 'Checking video export on this browser…';
  const supported = await supportsMp4(width, height);
  if (token !== capabilityToken || !dialog.open) return;
  button('start-export').disabled = !supported;
  $('export-message').textContent = supported ? '' : 'This browser cannot encode this MP4 size. Try 720p, or use a current Chrome, Edge or Safari browser. You can still save a frame or project.';
}
button('open-export').addEventListener('click', () => {
  setPlaying(false); $('export-length').textContent = `${Number(durationOf(project).toFixed(1))} seconds`;
  $('export-options').hidden = false; $('export-progress').hidden = true; $('cancel-export').hidden = true;
  const hasFilm = !!movieUrl && renderedRecipe === JSON.stringify(project);
  $('download-film').hidden = !hasFilm; $('export-preview').hidden = !hasFilm; $('render-again').hidden = !hasFilm; $('start-export').hidden = hasFilm;
  $('export-options').hidden = hasFilm; $('export-message').textContent = hasFilm ? movieInfo : '';
  dialog.showModal(); if (!hasFilm) void updateCapability();
});
button('render-again').addEventListener('click', () => { $('render-again').hidden = true; $('export-options').hidden = false; $('start-export').hidden = false; $('download-film').hidden = true; $('export-preview').hidden = true; void updateCapability(); });
select('resolution').addEventListener('change', () => void updateCapability());
button('close-export').addEventListener('click', () => { if (exporting) controller?.abort(); else dialog.close(); });
button('cancel-export').addEventListener('click', () => controller?.abort());
dialog.addEventListener('cancel', (e) => { if (exporting) { e.preventDefault(); controller?.abort(); } });
button('start-export').addEventListener('click', async () => {
  if (exporting || loading) return;
  const recipe = JSON.stringify(project), snapshot = parseProject(recipe), before = time, size = Number(select('resolution').value), { width, height } = dimensions(size);
  controller = new AbortController(); exporting = true; lock(); $('export-options').hidden = true; $('export-progress').hidden = false;
  $('start-export').hidden = true; $('render-again').hidden = true; $('cancel-export').hidden = false; $('export-message').textContent = '';
  $<HTMLProgressElement>('render-progress').value = 0; $('render-status').textContent = 'Preparing frames…'; $('export-preview').hidden = true; $('download-film').hidden = true;
  const started = performance.now();
  try {
    const blob = await exportMovie(scene, snapshot, { width, height, signal: controller.signal, progress: (done, total) => {
      $<HTMLProgressElement>('render-progress').value = done / total * 100;
      $('render-status').textContent = `Frame ${done} of ${total} · ${Math.round(done / total * 100)}% · ${Math.round((performance.now() - started) / 1000)}s elapsed`;
    } });
    if (movieUrl) URL.revokeObjectURL(movieUrl); movieUrl = URL.createObjectURL(blob);
    const link = $<HTMLAnchorElement>('download-film'); link.href = movieUrl; link.download = `${filename()}.mp4`; link.hidden = false;
    $<HTMLVideoElement>('export-preview').src = movieUrl; $('export-preview').hidden = false;
    renderedRecipe = recipe; movieInfo = `Your film is ready. ${(blob.size / 1024 / 1024).toFixed(1)} MB · ${width} × ${height}`;
    $('export-message').textContent = movieInfo; $('render-again').hidden = false;
    $('render-status').textContent = 'Every frame rendered. Ready to download.';
  } catch (e) {
    $('export-message').textContent = controller.signal.aborted ? 'Export cancelled. Your project is safe.' : (e as Error).message;
    $('export-options').hidden = false; $('start-export').hidden = false;
  } finally {
    exporting = false; controller = undefined; time = before; dirty = true; $('cancel-export').hidden = true; lock();
    if (!button('start-export').hidden) button('start-export').disabled = false;
  }
});
window.addEventListener('beforeunload', (e) => { if (exporting) { e.preventDefault(); } });

async function start() {
  const hash=new URLSearchParams(location.hash.slice(1)),code=hash.get('c');
  try{
    if(code){if(!decodeCharacter(code,'medium'))throw Error('The character link is invalid.');const d=hash.get('detail'),detail=d==='low'||d==='high'?d:'medium';
      const pending=hash.get('studioReturn')?JSON.parse(sessionStorage.getItem(HANDOFF)||'null'):null;
      if(pending&&pending.token===hash.get('studioReturn')){project=parseProject(JSON.stringify(pending.project));const a=project.actors.find(a=>a.id===pending.actorId);if(!a)throw Error('The selected character is missing.');a.character=code;a.detail=detail;selectedActor=a.id;project=parseProject(JSON.stringify(project));sessionStorage.removeItem(HANDOFF);}
      else project=newProject('portrait',code,detail);
    }else{const saved=localStorage.getItem(STORAGE)||localStorage.getItem('ara.studio.project.v1');if(saved)project=parseProject(saved);}
  }catch(e){notify((e as Error).message);}
  renderUI();
  try{const assets=new URL(`${BASE}assets/`,location.href).href;lib=await new AssetLibrary(fetchSource(assets)).initCatalog();engine=new Engine(lib,assets);await syncActors();loading=false;renderUI();save();}
  catch(e){$('loading-label').textContent='The cast could not load.';$('loading').querySelector('span:last-child')!.textContent='Reload to try again.';notify((e as Error).message);}
}
void start();
if(new URLSearchParams(location.hash.slice(1)).has('demo'))Object.assign(window,{studio:{scene,get project(){return project;},seek:(t:number)=>{time=t;dirty=true;setPlaying(false);},get ready(){return !loading&&scene.actors.size===project.actors.length;},exportMovie,supportsMp4,setProject:apply,sets:SETS}});
