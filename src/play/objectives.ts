/** Declarative, bounded mission steps: all positions come from validated map lanes. */
import {blocked,route,type Point} from './world';
import type {MissionSettings,MissionWorld} from './mission';
import {missionObstacles} from './mission';
export const STEP_TYPES=['reach','download','defend','eliminate','survive','escort','chase','convoy']as const;
export type StepType=typeof STEP_TYPES[number];
export interface MissionStep {type:StepType;label?:string;duration?:number;target?:string;waves?:number}
export interface StagedStep {step:MissionStep;position:Point;radius:number}
export const stepDuration=(step:MissionStep)=>step.type==='download'?Math.min(15,step.duration??10):step.duration??60;
export const needsCompanion=(m:MissionSettings)=>m.steps?.length?m.steps.some(s=>s.type==='escort'):m.story==='rescue';
export function parseSteps(raw:unknown):MissionStep[]{
 if(!Array.isArray(raw)||raw.length<1||raw.length>8)throw Error('Choose one to eight objective steps.');return raw.map((s,index)=>{try{if(!s||typeof s!=='object'||Array.isArray(s)||Object.keys(s).some(k=>!['type','label','duration','target','waves'].includes(k))||!STEP_TYPES.includes(s.type))throw Error('Use a supported objective step.');if(s.label!==undefined&&(typeof s.label!=='string'||!s.label.trim()||s.label.length>80))throw Error('Use an objective label up to 80 characters.');if(s.duration!==undefined&&(!['download','defend'].includes(s.type)||!Number.isFinite(s.duration)||s.duration<3||s.duration>180))throw Error('Download/defend durations must be 3–180 seconds.');if(s.target!==undefined&&(s.type!=='eliminate'||typeof s.target!=='string'||!/^[\w-]{1,50}$/.test(s.target)))throw Error('Eliminate target must be an enemy ID.');if(s.type==='eliminate'&&!s.target)throw Error('Choose a named enemy for elimination.');if(s.waves!==undefined&&(!['survive','defend'].includes(s.type)||!Number.isInteger(s.waves)||s.waves<1||s.waves>3))throw Error('Choose one to three defend or ambush waves.');return {...s};}catch(error){throw Error(`objective ${index+1}: ${(error as Error).message}`);}});
}
export function stageSteps(m:MissionSettings,w:MissionWorld):StagedStep[]{
 const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z),lanes=w.supplyLanes,rows=w.supplyRows;
 const open=missionObstacles(w,1),points=rows.flatMap(z=>lanes.map(x=>({x,z}))).filter(p=>!blocked(p,1.5,open)&&route(w.start,p,open,.52,w.bounds).length),staged:StagedStep[]=[];
 const routesClear=(next:Point)=>{const rects=missionObstacles(w,1),all=[...staged.map(s=>s.position),next];return all.every((p,i)=>!blocked(p,.52,rects)&&route(i?all[i-1]:w.start,p,rects,.52,w.bounds).length);};
 for(const [index,step]of (m.steps??[]).entries()){
  if((step.type==='chase'||step.type==='convoy')&&!w.getaway)throw Error(`objective ${index+1} (${step.type}): choose pickup extraction in ${w.location}.`);
  const previous=staged.at(-1)?.position??w.start,candidates=['escort','chase','convoy'].includes(step.type)?[w.exit]:points.filter(p=>distance(p,previous)>6&&staged.every(s=>distance(p,s.position)>6));
  candidates.sort((a,b)=>{const score=(p:Point)=>Math.min(distance(p,previous),...staged.map(s=>distance(p,s.position)));return score(b)-score(a)||a.z-b.z||a.x-b.x;});
  if(candidates.length&&step.type!=='escort'){const offset=Math.floor(m.variation/3)%Math.min(3,candidates.length);candidates.push(...candidates.splice(0,offset));}
  let desired:Point|undefined;
  for(const candidate of candidates){if(step.type==='download')w.blocks.push({id:'objective-terminal-'+index,x:candidate.x,z:candidate.z-.95,w:.65,d:.45,h:1,kind:'crate',color:'#4f7075'});
   if(routesClear(candidate)){desired=candidate;break;}if(step.type==='download')w.blocks.pop();}
  if(!desired)throw Error(`objective ${index+1} (${step.type}): no reachable staging area in ${w.location}, layout "${m.layout}", variation ${m.variation}; a terminal or solid blocks the route.`);
  staged.push({step,position:{...desired},radius:step.type==='download'?1.5:step.type==='defend'?8:2.5});
 }
 return staged;
}
export const stepLabel=(s:MissionStep)=>s.label??({reach:'Reach the rally point',download:'Download the intel',defend:'Defend the area',eliminate:`Eliminate ${s.target}`,survive:'Survive the ambush',escort:'Escort your companion',chase:'Catch the courier vehicle',convoy:'Escort the convoy to extraction'}[s.type]);
