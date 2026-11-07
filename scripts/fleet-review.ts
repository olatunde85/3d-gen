import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import sharp from 'sharp';
import {DEFAULT_PARAMS} from '../src/core/params';
import {encodeCharacter} from '../src/app/share';
import {VEHICLE_CLIP,vehicleStyleForChoice,DEFAULT_VEHICLE_STYLE} from '../src/core/props/vehicles';
import {clipById} from '../src/core/anim/clips';
export async function reviewFleet({step,evaluate:e,ready,change}:{step:(n:string,f:()=>Promise<void>)=>Promise<void>;evaluate:<T=unknown>(s:string)=>Promise<T>;ready:()=>Promise<void>;change:(id:string,v:string)=>Promise<unknown>}){
 await step('Fleet models, entry, exit, stunt rolls and flight controls render',async()=>{
  mkdirSync('out/fleet',{recursive:true});await ready();
  for(const rig of (process.env.FLEET_FULL?['full']as const:['game']as const))for(const model of ['pickup','tank','jet']as const){
   const character=encodeCharacter({...DEFAULT_PARAMS,rig,vehicle:'auto',carry:'none',weapon:'none',detail:'medium',vehicleStyle:vehicleStyleForChoice(model,DEFAULT_VEHICLE_STYLE)});
   const ride=VEHICLE_CLIP[model];
   await e(`(async()=>{const p=structuredClone(studio.project);p.actors=[{id:'hero',character:${JSON.stringify(character)},detail:'medium',vehicle:'auto',x:0,y:0,z:0,yaw:0,beats:[{id:'a',clip:${JSON.stringify(ride)},duration:6,move:false}]}];p.template='cyclorama';p.caption=false;p.texts=[];p.audio.muted=true;p.shots=[{id:'s',duration:6,shot:'wide',target:'all'}];p.view={azimuth:55,elevation:15,zoom:1.05};await studio.setProject(p);studio.scene.selectionId=undefined;})()`);await ready();
   const clips=[ride,`board_${model}`,`alight_${model}`,`tumble_${model}`];
   for(const clip of clips){const duration=clipById.get(clip)!.duration;
    const images=await e<string[]>(`(()=>{const s=studio.scene,p=structuredClone(studio.project),out=[];s.resize(800,600);p.actors[0].beats=[{id:'a',clip:${JSON.stringify(clip)},duration:${duration},move:false}];for(const t of [0,.3,.5,.7,1]){s.render(p,${duration}*t);out.push(s.output.toDataURL());}return out;})()`);
    const tiles=await Promise.all(images.map(async(data,i)=>({input:await sharp(Buffer.from(data.split(',')[1],'base64')).resize(400,300).png().toBuffer(),left:i%3*400,top:Math.floor(i/3)*300})));await sharp({create:{width:1200,height:600,channels:3,background:'#ece9df'}}).composite(tiles).png().toFile(`out/fleet/${rig}-${clip}.png`);
   }
   if(model==='jet'){await change('timeline-selection','hero:0');assert.ok(await e(`!document.getElementById('helicopter-height-row').hidden`));await change('helicopter-height','5');assert.equal(await e('studio.project.actors[0].beats[0].flightHeight'),5);}
   console.log('Reviewed fleet',rig,model);
  }
 });
}
