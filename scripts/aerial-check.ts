import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {nodeLibrary} from './node-assets';
import {buildHuman} from '../src/core/human';
import {DEFAULT_PARAMS} from '../src/core/params';
import {Animator} from '../src/core/anim/evaluate';
import {CLIPS,clipById} from '../src/core/anim/clips';
import {boneFor} from '../src/core/rig/poses';
import {aerialHeight} from '../src/studio/aerial-motion';
import {newProject,beat,parseProject} from '../src/studio/project';
import {VehicleStage} from '../src/studio/vehicle-stage';
import {encodeCharacter} from '../src/app/share';
import {parseStudioInput,generateAssistGuide} from '../src/studio/assist';
const lib=await nodeLibrary();let checks=0;
for(const rig of ['game','game_lite','full']as const)for(const restPose of ['A','T']as const)for(const body of [{},{gender:0,height:.15,weight:.3},{height:.9,weight:.85}]){
 const params={...DEFAULT_PARAMS,...body,rig,restPose,carry:'parachute' as const,weapon:'none' as const,detail:'low' as const,outfit:'none',hair:'none',faceShapes:false},ch=await buildHuman(lib,params),bare=await buildHuman(lib,{...params,carry:'none'}),A=new Animator(ch.rig!),B=ch.rig!.bones,ref=new Animator(bare.rig!),canopy=B.findIndex(b=>b.name==='ParachuteCanopy');
 for(let i=0;i<ch.mesh.normals.length;i+=3)assert.ok(Math.abs(Math.hypot(...ch.mesh.normals.subarray(i,i+3))-1)<.001,'invalid prop normals');
 const expectedScale=Math.max(...bare.rig!.bones.flatMap(b=>[b.head[1],b.tail[1]]));assert.equal(Math.max(...B.flatMap(b=>[b.head[1],b.tail[1]])),expectedScale,'prop changes anatomical scale');
 for(const clip of CLIPS.filter(c=>c.category==='Aerial')){
  for(let i=0;i<=60;i++){
   const t=clip.duration*i/60,f=A.frame(clip,t),p=A.positions(f);assert.ok(f.rot.every(q=>q.every(Number.isFinite)&&Math.abs(Math.hypot(...q)-1)<1e-5));
   for(const [j,b]of B.entries())if(b.parent>=0){const dist=(a:number[],b:number[])=>Math.hypot(...a.map((v,d)=>v-b[d]));assert.ok(Math.abs(dist(p[j],p[b.parent])-dist(b.head,B[b.parent].head))<1e-6,'limb changed length');assert.ok(!f.scale?.has(j),'body bone scaled');}
   assert.ok(f.scale?.has(canopy));assert.ok([...f.scale!.values()].flat().every(v=>Number.isFinite(v)&&v>=0));
  }
  const plain=ref.positions(ref.frame(clip,clip.duration*.37)),equipped=A.positions(A.frame(clip,clip.duration*.37));for(let i=0;i<bare.rig!.bones.length;i++)assert.ok(Math.hypot(...plain[i].map((v,d)=>v-equipped[i][d]))<1e-6,'prop changes body pose');checks++;
 }
 assert.deepEqual(A.frame(clipById.get('idle')!,0).scale?.get(canopy),[0,0,0]);assert.ok(A.frame(clipById.get('parachute_glide')!,1).scale!.get(canopy)![0]>400);
 const land=A.positions(A.frame(clipById.get('parachute_land')!,3)),idle=A.positions(A.frame(clipById.get('idle')!,0));for(const name of ['Hips','Head','LeftFoot','RightFoot']){const i=B.findIndex(b=>b.name===boneFor(rig,name));assert.ok(Math.hypot(...land[i].map((v,d)=>v-idle[i][d]))<1e-6,'landing does not recover upright');}
 assert.deepEqual(A.frame(clipById.get('parachute_land')!,3).scale?.get(canopy),[0,0,0]);
}
// Clothes can mask torso faces; fitting must use the complete morphed body, not visible skin only.
const dressed=await buildHuman(lib,{...DEFAULT_PARAMS,carry:'parachute',detail:'low'}),pack=dressed.mesh.groups.find(g=>dressed.mesh.materials[g.material].name==='Parachute pack')!;assert.ok(pack);const z=[...pack.indices].map(i=>dressed.mesh.positions[i*3+2]),y=[...pack.indices].map(i=>dressed.mesh.positions[i*3+1]);assert.ok(Math.min(...z)<-.15,'pack must sit behind clothing');assert.ok(Math.min(...y)>dressed.height*.45,'pack falls below the waist');
const p=newProject('beach');p.actors[0].character=encodeCharacter({...DEFAULT_PARAMS,carry:'parachute',weapon:'none'});p.actors[0].beats=[beat('skydive',3),beat('parachute_deploy',2.4),beat('parachute_glide',3,true),beat('parachute_land',3),beat('idle',1)];p.shots=[{id:'s',duration:12,shot:'wide',target:'all'}];assert.deepEqual(parseStudioInput(JSON.stringify(p),lib.catalog),parseProject(JSON.stringify(p)));
let t=0;for(let i=0;i<4;i++){const end=t+p.actors[0].beats[i].duration;if(i<3)assert.ok(Math.abs(aerialHeight(p.actors[0],i,end)-aerialHeight(p.actors[0],i+1,end))<1e-6);t=end;}
assert.equal(aerialHeight(p.actors[0],3,9.05),0);assert.equal(new VehicleStage(p,11.4,new Map()).actor(p.actors[0]).y,0);
for(const value of [-1,31,'high']){const q=structuredClone(p);q.actors[0].beats[0].flightHeight=value as number;assert.throws(()=>parseProject(JSON.stringify(q)));}
const guide=generateAssistGuide(lib.catalog);assert.ok(guide.includes('Aerial altitude:'));assert.ok(guide.includes('parachute_land'));assert.ok(guide.length<250_000);
assert.doesNotThrow(()=>parseStudioInput(readFileSync('docs/examples/parachute-descent.ara-studio.json','utf8'),lib.catalog));
console.log(`Aerial: ${checks} body/rig/action combinations; packed scale, unchanged anatomy, canopy channels, upright landing, continuous descent, JSON and LLM guide passed.`);
