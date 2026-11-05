/** Fitted props in the real Studio renderer, UI edits, persistence and resource disposal. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import sharp from 'sharp';
import {DEFAULT_PARAMS} from '../src/core/params';
import {encodeCharacter} from '../src/app/share';
import {VEHICLE_FOR_CLIP,VEHICLE_FITS,vehicleStyleForChoice,DEFAULT_VEHICLE_STYLE} from '../src/core/props/vehicles';
import {clipById} from '../src/core/anim/clips';
interface Harness{enabled:boolean;step(name:string,fn:()=>Promise<void>):Promise<void>;evaluate<T=unknown>(js:string):Promise<T>;ready():Promise<void>;change(id:string,value:string):Promise<unknown>;send(method:string,params?:object):Promise<unknown>}
export async function reviewVehicles(h:Harness){
 if(!h.enabled)return;const {step,evaluate:e,ready,change,send}=h;mkdirSync('out/vehicles',{recursive:true});
 await step('Vehicles render with deterministic contacts on every rig',async()=>{
  await ready();
  for(const [label,body]of [['game',{}],['full-t',{rig:'full',restPose:'T',gender:0,height:.2,weight:.35}],['broad',{height:.85,weight:.8,muscle:.9}]]as const){
   if(process.env.VEHICLE_REVIEW_BODY&&process.env.VEHICLE_REVIEW_BODY!==label)continue;
   const character=encodeCharacter({...DEFAULT_PARAMS,...body,rig:body.rig??'game',restPose:body.restPose??'A',detail:'medium',hair:'none',outfit:'none',carry:'none',weapon:'none',vehicle:'auto',vehicleStyle:process.env.VEHICLE_REVIEW_FACTORY==='modern'?vehicleStyleForChoice('sports_car',DEFAULT_VEHICLE_STYLE):DEFAULT_VEHICLE_STYLE});
   await e(`(async()=>{const p=structuredClone(studio.project);p.actors=[{...p.actors[0],character:${JSON.stringify(character)},detail:'medium',vehicle:'auto',x:0,y:0,z:0,yaw:0,beats:[{id:'test',clip:'idle',duration:3,move:false}]}];p.template='portrait';p.caption=false;p.texts=[];p.audio.muted=true;p.shots=[{id:'shot',duration:12,shot:'wide',target:'all'}];p.camera='locked';p.view={azimuth:0,elevation:0,zoom:1.1};await studio.setProject(p);studio.scene.selectionId=undefined;})()`);await ready();
   let factory='';
   for(const {clip,id}of VEHICLE_FITS){
    if(process.env.VEHICLE_REVIEW_VEHICLES&&!process.env.VEHICLE_REVIEW_VEHICLES.split(',').includes(id))continue;
    if(process.env.VEHICLE_REVIEW_CLIPS&&!process.env.VEHICLE_REVIEW_CLIPS.split(',').includes(clip))continue;
    if(process.env.VEHICLE_REVIEW_FACTORY==='modern'){
     const style=vehicleStyleForChoice(id,DEFAULT_VEHICLE_STYLE),key=JSON.stringify(style);
     if(key!==factory){
      const recipe=encodeCharacter({...DEFAULT_PARAMS,...body,rig:body.rig??'game',restPose:body.restPose??'A',detail:'medium',hair:'none',outfit:'none',carry:'none',weapon:'none',vehicle:id,vehicleStyle:style});
      await e(`(async()=>{const p=structuredClone(studio.project);p.actors[0].character=${JSON.stringify(recipe)};await studio.setProject(p);})()`);await ready();factory=key;
     }
    }
    const duration=clipById.get(clip)!.duration;
    const images=await e<string[]>(`(()=>{const s=studio.scene,p=structuredClone(studio.project);s.resize(700,500);s.selectionId=undefined;p.actors[0].vehicle=${JSON.stringify(id)};p.actors[0].beats=[{id:'test',clip:${JSON.stringify(clip)},duration:${duration},move:false}];const out=[];for(const angle of [0,65,90]){p.view.azimuth=angle;for(let i=0;i<4;i++){s.render(p,${duration}*i/4);out.push(s.output.toDataURL('image/png'));}}return out;})()`);
    const tiles=await Promise.all(images.map(async(url,i)=>({input:await sharp(Buffer.from(url.split(',')[1],'base64')).resize(350,250).png().toBuffer(),left:i%4*350,top:Math.floor(i/4)*276})));
    const labels=Buffer.from(`<svg width="1400" height="828"><style>text{fill:#ddd;font:15px sans-serif}</style><text x="8" y="270">${clip} · ${label} · FRONT</text><text x="8" y="546">THREE QUARTER</text><text x="8" y="822">SIDE · 0, ¼, ½, ¾ cycle</text></svg>`);
    await sharp({create:{width:1400,height:828,channels:3,background:'#181c23'}}).composite([...tiles,{input:labels,left:0,top:0}]).png().toFile(`out/vehicles/${label}-${id}-${clip}.png`);
    // Seeking backwards must not change animated prop transforms.
    const result=await e<boolean>(`(()=>{const s=studio.scene,p=structuredClone(studio.project);p.actors[0].vehicle=${JSON.stringify(id)};p.actors[0].beats=[{id:'test',clip:${JSON.stringify(clip)},duration:${duration},move:false}];const snapshot=()=>{const a=[];s.actor.group.traverse(o=>{if(o.userData.component)a.push(...o.matrixWorld.elements)});return JSON.stringify(a)};s.render(p,${duration*.6});const ref=snapshot();s.render(p,0);s.render(p,${duration*.6});return ref===snapshot()})()`);assert.ok(result,clip+' seek drift');
    if(label==='game'&&!process.env.VEHICLE_REVIEW_STILLS_ONLY){
     const dir=`out/vehicles/frames-${id}-${clip}`;mkdirSync(dir,{recursive:true});
     const frames=await e<string[]>(`(()=>{const s=studio.scene,p=structuredClone(studio.project);s.resize(640,480);p.view.azimuth=55;p.actors[0].vehicle=${JSON.stringify(id)};p.actors[0].beats=[{id:'test',clip:${JSON.stringify(clip)},duration:${duration},move:false}];const out=[];for(let i=0;i<${Math.ceil(duration*15)};i++){s.render(p,i/15);out.push(s.output.toDataURL('image/png'));}return out})()`);frames.forEach((url,i)=>writeFileSync(`${dir}/${String(i).padStart(3,'0')}.png`,Buffer.from(url.split(',')[1],'base64')));
    }
    console.log('Rendered',label,id,clip);
   }
  }
 });
 await step('Vehicles can be hidden, customized, saved and recovered without leaking GPU resources',async()=>{
  await e(`(async()=>{const p=structuredClone(studio.project);p.actors[0].beats=[{id:'test',clip:'drive_car',duration:4,move:false}];await studio.setProject(p);})()`);await ready();
  await e(`(()=>{const c=document.getElementById('show-vehicle');c.checked=false;c.dispatchEvent(new Event('change'));})()`);await ready();assert.equal(await e('studio.project.actors[0].beats[0].showVehicle'),false);assert.ok(await e(`(()=>{studio.scene.render(studio.project,1);return !studio.scene.actor.group.children.some(o=>o.userData.component)})()`));
  await e(`(()=>{const c=document.getElementById('show-vehicle');c.checked=true;c.dispatchEvent(new Event('change'));})()`);await ready();await change('vehicle-color','#176a80');await ready();await change('vehicle-variant','sport');await ready();
  assert.ok(await e(`(()=>{studio.scene.render(studio.project,1);let ok=false;studio.scene.actor.group.traverse(o=>{if(o.material?.name==='Vehicle paint')ok=o.material.color.getHexString()==='176a80';});return ok;})()`),'style not applied');
  await new Promise(r=>setTimeout(r,400));await send('Page.reload');await new Promise(r=>setTimeout(r,600));await ready();assert.equal(await e('document.getElementById("vehicle-color").value'),'#176a80');assert.equal(await e('document.getElementById("vehicle-variant").value'),'sport');assert.equal(await e('studio.project.actors[0].beats[0].showVehicle'),true);
  const resources=await e<{first:number;last:number;calls:number}>(`(()=>{const s=studio.scene,p=structuredClone(studio.project),clips=${JSON.stringify(Object.keys(VEHICLE_FOR_CLIP))};p.actors[0].vehicle='auto';s.resize(700,500);const clean=()=>{p.actors[0].beats=[{id:'test',clip:'idle',duration:3,move:false}];s.render(p,1);return s.renderer.info.memory.geometries;};const first=clean();let calls=0;for(let cycle=0;cycle<3;cycle++){for(const clip of clips){p.actors[0].beats=[{id:'test',clip,duration:4,move:false}];s.render(p,1);calls=Math.max(calls,s.renderer.info.render.calls);}clean();}return{first,last:clean(),calls}})()`);assert.equal(resources.first,resources.last,'vehicle geometry leak');assert.ok(resources.calls<450,'vehicle draw budget');console.log('Vehicle GPU resources',resources);
 });
 await step('Vehicles travel with their rider, follow action selection and recover speed after reload',async()=>{
  assert.ok(await e(`!document.getElementById('actor-vehicle')`),'conflicting selector remains');
  await e(`(async()=>{const p=structuredClone(studio.project);p.actors=[{...p.actors[0],vehicle:'auto',x:0,y:0,z:0,yaw:35,beats:[{id:'drive',clip:'drive_suv',duration:3,move:false}]}];p.shots=[{id:'wide',duration:3,shot:'wide',target:'all'}];await studio.setProject(p);})()`);await ready();
  assert.ok(await e(`!document.getElementById('movement').disabled`),'vehicle travel disabled');
  await e(`(()=>{const c=document.getElementById('movement');c.checked=true;c.dispatchEvent(new Event('change'));})()`);await change('vehicle-travel-speed','1.2');await ready();
  const result=await e<{distance:number;scale:number;same:boolean}>(`(()=>{const s=studio.scene,p=studio.project;s.render(p,.25);const a=s.actor,first=a.group.position.clone(),model=a.group.children.find(o=>o.userData.component),local=JSON.stringify(model.position.toArray());s.render(p,2.25);return {distance:first.distanceTo(a.group.position),scale:a.scale,same:local===JSON.stringify(model.position.toArray())}})()`);
  assert.ok(Math.abs(result.distance-2.4*result.scale)<.001);assert.ok(result.same,'vehicle separates from rider');
  await change('action','ride_bicycle');await ready();assert.ok(await e(`(()=>{studio.scene.render(studio.project,1);return studio.scene.actor.group.children.some(o=>o.name==='Bicycle')})()`),'animation did not choose bicycle');
  await change('action','drive_sports_car');await ready();await e(`(()=>{const c=document.getElementById('movement');c.checked=true;c.dispatchEvent(new Event('change'));})()`);await change('vehicle-travel-speed','.8');
  await new Promise(r=>setTimeout(r,400));await send('Page.reload');await new Promise(r=>setTimeout(r,600));await ready();assert.equal(await e(`studio.project.actors[0].beats[0].travelSpeed`),.8);assert.ok(await e(`studio.project.actors[0].beats[0].move`));
 });
 await step('Vehicles custom character settings add to the cast, survive reload and Undo without replacing the first actor',async()=>{
  const source=JSON.stringify({kind:'ara-character',version:1,params:{...DEFAULT_PARAMS,name:'Custom saved actor',gender:0,height:.22,hair:'none',outfit:'none',detail:'medium',vehicle:'none'}});
  const first=await e<string>('JSON.stringify(studio.project.actors[0])');
  await e(`(()=>{const dt=new DataTransfer();dt.items.add(new File([${JSON.stringify(source)}],'custom.ara-character.json',{type:'application/json'}));const input=document.getElementById('custom-character-file');input.files=dt.files;input.dispatchEvent(new Event('change'));})()`);await ready();
  // File.text() completes asynchronously; wait for the cast addition, then the model build.
  for(let i=0;i<100&&await e('studio.project.actors.length')===1;i++)await new Promise(r=>setTimeout(r,100));await ready();
  assert.equal(await e('studio.project.actors.length'),2);assert.equal(await e('JSON.stringify(studio.project.actors[0])'),first);assert.ok(await e(`document.getElementById('character').value==='__custom'&&document.getElementById('character').selectedOptions[0].textContent.includes('Custom saved actor')`));
  await new Promise(r=>setTimeout(r,400));await send('Page.reload');await new Promise(r=>setTimeout(r,600));await ready();assert.equal(await e('studio.project.actors.length'),2);
  await e(`document.getElementById('undo').click()`);await ready();assert.equal(await e('studio.project.actors.length'),1);assert.equal(await e('JSON.stringify(studio.project.actors[0])'),first);
  const snapshot=await e<string>('JSON.stringify(studio.project)');await e(`(()=>{const dt=new DataTransfer();dt.items.add(new File(['{bad'],'bad.json',{type:'application/json'}));const i=document.getElementById('custom-character-file');i.files=dt.files;i.dispatchEvent(new Event('change'));})()`);await new Promise(r=>setTimeout(r,150));await ready();assert.equal(await e('JSON.stringify(studio.project)'),snapshot);
 });
 await step('Vehicles support five independent cast members with bounded draw calls',async()=>{
  await e(`(async()=>{const p=structuredClone(studio.project),base=p.actors[0],ids=['ride_bicycle','drive_car','ride_motorcycle','ride_horse','paddle_kayak'];p.actors=ids.map((clip,i)=>({...base,id:'vehicle'+i,vehicle:'auto',x:(i-2)*2.6,z:0,y:0,yaw:0,beats:[{id:'action'+i,clip,duration:4,move:false}]}));p.shots=[{id:'wide',duration:4,shot:'wide',target:'all'}];await studio.setProject(p);})()`);await ready();
  const result=await e<{count:number;calls:number;parts:number}>(`(()=>{const s=studio.scene;s.resize(1280,720);s.render(studio.project,1);let parts=0;for(const a of s.actors.values())if(a.group.children.some(o=>o.userData.component))parts++;return{count:s.actors.size,parts,calls:s.renderer.info.render.calls}})()`);
  console.log('Five fitted vehicles',result);assert.equal(result.count,5);assert.equal(result.parts,5);assert.ok(result.calls<500,'five vehicles exceed draw budget');
 });

 await step('Vehicles motorboat accommodates a helm operator and two seated passengers',async()=>{
  await e(`(async()=>{const p=structuredClone(studio.project),base=p.actors[0],scale=studio.scene.actor.scale;p.actors=[{...base,id:'helm',vehicle:'motorboat',x:0,y:0,z:0,yaw:0,beats:[{id:'helm-action',clip:'drive_boat',duration:5,move:false}]},...[-1,1].map((side,i)=>({...base,id:'passenger'+i,vehicle:'none',x:side*.52*scale,y:.32*scale,z:-1.30*scale,yaw:0,beats:[{id:'passenger-action'+i,clip:'sit_passenger',duration:5,move:false}]}))];p.shots=[{id:'boat-wide',duration:5,shot:'wide',target:'all'}];p.view={azimuth:55,elevation:10,zoom:1.4};await studio.setProject(p);})()`);await ready();
  const image=await e<string>(`(()=>{const s=studio.scene;s.resize(1100,720);s.selectionId=undefined;s.render(studio.project,1.5);return s.output.toDataURL('image/png')})()`);writeFileSync('out/vehicles/motorboat-three-people.png',Buffer.from(image.split(',')[1],'base64'));
  assert.ok(await e(`(()=>{const actors=[...studio.scene.actors.values()];return actors.length===3&&actors.filter(a=>a.group.children.some(o=>o.userData.component)).length===1})()`),'passengers spawned duplicate vehicles');
 });

 await step('Vehicles three-person film encodes and decodes as a 30 fps MP4',async()=>{
  const result=await e<{data:string;duration:number;width:number;height:number}>(`(async()=>{const p=structuredClone(studio.project);p.actors.forEach(a=>{a.beats[0].duration=1.2;a.beats[0].move=true;a.beats[0].travelSpeed=.6;});p.shots[0].duration=1.2;p.audio.muted=true;const blob=await studio.exportMovie(studio.scene,p,{width:1280,height:720,signal:new AbortController().signal,progress:()=>{}});const video=document.createElement('video'),url=URL.createObjectURL(blob);video.src=url;await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=reject;});const result={duration:video.duration,width:video.videoWidth,height:video.videoHeight,data:''},bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));result.data=btoa(binary);URL.revokeObjectURL(url);return result;})()`);
  assert.ok(Math.abs(result.duration-1.2)<.04);assert.equal(result.width,1280);assert.equal(result.height,720);writeFileSync('out/vehicles/motorboat-moving-three-people.mp4',Buffer.from(result.data,'base64'));
 });

}
