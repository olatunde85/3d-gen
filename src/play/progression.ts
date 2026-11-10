import type {Gun} from './weapons';
/** Small mission choices, deterministic ground supplies and a checkpoint-safe reward ledger. */
import {missionObstacles,type MissionWorld} from './mission';
import {blocked,clearPath,distance,route,type Point} from './world';
export interface ProgressionSettings {
 weapon:'loadout'|'pickup'|'objective';
 unlock?:Gun;reward?:Gun;
 supplies:'scarce'|'balanced'|'plentiful';
 scoring:'off'|'objectives'|'action';
}
export const defaultProgression=():ProgressionSettings=>({weapon:'loadout',supplies:'balanced',scoring:'objectives'});
export function parseProgression(raw:unknown):ProgressionSettings {
 if(raw===undefined)return defaultProgression();
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Use valid progression settings.');
 const p=raw as Record<string,unknown>;
 for(const key of Object.keys(p))if(!['weapon','reward','unlock','supplies','scoring'].includes(key))throw Error(`Unsupported progression setting: ${key}.`);
 if(p.reward!==undefined&&p.reward!=='pistol'&&p.reward!=='rifle')throw Error('Choose a pistol or rifle completion reward.');
 if(p.unlock!==undefined&&p.unlock!=='pistol'&&p.unlock!=='rifle')throw Error('Choose a pistol or rifle unlock.');
 const result={...defaultProgression(),...p};
 if(!['loadout','pickup','objective'].includes(result.weapon as string))throw Error('Choose starting equipment, Find a pistol or Objective unlock.');
 if(!['scarce','balanced','plentiful'].includes(result.supplies as string))throw Error('Choose Scarce, Balanced or Plentiful supplies.');
 if(!['off','objectives','action'].includes(result.scoring as string))throw Error('Choose Off, Objectives or Action scoring.');
 return result as ProgressionSettings;
}
export interface Pickup extends Point {id:string;kind:'health'|'ammo'|Gun}
export interface Reward {id:string;label:string;kind:'objective'|'combat'|'bonus';points:number}
export const HEALTH_PACK=25,AMMO_PACK=24,MAX_RESERVE=144;

/** Check clearance, objective spacing and a ground route through the open gate before placing anything. */
export function placePickups(world:MissionWorld,settings:ProgressionSettings):Pickup[] {
 const open=missionObstacles(world,1),closed=missionObstacles(world,world.story==='escape'?0:1),result:Pickup[]=[];
 const protectedPoints=[world.start,world.key,world.exit,world.rescue.captive,...Object.values(world.checkpoints),...(world.cargo?[world.cargo.position]:[])];
 const safe=(p:Point)=>(!world.getaway||!blocked(p,.85,[world.getaway.reserve]))&&!blocked(p,.85,open)&&protectedPoints.every(q=>distance(p,q)>1.9)&&result.every(q=>distance(p,q)>2.1);
 if(settings.weapon==='pickup'){
  const pistol=[{x:world.start.x,z:world.start.z-2.6},{x:world.start.x+1.5,z:world.start.z-2.6},{x:world.start.x-1.5,z:world.start.z-2.6}].find(p=>safe(p)&&clearPath(world.start,p,closed,.52));
  if(!pistol)throw Error('This mission needs an accessible weapon pickup before the gate.');
  result.push({...pistol,id:'supply-'+(settings.unlock??'pistol'),kind:settings.unlock??'pistol'});
 }
 const candidates:Point[]=[];
 // Alternate yards, keeping an early supply on each side and others beyond the gate.
 for(const z of world.supplyRows)for(const x of [world.start.x,-world.start.x,...world.supplyLanes])candidates.push({x,z});
 const count={scarce:2,balanced:4,plentiful:6}[settings.supplies];
 for(let i=0;i<count;i++){
  const eligible=(p:Point)=>safe(p)&&route(world.start,p,open,.52,world.bounds).length>0;
  const preferred=candidates.findIndex(p=>p.z===world.supplyRows[i]&&eligible(p));
  const index=preferred>=0?preferred:candidates.findIndex(eligible);
  if(index<0)throw Error('This mission needs more clear ground for supplies.');
  const p=candidates.splice(index,1)[0];result.push({...p,id:`supply-${i}`,kind:i%2===0?'health':'ammo'});
 }
 return result;
}
