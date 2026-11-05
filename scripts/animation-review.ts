/** Real Studio renderer: time-sampled front/side reviews, plus frames for motion GIFs. */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { DEFAULT_PARAMS } from '../src/core/params';
import { encodeCharacter } from '../src/app/share';
import { CLIPS } from '../src/core/anim/clips';
interface Harness{enabled:boolean;step(name:string,fn:()=>Promise<void>):Promise<void>;evaluate<T=unknown>(js:string):Promise<T>;ready():Promise<void>}
export async function reviewAnimations(h:Harness){
 if(!h.enabled)return;const {step,evaluate:e,ready}=h,folder='out/animation-improvements';mkdirSync(folder,{recursive:true});
 await ready();
 const offered=await e<string[]>('Array.from(document.getElementById("action").options,o=>o.value)');
 assert.ok(CLIPS.every(c=>offered.includes(c.id)),'Studio does not offer every registered animation');
 assert.ok(await e('!!document.querySelector("#actor-carry option[value=parcel]")'),'Studio parcel selector missing');
 const clips=['walk_back','strafe_left','strafe_right','jump','jump_running','punch_low','laugh','wave','turn_left_45','turn_right_45','turn_left_90','turn_right_90','turn_360','pistol_aim_one_hand','pistol_walk','pistol_run','pistol_sprint','pistol_strafe_left','pistol_strafe_right','rifle_walk','rifle_run','rifle_sprint','rifle_strafe_left','rifle_strafe_right','pick_up','carry_idle','carry_walk','put_down'];
 for(const [label,body]of [['game',{}],['full-t',{rig:'full',restPose:'T',gender:0,height:.3,weight:.38}],['broad',{weight:.85,muscle:.9,height:.85}]]as const){
  await step('Animation review '+label,async()=>{
   await ready();
   const code=encodeCharacter({...DEFAULT_PARAMS,...body,rig:body.rig??'game',restPose:body.restPose??'A',detail:'medium',hair:'none',outfit:'none',underwear:true,carry:'none',weapon:'none'});
   await e(`(async()=>{const p=structuredClone(studio.project);p.actors=[{...p.actors[0],character:${JSON.stringify(code)},detail:'medium',x:0,y:0,z:0,yaw:0,beats:[{id:'review',clip:'idle',duration:3,move:false}]}];p.template='portrait';p.caption=false;p.texts=[];p.audio.muted=true;p.shots=[{id:'shot',duration:12,shot:'wide',target:'all'}];p.camera='locked';p.view={azimuth:0,elevation:0,zoom:1.35};await studio.setProject(p);studio.scene.selectionId=undefined;})()`);await ready();
   let equipped='none';
   for(const id of clips.filter(id=>!process.env.ANIMATION_REVIEW_CLIPS||process.env.ANIMATION_REVIEW_CLIPS.split(',').includes(id))){
    const clip=CLIPS.find(c=>c.id===id)!;
    // Rebuild only when the equipped weapon changes; ordinary clip review reuses the character.
    const weapon=id.startsWith('rifle')?'rifle':id.startsWith('pistol')?'pistol':'none';
    const carry=['pick_up','put_down','carry_idle','carry_walk'].includes(id)?'parcel':'none';
    const equipment=weapon+carry;
    if(equipment!==equipped){
     const recipe=encodeCharacter({...DEFAULT_PARAMS,...body,rig:body.rig??'game',restPose:body.restPose??'A',detail:'medium',hair:'none',outfit:'none',underwear:true,carry,weapon});
     await e(`(async()=>{const p=structuredClone(studio.project);p.actors[0].character=${JSON.stringify(recipe)};await studio.setProject(p);})()`);await ready();equipped=equipment;
    }
    const images=await e<string[]>(`(()=>{const s=studio.scene,p=structuredClone(studio.project);s.selectionId=undefined;s.resize(480,480);p.actors[0].beats=[{id:'review',clip:${JSON.stringify(id)},duration:${clip.duration},move:false}];const frames=[];for(const angle of [0,90]){p.view.azimuth=angle;for(let i=0;i<=6;i++){s.render(p,${clip.duration}*i/6);frames.push(s.output.toDataURL('image/png'));}}return frames;})()`);
    const tiles=await Promise.all(images.map(async(url,i)=>({input:await sharp(Buffer.from(url.split(',')[1],'base64')).resize(200,200).png().toBuffer(),left:i%7*200,top:Math.floor(i/7)*224})));
    const labels=Buffer.from(`<svg width="1400" height="448"><style>text{fill:#ddd;font:12px sans-serif}</style><text x="8" y="216">${id} · ${label} · FRONT · 0 → ${clip.duration.toFixed(2)}s</text><text x="8" y="440">SIDE · ${clip.loop?'loop':'one shot — final standing pose at right'}</text></svg>`);
    await sharp({create:{width:1400,height:448,channels:3,background:'#181c23'}}).composite([...tiles,{input:labels,left:0,top:0}]).png().toFile(`${folder}/${label}-${id}.png`);
    if(label==='game'&&!process.env.ANIMATION_REVIEW_STILLS_ONLY){
     const dir=`${folder}/frames-${id}`;rmSync(dir,{recursive:true,force:true});mkdirSync(dir,{recursive:true});
     const frames=await e<string[]>(`(()=>{const s=studio.scene,p=structuredClone(studio.project);s.resize(480,480);p.view.azimuth=35;p.actors[0].beats=[{id:'review',clip:${JSON.stringify(id)},duration:${clip.duration},move:false}];const frames=[];for(let i=0;i<=${Math.ceil(clip.duration*15)};i++){s.render(p,Math.min(${clip.duration},i/15));frames.push(s.output.toDataURL('image/png'));}return frames;})()`);
     frames.forEach((url,i)=>writeFileSync(`${dir}/${String(i).padStart(3,'0')}.png`,Buffer.from(url.split(',')[1],'base64')));
    }
    console.log('Rendered',label,id);
   }
  });
 }
}
