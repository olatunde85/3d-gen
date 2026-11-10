/** Declarative, bounded mission steps: all positions come from validated map lanes. */
import {blocked,route,type Point} from './world';
import type {MissionSettings,MissionWorld} from './mission';
import {missionObstacles} from './mission';
export const STEP_TYPES=['reach','download','defend','eliminate','survive','escort']as const;
export type StepType=typeof STEP_TYPES[number];
export interface MissionStep {type:StepType;label?:string;duration?:number;target?:string;waves?:number}
export interface StagedStep {step:MissionStep;position:Point;radius:number}
export const needsCompanion=(m:MissionSettings)=>m.steps?.length?m.steps.some(s=>s.type==='escort'):m.story==='rescue';
export function parseSteps(raw:unknown):MissionStep[]{
 if(!Array.isArray(raw)||raw.length<1||raw.length>8)throw Error('Choose one to eight objective steps.');return raw.map(s=>{if(!s||typeof s!=='object'||Array.isArray(s)||Object.keys(s).some(k=>!['type','label','duration','target','waves'].includes(k))||!STEP_TYPES.includes(s.type))throw Error('Use a supported objective step.');if(s.label!==undefined&&(typeof s.label!=='string'||!s.label.trim()||s.label.length>80))throw Error('Use an objective label up to 80 characters.');if(s.duration!==undefined&&(!['download','defend'].includes(s.type)||!Number.isFinite(s.duration)||s.duration<3||s.duration>180))throw Error('Download/defend durations must be 3–180 seconds.');if(s.target!==undefined&&(s.type!=='eliminate'||typeof s.target!=='string'||!/^[\w-]{1,50}$/.test(s.target)))throw Error('Eliminate target must be an enemy ID.');if(s.type==='eliminate'&&!s.target)throw Error('Choose a named enemy for elimination.');if(s.waves!==undefined&&(s.type!=='survive'||!Number.isInteger(s.waves)||s.waves<1||s.waves>3))throw Error('Choose one to three ambush waves.');return {...s};});
}
export function stageSteps(m:MissionSettings,w:MissionWorld):StagedStep[]{
 const rects=missionObstacles(w,1),lanes=w.supplyLanes,rows=w.supplyRows,points=rows.flatMap(z=>lanes.map(x=>({x,z}))).filter(p=>!blocked(p,1.5,rects)&&route(w.start,p,rects,.52,w.bounds).length),staged:StagedStep[]=[];let previous=w.start;
 for(const step of m.steps??[]){const candidates=points.filter(p=>Math.hypot(p.x-previous.x,p.z-previous.z)>6).sort((a,b)=>Math.hypot(a.x-previous.x,a.z-previous.z)-Math.hypot(b.x-previous.x,b.z-previous.z));const desired=step.type==='escort'?w.exit:candidates[(staged.length+Math.floor(m.variation/3))%Math.max(1,Math.min(5,candidates.length))];if(!desired||!route(previous,desired,rects,.52,w.bounds).length)throw Error('Objective chain needs a reachable staging area.');if(step.type==='download'){w.blocks.push({id:'objective-terminal-'+staged.length,x:desired.x,z:desired.z-.95,w:.65,d:.45,h:1,kind:'crate',color:'#4f7075'});}
 staged.push({step,position:{...desired},radius:step.type==='download'?1.5:step.type==='defend'?4:2.5});previous=desired;}
 for(const [i,s]of staged.entries())if(blocked(s.position,.52,missionObstacles(w,1))||!route(i?staged[i-1].position:w.start,s.position,missionObstacles(w,1),.52,w.bounds).length)throw Error('A terminal blocks this objective route.');
 return staged;
}
export const stepLabel=(s:MissionStep)=>s.label??({reach:'Reach the rally point',download:'Download the intel',defend:'Defend the area',eliminate:`Eliminate ${s.target}`,survive:'Survive the ambush',escort:'Escort your companion'}[s.type]);
