import {AirView} from './air-view';
import {saveSetup,openSetup} from './project-bundle';
import {finishLoading,paintLoading,savedGame} from './loading';
import {storyEditor} from './story-editor';
import {generateImportedVoices} from './voice-import';
import {objectiveEditor} from './objective-editor';
import {needsCompanion} from './objectives';
import {defaultEnvironment,type EnvironmentSettings} from './environment';
import {defaultCity,type CitySettings} from './city';
import {availableRadioCountries} from './radio';
import {isGun,weaponProfile} from './weapons';
import {ENEMY_ROLES,roleDefaults,type EnemyKind,type EnemyHealth} from './enemy-roles';
/** Creator shell. The shared player also runs independently in downloaded games. */
import './setup.css';
import {assistPanel} from '../app/assist/panel';
import {generatePlayGuide,parsePlayInput,checkPlayPlacements,playExample,campaignExample,raceExample,runnerExample,describeGame} from './assist';
import {installSetupChoices,paintSetupSummary} from './setup-ui';
import {DrivingView} from './driving-view';
import {AssetLibrary,fetchSource} from '../core/assets';
import {PRESETS,type HumanParams} from '../core/params';
import {Engine} from '../app/engine';
import {decodeCharacter,encodeCharacter} from '../app/share';
import {readCharacterSettings} from '../app/character-file';
import {prepareGameCast,castActors,type PlayCast} from './cast';
import {type Aggression} from './enemies';
import {GameScene} from './scene';
import {CAMERA_VIEWS,MUSIC_TRACKS,type CameraView,type MusicId} from './presentation';
import {GameMusic} from './music';
import {EscapeGame} from './runtime';
import {castsCompanion,defaultProject,parseProject,preset,playable,resizeEnemies,heroWeapon,gameStem,gameProjects,chapterProject,chapterSettings,MAX_CHAPTERS,type PlayProject} from './project';
import {defaultDriving,type DrivingSettings} from './driving';
import {LOCATIONS,type LocationId} from './locations';
import {PLANS,defaultMission,missionTimeLimit,usesPickup,missionGoal,extractionMode} from './mission';
import type {Health,Ammunition} from './combat';
import {mountPlayer,actorRadius,type Player} from './player';
import {setupGameDownload} from './download-ui';
import {modeEditor} from './arcade/editor';
import {retitle,arcadeTitle,RUNNER_THEMES} from './arcade/modes';
import {TRACK_IDS} from './arcade/track';
const $=<T extends HTMLElement>(id:string)=>document.getElementById(id)as T;
const button=(id:string)=>$<HTMLButtonElement>(id),select=(id:string)=>$<HTMLSelectElement>(id);
const canvas=$<HTMLCanvasElement>('game'),setup=$<HTMLDialogElement>('setup');
const storage='ara.play.escape.v1';let project=defaultProject(),draft=structuredClone(project),draftRoot=structuredClone(project),editingChapter=0,loading=true,engine:Engine,lib:AssetLibrary,scene:GameScene,player:Player,pendingCast:PlayCast|undefined,gameCast:PlayCast;
const musicPreview=new GameMusic(new URL(import.meta.env.BASE_URL,location.href).href);let previewingMusic=false;
let restartAfterSetup=false,fileMode:'character'|'enemy'|'companion'|'project'='character',castRole:'player'|'enemy'|'companion'='player',applying=false,individualEnemies=false,enemyIndex=0;
/** Automatic titles follow the mode: circuits and courses name arcade games, missions keep mission names. */
function retitleAll(root:PlayProject){retitle(root);for(const c of root.chapters??[])if(c.identity)retitle({mode:root.mode,race:c.race??root.race,runner:c.runner??root.runner,identity:c.identity});}
/** Chapters that become races or runs without their own circuit or course take the next unused one. */
function spreadArcadeChapters(root:PlayProject){
 if(root.mode==='race'&&root.race){const used=[root.race.track,...(root.chapters??[]).map(c=>c.race?.track)];for(const c of root.chapters??[])if(!c.race){const track=TRACK_IDS.find(t=>!used.includes(t))??root.race.track;used.push(track);c.race={...root.race,track};}}
 if(root.mode==='runner'&&root.runner){const used=[root.runner.theme,...(root.chapters??[]).map(c=>c.runner?.theme)];for(const c of root.chapters??[])if(!c.runner){const theme=RUNNER_THEMES.find(t=>!used.includes(t))??root.runner.theme;used.push(theme);c.runner={...root.runner,theme};}}
}
const sequenceNoun=()=>draftRoot.mode==='race'?'race':draftRoot.mode==='runner'?'stage':'mission';
function resetDraft(p:PlayProject){draftRoot=structuredClone(p);retitleAll(draftRoot);editingChapter=0;draft=chapterProject(draftRoot,0);}
function wholeDraft(){const extra=draftRoot.chapters,lives=draft.mission.lives;if(editingChapter===0)draftRoot={...draft,...(extra?.length?{chapters:extra}:{})};else draftRoot.chapters![editingChapter-1]=chapterSettings(draft,draftRoot.chapters![editingChapter-1].id);draftRoot.character=structuredClone(draft.character);draftRoot.mission.lives=lives;for(const c of draftRoot.chapters??[])c.mission.lives=lives;return draftRoot;}
function paintChapters(){
 const root=wholeDraft(),games=gameProjects(root),cards=$('chapter-cards'),noun=sequenceNoun(),Noun=noun[0].toUpperCase()+noun.slice(1);
 $('mission-sequence-title').textContent=noun==='race'?'Cup races':noun==='stage'?'Run stages':'Mission sequence';$('add-chapter').textContent=`+ Add ${noun}`;$('chapter-cards').setAttribute('aria-label',`Choose a ${noun} to edit`);
 while(cards.children.length>games.length)cards.lastElementChild!.remove();
 games.forEach((p,i)=>{let b=cards.children[i]as HTMLButtonElement|undefined;if(!b){b=document.createElement('button');b.type='button';b.append(document.createElement('span'),document.createElement('strong'));cards.append(b);}b.dataset.chapter=String(i);b.setAttribute('aria-pressed',String(i===editingChapter));b.setAttribute('aria-label',`Edit ${noun} ${i+1}: ${p.identity.title}`);b.title=p.identity.title;b.children[0].textContent=String(i+1).padStart(2,'0');b.children[1].textContent=p.identity.title;});
 button('add-chapter').disabled=games.length>=MAX_CHAPTERS;button('add-chapter').title=games.length>=MAX_CHAPTERS?`Five ${noun}s are already in this game`:`Add a connected ${noun}`;$('chapter-count').textContent=`${games.length} / ${MAX_CHAPTERS}`;$('chapter-tools').hidden=games.length===1;
 $('editing-chapter').textContent=`${Noun} ${editingChapter+1} of ${games.length} · ${draft.identity.title||`Untitled ${noun}`}`;$('editing-chapter').title=draft.identity.title||`Untitled ${noun}`;button('chapter-earlier').disabled=editingChapter===0;button('chapter-later').disabled=editingChapter===games.length-1;
}

function editChapter(index:number){wholeDraft();editingChapter=index;draft=chapterProject(draftRoot,index);enemyIndex=0;individualEnemies=false;paintDraft();cardsIntoView();}
function replaceSequence(games:PlayProject[],selected:number){const hero=draftRoot.character,city=draftRoot.city;draftRoot={...games[0],character:hero,city,...(games.length>1?{chapters:games.slice(1).map((p,i)=>chapterSettings(p,`chapter-${i+2}`))}:{})};editingChapter=selected;draft=chapterProject(draftRoot,selected);paintDraft();cardsIntoView();}
function cardsIntoView(){const cards=$('chapter-cards'),active=cards.querySelector<HTMLElement>('[aria-pressed=true]');if(active){const left=active.getBoundingClientRect().left-cards.getBoundingClientRect().left+cards.scrollLeft;if(left<cards.scrollLeft)cards.scrollLeft=left;else if(left+active.offsetWidth>cards.scrollLeft+cards.clientWidth)cards.scrollLeft=left+active.offsetWidth-cards.clientWidth;}}
$('chapter-cards').onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;const index=Number((e.target as HTMLElement).closest<HTMLButtonElement>('[data-chapter]')?.dataset.chapter);if(!Number.isInteger(index))return;e.preventDefault();const count=$('chapter-cards').children.length,next=e.key==='Home'?0:e.key==='End'?count-1:Math.max(0,Math.min(count-1,index+(e.key==='ArrowRight'?1:-1)));editChapter(next);($('chapter-cards').children[next]as HTMLButtonElement).focus({preventScroll:true});};
$('chapter-cards').onclick=e=>{const b=(e.target as HTMLElement).closest<HTMLButtonElement>('[data-chapter]');if(b)editChapter(Number(b.dataset.chapter));};
button('add-chapter').onclick=()=>{const root=wholeDraft(),games=gameProjects(root);if(games.length>=MAX_CHAPTERS)return;const next=structuredClone(chapterProject(root,0));
 // Arcade games add the next circuit or course, named after it; missions add a rescue getaway.
 if(root.mode==='race'&&next.race){const used=games.map(g=>g.race?.track),track=TRACK_IDS.find(t=>!used.includes(t))??TRACK_IDS[games.length%TRACK_IDS.length];next.race={...next.race,track};next.identity={title:arcadeTitle(next),briefing:''};}
 else if(root.mode==='runner'&&next.runner){const used=games.map(g=>g.runner?.theme),theme=RUNNER_THEMES.find(t=>!used.includes(t))??RUNNER_THEMES[games.length%RUNNER_THEMES.length];next.runner={...next.runner,theme};next.identity={title:arcadeTitle(next),briefing:''};}
 else{next.identity={title:`${games.length===1?'Rescue and getaway':'Next mission '+(games.length+1)}`,briefing:''};next.mission={...defaultMission(),cargo:'none',story:'rescue',location:'military-base',extraction:'pickup',driveDifficulty:'standard',lives:root.mission.lives};}games.push(next);replaceSequence(games,games.length-1);showSetupPage('mission');($('chapter-cards').children[editingChapter]as HTMLButtonElement).focus({preventScroll:true});};
for(const [id,offset]of [['chapter-earlier',-1],['chapter-later',1]]as const)button(id).onclick=()=>{const games=gameProjects(wholeDraft()),to=editingChapter+offset;if(to<0||to>=games.length)return;[games[editingChapter],games[to]]=[games[to],games[editingChapter]];replaceSequence(games,to);};
button('chapter-remove').onclick=()=>{const games=gameProjects(wholeDraft());if(games.length<2)return;games.splice(editingChapter,1);replaceSequence(games,Math.min(editingChapter,games.length-1));};
installSetupChoices(setup);
setup.addEventListener('input',()=>{wholeDraft();paintSetupSummary(setup,draft);paintChapters();});setup.addEventListener('change',()=>{wholeDraft();paintSetupSummary(setup,draft);paintChapters();});
let radioCountriesLoaded=false;
async function loadRadioCountries(){if(radioCountriesLoaded)return;radioCountriesLoaded=true;const countries=await availableRadioCountries(),field=select('city-radio-country'),selected=(draftRoot.city??defaultCity()).radioCountry;field.replaceChildren(...countries.map(country=>new Option(country.name,country.code)));if(!countries.some(country=>country.code===selected))field.add(new Option(selected,selected));field.value=selected;}
function showSetup(){resetDraft(project);castRole='player';enemyIndex=0;individualEnemies=false;showSetupPage('mission');paintDraft();player.openSettings();void loadRadioCountries();}
button('settings').onclick=showSetup;setup.addEventListener('close',()=>{stopMusicPreview();
 // Start after the native dialog finishes closing, so its cleanup cannot clear
 // the first movement/interaction input or reclaim focus from the canvas.
 if(restartAfterSetup&&pendingCast){restartAfterSetup=false;player.replace(project,pendingCast);gameCast=pendingCast;pendingCast=undefined;}else player.closeSettings();
});
const setupPages=['mission','cast','challenge','presentation']as const;
function showSetupPage(page:typeof setupPages[number]){$('editing-section').textContent=page==='presentation'?'Atmosphere':page[0].toUpperCase()+page.slice(1);setup.querySelector<HTMLElement>('.setup-content')!.scrollTop=0;for(const name of setupPages){const on=name===page;button('setup-'+name).setAttribute('aria-selected',String(on));button('setup-'+name).tabIndex=on?0:-1;$(name+'-settings').hidden=!on;}if(page!=='presentation')stopMusicPreview();}
for(const page of setupPages){button('setup-'+page).onclick=()=>showSetupPage(page);button('setup-'+page).addEventListener('keydown',e=>{const index=setupPages.indexOf(page);if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;e.preventDefault();const next=setupPages[e.key==='Home'?0:e.key==='End'?setupPages.length-1:(index+(['ArrowRight','ArrowDown'].includes(e.key)?1:setupPages.length-1))%setupPages.length];showSetupPage(next);button('setup-'+next).focus();});}
select('mission-location').replaceChildren(...LOCATIONS.map(l=>new Option(l.name,l.id)));
function paintMission(){$<HTMLInputElement>('stealth-senses').checked=!!draft.mission.stealth;for(const key of ['pursuit','overwatch']as const)$<HTMLInputElement>('support-'+key).checked=!!draft.mission[key];
 const city={...defaultCity(),...draftRoot.city};select('city-size').value=city.size;select('city-pedestrians').value=String(city.pedestrians);select('city-traffic').value=String(city.traffic);select('city-moving-traffic').value=String(city.movingTraffic);select('city-hostility').value=city.pedestrianHostility;for(const [id,key]of [['city-police','police'],['city-repair','repairShop'],['city-gun-shop','gunShop'],['city-fights','pedestrianFights'],['city-weapon-switch','weaponSwitch'],['city-radio','radio']]as const)$<HTMLInputElement>(id).checked=city[key];select('city-radio-country').value=city.radioCountry;
 $<HTMLInputElement>('side-delivery').checked=!!draft.mission.sideQuests?.includes('delivery');$<HTMLInputElement>('side-race').checked=!!draft.mission.sideQuests?.includes('street-race');$<HTMLInputElement>('side-bounty').checked=!!draft.mission.sideQuests?.includes('bounty');$<HTMLInputElement>('side-race').disabled=!usesPickup(draft.mission);
 select('game-difficulty').value=draft.mission.difficulty??'normal';$<HTMLInputElement>('game-par').value=String(draft.mission.parTime??180);
 $<HTMLInputElement>('game-title').value=draft.identity.title;$<HTMLTextAreaElement>('game-briefing').value=draft.identity.briefing;
 select('mission-cargo').value=draft.mission.cargo??'none';$('cargo-description').hidden=!draft.mission.cargo||draft.mission.cargo==='none';select('driving-difficulty').value=draft.mission.driveDifficulty??'easy';const getaway=usesPickup(draft.mission),clear=draft.mission.story==='clear';$('pickup-settings').hidden=!getaway;select('driving-pace').value=(draft.vehicle??defaultDriving()).pace;select('vehicle-model').value=draft.vehicle?.model??'pickup';for(const option of select('vehicle-model').options)option.disabled=option.value!=='pickup'&&needsCompanion(draft.mission);$<HTMLInputElement>('pickup-color').value=(draft.vehicle??defaultDriving()).color;select('mission-location').value=draft.mission.location??'depot';select('mission-story').value=missionGoal(draft.mission);select('mission-extraction').value=extractionMode(draft.mission);select('mission-plan').value=draft.mission.plan;select('mission-plan').options[0].text='Standard';select('mission-plan').querySelector<HTMLOptionElement>('[value="quiet"]')!.disabled=clear||getaway;
 $('location-description').textContent=LOCATIONS.find(l=>l.id===(draft.mission.location??'depot'))!.description;
 button('cast-companion').hidden=!castsCompanion(draft);select('mission-layout').value=draft.mission.layout;select('movement').value=draft.mission.movement;select('lives').value=String(draft.mission.lives);select('checkpoints').value=draft.mission.checkpoints;
 $('retry-description').textContent=draft.mission.lives===1?'One chance per run. Add more lives to retry from saved progress.':draft.mission.checkpoints==='auto'?(getaway?needsCompanion(draft.mission)?'Save the rescue, then both characters and the pickup after boarding. Retry puts you safely beside your doors.':draft.mission.story==='clear'?'Save the cleared squad, then the parked pickup after boarding.':'Save keys and the parked pickup before the drive. Retry returns to the driver’s door.':clear?'Save once the squad is cleared. Retry keeps defeated enemies and equipment together.':needsCompanion(draft.mission)?'Save after freeing your companion. Retrying restores both characters with a brief protected start.':'Save progress after the key and gate. Retrying restores that checkpoint with a brief protected start.'):draft.mission.lives==='unlimited'?'Retry from the beginning as often as you like.':'Retry from the beginning with one fewer life.';
 $('mission-description').textContent=getaway&&needsCompanion(draft.mission)?'Free your companion and lead them to the pickup. Board together, then drive to extraction. The truck waits from the start.':getaway&&clear?'Defeat the squad to unlock the waiting pickup, then board and drive to extraction.':getaway?(draft.mission.plan==='timed'?'Find the pickup keys, board, and drive to extraction within 90 seconds.':'Find the keys, board the waiting pickup and drive through the checkpoint to extraction.'):clear?(draft.mission.plan==='timed'?'Defeat the entire enemy squad and reach extraction within 90 seconds.':'Defeat the entire enemy squad, then reach extraction. The gate starts open.'):needsCompanion(draft.mission)?(draft.mission.plan==='timed'?'Free your companion and get both of you to extraction within 90 seconds.':draft.mission.plan==='quiet'?'Free your companion and return together without either of you raising the alarm.':'Reach the captive through the open gate, free them, then return to extraction together.'):PLANS[draft.mission.plan].description;
 $('arrangement').textContent=`Arrangement ${draft.mission.variation+1} of 12`;paintProgression();paintLoadout();paintSetupSummary(setup,draft);paintChapters();if(draft.mission.plan==='timed')$('mission-description').textContent+=` Time allowance: ${missionTimeLimit(draft.mission)} seconds.`;
}
function automaticTitle(){if(['The Depot','Military base','Base assault','Getaway','Rescue getaway','Clear and drive'].includes(draft.identity.title))draft.identity.title=usesPickup(draft.mission)?needsCompanion(draft.mission)?'Rescue getaway':draft.mission.story==='clear'?'Clear and drive':'Getaway':draft.mission.location==='military-base'?(draft.mission.story==='clear'?'Base assault':'Military base'):'The Depot';}
select('mission-location').onchange=()=>{draft.mission.location=select('mission-location').value as LocationId;automaticTitle();paintMission();};
for(const id of ['city-size','city-pedestrians','city-traffic','city-moving-traffic','city-police','city-repair','city-gun-shop','city-fights','city-hostility','city-weapon-switch','city-radio','city-radio-country']as const)$(id).addEventListener('change',()=>{const city:CitySettings={size:select('city-size').value as CitySettings['size'],pedestrians:Number(select('city-pedestrians').value) as CitySettings['pedestrians'],traffic:Number(select('city-traffic').value) as CitySettings['traffic'],movingTraffic:Number(select('city-moving-traffic').value) as CitySettings['movingTraffic'],police:$<HTMLInputElement>('city-police').checked,repairShop:$<HTMLInputElement>('city-repair').checked,gunShop:$<HTMLInputElement>('city-gun-shop').checked,pedestrianFights:$<HTMLInputElement>('city-fights').checked,pedestrianHostility:select('city-hostility').value as CitySettings['pedestrianHostility'],weaponSwitch:$<HTMLInputElement>('city-weapon-switch').checked,radio:$<HTMLInputElement>('city-radio').checked,radioCountry:select('city-radio-country').value};draftRoot.city=city;draft.city=city;});
$<HTMLInputElement>('game-title').oninput=()=>draft.identity.title=$<HTMLInputElement>('game-title').value;
$<HTMLTextAreaElement>('game-briefing').oninput=()=>draft.identity.briefing=$<HTMLTextAreaElement>('game-briefing').value;
select('mission-story').onchange=()=>{
 draft.mission.extraction=select('mission-extraction').value as 'foot'|'pickup'|'helicopter';
 draft.mission.story=select('mission-story').value as PlayProject['mission']['story'];
 if(draft.mission.story==='getaway'){draft.mission.extraction='pickup';}
 if(usesPickup(draft.mission)){draft.vehicle??=defaultDriving();if(needsCompanion(draft.mission))delete draft.vehicle.model;if(draft.mission.plan==='quiet')draft.mission.plan='breakout';if(draft.enemies.length===1&&draft.enemies[0].response==='capture'){resizeEnemies(draft,3);for(const e of draft.enemies)e.response='pistol';}}
 if(draft.mission.story==='clear'){
  draft.mission.location='military-base';if(draft.mission.plan==='quiet')draft.mission.plan='breakout';
  if(draft.progression.weapon==='objective'||draft.progression.weapon==='loadout'&&draft.loadout.weapon==='none'){draft.progression.weapon='loadout';draft.loadout.weapon='pistol';}
  if(draft.enemies.length===1&&draft.enemies[0].response==='capture'){resizeEnemies(draft,3);for(const e of draft.enemies)e.response='pistol';}
 }
 automaticTitle();paintMission();paintEnemies();showCast(castRole);
};
select('mission-extraction').onchange=()=>{
 if(draft.mission.story==='getaway')draft.mission.story='escape';
 draft.mission.extraction=select('mission-extraction').value as 'foot'|'pickup'|'helicopter';
 if(usesPickup(draft.mission)){draft.vehicle??=defaultDriving();if(needsCompanion(draft.mission))delete draft.vehicle.model;if(draft.mission.plan==='quiet')draft.mission.plan='breakout';}
 else draft.mission.sideQuests=draft.mission.sideQuests?.filter(id=>id!=='street-race');
 automaticTitle();paintMission();
};
select('mission-cargo').onchange=()=>{draft.mission.cargo=select('mission-cargo').value as 'none'|'briefcase'|'package';paintMission();};select('driving-difficulty').onchange=()=>{draft.mission.driveDifficulty=select('driving-difficulty').value as 'easy'|'standard'|'hard';paintMission();};
select('vehicle-model').onchange=()=>{const model=select('vehicle-model').value as NonNullable<DrivingSettings['model']>;draft.vehicle={...(draft.vehicle??defaultDriving()),...(model==='pickup'?{}:{model})};if(model==='pickup')delete draft.vehicle.model;};select('driving-pace').onchange=()=>{draft.vehicle={...(draft.vehicle??defaultDriving()),pace:select('driving-pace').value as DrivingSettings['pace']};};$<HTMLInputElement>('pickup-color').oninput=()=>{draft.vehicle={...(draft.vehicle??defaultDriving()),color:$<HTMLInputElement>('pickup-color').value};};
select('mission-plan').onchange=()=>{draft.mission.plan=select('mission-plan').value as PlayProject['mission']['plan'];paintMission();};select('mission-layout').onchange=()=>{draft.mission.layout=select('mission-layout').value as PlayProject['mission']['layout'];};select('movement').onchange=()=>{draft.mission.movement=select('movement').value as PlayProject['mission']['movement'];};button('try-variation').onclick=()=>{draft.mission.variation=(draft.mission.variation+1)%12;paintMission();};
select('lives').onchange=()=>{draft.mission.lives=select('lives').value==='unlimited'?'unlimited':Number(select('lives').value)as 1|3|5;paintMission();};select('checkpoints').onchange=()=>{draft.mission.checkpoints=select('checkpoints').value as 'auto'|'off';paintMission();};
const castRoles=()=>castsCompanion(draft)?['player','enemy','companion']as const:['player','enemy']as const;
function showCast(role:'player'|'enemy'|'companion'){
 castRole=role==='companion'&&!castsCompanion(draft)?'player':role;
 for(const r of ['player','enemy','companion']as const){const active=r===castRole;button('cast-'+r).setAttribute('aria-selected',String(active));button('cast-'+r).tabIndex=active?0:-1;$(r==='player'?'hero-panel':r+'-panel').hidden=!active;}
}
for(const role of ['player','enemy','companion']as const){const tab=button('cast-'+role);tab.onclick=()=>showCast(role);tab.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const roles=castRoles(),index=roles.findIndex(r=>r===castRole),next=roles[e.key==='Home'?0:e.key==='End'?roles.length-1:(index+(e.key==='ArrowRight'?1:roles.length-1))%roles.length];showCast(next);button('cast-'+next).focus();});}
const enemySettings=()=>draft.enemies[individualEnemies?enemyIndex:0];
function setEnemyCharacter(params:HumanParams){for(const enemy of individualEnemies?[enemySettings()]:draft.enemies)enemy.character=structuredClone(params);}
function paintPicker(id:string,params:HumanParams){const picker=select(id);picker.replaceChildren();const isPreset=Object.hasOwn(PRESETS,params.name)&&JSON.stringify(preset(params.name))===JSON.stringify(params);if(!isPreset)picker.add(new Option(params.name||'Custom character','custom'));for(const name of Object.keys(PRESETS))picker.add(new Option(name,name));picker.value=isPreset?params.name:'custom';}
function paintEnemies(){
 enemyIndex=Math.min(enemyIndex,draft.enemies.length-1);select('enemy-count').value=String(draft.enemies.length);const member=select('enemy-member');member.replaceChildren();draft.enemies.forEach((enemy,i)=>member.add(new Option(`Enemy ${i+1} · ${enemy.character.name}`,String(i))));member.value=String(enemyIndex);
 $('enemy-individual').hidden=!individualEnemies;button('customize-enemies').setAttribute('aria-expanded',String(individualEnemies));button('customize-enemies').textContent=individualEnemies?'Use shared controls':'Customize individuals';
 const mixed=draft.enemies.some(e=>JSON.stringify(e.character)!==JSON.stringify(draft.enemies[0].character)||e.aggression!==draft.enemies[0].aggression||e.response!==draft.enemies[0].response||e.health!==draft.enemies[0].health);
 $('enemy-edit-note').textContent=individualEnemies?`Editing Enemy ${enemyIndex+1} only.`:mixed?'Mixed squad. Changes here apply to every enemy.':'Appearance, aggression and combat settings apply to every enemy.';
 $('enemy-response-label').textContent=individualEnemies?`Enemy ${enemyIndex+1} response`:'Squad response';$('enemy-health-label').textContent=individualEnemies?`Enemy ${enemyIndex+1} health`:'Squad health';select('enemy-kind').value=enemySettings().kind??'guard';$('enemy-kind-note').textContent=ENEMY_ROLES[enemySettings().kind??'guard'].description;select('enemy-response').value=enemySettings().response;select('enemy-health').value=String(enemySettings().health);
 $('enemy-aggression-label').textContent=individualEnemies?`Enemy ${enemyIndex+1} aggression`:'Squad aggression';$('enemy-appearance-label').textContent=individualEnemies?`Enemy ${enemyIndex+1} appearance`:'Squad appearance';paintPicker('enemy',enemySettings().character);select('enemy-aggression').value=enemySettings().aggression;$('cast-enemy-name').textContent=draft.enemies.length===1?enemySettings().character.name:`${draft.enemies.length} enemies`;
}
const storyUi=storyEditor($('story-editor'),()=>draft,()=>engine,()=>lib);
const chainEditor=objectiveEditor($('objective-editor'),()=>draft,()=>paintMission());
const modeUi=modeEditor({mission:$('arcade-mission'),cast:$('arcade-cast'),challenge:$('arcade-challenge')},()=>draft,()=>editingChapter,()=>{if(castRole==='companion'&&!castsCompanion(draft))showCast('player');wholeDraft();spreadArcadeChapters(draftRoot);retitleAll(draftRoot);if(!draftRoot.mode)automaticTitle();$<HTMLInputElement>('game-title').value=draft.identity.title;paintChapters();paintSetupSummary(setup,draft);});
function paintDraft(){storyUi.paint();chainEditor.paint();modeUi.paint();paintPicker('hero',draft.character);$('cast-player-name').textContent=draft.character.name||'Custom character';paintEnemies();paintMission();paintLoadout();paintPresentation();paintPicker('companion',draft.companion.character);select('companion-health-setting').value=String(draft.companion.health);$('cast-companion-name').textContent=draft.companion.character.name;$('setup-note').textContent='';showCast(castRole);}
function paintProgression(){select('completion-reward').value=draft.progression.reward??'none';
 select('supplies').value=draft.progression.supplies;select('scoring').value=draft.progression.scoring;
 const count={scarce:2,balanced:4,plentiful:6}[draft.progression.supplies];
 $('progression-description').textContent=`${count} supply boxes placed on reachable ground. Health +25; ammunition +24 reserve rounds. `+(draft.progression.scoring==='off'?'Play without points.':draft.progression.scoring==='action'?'Earn points for objectives, defeated enemies, speed and fewer retries.':'Earn points for objectives, speed and fewer retries. '+(draft.mission.story==='clear'?'Defeat the whole squad to unlock extraction.':'Combat is optional.'));
}
function paintLoadout(){
 for(const value of ['none','objective'])select('player-weapon').querySelector<HTMLOptionElement>(`[value="${value}"]`)!.disabled=draft.mission.story==='clear';
 select('player-grenades').value=String(draft.loadout.grenades??0);
 select('player-weapon').value=draft.progression.weapon==='loadout'?draft.loadout.weapon:draft.progression.weapon+(draft.progression.unlock==='rifle'?'-rifle':'');select('player-health').value=String(draft.loadout.health);select('player-ammunition').value=String(draft.loadout.ammunition);$('ammo-settings').hidden=!isGun(heroWeapon(draft));
 const gun=draft.progression.unlock??'pistol';$('ammo-description').textContent=`${weaponProfile(isGun(draft.loadout.weapon)?draft.loadout.weapon:gun).magazine} rounds per magazine. Q aims, F fires, R reloads. Hold right mouse to aim and left mouse to fire. Rifles fire automatic bursts while held. Shots alert nearby guards.`;const name=weaponProfile(draft.loadout.weapon==='none'?gun:draft.loadout.weapon).name;
 $('equipment-description').textContent=draft.progression.weapon==='pickup'?`Start unarmed. A ${name.toLowerCase()} is waiting on a clear route in the starting yard. Walk over it to equip.`:draft.progression.weapon==='objective'?(needsCompanion(draft.mission)?`Start unarmed. Free your companion to unlock a ${name.toLowerCase()}.`:`Start unarmed. Collect the key to unlock a ${name.toLowerCase()}.`):isGun(draft.loadout.weapon)?`Start equipped with a ${name.toLowerCase()}.`:'Complete the mission without a weapon.';
}
select('supplies').onchange=()=>{draft.progression.supplies=select('supplies').value as PlayProject['progression']['supplies'];paintProgression();};
select('scoring').onchange=()=>{draft.progression.scoring=select('scoring').value as PlayProject['progression']['scoring'];paintProgression();};
select('player-grenades').onchange=()=>{draft.loadout.grenades=Number(select('player-grenades').value)as 0|2|5;};
select('player-weapon').onchange=()=>{const value=select('player-weapon').value,method=value.replace('-rifle','');draft.progression.weapon=method==='pickup'||method==='objective'?method:'loadout';draft.loadout.weapon=isGun(value)?value:'none';if(value.endsWith('-rifle'))draft.progression.unlock='rifle';else delete draft.progression.unlock;paintLoadout();};select('player-health').onchange=()=>{draft.loadout.health=Number(select('player-health').value)as Health;};select('player-ammunition').onchange=()=>{draft.loadout.ammunition=select('player-ammunition').value==='unlimited'?'unlimited':Number(select('player-ammunition').value)as Ammunition;};
select('enemy-kind').onchange=()=>{const kind=select('enemy-kind').value as EnemyKind;if(kind==='sniper'&&!individualEnemies&&draft.enemies.length>2)individualEnemies=true;const targets=individualEnemies?[enemySettings()]:draft.enemies;if(kind==='sniper'&&draft.enemies.filter(e=>!targets.includes(e)&&e.kind==='sniper').length+targets.length>2){$('setup-note').textContent='Use at most two elevated snipers.';paintEnemies();return;}for(const enemy of targets)Object.assign(enemy,{kind,...roleDefaults(kind)});paintEnemies();};
select('enemy-response').onchange=()=>{for(const e of individualEnemies?[enemySettings()]:draft.enemies)e.response=select('enemy-response').value as 'capture'|'pistol'|'rifle';for(const e of draft.enemies)if(e.kind&&e.kind!=='guard'&&e.response!=='rifle')e.kind='guard';paintEnemies();};select('enemy-health').onchange=()=>{for(const e of individualEnemies?[enemySettings()]:draft.enemies)e.health=Number(select('enemy-health').value)as EnemyHealth;paintEnemies();};
select('companion').onchange=()=>{if(select('companion').value!=='custom')draft.companion.character=preset(select('companion').value);$('cast-companion-name').textContent=draft.companion.character.name;};select('companion-health-setting').onchange=()=>{draft.companion.health=Number(select('companion-health-setting').value)as Health;};
select('hero').onchange=()=>{if(select('hero').value!=='custom')draft.character=preset(select('hero').value);$('cast-player-name').textContent=draft.character.name;};
select('enemy').onchange=()=>{if(select('enemy').value!=='custom')setEnemyCharacter(preset(select('enemy').value));paintEnemies();};
select('enemy-count').onchange=()=>{resizeEnemies(draft,Number(select('enemy-count').value));paintEnemies();};
select('enemy-member').onchange=()=>{enemyIndex=Number(select('enemy-member').value);paintEnemies();};
button('customize-enemies').onclick=()=>{individualEnemies=!individualEnemies;paintEnemies();};
select('enemy-aggression').onchange=()=>{for(const enemy of individualEnemies?[enemySettings()]:draft.enemies)enemy.aggression=select('enemy-aggression').value as Aggression;paintEnemies();};
button('import-character').onclick=()=>{fileMode='character';$<HTMLInputElement>('file').click();};button('import-companion').onclick=()=>{fileMode='companion';$<HTMLInputElement>('file').click();};button('import-enemy').onclick=()=>{fileMode='enemy';$<HTMLInputElement>('file').click();};button('open-project').onclick=()=>{fileMode='project';$<HTMLInputElement>('file').click();};
$<HTMLInputElement>('file').onchange=async e=>{const file=(e.target as HTMLInputElement).files?.[0];if(!file)return;try{if(fileMode==='project'){const imported=await openSetup(file,lib.catalog),voices=await generateImportedVoices(imported,message=>$('setup-note').textContent=message);resetDraft(imported);paintDraft();$('setup-note').textContent=voices.failed?`Loaded ${file.name}. ${voices.generated} voices generated; ${voices.failed} will use device speech (${voices.error}). Apply to preview.`:`Loaded ${file.name}. ${voices.generated} voices generated. Apply to preview.`;}else{if(file.size>100000)throw Error('Choose character settings smaller than 100 KB.');const params=playable(readCharacterSettings(await file.text(),lib.catalog));if(fileMode==='enemy')setEnemyCharacter(params);else if(fileMode==='companion')draft.companion.character=params;else draft.character=params;}if(fileMode!=='project'){paintDraft();$('setup-note').textContent=`Loaded ${file.name}. Apply to preview these settings.`;}}catch(error){$('setup-note').textContent=(error as Error).message;}(e.target as HTMLInputElement).value='';};
async function downloadSetup(){try{const saved=await saveSetup(wholeDraft()),url=URL.createObjectURL(saved.data),a=document.createElement('a');a.href=url;a.download=gameStem(draftRoot.identity.title)+saved.extension;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);$('setup-note').textContent='Setup saved, including attached story media.';}catch(error){$('setup-note').textContent=(error as Error).message;}}
button('save-project').onclick=downloadSetup;
button('clear-project').onclick=()=>{if(!confirm('Clear every setting and start a fresh game setup? Save setup first to keep this one.'))return;resetDraft(defaultProject());castRole='player';enemyIndex=0;individualEnemies=false;showSetupPage('mission');paintDraft();try{localStorage.removeItem(storage);}catch{/* optional persistence */}$('setup-note').textContent='Setup cleared. Preview game to play the fresh setup.';};
setup.addEventListener('cancel',e=>{if(applying)e.preventDefault();});
async function prepareGame(p:PlayProject,progress:(text:string)=>void){
 const previous=castActors(gameCast),next=await prepareGameCast(p,engine,f=>lib.textureUrl(f),progress,{...gameCast,project});
 try{for(const [index,chapter]of gameProjects(p).entries()){const active=index===0?next:next.chapters![index-1],check=new EscapeGame(chapter.mission,chapter.enemies,chapter.loadout,chapter.companion.health,chapter.progression,chapter.vehicle);check.player.radius=actorRadius(active.hero,p.character.weight);if(check.companion&&active.companion)check.companion.radius=actorRadius(active.companion,chapter.companion.character.weight);
  if(check.car){progress('Checking the pickup, passenger fit and complete driving route…');const view=new DrivingView(active.hero,chapter.vehicle??defaultDriving(),check.player.radius,check.companion?.radius),previousFit=active.companion?.passengerFit;try{check.configureCar(view.fit);if(active.companion){view.configurePassenger(active.companion,check.car);check.configureCar(view.fit);}}finally{if(active.companion)active.companion.passengerFit=previousFit;view.dispose();}}
  if(check.air){progress('Checking aircraft doors and shared passenger performance…');const air=new AirView(active.hero,active.companion);try{check.configureAir(air.fit);}finally{air.dispose();}}if(check.assaultCarEnabled){const guard=chapter.enemies.find(e=>e.kind!=='sniper')??chapter.enemies[0],view=new DrivingView(active.guards.get(guard.id)!,{color:'#6b5349',pace:'standard'},.38);try{check.configurePursuit(view.fit);}finally{view.dispose();}}if(check.sideQuests.some(q=>q.id==='street-race')){const view=new DrivingView(active.guards.get(chapter.enemies[0].id)!,{model:'sports_car',color:'#a83d38',pace:'relaxed'},.38);try{check.configureRace(view.fit);}finally{view.dispose();}}
  }return next;
 }catch(error){for(const actor of castActors(next))if(!previous.has(actor))actor.dispose();throw error;}
}
let assistedPreview:{project:PlayProject;cast:PlayCast}|undefined;
let generateAssistAudio=true;
const assist=assistPanel<PlayProject>({dialog:$<HTMLDialogElement>('play-assist-dialog'),id:'pa',name:'LLM Assist',app:'ARA PLAY',noun:'game',buildLabel:'Preview game',title:'An idea. A playable game.',intro:'Plan your game with Claude, ChatGPT or any assistant. Bring its JSON back here to review and play.',placeholder:'A military rescue with three aggressive guards, two grenades, a pickup getaway and spy music.',contextLabel:'Include my current setup to refine it',guideFile:'ara-play-llm-guide.txt',maxBytes:512_000,
 guide:(brief,current)=>generatePlayGuide(lib.catalog,brief,current?wholeDraft():undefined),parse:json=>parsePlayInput(json,lib.catalog),describe:describeGame,example:playExample,canOpen:()=>!loading&&!applying,storageKey:'ara.play.assist.v1',footnote:'The guide includes supported missions, equipment and custom character recipes. Ara arranges the map and routes. Preview first; download the game from Game setup.',recoveryNote:'Your current game stays available if preparation fails.',
 async build(nextProject,progress){stopMusicPreview();applying=true;$<HTMLFieldSetElement>('setup-fields').disabled=true;try{progress({stage:'Preparing dialogue and cast…'});const voices=generateAssistAudio?await generateImportedVoices(nextProject,text=>progress({stage:text})):undefined,next=await prepareGame(nextProject,text=>progress({stage:text}));assistedPreview={project:nextProject,cast:next};progress({stage:voices?.failed?`Game ready. ${voices.failed} voiced lines will use device speech: ${voices.error}`:generateAssistAudio?'Your game and dialogue are ready.':'Game ready. Missing recordings will use device speech.',fraction:1});}finally{applying=false;$<HTMLFieldSetElement>('setup-fields').disabled=false;}}
});
const audioChoice=document.createElement('label');audioChoice.className='ai-check ai-audio-choice';const audioToggle=document.createElement('input');audioToggle.type='checkbox';audioToggle.id='pa-generate-audio';audioToggle.checked=true;audioToggle.onchange=()=>generateAssistAudio=audioToggle.checked;audioChoice.append(audioToggle,document.createTextNode('Generate missing dialogue audio during preview'));assist.dialog.querySelector('.ai-review .ai-row')!.append(audioChoice);
const campaignTry=document.createElement('button');campaignTry.type='button';campaignTry.id='pa-campaign-example';campaignTry.className='ai-link';campaignTry.textContent='Try a campaign';assist.dialog.querySelector('.ai-review .ai-row')!.append(campaignTry);campaignTry.onclick=()=>{assist.restore({...assist.state(),json:JSON.stringify(campaignExample(),null,2)});$<HTMLTextAreaElement>('pa-json').dispatchEvent(new Event('input'));};
for(const [id,label,example] of [['pa-race-example','Try a race cup',raceExample],['pa-runner-example','Try a runner',runnerExample]]as const){const b=document.createElement('button');b.type='button';b.id=id;b.className='ai-link';b.textContent=label;assist.dialog.querySelector('.ai-review .ai-row')!.append(b);b.onclick=()=>{assist.restore({...assist.state(),json:JSON.stringify(example(),null,2)});$<HTMLTextAreaElement>('pa-json').dispatchEvent(new Event('input'));};}
const placementCheck=document.createElement('button');placementCheck.type='button';placementCheck.id='pa-check-placements';placementCheck.className='ai-link';placementCheck.textContent='Check placements';assist.dialog.querySelector('.ai-review .ai-row')!.append(placementCheck);placementCheck.onclick=()=>{try{const report=checkPlayPlacements($<HTMLTextAreaElement>('pa-json').value,lib.catalog),blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='ara-play-placements.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),5000);placementCheck.textContent=report.valid?'Placements checked ✓':'Placement issues found · report saved';}catch(error){placementCheck.textContent=(error as Error).message;}};
button('play-assist-open').onclick=()=>{stopMusicPreview();void assist.open();};
assist.dialog.addEventListener('close',()=>{if(!assistedPreview)return;project=assistedPreview.project;resetDraft(project);pendingCast=assistedPreview.cast;assistedPreview=undefined;try{localStorage.setItem(storage,JSON.stringify(project));}catch{/* optional persistence */}restartAfterSetup=true;setup.close();});
const applyLabel=button('apply').innerHTML;
button('apply').onclick=async()=>{
 if(applying)return;stopMusicPreview();applying=true;const fields=$<HTMLFieldSetElement>('setup-fields');fields.disabled=true;
 try{
  const nextProject=parseProject(JSON.stringify(wholeDraft()),lib.catalog);
  const next=await prepareGame(nextProject,text=>{button('apply').textContent='Preparing cast…';$('setup-note').textContent=text;});
  project=nextProject;pendingCast=next;try{localStorage.setItem(storage,JSON.stringify(project));}catch{/* optional persistence */}
  restartAfterSetup=true;setup.close();
 }catch(error){$('setup-note').textContent=(error as Error).message;}
 finally{fields.disabled=false;button('apply').innerHTML=applyLabel;applying=false;}
};
for(const [id,field]of [['edit-character','character'],['edit-enemy','enemy'],['edit-companion','companion']]as const){$<HTMLAnchorElement>(id).onclick=e=>{if(applying){e.preventDefault();return;}$<HTMLAnchorElement>(id).href=`../app/#c=${encodeCharacter(field==='enemy'?enemySettings().character:field==='companion'?draft.companion.character:draft.character)}`;};}
const cameraInputs=new Map<CameraView,HTMLInputElement>();
for(const view of CAMERA_VIEWS){
 const label=document.createElement('label'),check=document.createElement('input'),text=document.createElement('span'),name=document.createElement('strong'),description=document.createElement('small');check.type='checkbox';check.id=`allow-camera-${view.id}`;name.textContent=view.name;description.textContent=view.description;text.append(name,description);label.append(check,text);$('camera-options').append(label);cameraInputs.set(view.id,check);
 check.onchange=()=>{if(!check.checked&&draft.camera.allowed.length===1){check.checked=true;$('camera-note').textContent='Keep at least one camera view available.';return;}draft.camera.allowed=CAMERA_VIEWS.filter(v=>cameraInputs.get(v.id)!.checked).map(v=>v.id);if(!draft.camera.allowed.includes(draft.camera.default))draft.camera.default=draft.camera.allowed[0];$('camera-note').textContent='';paintPresentation();};
}
select('game-music').add(new Option('No music','none'));
for(const category of new Set(MUSIC_TRACKS.filter(t=>t.file).map(t=>t.category))){const group=document.createElement('optgroup');group.label=category;for(const track of MUSIC_TRACKS.filter(t=>t.category===category))group.append(new Option(`${track.name} · ${track.artist}`,track.id));select('game-music').append(group);}
function paintPresentation(){
 const e=draft.mission.environment??defaultEnvironment();for(const key of ['time','weather','ambient']as const)select('environment-'+key).value=e[key];for(const key of ['effects','flashlight']as const)$<HTMLInputElement>('environment-'+key).checked=e[key];$<HTMLInputElement>('environment-volume').value=String(e.volume*100);
 for(const [id,input]of cameraInputs)input.checked=draft.camera.allowed.includes(id);const start=select('camera-default');start.replaceChildren();for(const id of draft.camera.allowed)start.add(new Option(CAMERA_VIEWS.find(v=>v.id===id)!.name,id));start.value=draft.camera.default;
 $<HTMLInputElement>('camera-rotate').checked=draft.camera.rotate;$<HTMLInputElement>('camera-zoom').checked=draft.camera.zoom;
 select('game-music').value=draft.music.track;$<HTMLInputElement>('game-music-volume').value=String(Math.round(draft.music.volume*100));$<HTMLInputElement>('game-music-volume').disabled=draft.music.track==='none';$('game-music-volume-value').textContent=`${Math.round(draft.music.volume*100)}%`;button('preview-music').disabled=draft.music.track==='none'||draft.music.volume===0;renderMusicStatus();
}
function stopMusicPreview(){previewingMusic=false;musicPreview.stop();button('preview-music').textContent='Preview track ▷';}
function renderMusicStatus(){
 if(previewingMusic&&musicPreview.error){previewingMusic=false;musicPreview.stop();button('preview-music').textContent='Preview track ▷';}
 const track=MUSIC_TRACKS.find(t=>t.id===draft.music.track),text=musicPreview.error||(!scene?.combat.enabled&&previewingMusic?'Sound muted. Enable audio in the top bar to hear the preview.':track?.artist?`${previewingMusic?'Playing preview · ':''}${track.artist} · ${Math.floor(track.duration/60)}:${Math.floor(track.duration%60).toString().padStart(2,'0')} · ${track.description}`:'Choose a track from the background music library.');
 if($('game-music-note').textContent!==text)$('game-music-note').textContent=text;
}
select('camera-default').onchange=()=>draft.camera.default=select('camera-default').value as CameraView;
for(const field of ['rotate','zoom']as const)$<HTMLInputElement>('camera-'+field).onchange=()=>draft.camera[field]=$<HTMLInputElement>('camera-'+field).checked;
select('game-music').onchange=()=>{stopMusicPreview();draft.music.track=select('game-music').value as MusicId;musicPreview.configure(draft.music,true);paintPresentation();};
$<HTMLInputElement>('game-music-volume').oninput=()=>{draft.music.volume=Number($<HTMLInputElement>('game-music-volume').value)/100;musicPreview.configure(draft.music);paintPresentation();};
button('preview-music').onclick=()=>{if(previewingMusic){stopMusicPreview();renderMusicStatus();return;}musicPreview.configure(draft.music,true);musicPreview.setMuted(!scene.combat.enabled);musicPreview.setPlaying(true);previewingMusic=true;button('preview-music').textContent='Stop preview ▪';renderMusicStatus();};

async function init(){
 try{
  scene=new GameScene(canvas);
  const assets=new URL(`${import.meta.env.BASE_URL}assets/`,location.href).href;lib=await new AssetLibrary(fetchSource(assets)).initCatalog();engine=new Engine(lib,assets);
  try{const saved=localStorage.getItem(storage);if(saved)project=parseProject(saved,lib.catalog);}catch{/* invalid/stale local drafts do not block play */}
  const linked=new URLSearchParams(location.hash.slice(1)).get('c');if(linked){const character=decodeCharacter(linked,'medium');if(character)project.character=playable(character);}
  const cast=await prepareGameCast(project,engine,f=>lib.textureUrl(f),text=>{$('load-note').textContent=text;});gameCast=cast;loading=false;
  player=mountPlayer(scene,project,cast,{stopPreview:stopMusicPreview,renderMusicStatus,unlockPreview:()=>musicPreview.unlock(),audioChanged:enabled=>{musicPreview.setMuted(!enabled);renderMusicStatus();}});
  finishLoading();
  if(import.meta.env.DEV||new URLSearchParams(location.hash.slice(1)).has('demo'))Object.defineProperty(window,'araPlay',{get:()=>({...player.state,musicPreview})});
 }catch(error){$('load-label').textContent='Try loading again';$('load-note').textContent=(error as Error).message;button('start').disabled=false;button('start').onclick=()=>location.reload();}
}
setupGameDownload({project:()=>parseProject(JSON.stringify(wholeDraft()),lib.catalog),library:()=>lib,prepare:async(p,progress)=>{
 const next=await prepareGame(p,progress);
 const existing=castActors(gameCast);
 return {cast:next,dispose:()=>{for(const actor of castActors(next))if(!existing.has(actor))actor.dispose();}};
},busy:value=>{applying=value;},stopPreview:stopMusicPreview});
button('cycle-view').disabled=true;button('settings').disabled=true;button('help').disabled=true;button('sound').disabled=true;paintLoading(savedGame(storage));void init().finally(()=>{button('settings').disabled=loading;});

for(const key of ['time','weather','ambient','effects','flashlight','volume']as const){const el=$<HTMLInputElement>('environment-'+key);el.addEventListener('change',()=>{const e=draft.mission.environment??defaultEnvironment();(e as unknown as Record<string,unknown>)[key]=key==='effects'||key==='flashlight'?el.checked:key==='volume'?Number(el.value)/100:el.value;draft.mission.environment=e as EnvironmentSettings;if(key==='time'&&e.time==='night'){draft.mission.stealth=true;$<HTMLInputElement>('stealth-senses').checked=true;}});}

select('game-difficulty').onchange=()=>draft.mission.difficulty=select('game-difficulty').value as 'easy'|'normal'|'hard';$<HTMLInputElement>('game-par').onchange=()=>draft.mission.parTime=Math.max(15,Math.min(1800,Number($<HTMLInputElement>('game-par').value)||180));

select('completion-reward').onchange=()=>{const v=select('completion-reward').value;if(isGun(v))draft.progression.reward=v;else delete draft.progression.reward;};

for(const key of ['pursuit','overwatch']as const)$<HTMLInputElement>('support-'+key).onchange=()=>{draft.mission[key]=$<HTMLInputElement>('support-'+key).checked;};

$<HTMLInputElement>('stealth-senses').onchange=()=>draft.mission.stealth=$<HTMLInputElement>('stealth-senses').checked;
for(const [id,quest]of [['side-delivery','delivery'],['side-race','street-race'],['side-bounty','bounty']]as const)$<HTMLInputElement>(id).onchange=()=>{const choices=new Set(draft.mission.sideQuests??[]);if($<HTMLInputElement>(id).checked){choices.add(quest);if(quest==='street-race'){draft.mission.driveDifficulty='hard';select('driving-difficulty').value='hard';}}else choices.delete(quest);draft.mission.sideQuests=[...choices];};
