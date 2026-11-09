/** Real touch/keyboard regression checks for the phone builder. Saves review screenshots. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
interface Harness{enabled:boolean;step:(name:string,fn:()=>Promise<void>)=>Promise<void>;evaluate:<T=unknown>(js:string)=>Promise<T>;waitFor:(js:string,what:string,ms?:number)=>Promise<void>;send:<T=Record<string,unknown>>(method:string,params?:object)=>Promise<T>}
export async function checkMobileBuilder({enabled,step,evaluate:e,waitFor,send}:Harness){
 if(!enabled)return;mkdirSync('out/mobile-builder',{recursive:true});
 const photo=async(name:string)=>{const {data}=await send<{data:string}>('Page.captureScreenshot',{format:'png'});writeFileSync(`out/mobile-builder/${name}.png`,Buffer.from(data,'base64'));};
 const settle=()=>new Promise(r=>setTimeout(r,300));
 const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
 const tap=async(selector:string)=>{await e(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);const point=await e<{x:number;y:number}>(`(()=>{const b=document.querySelector(${JSON.stringify(selector)});const r=b.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:7}]});await pause(60);await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await pause(120);};
 const snap=async(key:string)=>{await e(`document.getElementById('sheet-handle').focus()`);await send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key});await settle();};
 await step('Mobile collapsed sheet keeps the summary and actions visible',async()=>{
  await waitFor(`document.getElementById('panel').dataset.sheetSnap==='peek'&&document.getElementById('sheet-summary').textContent.length>20`,'mobile sheet');
  const sizes=await e<{panel:number;stage:number;summary:boolean;inert:boolean;overflow:boolean}>(`(()=>{const r=id=>document.getElementById(id).getBoundingClientRect(),s=r('sheet-summary');return{panel:r('panel').height,stage:r('viewport').height,summary:s.top>=0&&s.bottom<=innerHeight,inert:document.getElementById('panel-scroll').inert,overflow:document.documentElement.scrollWidth>innerWidth};})()`);
  assert.ok(sizes.panel<180&&sizes.stage>400,JSON.stringify(sizes));assert.ok(sizes.summary&&sizes.inert&&!sizes.overflow);await photo('390-peek');
 });
 await step('Mobile sheet drags with touch, snaps, cancels safely and preserves the character',async()=>{
  const before=await e<string>('JSON.stringify(window.ara.store.params)'),r=await e<{x:number;y:number}>(`(()=>{const r=document.getElementById('sheet-handle').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x,y:r.y,id:1}]});
  for(let i=1;i<=12;i++){await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:r.x,y:r.y-i*35,id:1}]});await pause(16);}
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settle();
  assert.ok(await e(`document.getElementById('panel').getBoundingClientRect().height>300`));
  const handle=await e<{x:number;y:number}>(`(()=>{const r=document.getElementById('sheet-handle').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`),height=await e<number>(`document.getElementById('panel').getBoundingClientRect().height`);
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...handle,id:2}]});await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:handle.x,y:handle.y+80,id:2}]});await send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await settle();assert.ok(Math.abs(await e<number>(`document.getElementById('panel').getBoundingClientRect().height`)-height)<2);
  await snap('Home');assert.equal(await e(`document.getElementById('panel').dataset.sheetSnap`),'peek');await snap('End');assert.equal(await e(`document.getElementById('panel').dataset.sheetSnap`),'full');assert.equal(await e('JSON.stringify(window.ara.store.params)'),before);await photo('390-full');
 });
 await step('Mobile summary stays pinned while controls scroll and Detailed remains usable',async()=>{
  const top=await e<number>(`document.getElementById('sheet-summary').getBoundingClientRect().top`);await e(`document.getElementById('panel-scroll').scrollTop=900`);await settle();assert.equal(await e(`document.getElementById('sheet-summary').getBoundingClientRect().top`),top);
  await e(`document.getElementById('panel-scroll').scrollTop=0;document.querySelectorAll('.mode-switch button')[1].click()`);assert.ok(await e(`document.body.dataset.mode==='detailed'&&!document.getElementById('panel-scroll').inert&&getComputedStyle(document.getElementById('sheet-summary')).display!=='none'`));
  await e(`document.querySelectorAll('.mode-switch button')[0].click()`);await snap('Home');
 });
 await step('Mobile action items respond to real taps without a default highlighted item',async()=>{
  await tap('#mobile-actions');assert.equal(await e(`document.getElementById('mobile-actions').getAttribute('aria-expanded')`),'true');assert.equal(await e(`document.querySelectorAll('#mobile-action-menu [role=menuitem]').length`),7);assert.ok(await e(`document.activeElement.id==='mobile-action-menu'&&getComputedStyle(document.querySelector('#mobile-action-menu button')).backgroundColor==='rgba(0, 0, 0, 0)'`));await photo('390-actions');
  await tap('#mobile-action-menu [data-action=export]');await waitFor(`!document.getElementById('export-panel').hidden&&document.getElementById('mobile-action-menu').hidden`,'tapped export options');await photo('390-export');await tap('.xp-close');await tap('#mobile-actions');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});assert.ok(await e(`document.getElementById('mobile-action-menu').hidden&&document.activeElement.id==='mobile-actions'`));
  await tap('#mobile-actions');await tap('#mobile-action-menu [data-action=share]');await waitFor(`document.querySelector('dialog.share-modal')?.open`,'tapped mobile sharing');await tap('.share-close');await tap('#mobile-actions');await tap('#mobile-action-menu [data-action=assist]');await waitFor(`document.getElementById('character-assist-dialog').open`,'tapped mobile Assist');await tap('#ca-close');
 });
 await step('Mobile download, save and open actions reach their real handlers',async()=>{
  await e(`(()=>{window.__phoneDownloads=[];window.__phoneAnchor=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download)window.__phoneDownloads.push(this.download);else window.__phoneAnchor.call(this);};window.__phoneExport={...ara.store.exportSettings};ara.store.setExport({mode:'static',format:'glb',vehicleFile:false});})()`);
  await tap('#mobile-actions');await tap('#mobile-action-menu [data-action=download]');await waitFor(`window.__phoneDownloads.some(n=>n.endsWith('.glb'))`,'tapped model download',120000);
  await tap('#mobile-actions');await tap('#mobile-action-menu [data-action=save]');await waitFor(`window.__phoneDownloads.some(n=>n.endsWith('.ara-character.json'))`,'tapped settings save');
  await e(`(()=>{window.__phoneOpen=false;document.getElementById('character-settings-file').addEventListener('click',e=>{e.preventDefault();window.__phoneOpen=true;},{once:true});})()`);await tap('#mobile-actions');await tap('#mobile-action-menu [data-action=open]');assert.ok(await e(`window.__phoneOpen`));
  await e(`HTMLAnchorElement.prototype.click=window.__phoneAnchor;ara.store.setExport(window.__phoneExport);`);
 });
 await step('Mobile animation bar and searchable browser fit narrow phones',async()=>{
  for(const width of [390,320]){
   await send('Emulation.setDeviceMetricsOverride',{width,height:width===320?568:844,deviceScaleFactor:1,mobile:true});await settle();await snap('Home');
   assert.ok(await e(`(()=>{const bar=document.getElementById('anim-bar'),r=bar.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&bar.scrollWidth<=bar.clientWidth+1&&[...bar.querySelectorAll('.anim-quick button,.anim-player button')].every(b=>{const x=b.getBoundingClientRect();return x.left>=r.left&&x.right<=r.right&&x.top>=r.top&&x.bottom<=r.bottom;});})()`),'clipped playback controls at '+width);
   await e(`document.querySelector('.anim-settings').click()`);assert.ok(await e(`getComputedStyle(document.getElementById('anim-options')).display!=='none'`));await e(`document.querySelector('.anim-settings').click()`);await tap('.anim-browse');await settle();
   assert.ok(await e(`(()=>{const p=document.getElementById('anim-pop'),r=p.getBoundingClientRect(),g=p.querySelector('.anim-grid').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&g.height>100&&p.scrollWidth<=p.clientWidth+1;})()`),'animation drawer clipped at '+width);
   await photo(width+'-animations');await e(`document.querySelector('.anim-search').value='pistol aim';document.querySelector('.anim-search').dispatchEvent(new Event('input'));window.__phonePlay=ara.viewer.play;ara.viewer.play=function(...args){window.__closedBeforePlay=document.getElementById('anim-pop').hidden;return window.__phonePlay.apply(this,args);};`);await tap('#anim-pop [data-id=pistol_aim_one_hand]');await waitFor(`window.ara.viewer.playing.id==='pistol_aim_one_hand'&&document.getElementById('anim-pop').hidden`,'animation closes before playback');assert.ok(await e(`window.__closedBeforePlay`));await e(`ara.viewer.play=window.__phonePlay`);await photo(width+'-playback');
  }
 });
 await step('Mobile layout handles rotation and restores desktop controls',async()=>{
  for(const [width,height]of [[568,320],[844,390]]){await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});await settle();assert.ok(await e(`document.documentElement.scrollWidth<=innerWidth&&document.getElementById('sheet-summary').getBoundingClientRect().bottom<=innerHeight&&getComputedStyle(document.getElementById('sheet-heading')).display!=='none'&&document.getElementById('viewport').clientHeight>60`));await photo(width+'-landscape');}
  await send('Emulation.setDeviceMetricsOverride',{width:1024,height:800,deviceScaleFactor:1,mobile:false});await settle();assert.ok(await e(`!document.getElementById('panel-scroll').inert&&getComputedStyle(document.getElementById('sheet-heading')).display==='none'&&getComputedStyle(document.getElementById('export')).display!=='none'`));
  assert.ok(await e(`(()=>{const a=document.getElementById('stats').getBoundingClientRect(),b=document.getElementById('view-tools').getBoundingClientRect();return a.right<=b.left||a.bottom<=b.top||b.bottom<=a.top;})()`),'stats overlap toggles');await photo('1024-desktop');
 });
 await step('Mobile Studio action hands off the current character',async()=>{
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await settle();await photo('390-return');await tap('#mobile-actions');assert.equal(await e(`document.getElementById('mobile-actions').ariaExpanded`),'true');await tap('#mobile-action-menu [data-action=studio]');await waitFor(`location.pathname==='/studio/'&&new URLSearchParams(location.hash.slice(1)).has('c')`,'Studio handoff',15000);
 });
}
