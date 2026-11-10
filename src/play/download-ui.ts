import type {AssetLibrary} from '../core/assets';
import type {PlayProject} from './project';
import type {PlayCast} from './cast';
interface DownloadHost {project:()=>PlayProject;library:()=>AssetLibrary;prepare:(project:PlayProject,progress:(text:string)=>void)=>Promise<{cast:PlayCast;dispose:()=>void}>;busy:(value:boolean)=>void;stopPreview:()=>void}
export function setupGameDownload(host:DownloadHost){
 const button=document.getElementById('download-game')as HTMLButtonElement,dialog=document.getElementById('export-progress')as HTMLDialogElement,fields=document.getElementById('setup-fields')as HTMLFieldSetElement,meter=document.getElementById('export-meter')as HTMLProgressElement,status=document.getElementById('export-status')!,cancel=document.getElementById('cancel-export')as HTMLButtonElement,again=document.getElementById('save-game-again')as HTMLAnchorElement;
 let controller:AbortController|undefined,url='',working=false;
 const close=()=>{if(working)controller?.abort();else dialog.close();};cancel.onclick=close;dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 dialog.addEventListener('close',()=>{if(url){const old=url;url='';setTimeout(()=>URL.revokeObjectURL(old),30_000);}});
 button.onclick=async()=>{
  if(working)return;let prepared:Awaited<ReturnType<DownloadHost['prepare']>>|undefined;
  try{
   const project=host.project(),task=new AbortController();controller=task;working=true;host.busy(true);host.stopPreview();fields.disabled=true;again.hidden=true;document.getElementById('export-help')!.hidden=true;document.getElementById('export-heading')!.textContent='Preparing your game';meter.value=0;cancel.textContent='Cancel';status.textContent='Preparing the cast…';dialog.showModal();
   prepared=await new Promise<Awaited<ReturnType<DownloadHost['prepare']>>>((resolve,reject)=>{
    const abort=()=>reject(new DOMException('Game download cancelled.','AbortError'));task.signal.addEventListener('abort',abort,{once:true});
    void host.prepare(project,text=>{if(!task.signal.aborted)status.textContent=text;}).then(result=>{task.signal.removeEventListener('abort',abort);if(task.signal.aborted)result.dispose();else resolve(result);},error=>{task.signal.removeEventListener('abort',abort);reject(error);});
   });task.signal.throwIfAborted();
   const {exportGame}=await import('./export-game');const file=await exportGame(project,prepared.cast,host.library(),task.signal,(text,fraction)=>{status.textContent=text;meter.value=fraction;});
   url=URL.createObjectURL(new Blob([file.data as BlobPart],{type:file.mime}));again.href=url;again.download=file.name;again.hidden=false;document.getElementById('export-help')!.hidden=false;document.getElementById('export-heading')!.textContent='Your game is ready';status.textContent=`${file.name} · ${(file.data.byteLength/1024/1024).toFixed(1)} MB`;cancel.textContent='Done';again.click();
  }catch(error){
   if((error as Error).name==='AbortError'){status.textContent='Download cancelled. Your current game is unchanged.';dialog.close();}
   else{if(!dialog.open)dialog.showModal();document.getElementById('export-heading')!.textContent='Could not prepare the game';status.textContent=(error as Error).message;cancel.textContent='Close';}
  }finally{prepared?.dispose();working=false;host.busy(false);fields.disabled=false;}
 };
}
