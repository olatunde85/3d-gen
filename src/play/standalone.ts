import {parseStory} from './story';
/** Small independent entry: no generator, catalogue, worker, editor or remote asset service. */
import './style.css';
import {GameScene} from './scene';
import {loadGameCast,type GameManifest} from './game-bundle';
import {mountPlayer} from './player';
import {parseIdentity,chapterSettings,chapterBase,arcadeSettings,MAX_CHAPTERS,type PlayProject} from './project';
import {parseMission,validateMissionEquipment} from './mission';
import {parseCamera,parseMusic} from './presentation';
import {parseProgression} from './progression';
import {parseDriving} from './driving';
import {parseLoadout} from './combat';
import {finishLoading,paintLoading} from './loading';
import {applyTheme,parseTheme} from './theme';
import {applyHowToPlay,gameNameOf} from './customize';
async function init(){
 const label=document.getElementById('load-label')!,note=document.getElementById('load-note')!,button=document.getElementById('start')as HTMLButtonElement;
 try{
  if(location.protocol==='file:')throw Error('Serve this folder locally or upload it to a static host. See README.txt for the two-step setup.');
  const base=new URL('./',location.href),read=async(name:string)=>{const r=await fetch(new URL(name,base),{cache:'no-store'});if(!r.ok)throw Error(`Missing ${name}. Keep all game files together.`);return r.json();};
  const [raw,manifest]=await Promise.all([read('project.json'),read('manifest.json')])as [PlayProject,GameManifest];
  if(raw.kind!=='ara-play'||raw.version!==2||raw.template!=='escape-depot'||!Array.isArray(raw.enemies)||raw.enemies.length<1||raw.enemies.length>5)throw Error('The game setup is not supported.');
  const readSettings=(p:PlayProject)=>{const next={...p,...arcadeSettings(p,p.enemies.map(e=>e.id)),...(p.story?{story:parseStory(p.story,p.enemies.map(e=>e.id))}:{}),identity:parseIdentity(p.identity),mission:parseMission(p.mission),camera:parseCamera(p.camera),music:parseMusic(p.music),progression:parseProgression(p.progression),loadout:parseLoadout(p.loadout),vehicle:parseDriving(p.vehicle)};validateMissionEquipment(next.mission,next.loadout,next.progression);if(!Array.isArray(next.enemies)||next.enemies.length<1||next.enemies.length>5)throw Error('Choose a supported chapter cast.');return next;};
  if(raw.theme!==undefined)applyTheme(parseTheme(raw.theme));
  paintLoading(raw);
  const project=readSettings(raw);
  if(raw.chapters!==undefined){if(!Array.isArray(raw.chapters)||raw.chapters.length<1||raw.chapters.length>=MAX_CHAPTERS)throw Error('Choose a supported campaign.');const ids=new Set(['chapter-1']);project.chapters=raw.chapters.map(c=>{if(!c||typeof c.id!=='string'||!/^[a-zA-Z0-9_-]{1,50}$/.test(c.id)||ids.has(c.id))throw Error('Use unique chapter IDs.');ids.add(c.id);if(c.mission.lives!==project.mission.lives)throw Error('Campaign lives must be shared across chapters.');return chapterSettings(readSettings({...chapterBase(raw,c),...c,character:raw.character}),c.id);});}
  const name=gameNameOf(raw);document.title=name;document.getElementById('game-name')!.textContent=name;applyHowToPlay(typeof raw.howToPlay==='string'?raw.howToPlay:undefined);document.getElementById('brief-title')!.textContent=project.identity.title;if(project.identity.briefing)document.getElementById('brief-story')!.textContent=project.identity.briefing;
  const scene=new GameScene(document.getElementById('game')as HTMLCanvasElement),cast=await loadGameCast(manifest,project,base,text=>note.textContent=text),player=mountPlayer(scene,project,cast);finishLoading();
  document.getElementById('game-name')!.textContent=gameNameOf(raw);
  if(new URLSearchParams(location.hash.slice(1)).has('demo'))Object.defineProperty(window,'araPlay',{get:()=>player.state});
 }catch(error){document.getElementById('brief')?.setAttribute('data-ready','');label.textContent='Unable to load game';note.textContent=(error as Error).message;button.disabled=false;button.onclick=()=>location.reload();}
}
void init();
