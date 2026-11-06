/** Missing picker pictures: render the shipped gowns through the actual character builder. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import sharp from 'sharp';
interface Harness {enabled:boolean;step(name:string,fn:()=>Promise<void>):Promise<void>;evaluate<T=unknown>(js:string):Promise<T>;waitFor(js:string,what:string,ms?:number):Promise<void>;send(method:string,params?:object):Promise<unknown>}
export async function buildGownThumbnails(h:Harness){
 if(!h.enabled)return;const{step,evaluate:e,waitFor}=h;
 await step('Gown thumbnails show both real garments in Quick build and Detailed',async()=>{
  for(const dir of ['out/gown-thumbnails','public/outfit-thumbs','public/quick-thumbs','dist/outfit-thumbs','dist/quick-thumbs'])mkdirSync(dir,{recursive:true});
  const outfits=[{preset:'The Covert Spy',set:'set_cocktail_dress',style:'cocktail_dress',title:'Red cocktail dress (short)'},{preset:'The Bride',set:'set_wedding_gown',style:'wedding',title:'Wedding gown & veil'}];
  for(const outfit of outfits){
   await e("(()=>{const s=document.querySelector('#preset');s.value="+JSON.stringify(outfit.preset)+";s.dispatchEvent(new Event('change'))})()");
   await waitFor("window.ara?.store.current?.params.outfit==="+JSON.stringify(outfit.set)+"&&!document.querySelector('#status').classList.contains('show')",'the gown to finish building');
   await e("Promise.all([...ara.viewer.texCache.values()].map(t=>new Promise((resolve,reject)=>{const start=Date.now();function check(){const img=t.image;if(img?.complete&&img.naturalWidth)return resolve();if(Date.now()-start>25000)return reject(Error('Gown texture did not load'));setTimeout(check,40)}check()})))");
   for(const kind of ['detailed','quick']as const){
    const width=kind==='detailed'?768:416,height=kind==='detailed'?768:720;
    const png=await e<string>("(()=>{const v=ara.viewer;ara.play("+JSON.stringify(kind==='detailed'?'bind':'idle')+");v.speed=0;v.blendFrom=null;v.tick();v.mesh.updateMatrixWorld(true);v.mesh.computeBoundingBox();const b=v.mesh.boundingBox,size=b.getSize(v.camera.position.clone()),center=b.getCenter(v.camera.position.clone()),aspect="+width+"/"+height+",angle=.24,d=Math.max(size.y,(size.x*Math.cos(angle)+size.z*Math.sin(angle))/aspect)*.5/Math.tan(Math.PI/12)*1.14+size.z*.5;v.controls.enableDamping=false;v.controls.target.copy(center);v.camera.position.set(center.x+Math.sin(angle)*d,center.y+size.y*.025,center.z+Math.cos(angle)*d);v.camera.aspect=aspect;v.camera.updateProjectionMatrix();v.controls.update();v.renderer.setPixelRatio(1);v.renderer.setSize("+width+","+height+",false);v.renderer.render(v.scene,v.camera);return v.canvasElement.toDataURL('image/png')})()");
    const raw=Buffer.from(png.split(',')[1],'base64'),image=await sharp(raw).resize(kind==='detailed'?96:104,kind==='detailed'?96:180).png({palette:true,colours:192,compressionLevel:9}).toBuffer(),file=kind==='detailed'?'outfit-thumbs/'+outfit.set+'.png':'quick-thumbs/'+outfit.style+'-woman.png';
    writeFileSync('public/'+file,image);writeFileSync('dist/'+file,image);writeFileSync('out/gown-thumbnails/'+outfit.set+'-'+kind+'.png',raw);
   }
  }
  await e("document.querySelectorAll('.mode-switch button')[1].click()");
  for(const outfit of outfits){
   const selector='#controls .picker button[title='+JSON.stringify(outfit.title)+']';
   assert.ok(await e("!!document.querySelector("+JSON.stringify(selector)+")"),outfit.title+' Detailed entry');
   await e("(()=>{const img=document.querySelector("+JSON.stringify(selector)+").querySelector('img');img.loading='eager';img.src=img.src+'?gown-check';return img.decode()})()");
   assert.ok(await e("document.querySelector("+JSON.stringify(selector)+").querySelector('img').naturalWidth===96"),outfit.title+' Detailed thumbnail');
   await e("document.querySelector("+JSON.stringify(selector)+").click()");
   await waitFor("ara.store.current.params.outfit==="+JSON.stringify(outfit.set),'Detailed outfit selection');
   assert.ok(await e("ara.store.params.shoes==='heels'"));
  }
  assert.ok(await e("ara.store.params.accessories.includes('bridal_veil')&&ara.store.params.accessories.includes('pearl_necklace')"));
  await e("document.querySelectorAll('.mode-switch button')[0].click()");
  for(const outfit of outfits){
   const selector='#quick [data-k="style:'+outfit.style+'"]';
   await e("(()=>{const img=document.querySelector("+JSON.stringify(selector)+").querySelector('img');img.loading='eager';img.src=img.src+'?gown-check';return img.decode()})()");
   assert.ok(await e("document.querySelector("+JSON.stringify(selector)+").querySelector('img').naturalWidth===104"),outfit.title+' Quick thumbnail');
   await e("document.querySelector("+JSON.stringify(selector)+").click()");
   await waitFor("ara.store.current.params.outfit==="+JSON.stringify(outfit.set),'Quick outfit selection');
   assert.ok(await e("document.querySelector("+JSON.stringify(selector)+").ariaPressed==='true'"));
   if(outfit.style==='cocktail_dress')assert.ok(await e("!ara.store.params.accessories.includes('bridal_veil')"));
  }
  await e("(()=>{const v=ara.viewer;v.speed=1;v.controls.enableDamping=true;v.resize();v.frame();document.querySelector('#quick [data-k=\"style:wedding\"]').scrollIntoView({block:'center'});return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))})()");
  const shot=await h.send('Page.captureScreenshot',{format:'png'})as {data:string};writeFileSync('out/gown-thumbnails/builder-outfits.png',Buffer.from(shot.data,'base64'));
 });
}
