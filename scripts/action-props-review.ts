import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {DEFAULT_PARAMS} from '../src/core/params';
import {encodeCharacter} from '../src/app/share';
export async function reviewActionProps({step,evaluate:e,ready,change}:{step:(n:string,f:()=>Promise<void>)=>Promise<void>;evaluate:<T=unknown>(s:string)=>Promise<T>;ready:()=>Promise<void>;change:(id:string,v:string)=>Promise<unknown>}){
 await step('Armed riding pitch and grenade release render correctly in Studio',async()=>{
  mkdirSync('out/action-props',{recursive:true});
  for(const weapon of ['pistol','rifle','grenade']as const){
   const character=encodeCharacter({...DEFAULT_PARAMS,weapon,vehicle:'auto',carry:'none',detail:'medium'});
   const clip=weapon==='grenade'?'throw_grenade':weapon==='pistol'?'pistol_aim_one_hand':'rifle_aim';
   await e(`(async()=>{const p=structuredClone(studio.project);p.actors=[{id:'hero',character:${JSON.stringify(character)},detail:'medium',vehicle:'auto',x:0,y:0,z:0,yaw:0,beats:[{id:'a',clip:${JSON.stringify(clip)},duration:${weapon==='grenade'?2.2:3},move:false}]}];p.template='cyclorama';p.caption=false;p.texts=[];p.audio.muted=true;p.shots=[{id:'s',duration:3,shot:'wide',target:'all'}];p.view={azimuth:-35,elevation:5,zoom:1.15};await studio.setProject(p);studio.scene.selectionId=undefined;})()`);await ready();
   for(const [i,t]of (weapon==='grenade'?[0,.65,.82,1.2,2.2]:[.3,.3,.3]).entries()){
    if(weapon!=='grenade'){await change('timeline-selection','hero:0');await change('beat-weapon-pitch',String([-35,0,45][i]));assert.equal(await e('studio.project.actors[0].beats[0].weaponPitch'),[-35,0,45][i]);}
    const data=await e<string>(`(()=>{const s=studio.scene;s.resize(900,650);s.render(studio.project,${t});return s.output.toDataURL();})()`);writeFileSync(`out/action-props/${weapon}-${i}.png`,Buffer.from(data.split(',')[1],'base64'));
   }
  }
  await e(`(async()=>{const p=structuredClone(studio.project);p.actors[0].beats=[{id:'t',clip:'throw_grenade',duration:2.2,move:false},{id:'w',clip:'walk',duration:2,move:true}];p.shots=[{id:'s',duration:4.2,shot:'wide',target:'all'}];await studio.setProject(p);})()`);await ready();
  const drift=await e<number>(`(()=>{const s=studio.scene,p=studio.project;const position=()=>s.actor.mesh.skeleton.bones.find(b=>b.name==='Grenade').getWorldPosition(s.camera.position.clone());s.render(p,2.2);const a=position();s.render(p,4.1);return a.distanceTo(position());})()`);assert.ok(drift<1e-5,'released grenade follows the walking actor');
 });
}
