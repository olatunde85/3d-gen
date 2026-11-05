/** Real-renderer review of mounted weapons, per-action controls and saved films. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import sharp from 'sharp';
import {DEFAULT_PARAMS,PRESETS} from '../src/core/params';
import {encodeCharacter} from '../src/app/share';
import {VEHICLE_FITS,isPassengerClip} from '../src/core/props/vehicles';
import {clipById} from '../src/core/anim/clips';
export async function reviewArmedRiding({enabled,step,evaluate:e,ready,change,send}:{enabled:boolean;step:(name:string,fn:()=>Promise<void>)=>Promise<void>;evaluate:<T=unknown>(js:string)=>Promise<T>;ready:()=>Promise<void>;change:(id:string,value:string)=>Promise<unknown>;send:(method:string,params?:object)=>Promise<unknown>}){
 if(!enabled)return;mkdirSync('out/armed-riding',{recursive:true});
 const full=process.env.ARMED_BODY==='full';
 const recipe=(weapon:string)=>encodeCharacter({...DEFAULT_PARAMS,...PRESETS['The Corporate High-Flier'],weapon:weapon as 'pistol',rig:full?'full':'game',restPose:full?'T':'A',...(full?{gender:0,height:.2,weight:.35}:{}),carry:'none',vehicle:'auto',detail:'medium'});
 await step('Armed riding renders weapons on every vehicle without moving the controls',async()=>{
  await ready();
  for(const weapon of (process.env.ARMED_WEAPONS??'pistol,rifle,sword,knife').split(',')){
   await e(`(async()=>{const p=structuredClone(studio.project);p.actors=[{...p.actors[0],id:'hero',character:${JSON.stringify(recipe(weapon))},detail:'medium',vehicle:'auto',x:0,y:0,z:0,yaw:0,beats:[{id:'r',clip:'ride_motorcycle',duration:3,move:false,weaponPose:'aim'}]}];p.template='cyclorama';p.caption=false;p.texts=[];p.audio.muted=true;p.shots=[{id:'s',duration:12,shot:'wide',target:'all'}];p.camera='locked';p.view={azimuth:-55,elevation:5,zoom:1.2};await studio.setProject(p);studio.scene.selectionId=undefined;})()`);await ready();
   for(const {clip}of VEHICLE_FITS){
    if(process.env.ARMED_CLIPS&&!process.env.ARMED_CLIPS.split(',').includes(clip))continue;
    const duration=clipById.get(clip)!.duration,side=isPassengerClip(clip)?-1:clip.includes('car')||clip.includes('suv')?1:-1;
    const images=await e<string[]>(`(()=>{const s=studio.scene,p=structuredClone(studio.project),out=[];s.resize(800,600);p.actors[0].beats=[{id:'r',clip:${JSON.stringify(clip)},duration:${duration},move:false,weaponPose:'hold'}];for(const pose of ['hold','aim',${weapon==='pistol'||weapon==='rifle'?"'fire'":"'aim'"}]){p.actors[0].beats[0].weaponPose=pose;s.freezeCamera=false;p.view.azimuth=${side*55};s.render(p,${duration}*.31);out.push(s.output.toDataURL());const a=s.actor,b=a.mesh.skeleton.bones.find(b=>b.name==='Spine2'||b.name==='spine02'),at=b.getWorldPosition(s.camera.position.clone());s.freezeCamera=true;s.camera.position.set(at.x+${side}*1.7*a.scale,at.y+.28*a.scale,at.z+1.45*a.scale);s.camera.lookAt(at.x,at.y+.10*a.scale,at.z+.10*a.scale);s.render(p,${duration}*.31);out.push(s.output.toDataURL());}s.freezeCamera=false;return out;})()`);
    const tiles=await Promise.all(images.map(async(data,i)=>({input:await sharp(Buffer.from(data.split(',')[1],'base64')).resize(480,360).png().toBuffer(),left:i%2*480,top:Math.floor(i/2)*360})));
    await sharp({create:{width:960,height:1080,channels:3,background:'#192027'}}).composite(tiles).png().toFile(`out/armed-riding/${full?'full':'game'}-${weapon}-${clip}.png`);
    console.log('Rendered armed',weapon,clip);
   }
  }
 });
 await step('Armed riding UI changes pose and aim without rebuilding the actor, and restores them after reload',async()=>{
  await e(`(async()=>{const p=structuredClone(studio.project);p.actors=[{...p.actors[0],id:'hero',character:${JSON.stringify(recipe('pistol'))},x:0,y:0,z:0,yaw:0,beats:[{id:'r',clip:'ride_motorcycle',duration:3,move:true}]}];p.shots=[{id:'s',duration:3,shot:'wide',target:'all'}];await studio.setProject(p);window.__armedActor=studio.scene.actor;})()`);await ready();
  await change('timeline-selection','hero:0');
  assert.ok(await e(`!document.getElementById('weapon-action-settings').hidden`));await change('beat-weapon-pose','fire');await change('beat-weapon-yaw','-70');await ready();
  assert.equal(await e('studio.project.actors[0].beats[0].weaponPose'),'fire');assert.equal(await e('studio.project.actors[0].beats[0].weaponYaw'),-70);assert.ok(await e('window.__armedActor===studio.scene.actor'));
  await change('beat-weapon-pose','hidden');assert.ok(await e(`(()=>{studio.scene.render(studio.project,.5);return studio.scene.actor.mesh.skeleton.bones.find(b=>b.name==='WeaponR').scale.x===0})()`));
  await change('beat-weapon-pose','fire');assert.ok(await e(`(()=>{studio.scene.render(studio.project,.5);return studio.scene.actor.mesh.skeleton.bones.find(b=>b.name==='WeaponR').scale.x===1})()`));
  await new Promise(r=>setTimeout(r,400));await send('Page.reload');await new Promise(r=>setTimeout(r,600));await ready();assert.equal(await e('studio.project.actors[0].beats[0].weaponPose'),'fire');assert.equal(await e('studio.project.actors[0].beats[0].weaponYaw'),-70);
  await change('actor-weapon','sword');await ready();assert.equal(await e('studio.project.actors[0].beats[0].weaponPose'),'hold');assert.ok(await e(`document.querySelector('#beat-weapon-pose option[value=fire]').disabled`));
 });
 await step('Armed riding keeps five actors independent, including a hidden weapon',async()=>{
  const recipes=['pistol','rifle','sword','knife','pistol'].map(recipe);
  await e(`(async()=>{const p=structuredClone(studio.project),base=p.actors[0],codes=${JSON.stringify(recipes)};p.actors=['ride_motorcycle','ride_horse','drive_suv','paddle_kayak','drive_boat'].map((clip,i)=>({...base,id:'armed-'+i,character:codes[i],x:(i-2)*3,y:0,z:0,yaw:0,beats:[{id:'r'+i,clip,duration:3,move:false,weaponPose:['fire','hidden','aim','hold','aim'][i]}]}));p.shots=[{id:'s',duration:3,shot:'wide',target:'all'}];await studio.setProject(p);})()`);await ready();
  const result=await e<{scales:number[];weapons:unknown[];calls:number}>(`(()=>{const s=studio.scene,p=studio.project;s.render(p,.6);return{scales:p.actors.map(a=>s.actors.get(a.id).mesh.skeleton.bones.find(b=>b.name==='WeaponR').scale.x),weapons:p.actors.map(a=>s.actors.get(a.id).frame(p,.6,a).ridingWeapon??null),calls:s.renderer.info.render.calls}})()`);
  assert.deepEqual(result.scales,[1,0,1,1,1]);assert.deepEqual(result.weapons,['pistol',null,'sword','knife','pistol']);assert.ok(result.calls<650);console.log('Five armed actors',result);
 });
 if(process.env.ARMED_FILM)await step('Armed riding exports boarding, armed travel and alighting to MP4',async()=>{
  await e(`(async()=>{const p=structuredClone(studio.project);p.actors=[{...p.actors[0],id:'hero',x:0,y:0,z:0,character:${JSON.stringify(recipe('pistol'))},beats:[{id:'b',clip:'board_motorcycle',duration:3.4,move:false},{id:'r',clip:'ride_motorcycle',duration:3,move:true,travelSpeed:.5,weaponPose:'fire',weaponYaw:-60},{id:'e',clip:'alight_motorcycle',duration:3.4,move:false}]}];p.shots=[{id:'s',duration:9.8,shot:'wide',target:'all'}];p.view={azimuth:-55,elevation:5,zoom:1.15};await studio.setProject(p);})()`);await ready();
  const output=await e<{data:string;duration:number}>(`(async()=>{const blob=await studio.exportMovie(studio.scene,studio.project,{width:1280,height:720,signal:new AbortController().signal,progress:()=>{}}),video=document.createElement('video'),url=URL.createObjectURL(blob);video.src=url;await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=reject;});const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));const out={data:btoa(binary),duration:video.duration};URL.revokeObjectURL(url);return out;})()`);
  assert.ok(Math.abs(output.duration-9.8)<.04);writeFileSync('out/armed-riding/armed-motorcycle.mp4',Buffer.from(output.data,'base64'));writeFileSync('out/armed-riding/armed-motorcycle.ara-studio.json',await e<string>('JSON.stringify(studio.project,null,2)'));
 });
}
