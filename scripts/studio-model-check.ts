/** Schema migration, catalogue contracts and independent actor/camera clock invariants. */
import assert from 'node:assert/strict';
import { newProject, newActor, parseProject, timelineAt, durationOf, shotAt, beat, presetCode } from '../src/studio/project';
import { SETS, searchScenes, SCENE_CATEGORIES } from '../src/studio/catalog';
import { searchAnimations } from '../src/studio/animations';
import { equipActor, WEAPONS, CARRIED } from '../src/studio/equipment';
import { decodeCharacter } from '../src/app/share';
import { assistExample, assistSchema, generateAssistGuide, parseStudioInput } from '../src/studio/assist';
import { PRESETS } from '../src/core/params';
import { CLIPS } from '../src/core/anim/clips';
assert.equal(SETS.length,50);assert.equal(new Set(SETS.map(s=>s.id)).size,50);assert.equal(SCENE_CATEGORIES.length,6);
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
const assisted=assistExample(),generated=parseStudioInput(JSON.stringify(assisted));
assert.equal(generated.template,'resort-pool');assert.equal(generated.actors.length,2);assert.equal(durationOf(generated),9);
assert.equal(decodeCharacter(generated.actors[0].character,'medium')!.carry,'briefcase');assert.equal(decodeCharacter(generated.actors[1].character,'medium')!.carry,'backpack');
assert.deepEqual(parseStudioInput(JSON.stringify(generated)),generated);assert.deepEqual(parseStudioInput('```json\n'+JSON.stringify(assisted)+'\n```'),generated);assert.deepEqual(parseStudioInput(JSON.stringify(legacy)),migrated);
for(const name of Object.keys(PRESETS)){const input=structuredClone(assisted);input.actors[0].preset=name;const film=parseStudioInput(JSON.stringify(input));assert.equal(decodeCharacter(film.actors[0].character,'medium')!.name,name);}
const guide=generateAssistGuide('Keep two actors talking.',generated),schema=assistSchema();
for(const scene of SETS)assert.ok(guide.includes('"'+scene.id+'"'));for(const clip of CLIPS)assert.ok(guide.includes('"'+clip.id+'"'));
for(const preset of Object.keys(PRESETS))assert.ok(guide.includes(preset));assert.ok(guide.includes(JSON.stringify(generated,null,2)));assert.ok(guide.includes('Keep two actors talking.'));
assert.equal(schema.properties.actors.maxItems,2);assert.deepEqual(schema.properties.template.enum,SETS.map(s=>s.id));assert.ok(guide.length<100_000);
assert.ok(!generateAssistGuide().includes('CURRENT FILM —'));
const badAssist=[{...assisted,audio:'voice.mp3'},{...assisted,actors:[{...assisted.actors[0],preset:'Someone invented'}]},{...assisted,actors:[{...assisted.actors[0],preset:'toString'}]},
 {...assisted,actors:[{...assisted.actors[0],character:generated.actors[0].character}]},{...assisted,actors:[{...assisted.actors[0],weapon:'laser'}]},
 {...assisted,actors:[{...assisted.actors[0],carry:'suitcase'}]},{...assisted,actors:[{...assisted.actors[0],beats:[{clip:'teleport',duration:3,move:false}]}]},
 {...assisted,shots:[{...assisted.shots[0],target:'absent'}]},{...assisted,view:{...assisted.view,fov:20}}];
for(const input of badAssist)assert.throws(()=>parseStudioInput(JSON.stringify(input)));
for(const input of ['Here is your JSON: '+JSON.stringify(assisted),'null','{bad',' '.repeat(100001)])assert.throws(()=>parseStudioInput(input));
console.log(`LLM Assist: full live catalogues, ${Object.keys(PRESETS).length} presets, equipment, canonical/v1/fenced import, schema and invalid responses passed (${guide.length} guide characters).`);
console.log('Studio model: 50 locations, 77 animations, v1 migration, independent tracks, held ends, camera subjects and invalid files passed.');
