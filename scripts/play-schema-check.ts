/**
 * Checks the Ara Play game JSON Schema against the importer: the examples and the default game validate under both,
 * invalid games fail under both, and each part of the schema lists exactly the keys its parser allows.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {nodeLibrary} from './node-assets';
import {playSchema} from '../src/play/schema';
import {defaultProject} from '../src/play/project';
import {parsePlayInput,playExample,campaignExample,raceExample,runnerExample} from '../src/play/assist';

type Schema=Record<string,any>;
const {catalog}=await nodeLibrary(),schema=playSchema(catalog) as Schema;
let checks=0;const check=(name:string,fn:()=>void)=>{fn();checks++;console.log('OK',name);};

/** Validates the JSON Schema subset the Ara schemas use; returns the first few errors with their paths. */
function validate(root:Schema,value:unknown):string[]{
 const errors:string[]=[],isObject=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
 const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
 const typeOf=(v:unknown)=>v===null?'null':Array.isArray(v)?'array':typeof v;
 const walk=(s:Schema,v:unknown,path:string,out:string[])=>{
  const fail=(message:string)=>out.push(`${path||'(root)'}: ${message}`);
  if(s.$ref){const target=(s.$ref as string).replace(/^#\//,'').split('/').reduce((o:any,k)=>o?.[k],root);if(!target)return fail(`unresolved ${s.$ref}`);walk(target,v,path,out);}
  if(s.type){const t=typeOf(v),ok=s.type==='integer'?Number.isInteger(v):s.type==='number'?typeof v==='number'&&Number.isFinite(v):t===s.type;if(!ok)return fail(`expected ${s.type}, got ${t}`);}
  if('const'in s&&!same(s.const,v))fail(`expected ${JSON.stringify(s.const)}`);
  if(s.enum&&!s.enum.some((e:unknown)=>same(e,v)))fail(`${JSON.stringify(v)} is not one of ${JSON.stringify(s.enum).slice(0,200)}`);
  if(typeof v==='number'){if(s.minimum!==undefined&&v<s.minimum)fail(`below ${s.minimum}`);if(s.maximum!==undefined&&v>s.maximum)fail(`above ${s.maximum}`);if(s.exclusiveMinimum!==undefined&&v<=s.exclusiveMinimum)fail(`not above ${s.exclusiveMinimum}`);}
  if(typeof v==='string'){if(s.minLength!==undefined&&v.length<s.minLength)fail(`shorter than ${s.minLength}`);if(s.maxLength!==undefined&&v.length>s.maxLength)fail(`longer than ${s.maxLength}`);if(s.pattern&&!new RegExp(s.pattern,'u').test(v))fail(`does not match ${s.pattern}`);}
  if(Array.isArray(v)){
   if(s.minItems!==undefined&&v.length<s.minItems)fail(`fewer than ${s.minItems} items`);if(s.maxItems!==undefined&&v.length>s.maxItems)fail(`more than ${s.maxItems} items`);
   if(s.uniqueItems&&new Set(v.map(x=>JSON.stringify(x))).size!==v.length)fail('duplicate items');
   if(s.items)v.forEach((item,i)=>walk(s.items,item,`${path}[${i}]`,out));
  }
  if(isObject(v)){
   const keys=Object.keys(v);
   for(const key of s.required??[])if(!(key in v))fail(`missing ${key}`);
   if(s.maxProperties!==undefined&&keys.length>s.maxProperties)fail(`more than ${s.maxProperties} properties`);
   for(const key of keys){
    if(s.propertyNames)walk(s.propertyNames,key,`${path}{${key}}`,out);
    if(s.properties&&key in s.properties)walk(s.properties[key],v[key],path?`${path}.${key}`:key,out);
    else if(s.additionalProperties===false)fail(`unknown property ${key}`);
    else if(isObject(s.additionalProperties))walk(s.additionalProperties,v[key],`${path}.${key}`,out);
   }
  }
  const passes=(sub:Schema)=>{const e:string[]=[];walk(sub,v,path,e);return !e.length;};
  if(s.allOf)for(const sub of s.allOf)walk(sub,v,path,out);
  if(s.anyOf&&!s.anyOf.some(passes))fail('matches none of anyOf');
  if(s.oneOf){const n=s.oneOf.filter(passes).length;if(n!==1){const detail:string[]=[];if(!n)for(const sub of s.oneOf){const e:string[]=[];walk(sub,v,path,e);detail.push(e[0]);}fail(`matches ${n} of oneOf${detail.length?` (${detail.join(' | ')})`:''}`);}}
  if(s.not&&passes(s.not))fail('matches a "not" schema');
  if(s.if)walk(passes(s.if)?s.then??{}:s.else??{},v,path,out);
 };
 walk(root,value,'',errors);return errors.slice(0,5);
}
const parses=(game:unknown)=>{try{parsePlayInput(JSON.stringify(game),catalog);return true;}catch{return false;}};

// a. Every example validates and imports.
for(const [name,example]of Object.entries({playExample,campaignExample,raceExample,runnerExample}))check(`${name} validates against the schema and imports`,()=>{
 assert.deepEqual(validate(schema,example()),[],name);parsePlayInput(JSON.stringify(example()),catalog);
});
// b. A default game, as Ara saves it, validates.
check('the default game validates',()=>assert.deepEqual(validate(schema,JSON.parse(JSON.stringify(defaultProject()))),[]));

// c. Each schema part allows exactly the keys its parser allows. `after` takes the first string array after the anchor,
// `before` the last one before it.
const sources=new Map<string,string>(),source=(file:string)=>{if(!sources.has(file))sources.set(file,readFileSync(resolve(import.meta.dirname,'../src/play',file),'utf8'));return sources.get(file)!;};
const ARRAY=/\[\s*('[^'\n]*'(?:\s*,\s*'[^'\n]*')*)\s*\]/g;
function parserKeys(file:string,anchor:string,side:'before'|'after'):string[]{
 const text=source(file),at=text.indexOf(anchor);assert.ok(at>=0,`${file}: anchor not found: ${anchor}`);
 const arrays=[...text.matchAll(ARRAY)].map(m=>({index:m.index!,keys:[...m[1].matchAll(/'([^']*)'/g)].map(k=>k[1])}));
 const found=side==='after'?arrays.find(a=>a.index>=at):arrays.filter(a=>a.index<at).at(-1);assert.ok(found,`${file}: no key list ${side} ${anchor}`);return found.keys;
}
const PARTS:[part:string,file:string,anchor:string,side:'before'|'after'][]=[
 ['(root)','project.ts','Unsupported game setting','before'],['chapter','project.ts','Unsupported chapter setting','before'],
 ['identity','project.ts','Unsupported game identity setting','before'],['identity.briefingIf','project.ts','briefingIf needs a story flag','before'],
 ['branch','project.ts','A chapter branch needs a prompt','before'],['branch.options','project.ts','Each branch choice needs','before'],
 ['enemy','project.ts','Unsupported enemy setting','before'],['companion','project.ts','Unsupported companion setting','before'],
 ['mission','mission.ts','Unsupported mission setting','before'],['step','objectives.ts','Use a supported objective step','before'],
 ['environment','environment.ts','Unsupported atmosphere setting','before'],['loadout','combat.ts','Unsupported loadout setting','before'],
 ['progression','progression.ts','Unsupported progression setting','before'],['camera','presentation.ts','Unsupported camera setting','before'],
 ['music','presentation.ts','Unsupported music setting','before'],['vehicle','driving.ts','Unsupported vehicle setting','before'],
 ['city','city.ts','Unsupported city district setting','before'],['theme','theme.ts','Unsupported theme setting','before'],
 ['story','story.ts','export function parseStory','after'],['cue','story.ts','cues:p.cues.map','after'],
 ['story.opening','story.ts','export function parseMedia','after'],['cue.audio','story.ts','export function parseMedia','after'],
 ['race','arcade/modes.ts',"record(raw, 'race',",'after'],['raceCar','arcade/modes.ts',"record(p.car, 'race car',",'after'],
 ['runner','arcade/modes.ts',"record(raw, 'runner',",'after'],['runnerGoal','arcade/modes.ts',"record(p.goal, 'runner goal',",'after'],
 ['customTrack','arcade/track.ts','Unsupported race track setting','before'],['runnerObject','arcade/objects.ts','Unsupported ${at} setting','before'],
 ['runnerMedals','arcade/medals.ts','Unsupported runner.medals setting','before'],
];
const resolveRef=(s:Schema):Schema=>s.$ref?resolveRef((s.$ref as string).replace(/^#\//,'').split('/').reduce((o:any,k)=>o[k],schema)):s;
function schemaPart(part:string):Schema{
 if(part==='(root)')return schema;
 const [head,...rest]=part.split('.');let s=resolveRef(schema.$defs[head]);
 for(const key of rest){s=resolveRef(s.properties[key]);if(s.items)s=resolveRef(s.items);}
 return s;
}
const compare=(part:string,expected:string[])=>{
 const actual=Object.keys(schemaPart(part).properties),missing=expected.filter(k=>!actual.includes(k)),extra=actual.filter(k=>!expected.includes(k));
 assert.ok(!missing.length&&!extra.length,`${part}: schema is missing ${JSON.stringify(missing)} and has extra ${JSON.stringify(extra)} compared with the parser.`);
};
check('every schema part lists exactly the keys its parser allows',()=>{
 for(const [part,file,anchor,side]of PARTS)compare(part,parserKeys(file,anchor,side));
 // parsePoses compares each key directly instead of through a list.
 const poses=source('project.ts').match(/function parsePoses[^\n]*/)![0];compare('poses',[...new Set([...poses.matchAll(/key!=='(\w+)'/g)].map(m=>m[1]))]);
});

// d. Invalid games fail under both the schema and the importer.
const broken:[string,(g:any)=>void][]=[
 ['an unknown top-level key',g=>g.lives=3],
 ['an unknown mission key',g=>g.mission.weather='rain'],
 ['an unknown story value',g=>g.mission.story='flee'],
 ['a music volume above 1',g=>g.music.volume=2],
 ['a map variation of 12',g=>g.mission.variation=12],
 ['an unknown enemy aggression',g=>g.enemies[0].aggression='furious'],
 ['an unknown chapter key',g=>g.chapters[0].character='The Soldier'],
 ['six enemies',g=>g.enemies=Array.from({length:6},(_,i)=>({...g.enemies[0],id:`e${i}`}))],
 ['a runner without mode "runner"',g=>g.runner={theme:'volcano'}],
 ['an unknown character preset',g=>g.character='The Nobody'],
];
for(const [name,alter]of broken)check(`${name} is rejected by the schema and the importer`,()=>{
 const game:any=campaignExample();alter(game);
 assert.ok(validate(schema,game).length,`schema accepted ${name}`);assert.ok(!parses(game),`importer accepted ${name}`);
});
console.log(`${checks} Play schema checks passed.`);
