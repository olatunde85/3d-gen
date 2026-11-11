import {parseSteps,type MissionStep} from './objectives';
import {parseSideQuests,type SideQuestId} from './side-quests';
import {floodlightAnchors,parseEnvironment,type EnvironmentSettings} from './environment';
/** Scenario rules resolve against independent, measured location contracts. */
import {isGun} from './weapons';
import {blocked,obstacles,route,clearPath,rectOf,type Block,type Point,type Rect} from './world';
import {locationDefinition,LOCATIONS,type LocationId} from './locations';
import {addDrivingCourse,type DriveDifficulty,type DrivingCourse} from './course';
import type {Loadout} from './combat';
import type {ProgressionSettings} from './progression';
export type EscapePlan='breakout'|'timed'|'quiet';
export type CoverLayout='balanced'|'open'|'dense';
export type Lives=1|3|5|'unlimited';
export interface MissionSettings {stealth?:boolean;steps?:MissionStep[];sideQuests?:SideQuestId[];difficulty?:'easy'|'normal'|'hard';parTime?:number;environment?:EnvironmentSettings;location?:LocationId;story:'escape'|'rescue'|'clear'|'getaway';extraction?:'foot'|'pickup'|'helicopter';overwatch?:boolean;pursuit?:boolean;cargo?:'none'|'briefcase'|'package';driveDifficulty?:DriveDifficulty;plan:EscapePlan;layout:CoverLayout;variation:number;movement:'agile'|'grounded';lives:Lives;checkpoints:'off'|'auto'}
export const defaultMission=():MissionSettings=>({story:'escape',plan:'breakout',layout:'balanced',variation:0,movement:'agile',lives:3,checkpoints:'auto'});
export const missionGoal=(m:MissionSettings)=>m.story==='getaway'?'escape':m.story;
export const extractionMode=(m:MissionSettings)=>m.extraction??(m.story==='getaway'?'pickup':'foot');
export const usesPickup=(m:MissionSettings)=>extractionMode(m)==='pickup';
export const missionTimeLimit=(m:MissionSettings)=>90+(m.steps?.reduce((n,s)=>n+(s.duration??(s.type==='defend'?60:s.type==='download'?8:25)),0)??0)+(m.cargo&&m.cargo!=='none'?30:0)+(usesPickup(m)?m.driveDifficulty==='hard'?90:m.driveDifficulty==='standard'?45:0:0);
export const PLANS={breakout:{name:'Standard',description:'Find the key, open the gate and outwit the guard.'},timed:{name:'Against the clock',description:'Complete the mission within 90 seconds.'},quiet:{name:'Leave no trace',description:'Find a route out without raising the alarm.'}}as const;
export interface SpawnPoint extends Point {yaw:number}
export type CheckpointStage='key'|'gate'|'rescue'|'clear'|'vehicle'|'cargo'|'route';
export interface MissionWorld {id:string;location:LocationId;name:string;bounds:Rect;gate:Point;gateWidth:number;gateClearance:number;cargo?:{kind:'briefcase'|'package';position:Point};getaway?:{pickup:SpawnPoint;route:SpawnPoint[];reserve:Rect;course?:DrivingCourse};helipad?:SpawnPoint;sniperSpawns:(SpawnPoint&{y:number})[];enemySpawns:Point[];supplyRows:number[];supplyLanes:number[];story:MissionSettings['story'];blocks:Block[];start:Point;key:Point;exit:Point;patrol:Point[];guard:Point;rescue:{captive:SpawnPoint;approach:SpawnPoint};checkpoints:Record<CheckpointStage,SpawnPoint>}
export function parseMission(raw:unknown):MissionSettings {
 if(raw===undefined)return defaultMission();if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Use a valid mission setup.');const m=raw as Record<string,unknown>;
 for(const key of Object.keys(m))if(!['stealth','overwatch','pursuit','steps','sideQuests','difficulty','parTime','environment','location','story','extraction','cargo','driveDifficulty','plan','layout','variation','movement','lives','checkpoints'].includes(key))throw Error(`Unsupported mission setting: ${key}.`);
 if(m.location!==undefined&&!LOCATIONS.some(l=>l.id===m.location))throw Error(`Choose ${LOCATIONS.map(l=>l.name).join(' or ')}.`);
 if(m.story!==undefined&&!['escape','rescue','clear','getaway'].includes(m.story as string))throw Error('Choose Escape, Rescue and escape Clear and extract or Getaway.');
 if(m.extraction!==undefined&&!['foot','pickup','helicopter'].includes(m.extraction as string))throw Error('Choose On foot or Pickup extraction.');
 if(m.story==='getaway'&&m.extraction==='foot')throw Error('Getaway requires pickup extraction; use Escape for on-foot missions.');
 if(m.cargo!==undefined&&!['none','briefcase','package'].includes(m.cargo as string))throw Error('Choose no extra objective, a briefcase or a package.');
 if(m.driveDifficulty!==undefined&&!['easy','standard','hard'].includes(m.driveDifficulty as string))throw Error('Choose Easy, Standard or Hard driving route.');
 if(m.lives!==undefined&&![1,3,5,'unlimited'].includes(m.lives as Lives))throw Error('Choose 1, 3, 5 or unlimited lives.');
 if(m.checkpoints!==undefined&&m.checkpoints!=='off'&&m.checkpoints!=='auto')throw Error('Choose automatic checkpoints or Off.');
 if(m.difficulty!==undefined&&!['easy','normal','hard'].includes(String(m.difficulty)))throw Error('Choose Easy, Normal or Hard difficulty.');if(m.parTime!==undefined&&(!Number.isFinite(m.parTime)||Number(m.parTime)<15||Number(m.parTime)>1800))throw Error('Par time must be 15–1800 seconds.');
 for(const key of ['stealth','overwatch','pursuit'])if(m[key]!==undefined&&typeof m[key]!=='boolean')throw Error('Support options must be true or false.');
 const result={...defaultMission(),...m,...(m.steps===undefined?{}:{steps:parseSteps(m.steps)}),...(m.sideQuests===undefined?{}:{sideQuests:parseSideQuests(m.sideQuests)}),...(m.environment===undefined?{}:{environment:parseEnvironment(m.environment)})};if(!Object.hasOwn(PLANS,String(result.plan)))throw Error('Choose a supported mission style.');if(!['balanced','open','dense'].includes(String(result.layout)))throw Error('Choose a supported cover layout.');if(!['agile','grounded'].includes(String(result.movement)))throw Error('Choose Agile or Grounded movement.');if(!Number.isInteger(result.variation)||Number(result.variation)<0||Number(result.variation)>11)throw Error('Choose a map variation from 0 to 11.');
 if((result.sideQuests as SideQuestId[]|undefined)?.includes('street-race')&&!usesPickup(result as MissionSettings))throw Error('sideQuests.street-race: choose pickup extraction.');
 if((result.story==='clear'||usesPickup(result as MissionSettings))&&result.plan==='quiet')throw Error('Combat and pickup extraction support Standard or Against the clock; Leave no trace requires silent on-foot extraction.');
 return result as MissionSettings;
}
/** Reject circular weapon unlocks and missions that provide no way to defeat an enemy. */
export function validateMissionEquipment(mission:MissionSettings,loadout:Loadout,progression:ProgressionSettings){
 if(mission.steps?.some(s=>s.type==='eliminate'||s.type==='survive')&&(progression.weapon==='objective'||progression.weapon==='loadout'&&!isGun(loadout.weapon)))throw Error('Combat chains need a starting firearm or a findable firearm.');
 if(mission.steps?.length||mission.story!=='clear')return;
 if(mission.plan==='quiet')throw Error('Clear and extract cannot use Leave no trace.');
 if(progression.weapon==='objective')throw Error('Clear and extract needs a starting firearm or Find a firearm; an objective unlock would arrive too late.');
 if(progression.weapon==='loadout'&&!isGun(loadout.weapon))throw Error('Clear and extract needs a starting firearm or Find a firearm.');
}
export const missionObstacles=(world:MissionWorld,door:number)=>obstacles(door,world.blocks,world.gate,world.gateWidth);
/** Deterministic variants retain ground routes, clear spawn margins and separated objectives. */
export function createMission(settings:MissionSettings=defaultMission(),suggestFixes=true):MissionWorld {
 const variant=settings.variation%3,location=locationDefinition(settings.location),military=location.id!=='depot';
 const blocks=location.blocks.filter(b=>settings.layout!=='open'||!['crates-01','crates-02'].includes(b.id));
 if(settings.layout==='dense')blocks.push(...(military?[
  {id:'cover-east',x:17,z:5,w:2,d:3,h:1.2,kind:'crate' as const,color:'#657161'},
  {id:'cover-west',x:-12,z:-17,w:2,d:2,h:1.2,kind:'crate' as const,color:'#657161'},
 ]:[{id:'cover-east',x:10,z:2,w:2,d:3,h:1.2,kind:'crate' as const,color:'#977653'},{id:'cover-west',x:-10,z:-12,w:2,d:2,h:1.2,kind:'crate' as const,color:'#977653'}]));
 // Four authored cover packs combine with three spawn arrangements. Keep every
 // addition outside the central extraction lane and verified staging anchors.
 const pack=Math.floor(settings.variation/3);if(pack){const wide=military,x=wide?7:5;for(const [i,z]of (pack===1?[10]:pack===2?[2,12]:[4,11]).entries())blocks.push({id:`variant-cover-${pack}-${i}`,x:i%2?-x:x,z,w:pack===3?2.4:1.8,d:.65,h:pack===2?.65:1.1,kind:'crate',color:wide?'#8d937c':'#998168'});}
 let helipad:SpawnPoint|undefined;
 if(extractionMode(settings)==='helicopter'){const old=location.bounds.maxZ;helipad={x:0,z:old+7,yaw:0};location.bounds={...location.bounds,maxZ:old+14};for(const b of blocks){if(b.id==='south')b.z=location.bounds.maxZ;if(b.id==='west'||b.id==='east'){const min=b.z-b.d/2;b.d=location.bounds.maxZ-min;b.z=min+b.d/2;}}}
 if(settings.environment?.time==='night')for(const [i,p]of floodlightAnchors(location.bounds,location.gate).entries())blocks.push({id:'floodlight-'+i,x:p.x,z:p.z,w:.14,d:.14,h:4,kind:'wall',color:'#505b5d'});
 const getaway=usesPickup(settings);
 if(getaway){const width=location.bounds.maxX-location.bounds.minX;for(const b of blocks)if(b.id.startsWith('partition-')){b.w=(width-6)/2;b.x=(b.id.endsWith('west')?-1:1)*(3+b.w/2);}const rail=blocks.findIndex(b=>b.id==='vault-rail');if(rail>=0)blocks.splice(rail,1);const crate=blocks.find(b=>b.id==='crates-02');if(military&&crate)crate.x=6;}
 const start={...location.starts[variant]},key={...location.keys[variant]},exit={...(getaway?{x:0,z:location.bounds.minZ+5}:settings.story==='rescue'?start:location.exits[variant])},side=variant===2?1:-1;
 const captive={...location.captives[variant],yaw:side>0?-Math.PI/2:Math.PI/2},approach={x:captive.x+side*1.1,z:captive.z,yaw:-side*Math.PI/2},gate=location.gate;
 const keySpawn={x:key.x-.2,z:key.z+.5,yaw:Math.atan2(gate.x-key.x+.2,gate.z-key.z-.5)},gateSpawn={x:gate.x+.84,z:gate.z+.7,yaw:Math.PI};
 const patrol=!military&&variant===2?location.patrol.map(p=>({x:-p.x,z:p.z})):variant===1?[...location.patrol].reverse():location.patrol;
 const pickup={x:0,z:military?13:9,yaw:Math.PI};
 const course=getaway&&settings.driveDifficulty&&settings.driveDifficulty!=='easy'?addDrivingCourse(blocks,location.bounds,settings.driveDifficulty,pickup,gate):undefined;
 const cargoKind=settings.cargo&&settings.cargo!=='none'?settings.cargo:undefined,openRects=obstacles(1,blocks,gate,getaway?6:2.9),cargoPosition=cargoKind?[{x:-Math.sign(key.x)*(location.bounds.maxX-4),z:gate.z+4},{x:-Math.sign(key.x)*(location.bounds.maxX-4),z:gate.z+6},{x:Math.sign(key.x)*(location.bounds.maxX-4),z:gate.z+5}].find(p=>!blocked(p,1.5,openRects)&&route(start,p,obstacles(0,blocks,gate,getaway?6:2.9),.52,location.bounds).length):undefined;
 if(cargoKind&&!cargoPosition){const fixes:string[]=[];if(suggestFixes)for(const layout of [settings.layout,'open','balanced','dense']as CoverLayout[])for(let variation=0;variation<12&&fixes.length<3;variation++){if(layout===settings.layout&&variation===settings.variation||fixes.includes(`layout "${layout}", variation ${variation}`))continue;try{createMission({...settings,layout,variation},false);fixes.push(`layout "${layout}", variation ${variation}`);}catch{}}
  throw Error(`cargo (${cargoKind}): no reachable spot in ${location.id}, layout "${settings.layout}", variation ${settings.variation}; candidate positions are blocked or cannot be reached from the hero start.${fixes.length?` Try ${fixes.join(' or ')}.`:''}`);}
 const cargoSpawn={...(cargoPosition??start),z:(cargoPosition??start).z+(cargoKind?0.7:0),yaw:Math.PI};
 if(cargoKind)blocks.push({id:'mission-cargo-stand',x:cargoPosition!.x,z:cargoPosition!.z-.4,w:1.1,d:.7,h:.8,kind:'crate',color:'#879078'});
 const world:MissionWorld={id:`${location.id}-${settings.story}-${extractionMode(settings)}-${settings.layout}-${settings.variation}-${settings.cargo??'none'}-${settings.driveDifficulty??'easy'}`,location:location.id,name:location.name,bounds:course?.bounds??location.bounds,gate,...(helipad?{helipad}:{}),gateWidth:getaway?6:2.9,gateClearance:getaway?3.65:2.55,...(getaway?{getaway:{pickup,...(course?{course:course.course}:{}),route:course?.route??[pickup,{x:0,z:gate.z-3,yaw:Math.PI},{...exit,yaw:Math.PI}],reserve:{minX:-2,maxX:3,minZ:pickup.z-5,maxZ:pickup.z+5}}}:{}),...(cargoKind?{cargo:{kind:cargoKind,position:{x:cargoPosition!.x,z:cargoPosition!.z-.4}}}:{}),sniperSpawns:blocks.filter(b=>(b.kind==='building'||b.kind==='container')&&b.h>=2&&Math.hypot(b.x-start.x,b.z-start.z)>7).sort((a,b)=>Math.hypot(b.x-start.x,b.z-start.z)-Math.hypot(a.x-start.x,a.z-start.z)).slice(0,2).map(b=>({x:b.x,z:b.z,y:b.h,yaw:Math.atan2(gate.x-b.x,gate.z-b.z)})),enemySpawns:location.enemySpawns,supplyRows:location.supplyRows,supplyLanes:location.supplyLanes,story:settings.story,blocks,start,key,exit:course?.exit??exit,guard:{...location.guards[variant]},patrol,rescue:{captive,approach},checkpoints:{cargo:cargoSpawn,route:{...pickup},key:keySpawn,gate:gateSpawn,rescue:approach,vehicle:getaway?{x:-1.5,z:pickup.z,yaw:Math.PI}:{...gateSpawn},clear:{...patrol[0],yaw:Math.atan2(exit.x-patrol[0].x,exit.z-patrol[0].z)}}};
 const shut=missionObstacles(world,0),open=missionObstacles(world,1),r=.52;
 const placementError=(goal:string,detail:string):never=>{
  const fixes:string[]=[];
  if(suggestFixes)for(const layout of [settings.layout,'open','balanced','dense']as CoverLayout[])for(let variation=0;variation<12&&fixes.length<3;variation++){
   const fix=`layout "${layout}", variation ${variation}`;
   if(layout===settings.layout&&variation===settings.variation||fixes.includes(fix))continue;
   try{createMission({...settings,layout,variation},false);fixes.push(fix);}catch{/* An alternative must pass the complete mission contract. */}
  }
  throw Error(`${goal}: ${detail} in ${location.id}, layout "${settings.layout}", variation ${settings.variation}.${fixes.length?` Try ${fixes.join(' or ')}.`:''}`);
 };
 const obstruction=(p:Point,rects:Rect[])=>{
  const solid=blocks.find(b=>blocked(p,r,[rectOf(b)]));
  return solid?`blocked by ${solid.id}`:blocked(p,r,rects)?'blocked by the gate':'clear';
 };
 for(const [name,p]of [['hero start',world.start],['key',world.key],['exit',world.exit],['guard',world.guard],...world.patrol.map((point,i)=>[`patrol point ${i+1}`,point]as const)]as const)if(blocked(p,r,open))placementError(name,obstruction(p,open));
 for(const [name,from,to,rects]of [['hero start → key',world.start,keySpawn,shut],['key → gate',keySpawn,gateSpawn,shut],['gate → extraction',gateSpawn,course?pickup:world.exit,open],['clear checkpoint → extraction',world.checkpoints.clear,course?pickup:world.exit,open]]as const){
  if(!route(from,to,rects,r,location.bounds).length){const target=obstruction(to,rects),source=obstruction(from,rects),crossed=blocks.filter(b=>!clearPath(from,to,[rectOf(b)],r)).slice(0,3).map(b=>b.id);
   placementError(name,`no reachable route from (${from.x.toFixed(1)}, ${from.z.toFixed(1)}) to (${to.x.toFixed(1)}, ${to.z.toFixed(1)}); ${target!=='clear'?`destination ${target}`:source!=='clear'?`start ${source}`:crossed.length?`direct path crosses ${crossed.join(', ')} and no detour is reachable`:'no ground path fits between the solids'}`);
  }
 }
 if(settings.story==='rescue'){
  if(blocked(captive,r,open))placementError('rescue captive',obstruction(captive,open));
  if(blocked(approach,r,open))placementError('rescue approach',obstruction(approach,open));
  if(!route(start,approach,open,r,location.bounds).length)placementError('hero start → rescue approach','no reachable ground route');
  if(!route(captive,course?pickup:world.exit,open,r,location.bounds).length)placementError('rescue captive → extraction','no reachable ground route');
 }
 if(course)for(let i=1;i<course.route.length;i++)if(!clearPath(course.route[i-1],course.route[i],open,r))placementError(`road checkpoint ${i}`,`segment from (${course.route[i-1].x.toFixed(1)}, ${course.route[i-1].z.toFixed(1)}) to (${course.route[i].x.toFixed(1)}, ${course.route[i].z.toFixed(1)}) crosses a solid`);
 return world;
}
export const solidVolumes=(world:MissionWorld,door:number)=>[...world.blocks.map(b=>({...rectOf(b),h:b.h,id:b.id,climbable:b.kind!=='wall'})),{...obstacles(door,[],world.gate,world.gateWidth)[0],h:2.3,id:'gate',climbable:false}];
