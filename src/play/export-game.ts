import {missionContract} from './staging';
import {storyMedia,mediaPath} from './story';
import {getMedia} from './media';
import {locationMap} from './locations';
import {gameEffects} from './audio';
import {soundEffectById} from '../studio/audio/effects-catalog';
import {zip,strToU8,type Zippable} from 'fflate';
import type {AssetLibrary} from '../core/assets';
import type {Character} from '../core/human';
import {castsCompanion,heroGuns,gameStem,gameProjects,type PlayProject} from './project';
import type {PlayCast} from './cast';
import {usesPickup} from './mission';
import {MUSIC_TRACKS} from './presentation';
import type {GameManifest} from './game-bundle';
interface RuntimePackage {version:1;html:string;files:string[];notices:string}
export interface GameDownload {name:string;data:Uint8Array;mime:'application/zip'}
export {gameStem} from './project';
const abort=()=>new DOMException('Game download cancelled.','AbortError');
const digest=async(data:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',Uint8Array.from(data).buffer)),b=>b.toString(16).padStart(2,'0')).join('');
function cancellable<T>(pending:Promise<T>,signal:AbortSignal):Promise<T>{
 signal.throwIfAborted();return new Promise((resolve,reject)=>{const cancel=()=>reject(abort());signal.addEventListener('abort',cancel,{once:true});pending.then(value=>{signal.removeEventListener('abort',cancel);if(!signal.aborted)resolve(value);},error=>{signal.removeEventListener('abort',cancel);reject(error);});});
}
async function pack(character:Character,signal:AbortSignal):Promise<Uint8Array>{
 signal.throwIfAborted();const worker=new Worker(new URL('./character-pack-worker.ts',import.meta.url),{type:'module'});
 return new Promise((resolve,reject)=>{
  const cancel=()=>finish(undefined,abort()),finish=(data?:Uint8Array,error?:Error)=>{worker.terminate();signal.removeEventListener('abort',cancel);if(error)reject(error);else resolve(data!);};
  signal.addEventListener('abort',cancel,{once:true});worker.onerror=e=>finish(undefined,Error(e.message||'Character packaging failed.'));worker.onmessage=(e:MessageEvent<{data?:Uint8Array;error?:string}>)=>finish(e.data.data,e.data.error?Error(e.data.error):undefined);
  // Copying into the worker preserves every live preview buffer. Never transfer the actor's mesh.
  worker.postMessage({params:character.params,mesh:character.mesh,rig:character.rig,height:character.height,face:character.face});
 });
}
async function archive(files:Zippable,signal:AbortSignal):Promise<Uint8Array>{
 signal.throwIfAborted();return new Promise((resolve,reject)=>{
  const cancel=()=>{terminate();reject(abort());},terminate=zip(files,{level:6},(error,data)=>{signal.removeEventListener('abort',cancel);if(error)reject(error);else resolve(data);});signal.addEventListener('abort',cancel,{once:true});
 });
}
export async function exportGame(project:PlayProject,cast:PlayCast,lib:AssetLibrary,signal:AbortSignal,progress:(text:string,fraction:number)=>void):Promise<GameDownload>{
 const base=new URL(import.meta.env.BASE_URL,location.href),files:Zippable={};
 const read=async(path:string)=>{signal.throwIfAborted();const r=await fetch(new URL(path,base),{signal,cache:'no-store'});if(!r.ok)throw Error(`Could not load ${path}. Please try again.`);return new Uint8Array(await r.arrayBuffer());};
 progress('Preparing the independent game player…',.02);const runtime=JSON.parse(new TextDecoder().decode(await read('play-runtime/runtime.json')))as RuntimePackage;
 if(runtime.version!==1||!Array.isArray(runtime.files)||runtime.files.some(f=>!/^player-[a-zA-Z0-9_-]+\.(js|css)$/.test(f)))throw Error('This game player needs a fresh build. Please reload Ara Play.');
 for(const file of runtime.files)files[file]=await read('play-runtime/'+file);
 files['index.html']=strToU8(runtime.html);files['LICENSES.txt']=strToU8(runtime.notices);files['project.json']=strToU8(JSON.stringify(project,null,2));
 let mediaBytes=0;for(const ref of storyMedia(project)){signal.throwIfAborted();const blob=await getMedia(ref.id);if(!blob)throw Error(`Reattach “${ref.name}” before downloading the game.`);mediaBytes+=blob.size;if(mediaBytes>127*1024*1024)throw Error('Keep attached story media below 127 MiB per game.');files[mediaPath(ref)]=[new Uint8Array(await blob.arrayBuffer()),{level:0}];}
 const chapterGames=gameProjects(project),castList=[cast,...(cast.chapters??[])];if(chapterGames.length!==castList.length)throw Error('Prepare every chapter before downloading.');
 const castRoles=chapterGames.map((p,i)=>{const c=castList[i];return [{role:'player' as const,id:'player',actor:c.hero},...(heroGuns(project).length>1?heroGuns(project).map(gun=>({role:'player-weapon' as const,id:gun,actor:c.heroWeapons!.get(gun)!})):[]),...p.enemies.map(e=>({role:'enemy' as const,id:e.id,actor:c.guards.get(e.id)!})),...(castsCompanion(p)?[{role:'companion' as const,id:'companion',actor:c.companion!}]:[])];});
 const roles=castRoles.flat();
 if(roles.some(r=>!r.actor))throw Error('Prepare every character before downloading the game.');
 const unique=new Map<string,Character>();for(const r of roles)unique.set(JSON.stringify(r.actor.render.character.params),r.actor.render.character);
 const names=new Set<string>();for(const ch of unique.values())for(const m of ch.mesh.materials)for(const name of [m.map,m.normalMap,m.roughnessMap])if(name)names.add(name);
 const texturePaths=new Map<string,string>();let count=0;
 for(const name of names){
  signal.throwIfAborted();progress(`Packing texture ${++count} of ${names.size}…`,.1+.25*count/Math.max(1,names.size));const data=await cancellable(lib.texture(name),signal);signal.throwIfAborted();const hash=await digest(data),ext=/\.(png|jpe?g|webp)$/i.exec(name)?.[1].toLowerCase()??'png',path=`textures/${hash}.${ext}`;texturePaths.set(name,path);files[path]=[data,{level:0}];
 }
 const assets=new Map<string,string>();count=0;
 for(const [recipe,ch]of unique){
  signal.throwIfAborted();progress(`Packing character ${count+1} of ${unique.size}…`,.4+.35*count/unique.size);
  const character={...ch,mesh:{...ch.mesh,materials:ch.mesh.materials.map(m=>({...m,...(m.map?{map:texturePaths.get(m.map)}:{}),...(m.normalMap?{normalMap:texturePaths.get(m.normalMap)}:{}),...(m.roughnessMap?{roughnessMap:texturePaths.get(m.roughnessMap)}:{})}))}},data=await pack(character,signal),path=`characters/${await digest(data)}.pack`;
  count++;files[path]=[data,{level:0}];assets.set(recipe,path);
 }
 const manifest:GameManifest={kind:'ara-play-game',version:1,actors:castRoles[0].map(r=>({role:r.role,id:r.id,asset:assets.get(JSON.stringify(r.actor.render.character.params))!})),...(project.chapters?.length?{chapters:project.chapters.map((c,i)=>({id:c.id,actors:castRoles[i+1].map(r=>({role:r.role,id:r.id,asset:assets.get(JSON.stringify(r.actor.render.character.params))!}))}))}:{})};files['staging.json']=strToU8(JSON.stringify(chapterGames.map(p=>missionContract(p)),null,2));files['locations.json']=strToU8(JSON.stringify([...new Set(chapterGames.map(p=>p.mission.location??'depot'))].map(id=>locationMap(id)),null,2));files['manifest.json']=strToU8(JSON.stringify(manifest,null,2));
 progress('Adding the selected soundtrack and sound effects…',.8);
 let credits='Recorded media retains its original licensing and ownership.\n';
 for(const id of new Set(chapterGames.map(p=>p.music.track))){const track=MUSIC_TRACKS.find(t=>t.id===id);if(track?.file){files[`media/music/${track.file}`]=[await read(`media/music/${track.file}`),{level:0}];credits+=`\n${track.name}\nArtist: ${track.artist}\nOriginal: ${track.source}\n`;}}
 for(const id of gameEffects(project)){const effect=soundEffectById(id)!;files[`media/effects/${effect.file}`]=[await read(`media/effects/${effect.file}`),{level:0}];files['SOUND-CREDITS.txt']=await read('media/effects/CREDITS.txt');}
 if(chapterGames.some(p=>usesPickup(p.mission)||p.mission.pursuit)){files['media/effects/car-engine.mp3']=[await read('media/effects/car-engine.mp3'),{level:0}];files['SOUND-CREDITS.txt']=await read('media/effects/CREDITS.txt');}
 files['MEDIA-CREDITS.txt']=strToU8(credits);
 files['README.txt']=strToU8(`${project.identity.title}\n${'='.repeat(project.identity.title.length)}\n\nRUN LOCALLY\n1. Unzip this archive into a folder. Open a terminal in that folder.\n2. Run: python3 -m http.server 8080\n   Then visit: http://localhost:8080\n\nNo internet connection, npm install, Ara editor or asset server is needed.\nA local HTTP server is required; opening index.html directly as a file will not load game assets.\n\nPUBLISH\nUpload this folder's contents to any static web host. Keep index.html, project.json, manifest.json and all asset folders together. Subfolders are supported.\n\nPLAY\nWASD / arrows: move. Shift: run. C: crouch/stand. E: interact/rescue/wait/follow. Space: jump/traverse.\nExtra objectives: secure the purple briefcase/package marker with E / Interact before extraction.\nDriving courses: follow every gold road checkpoint in order, then enter the green vehicle-sized extraction area and slow to walking pace.\nCampaigns: Next mission opens the next briefing. The hero, remaining lives and unlocked pistol carry over; health and ammo use each chapter configuration.\nPickup: W/S accelerate/reverse; A/D steer; Space brakes. Stop, then E to alight/board.\nTouch: joystick drives and steers; Brake stops. Parked pickups stay in the world. With Agile movement, Jump climbs the front hood or rear tailgate. Rear entry lands inside the bed; move toward the cab and Jump again to climb onto its roof. Walk across or drop into the bed. Come down before boarding. Crouch lowers sight and hit geometry while aiming/reloading remain available.\nRescue + pickup: lead your following companion to the truck, then board at the driver door. Driving waits for their passenger entry. Stop to alight together. Clear + pickup: defeat the squad to unlock the truck.\nPistol: Q toggles aim; F fires; R reloads. Right mouse aims; left mouse fires while aiming.\nGrenades: G aims; point at the ground, then F / click to throw. Escape cancels aim.\nOn touch screens: Grenades, drag to aim, then Throw. Blasts can hurt you and your companion.\nV / Shift+V: switch allowed camera views. Drag: rotate/tilt; wheel: zoom when allowed. Escape: pause.\nPhones/tablets: thumbstick and action buttons. Header camera and sound buttons switch view and mute audio.\n\nEDIT AGAIN\nOpen project.json with Ara Play's Open setup .json button to edit or regenerate the game. The download contains generated character assets, not the complete character-building library. Re-export after changing a character recipe.\nSingle missions start fresh on reload. Campaigns save the latest unlocked chapter, remaining lives and previous weapon unlocks in this browser; in-mission checkpoints reset on reload. Use Restart campaign for a fresh sequence.\n\nLICENCES\nSee LICENSES.txt, MEDIA-CREDITS.txt and SOUND-CREDITS.txt (when included).\n`);
 progress('Creating your game ZIP…',.92);const data=await archive(files,signal);signal.throwIfAborted();progress('Game ZIP ready.',1);return {name:gameStem(project.identity.title)+'.ara-game.zip',data,mime:'application/zip'};
}
