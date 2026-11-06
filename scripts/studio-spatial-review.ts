import assert from 'node:assert/strict';
interface Harness {enabled:boolean;step(name:string,fn:()=>Promise<void>):Promise<void>;evaluate<T=unknown>(js:string):Promise<T>;ready():Promise<void>;change(id:string,value:string):Promise<unknown>;send(method:string,params?:object):Promise<unknown>;pause(ms?:number):Promise<unknown>;shot(name:string):Promise<void>}
export async function checkSpatialReview(h:Harness){
 if(!h.enabled)return;const{step,evaluate:e,ready,change,send,pause,shot}=h;
 await step('Spatial maps guide contains exact harbour geometry and downloadable reference files',async()=>{
  await ready();await e("(async()=>{const p=structuredClone(studio.project);p.template='harbour';p.actors=p.actors.slice(0,1);Object.assign(p.actors[0],{x:20,y:0,z:0,yaw:180,beats:[{id:'drive',clip:'drive_car',duration:6,move:true}]});p.shots=[{id:'wide',shot:'wide',target:'all',duration:6}];p.caption=false;p.texts=[];p.audio.muted=true;p.audio.speech=[];await studio.setProject(p);document.querySelector('#open-assist').click();})()");await ready();await change('assist-reference','harbour');
  const guide=await e<string>("document.querySelector('#assist-guide').value");assert.ok(guide.includes('SELECTED LOCATION STAGING MAP'));assert.ok(guide.includes('east-pier-motorboat'));assert.ok(guide.includes('"boarding-pier"'));assert.ok(guide.includes('"water":[[-300,-327.5,300,-7.5]]'));assert.ok(guide.includes('cumulativeTravel(t)-D/2'));
  await e("(()=>{window.__mapDownloads=[];window.__oldAnchorClick=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download)window.__mapDownloads.push({name:this.download,url:this.href});else __oldAnchorClick.call(this)};document.querySelector('#assist-save-map').click();document.querySelector('[data-r=save-all-references]').click();})()");
  const files=await e<{name:string;kind:string;locations?:number;location?:string}[]>("Promise.all(__mapDownloads.map(async f=>{const j=await(await fetch(f.url)).json();return{name:f.name,kind:j.kind,locations:j.locations?.length,location:j.location?.id}}))");assert.equal(files[0].location,'harbour');assert.equal(files[1].locations,66);await e('HTMLAnchorElement.prototype.click=__oldAnchorClick');
  await change('assist-reference','church');assert.ok(await e("document.querySelector('#assist-guide').value.includes('\"location\":{\"id\":\"church\"')"));
  await e("document.querySelector('#assist-context').checked=true;document.querySelector('#assist-context').dispatchEvent(new Event('change',{bubbles:true}))");assert.ok(await e("document.querySelector('#assist-guide').value.includes('\"accuracy\":\"fitted-bodies\"')&&document.querySelector('#assist-guide').value.includes('\"measurements\"')&&document.querySelector('#assist-guide').value.includes('\"boardingScale\":'+studio.scene.actor.vehicleBody.boardingScale)"));
 });
 await step('Spatial location thumbnails browse horizontally by category and expand before selection',async()=>{
  assert.ok(await e("document.querySelector('#assist-reference').type==='hidden'&&!document.querySelector('select#assist-reference')&&document.querySelector('#assist-location-category').options.length===7"));
  assert.equal(await e("document.querySelectorAll('[data-reference-choice]').length"),66);
  assert.ok(await e("(()=>{const g=document.querySelector('[data-r=reference-gallery]');return g.scrollWidth>g.clientWidth&&g.clientHeight<200&&g.scrollHeight<=g.clientHeight+1})()"));
  await e("Promise.all([...document.querySelectorAll('[data-reference-choice] img')].map(i=>{i.loading='eager';return i.decode()}))");
  assert.ok(await e("[...document.querySelectorAll('[data-reference-choice] img')].every(i=>i.naturalWidth===480&&i.naturalHeight===300)"));
  await e("window.__beforeLocationBrowse=JSON.stringify(studio.project);document.querySelector('[data-r=reference-next]').click()");await pause(500);assert.ok(await e("document.querySelector('[data-r=reference-gallery]').scrollLeft>0"));
  await change('assist-location-category','Homes');assert.ok(await e("[...document.querySelectorAll('[data-reference-choice]:not([hidden])')].every(b=>b.querySelector('.ai-reference-card-category').textContent==='Homes')"));
  await e("document.querySelector('#assist-location-search').value='hospital';document.querySelector('#assist-location-search').dispatchEvent(new Event('input',{bubbles:true}))");assert.ok(await e("!document.querySelector('[data-r=reference-empty]').hidden"));
  await change('assist-location-category','');assert.equal(await e("document.querySelectorAll('[data-reference-choice]:not([hidden])').length"),1);
  await e("document.querySelector('[data-reference-choice=hospital-room]').click();document.querySelector('[data-r=reference-viewer-image]').decode()");
  assert.ok(await e("document.querySelector('#assist-location-preview').open&&document.querySelector('#assist-reference').value==='church'&&document.querySelector('[data-r=reference-viewer-image]').naturalWidth===960"));
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  assert.ok(await e("!document.querySelector('#assist-location-preview').open&&document.querySelector('#assist-dialog').open&&document.querySelector('#assist-reference').value==='church'"));
  await e("document.querySelector('[data-reference-choice=hospital-room]').click();document.querySelector('[data-r=reference-viewer-use]').click()");
  assert.ok(await e("document.querySelector('#assist-reference').value==='hospital-room'&&document.querySelector('[data-r=reference-preview]').getAttribute('src').endsWith('/hospital-room.webp')&&document.querySelector('#assist-guide').value.includes('\"location\":{\"id\":\"hospital-room\"')&&!document.querySelector('#assist-location-preview').open"));
  await e("document.querySelector('#assist-location-search').value='';document.querySelector('#assist-location-search').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-reference-choice]').focus()");
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});assert.equal(await e("document.activeElement.dataset.referenceChoice"),'runway');
  await change('assist-location-category','Leisure');await shot('llm-location-strip');
  await change('assist-location-category','');await e("document.querySelector('[data-reference-choice=harbour]').click();document.querySelector('[data-r=reference-viewer-image]').decode()");await shot('llm-location-expanded');await e("document.querySelector('[data-r=reference-viewer-close]').click()");
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert.ok(await e("document.querySelector('#assist-dialog').scrollWidth<=document.querySelector('#assist-dialog').clientWidth"));await e("document.querySelector('[data-r=reference-picker]').scrollIntoView({block:'start'})");await shot('llm-location-strip-mobile');
  await e("document.querySelector('[data-reference-choice=harbour]').click()");assert.ok(await e("document.querySelector('#assist-location-preview').scrollWidth<=document.querySelector('#assist-location-preview').clientWidth"));await shot('llm-location-expanded-mobile');await e("document.querySelector('[data-r=reference-viewer-close]').click()");
  await send('Emulation.setDeviceMetricsOverride',{width:1500,height:1100,deviceScaleFactor:1,mobile:false});assert.ok(await e("JSON.stringify(studio.project)===__beforeLocationBrowse"));await change('assist-reference','church');
 });
 await step('Spatial review warns about whole-path conflicts and exports fitted transition positions',async()=>{
  await e("document.querySelector('#assist-json').value=JSON.stringify(studio.project);document.querySelector('#assist-json').dispatchEvent(new Event('input',{bubbles:true}))");assert.ok(await e("!!document.querySelector('.ai-staging-notes')&&document.querySelector('.ai-staging-notes').textContent.includes('water')"));assert.ok(!await e("document.querySelector('#assist-create').disabled"));await e("document.querySelector('#assist-close').click();document.querySelector('#open-staging').click()");
  for(let n=0;n<100&&!await e("!!document.querySelector('#staging-map svg')");n++)await pause(100);
  assert.ok(await e("document.querySelector('#staging-dialog').open&&!!document.querySelector('#staging-map svg')"));assert.ok(await e("document.querySelector('.staging-findings').textContent.includes('water')"));
  await e("window.__mapDownloads=[];HTMLAnchorElement.prototype.click=function(){if(this.download)__mapDownloads.push({name:this.download,url:this.href})};document.querySelector('#staging-save-report').click();document.querySelector('#staging-save-map').click()");
  const report=await e<{accuracy:string;measurements:Record<string,{scale:number;boardingScale:number;vehicleEnvelopes:object}>;issues:{code:string}[];transitions:{from:{z:number};to:{z:number}}[]}>("fetch(__mapDownloads[0].url).then(r=>r.json())");assert.equal(report.accuracy,'fitted-bodies');assert.ok(Object.values(report.measurements).every(m=>m.scale>0&&m.boardingScale>0&&Object.keys(m.vehicleEnvelopes).length>0));assert.ok(report.issues.some(i=>i.code==='ground-in-water'));assert.ok(report.transitions[0].from.z>10&&report.transitions[0].to.z< -10);await e('HTMLAnchorElement.prototype.click=__oldAnchorClick');
  await shot('spatial-harbour-review');await e("document.querySelector('#staging-zoom').click()");assert.ok(await e("document.querySelector('#staging-map svg').getAttribute('viewBox').startsWith('-180 -180')"));
  await e("document.querySelector('[data-issue]').click()");assert.ok(!await e("document.querySelector('#staging-dialog').open"));
 });
 await step('Spatial map selector survives reload and the review fits mobile',async()=>{
  await e("document.querySelector('#open-assist').click();window.dispatchEvent(new Event('pagehide'));window.__spatialReload=true");await send('Page.reload');
  for(let n=0;n<400&&!await e("!window.__spatialReload&&window.studio?.ready&&document.querySelector('#assist-dialog').open").catch(()=>false);n++)await pause(200);
  assert.equal(await e("document.querySelector('#assist-reference').value"),'church');await e("document.querySelector('#assist-close').click()");
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await e("document.querySelector('#open-staging').click()");for(let n=0;n<100&&!await e("!!document.querySelector('#staging-map svg')");n++)await pause(100);assert.ok(await e("document.querySelector('#staging-dialog').scrollWidth<=document.querySelector('#staging-dialog').clientWidth&&document.documentElement.scrollWidth<=innerWidth"));await shot('spatial-mobile-review');await e("document.querySelector('#staging-dialog [data-close]').click()");
  await send('Emulation.setDeviceMetricsOverride',{width:1500,height:1100,deviceScaleFactor:1,mobile:false});
 });
 await step('Spatial harbour map matches the rendered pier and shared Assist still works in the builder',async()=>{
  await e("(async()=>{const p=structuredClone(studio.project),a=p.actors[0];Object.assign(a,{x:2.47,y:0,z:-11.92,yaw:180,beats:[{id:'board',clip:'board_motorboat',duration:2,move:false},{id:'ride',clip:'drive_boat',duration:3,move:false},{id:'exit',clip:'alight_motorboat',duration:2,move:false}]});await studio.setProject(p);const s=studio.scene;s.freezeCamera=true;s.camera.position.set(14,14,17);s.camera.lookAt(0,0,-6);s.render(studio.project,2.5)})()");await ready();await shot('spatial-harbour-pier');
  await send('Page.navigate',{url:'http://localhost:4422/app/#demo'});
  for(let n=0;n<600&&!await e("!!document.querySelector('#loading')?.hidden&&!!window.ara?.store?.current").catch(()=>false);n++)await pause(200);
  await e("document.querySelector('#character-assist-btn').click()");
  for(let n=0;n<100&&!await e("!!document.querySelector('#character-assist-dialog')?.open");n++)await pause(100);
  assert.ok(await e("document.querySelector('#character-assist-dialog').open&&!document.querySelector('#ca-reference')"));
  await e("document.querySelector('#ca-example').click()");assert.ok(!await e("document.querySelector('#ca-create').disabled"));assert.ok(await e("document.querySelector('#ca-guide').value.includes('CHARACTER')"));await e("document.querySelector('#ca-close').click()");
 });
}
