import assert from 'node:assert/strict';
import {sharedBoatFilm} from './fixtures/studio-shared-vehicles';
import {blankProject,beat,durationOf,newActor,parseProject} from '../src/studio/project';
import {resizeTimelineClip,clipWindow,moveTimelineClip,reorderTimelineClip,dropIndex,type TimelineClip} from '../src/studio/timeline-resize';
const p=blankProject();p.actors[0].beats=[beat('idle',2),beat('wave',3),beat('idle',4)];p.shots=[{id:'one',shot:'wide',target:'all',duration:3},{id:'two',shot:'close',target:'all',duration:6}];
p.texts=[{id:'text',text:'Hello',style:'subtitle',anchor:'screen',start:2,duration:3,x:.5,y:.9,size:28,color:'#ffffff',background:'#000000'}];
p.audio.speech=[{source:'tts',id:'voice',name:'Speech',actor:'narrator',text:'Hello',voice:'F1',start:2,duration:3,offset:.2,speed:1,volume:1,pan:0,effect:'natural'}];
p.audio.effects=[{id:'engine',name:'Engine',sound:'car-engine',start:2,duration:3,loop:true,offset:1,speed:1.5,volume:.8,pan:0}];p.audio.music.track='spy-mission';
const before=JSON.stringify(p),action:TimelineClip={kind:'action',actor:p.actors[0].id,index:1};
let changed=resizeTimelineClip(p,action,'end',1);assert.deepEqual(changed.actors[0].beats.map(b=>b.duration),[2,4,4]);assert.equal(durationOf(changed),10);
changed=resizeTimelineClip(p,action,'start',1);assert.deepEqual(changed.actors[0].beats.map(b=>b.duration),[3,2,4]);assert.equal(clipWindow(changed,action).start+clipWindow(changed,action).duration,5);
changed=resizeTimelineClip(p,action,'start',100);assert.deepEqual(changed.actors[0].beats.map(b=>b.duration),[4.9,.1,4]);
assert.deepEqual(resizeTimelineClip(p,{...action,index:0},'start',1).actors[0].beats.map(b=>b.duration),[2,3,4]);
assert.equal(resizeTimelineClip(p,action,'end',-100).actors[0].beats[1].duration,.1);
assert.equal(resizeTimelineClip(p,action,'end',100).actors[0].beats[1].duration,12);
for(const ref of [{kind:'text',id:'text'},{kind:'speech',id:'voice'},{kind:'effect',id:'engine'}]as const){
 const left=clipWindow(resizeTimelineClip(p,ref,'start',1),ref);assert.deepEqual(left,{start:3,duration:2});
 const right=clipWindow(resizeTimelineClip(p,ref,'end',1),ref);assert.deepEqual(right,{start:2,duration:4});
 const bounded=clipWindow(resizeTimelineClip(p,ref,'end',100),ref);assert.equal(bounded.start+bounded.duration,60);
 assert.equal(clipWindow(resizeTimelineClip(p,ref,'start',-100),ref).start,0);
}
changed=resizeTimelineClip(p,{kind:'effect',id:'engine'},'end',-100);assert.equal(changed.audio.effects[0].duration,.01);assert.equal(changed.audio.effects[0].offset,1);assert.equal(changed.audio.effects[0].loop,true);
changed=resizeTimelineClip(p,{kind:'music'},'start',2);assert.deepEqual(clipWindow(changed,{kind:'music'}),{start:2,duration:7});
changed=resizeTimelineClip(p,{kind:'music'},'end',2);assert.equal(durationOf(changed),11);
const camera=resizeTimelineClip(p,{kind:'camera',index:1},'start',1);assert.deepEqual(camera.shots.map(s=>s.duration),[4,5]);
p.actors.push(newActor(undefined,'medium','other'));assert.deepEqual(resizeTimelineClip(p,action,'end',1).actors[1],parseProject(JSON.stringify(p)).actors[1]);p.actors.pop();assert.equal(JSON.stringify(p),before,'source snapshots must remain immutable');
assert.throws(()=>resizeTimelineClip(p,action,'end',NaN));
console.log('Timeline timing: ripple/rolling edits, absolute cue edges, music windows, source trims, frame limits and immutable history passed.');

const boat=parseProject(JSON.stringify(sharedBoatFilm()));assert.throws(()=>resizeTimelineClip(boat,{kind:'action',actor:boat.actors[0].id,index:1},'end',-7),'Trimming may not move a vehicle during passenger boarding');
console.log('Timeline vehicle trims preserve shared boarding constraints.');

const lateMusic=structuredClone(p);lateMusic.audio.music.start=10;assert.throws(()=>parseProject(JSON.stringify(lateMusic)));lateMusic.audio.music.duration=2;assert.equal(durationOf(parseProject(JSON.stringify(lateMusic))),12);

const full=blankProject();full.actors[0].beats=[beat('idle',11/3),...Array.from({length:5},()=>beat('idle',10)),beat('idle',19/3)];assert.equal(durationOf(full),60);const roll=resizeTimelineClip(full,{kind:'action',actor:full.actors[0].id,index:1},'start',.1);assert.equal(durationOf(roll),60,'Fractional source timing must not overflow a full film when rolling a boundary');

// Dragging a clip: actions and shots reorder within their track; cues move in time with their length kept.
assert.deepEqual(reorderTimelineClip(p,action,0).actors[0].beats.map(b=>b.clip),['wave','idle','idle']);
assert.deepEqual(reorderTimelineClip(p,action,2).actors[0].beats.map(b=>[b.clip,b.duration]),[['idle',2],['idle',4],['wave',3]]);
assert.equal(durationOf(reorderTimelineClip(p,action,2)),durationOf(parseProject(before)));
assert.deepEqual(reorderTimelineClip(p,{kind:'camera',index:1},0).shots.map(s=>s.shot),['close','wide']);
assert.throws(()=>reorderTimelineClip(p,action,3));assert.throws(()=>reorderTimelineClip(p,{kind:'text',id:'text'},0));
// Durations [2,3,4] dragging the middle clip: its centre before 1 s goes first, past 2 + 4/2 = 4 s goes last.
assert.equal(dropIndex([2,3,4],1,.9),0);assert.equal(dropIndex([2,3,4],1,1.5),1);assert.equal(dropIndex([2,3,4],1,3.9),1);assert.equal(dropIndex([2,3,4],1,4.1),2);assert.equal(dropIndex([2,3,4],0,0),0);
for(const ref of [{kind:'text',id:'text'},{kind:'speech',id:'voice'},{kind:'effect',id:'engine'}]as const){
 assert.deepEqual(clipWindow(moveTimelineClip(p,ref,1.5),ref),{start:3.5,duration:3});
 assert.deepEqual(clipWindow(moveTimelineClip(p,ref,-100),ref),{start:0,duration:3});
 assert.deepEqual(clipWindow(moveTimelineClip(p,ref,100),ref),{start:57,duration:3});
}
const movedEffect=moveTimelineClip(p,{kind:'effect',id:'engine'},1);assert.equal(movedEffect.audio.effects[0].offset,1);assert.equal(movedEffect.audio.effects[0].loop,true);assert.equal(movedEffect.audio.effects[0].speed,1.5);
assert.deepEqual(clipWindow(moveTimelineClip(p,{kind:'music'},2),{kind:'music'}),{start:2,duration:7});
assert.ok(clipWindow(moveTimelineClip(p,{kind:'music'},100),{kind:'music'}).start<durationOf(p));
assert.throws(()=>moveTimelineClip(p,action,1));assert.equal(JSON.stringify(p),before,'moves must not change the source snapshot');
// Directions wrap around the compass: an LLM's 200° shot or actor turn means -160°.
{const turned=structuredClone(p);turned.shots[0].view={azimuth:200,elevation:6,zoom:1};turned.actors[0].yaw=-190;const read=parseProject(JSON.stringify(turned));assert.equal(read.shots[0].view!.azimuth,-160);assert.equal(read.actors[0].yaw,170);
 turned.shots[0].view={azimuth:540,elevation:6,zoom:1};assert.equal(parseProject(JSON.stringify(turned)).shots[0].view!.azimuth,180);turned.shots[0].view={azimuth:Number.NaN,elevation:6,zoom:1};assert.throws(()=>parseProject(JSON.stringify(turned)),/camera rotation/);}
console.log('Timeline dragging: reorder within tracks, drop slots, cue moves keep length and source trims, film limits.');
