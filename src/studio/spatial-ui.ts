/** A readable plan view plus portable evidence for the next conversation with an assistant. */
import {Vehicle} from '../core/props/vehicle';
import {VEHICLE_CLIP,type VehicleId} from '../core/props/vehicles';
import {clipById} from '../core/anim/clips';
import {boneFor} from '../core/rig/poses';
import {locationMap,locationMapFile} from './spatial-maps';
import {stagingReport,type SpatialBody,type StagingReport} from './spatial-report';
import type {StudioActor} from './actor';
import type {StudioProject} from './project';
import {sceneById} from './catalog';
import type {Rect,VehicleEnvelope} from './spatial-types';
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function fittedSpatialBodies(actors:ReadonlyMap<string,StudioActor>){
 return new Map([...actors].map(([id,actor])=>{
  const envelopes=new Map<string,VehicleEnvelope>(),body:SpatialBody={...actor.vehicleBody,height:actor.height,
   envelope:model=>{
    if(!envelopes.has(model)){const vehicle=new Vehicle(model as VehicleId,actor.character.rig!,actor.animator,clipById.get(VEHICLE_CLIP[model as VehicleId])!,actor.character.params.vehicleStyle),box=vehicle.bounds;
     for(let i=0;i<=24;i++){vehicle.update(vehicle.clip.duration*i/24);box.union(vehicle.bounds);}envelopes.set(model,{bounds:[box.min.x,box.min.z,box.max.x,box.max.z],bottom:box.min.y,top:box.max.y});vehicle.dispose();}
    return envelopes.get(model);
   },
   boardingPoint:(project,track,time)=>{
    const frame=actor.frame(project,time,track),rig=actor.character.rig!,i=rig.bones.findIndex(b=>b.name===boneFor(rig.type,'Hips')),p=frame.rootPos.get(i);
    return p?{x:p[0]-rig.bones[i].head[0],z:p[2]-rig.bones[i].head[2]}:{x:0,z:0};
   }};
  return [id,body]as const;
 }));
}
export function setupSpatialReview(editor:{project():StudioProject;actors():ReadonlyMap<string,StudioActor>;canOpen():boolean;pause():void;seek(time:number):void;download(blob:Blob,name:string):void}){
 const dialog=document.createElement('dialog');dialog.id='staging-dialog';dialog.className='staging-dialog';dialog.setAttribute('aria-labelledby','staging-title');document.body.append(dialog);
 let report:StagingReport|undefined,project:StudioProject,full=false;
 const save=(data:unknown,name:string)=>editor.download(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),name);
 const draw=()=>{
  const map=locationMap(project.template),bounds:Rect=full?map.bounds:map.bounds[2]-map.bounds[0]>60?[-24,-30,24,25]:map.bounds,[x0,z0,x1,z1]=bounds,w=x1-x0,h=z1-z0;
  const rect=(r:Rect,color:string,opacity=1)=>`<rect x="${r[0]}" y="${r[1]}" width="${r[2]-r[0]}" height="${r[3]-r[1]}" fill="${color}" opacity="${opacity}"/>`;
  const size=Math.min(w,h)/100;
  dialog.querySelector('#staging-map')!.innerHTML=`<svg viewBox="${x0} ${z0} ${w} ${h}" role="img" aria-label="Top-down location map, positive X to the right, negative Z at the top"><title>${escape(sceneById.get(project.template)!.name)}: land, water, obstacles, seats and actor paths</title><defs><marker id="staging-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#edbd7e"/></marker></defs>${rect(map.bounds,'#8b917c')}${map.water.map(r=>rect(r,'#426d80')).join('')}${map.regions.map(r=>rect(r.bounds,r.kind==='dock'?'#ba9874':r.kind==='road'?'#525e63':'#aea68f')).join('')}${map.obstacles.filter(o=>o.bottom<3).map(o=>rect(o.bounds,'#28333a',.85)).join('')}${map.seats.map(s=>`<circle cx="${s.x}" cy="${s.z}" r="${size*.55}" fill="#d6c9f6"/>`).join('')}${report!.transitions.map(s=>`<g><title>${escape(s.entity)} · ${s.start}–${s.end}s · ${escape(s.clip??'')}</title><line x1="${s.from.x}" y1="${s.from.z}" x2="${s.to.x}" y2="${s.to.z}" stroke="#edbd7e" stroke-width="${size*.45}" marker-end="url(#staging-arrow)"/><circle cx="${s.from.x}" cy="${s.from.z}" r="${size*.6}" fill="#f6d6a2"/></g>`).join('')}<line x1="0" y1="${z0}" x2="0" y2="${z1}" stroke="#ffffff" stroke-width="${size*.12}" opacity=".25"/><line x1="${x0}" y1="0" x2="${x1}" y2="0" stroke="#ffffff" stroke-width="${size*.12}" opacity=".25"/></svg>`;
  dialog.querySelector('#staging-zoom')!.textContent=full?'Show staging area':'View entire set';
 };
 document.getElementById('open-staging')!.addEventListener('click',async()=>{
  if(!editor.canOpen())return;editor.pause();project=structuredClone(editor.project());full=false;
  dialog.innerHTML='<h2 id="staging-title">Checking staging</h2><p role="status">Checking the complete film with your loaded characters…</p>';dialog.showModal();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  try{
   report=stagingReport(project,fittedSpatialBodies(editor.actors()));
   dialog.innerHTML=`<div class="staging-top"><div><span class="eyebrow">SPATIAL STAGING</span><h2 id="staging-title">${escape(sceneById.get(project.template)!.name)}</h2></div><button data-close aria-label="Close staging review">✕</button></div><p class="staging-summary" role="status">${report.issues.length?`${report.issues.length} staging finding${report.issues.length===1?'':'s'} to review`:'No terrain or static obstacle conflicts found in the checked envelopes.'}</p><div class="staging-grid"><section><div id="staging-map"></div><p class="staging-legend">Land · <span>water</span> · dark obstacles · lilac seats · gold paths<br>X → · −Z ↑ · metres · body and vehicle envelopes checked</p><button id="staging-zoom">View entire set</button></section><section class="staging-findings"><h3>Route review</h3>${report.issues.length?`<ul>${report.issues.slice(0,40).map((i,index)=>`<li><button data-issue="${index}">${escape(i.entity)} · ${i.start}–${i.end}s</button><p>${escape(i.message)}.</p></li>`).join('')}</ul>`:'<p>Review tight contacts and boarding visually before exporting.</p>'}${report.issues.length>40?'<p>Save the report for all findings.</p>':''}<details><summary>Transition coordinates and facing</summary><div class="staging-table"><table><thead><tr><th>Actor / action</th><th>Time</th><th>Start x,y,z / yaw</th><th>End x,y,z / yaw</th></tr></thead><tbody>${report.transitions.map(t=>`<tr><td>${escape(t.entity)}<br>${escape(t.clip??'')}</td><td>${t.start}–${t.end}s</td><td>${t.from.x}, ${t.from.y}, ${t.from.z} / ${t.from.yaw}°</td><td>${t.to.x}, ${t.to.y}, ${t.to.z} / ${t.to.yaw}°</td></tr>`).join('')}</tbody></table></div></details></section></div><div class="staging-actions"><button id="staging-save-map">Save location map .json</button><button id="staging-save-report">Save staging report .json</button></div><details class="staging-limits"><summary>What this checks</summary>${report.notes.map(n=>`<p>${escape(n)}</p>`).join('')}</details>`;
   draw();dialog.querySelector('[data-close]')!.addEventListener('click',()=>dialog.close());dialog.querySelector('#staging-zoom')!.addEventListener('click',()=>{full=!full;draw();});
   dialog.querySelector('#staging-save-map')!.addEventListener('click',()=>save(locationMapFile(project.template),`ara-studio-${project.template}-map.json`));
   dialog.querySelector('#staging-save-report')!.addEventListener('click',()=>save(report,'ara-studio-staging-report.json'));
   for(const el of dialog.querySelectorAll<HTMLElement>('[data-issue]'))el.addEventListener('click',()=>{const issue=report!.issues[Number(el.dataset.issue)];dialog.close();editor.seek(issue.start);});
  }catch(e){dialog.innerHTML=`<h2 id="staging-title">Staging check unavailable</h2><p>${escape((e as Error).message)}</p><button data-close>Close</button>`;dialog.querySelector('[data-close]')!.addEventListener('click',()=>dialog.close());}
 });
}
