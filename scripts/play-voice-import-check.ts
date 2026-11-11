import assert from 'node:assert/strict';
import {defaultProject,chapterSettings} from '../src/play/project';
import {cueVoice,generateImportedVoices} from '../src/play/voice-import';
import type {StoryCue} from '../src/play/story';

const project=defaultProject(),cue=(id:string,speaker:string,voice=true):StoryCue=>({id,trigger:'start',text:`Line ${id}`,duration:5,speaker,style:'subtitle',voice});
project.character.gender=0;project.enemies[0].character.gender=1;
project.story={cues:[cue('hero','player'),cue('guard','enemy-1'),{...cue('recorded','radio'),audio:{id:'a'.repeat(64),name:'Recording',mime:'audio/wav',duration:2}},cue('text','radio',false)]};
const later=structuredClone(project);later.story={cues:[{...cue('radio','radio'),voiceId:'M2'}]};project.chapters=[chapterSettings(later,'chapter-2')];
assert.equal(cueVoice(project.story.cues[0],project),'F1');assert.equal(cueVoice(project.story.cues[1],project),'M1');
const calls:string[]=[],result=await generateImportedVoices(project,()=>{},async(text,voice)=>{calls.push(`${text}/${voice}`);return {id:String(calls.length).repeat(64),name:text,duration:1.5};});
assert.deepEqual(result,{generated:3,failed:0,error:''});assert.deepEqual(calls,['Line hero/F1','Line guard/M1','Line radio/M2']);assert.equal(project.story.cues[2].audio?.name,'Recording');assert.equal(project.story.cues[3].audio,undefined);assert.equal(project.chapters[0].story?.cues[0].audio?.mime,'audio/wav');
assert.deepEqual(await generateImportedVoices(project,()=>{},async()=>{throw Error('Existing lines should not regenerate.');}),{generated:0,failed:0,error:''});
console.log('OK imported voiced lines select female or male voices, preserve recordings, and generate once');
