/**
 * Routes, facing, off-stage time and changing expressions in the real editor, using the film guide's worked example:
 * the daughter texts and walks out, the mother waits off stage, walks in, looks around and phones for help.
 */
import assert from 'node:assert/strict';
import { QUICKSTART_EXAMPLE } from '../packages/cli/src/film-quickstart';
import { parseStudioInput } from '../src/studio/assist';
import { decodeCharacter } from '../src/app/share';
interface Harness {
 enabled:boolean;step(name:string,fn:()=>Promise<void>):Promise<void>;evaluate<T=unknown>(source:string):Promise<T>;
 waitFor(source:string,what:string,ms?:number):Promise<void>;ready():Promise<void>;pause(ms?:number):Promise<unknown>;shot(name:string):Promise<void>;
}
interface Seen { visible:boolean; hidden:boolean; yaw:number; x:number; z:number; face:number }
export async function checkStudioRoutes(h:Harness){
 if(!h.enabled)return;const {step,evaluate:e,waitFor:w,ready,pause,shot}=h;
 const project=parseStudioInput(JSON.stringify(QUICKSTART_EXAMPLE));
 /** Each character at `t`: drawn or not, its facing (degrees), position and how far its face is from neutral. */
 const at=async(t:number)=>{await e(`studio.seek(${t})`);await pause(250);
  return e<Record<string,Seen>>(`Object.fromEntries([...studio.scene.actors].map(([id,a])=>[id,{visible:a.group.visible,hidden:a.hidden,yaw:a.group.rotation.y*180/Math.PI,x:a.group.position.x,z:a.group.position.z,face:(a.mesh.morphTargetInfluences??[]).reduce((s,v)=>s+v,0)}]))`);};
 const near=(a:number,b:number,tol=3)=>Math.abs(((a-b)%360+540)%360-180)<tol;
 await step('Routes: start points, walk-to points, facing, off-stage time and expressions play in Studio',async()=>{
  // Both of them text or phone, so both carry a phone without being told to.
  assert.deepEqual(project.actors.map(a=>decodeCharacter(a.character,a.detail)!.carry),['phone','phone']);
  await ready();
  await e(`studio.setProject(${JSON.stringify(project)})`);
  await w('studio.ready&&!document.getElementById("loading").offsetParent&&studio.scene.actors.size===2','the example cast',180000);
  const start=await at(1);
  assert.ok(start.maya.visible&&!start.mum.visible,'only the daughter is on stage at the start');
  assert.ok(Math.hypot(start.maya.x+1,start.maya.z-.5)<.05,`the daughter starts at her start point (${start.maya.x.toFixed(2)}, ${start.maya.z.toFixed(2)})`);
  assert.ok(near(start.maya.yaw,0),'she faces the front while texting');
  await shot('routes-1-texting');
  const leaving=await at(5.5);
  assert.ok(near(leaving.maya.yaw,12.1),`she turns to the open front to leave (${leaving.maya.yaw.toFixed(1)}°)`);
  assert.notEqual(Math.round(leaving.maya.face*100),Math.round(start.maya.face*100),'her expression changes from happy to afraid');
  await shot('routes-2-leaving');
  const entering=await at(8.2);
  assert.ok(!entering.maya.visible&&entering.mum.visible,'the daughter is gone and the mother has come in');
  assert.ok(near(entering.mum.yaw,180,1),'the mother walks in facing the back of the room');
  await shot('routes-3-entering');
  const searching=await at(11);
  assert.ok(Math.hypot(searching.mum.x,searching.mum.z-1.5)<.05,`she stops at her walk-to point (${searching.mum.x.toFixed(2)}, ${searching.mum.z.toFixed(2)})`);
  await shot('routes-4-searching');
  const calling=await at(14.5);
  assert.ok(near(calling.mum.yaw,0),'she turns to the front for the phone call');
  assert.notEqual(Math.round(calling.mum.face*100),Math.round(searching.mum.face*100),'her expression changes to crying');
  await shot('routes-5-calling');
  // The action panel shows and edits the same settings.
  const pick=async(value:string)=>e(`(()=>{const s=document.getElementById('timeline-selection');s.value=${JSON.stringify(value)};s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await pick('mum:3');await pause(150);
  assert.deepEqual(await e(`[document.getElementById('beat-face').value,document.getElementById('beat-expression').value,document.getElementById('beat-hidden').checked]`),['0','crying',false]);
  await pick('mum:0');await pause(150);assert.equal(await e(`document.getElementById('beat-hidden').checked`),true);
  await e(`(()=>{const f=document.getElementById('beat-face');f.value='90';f.dispatchEvent(new Event('change',{bubbles:true}));const x=document.getElementById('beat-expression');x.value='sad';x.dispatchEvent(new Event('change',{bubbles:true}));const h=document.getElementById('beat-hidden');h.checked=false;h.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await pause(300);
  assert.deepEqual(await e(`(({face,expression,hidden})=>[face,expression,!!hidden])(studio.project.actors[1].beats[0])`),[90,'sad',false]);
 });
}
