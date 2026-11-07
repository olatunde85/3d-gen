import {animationGroup} from '../core/anim/groups';
import {supportsWeaponAim} from '../core/anim/riding-weapons';
import { AssetLibrary, fetchSource } from '../core/assets';
import { DEFAULT_PARAMS, PRESETS } from '../core/params';
import { CLIPS, clipById } from '../core/anim/clips';
import { Engine } from '../app/engine';
import { decodeCharacter, encodeCharacter } from '../app/share';
import { StudioActor } from './actor';
import { StudioScene } from './scene';
import { exportMovie, supportsMp4, audioCodec } from './export';
import { CAST, MAX_ACTORS, MAX_ACTIONS, MAX_SHOTS, MAX_DURATION, beat, beatId, blankProject, durationOf, newProject, parseProject, presetCode, shotAt, timelineAt, trackDuration, type ActorTrack, type StudioProject } from './project';
import { SETS, SCENE_CATEGORIES, sceneById, searchScenes } from './catalog';
import { ANIMATION_CATEGORIES, searchAnimations, actionNote } from './animations';
import { orbitControls } from './orbit';
import {timelineHandles} from './timeline-handles';
import {clipWindow} from './timeline-resize';
import { parseStudioInput } from './assist';
import { resolveTextActor } from './text';
import { setupTextEditor } from './text-ui';
import { setupSoundEditor } from './audio/ui';
import { AudioPlayback, SpeechAudioRequired } from './audio/mix';
import { hasAudio, resolveSpeechActor } from './audio/schema';
import { audioProjectBundle, openAudioBundle } from './audio/bundle';
import { setupAssist } from './assist-ui';
import { setupStudioTour } from './tour';
import { seatCast } from './seating';
import { addCastActor, arrangeCast, castArrangement, ARRANGEMENTS, ARRANGEMENT_LABELS, type Arrangement } from './staging';
import { MUSIC_TRACKS } from './audio/tracks';
import { SESSION_KEY, readEditorSession, type EditorState } from './session';
import { reconcileWeaponActions,equipActor, WEAPONS, WEAPON_LABELS, CARRIED, CARRY_LABELS } from './equipment';

import {VEHICLE_FOR_CLIP,RIDING_VEHICLES,VEHICLE_LABELS,type VehicleStyle} from '../core/props/vehicles';
import {defaultWeaponYaw,type WeaponPose} from '../core/anim/riding-weapons';
import {isFirearm} from '../core/props/weapons';

import {studioTravel,VEHICLE_SPEED,STAGE_LIMIT} from './motion';
import {vehicleCatalog,vehicleKey,assignVehicle,availableVehicleSeats,seatsForVehicle,SEAT_LABELS,type VehicleSeat} from './vehicle-seats';
import {readCharacterSettings} from '../app/character-file';
import {setupSpatialReview,fittedSpatialBodies} from './spatial-ui';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id), select = (id: string) => $<HTMLSelectElement>(id), button = (id: string) => $<HTMLButtonElement>(id);
const BASE = import.meta.env.BASE_URL, STORAGE = 'ara.studio.project.v2', HANDOFF = 'ara.studio.handoff';
if (import.meta.env.DEV) $<HTMLAnchorElement>('video-licence').href = 'https://github.com/Vanilagy/mediabunny/blob/main/LICENSE';
const soundtrack=new AudioPlayback();let playToken=0,preparingSound=false;
const scene = new StudioScene($<HTMLCanvasElement>('film'));
let project = newProject(), time = 0, selectedActor = project.actors[0].id, selected = 0, cameraSelection = false;
let characterSelected=true;
let playing = false, repeat = true, loading = true, exporting = false, dirty = true, titleEditing = false;
let engine: Engine, lib: AssetLibrary;
let speechToFix:string|undefined;
let movieUrl = '', renderedRecipe = '', movieInfo = '', noticeTimer = 0, capabilityToken = 0;
let controller: AbortController | undefined;
let clickToPlace=false,importing=false,placementBefore:string|undefined,timelineDragBefore:string|undefined;
const history: string[] = [], builtRecipes = new Map<string, string>();
const pendingSpeech=()=>project.audio.muted?[]:project.audio.speech.filter(c=>c.volume>0&&!c.asset);
const actorTrack = () => project.actors.find(a => a.id === selectedActor) ?? project.actors[0];
const actorName = (a: ActorTrack) => decodeCharacter(a.character, a.detail)?.name || 'Your character';
const filename = () => (project.title || 'ara-film').normalize('NFKD').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'ara-film';
function notify(text: string) { $('notice').textContent = text; $('notice').classList.add('show'); clearTimeout(noticeTimer); noticeTimer = window.setTimeout(() => $('notice').classList.remove('show'), 6000); }
function download(blob: Blob, name: string) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60_000); }
const codeTime = (t: number) => `${Math.floor(t / 60).toString().padStart(2, '0')}:${Math.floor(t % 60).toString().padStart(2, '0')}:${Math.min(29, Math.floor((t % 1) * 30 + 0.001)).toString().padStart(2, '0')}`;
function remember() { history.push(JSON.stringify(project)); if (history.length > 30) history.shift(); }
let sessionTimer=0,lastSessionSave=0;
function editorState(): EditorState {
  return {selectedActor,selected,characterSelected,cameraSelection,time,repeat,clickToPlace,
    sceneSearch:input('scene-search').value,sceneCategory:select('scene-category').value,
    animationSearch:input('animation-search').value,animationCategory:select('animation-category').value,resolution:select('resolution').value as '720'|'1080',
    text:{open:$<HTMLDialogElement>('text-dialog').open,selected:select('text-cue').value},
    sound:{open:$<HTMLDialogElement>('sound-dialog').open,selected:select('sound-cue').value,deviceVoice:soundEditor.deviceVoice(),rate:Number(input('sound-device-rate').value),pitch:Number(input('sound-device-pitch').value),fit:input('sound-fit-generated').checked,tab:soundEditor.tab(),selectedEffect:soundEditor.selectedEffect()},
    assist:assist.state(),
    scroll:{library:document.querySelector('.library')!.scrollTop,inspector:document.querySelector('.inspector')!.scrollTop,sets:$('set-list').scrollTop,page:window.scrollY}};
}
function saveSession():boolean {
  clearTimeout(sessionTimer);sessionTimer=0;
  if(loading||importing)return false; // Never replace the last complete film with a model build in progress.
  try {
    const before=timelineDragBefore??placementBefore;const savedProject=before?JSON.parse(before) as StudioProject:project;
    localStorage.setItem(SESSION_KEY,JSON.stringify({version:1,project:savedProject,editor:editorState(),history}));
    localStorage.setItem(STORAGE,JSON.stringify(savedProject));
    lastSessionSave=performance.now();$('save-status').textContent='Saved on this device';return true;
  } catch { $('save-status').textContent='Use Save project to keep a copy';return false; }
}
function scheduleSessionSave(){clearTimeout(sessionTimer);sessionTimer=window.setTimeout(saveSession,250);}
function save(){return saveSession();}
function restoreEditor(state:EditorState,undoHistory:string[]){
  selectedActor=state.selectedActor;selected=state.selected;characterSelected=state.characterSelected;cameraSelection=state.cameraSelection;
  time=state.time;repeat=state.repeat;clickToPlace=state.clickToPlace;history.splice(0,history.length,...undoHistory);
  input('scene-search').value=state.sceneSearch;select('scene-category').value=state.sceneCategory;
  input('animation-search').value=state.animationSearch;select('animation-category').value=state.animationCategory;select('resolution').value=state.resolution;
  assist.restore(state.assist);textEditor.select(state.text.selected);soundEditor.select(state.sound.selected);
  soundEditor.restore(state.sound);
  button('repeat').classList.toggle('on',repeat);button('repeat').setAttribute('aria-pressed',String(repeat));
  button('place-actor').setAttribute('aria-pressed',String(clickToPlace));button('place-actor').textContent=clickToPlace?'Click a spot…':'Click to place';$('film').classList.toggle('click-placement',clickToPlace);
}
for(const event of ['input','change','click','keyup','pointerup'])document.addEventListener(event,scheduleSessionSave);
for(const element of document.querySelectorAll('dialog,details'))for(const event of ['close','toggle'])element.addEventListener(event,scheduleSessionSave);
for(const element of document.querySelectorAll('.library,.inspector,#set-list'))element.addEventListener('scroll',scheduleSessionSave,{passive:true});
window.addEventListener('scroll',scheduleSessionSave,{passive:true});
window.addEventListener('pagehide',()=>{saveSession();setPlaying(false);});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')saveSession();});
function setPlaying(on: boolean) {
  const token=++playToken;soundtrack.stop();soundEditor.stop();preparingSound=false;
  playing=on&&!loading&&!exporting&&!importing&&!placementBefore&&!timelineDragBefore;
  if(playing&&time>=durationOf(project)-.001)time=0;
  if(playing&&hasAudio(project.audio)){
    preparingSound=true;
    void soundtrack.play(project,time,()=>{if(token!==playToken)return;time=durationOf(project);if(repeat){time=0;setPlaying(true);}else setPlaying(false);}).then(started=>{
      if(token!==playToken)return;preparingSound=false;if(!started)setPlaying(false);
    }).catch(error=>{if(token===playToken){setPlaying(false);if(error instanceof SpeechAudioRequired)soundEditor.open(error.cueId,true);else notify((error as Error).message);}});
  }
  button('play').textContent=playing?'Ⅱ':'▶';button('play').setAttribute('aria-label',playing?'Pause film':'Play film');dirty=true;
}
function lock() {
  for (const e of document.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>('.workspace button,.workspace input,.workspace select,.file-tools button')) e.disabled = loading || exporting || importing || !!placementBefore || !!timelineDragBefore;
  if (!loading && !exporting && !importing && !placementBefore && !timelineDragBefore) {
    const items = cameraSelection ? project.shots : actorTrack().beats;
    button('undo').disabled = !history.length; button('remove-beat').disabled = items.length === 1;
    button('earlier').disabled = selected === 0; button('later').disabled = selected === items.length - 1;
    button('add-beat').disabled = actorTrack().beats.length >= MAX_ACTIONS || trackDuration(actorTrack()) > MAX_DURATION - 0.1;
    button('add-shot').disabled = project.shots.length >= MAX_SHOTS || project.shots.reduce((s, b) => s + b.duration, 0) > MAX_DURATION - 0.1;
    button('add-actor').disabled = button('add-custom-actor').disabled = project.actors.length >= MAX_ACTORS;
    input('movement').disabled = !studioTravel(actorTrack().beats[Math.min(selected, actorTrack().beats.length-1)].clip);
    const current=actorTrack().beats[Math.min(selected,actorTrack().beats.length-1)],passenger=(current.vehicleSeat??'operator')!=='operator';
    if(passenger){input('movement').disabled=true;input('show-vehicle').disabled=true;input('vehicle-travel-speed').disabled=true;input('helicopter-height').disabled=true;}
    select('blocking').disabled = project.actors.length !== 2;
  }
  input('title').disabled=loading||exporting||importing||!!placementBefore||!!timelineDragBefore;
  if(!characterSelected){for(const id of ['character','remove-actor','actor-weapon','actor-carry','show-vehicle','beat-vehicle','beat-vehicle-seat','beat-weapon-pose','beat-weapon-yaw','beat-weapon-pitch','vehicle-travel-speed','helicopter-height','vehicle-color','vehicle-accentColor','vehicle-seatColor','vehicle-finish','vehicle-variant','actor-x','actor-y','actor-z','actor-yaw','action','beat-duration','movement','clip-length','add-beat','animation-search','animation-category','place-actor'])($<HTMLInputElement>(id)).disabled=true;}
  $('deselect-actor').hidden=!characterSelected;
  for(const guard of document.querySelectorAll<HTMLElement>('.select-first'))guard.hidden=characterSelected||loading||exporting||importing;
  for(const hint of document.querySelectorAll<HTMLElement>('.select-first-hint')){hint.hidden=characterSelected;if(characterSelected)hint.classList.remove('urgent');}
  $('edit-character').setAttribute('aria-disabled',String(!characterSelected||loading||exporting||importing||!!placementBefore||!!timelineDragBefore));
  $('edit-character').tabIndex=characterSelected?0:-1;
  for(const pinned of document.querySelectorAll<HTMLButtonElement>('[data-pinned]'))pinned.disabled=true;
  $('loading').hidden = !loading;
}
function dimensions(size = 720) { return project.aspect === 'landscape' ? { width: Math.round(size * 16 / 9), height: size } : { width: size, height: Math.round(size * 16 / 9) }; }
function renderCameraControls(){
  const active=shotAt(project,time),v=active.shot.view??project.view;
  $('view-readout').textContent=`${active.shot.view||active.shot.camera?`Shot ${active.index+1}`:'Film'} · ${Math.round(v.azimuth)}° · ${v.zoom.toFixed(1)}×`;
  if(cameraSelection){const shot=project.shots[selected],view=shot.view??project.view;
    input('shot-custom-camera').checked=!!shot.view||!!shot.camera;$('shot-camera-settings').hidden=!input('shot-custom-camera').checked;
    for(const key of ['azimuth','elevation','zoom']as const)if(document.activeElement!==input(`shot-${key}`))input(`shot-${key}`).value=String(Number(view[key].toFixed(3)));
    select('shot-camera').value=shot.camera??project.camera;
  }
}
function seekSelectedShot(){time=project.shots.slice(0,selected).reduce((sum,s)=>sum+s.duration,0);setPlaying(false);}
function renderPosition() {
  const total = durationOf(project);renderCameraControls();
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
  for(const category of ANIMATION_CATEGORIES){const group=document.createElement('optgroup');group.label=category;for(const c of clips.filter(c=>animationGroup(c)===category))group.append(new Option(c.name,c.id));if(group.children.length)picker.append(group);}
  picker.value=b.clip;$('animation-count').textContent=`${clips.length} / ${CLIPS.length}`;$('action-note').textContent=actionNote(b.clip,decodeCharacter(actorTrack().character,actorTrack().detail)?.weapon,loading?undefined:scene.seatsFor(project).length);$('action-note').title=$('action-note').textContent||'';
}
function renderVehicleLinks(actor:ActorTrack){
 const b=actor.beats[Math.min(selected,actor.beats.length-1)],model=VEHICLE_FOR_CLIP[b.clip];if(!model)return;
 const picker=select('beat-vehicle'),catalog=vehicleCatalog(project),source=catalog.get(vehicleKey(actor,b));
 picker.replaceChildren(new Option('Own vehicle',''));
 for(const entry of catalog.values())if(entry.model===model&&(entry.actor.id===actor.id||seatsForVehicle(model).length>1))picker.append(new Option(`${entry.actor.id===actor.id?'This vehicle':`Share · Character ${project.actors.indexOf(entry.actor)+1} · ${actorName(entry.actor)}`} · ${VEHICLE_LABELS[model]}${entry.beat.vehicleId?` · ${entry.id}`:''}`,entry.id));
 picker.value=b.vehicleId??'';
 const guest=source?.actor.id!==actor.id&&!!b.vehicleId,seats=guest?seatsForVehicle(model).filter(s=>s!=='operator'):['operator']as const;
 const free=b.vehicleId?availableVehicleSeats(project,actor.id,selected,b.vehicleId):[];
 select('beat-vehicle-seat').replaceChildren(...seats.map(s=>{const o=new Option(model==='helicopter'&&s==='operator'?'Pilot':SEAT_LABELS[s],s);o.disabled=guest&&!free.includes(s);return o;}));select('beat-vehicle-seat').value=b.vehicleSeat??'operator';
 $('vehicle-link-note').textContent=guest?`Entry, ride and exit use this seat on the shared vehicle. Travel follows its ${model==='helicopter'?'pilot':'driver'} automatically.`:'Vehicles wait in the set before boarding and remain parked after exit. Link other characters to this vehicle to add passengers.';
}
function renderTiming(){
  const total=durationOf(project);input('scrub').max=String(total);$('duration-label').textContent=`${Number(total.toFixed(2))} seconds`;
  $('ruler').replaceChildren();for(let i=0;i<=4;i++){const tick=document.createElement('span');tick.textContent=`${Number((total*i/4).toFixed(1))}s`;$('ruler').append(tick);}
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
      note.textContent=`${Number(item.duration.toFixed(2))}s${camera?' · '+(item.target==='all'?'Cast':`Character ${project.actors.findIndex(a=>a.id===item.target)+1}`):item.move?' · travel':''}${!camera&&item.weaponPose?' · '+({hold:'wield',aim:'aim',fire:'fire',hidden:'weapon hidden'}[item.weaponPose]):''}`;
      el.append(title,note);el.setAttribute('aria-label',`${label}: ${title.textContent}, ${note.textContent}`);el.setAttribute('aria-pressed',String(el.classList.contains('selected')));
      el.addEventListener('click',()=>{cameraSelection=camera;if(id)selectedActor=id;characterSelected=!!id;selected=i;time=items.slice(0,i).reduce((sum,b)=>sum+b.duration,0);setPlaying(false);renderUI();});blocks.append(timeline.decorate(el,camera?{kind:'camera',index:i}:{kind:'action',actor:id!,index:i}));
    });
    const length=items.reduce((s,b)=>s+b.duration,0);if(total-length>0.05){const hold=document.createElement('div');hold.className='track-hold';hold.style.flex='1';hold.textContent='Hold';blocks.append(hold);}
    lane.append(blocks);$('tracks').append(lane);
  };
  row('CAMERA',undefined,project.shots);for(const [i,a]of project.actors.entries())row(`${i+1} · ${actorName(a)}`,a.id,a.beats);
  if(project.texts.length){const lane=document.createElement('div');lane.className='track-lane text-track';const label=document.createElement('div');label.className='track-name';label.textContent='TEXT & SUBTITLES';const blocks=document.createElement('div');blocks.className='text-track-blocks';
    const ends:number[]=[];for(const cue of [...project.texts].sort((a,b)=>a.start-b.start)){let level=ends.findIndex(end=>end<=cue.start);if(level<0)level=ends.length;ends[level]=cue.start+cue.duration;
      const b=document.createElement('button');b.className='text-beat';b.textContent=cue.text||'Text';b.title=`${cue.style}: ${cue.text} (${cue.start}s–${cue.start+cue.duration}s)`;b.style.left=`${cue.start/total*100}%`;b.style.width=`${cue.duration/total*100}%`;b.style.top=`${Math.min(level,3)*23}px`;b.addEventListener('click',()=>{time=cue.start+.01;setPlaying(false);textEditor.open(cue.id);});blocks.append(timeline.decorate(b,{kind:'text',id:cue.id}));}
    blocks.style.height=`${Math.min(4,ends.length)*23}px`;lane.append(label,blocks);$('tracks').append(lane);}

  if(project.audio.speech.length||project.audio.music.track!=='none'){
    const lane=document.createElement('div');lane.className='track-lane text-track';const label=document.createElement('div');label.className='track-name';label.textContent=project.audio.muted?'SOUND · MUTED':'SOUND';
    const blocks=document.createElement('div');blocks.className='text-track-blocks';let rows=0;
    if(project.audio.music.track!=='none'){const music=document.createElement('button');music.className='text-beat music-beat';music.style.left=`${(project.audio.music.start??0)/total*100}%`;music.style.width=`${(project.audio.music.duration??Math.max(.1,total-(project.audio.music.start??0)))/total*100}%`;music.textContent=`Music · ${MUSIC_TRACKS.find(t=>t.id===project.audio.music.track)?.name??project.audio.music.track}`;music.onclick=()=>soundEditor.open();blocks.append(timeline.decorate(music,{kind:'music'}));rows++;}
    const ends:number[]=[];for(const cue of [...project.audio.speech].sort((a,b)=>a.start-b.start)){let level=ends.findIndex(t=>t<=cue.start);if(level<0)level=ends.length;ends[level]=cue.start+cue.duration;
      const clip=document.createElement('button');clip.className='text-beat audio-beat';clip.style.left=`${cue.start/total*100}%`;clip.style.width=`${cue.duration/total*100}%`;clip.style.top=`${(rows+Math.min(level,2))*23}px`;clip.textContent=`${cue.asset?'':'○ '}${cue.name}`;clip.title=`${cue.name} · ${cue.effect} · ${cue.start.toFixed(1)}s`;clip.onclick=()=>{time=cue.start;setPlaying(false);soundEditor.open(cue.id);};blocks.append(timeline.decorate(clip,{kind:'speech',id:cue.id}));}
    blocks.style.height=`${(rows+Math.min(3,ends.length))*23}px`;lane.append(label,blocks);$('tracks').append(lane);
  }

  if(project.audio.effects.length){
    const lane=document.createElement('div');lane.className='track-lane text-track';const label=document.createElement('div');label.className='track-name';label.textContent=project.audio.muted?'SOUND EFFECTS · MUTED':'SOUND EFFECTS';
    const blocks=document.createElement('div');blocks.className='text-track-blocks';const ends:number[]=[];
    for(const cue of [...project.audio.effects].sort((a,b)=>a.start-b.start)){let level=ends.findIndex(end=>end<=cue.start);if(level<0)level=ends.length;ends[level]=cue.start+cue.duration;
      const b=document.createElement('button');b.className='text-beat effect-beat';b.textContent=cue.name;b.title=`${cue.name} · ${cue.start.toFixed(2)}s`;b.style.left=`${cue.start/total*100}%`;b.style.width=`${cue.duration/total*100}%`;b.style.top=`${Math.min(level,2)*23}px`;b.onclick=()=>{time=cue.start;setPlaying(false);soundEditor.openEffects(cue.id);};blocks.append(timeline.decorate(b,{kind:'effect',id:cue.id}));}
    blocks.style.height=`${Math.min(3,ends.length)*23}px`;lane.append(label,blocks);$('tracks').append(lane);
  }

}
function renderUI() {
  if(!project.actors.some(a=>a.id===selectedActor)){selectedActor=project.actors[0].id;characterSelected=false;}
  if(!characterSelected){cameraSelection=true;clickToPlace=false;button('place-actor').setAttribute('aria-pressed','false');button('place-actor').textContent='Click to place';$('film').classList.remove('click-placement');}
  const a=actorTrack(), ai=project.actors.indexOf(a), items=cameraSelection?project.shots:a.beats;
  selected=Math.max(0,Math.min(selected,items.length-1));
  scene.selectionId=characterSelected?selectedActor:undefined;$('scene-name').textContent=sceneById.get(project.template)!.name;renderScenes();
  $('cast-roster').replaceChildren();for(const [i,actor]of project.actors.entries()){
    const b=document.createElement('button');b.className='cast-member';b.setAttribute('aria-pressed',String(characterSelected&&actor.id===selectedActor));b.textContent=`${i+1} · ${actorName(actor)}`;
    b.addEventListener('click',()=>{characterSelected=true;selectedActor=actor.id;cameraSelection=false;selected=0;renderUI();$('film').focus({preventScroll:true});});$('cast-roster').append(b);
  }
  $('add-actor').hidden=project.actors.length>=MAX_ACTORS;$('cast-count').textContent=`${project.actors.length} / ${MAX_ACTORS}`;$('remove-actor').hidden=project.actors.length===1;
  $('cast-status').textContent=characterSelected?`Selected: ${actorName(a)}`:'No character selected';
  $('key-help').textContent=characterSelected?'Arrows: move · Ctrl/⌘ + arrows: turn / height · Esc: deselect':'Arrows: orbit · click a character to select';
  const params=decodeCharacter(a.character,a.detail)??DEFAULT_PARAMS,picker=select('character');picker.replaceChildren();
  const isPreset=Object.hasOwn(PRESETS,params.name)&&presetCode(params.name)===a.character;
  if(!isPreset)picker.append(new Option(`${params.name||'Your character'} · custom`,'__custom'));
  for(const name of [...CAST,...Object.keys(PRESETS).filter(n=>!CAST.includes(n))])picker.append(new Option(name.replace(/^The /,''),name));picker.value=isPreset?params.name:'__custom';
  $<HTMLAnchorElement>('edit-character').href=`${BASE}app/#${new URLSearchParams({c:a.character,detail:a.detail})}`;
  renderTiming();
  const choices=select('timeline-selection');choices.replaceChildren();
  const shots=document.createElement('optgroup');shots.label='Camera';project.shots.forEach((s,i)=>shots.append(new Option(`${i+1}. ${s.shot} · ${s.duration}s`,`camera:${i}`)));choices.append(shots);
  for(const [i,actor]of project.actors.entries()){const group=document.createElement('optgroup');group.label=`${i+1} · ${actorName(actor)}`;actor.beats.forEach((b,j)=>group.append(new Option(`${j+1}. ${clipById.get(b.clip)!.name} · ${b.duration}s`,`${actor.id}:${j}`)));choices.append(group);}
  choices.value=`${cameraSelection?'camera':selectedActor}:${selected}`;
  renderTracks();$('beat-title').textContent=cameraSelection?`Camera shot ${selected+1}`:`Character ${ai+1} · action ${selected+1}`;$('shot-count').textContent=`${selected+1} of ${items.length}`;
  $('action-settings').hidden=cameraSelection;$('shot-settings').hidden=!cameraSelection;
  if(cameraSelection){const s=project.shots[selected];select('shot').value=s.shot;input('shot-duration').value=String(s.duration);select('shot-target').replaceChildren(new Option('Entire cast','all'));for(const [i,actor]of project.actors.entries())select('shot-target').append(new Option(`Character ${i+1} · ${actorName(actor)}`,actor.id));select('shot-target').value=s.target;}
  else{const b=a.beats[selected];const mounted=params.weapon!=='grenade'&&supportsWeaponAim(b.clip);$('weapon-action-settings').hidden=params.weapon==='none';select('beat-weapon-pose').value=b.weaponPose??'auto';for(const option of select('beat-weapon-pose').options)option.disabled=option.value!=='auto'&&option.value!=='hidden'&&(!mounted||option.value==='fire'&&!isFirearm(params.weapon));$('weapon-yaw-row').hidden=!mounted||b.weaponPose==='hidden';input('beat-weapon-yaw').value=String(b.weaponYaw??(RIDING_VEHICLES[b.clip]?defaultWeaponYaw(b.clip,b.vehicleSeat):0));$('weapon-pitch-row').hidden=!mounted||b.weaponPose==='hidden';input('beat-weapon-pitch').value=String(b.weaponPitch??0);renderAnimations();input('beat-duration').value=String(b.duration);input('movement').checked=b.move;const ride=VEHICLE_FOR_CLIP[b.clip];$('vehicle-action-settings').hidden=!ride;input('show-vehicle').checked=b.showVehicle??a.vehicle!=='none';$('helicopter-height-row').hidden=b.clip!=='fly_helicopter'||(b.vehicleSeat??'operator')!=='operator';input('helicopter-height').value=b.flightHeight===undefined?'':String(b.flightHeight);$('vehicle-speed-row').hidden=!ride||!b.move;input('vehicle-travel-speed').value=String(b.travelSpeed??(ride?VEHICLE_SPEED[ride]:1));}
  if(!cameraSelection)renderVehicleLinks(a);
  $('blocking-title').textContent=characterSelected?`Character ${ai+1} placement`:'Character placement';for(const key of ['x','y','z','yaw']as const)input(`actor-${key}`).value=String(a[key]);select('blocking').value=castArrangement(project.actors);
  $('cast-staging').hidden=project.actors.length>2;
  $('blocking-hint').textContent=project.actors.length<2?'Add another character to arrange the cast.':`Moves and turns all ${project.actors.length} characters.`;
  $('equipment-title').textContent='Equipment';select('actor-weapon').value=params.weapon;select('actor-carry').value=params.carry;
  const currentBeat=a.beats[Math.min(selected,a.beats.length-1)],vehicle=VEHICLE_FOR_CLIP[currentBeat.clip],source=vehicleCatalog(project).get(vehicleKey(a,currentBeat)),shared=source&&source.actor.id!==a.id,vehicleStyle=source?decodeCharacter(source.actor.character,source.actor.detail)!.vehicleStyle:params.vehicleStyle;
  $('vehicle-appearance').hidden=!vehicle||(!shared&&!(currentBeat.showVehicle??a.vehicle!=='none'));
  for(const key of ['color','accentColor','seatColor']as const)input(`vehicle-${key}`).value=vehicleStyle[key];
  for(const key of ['finish','variant']as const)select(`vehicle-${key}`).value=vehicleStyle[key];
  $('vehicle-note').textContent=vehicle?(shared?`${VEHICLE_LABELS[vehicle]} shared with ${actorName(source.actor)}. Appearance edits apply to the shared vehicle.`:`${VEHICLE_LABELS[vehicle]} follows this action. Visibility and travel are on the right.`):'Choose a riding or driving action to add its vehicle.';
  select('camera').value=project.camera;input('title').value=project.title;input('caption').checked=project.caption;$('stage').dataset.aspect=project.aspect;
  renderCameraControls();
  for(const aspect of ['landscape','portrait'])button(aspect).setAttribute('aria-pressed',String(project.aspect===aspect));
  const pending=pendingSpeech();$('speech-needed').hidden=!pending.length;$('speech-needed-copy').textContent=`${pending.length===1?'1 dialogue clip is':`${pending.length} dialogue clips are`} ready for a voice.`;
  textEditor.render();soundEditor.render();$('sound-readout').textContent=project.audio.muted?'Sound muted':hasAudio(project.audio)?'Sound on':'Silent film';lock();renderPosition();fitFilm();dirty=true;scheduleSessionSave();
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
/** Characters who sit use the set's furniture: move them onto the nearest free seat (part of the same edit). */
function seatCharacters(announce:boolean){
  const moved=seatCast(project,scene.seatsFor(project),new Map([...scene.actors].map(([id,a])=>[id,a.sitter])));
  if(!moved.length)return;
  project=parseProject(JSON.stringify(project));
  if(announce)notify(`${moved.map(id=>actorName(project.actors.find(a=>a.id===id)!)).join(' and ')} ${moved.length>1?'take':'takes'} the nearest seat in the set.`);
}
async function apply(next: StudioProject, keepHistory=true) {
  if(loading||exporting)return false;
  let valid:StudioProject;try{valid=parseProject(JSON.stringify(next));}catch(e){notify((e as Error).message);renderUI();return false;}
  let applied=true;
  const previous=project;if(keepHistory)remember();project=valid;soundtrack.invalidate();time=Math.min(time,durationOf(project));setPlaying(false);
  const needsBuild=project.actors.length!==scene.actors.size||project.actors.some(a=>builtRecipes.get(a.id)!==`${a.detail}:${a.character}`);
  if(needsBuild){loading=true;renderUI();try{await syncActors();}catch(e){applied=false;project=previous;if(keepHistory)history.pop();notify(`Character unchanged: ${(e as Error).message}`);}finally{loading=false;}}
  if(applied)seatCharacters(true);
  const {width,height}=dimensions();scene.resize(width,height);renderUI();save();return applied;
}
function edit(fn:(p:StudioProject)=>void){const next=structuredClone(project);fn(next);
  for(const actor of next.actors)if(project.actors.find(a=>a.id===actor.id)?.character!==actor.character)reconcileWeaponActions(actor);
  return apply(next);}
function undo(){if(loading||exporting||importing||placementBefore||timelineDragBefore||!history.length)return;void apply(parseProject(history.pop()!),false);}
const timeline=timelineHandles(document.querySelector<HTMLElement>('.timeline-scroll')!,{
  project:()=>project,canEdit:()=>!loading&&!exporting&&!importing&&!placementBefore&&!timelineDragBefore&&!document.querySelector('dialog[open]'),
  begin:ref=>{timelineDragBefore=JSON.stringify(project);setPlaying(false);scene.freezeCamera=true;
    if(ref.kind==='camera'||ref.kind==='action'){cameraSelection=ref.kind==='camera';characterSelected=ref.kind==='action';selected=ref.index;if(ref.kind==='action')selectedActor=ref.actor;}
    renderUI();
  },
  preview:(next,ref)=>{project=next;time=Math.min(time,durationOf(project));dirty=true;renderTiming();renderTracks();renderPosition();
    const timing=clipWindow(project,ref);if(ref.kind==='camera')input('shot-duration').value=String(Number(timing.duration.toFixed(3)));else if(ref.kind==='action')input('beat-duration').value=String(Number(timing.duration.toFixed(3)));
    $('key-help').textContent=`${timing.start.toFixed(2)}s – ${(timing.start+timing.duration).toFixed(2)}s · ${timing.duration.toFixed(2)}s · Esc: cancel`;
    for(const b of $('tracks').querySelectorAll<HTMLButtonElement>('button'))b.disabled=true;
  },
  end:cancelled=>{const before=timelineDragBefore;timelineDragBefore=undefined;scene.freezeCamera=false;if(!before)return;
    if(cancelled)project=JSON.parse(before)as StudioProject;
    else if(JSON.stringify(project)!==before){history.push(before);if(history.length>30)history.shift();soundtrack.invalidate();}
    time=Math.min(time,durationOf(project));renderUI();save();
  },error:notify,
});
input('scene-search').placeholder=`Search ${SETS.length} scenes…`;input('animation-search').placeholder='Search…';
for(const c of SCENE_CATEGORIES)select('scene-category').append(new Option(c,c));
input('scene-search').addEventListener('input',renderScenes);select('scene-category').addEventListener('change',renderScenes);
$('set-list').addEventListener('keydown',e=>{if(!['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const cards=[...$('set-list').querySelectorAll<HTMLButtonElement>('button')];const at=cards.indexOf(document.activeElement as HTMLButtonElement),to=e.key==='Home'?0:e.key==='End'?cards.length-1:Math.max(0,Math.min(cards.length-1,at+(['ArrowUp','ArrowLeft'].includes(e.key)?-1:1)));cards.forEach((b,i)=>b.tabIndex=i===to?0:-1);cards[to]?.focus();});
select('timeline-selection').addEventListener('change',()=>{const [id,index]=select('timeline-selection').value.split(':');cameraSelection=id==='camera';if(!cameraSelection)selectedActor=id;characterSelected=!cameraSelection;selected=Number(index);const items=cameraSelection?project.shots:actorTrack().beats;time=items.slice(0,selected).reduce((sum,b)=>sum+b.duration,0);setPlaying(false);renderUI();});
for(const c of ANIMATION_CATEGORIES)select('animation-category').append(new Option(c,c));
input('animation-search').addEventListener('input',renderAnimations);select('animation-category').addEventListener('change',renderAnimations);
select('character').addEventListener('change',()=>{const value=select('character').value;if(value!=='__custom')void edit(p=>p.actors.find(a=>a.id===selectedActor)!.character=presetCode(value));});
button('add-actor').addEventListener('click',()=>void edit(p=>{const actor=addCastActor(p);if(!actor)return;characterSelected=true;selectedActor=actor.id;selected=0;cameraSelection=false;}));
button('add-custom-actor').addEventListener('click',()=>input('custom-character-file').click());
input('custom-character-file').addEventListener('change',async()=>{
  const file=input('custom-character-file').files?.[0];if(!file||loading||exporting||importing)return;
  importing=true;setPlaying(false);lock();
  try{
    if(project.actors.length>=MAX_ACTORS)throw Error(`A film supports up to ${MAX_ACTORS} characters.`);
    if(file.size>100_000)throw Error('Use character settings smaller than 100 KB.');
    const params=readCharacterSettings(await file.text(),lib.catalog);
    if(await edit(p=>{const a=addCastActor(p,{code:encodeCharacter(params),detail:params.detail});if(a){selectedActor=a.id;characterSelected=true;selected=0;cameraSelection=false;}}))notify(`Added ${params.name||'your custom character'} to the cast.`);
  }catch(error){notify((error as Error).message);}finally{input('custom-character-file').value='';importing=false;renderUI();saveSession();}
});
button('remove-actor').addEventListener('click',()=>void edit(p=>{if(p.actors.length<=1)return;const removed=actorTrack().id;p.actors=p.actors.filter(a=>a.id!==removed);for(const s of p.shots)if(s.target===removed)s.target='all';p.texts=p.texts.filter(c=>c.anchor==='screen'||resolveTextActor(c.anchor)!==removed);for(const c of p.audio.speech)if(c.actor!=='narrator'&&resolveSpeechActor(c.actor)===removed)c.actor='narrator';for(const c of p.audio.effects)if(c.actor===removed)delete c.actor;selectedActor=p.actors[0].id;characterSelected=true;selected=0;cameraSelection=false;}));
for(const key of ['x','y','z','yaw']as const)input(`actor-${key}`).addEventListener('change',()=>void edit(p=>p.actors.find(a=>a.id===selectedActor)![key]=Number(input(`actor-${key}`).value)));
select('blocking').addEventListener('change',async()=>{
  const value=select('blocking').value as Arrangement;if(project.actors.length!==2||!ARRANGEMENTS.includes(value))return;
  if(!await edit(p=>arrangeCast(p.actors,value)))return;
  notify(castArrangement(project.actors)===value?`${ARRANGEMENT_LABELS[value]} applied to all ${project.actors.length} characters.`:'Cast placement updated. Seated characters use the set’s seats.');
});
button('undo').addEventListener('click',undo);button('play').addEventListener('click',()=>setPlaying(!playing));button('restart').addEventListener('click',()=>{time=0;if(playing)setPlaying(true);dirty=true;renderPosition();});
button('repeat').addEventListener('click',()=>{repeat=!repeat;button('repeat').classList.toggle('on',repeat);button('repeat').setAttribute('aria-pressed',String(repeat));});
input('scrub').addEventListener('input',()=>{setPlaying(false);time=Number(input('scrub').value);dirty=true;renderPosition();});
select('action').addEventListener('change',()=>void edit(p=>{const b=p.actors.find(a=>a.id===selectedActor)!.beats[selected];const priorModel=VEHICLE_FOR_CLIP[b.clip];b.clip=select('action').value;if(clipById.get(b.clip)?.vehicleTransition)b.duration=clipById.get(b.clip)!.duration;b.move=false;delete b.travelSpeed;delete b.flightHeight;delete b.showVehicle;delete b.weaponPose;delete b.weaponYaw;delete b.weaponPitch;if(priorModel!==VEHICLE_FOR_CLIP[b.clip]){delete b.vehicleId;delete b.vehicleSeat;}const a=p.actors.find(a=>a.id===selectedActor)!;a.vehicle='auto';}));
input('beat-duration').addEventListener('change',()=>void edit(p=>p.actors.find(a=>a.id===selectedActor)!.beats[selected].duration=Number(input('beat-duration').value)));
button('clip-length').addEventListener('click',()=>void edit(p=>{const b=p.actors.find(a=>a.id===selectedActor)!.beats[selected];b.duration=Math.min(12,clipById.get(b.clip)!.duration);}));
select('beat-weapon-pose').addEventListener('change',()=>void edit(p=>{const b=p.actors.find(a=>a.id===selectedActor)!.beats[selected],value=select('beat-weapon-pose').value;if(value==='auto')delete b.weaponPose;else b.weaponPose=value as WeaponPose;}));
input('beat-weapon-yaw').addEventListener('change',()=>void edit(p=>{p.actors.find(a=>a.id===selectedActor)!.beats[selected].weaponYaw=Number(input('beat-weapon-yaw').value);}));
input('show-vehicle').addEventListener('change',()=>void edit(p=>{p.actors.find(a=>a.id===selectedActor)!.beats[selected].showVehicle=input('show-vehicle').checked;}));
input('vehicle-travel-speed').addEventListener('change',()=>void edit(p=>{p.actors.find(a=>a.id===selectedActor)!.beats[selected].travelSpeed=Number(input('vehicle-travel-speed').value);}));
input('helicopter-height').addEventListener('change',()=>void edit(p=>{const b=p.actors.find(a=>a.id===selectedActor)!.beats[selected];if(input('helicopter-height').value.trim()==='')delete b.flightHeight;else b.flightHeight=Number(input('helicopter-height').value);}));
select('beat-vehicle').addEventListener('change',()=>{
 const id=select('beat-vehicle').value||undefined,source=id?vehicleCatalog(project).get(id):undefined,guest=source&&source.actor.id!==selectedActor,free=id&&guest?availableVehicleSeats(project,selectedActor,selected,id):[];
 if(guest&&!free.length){notify('All passenger seats are occupied during this sequence. Choose another vehicle or change the timing.');renderUI();return;}
 void edit(p=>assignVehicle(p,selectedActor,selected,id,guest?free[0]:'operator'));
});
select('beat-vehicle-seat').addEventListener('change',()=>void edit(p=>assignVehicle(p,selectedActor,selected,select('beat-vehicle').value||undefined,select('beat-vehicle-seat').value as VehicleSeat)));
input('movement').addEventListener('change',()=>void edit(p=>p.actors.find(a=>a.id===selectedActor)!.beats[selected].move=input('movement').checked));
select('shot').addEventListener('change',()=>void edit(p=>p.shots[selected].shot=select('shot').value as typeof p.shots[number]['shot']));
select('shot-target').addEventListener('change',()=>void edit(p=>p.shots[selected].target=select('shot-target').value));
input('shot-duration').addEventListener('change',()=>void edit(p=>p.shots[selected].duration=Number(input('shot-duration').value)));
input('shot-custom-camera').addEventListener('change',()=>{seekSelectedShot();void edit(p=>{const shot=p.shots[selected];if(input('shot-custom-camera').checked){shot.view=structuredClone(p.view);shot.camera=p.camera;}else{delete shot.view;delete shot.camera;}});});
for(const key of ['azimuth','elevation','zoom']as const)input(`shot-${key}`).addEventListener('change',()=>{seekSelectedShot();void edit(p=>{const shot=p.shots[selected];shot.view={...(shot.view??p.view),[key]:Number(input(`shot-${key}`).value)};});});
select('shot-camera').addEventListener('change',()=>{seekSelectedShot();void edit(p=>p.shots[selected].camera=select('shot-camera').value as typeof p.camera);});
select('camera').addEventListener('change',()=>void edit(p=>p.camera=select('camera').value as typeof p.camera));
for(const aspect of ['landscape','portrait']as const)button(aspect).addEventListener('click',()=>void edit(p=>p.aspect=aspect));
input('title').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();input('title').blur();}});
input('title').addEventListener('blur',()=>titleEditing=false);input('title').addEventListener('input',()=>{if(loading||exporting)return;if(!titleEditing){remember();titleEditing=true;}project.title=input('title').value.slice(0,60);save();lock();dirty=true;});
input('caption').addEventListener('change',()=>void edit(p=>p.caption=input('caption').checked));
button('view-reset').addEventListener('click',()=>void edit(p=>{const shot=shotAt(p,time).shot;if(shot.view||shot.camera)shot.view={azimuth:0,elevation:0,zoom:1};else p.view={azimuth:0,elevation:0,zoom:1};}));
function clearSelection(){
  if(!characterSelected)return false;
  characterSelected=false;cameraSelection=true;selected=shotAt(project,time).index;clickToPlace=false;
  button('place-actor').setAttribute('aria-pressed','false');button('place-actor').textContent='Click to place';$('film').classList.remove('click-placement');
  renderUI();return true;
}
button('deselect-actor').addEventListener('click',()=>clearSelection());
$('stage').addEventListener('pointerdown',e=>{if(e.target!==scene.canvas&&!loading&&!exporting&&!importing&&!placementBefore&&!timelineDragBefore)clearSelection();});
function fitFilm(){
  const stage=$('stage'),frame=stage.querySelector<HTMLElement>('.film-frame')!,style=getComputedStyle(stage);
  const width=stage.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),height=stage.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom),ratio=project.aspect==='landscape'?16/9:9/16;
  if(width>0&&height>0){const w=Math.min(width,height*ratio);frame.style.width=`${w}px`;frame.style.height=`${w/ratio}px`;}
}
new ResizeObserver(fitFilm).observe($('stage'));addEventListener('resize',fitFilm);
function setWide(wide:boolean,persist=true){
  document.querySelector('.workspace')!.classList.toggle('wide',wide);
  button('expand-view').setAttribute('aria-pressed',String(wide));button('expand-view').innerHTML=wide?'Show editor <span aria-hidden="true">⤡</span>':'Expand <span aria-hidden="true">⤢</span>';
  try{if(persist)localStorage.setItem('ara.studio.wide',wide?'1':'0');}catch{ /* The layout choice is a convenience. */ }
}
// Drag the handle between preview and timeline; the split is remembered.
{
  const handle=$('timeline-resizer'),director=document.querySelector<HTMLElement>('.director')!,timeline=document.querySelector<HTMLElement>('.timeline')!;
  const setMax=(px?:number)=>{
    if(px===undefined){director.style.removeProperty('--timeline-max');try{localStorage.removeItem('ara.studio.timeline');}catch{ /* Optional. */ }return;}
    const max=Math.max(90,Math.min(director.clientHeight-260,px));director.style.setProperty('--timeline-max',`${Math.round(max)}px`);
    try{localStorage.setItem('ara.studio.timeline',String(Math.round(max)));}catch{ /* Optional. */ }
  };
  handle.addEventListener('pointerdown',e=>{
    e.preventDefault();handle.setPointerCapture(e.pointerId);handle.classList.add('dragging');
    const startY=e.clientY,start=timeline.getBoundingClientRect().height;
    const move=(m:PointerEvent)=>setMax(start+startY-m.clientY);
    const up=()=>{handle.classList.remove('dragging');handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',up);handle.removeEventListener('pointercancel',up);};
    handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',up);handle.addEventListener('pointercancel',up);
  });
  handle.addEventListener('dblclick',()=>setMax());
  // Fade the bottom edge while more rows are hidden below.
  const rows=document.querySelector<HTMLElement>('.timeline-scroll')!,hint=()=>rows.classList.toggle('more',rows.scrollTop+rows.clientHeight<rows.scrollHeight-2);
  rows.addEventListener('scroll',hint);new ResizeObserver(hint).observe(rows);new MutationObserver(hint).observe(rows,{childList:true,subtree:true});
  handle.addEventListener('keydown',e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();e.stopPropagation();setMax(timeline.getBoundingClientRect().height+(e.key==='ArrowUp'?30:-30));}});
  try{const saved=Number(localStorage.getItem('ara.studio.timeline'));if(saved>0)director.style.setProperty('--timeline-max',`${saved}px`);}catch{ /* Default split. */ }
}
// Character-only controls explain how to select someone instead of silently ignoring clicks.
const SELECT_FIRST='Select a character first: click them in the preview, or choose one under The cast.';
for(const id of ['equipment-settings','actor-placement-settings']){
  const section=$(id),heading=section.querySelector('h2')!,hint=document.createElement('p'),guard=document.createElement('button');
  hint.className='select-first-hint';hint.textContent='Select a character to change this.';heading.after(hint);
  guard.type='button';guard.className='select-first';guard.title=SELECT_FIRST;guard.setAttribute('aria-label',SELECT_FIRST);section.append(guard);
  guard.addEventListener('click',()=>{
    hint.textContent=SELECT_FIRST;hint.classList.remove('urgent');void hint.offsetWidth;hint.classList.add('urgent');
    const cast=$('cast-roster');cast.classList.remove('attention');void cast.offsetWidth;cast.classList.add('attention');setTimeout(()=>cast.classList.remove('attention'),1700);notify(SELECT_FIRST);
  });
}
button('expand-view').addEventListener('click',()=>setWide(button('expand-view').getAttribute('aria-pressed')!=='true'));
try{if(localStorage.getItem('ara.studio.wide')==='1')setWide(true);}catch{ /* Default layout. */ }
button('place-actor').addEventListener('click',()=>{clickToPlace=!clickToPlace;button('place-actor').setAttribute('aria-pressed',String(clickToPlace));button('place-actor').textContent=clickToPlace?'Click a spot…':'Click to place';$('film').classList.toggle('click-placement',clickToPlace);});
for(const id of WEAPONS)select('actor-weapon').append(new Option(WEAPON_LABELS[id],id));
for(const id of CARRIED)select('actor-carry').append(new Option(CARRY_LABELS[id],id));
for(const key of ['color','accentColor','seatColor','finish','variant']as const){
  const control=$<HTMLInputElement|HTMLSelectElement>(`vehicle-${key}`);
  control.addEventListener('change',()=>void edit(p=>{const selectedTrack=p.actors.find(a=>a.id===selectedActor)!,b=selectedTrack.beats[Math.min(selected,selectedTrack.beats.length-1)],a=vehicleCatalog(p).get(vehicleKey(selectedTrack,b))?.actor??selectedTrack,params=decodeCharacter(a.character,a.detail)!;params.vehicleStyle={...params.vehicleStyle,[key]:control.value}as VehicleStyle;a.character=encodeCharacter(params);}));
}
for(const [id,slot]of [['actor-weapon','weapon'],['actor-carry','carry']]as const)select(id).addEventListener('change',()=>void edit(p=>{const a=p.actors.find(a=>a.id===selectedActor)!;a.character=equipActor(a,slot,select(id).value);}));
orbitControls($<HTMLCanvasElement>('film'),()=>shotAt(project,time).shot.view??project.view,()=>!loading&&!exporting&&!importing&&!timelineDragBefore,()=>{remember();setPlaying(false);},v=>{const shot=shotAt(project,time).shot;if(shot.view||shot.camera)shot.view=v;else project.view=v;dirty=true;renderCameraControls();},()=>{lock();save();},{
  pick:(x,y)=>{setPlaying(false);scene.render(project,time);return scene.pickActor(x,y);},
  select:id=>{characterSelected=true;selectedActor=id;cameraSelection=false;selected=timelineAt(project,time,actorTrack()).index;setPlaying(false);renderUI();},
  selected:()=>{if(!characterSelected)return;const a=actorTrack(),rendered=scene.actors.get(a.id);if(!rendered)return;const position=rendered.stagePosition,p=position.clone().project(scene.camera),r=scene.canvas.getBoundingClientRect();return{id:a.id,x:a.x,y:a.y,z:a.z,worldX:position.x,worldZ:position.z,screenX:r.left+(p.x+1)*r.width/2,screenY:r.top+(1-p.y)*r.height/2};},
  deselect:clearSelection,
  nudge:(key,modified)=>{
    if(!characterSelected)return false;
    if(!placementBefore){placementBefore=JSON.stringify(project);scene.freezeCamera=true;setPlaying(false);lock();}
    const a=actorTrack();
    if(modified){if(key==='ArrowLeft'||key==='ArrowRight')a.yaw=((a.yaw+(key==='ArrowLeft'?-5:5)+540)%360)-180;else a.y=Math.round(Math.max(0,Math.min(3,a.y+(key==='ArrowUp'?.05:-.05)))*1000)/1000;}
    else{const m=scene.camera.matrixWorld.elements,length=Math.hypot(m[8],m[10])||1;
      const dx=key==='ArrowLeft'?-m[0]:key==='ArrowRight'?m[0]:key==='ArrowUp'?-m[8]/length:m[8]/length;
      const dz=key==='ArrowLeft'?-m[2]:key==='ArrowRight'?m[2]:key==='ArrowUp'?-m[10]/length:m[10]/length;
      a.x=Math.max(-STAGE_LIMIT,Math.min(STAGE_LIMIT,a.x+dx*.1));a.z=Math.max(-STAGE_LIMIT,Math.min(STAGE_LIMIT,a.z+dz*.1));}
    for(const field of ['x','y','z','yaw']as const)input(`actor-${field}`).value=String(Number(a[field].toFixed(3)));dirty=true;return true;
  },
  point:(x,y,elevation)=>scene.groundPoint(x,y,elevation),clickToPlace:()=>clickToPlace,
  begin:()=>{placementBefore=JSON.stringify(project);scene.freezeCamera=true;setPlaying(false);lock();},
  move:(x,z)=>{const a=actorTrack();a.x=Math.max(-STAGE_LIMIT,Math.min(STAGE_LIMIT,x));a.z=Math.max(-STAGE_LIMIT,Math.min(STAGE_LIMIT,z));input('actor-x').value=String(Number(a.x.toFixed(2)));input('actor-z').value=String(Number(a.z.toFixed(2)));dirty=true;},
  end:cancelled=>{const before=placementBefore;placementBefore=undefined;scene.freezeCamera=false;if(!before)return;
    if(cancelled)project=JSON.parse(before) as StudioProject;
    else if(JSON.stringify(project)!==before){history.push(before);if(history.length>30)history.shift();const a=actorTrack();a.x=Number(a.x.toFixed(3));a.z=Number(a.z.toFixed(3));save();}
    renderUI();scene.render(project,time);dirty=false;
  },
});
button('add-beat').addEventListener('click',()=>void edit(p=>{const a=p.actors.find(a=>a.id===selectedActor)!;const d=Math.min(3,MAX_DURATION-trackDuration(a));if(d<0.1||a.beats.length>=MAX_ACTIONS)return;a.beats.push(beat('idle',d));cameraSelection=false;selected=a.beats.length-1;}));
button('add-shot').addEventListener('click',()=>void edit(p=>{const d=Math.min(3,MAX_DURATION-p.shots.reduce((s,b)=>s+b.duration,0));if(d<0.1||p.shots.length>=MAX_SHOTS)return;p.shots.push({id:beatId(),duration:d,shot:'wide',target:'all'});cameraSelection=true;selected=p.shots.length-1;}));
button('remove-beat').addEventListener('click',()=>void edit(p=>{const items=cameraSelection?p.shots:p.actors.find(a=>a.id===selectedActor)!.beats;if(items.length>1)items.splice(selected,1);selected=Math.max(0,selected-1);}));
for(const [id,offset]of [['earlier',-1],['later',1]]as const)button(id).addEventListener('click',()=>void edit(p=>{const items=cameraSelection?p.shots:p.actors.find(a=>a.id===selectedActor)!.beats,to=selected+offset;if(to<0||to>=items.length)return;[items[selected],items[to]]=[items[to],items[selected]];selected=to;}));
async function saveProject():Promise<boolean>{save();button('save-project').disabled=true;try{
  if(project.audio.speech.some(c=>c.asset))download(await audioProjectBundle(project),`${filename()}.ara-studio.zip`);
  else download(new Blob([JSON.stringify(project,null,2)],{type:'application/json'}),`${filename()}.ara-studio.json`);
  notify('Editable project saved, including attached audio.');return true;
}catch(error){notify((error as Error).message);return false;}finally{lock();}}
button('save-project').addEventListener('click',()=>void saveProject());
const newProjectDialog=$<HTMLDialogElement>('new-project-dialog');
button('new-project').addEventListener('click',()=>{
  if(loading||exporting||importing||placementBefore||timelineDragBefore||document.querySelector('dialog[open]'))return;
  setPlaying(false);saveSession();$('new-project-message').textContent='';newProjectDialog.showModal();
});
button('cancel-new-project').addEventListener('click',()=>newProjectDialog.close());
newProjectDialog.addEventListener('cancel',event=>{if(importing)event.preventDefault();});
async function startNewProject(keepCopy:boolean){
  if(loading||exporting||importing||placementBefore||timelineDragBefore)return;
  importing=true;lock();
  for(const id of ['cancel-new-project','confirm-new-project','save-new-project'])button(id).disabled=true;
  $('new-project-message').textContent=keepCopy?'Saving your current film…':'Preparing a fresh project…';
  try{
    if(keepCopy&&!await saveProject()){$('new-project-message').textContent=$('notice').textContent;return;}
    if(!await apply(blankProject())){$('new-project-message').textContent=$('notice').textContent;return;}
    selectedActor=project.actors[0].id;selected=0;characterSelected=true;cameraSelection=false;time=0;repeat=true;clickToPlace=false;titleEditing=false;
    for(const id of ['scene-search','scene-category','animation-search','animation-category'])input(id).value='';
    button('repeat').classList.add('on');button('repeat').setAttribute('aria-pressed','true');
    button('place-actor').setAttribute('aria-pressed','false');button('place-actor').textContent='Click to place';$('film').classList.remove('click-placement');
    assist.restore({});textEditor.select('');soundEditor.select('');
    if(movieUrl)URL.revokeObjectURL(movieUrl);movieUrl='';renderedRecipe='';movieInfo='';speechToFix=undefined;
    const preview=$<HTMLVideoElement>('export-preview');preview.removeAttribute('src');preview.load();preview.hidden=true;
    $('download-film').removeAttribute('href');$('download-film').hidden=true;
    try{sessionStorage.removeItem(HANDOFF);}catch{/* Optional builder handover. */}
    const hash=new URLSearchParams(location.hash.slice(1));for(const key of ['c','detail','studioReturn'])hash.delete(key);historyReplaceHash(hash.toString());
    renderUI();newProjectDialog.close();$('film').focus({preventScroll:true});
    for(const element of document.querySelectorAll('.library,.inspector,#set-list,.timeline-scroll'))element.scrollTop=element.scrollLeft=0;
    notify('New project ready. Undo brings back your previous film.');
  }catch(error){$('new-project-message').textContent=(error as Error).message;}
  finally{importing=false;for(const id of ['cancel-new-project','confirm-new-project','save-new-project'])button(id).disabled=false;lock();saveSession();}
}
button('confirm-new-project').addEventListener('click',()=>void startNewProject(false));
button('save-new-project').addEventListener('click',()=>void startNewProject(true));
button('load-project').addEventListener('click',()=>input('project-file').click());
async function importStudioProject(source: string | File): Promise<boolean> {
  if(loading||exporting||importing||placementBefore||timelineDragBefore)return false;
  saveSession();importing=true;setPlaying(false);lock();
  try {
    const bundle=typeof source!=='string'&&(/\.zip$/i.test(source.name)||source.type==='application/zip');
    if(!bundle&&typeof source!=='string'&&source.size>100_000)throw Error('Use JSON smaller than 100 KB.');
    const next=bundle?await openAudioBundle(source as File,lib.catalog):parseStudioInput(typeof source==='string'?source:await source.text(),lib.catalog);
    if(!await apply(next))return false;
    selectedActor=project.actors[0].id;characterSelected=true;cameraSelection=false;selected=0;time=0;
    renderUI();return true;
  } finally {importing=false;lock();saveSession();}
}
input('project-file').addEventListener('change',async()=>{
  const file=input('project-file').files?.[0];if(!file)return;
  input('project-file').setAttribute('aria-busy','true');
  try{await importStudioProject(file);}catch(e){notify((e as Error).message);}
  finally{input('project-file').value='';input('project-file').setAttribute('aria-busy','false');}
});
const soundEditor=setupSoundEditor({project:()=>project,time:()=>time,actor:()=>characterSelected?selectedActor:undefined,pause:()=>setPlaying(false),
  canEdit:()=>!loading&&!exporting&&!importing&&!placementBefore&&!timelineDragBefore,edit:(fn,remember=true)=>{const next=structuredClone(project);fn(next);return apply(next,remember);},download,changed:()=>soundtrack.invalidate()});
const textEditor=setupTextEditor({project:()=>project,time:()=>time,actor:()=>characterSelected?selectedActor:undefined,
  canEdit:()=>!loading&&!exporting&&!importing&&!placementBefore&&!timelineDragBefore,edit:(fn,keepHistory=true)=>{const next=structuredClone(project);fn(next);return apply(next,keepHistory);},
  seek:t=>{time=t;setPlaying(false);renderPosition();dirty=true;},download});
const assist=setupAssist({project:()=>project,catalog:()=>lib.catalog,bodies:()=>fittedSpatialBodies(scene.actors),canEdit:()=>!loading&&!exporting&&!importing&&!placementBefore&&!timelineDragBefore,
  load:next=>importStudioProject(JSON.stringify(next))});
setupSpatialReview({project:()=>project,actors:()=>scene.actors,canOpen:()=>!loading&&!exporting&&!importing&&!placementBefore&&!timelineDragBefore,pause:()=>setPlaying(false),seek:t=>{time=t;renderPosition();dirty=true;},download});
const tour=setupStudioTour({canOpen:()=>!loading&&!exporting&&!importing&&!placementBefore&&!timelineDragBefore,begin:()=>{
  const wide=document.querySelector('.workspace')!.classList.contains('wide');setPlaying(false);setWide(false,false);
  return()=>setWide(wide,false);
}});
button('prepare-speech').addEventListener('click',()=>soundEditor.open(pendingSpeech()[0]?.id,true));
button('snapshot').addEventListener('click',()=>{scene.render(project,time);scene.output.toBlob(b=>{if(b)download(b,`${filename()}-frame.png`);},'image/png');});
$('edit-character').addEventListener('click',e=>{if(!characterSelected||loading||exporting||importing||placementBefore){e.preventDefault();return;}try{const token=crypto.randomUUID();sessionStorage.setItem(HANDOFF,JSON.stringify({token,actorId:actorTrack().id,project}));$<HTMLAnchorElement>('edit-character').href=`${BASE}app/#${new URLSearchParams({c:actorTrack().character,detail:actorTrack().detail,studioReturn:token})}`;}catch{ /* The ordinary character link still works if session storage is unavailable. */ }});
document.addEventListener('keydown',e=>{if((e.target as HTMLElement).closest('input,select,textarea,button')||document.querySelector('dialog[open]'))return;if(e.code==='Space'){e.preventDefault();setPlaying(!playing);}if(e.key.toLowerCase()==='f'&&!e.metaKey&&!e.ctrlKey&&!e.altKey)button('expand-view').click();if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo();}});
let lastTime=performance.now();
function tick(now:number){const elapsed=Math.min(.1,Math.max(0,(now-lastTime)/1000));lastTime=now;
  if(!exporting&&!loading&&scene.actors.size){
    if(playing&&!preparingSound){time=soundtrack.position()??time+elapsed;const total=durationOf(project);if(time>=total){if(repeat){time=0;setPlaying(true);}else{time=total;setPlaying(false);}}dirty=true;if(now-lastSessionSave>1000)saveSession();}
    if(dirty){scene.render(project,time);renderPosition();dirty=false;}
  }requestAnimationFrame(tick);}
requestAnimationFrame(tick);
const dialog = $<HTMLDialogElement>('export-dialog');
async function updateCapability() {
  const token = ++capabilityToken, size = Number(select('resolution').value), { width, height } = dimensions(size);
  speechToFix=pendingSpeech()[0]?.id;$('export-fix-audio').hidden=!speechToFix;$('export-audio-label').textContent=hasAudio(project.audio)?'Stereo soundtrack':'Silent MP4';
  if(speechToFix){button('start-export').disabled=true;$('export-message').textContent='Add a voice to your dialogue before exporting. Generate speech or attach your own recording.';return;}
  button('start-export').disabled = true; $('export-message').textContent = 'Checking video export on this browser…';
  const supported = await supportsMp4(width, height),soundSupported=!hasAudio(project.audio)||!!await audioCodec();
  if (token !== capabilityToken || !dialog.open) return;
  button('start-export').disabled = !supported||!soundSupported;
  $('export-message').textContent = !soundSupported?'This browser cannot encode MP4 audio. Save the WAV soundtrack, use another browser, or mute the film.':supported ? '' : 'This browser cannot encode this MP4 size. Try 720p, or use a current Chrome, Edge or Safari browser. You can still save a frame or project.';
}
button('open-export').addEventListener('click', () => {
  setPlaying(false); $('export-length').textContent = `${Number(durationOf(project).toFixed(1))} seconds`;
  $('export-options').hidden = false; $('export-progress').hidden = true; $('cancel-export').hidden = true;
  const hasFilm = !!movieUrl && renderedRecipe === JSON.stringify(project);
  $('download-film').hidden = !hasFilm; $('export-preview').hidden = !hasFilm; $('render-again').hidden = !hasFilm; $('start-export').hidden = hasFilm;
  $('export-options').hidden = hasFilm; $('export-message').textContent = hasFilm ? movieInfo : '';
  $('export-fix-audio').hidden=true;dialog.showModal(); if (!hasFilm) void updateCapability();
});
button('export-fix-audio').addEventListener('click',()=>{dialog.close();soundEditor.open(speechToFix,true);});
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
    if(e instanceof SpeechAudioRequired){speechToFix=e.cueId;$('export-fix-audio').hidden=false;}
  } finally {
    exporting = false; controller = undefined; time = before; dirty = true; $('cancel-export').hidden = true; lock();
    if (!button('start-export').hidden) button('start-export').disabled = false;
  }
});
window.addEventListener('beforeunload', (e) => { saveSession();if (exporting) { e.preventDefault(); } });

async function start() {
  const hash=new URLSearchParams(location.hash.slice(1)),code=hash.get('c');
  let recovered:ReturnType<typeof readEditorSession>,resume:EditorState|undefined,acceptedLink=false,returned=false;
  try{recovered=readEditorSession(localStorage.getItem(SESSION_KEY));}catch{ /* Storage may be unavailable. */ }
  function recover(){
    if(recovered){project=recovered.project;restoreEditor(recovered.editor,recovered.history);resume=recovered.editor;}
    else{const saved=localStorage.getItem(STORAGE)||localStorage.getItem('ara.studio.project.v1');if(saved)project=parseProject(saved);}
  }
  try{
    if(code){
      if(!decodeCharacter(code,'medium'))throw Error('The character link is invalid.');
      const d=hash.get('detail'),detail=d==='low'||d==='high'?d:'medium';
      const pending=hash.get('studioReturn')?JSON.parse(sessionStorage.getItem(HANDOFF)||'null'):null;
      if(pending&&pending.token===hash.get('studioReturn')){
        project=parseProject(JSON.stringify(pending.project));
        if(recovered){restoreEditor(recovered.editor,recovered.history);resume=recovered.editor;}
        const a=project.actors.find(a=>a.id===pending.actorId);if(!a)throw Error('The selected character is missing.');
        remember();a.character=code;a.detail=detail;reconcileWeaponActions(a);selectedActor=a.id;characterSelected=true;cameraSelection=false;
        project=parseProject(JSON.stringify(project));returned=true;
      }else if(!recovered&&(performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming|undefined)?.type==='reload'&&(localStorage.getItem(STORAGE)||localStorage.getItem('ara.studio.project.v1'))){
        // Recover edits made by older versions that left the original character recipe in the URL.
        recover();
      }else project=newProject('portrait',code,detail);
      acceptedLink=true;
    }else recover();
  }catch(e){notify((e as Error).message);try{recover();}catch{ /* Keep the default project if saved data is invalid. */ }}
  renderUI();
  try{
    const assets=new URL(`${BASE}assets/`,location.href).href;lib=await new AssetLibrary(fetchSource(assets)).initCatalog();engine=new Engine(lib,assets);await syncActors();seatCharacters(false);loading=false;renderUI();
    if(resume){
      document.querySelector('.library')!.scrollTop=resume.scroll.library;document.querySelector('.inspector')!.scrollTop=resume.scroll.inspector;$('set-list').scrollTop=resume.scroll.sets;window.scrollTo(0,resume.scroll.page);
      if(resume.assist.open)void assist.open();else if(resume.text.open)textEditor.open(resume.text.selected);else if(resume.sound.open){if(resume.sound.tab==='effects')soundEditor.openEffects(resume.sound.selectedEffect);else soundEditor.open(resume.sound.selected);}
    }
    const saved=save();
    if(acceptedLink&&saved){
      // Consume an import once; reloading must reopen the edited film rather than recreate the incoming character.
      for(const key of ['c','detail','studioReturn'])hash.delete(key);
      historyReplaceHash(hash.toString());if(returned)sessionStorage.removeItem(HANDOFF);
    }
    tour.ready();
  }catch(e){$('loading-label').textContent='The cast could not load.';$('loading').querySelector('span:last-child')!.textContent='Reload to try again.';notify((e as Error).message);}
}
function historyReplaceHash(hash:string){const url=new URL(location.href);url.hash=hash;window.history.replaceState(window.history.state,'',url);}

void start();
if(new URLSearchParams(location.hash.slice(1)).has('demo'))Object.assign(window,{studio:{scene,get project(){return project;},seek:(t:number)=>{time=t;dirty=true;setPlaying(false);},get ready(){return !loading&&!importing&&scene.actors.size===project.actors.length;},exportMovie,supportsMp4,setProject:apply,sets:SETS,audio:{playback:soundtrack,editor:soundEditor}}});

input('beat-weapon-pitch').addEventListener('change',()=>void edit(p=>{p.actors.find(a=>a.id===selectedActor)!.beats[selected].weaponPitch=Number(input('beat-weapon-pitch').value);}));
