/** Rendered entry/exit review and parked-prop seeking. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import sharp from 'sharp';
import {CLIPS} from '../src/core/anim/clips';
import {DEFAULT_PARAMS,PRESETS} from '../src/core/params';
import {vehicleStyleForChoice,DEFAULT_VEHICLE_STYLE} from '../src/core/props/vehicles';
import {encodeCharacter} from '../src/app/share';
export async function reviewBoarding({enabled,step,evaluate:e,ready,send}: {enabled:boolean;step:(name:string,fn:()=>Promise<void>)=>Promise<void>;evaluate:<T=unknown>(js:string)=>Promise<T>;ready:()=>Promise<void>;send:(method:string,params?:object)=>Promise<unknown>}){
 if(!enabled)return;mkdirSync('out/boarding',{recursive:true});
 await step('Boarding renders every vehicle and role',async()=>{
  await ready();
  const full=process.env.BOARDING_BODY==='full',preset=process.env.BOARDING_PRESET,character=encodeCharacter({...DEFAULT_PARAMS,...(preset?PRESETS[preset]:{hair:'none',outfit:'none'}),rig:full?'full':'game',restPose:full?'T':'A',gender:full?0:.5,height:full?.2:.5,weight:full?.35:.5,detail:'medium',carry:'none',weapon:'none',vehicle:'auto'});
  await e(`(async()=>{const p=structuredClone(studio.project);p.actors=[{...p.actors[0],character:${JSON.stringify(character)},detail:'medium',vehicle:'auto',x:0,y:0,z:0,yaw:0,beats:[{id:'test',clip:'idle',duration:3,move:false}]}];p.template='cyclorama';p.caption=false;p.texts=[];p.audio.muted=true;p.shots=[{id:'s',duration:12,shot:'wide',target:'all'}];p.camera='locked';p.view={azimuth:40,elevation:8,zoom:1.20};await studio.setProject(p);studio.scene.selectionId=undefined;})()`);await ready();
  const selection=process.env.BOARDING_CLIPS?.split(',');
  for(const clip of CLIPS.filter(c=>c.vehicleTransition&&(selection?selection.includes(c.id):c.vehicleTransition.direction==='board'))){
   const frames=await e<string[]>(`(()=>{const s=studio.scene,p=structuredClone(studio.project);s.resize(720,540);p.actors[0].beats=[{id:'b',clip:${JSON.stringify(clip.id)},duration:${clip.duration},move:false}];const frames=[];for(const angle of [55,115]){p.view.azimuth=angle;for(const q of [0,.2,.38,.53,.7,.86,1]){s.render(p,${clip.duration}*q);frames.push(s.output.toDataURL());}}return frames;})()`);
   const tiles=await Promise.all(frames.map(async(data,i)=>({input:await sharp(Buffer.from(data.split(',')[1],'base64')).resize(360,270).png().toBuffer(),left:i%7*360,top:Math.floor(i/7)*290})));
   await sharp({create:{width:2520,height:580,channels:3,background:'#192027'}}).composite(tiles).png().toFile(`out/boarding/${full?'full':'game'}-${clip.id}.png`);
   if(process.env.BOARDING_FOOT_CLOSEUP){
    const closeups=await e<string[]>(`(()=>{const s=studio.scene,p=structuredClone(studio.project);s.resize(640,480);p.actors[0].beats=[{id:'foot',clip:${JSON.stringify(clip.id)},duration:${clip.duration},move:false}];const out=[];s.freezeCamera=true;try{for(const q of [.12,.25,.35,.43,.50,.57,.65,.78]){s.render(p,q*${clip.duration});const a=s.actor,b=a.mesh.skeleton.bones.find(b=>b.name==='RightFoot'||b.name==='foot.R'),at=b.getWorldPosition(s.camera.position.clone());s.camera.position.set(at.x-.50*a.scale,at.y+.25*a.scale,at.z-.70*a.scale);s.camera.lookAt(at.x,at.y+.06*a.scale,at.z);s.render(p,q*${clip.duration});out.push(s.output.toDataURL());}}finally{s.freezeCamera=false;}return out;})()`);
    const crops=await Promise.all(closeups.map(async(data,i)=>({input:await sharp(Buffer.from(data.split(',')[1],'base64')).resize(400,300).png().toBuffer(),left:i%4*400,top:Math.floor(i/4)*300})));
    await sharp({create:{width:1600,height:600,channels:3,background:'#192027'}}).composite(crops).png().toFile(`out/boarding/${full?'full':'game'}-${clip.id}-ankle.png`);
   }
   if(process.env.BOARDING_FRAMES){const dir=`out/boarding/frames-${clip.id}`;mkdirSync(dir,{recursive:true});const images=await e<string[]>(`(()=>{const s=studio.scene,p=structuredClone(studio.project);s.resize(640,480);p.view.azimuth=65;p.actors[0].beats=[{id:'b',clip:${JSON.stringify(clip.id)},duration:${clip.duration},move:false}];const out=[];for(let i=0;i<=${Math.ceil(clip.duration*15)};i++){s.render(p,i/15);out.push(s.output.toDataURL());}return out;})()`);images.forEach((data,i)=>writeFileSync(`${dir}/${String(i).padStart(3,'0')}.png`,Buffer.from(data.split(',')[1],'base64')));}
   console.log('Rendered',clip.id);
  }
 });
 await step('Boarding UI uses complete action timing and disables vehicle travel during entry',async()=>{
  await e(`(()=>{const action=document.getElementById('action');action.value='board_suv';action.dispatchEvent(new Event('change',{bubbles:true}));})()`);await ready();
  assert.equal(await e('studio.project.actors[0].beats[0].duration'),CLIPS.find(c=>c.id==='board_suv')!.duration);assert.ok(await e(`document.getElementById('movement').disabled&&!document.getElementById('vehicle-action-settings').hidden&&document.getElementById('action-note').textContent.includes('movement off')`));
 });
 await step('Boarding keeps parked vehicles stationary after alighting and when seeking backwards',async()=>{
  await e(`(async()=>{const p=structuredClone(studio.project);p.actors[0].yaw=35;p.actors[0].beats=[{id:'i',clip:'idle',duration:1,move:false},{id:'b',clip:'board_suv',duration:4.2,move:false},{id:'d',clip:'drive_suv',duration:4,move:true,travelSpeed:.6},{id:'a',clip:'alight_suv',duration:4.2,move:false},{id:'w',clip:'walk',duration:2,move:true}];p.shots=[{id:'s',duration:12,shot:'wide',target:'all'}];await studio.setProject(p)})()`);await ready();
  const result=await e<{drift:number;seek:boolean;gap:number;calls:number}>(`(()=>{const s=studio.scene,p=studio.project,point=()=>{const prop=s.actor.group.children.find(o=>o.userData.component);return prop.getWorldPosition(s.actor.group.position.clone()).toArray()};s.render(p,13.5);const first=point();s.render(p,15.3);const second=point();s.render(p,2);s.render(p,13.5);const repeat=point();const pose=(t)=>{s.render(p,t);return s.actor.mesh.skeleton.bones.map(b=>b.getWorldPosition(s.actor.group.position.clone()).toArray());};const a=pose(5.19999),b=pose(5.20001);return{drift:Math.hypot(...first.map((x,i)=>x-second[i])),seek:JSON.stringify(first)===JSON.stringify(repeat),gap:Math.max(...a.map((v,j)=>Math.hypot(...v.map((x,d)=>x-b[j][d])))),calls:s.renderer.info.render.calls}})()`);
  console.log(result);assert.ok(result.drift<1e-6,'parked SUV moves with walking actor');assert.ok(result.seek,'parked state depends on playback order');assert.ok(result.gap<.001,'board/drive boundary pops');assert.ok(result.calls<180);
  const joins=await e<number[]>(`(()=>{const s=studio.scene,p=studio.project,a=s.actor;return [1,9.2,13.4].map(t=>{s.render(p,t-.00001);const first=a.mesh.skeleton.bones.map(b=>b.getWorldPosition(a.group.position.clone()).toArray());s.render(p,t+.00001);const last=a.mesh.skeleton.bones.map(b=>b.getWorldPosition(a.group.position.clone()).toArray());return Math.max(...first.map((v,i)=>Math.hypot(...v.map((x,d)=>x-last[i][d]))));});})()`);
  assert.ok(joins.every(gap=>gap<.002),'idle/board, ride/alight or alight/walk pop');
  assert.ok(await e(`(()=>{const s=studio.scene,p=studio.project,ids=[];for(const t of [2,7,11,14]){s.render(p,t);ids.push(s.actor.group.children.find(o=>o.userData.component).uuid);}return new Set(ids).size===1})()`),'rebuilds an identical vehicle at each action boundary');
  const before=await e<string>('JSON.stringify(studio.project)');await new Promise(r=>setTimeout(r,400));await send('Page.reload');await new Promise(r=>setTimeout(r,600));await ready();assert.equal(await e('JSON.stringify(studio.project)'),before);
  const state=await e<boolean>(`(()=>{studio.scene.render(studio.project,14);return studio.scene.actor.group.children.some(o=>o.userData.component&&o.name==='suv')})()`);assert.ok(state,'parked car lost after reload');
 });
 await step('Boarding supports five simultaneous entries within the renderer budget',async()=>{
  await e(`(async()=>{const p=structuredClone(studio.project),base=p.actors[0];p.actors=['board_suv','board_bicycle','board_horse','board_canoe','board_motorcycle'].map((clip,i)=>({...base,id:'boarding-'+i,x:(i-2)*3,y:0,z:0,yaw:0,beats:[{id:'b'+i,clip,duration:5,move:false}]}));await studio.setProject(p)})()`);await ready();
  const actual=await e<{calls:number;count:number}>(`(()=>{const s=studio.scene;s.render(studio.project,1.8);return{calls:s.renderer.info.render.calls,count:s.actors.size}})()`);
  assert.equal(actual.count,5);assert.ok(actual.calls<500);console.log('Five boarding actors',actual);
 });
 if(process.env.BOARDING_FILM)await step('Boarding exports a complete entry, drive, exit and walk film',async()=>{
  const character=encodeCharacter({...DEFAULT_PARAMS,...PRESETS['The Corporate High-Flier'],detail:'medium',rig:'game',vehicle:'auto',vehicleStyle:vehicleStyleForChoice('suv',DEFAULT_VEHICLE_STYLE),carry:'none',weapon:'none'});
  await e(`(async()=>{const p=structuredClone(studio.project);p.actors=[{...p.actors[0],id:'driver',character:${JSON.stringify(character)},x:0,z:0,yaw:0,beats:[{id:'b',clip:'board_suv',duration:4.2,move:false},{id:'d',clip:'drive_suv',duration:4,move:true,travelSpeed:.45},{id:'a',clip:'alight_suv',duration:4.2,move:false},{id:'w',clip:'walk',duration:1.2,move:true}]}];p.shots=[{id:'s',duration:12,shot:'wide',target:'all'}];p.view={azimuth:65,elevation:6,zoom:1.2};await studio.setProject(p);})()`);await ready();
  const output=await e<{data:string;duration:number;width:number;height:number}>(`(async()=>{const blob=await studio.exportMovie(studio.scene,studio.project,{width:1280,height:720,signal:new AbortController().signal,progress:()=>{}}),video=document.createElement('video'),url=URL.createObjectURL(blob);video.src=url;await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=reject;});const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));const result={duration:video.duration,width:video.videoWidth,height:video.videoHeight,data:btoa(binary)};URL.revokeObjectURL(url);return result;})()`);
  writeFileSync('out/boarding/boarding-drive-alight.ara-studio.json',await e<string>('JSON.stringify(studio.project,null,2)'));assert.ok(Math.abs(output.duration-13.6)<.04);assert.equal(output.width,1280);assert.equal(output.height,720);writeFileSync('out/boarding/boarding-drive-alight.mp4',Buffer.from(output.data,'base64'));
 });
}
