/** Schema migration, catalogue contracts and independent actor/camera clock invariants. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import { customFilmFixture } from './fixtures/studio-custom-film';
import { readFileSync } from 'node:fs';
import type { Catalog } from '../src/core/assets';
import { MAX_ACTORS, newProject, newActor, parseProject, timelineAt, durationOf, shotAt, beat, presetCode } from '../src/studio/project';
import { SETS, searchScenes, SCENE_CATEGORIES } from '../src/studio/catalog';
import { searchAnimations } from '../src/studio/animations';
import { equipActor, WEAPONS, CARRIED } from '../src/studio/equipment';
import { decodeCharacter } from '../src/app/share';
import { assistExample, assistSchema, generateAssistGuide, projectForAssist, parseStudioInput as parseInput } from '../src/studio/assist';
import { readEditorSession } from '../src/studio/session';
import { characterExample, parseCharacterInput } from '../src/app/character-assist';
import { PRESETS, ageToYears } from '../src/core/params';
import { parseTextCues, parseSubtitles, subtitlesToSrt, MAX_TEXT_CUES } from '../src/studio/text';
import { defaultAudio, parseAudio, speechActor, hasAudio, MAX_SOUND_EFFECTS, MAX_SPEECH, MUSIC_TRACKS, VOICE_EFFECTS } from '../src/studio/audio/schema';
import { SOUND_EFFECTS } from '../src/studio/audio/effects-catalog';
import { addCastActor, arrangeCast, castArrangement, ARRANGEMENTS } from '../src/studio/staging';
import { CLIPS } from '../src/core/anim/clips';
import { seatCast, seatedAt, hipsAt, type Sitter } from '../src/studio/seating';
import {VEHICLE_CHOICES,VEHICLE_FOR_CLIP,RIDING_VEHICLES} from '../src/core/props/vehicles';
const catalog=JSON.parse(readFileSync(new URL('../public/assets/catalog.json',import.meta.url),'utf8'))as Catalog;
const parseStudioInput=(text:string)=>parseInput(text,catalog);
assert.equal(SETS.length,66);assert.equal(new Set(SETS.map(s=>s.id)).size,SETS.length);assert.equal(SCENE_CATEGORIES.length,6);
for(const set of SETS){const p=newProject(set.id);const copy=parseProject(JSON.stringify(p));assert.equal(copy.template,set.id);assert.equal(copy.actors[0].character,p.actors[0].character);assert.equal(durationOf(p),durationOf(copy));}
assert.deepEqual(searchScenes('resort pool').map(s=>s.id),['resort-pool']);assert.ok(searchScenes('bedroom','Homes').length===2);assert.equal(searchScenes('pool','Workplaces').length,0);
assert.ok(searchScenes('cafe').some(s=>s.id==='street-cafe'));assert.ok(searchAnimations('pickup').some(c=>c.id==='pick_up'));
assert.equal(searchAnimations('').length,CLIPS.length);assert.ok(searchAnimations('laugh').some(c=>c.id==='laugh'));
const p=newProject('runway'),boundary=p.actors[0].beats[0].duration;
const before=timelineAt(p,boundary-1e-6),after=timelineAt(p,boundary+1e-6);
assert.ok(Math.hypot(before.x-after.x,before.z-after.z)<1e-4);assert.ok(Math.abs(before.phase-after.phase)<1e-4);
const second=newActor();second.beats=[beat('laugh',1.2),beat('sit_idle',2.5)];p.actors.push(second);
assert.equal(timelineAt(p,2,p.actors[0]).index,0);assert.equal(timelineAt(p,2,second).index,1);
assert.equal(timelineAt(p,50,second).time,3.7);assert.equal(shotAt(p,3).index,1);
assert.deepEqual(timelineAt(p,2,second),timelineAt(p,2,second));
const legacy={kind:'ara-studio',version:1,detail:'high',title:'Original film',template:'portrait',character:presetCode('The Priest'),camera:'dolly',aspect:'portrait',caption:true,beats:[{id:'old',clip:'wave',duration:3,shot:'medium',move:false}]};
const migrated=parseProject(JSON.stringify(legacy));assert.equal(migrated.version,2);assert.equal(migrated.actors[0].detail,'high');assert.equal(migrated.shots[0].shot,'medium');assert.equal(migrated.actors[0].character,legacy.character);
const repeated=newProject();repeated.actors[0].beats=[beat('punch',1),beat('punch',1)];assert.ok(Math.abs(timelineAt(repeated,1.1).phase-0.1)<1e-6,'non-looping actions must restart');
const equipped=newProject().actors[0],original=decodeCharacter(equipped.character,equipped.detail)!;
for(const id of WEAPONS){const changed=decodeCharacter(equipActor(equipped,'weapon',id),equipped.detail)!;assert.equal(changed.weapon,id);assert.deepEqual({...changed,weapon:original.weapon},original);}
for(const id of CARRIED){const changed=decodeCharacter(equipActor(equipped,'carry',id),equipped.detail)!;assert.equal(changed.carry,id);assert.deepEqual({...changed,carry:original.carry},original);}
assert.throws(()=>equipActor(equipped,'weapon','unknown'));assert.throws(()=>equipActor(equipped,'carry','unknown'));assert.equal(decodeCharacter(equipped.character,equipped.detail)!.weapon,original.weapon);
const valid=newProject();
const invalid=[{version:3},{template:'missing'},{actors:[]},{actors:[{...valid.actors[0],id:'all'}]},{actors:[{...valid.actors[0],id:'camera'}]},{actors:[...valid.actors,...valid.actors]},{shots:[]},{shots:[{...valid.shots[0],target:'missing'}]},{view:{azimuth:0,elevation:90,zoom:1}},{actors:[{...valid.actors[0],x:Infinity}]},{actors:[{...valid.actors[0],beats:[{...valid.actors[0].beats[0],clip:'missing'}]}]},{actors:[{...valid.actors[0],beats:[{...valid.actors[0].beats[0],duration:-1}]}]},{actors:[{...valid.actors[0],beats:Array.from({length:6},()=>beat('idle',12))}]}];
for(const patch of invalid)assert.throws(()=>parseProject(JSON.stringify({...valid,...patch})));
for(const text of ['null','[]','{bad',' '.repeat(100001)])assert.throws(()=>parseProject(text));
const warehouse=assistExample(),warehouseFilm=parseStudioInput(JSON.stringify(warehouse));
assert.equal(warehouseFilm.title,'Agents of Mild Competence: The Warehouse');assert.equal(warehouseFilm.template,'warehouse');assert.equal(durationOf(warehouseFilm),30);
assert.deepEqual(warehouseFilm.actors.map(a=>a.id),['dez','ngozi','thug_boss','thug_heavy','thug_wiry']);assert.equal(warehouseFilm.audio.speech.length,8);assert.equal(warehouseFilm.audio.effects.length,11);assert.equal(warehouseFilm.audio.music.track,'spy-mission');assert.equal(warehouseFilm.texts.length,14);
const exampleBundle=unzipSync(readFileSync(new URL('../public/media/examples/warehouse.ara-studio.zip',import.meta.url)));
assert.deepEqual(parseStudioInput(strFromU8(exampleBundle['project.json'])),warehouseFilm);
for(const cue of warehouseFilm.audio.speech)assert.equal(createHash('sha256').update(exampleBundle[`audio/${cue.asset}.wav`]).digest('hex'),cue.asset);
warehouse.actors[0].x=10;assert.equal(assistExample().actors[0].x,.9,'Try example must return a fresh project');
console.log('Warehouse example: supplied five-character film, 30-second direction, all speech/effects/music, fresh copies and portable take hashes passed.');
const assisted=customFilmFixture(),generated=parseStudioInput(JSON.stringify(assisted));
assert.equal(generated.template,'resort-pool');assert.equal(generated.actors.length,2);assert.equal(durationOf(generated),9);
assert.equal(decodeCharacter(generated.actors[0].character,'medium')!.carry,'briefcase');assert.equal(decodeCharacter(generated.actors[1].character,'medium')!.carry,'backpack');
assert.deepEqual(parseStudioInput(JSON.stringify(generated)),generated);assert.deepEqual(parseStudioInput('```json\n'+JSON.stringify(assisted)+'\n```'),generated);assert.deepEqual(parseStudioInput(JSON.stringify(legacy)),migrated);
for(const name of Object.keys(PRESETS)){const input=structuredClone(assisted);input.actors[0].preset=name;delete (input.actors[0] as {params?:unknown}).params;const film=parseStudioInput(JSON.stringify(input));assert.equal(decodeCharacter(film.actors[0].character,'medium')!.name,name);}
const guide=generateAssistGuide(catalog,'Keep two actors talking.',generated),schema=assistSchema(catalog);
for(const scene of SETS)assert.ok(guide.includes('"'+scene.id+'"'));for(const clip of CLIPS)assert.ok(guide.includes('"'+clip.id+'"'));
for(const preset of Object.keys(PRESETS))assert.ok(guide.includes(preset));assert.ok(guide.includes(JSON.stringify(projectForAssist(generated),null,2)));assert.ok(guide.includes('Keep two actors talking.'));
assert.equal(schema.properties.actors.maxItems,5);assert.deepEqual(schema.properties.template.enum,SETS.map(s=>s.id));assert.ok(guide.length<250_000);
assert.ok(!generateAssistGuide(catalog).includes('CURRENT FILM —'));
const hostParams=decodeCharacter(generated.actors[0].character,'medium')!,guestParams=decodeCharacter(generated.actors[1].character,'medium')!;
assert.equal(hostParams.name,'Amara, the host');assert.equal(hostParams.outfit,'set_pantsuit');assert.equal(hostParams.hair,'cornrows');assert.ok(Math.abs(ageToYears(hostParams.age)-36)<1e-8);
assert.equal(guestParams.name,'Maya, the explorer');assert.equal(guestParams.outfit,'none');assert.equal(guestParams.hair,'box_braids');assert.equal(guestParams.garmentStyles.tank_top.color,'#436b67');
const embedded={...assisted,actors:[{id:'host',character:characterExample(),detail:'high',x:0,y:0,z:0,yaw:0,beats:assisted.actors[0].beats}]};
const nested=parseStudioInput(JSON.stringify(embedded)),nestedParams=decodeCharacter(nested.actors[0].character,'high')!;
assert.equal(nestedParams.name,'Desert explorer');assert.equal(nestedParams.carry,'backpack');assert.equal(nested.actors[0].detail,'high');assert.equal(nestedParams.detail,'high');
assert.deepEqual(nestedParams,{...parseCharacterInput(JSON.stringify(characterExample()),catalog),detail:'high'});
const fromRecipe={...embedded,actors:[{...embedded.actors[0],detail:'medium',character:generated.actors[0].character,params:{name:'Revised host',ageYears:43}}]};
const inherited=decodeCharacter(parseStudioInput(JSON.stringify(fromRecipe)).actors[0].character,'medium')!;
assert.equal(inherited.name,'Revised host');assert.ok(Math.abs(ageToYears(inherited.age)-43)<1e-8);assert.deepEqual({...inherited,name:hostParams.name,age:hostParams.age},hostParams);
const rawParamsFilm={...embedded,actors:[{...embedded.actors[0],character:nestedParams}]};
assert.deepEqual(decodeCharacter(parseStudioInput(JSON.stringify(rawParamsFilm)).actors[0].character,'high'),nestedParams);
assert.deepEqual(parseStudioInput(JSON.stringify(projectForAssist(generated))),generated);
assert.ok(guide.includes('CHARACTER CREATION REFERENCE'));assert.ok(guide.includes('GARMENTS AND ALLOWED PATTERNS'));assert.ok(guide.includes('ageYears'));assert.ok(guide.includes('modifiers'));
assert.ok(schema.$defs.characterParams.properties.garmentStyles);assert.equal(schema.$defs.characterSpecification.properties.params.$ref,'#/$defs/characterParams');
assert.throws(()=>parseInput(JSON.stringify(embedded)),/builder catalogue/);
for(const params of [{hair:'made-up'},{ageYears:4},{height:10},{garmentStyles:{tank_top:{color:'red'}}},{modifiers:{'unknown/slider':.5}}])assert.throws(()=>parseStudioInput(JSON.stringify({...assisted,actors:[{...assisted.actors[0],params}]})),/Character 1:/);
assert.throws(()=>parseStudioInput(JSON.stringify({...embedded,actors:[{...embedded.actors[0],params:{name:'Ambiguous'}}]})),/not both/);
assert.throws(()=>parseStudioInput(JSON.stringify({...embedded,actors:[{...embedded.actors[0],character:{kind:'ara-character',version:9,params:{name:'Wrong version'}}}]})),/Character 1:/);
console.log('Studio custom characters: params, preset inheritance, embedded builder JSON, existing recipe overrides, readable film context and invalid definitions passed.');
const badAssist=[{...assisted,audio:'voice.mp3'},{...assisted,actors:[{...assisted.actors[0],preset:'Someone invented'}]},{...assisted,actors:[{...assisted.actors[0],preset:'toString'}]},
 {...assisted,actors:[{...assisted.actors[0],character:generated.actors[0].character}]},{...assisted,actors:[{...assisted.actors[0],weapon:'laser'}]},
 {...assisted,actors:[{...assisted.actors[0],carry:'suitcase'}]},{...assisted,actors:[{...assisted.actors[0],beats:[{clip:'teleport',duration:3,move:false}]}]},
 {...assisted,shots:[{...assisted.shots[0],target:'absent'}]},{...assisted,view:{...assisted.view,fov:20}}];
for(const input of badAssist)assert.throws(()=>parseStudioInput(JSON.stringify(input)));
for(const input of ['Here is your JSON: '+JSON.stringify(assisted),'null','{bad',' '.repeat(100001)])assert.throws(()=>parseStudioInput(input));
const recovered=readEditorSession(JSON.stringify({version:1,project:generated,editor:{selectedActor:generated.actors[1].id,characterSelected:true,selected:99,time:1e9,cameraSelection:false,sceneCategory:'invented',repeat:false,assist:{brief:'Keep this idea',json:'{unfinished'},scroll:{page:Infinity}},history:[JSON.stringify(valid),'{corrupt'] }));
assert.ok(recovered);assert.equal(recovered.editor.selectedActor,generated.actors[1].id);assert.equal(recovered.editor.selected,2);assert.equal(recovered.editor.time,9);assert.equal(recovered.editor.repeat,false);assert.equal(recovered.editor.sceneCategory,'');assert.equal(recovered.editor.assist.json,'{unfinished');assert.equal(recovered.history.length,1);assert.equal(recovered.editor.scroll.page,0);
const staleSelection=readEditorSession(JSON.stringify({version:1,project:generated,editor:{selectedActor:'removed',characterSelected:true},history:[]}));
assert.ok(staleSelection);assert.equal(staleSelection.editor.characterSelected,false);assert.equal(staleSelection.editor.cameraSelection,true);
for(const input of [null,'{bad',JSON.stringify({version:9,project:generated}),JSON.stringify({version:1,project:{}})])assert.equal(readEditorSession(input),undefined);
const captions=parseSubtitles('1\n00:00:00,000 --> 00:00:01,500\nHello, world.\n\n2\n00:00:01,500 --> 00:00:03,000\nA second line.');
assert.equal(captions.length,2);assert.equal(captions[0].duration,1.5);assert.deepEqual(parseSubtitles(subtitlesToSrt(captions)),captions);
assert.equal(parseSubtitles('1\n00:00:01,100 --> 00:00:01,200\nShort cue')[0].duration,.1);
const timed=parseProject(JSON.stringify({...valid,texts:[{text:'A later caption',style:'subtitle',anchor:'screen',start:12,duration:3}]}));
assert.equal(durationOf(timed),15);assert.equal(timed.texts[0].x,.5);assert.equal(timed.texts[0].color,'#ffffff');
assert.equal(parseProject(JSON.stringify({...valid,texts:undefined})).texts.length,0);
assert.equal(parseTextCues([{text:'Hello!',style:'speech',anchor:valid.actors[0].id,start:0,duration:3}],new Set([valid.actors[0].id]))[0].y,-.12);
for(const cue of [{text:'bad',style:'subtitle',anchor:'missing',start:0,duration:3},{text:'bad',style:'html',anchor:'screen',start:0,duration:3},{text:'bad',style:'text',anchor:'screen',start:59,duration:2},{text:'bad',style:'text',anchor:'screen',start:0,duration:3,x:-.1},{text:'bad',style:'text',anchor:'screen',start:0,duration:3,color:'red'},{text:'x'.repeat(501),style:'text',anchor:'screen',start:0,duration:3}])assert.throws(()=>parseTextCues([cue],new Set()));
assert.throws(()=>parseTextCues(Array.from({length:MAX_TEXT_CUES+1},()=>timed.texts[0]),new Set()));assert.throws(()=>parseSubtitles('1\n00:00:59,000 --> 00:01:02,000\nToo long'));assert.throws(()=>parseSubtitles('not SRT'));
const screenActor=parseProject(JSON.stringify({...valid,actors:[{...valid.actors[0],id:'screen'}],texts:[{text:'Legacy actor',style:'speech',anchor:'actor:screen',start:0,duration:3}]}));assert.equal(screenActor.texts[0].anchor,'actor:screen');
console.log('Timed text: legacy migration, actor/screen anchors, duration, colours, SRT round trip and invalid cues passed.');
console.log('Editor recovery: valid film, bounded selection/time, unfinished Assist drafts, stale actor ids and damaged Undo entries passed.');
console.log(`LLM Assist: full live catalogues, ${Object.keys(PRESETS).length} presets, equipment, canonical/v1/fenced import, schema and invalid responses passed (${guide.length} guide characters).`);
console.log(`Studio model: ${SETS.length} locations, ${CLIPS.length} animations, v1 migration, independent tracks, held ends, camera subjects and invalid files passed.`);

const actors=new Set(['host','narrator']);
assert.deepEqual(parseAudio(undefined,actors),defaultAudio());assert.deepEqual(migrated.audio,defaultAudio());
const dialogue={id:'take',text:'Hello',actor:'host',start:42,duration:3,effect:'dramatic'};
const audioFilm=parseStudioInput(JSON.stringify({...valid,audio:{speech:[{...dialogue,actor:valid.actors[0].id}],music:{track:'cinematic'}}}));
assert.equal(durationOf(audioFilm),45);assert.equal(audioFilm.audio.speech[0].voice,'F1');assert.equal(audioFilm.audio.speech[0].source,'tts');assert.equal(audioFilm.audio.music.ducking,true);
assert.deepEqual(parseStudioInput(JSON.stringify(projectForAssist(audioFilm))),audioFilm);
assert.equal(parseAudio({speech:[{...dialogue,actor:speechActor('narrator')}]},actors).speech[0].actor,'actor:narrator');
for(const patch of [{effect:'alien'},{voice:'F99'},{actor:'missing'},{start:59,duration:2},{speed:0},{offset:60},{volume:2},{pan:2},{asset:'invented'},{source:'url'},{text:'x'.repeat(601)},{script:'unsupported'},{text:'',source:'file'}]){
 assert.throws(()=>parseAudio({speech:[{...dialogue,...patch}]},actors));
}
for(const music of [{track:'invented'},{volume:-1},{fadeIn:11},{ducking:'yes'},{url:'music.mp3'}])assert.throws(()=>parseAudio({music},actors));
assert.throws(()=>parseAudio({speech:[dialogue,dialogue]},actors));assert.throws(()=>parseAudio({speech:Array.from({length:MAX_SPEECH+1},()=>dialogue)},actors));
assert.throws(()=>parseAudio({muted:'yes'},actors));assert.equal(parseAudio({speech:[{text:'',source:'tts'}]},actors).speech.length,1);
assert.deepEqual(schema.properties.audio.properties.music.properties.track.enum,MUSIC_TRACKS.map(t=>t.id));assert.deepEqual(schema.properties.audio.properties.speech.items.properties.effect.enum,VOICE_EFFECTS);
assert.ok(guide.includes('Generate all speech'));assert.ok(guide.includes('Never invent asset hashes'));assert.ok(guide.includes('MUSIC LIBRARY'));
const audioRecovery=readEditorSession(JSON.stringify({version:1,project:audioFilm,editor:{sound:{open:true,selected:'take',rate:1.3,pitch:.7,deviceVoice:'test',fit:false}}}));
assert.equal(audioRecovery?.editor.sound.selected,'take');assert.equal(audioRecovery?.editor.sound.rate,1.3);assert.equal(audioRecovery?.editor.sound.fit,false);
console.log('Audio: defaults/legacy migration, actor aliases, timing, limits, validation, live LLM contract and editor recovery passed.');

// Seated characters move onto the set's own furniture: nearest free seat, facing the seat, never shared.
{
  const film=newProject('living-room'),sitter:Sitter={scale:1,hips:[0,.5,-.1]};
  const second={...newActor(),id:'second'};film.actors.push(second);
  for(const a of film.actors){a.beats=[beat('idle',1),beat('sit_down',1.5),beat('sit_idle',2),beat('stand_up',1.5)];a.x=0;a.z=0;a.yaw=0;}
  const seats=[{x:2,y:.55,z:-2,yaw:Math.PI},{x:-1,y:.5,z:-3,yaw:Math.PI/2},{x:9,y:.5,z:9,yaw:0}],sitters=new Map(film.actors.map(a=>[a.id,sitter]));
  assert.deepEqual(seatCast(film,seats,sitters),[film.actors[0].id,'second']);
  const hips=film.actors.map(a=>hipsAt(a,seatedAt(film,a)!,sitter));
  assert.ok(Math.hypot(hips[0].x-2,hips[0].z+2)<.01&&film.actors[0].yaw===180,'first sitter takes the nearest seat and faces its way');
  assert.ok(Math.hypot(hips[1].x+1,hips[1].z+3)<.01&&film.actors[1].yaw===90,'second sitter takes the next free seat');
  assert.deepEqual(seatCast(film,seats,sitters),[],'seated characters stay put');
  const standing=newProject('living-room');assert.deepEqual(seatCast(standing,seats,new Map([[standing.actors[0].id,sitter]])),[],'characters who never sit are not moved');
  assert.doesNotThrow(()=>parseProject(JSON.stringify(film)));
  console.log('Seating: nearest free seat, facing, no sharing, idempotent and valid placements passed.');
}

const ensemble=newProject(),firstActor=JSON.stringify(ensemble.actors[0]);
while(ensemble.actors.length<MAX_ACTORS)addCastActor(ensemble);
assert.equal(ensemble.actors.length,5);assert.equal(new Set(ensemble.actors.map(a=>a.id)).size,5);assert.equal(JSON.stringify(ensemble.actors[0]),firstActor);
assert.equal(addCastActor(ensemble),undefined);assert.deepEqual(parseStudioInput(JSON.stringify(projectForAssist(ensemble))),parseProject(JSON.stringify(ensemble)));
for(let count=1;count<=MAX_ACTORS;count++)for(const kind of ARRANGEMENTS){
 const cast=structuredClone(ensemble.actors.slice(0,count)),before=JSON.stringify(cast);arrangeCast(cast,kind);
 if(count!==2){assert.equal(JSON.stringify(cast),before,'Arrangement commands only apply to two actors');assert.equal(castArrangement(cast),'');continue;}
 assert.ok(Math.hypot(cast[0].x-cast[1].x,cast[0].z-cast[1].z)>=1.4);
 const snapshot=JSON.stringify(cast);assert.equal(castArrangement(cast),kind);assert.equal(JSON.stringify(cast),snapshot,'Detection must not move characters');
 cast[0].x+=.1;assert.equal(castArrangement(cast),'');cast[0].x-=.1;assert.equal(castArrangement(cast),kind);
 cast[0].y=.05;assert.equal(castArrangement(cast),'');cast[0].y=0;cast[0].yaw+=5;assert.equal(castArrangement(cast),'');
}
const removed=ensemble.actors.splice(2,1)[0];assert.equal(addCastActor(ensemble)?.id,removed.id);assert.equal(new Set(ensemble.actors.map(a=>a.id)).size,5);
assert.throws(()=>parseProject(JSON.stringify({...ensemble,actors:[...ensemble.actors,{...ensemble.actors[0],id:'sixth'}]})),/one to 5/);
for(const track of MUSIC_TRACKS){assert.ok(guide.includes(track.id));if(track.file)assert.ok(readFileSync(new URL('../public/media/music/'+track.file,import.meta.url)).length>1000);}
assert.equal(MUSIC_TRACKS.filter(t=>t.file).length,9);assert.equal(parseAudio({music:{track:'cinematic'}},new Set()).music.track,'adventure-trailer');assert.equal(parseAudio({music:{track:'ambient'}},new Set()).music.track,'tropical-pop');
console.log('Five-character cast: cap, IDs, safe addition, two-character arrangements, readable LLM JSON and recorded music migration passed.');

// Independent sound effects use the same validated, portable audio contract as speech/music.
const fxAudio=parseAudio({effects:[{sound:'body-fall-thump',actor:'host',start:1,offset:.1,speed:2}]},actors);
assert.equal(fxAudio.effects[0].duration,(.6065-.1)/2);assert.equal(fxAudio.effects[0].id,'fx-0');assert.ok(hasAudio(fxAudio));
assert.ok(!hasAudio({...fxAudio,muted:true}));assert.ok(!hasAudio({...fxAudio,effects:[{...fxAudio.effects[0],volume:0}]}));
const fxFilm=parseStudioInput(JSON.stringify({...valid,audio:{effects:[{sound:'suppressed-pistol-shot',start:42}]}}));
assert.ok(Math.abs(durationOf(fxFilm)-Math.ceil(42.6065*30)/30)<1e-7);
assert.deepEqual(parseStudioInput(JSON.stringify(projectForAssist(fxFilm))),fxFilm);
for(const patch of [{sound:'unknown'},{actor:'missing'},{start:59.9,duration:.2},{offset:.6065},{offset:-.1},{speed:0},{speed:2.1},{pan:2},{volume:2.1},{duration:.001},{loop:'yes'},{loop:null},{url:'effect.mp3'},{id:'invalid id'},{start:NaN}])assert.throws(()=>parseAudio({effects:[{sound:'body-fall-thump',...patch}]},actors));
assert.throws(()=>parseAudio({effects:[{id:'same',sound:'body-fall-thump'},{id:'same',sound:'body-fall-thump'}]},actors));
assert.throws(()=>parseAudio({effects:Array.from({length:MAX_SOUND_EFFECTS+1},()=>({sound:'body-fall-thump'}))},actors));
assert.doesNotThrow(()=>parseAudio({effects:Array.from({length:MAX_SOUND_EFFECTS},()=>({sound:'body-fall-thump'}))},actors));
assert.deepEqual(schema.properties.audio.properties.effects.items.properties.sound.enum,SOUND_EFFECTS.map(s=>s.id));assert.equal(schema.properties.audio.properties.effects.maxItems,MAX_SOUND_EFFECTS);
for(const sound of SOUND_EFFECTS)assert.ok(guide.includes(sound.id));assert.ok(guide.includes('no physical collision response'));assert.ok(guide.includes('audio.effects'));assert.ok(guide.includes('Sounds do not add weapons'));
const fxSession=readEditorSession(JSON.stringify({version:1,project:fxFilm,editor:{sound:{open:true,tab:'effects',selectedEffect:'fx-0'}}}));
assert.equal(fxSession?.editor.sound.tab,'effects');assert.equal(fxSession?.editor.sound.selectedEffect,'fx-0');
console.log('Sound effects: legacy defaults, timing/trim/speed, actor references, cap, invalid cues, LLM catalogue/schema, explicit collision limits and recovery passed.');

for(const vehicle of VEHICLE_CHOICES){const input=structuredClone(assisted)as unknown as {actors:Record<string,unknown>[]};input.actors[0].vehicle=vehicle;input.actors[0].params={vehicleStyle:{color:'#176a80',finish:'gloss'}};const p=parseStudioInput(JSON.stringify(input));assert.equal(p.actors[0].vehicle,vehicle==='none'?'none':'auto');assert.equal(decodeCharacter(p.actors[0].character,p.actors[0].detail)!.vehicleStyle.color,'#176a80');assert.deepEqual(parseProject(JSON.stringify(p)),p);}
assert.throws(()=>parseStudioInput(JSON.stringify({...assisted,actors:[{...assisted.actors[0],vehicle:'spaceship'}]})));
for(const [clip,id]of Object.entries(VEHICLE_FOR_CLIP)){assert.ok(guide.includes('"'+clip+'"'));assert.ok(guide.includes('"'+id+'"'));}
console.log('Studio vehicle Assist: matching catalogue, explicit visibility, styles, saved projects and strict imports passed.');

// Vehicle paths are optional, continuous, centred and support explicit speed without retiming.
for(const clip of Object.keys(RIDING_VEHICLES)){
 const p=newProject();p.actors[0].beats=[{...beat(clip,2,true),travelSpeed:1.1},beat('idle',1)];const parsed=parseProject(JSON.stringify(p));assert.equal(parsed.actors[0].beats[0].move,true);const a=timelineAt(parsed,0),b=timelineAt(parsed,2),c=timelineAt(parsed,3);assert.ok(Math.abs(Math.abs(b.z-a.z)-2.2)<1e-6);assert.equal(c.z,b.z);
}
const legacyVehicle=newProject();legacyVehicle.actors[0].vehicle='suv';legacyVehicle.actors[0].beats=[beat('drive_car',3)];const migratedVehicle=parseProject(JSON.stringify(legacyVehicle));assert.equal(migratedVehicle.actors[0].beats[0].clip,'drive_suv');assert.equal(migratedVehicle.actors[0].vehicle,'auto');migratedVehicle.actors[0].beats[0].clip='ride_bicycle';assert.equal(parseProject(JSON.stringify(migratedVehicle)).actors[0].beats[0].clip,'ride_bicycle');
for(const travelSpeed of [0,31,'fast'])assert.throws(()=>parseProject(JSON.stringify({...p,actors:[{...p.actors[0],beats:[{clip:'drive_suv',duration:2,move:true,travelSpeed}]}]})));
assert.throws(()=>parseProject(JSON.stringify({...p,actors:[{...p.actors[0],beats:[{clip:'walk',duration:2,move:true,travelSpeed:1}]}]})));
console.log('Vehicle travel: all actions, speed validation, held endings, legacy model migration and animation authority passed.');

for(const id of ['board_suv','alight_suv','board_kayak']){const p=newProject();p.actors[0].beats=[beat(id,4,true)];assert.equal(parseProject(JSON.stringify(p)).actors[0].beats[0].move,false);assert.throws(()=>parseProject(JSON.stringify({...p,actors:[{...p.actors[0],beats:[{...p.actors[0].beats[0],travelSpeed:1}]}]})));assert.ok(guide.includes(id));}assert.ok(guide.includes('28 one-shot actions'));

// Shot direction and loop flags must survive every import path without changing old projects.
const customCamera=structuredClone(valid);customCamera.shots[0].view={azimuth:90,elevation:20,zoom:.8};customCamera.shots[0].camera='locked';
assert.deepEqual(parseStudioInput(JSON.stringify(customCamera)).shots[0].view,customCamera.shots[0].view);
assert.equal(parseProject(JSON.stringify(customCamera)).shots[0].camera,'locked');
assert.equal(parseProject(JSON.stringify(valid)).shots[0].view,undefined);
for(const patch of [{view:{azimuth:181,elevation:0,zoom:1}},{view:{azimuth:0,zoom:1}},{view:[]},{camera:'fly'}])assert.throws(()=>parseProject(JSON.stringify({...valid,shots:[{...valid.shots[0],...patch}]})));
assert.throws(()=>parseStudioInput(JSON.stringify({...valid,shots:[{...customCamera.shots[0],view:{...customCamera.shots[0].view,fov:45}}]})));
assert.equal(parseAudio({effects:[{sound:'car-engine',loop:true,duration:30}]},actors).effects[0].loop,true);
assert.equal(parseAudio({effects:[{sound:'car-engine',loop:false}]},actors).effects[0].loop,false);
assert.equal(parseAudio({effects:[{sound:'car-engine'}]},actors).effects[0].loop,undefined);
assert.equal(parseAudio({music:{track:'none',start:2,duration:4}},actors).music.duration,4);
assert.throws(()=>parseAudio({music:{start:59,duration:2}},actors));
console.log('Per-shot direction, inherited legacy cameras, loop flags and music windows passed.');

const storyIds=['hospital-room','police-station','interrogation-room','highway','military-base','prison-cell','prison-yard','public-restroom','private-bathroom','neon-street','back-alley','football-stadium','fine-dining','night-club','elevator','church'];
for(const id of storyIds){const scene=SETS.find(s=>s.id===id)!;assert.ok(scene?.staging);assert.ok(guide.includes(scene.staging!));assert.ok(schema.properties.template.enum.includes(scene.id));}
for(const [query,id]of [['nightclub','night-club'],['soccer','football-stadium'],['lift','elevator'],['public toilet','public-restroom'],['chapel','church']])assert.ok(searchScenes(query).some(s=>s.id===id));
assert.equal(SETS.find(s=>s.id==='alley')!.name,'Neon alley');assert.ok(searchScenes('alley').some(s=>s.id==='back-alley'));
console.log('Story sets: all sixteen searchable locations, aliases, staging notes, legacy alley and live Assist schema passed.');
