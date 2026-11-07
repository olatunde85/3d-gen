import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import sharp from 'sharp';
import {DEFAULT_PARAMS} from '../src/core/params';
import {encodeCharacter} from '../src/app/share';
import {clipById} from '../src/core/anim/clips';
export async function reviewAerial({step,evaluate:e,ready,change}:{step:(n:string,f:()=>Promise<void>)=>Promise<void>;evaluate:<T=unknown>(s:string)=>Promise<T>;ready:()=>Promise<void>;change:(id:string,v:string)=>Promise<unknown>}){
 await step('Aerial skydiving, deployment, glide and upright landing render with fitted props',async()=>{
  mkdirSync('out/aerial',{recursive:true});await ready();
  const rig=process.env.AERIAL_FULL?'full':'game',character=encodeCharacter({...DEFAULT_PARAMS,rig,carry:'parachute',weapon:'none',vehicle:'none',detail:'medium'});
  await e(`(async()=>{const p=structuredClone(studio.project);p.actors=[{id:'hero',character:${JSON.stringify(character)},detail:'medium',vehicle:'auto',x:0,y:0,z:0,yaw:0,beats:[{id:'a',clip:'parachute_glide',duration:3,move:false,flightHeight:0}]}];p.template='cyclorama';p.caption=false;p.texts=[];p.audio.muted=true;p.shots=[{id:'s',duration:12,shot:'wide',target:'all'}];p.view={azimuth:-30,elevation:4,zoom:1};await studio.setProject(p);studio.scene.selectionId=undefined;})()`);await ready();
  for(const clip of ['skydive','parachute_deploy','parachute_glide','parachute_land']){
   const duration=clipById.get(clip)!.duration,images=await e<string[]>(`(()=>{const s=studio.scene,p=structuredClone(studio.project),out=[];s.resize(900,700);p.actors[0].beats=[{id:'a',clip:${JSON.stringify(clip)},duration:${duration},move:false,flightHeight:0}];for(const t of [0,.2,.4,.6,.8,1]){s.render(p,${duration}*t);out.push(s.output.toDataURL());}return out;})()`);
   const tiles=await Promise.all(images.map(async(data,i)=>({input:await sharp(Buffer.from(data.split(',')[1],'base64')).resize(450,350).png().toBuffer(),left:i%3*450,top:Math.floor(i/3)*350})));await sharp({create:{width:1350,height:700,channels:3,background:'#edeadd'}}).composite(tiles).png().toFile(`out/aerial/${rig}-${clip}.png`);
  }
  await change('timeline-selection','hero:0');assert.ok(await e(`!document.getElementById('helicopter-height-row').hidden&&document.getElementById('vehicle-link-settings').hidden`));await change('helicopter-height','7');assert.equal(await e('studio.project.actors[0].beats[0].flightHeight'),7);
  await e(`(async()=>{const p=structuredClone(studio.project);p.actors[0].beats=[{id:'s',clip:'skydive',duration:3,move:false},{id:'d',clip:'parachute_deploy',duration:2.4,move:false},{id:'g',clip:'parachute_glide',duration:3,move:true},{id:'l',clip:'parachute_land',duration:3,move:false},{id:'i',clip:'idle',duration:1,move:false}];await studio.setProject(p);})()`);await ready();
  const stable=await e<boolean>(`(()=>{const s=studio.scene,p=studio.project,at=()=>JSON.stringify(s.actor.mesh.skeleton.bones.map(b=>[...b.position.toArray(),...b.quaternion.toArray(),...b.scale.toArray()]));s.render(p,7);const a=at();s.render(p,2);s.render(p,7);return a===at();})()`);assert.ok(stable,'aerial seek changes state');
  writeFileSync('out/aerial/descent.ara-studio.json',await e<string>('JSON.stringify(studio.project,null,2)'));
  if(process.env.AERIAL_FILM){const data=await e<string>(`(async()=>{const blob=await studio.exportMovie(studio.scene,studio.project,{width:640,height:360,signal:new AbortController().signal,progress:()=>{}});return await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(blob)});})()`);writeFileSync('out/aerial/descent.mp4',Buffer.from(data.split(',')[1],'base64'));}
 });
}
