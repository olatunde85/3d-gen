/** Photograph the actual sets, without characters; static WebP images need no runtime WebGL. */
import {mkdirSync,writeFileSync} from 'node:fs';
import sharp from 'sharp';
import {SETS,isOutdoorScene} from '../src/studio/catalog';
interface Harness {enabled:boolean;step(name:string,fn:()=>Promise<void>):Promise<void>;evaluate<T=unknown>(js:string):Promise<T>;ready():Promise<void>}
export async function buildLocationThumbnails(h:Harness){
 if(!h.enabled)return;
 await h.step('Location thumbnails render all live sets without changing their geometry',async()=>{
  await h.ready();mkdirSync('public/studio-location-thumbs',{recursive:true});mkdirSync('public/studio-location-previews',{recursive:true});mkdirSync('out/studio-location-thumbnails',{recursive:true});
  await h.evaluate("(async()=>{const p=structuredClone(studio.project);p.actors=p.actors.slice(0,1);Object.assign(p.actors[0],{x:0,y:0,z:0,yaw:0,beats:[{id:'still',clip:'idle',duration:3,move:false}]});p.shots=[{id:'wide',shot:'wide',duration:3,target:'all'}];p.caption=false;p.texts=[];p.audio.muted=true;await studio.setProject(p);window.__thumbnailProject=structuredClone(studio.project);studio.scene.resize(960,600);studio.scene.freezeCamera=true;studio.scene.selectionId=undefined;for(const actor of studio.scene.actors.values())actor.group.visible=false;})()");
  const tiles:{input:Buffer;left:number;top:number}[]=[];
  for(const [index,set]of SETS.entries()){
   let eye=[8.5,6,11.5],target=[0,1,-1.7];
   if(isOutdoorScene(set.id)){eye=[16,11,20];target=[0,.5,-4];}
   if(set.family==='street'){eye=[1.2,7,20];target=[0,1,-10];}
   if(set.id==='forest-trail'){eye=[12,7,20];target=[0,1,-8];}
   const views:Record<string,{eye:number[];target:number[]}>={
    campsite:{eye:[15,12,9],target:[0,0,-9]},'mountain-lake':{eye:[20,23,12],target:[0,0,-9]},
    runway:{eye:[4,3.8,9],target:[0,1,-4]},church:{eye:[13,9,17],target:[0,1,-2]},
    elevator:{eye:[5.3,4.1,7],target:[0,1,0]},'sports-court':{eye:[20,16,24],target:[7,0,0]},
    harbour:{eye:[15,13,17],target:[0,0,-6]},'football-stadium':{eye:[108,82,136],target:[0,0,0]},
    highway:{eye:[35,22,45],target:[-8,0,-25]},'military-base':{eye:[55,32,60],target:[0,0,-10]},
    'prison-yard':{eye:[52,32,62],target:[0,0,-5]},'neon-street':{eye:[2,7,24],target:[0,1,-15]},
   };
   if(views[set.id])({eye,target}=views[set.id]);
   const frame=await h.evaluate<string>("(()=>{const s=studio.scene,p=__thumbnailProject;p.template="+JSON.stringify(set.id)+";s.camera.position.set(..."+JSON.stringify(eye)+");s.camera.lookAt(..."+JSON.stringify(target)+");s.render(p,1);return s.output.toDataURL('image/png')})()");
   const input=Buffer.from(frame.split(',')[1],'base64'),webp=await sharp(input).resize(480,300).webp({quality:77}).toBuffer();
   writeFileSync('public/studio-location-thumbs/'+set.id+'.webp',webp);
   writeFileSync('public/studio-location-previews/'+set.id+'.webp',await sharp(input).webp({quality:82}).toBuffer());
   const tile=await sharp(webp).resize(240,150).extend({bottom:23,background:'#1b2027'}).composite([{input:Buffer.from('<svg width="240" height="173"><text x="8" y="166" font-size="11" fill="#e0c5a3">'+set.name.replaceAll('&','&amp;')+'</text></svg>')}]).png().toBuffer();
   tiles.push({input:tile,left:index%6*240,top:Math.floor(index/6)*173});
  }
  await sharp({create:{width:1440,height:Math.ceil(SETS.length/6)*173,channels:3,background:'#1b2027'}}).composite(tiles).png().toFile('out/studio-location-thumbnails/contact-sheet.png');
  await h.evaluate("studio.scene.freezeCamera=false;studio.scene.resize(1280,720);for(const actor of studio.scene.actors.values())actor.group.visible=true;studio.scene.render(studio.project,1)");
  console.log('Saved '+SETS.length+' set thumbnails to public/studio-location-thumbs.');
 });
}
