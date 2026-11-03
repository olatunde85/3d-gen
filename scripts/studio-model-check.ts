/** Schema migration, catalogue contracts and independent actor/camera clock invariants. */
import assert from 'node:assert/strict';
import { newProject, newActor, parseProject, timelineAt, durationOf, shotAt, beat, presetCode } from '../src/studio/project';
import { SETS, searchScenes, SCENE_CATEGORIES } from '../src/studio/catalog';
import { searchAnimations } from '../src/studio/animations';
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
const valid=newProject();
const invalid=[{version:3},{template:'missing'},{actors:[]},{actors:[{...valid.actors[0],id:'all'}]},{actors:[{...valid.actors[0],id:'camera'}]},{actors:[...valid.actors,...valid.actors]},{shots:[]},{shots:[{...valid.shots[0],target:'missing'}]},{view:{azimuth:0,elevation:90,zoom:1}},{actors:[{...valid.actors[0],x:Infinity}]},{actors:[{...valid.actors[0],beats:[{...valid.actors[0].beats[0],clip:'missing'}]}]},{actors:[{...valid.actors[0],beats:[{...valid.actors[0].beats[0],duration:-1}]}]},{actors:[{...valid.actors[0],beats:Array.from({length:6},()=>beat('idle',12))}]}];
for(const patch of invalid)assert.throws(()=>parseProject(JSON.stringify({...valid,...patch})));
for(const text of ['null','[]','{bad',' '.repeat(100001)])assert.throws(()=>parseProject(text));
console.log('Studio model: 50 locations, 77 animations, v1 migration, independent tracks, held ends, camera subjects and invalid files passed.');
