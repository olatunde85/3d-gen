/** A categorized horizontal thumbnail strip and an enlarged location viewer. */
export interface ReferenceChoice {id:string;name:string;category?:string;thumbnail?:string;preview?:string;description?:string;tags?:string}
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function referencePickerMarkup(id:string,label:string,choices:ReferenceChoice[]){
 const categories=[...new Set(choices.map(c=>c.category??'Locations'))];
 return '<div class="ai-reference-picker" data-r="reference-picker" aria-labelledby="'+id+'-reference-label"><span class="ai-reference-label" id="'+id+'-reference-label">'+escape(label)+'</span><input type="hidden" id="'+id+'-reference" data-r="reference">'+
  '<div class="ai-reference-selection"><button type="button" data-r="reference-expand" class="ai-reference-expand" aria-label="Expand selected location preview" aria-haspopup="dialog" hidden><img data-r="reference-preview" width="96" height="60" alt="" decoding="async"></button><div><span class="ai-reference-selected-label">Selected location</span><strong data-r="reference-name" aria-live="polite"></strong></div></div>'+
  '<p class="ai-reference-description" data-r="reference-description"></p>'+
  '<div class="ai-reference-filters"><label class="sr-only" for="'+id+'-location-search">Search locations</label><input type="search" id="'+id+'-location-search" data-r="reference-search" placeholder="Search '+choices.length+' locations…" autocomplete="off">'+
  '<label class="sr-only" for="'+id+'-location-category">Location category</label><select id="'+id+'-location-category" data-r="reference-category"><option value="">All categories</option>'+categories.map(c=>'<option>'+escape(c)+'</option>').join('')+'</select></div>'+
  '<div class="ai-reference-strip-heading"><span>Scroll to browse · Click to expand</span><div><button type="button" data-r="reference-previous" aria-label="Scroll to previous locations">←</button><button type="button" data-r="reference-next" aria-label="Scroll to next locations">→</button></div></div>'+
  '<div class="ai-reference-gallery" id="'+id+'-location-gallery" data-r="reference-gallery" role="region" aria-label="Location thumbnails" tabindex="0">'+choices.map(c=>
   '<button type="button" class="ai-reference-card" data-reference-choice="'+escape(c.id)+'" aria-pressed="false" aria-haspopup="dialog" aria-controls="'+id+'-location-preview" title="Expand '+escape(c.name)+'">'+(c.thumbnail?'<img src="'+escape(c.thumbnail)+'" width="240" height="150" loading="lazy" decoding="async" alt="">':'')+'<span class="ai-reference-card-category">'+escape(c.category??'Locations')+'</span><span class="ai-reference-card-name">'+escape(c.name)+'</span><span class="ai-reference-tick" aria-hidden="true">✓</span></button>'
  ).join('')+'</div><p class="ai-note" data-r="reference-empty" hidden>No matching locations. Try another search or category.</p><p class="ai-reference-count" data-r="reference-count" role="status"></p>'+
  '<dialog class="ai-location-preview" id="'+id+'-location-preview" data-r="reference-viewer" aria-labelledby="'+id+'-location-preview-title"><div class="ai-location-preview-top"><div><span data-r="reference-viewer-category"></span><h2 id="'+id+'-location-preview-title" data-r="reference-viewer-title"></h2></div><button type="button" data-r="reference-viewer-close" aria-label="Close location preview">✕</button></div><img data-r="reference-viewer-image" width="960" height="600" decoding="async" alt=""><p data-r="reference-viewer-description"></p><button type="button" class="ai-btn ai-primary ai-wide" data-r="reference-viewer-use">Use this location</button></dialog></div>';
}
export function setupReferencePicker(selection:HTMLInputElement,choices:ReferenceChoice[]){
 const root=selection.closest<HTMLElement>('[data-r=reference-picker]')!,get=<T extends HTMLElement>(name:string)=>root.querySelector<T>('[data-r='+name+']')!;
 const image=get<HTMLImageElement>('reference-preview'),expand=get<HTMLButtonElement>('reference-expand'),description=get<HTMLParagraphElement>('reference-description'),search=get<HTMLInputElement>('reference-search'),category=get<HTMLSelectElement>('reference-category'),gallery=get<HTMLDivElement>('reference-gallery'),viewer=get<HTMLDialogElement>('reference-viewer');
 const buttons=[...root.querySelectorAll<HTMLButtonElement>('[data-reference-choice]')],byId=new Map(choices.map(c=>[c.id,c]));let previewed:ReferenceChoice|undefined;
 function render(){
  const selected=byId.get(selection.value);expand.hidden=!selected?.thumbnail;
  get('reference-name').textContent=selected?.name??'Choose a location';expand.setAttribute('aria-label','Expand '+(selected?.name??'selected location')+' preview');
  if(selected?.thumbnail&&image.getAttribute('src')!==selected.thumbnail)image.src=selected.thumbnail;
  description.textContent=selected?.description??'';
  const words=search.value.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().trim().split(/\s+/).filter(Boolean);let count=0;
  for(const button of buttons){const choice=byId.get(button.dataset.referenceChoice!)!,text=(choice.name+' '+choice.id+' '+(choice.category??'')+' '+(choice.tags??'')+' '+(choice.description??'')).normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
   button.hidden=!!category.value&&(choice.category??'Locations')!==category.value||!words.every(w=>text.includes(w));button.setAttribute('aria-pressed',String(choice.id===selection.value));if(!button.hidden)count++;
  }
  get('reference-empty').hidden=count>0;gallery.hidden=!count;get('reference-count').textContent=count+' of '+choices.length+' locations';
 }
 function openPreview(choice:ReferenceChoice|undefined){
  if(!choice||selection.disabled)return;previewed=choice;
  get('reference-viewer-title').textContent=choice.name;get('reference-viewer-category').textContent=choice.category??'Locations';get('reference-viewer-description').textContent=choice.description??'';
  const img=get<HTMLImageElement>('reference-viewer-image'),source=choice.preview??choice.thumbnail;img.hidden=!source;if(source)img.src=source;img.alt=choice.name+' set preview';viewer.showModal();
 }
 search.addEventListener('input',()=>{render();gallery.scrollLeft=0;});category.addEventListener('change',()=>{render();gallery.scrollLeft=0;});
 for(const button of buttons)button.addEventListener('click',()=>openPreview(byId.get(button.dataset.referenceChoice!)));
 expand.addEventListener('click',()=>openPreview(byId.get(selection.value)));
 get('reference-viewer-close').addEventListener('click',()=>viewer.close());
 // Consume Escape here so closing the image never dismisses the underlying Assist modal.
 viewer.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();viewer.close();}});
 viewer.addEventListener('cancel',event=>{event.preventDefault();event.stopPropagation();viewer.close();});
 get('reference-viewer-use').addEventListener('click',()=>{if(!previewed||selection.disabled)return;selection.value=previewed.id;selection.dispatchEvent(new Event('change',{bubbles:true}));viewer.close();});
 root.closest('dialog')!.addEventListener('close',()=>{if(viewer.open)viewer.close();});
 const scroll=(direction:number)=>gallery.scrollBy({left:direction*gallery.clientWidth*.8,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
 get('reference-previous').addEventListener('click',()=>scroll(-1));get('reference-next').addEventListener('click',()=>scroll(1));
 gallery.addEventListener('keydown',e=>{
  if(e.altKey||e.ctrlKey||e.metaKey||e.shiftKey)return;
  const visible=buttons.filter(b=>!b.hidden),at=visible.indexOf(document.activeElement as HTMLButtonElement);
  const next=e.key==='Home'?0:e.key==='End'?visible.length-1:e.key==='ArrowLeft'?Math.max(0,at-1):e.key==='ArrowRight'?Math.min(visible.length-1,at+1):undefined;
  if(next!==undefined){e.preventDefault();visible[next]?.focus();}
 });
 render();return render;
}
