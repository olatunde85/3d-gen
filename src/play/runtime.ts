import {pursuitStep,type PursuitState} from './pursuit';
import {AIR_DURATION,beginAirApproach,advanceAirApproach,airStand,airHull,type AirState,type AirFit} from './air';
import {stageSteps,needsCompanion,stepLabel} from './objectives';
import {defaultEnvironment,visibilityMultiplier} from './environment';
import {strongerWeapon,isGun,weaponProfile,type Equipment} from './weapons';
import {roleDefaults,roleProfile} from './enemy-roles';
import {vehicleVolumes} from './vehicle-surfaces';
/** Fixed-step gameplay, independent of the renderer and editor. */
import {route,distance,blocked,clearPath,type Point} from './world';
import {createMission,defaultMission,missionTimeLimit,solidVolumes,missionObstacles,validateMissionEquipment,type MissionSettings,type SpawnPoint,type CheckpointStage} from './mission';
import {stageEnemies,type EnemyRole} from './enemies';
import {updateEnemies,investigate,enemyVolume,type EnemyState,type GuardMode} from './enemy-ai';
export type {GuardMode} from './enemy-ai';
import {motorStep,planTraversal,approachTraversal,traversalPosition,sight,supportAt,type MotorBody,type Traversal} from './motor';
import {mountedAim,defaultLoadout,makeCombatant,tickCombat,reload,spendRound,damage,hitDirection,chest,aimPitch,traceShot,type Combatant,type Loadout,type Point3,type Shot,type ShotTarget,type AmmoSnapshot,type Health,type HitDirection} from './combat';
import {createCompanion,updateCompanion,type CompanionState} from './companion';
import {defaultProgression,placePickups,HEALTH_PACK,AMMO_PACK,MAX_RESERVE,type ProgressionSettings,type Reward} from './progression';
import {GRENADE,safeLaunch,advanceGrenade,blastDamage,type Grenade,type Explosion,type GrenadeThrow} from './grenades';
import {defaultDriving,defaultCarFit,pickupAtExtraction,carTouchesPerson,carClear,carObstacle,driverStand,passengerStand,passengerEntryClear,entryClear,canReachDoor,driveStep,DRIVE,type DrivingSettings,type CarState,type CarFit,type CarPose} from './driving';
import {canBoardPassenger,beginPassenger,stepPassenger} from './passenger';
export const INTERACTIONS={cargo:{clip:'use_press',duration:1.65,contact:.85},key:{clip:'use_press',duration:1.65,contact:.85},door:{clip:'open_door',duration:2.1,contact:.9},rescue:{clip:'use_press',duration:1.65,contact:.85}}as const;
export type Body=MotorBody;
export interface GameEvent {time:number;type:string;text:string}
export interface Input {x:number;z:number;sprint:boolean;interact:boolean;interactHeld?:boolean;jump?:boolean;crouch?:boolean;aiming?:boolean;aim?:Point3;fire?:boolean;reload?:boolean;throwGrenade?:boolean;throttle?:number;steer?:number;brake?:boolean;melee?:boolean}
export interface Checkpoint {readonly chain?:Readonly<{index:number;progress:number;wave:number}>;readonly open?:boolean;readonly cargo?:boolean;readonly routeStage?:number;readonly progress?:string;readonly hasKey?:boolean;readonly companion?:Readonly<{rescued:boolean;health:number;spawn:Readonly<SpawnPoint>}>;readonly vehicle?:Readonly<CarPose>;readonly grenades:number;readonly stage:CheckpointStage;readonly spawn:Readonly<SpawnPoint>;readonly time:number;readonly ammo:Readonly<AmmoSnapshot>;readonly weapon:Equipment;readonly collected:readonly string[];readonly rewards:readonly Readonly<Reward>[];readonly enemies:readonly Readonly<{id:string;health:number;hitDirection?:HitDirection;damageKind?:Combatant['damageKind'];deathFloor?:number;position:Readonly<Point3>;yaw:number}>[]}
export const RESPAWN_PROTECTION=3;
export class EscapeGame {
 player:Body={x:0,z:0,y:0,vy:0,height:1.8,grounded:true,airTime:0,landing:0,yaw:Math.PI,speed:0,radius:.34};
 pursuit?:PursuitState;private overwatchTime=0;air?:AirState;get airBusy(){return !!this.air&&this.air.phase!=='waiting';}
 car?:CarState;boarding?:{anchor:SpawnPoint;time:number};private engineAlert=0;private moraleReported=false;
 get squadMorale(){return this.enemies.some(e=>e.kind==='leader')&&!this.enemies.some(e=>e.kind==='leader'&&e.combat.health>0)?.65:1;}
 get vehicleBusy(){return !!this.car&&this.car.phase!=='parked';}
 readonly enemies:EnemyState[];
 readonly companion?:CompanionState;
 grenades:number;throwing?:GrenadeThrow;readonly projectiles:Grenade[]=[];readonly explosions:Explosion[]=[];private grenadeSequence=0;private grenadeQueued=false;private grenadeAim?:Point3;
 readonly playerCombat;readonly shots:Shot[]=[];private shotSequence=0;
 readonly pickups;readonly collected=new Set<string>();private earned:Reward[]=[];
 get rewards():readonly Readonly<Reward>[]{return this.earned;}
 get score(){return this.earned.reduce((n,r)=>n+r.points,0);}
 get objectivesCompleted(){return this.earned.filter(r=>r.kind==='objective').length;}
 get totalObjectives(){if(this.stagedSteps.length)return this.stagedSteps.length+1+(this.car?1:0)+(this.world.cargo?1:0);return (this.car?3:this.companion||this.mission.story==='clear'?2:3)+(this.world.cargo?1:0);}
 get cargoReady(){return !this.world.cargo||this.hasCargo;}
 get routeTarget(){return this.world.getaway?.course?.checkpoints[this.routeStage];}
 get timeLimit(){return missionTimeLimit(this.mission);}
 get readyToDrive(){return !!this.car&&this.car.phase==='driving'&&this.hasKey&&(this.stagedSteps.length>0||this.mission.story!=='clear'||this.cleared)&&(!this.companion||this.companion.rescued&&this.companion.combat.health>0&&this.companion.riding?.phase==='seated');}
 get traversalVolumes(){return [...solidVolumes(this.world,this.door),...(this.air&&!this.airBusy?[{...airHull(this.air),h:2.4,id:'helicopter',climbable:false}]:[]),...(this.car?vehicleVolumes(this.car):[])];}
 get combatVolumes(){const volumes=[...solidVolumes(this.world,this.door),...(this.air&&!this.airBusy?[{...airHull(this.air),id:'helicopter',h:2.4,climbable:false}]:[]),...(this.pursuit?[{...carObstacle(this.pursuit.car),id:'pursuit',h:.65,climbable:false}]:[])];return this.car&&!this.vehicleBusy?[...volumes,...vehicleVolumes(this.car)]:volumes;}
 get remainingEnemies(){return this.enemies.filter(e=>e.combat.health>0).length;}
 get cleared(){return !this.stagedSteps.length&&this.mission.story==='clear'&&this.remainingEnemies===0;}
 get extractionReady(){if(this.stagedSteps.length&&this.stepIndex<this.stagedSteps.length)return false;if(!this.cargoReady||this.routeTarget)return false;return this.car?this.readyToDrive&&this.car.phase==='driving':this.stagedSteps.length?true:this.mission.story==='clear'?this.cleared:this.companion?this.companion.rescued:this.door>.95;}
 get defaultBriefing(){if(this.stagedSteps.length)return this.stagedSteps.map((s,i)=>`${i+1}. ${stepLabel(s.step)}`).join('\n')+(this.air?'\nThen board the waiting helicopter.':'\nThen reach extraction.');return (this.world.cargo?`Secure the ${this.world.cargo.kind} before escaping.\n`:'')+this.baseBriefing;}
 private get baseBriefing(){return this.car&&this.companion?'Free your companion, then lead them to the waiting pickup.\nBoard together and drive to extraction.':this.car&&this.mission.story==='clear'?'Clear the enemy squad, board the waiting pickup, and drive to extraction.':this.car?'Find the pickup keys. Board the waiting truck.\nDrive through the checkpoint and stop in the extraction ring.':this.mission.story==='clear'?`Defeat all ${this.enemies.length} ${this.enemies.length===1?'enemy':'enemies'} at the ${this.world.name.toLowerCase()}.\nThen reach the green extraction marker.`:this.companion?`Reach your companion in the ${this.companion.x<0?'north-west':'north-east'} yard.\nFree them and return to extraction together.`:`Find the key. Unlock the security gate.\nReach extraction before the ${this.enemies.length===1?'enemy':'squad'} reaches you.`;}
 get guard(){return this.enemies[0];}
 get mode(){return this.guard.mode;}set mode(value:GuardMode){this.guard.mode=value;}
 get awareness(){return this.guard.awareness;}set awareness(value:number){this.guard.awareness=value;}
 get lastKnown(){return this.guard.lastKnown;}set lastKnown(value:Point){this.guard.lastKnown=value;}
 get threat(){const rank={patrol:0,search:1,investigate:2,chase:3};return this.enemies.filter(e=>e.combat.health>0).sort((a,b)=>(rank[b.mode]-rank[a.mode])*1000+(b.awareness-a.awareness)*100+distance(a,this.player)-distance(b,this.player))[0]??this.guard;}
 damageTaken=0;alarmRaised=false;get medals(){return this.status!=='won'?[]:[...(!this.alarmRaised?['No alarms']:[]),...(this.damageTaken===0?['No damage']:[]),...(this.elapsed<=(this.mission.parTime??180)?['Under par']:[])];}
 flashlight=false;time=0;elapsed=0;attempts=1;protection=0;remainingLives:number|null;
 status:'ready'|'playing'|'won'|'caught'='ready';hasCargo=false;routeStage=0;hasKey=false;door=0;opening=false;
 private savedCheckpoint?:Checkpoint;
 get checkpoint(){return this.savedCheckpoint;}
 get canRetry(){return this.status==='caught'&&(this.remainingLives===null||this.remainingLives>0);}
 events:GameEvent[]=[];
 action?:{kind:'key'|'door'|'rescue'|'cargo';time:number;done:boolean;approach:boolean;anchor?:SpawnPoint;approachTime?:number};
 traversal?:Traversal;failure?:'caught'|'time'|'alarm'|'defeated'|'companion-captured'|'companion-defeated';
 readonly world;readonly stagedSteps;downloading=false;stepIndex=0;stepProgress=0;wave=1;private waveDelay=0;private waveSerial=0;private jumpQueued=false;
 private interactionQueued=false;
 private meleeQueued=false;private noiseTime=0;private fireQueued=false;private reloadQueued=false;
 private velocity={x:0,z:0};private accumulator=0;
 constructor(readonly mission:MissionSettings=defaultMission(),roles:readonly EnemyRole[]=[{id:'enemy-1',aggression:'balanced'}],readonly loadout:Loadout=defaultLoadout(),companionHealth:Health=100,readonly progression:ProgressionSettings=defaultProgression(),readonly vehicleSettings:DrivingSettings=defaultDriving()){validateMissionEquipment(mission,loadout,progression);roles=roles.map(r=>({...r,response:r.response??roleDefaults(r.kind??'guard').response,health:r.health??roleDefaults(r.kind??'guard').health}));this.grenades=loadout.grenades??0;this.playerCombat=makeCombatant({...loadout,weapon:progression.weapon==='loadout'?loadout.weapon:'none'});this.remainingLives=mission.lives==='unlimited'?null:mission.lives;this.world=createMission(mission);if(this.world.helipad)this.air={...this.world.helipad,y:0,phase:'waiting',time:0};this.stagedSteps=stageSteps(mission,this.world);if(this.stagedSteps.length)this.world.id+=JSON.stringify(mission.steps);for(const s of this.stagedSteps)if(s.step.type==='eliminate'&&!roles.some(r=>r.id===s.step.target))throw Error('An elimination objective must reference an enemy in this chapter.');if(this.world.getaway)this.car={...this.world.getaway.pickup,speed:0,steer:0,distance:0,time:0,blocked:0,phase:'parked',fit:defaultCarFit()};this.pickups=placePickups(this.world,progression);Object.assign(this.player,this.world.start);if(mission.story==='rescue'||mission.story==='clear'){this.door=1;this.opening=true;}if(needsCompanion(mission)){this.companion=createCompanion(this.player,this.world.rescue.captive,companionHealth);this.door=1;this.opening=true;if(this.stagedSteps.length){Object.assign(this.companion,{x:this.world.start.x+.9,z:this.world.start.z,rescued:true,located:true,state:'following'});}}if(this.stagedSteps.length){this.door=1;this.opening=true;this.hasKey=true;}const starts=stageEnemies(this.world,roles);if(roles.filter(r=>r.kind==='sniper').length>Math.min(2,this.world.sniperSpawns.length))throw Error('This location supports at most two elevated snipers.');this.enemies=roles.map((role,i)=>({...this.player,...starts[i],...(role.kind?{kind:role.kind}:{}),id:role.id,aggression:role.aggression,response:role.response??'capture',health:role.health??100,combat:makeCombatant({weapon:isGun(role.response)?role.response:'none',health:role.health??100,ammunition:'unlimited'}),radius:.38,target:'player',mode:'patrol',awareness:0,lastKnown:{...this.world.gate},patrol:i%this.world.patrol.length,repath:i*.07,path:[],unseen:0,searchTime:0,stuck:0}));}
 start(){if(this.status==='ready'){this.status='playing';this.emit('start',this.stagedSteps.length?this.chainProgress:this.car&&this.companion?'Free your companion. Lead them to the blue pickup and board together.':this.car&&this.mission.story==='clear'?'Clear the squad, then board the pickup and drive to extraction.':this.car?'Find the pickup keys, then board the truck marked blue.':this.mission.story==='clear'?'Clear the enemy squad, then reach extraction.':this.companion?`Reach your companion in the ${this.companion.x<0?'north-west':'north-east'} yard. The gate is open.`:`Find the brass key in the ${this.world.key.x<0?'west':'east'} yard.`);}}
 private emit(type:string,text:string){if(['spotted','explosion','grenade-thrown'].includes(type))this.alarmRaised=true;this.events.push({time:this.time,type,text});if(this.events.length>30)this.events.shift();}
 private reward(id:string,label:string,kind:Reward['kind'],points:number){
  if(this.earned.some(r=>r.id===id))return;
  this.earned.push({id,label,kind,points:this.progression.scoring==='off'||kind==='combat'&&this.progression.scoring!=='action'?0:points});
 }
 private unlockPistol(){this.unlockWeapon(this.progression.unlock??'pistol');}
 private unlockWeapon(weapon:'pistol'|'rifle'){
  const c=this.playerCombat;if(c.weapon===weapon)return;
  const equipped=makeCombatant({...this.loadout,weapon});c.weapon=weapon;c.magazine=equipped.magazine;c.reserve=equipped.reserve;
  this.emit('weapon-unlocked',weaponProfile(weapon).name+' acquired. Aim, fire and reload are ready.');
 }
 private objective(id:string,label:string,points:number){
  this.reward(id,label,'objective',points);
  if(this.progression.weapon==='objective'&&(id==='key'||id==='rescue'))this.unlockPistol();
 }
 private collectSupplies(){
  if(this.status!=='playing'||this.vehicleBusy||this.boarding||this.action||this.throwing||this.traversal||!this.player.grounded||this.player.y>.15)return;
  const c=this.playerCombat,rects=[...missionObstacles(this.world,this.door),...(this.car?[carObstacle(this.car)]:[])];
  for(const p of this.pickups){
   if(this.collected.has(p.id)||distance(this.player,p)>.85+this.player.radius||!clearPath(this.player,p,rects))continue;
   if(p.kind==='health'){
    if(c.health>=c.maxHealth)continue;const amount=Math.min(HEALTH_PACK,c.maxHealth-c.health);c.health+=amount;this.emit('supply',`Health +${amount}`);
   }else if(p.kind==='ammo'){
    if(!isGun(c.weapon)||c.reserve===null||c.reserve>=MAX_RESERVE)continue;const amount=Math.min(AMMO_PACK,MAX_RESERVE-c.reserve);c.reserve+=amount;this.emit('supply',`Ammunition +${amount}`);
   }else this.unlockPistol();
   this.collected.add(p.id);
  }
 }
 private fail(reason:NonNullable<EscapeGame['failure']>,text:string){
  if(this.status!=='playing')return;this.status='caught';this.failure=reason;
  if(this.remainingLives!==null)this.remainingLives=Math.max(0,this.remainingLives-1);
  this.emit(reason==='time'?'timeout':reason,text);
 }
 /** Restore objectives, never a partial interaction or a pursuer at the point of capture. */
 retry():boolean {
  if(!this.canRetry)return false;
  const checkpoint=this.savedCheckpoint;let spawn=checkpoint?.spawn??{...this.world.start,yaw:Math.PI};const open=!!this.stagedSteps.length||this.mission.story==='rescue'||this.mission.story==='clear'||(checkpoint?.open??(checkpoint?.stage==='gate'||!!this.car&&!!checkpoint?.hasKey)),starts=stageEnemies(this.world,this.enemies);
  if(this.stagedSteps.length){const rects=missionObstacles(this.world,open?1:0),safe=(p:Point)=>!blocked(p,this.player.radius,rects)&&starts.every((q,i)=>checkpoint?.enemies.find(e=>e.id===this.enemies[i].id)?.health===0||distance(p,q)>this.player.radius+this.enemies[i].radius+3);if(!safe(spawn)){const choices=[];for(let x=-6;x<=6;x++)for(let z=-6;z<=6;z++){const p={x:spawn.x+x,z:spawn.z+z,yaw:spawn.yaw};if(p.x>this.world.bounds.minX+1&&p.x<this.world.bounds.maxX-1&&p.z>this.world.bounds.minZ+1&&p.z<this.world.bounds.maxZ-1&&safe(p)&&route(spawn,p,rects,this.player.radius,this.world.bounds).length)choices.push(p);}const nearest=choices.sort((a,b)=>distance(a,spawn)-distance(b,spawn))[0];if(nearest)spawn=nearest;}}
  if(blocked(spawn,this.player.radius,missionObstacles(this.world,open?1:0))||checkpoint?.stage!=='clear'&&starts.some((p,i)=>checkpoint?.enemies.find(e=>e.id===this.enemies[i].id)?.health!==0&&distance(p,spawn)<this.player.radius+this.enemies[i].radius+3))throw Error('This mission needs a safe retry position.');
  if(this.car){Object.assign(this.car,checkpoint?.vehicle??this.world.getaway!.pickup,{speed:0,steer:0,distance:0,time:0,blocked:0,phase:'parked'});this.engineAlert=0;}
  Object.assign(this.player,spawn,{y:0,vy:0,grounded:true,airTime:0,landing:0,speed:0,crouch:0});
  this.enemies.forEach((enemy,i)=>Object.assign(enemy,starts[i],{y:starts[i].y,vy:0,grounded:true,airTime:0,landing:0,speed:0,yaw:starts[i].yaw,target:'player',mode:'patrol',awareness:0,lastKnown:{...this.world.gate},patrol:i%this.world.patrol.length,repath:i*.07,path:[],unseen:0,searchTime:0,stuck:0}));
  Object.assign(this.playerCombat,makeCombatant({...this.loadout,weapon:checkpoint?.weapon??(this.progression.weapon==='loadout'?this.loadout.weapon:'none')}),checkpoint?.ammo??{});
  this.collected.clear();for(const id of checkpoint?.collected??[])this.collected.add(id);this.earned=(checkpoint?.rewards??[]).map(r=>({...r}));
  for(const e of this.enemies){Object.assign(e.combat,makeCombatant({weapon:isGun(e.response)?e.response:'none',health:e.health??100,ammunition:'unlimited'}));const saved=checkpoint?.enemies.find(s=>s.id===e.id);e.combat.health=saved?.health??e.combat.maxHealth;if(saved?.health===0){Object.assign(e,saved.position,{yaw:saved.yaw});e.combat.hitDirection=saved.hitDirection??'front';e.combat.damageKind=saved.damageKind??'bullet';e.combat.deathFloor=saved.deathFloor??saved.position.y;}}
  this.hasCargo=checkpoint?.cargo??false;this.routeStage=checkpoint?.routeStage??0;this.hasKey=checkpoint?.hasKey??(!!this.stagedSteps.length||!!checkpoint&&(checkpoint.stage==='key'||checkpoint.stage==='gate'||checkpoint.stage==='vehicle'));this.door=open?1:0;this.opening=open;this.time=checkpoint?.time??0;
  if(this.companion){const c=this.companion,physical={height:c.height,radius:c.radius,animationScale:c.animationScale},health=c.combat.maxHealth as Health;Object.assign(c,createCompanion(this.player,this.world.rescue.captive,health),physical);if(checkpoint?.companion){Object.assign(c,checkpoint.companion.spawn);c.rescued=checkpoint.companion.rescued;c.located=c.rescued;c.combat.health=checkpoint.companion.health;c.state=c.rescued?'following':'captive';}else if(checkpoint?.stage==='rescue'){c.rescued=true;c.located=true;c.state='following';}}
  this.stepIndex=checkpoint?.chain?.index??0;this.stepProgress=checkpoint?.chain?.progress??0;this.wave=checkpoint?.chain?.wave??1;this.waveDelay=0;this.waveSerial=this.wave-1;this.noiseTime=0;this.meleeQueued=false;for(const e of this.enemies)e.foundBodies=[];if(this.companion&&this.stagedSteps.length&&!checkpoint?.companion)Object.assign(this.companion,{x:this.world.start.x+.9,z:this.world.start.z,rescued:true,located:true,state:'following'});
  this.grenades=checkpoint?.grenades??this.loadout.grenades??0;this.throwing=undefined;this.grenadeAim=undefined;this.grenadeQueued=false;this.projectiles.length=0;this.explosions.length=0;
  if(this.air){Object.assign(this.air,this.world.helipad,{y:0,phase:'waiting',time:0});}if(this.pursuit)this.configurePursuit(this.pursuit.car.fit);this.overwatchTime=this.time;this.moraleReported=this.squadMorale<1;this.boarding=undefined;this.action=undefined;this.traversal=undefined;this.failure=undefined;this.velocity={x:0,z:0};this.accumulator=0;this.interactionQueued=false;this.jumpQueued=false;this.fireQueued=false;this.reloadQueued=false;this.shots.length=0;
  this.attempts++;this.protection=RESPAWN_PROTECTION;this.status='playing';this.events=[];
  this.emit('respawn',checkpoint?`Checkpoint restored. ${checkpoint.stage==='clear'?'The squad stays defeated. Reach extraction.':checkpoint.stage==='rescue'?'Your companion is free.':open?'The gate is open.':'You have the key.'} Protected for 3 seconds.`:'Back at the start. Protected for 3 seconds.');return true;
 }
 private saveCheckpoint(){
  const routeChanged=this.routeStage>(this.savedCheckpoint?.routeStage??0),cargoChanged=this.hasCargo&&!this.savedCheckpoint?.cargo;
  if(this.projectiles.length>0||this.mission.checkpoints!=='auto'||this.status!=='playing'||this.airBusy||this.boarding||this.action||this.throwing||this.traversal||this.car&&this.car.phase!=='parked'&&!(this.car.phase==='driving'&&(Math.abs(this.car.speed)<.01||routeChanged))||!this.player.grounded||this.player.y>.1||this.companion?.riding&&this.companion.riding.phase!=='seated')return;
  const progress=[this.stepIndex,this.hasKey,this.hasCargo,this.companion?.rescued,this.cleared,this.earned.some(r=>r.id==='vehicle'),this.door===1,this.routeStage].join(':');if(this.savedCheckpoint?.progress===progress)return;
  const base=this.stagedSteps.length?(this.stepIndex>0?'gate':undefined):this.car?this.earned.some(r=>r.id==='vehicle')?'vehicle':this.cleared?'clear':this.companion?.rescued?'rescue':this.hasKey?'key':undefined:this.mission.story==='clear'?this.cleared?'clear':undefined:this.companion?this.companion.rescued?'rescue':undefined:this.door===1&&this.opening?'gate':this.hasKey?'key':undefined;
  const stage:CheckpointStage|undefined=routeChanged?'route':cargoChanged?'cargo':base;if(!stage)return;
  const pose=routeChanged?this.world.getaway!.course!.checkpoints[this.routeStage-1]:this.car,parked=this.car&&pose?{...this.car,...pose}:undefined,c=this.companion;
  const spawn=this.stagedSteps.length&&stage==='gate'?{x:this.player.x,z:this.player.z,yaw:this.player.yaw}:stage==='vehicle'||stage==='route'?driverStand(parked!):this.world.checkpoints[stage],companionSpawn=c?c.riding?passengerStand(parked!):{x:c.x,z:c.z,yaw:c.yaw}:undefined;
  this.savedCheckpoint=Object.freeze({...(this.stagedSteps.length?{chain:Object.freeze({index:this.stepIndex,progress:this.stepProgress,wave:this.wave})}:{}),open:this.opening&&this.door>.95,progress,cargo:this.hasCargo,routeStage:this.routeStage,hasKey:this.hasKey,...(c?{companion:Object.freeze({rescued:c.rescued,health:c.combat.health,spawn:Object.freeze(companionSpawn!)})}:{}),grenades:this.grenades,stage,...(parked?{vehicle:Object.freeze({x:parked.x,z:parked.z,yaw:parked.yaw})}:{}),spawn:Object.freeze({...spawn}),time:this.time,weapon:this.playerCombat.weapon,collected:Object.freeze([...this.collected]),rewards:Object.freeze(this.earned.map(r=>Object.freeze({...r}))),ammo:Object.freeze({magazine:this.playerCombat.magazine,reserve:this.playerCombat.reserve}),enemies:Object.freeze(this.enemies.map(e=>Object.freeze({id:e.id,health:e.combat.health,hitDirection:e.combat.hitDirection,damageKind:e.combat.damageKind,deathFloor:e.combat.deathFloor,position:Object.freeze({x:e.x,y:e.y,z:e.z}),yaw:e.yaw})))});
  this.emit('checkpoint',`Checkpoint saved · ${stage==='route'?`road checkpoint ${this.routeStage}`:stage==='cargo'?`${this.world.cargo!.kind} secured`:stage==='vehicle'?'pickup boarded':stage==='clear'?'squad cleared':stage==='rescue'?'companion freed':stage==='gate'?'gate unlocked':'key collected'}.`);
 }
 configureCar(fit:CarFit){
  if(!this.car)return;if(fit.height>this.world.gateClearance)throw Error('The fitted pickup needs more height clearance at the checkpoint.');this.car.fit=structuredClone(fit);
  const rects=missionObstacles(this.world,1),path=this.world.getaway!.route;
  for(let j=0;j<path.length;j++){const a=path[Math.max(0,j-1)],b=path[j],angle=Math.atan2(Math.sin(b.yaw-a.yaw),Math.cos(b.yaw-a.yaw)),steps=Math.max(1,Math.ceil((distance(a,b)+Math.abs(angle)*6)/.1));for(let i=0;i<=steps;i++){const t=i/steps,p={x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,yaw:a.yaw+angle*t};if(!carClear(p,fit,rects,this.world.bounds))throw Error('The fitted pickup needs more clearance on this escape route.');}}

  if(!entryClear(this.car,this.player.radius,missionObstacles(this.world,this.door)))throw Error('The pickup needs a clear driver’s door.');
 }
 configurePursuit(fit:CarFit){if(!this.mission.pursuit)return;const rects=missionObstacles(this.world,1),driver=this.enemies.find(e=>e.kind!=='sniper'),candidates=[{x:this.world.bounds.maxX-4,z:this.world.gate.z-7,yaw:0},{x:this.world.bounds.minX+4,z:this.world.gate.z-7,yaw:0},{x:0,z:this.world.gate.z-12,yaw:0}],at=candidates.find(p=>carClear(p,fit,rects,this.world.bounds)&&distance(p,this.world.start)>8);if(!driver)throw Error('Pursuit needs at least one ground enemy to drive the pickup.');if(!at)throw Error('The pursuit pickup needs a clear starting bay.');this.pursuit={car:{...at,speed:0,steer:0,distance:0,phase:'driving',time:0,blocked:0,fit},driver:driver.id,path:[],replan:0,reported:false};driver.vehicle=true;Object.assign(driver,at,{y:0});
  const other=this.enemies.filter(e=>e!==driver&&e.kind!=='sniper'),bay=this.pursuit.car;
  for(const e of other)if(carTouchesPerson(bay,fit,e)){const candidates=[...this.world.enemySpawns,...this.world.patrol,...this.world.supplyRows.flatMap(z=>this.world.supplyLanes.map(x=>({x,z})))],point=candidates.find(p=>!blocked(p,e.radius+.1,rects)&&!carTouchesPerson(bay,fit,{...p,radius:e.radius+.15})&&distance(p,this.world.start)>6&&(!this.companion||distance(p,this.companion)>4)&&other.every(q=>q===e||distance(p,q)>e.radius+q.radius+.7)&&route(p,this.world.patrol[0],rects,e.radius,this.world.bounds).length);if(!point)throw Error('The pursuit bay needs separated infantry positions.');Object.assign(e,point,{path:[],repath:0});}
 }
 get nearAir(){return !!this.air&&this.player.grounded&&this.player.y<.15&&distance(this.player,airStand(this.air))<1.65;}
 configureAir(fit:AirFit){if(!this.air)return;this.air.fit=fit;for(const point of [airStand(this.air),...(this.companion?[airStand(this.air,true)]:[])])if(blocked(point,.52,missionObstacles(this.world,1))||blocked(point,.3,[airHull(this.air)]))throw Error('Aircraft entry needs a clear boarding anchor.');}
 private airStep(dt:number,volumes:ReturnType<typeof solidVolumes>){const air=this.air!,friend=this.companion;air.time+=dt;this.playerCombat.aiming=false;this.playerCombat.reload=0;this.velocity={x:0,z:0};
  if(air.phase==='approach'){
   const people=this.enemies.filter(e=>e.combat.health>0&&e.y<2.4),solids=[...volumes,...(this.pursuit?[carObstacle(this.pursuit.car)]:[])];air.approach??=beginAirApproach(air,this.player,friend,solids,this.world.bounds,people);
   const state=advanceAirApproach(air,air.approach,dt,this.player,friend,solids,this.world.bounds,people);
   if(state==='ready'){air.phase='boarding';air.time=0;air.approach=undefined;this.player.speed=0;if(friend)friend.speed=0;}
   else if(state==='blocked'){air.phase='waiting';air.time=0;air.approach=undefined;this.player.speed=0;if(friend)friend.speed=0;this.emit('air-blocked','Aircraft entry is obstructed. Clear both doorways and try again.');}
  }
  else if(air.phase==='boarding'&&air.time>=AIR_DURATION){air.phase='seated';air.time=0;this.emit('air-boarded','All aboard. Helicopter extraction preparing.');}
  else if(air.phase==='seated'&&air.time>=2){air.phase='departing';air.time=0;this.emit('air-departure','Lift off. Extraction underway.');}
  else if(air.phase==='alighting'&&air.time>=AIR_DURATION){air.phase='waiting';air.time=0;Object.assign(this.player,airStand(air));if(friend)Object.assign(friend,airStand(air,true));}
  if(air.phase==='departing'){const u=Math.min(1,air.time/4);air.y=8*u*u*(3-2*u);}
  if(air.phase!=='approach'&&air.phase!=='waiting'){Object.assign(this.player,{x:air.x,z:air.z,y:air.y,speed:0});if(friend)Object.assign(friend,{x:air.x,z:air.z,y:air.y,speed:0});}
 }
 private drive(dt:number,input:Input){
  const car=this.car!;this.velocity={x:0,z:0};this.player.speed=0;if(car.phase!=='driving'){this.playerCombat.aiming=false;this.playerCombat.reload=0;}
  if(car.phase==='driving'){
   driveStep(car,dt,this.readyToDrive?input.throttle??0:0,this.readyToDrive?input.steer??0:0,!this.readyToDrive||!!input.brake,this.vehicleSettings,missionObstacles(this.world,this.door),this.world.bounds,[...this.enemies.filter(e=>e.combat.health>0),...(this.companion&&!this.companion.riding?[this.companion]:[])]);
   Object.assign(this.player,{x:car.x,z:car.z,yaw:car.yaw});this.player.speed=Math.abs(car.speed);this.engineAlert-=dt;
   if(Math.abs(car.speed)>1&&this.engineAlert<=0){this.engineAlert=2;this.protection=0;for(const e of this.enemies)if(distance(e,car)<18)investigate(e,car);}
  }else{
   car.time+=dt;const duration=car.phase==='boarding'?DRIVE.boarding:DRIVE.alighting,p=Math.min(1,car.time/duration),w=p*p*(3-2*p),stand=driverStand(car),weight=car.phase==='boarding'?1-w:w;
   Object.assign(this.player,{x:car.x+(stand.x-car.x)*weight,z:car.z+(stand.z-car.z)*weight,yaw:car.yaw});
   if(p===1){const boarding=car.phase==='boarding';car.phase=boarding?'driving':'parked';car.time=0;if(boarding){Object.assign(this.player,{x:car.x,z:car.z});}else{Object.assign(this.player,stand);this.emit('alighted','Pickup parked here. Return to the driver’s door to board again.');}}
  }
 }
 private get nearCompanion(){const c=this.companion;return !!c&&c.combat.health>0&&distance(this.player,c)<1.85&&sight(this.player,c,solidVolumes(this.world,this.door));}
 private get pickupDoorNear(){return !!this.car&&this.hasKey&&canReachDoor(this.player,this.car,this.player.radius,missionObstacles(this.world,this.door),vehicleVolumes(this.car));}
 private get canBoardPickup(){return !!this.car&&this.pickupDoorNear&&this.cargoReady&&entryClear(this.car,this.player.radius,missionObstacles(this.world,this.door),this.enemies.filter(e=>e.combat.health>0))&&(!this.companion||this.companion.riding?.phase==='seated'&&this.companion.combat.health>0||canBoardPassenger(this.companion,this.car,missionObstacles(this.world,this.door),[this.player,...this.enemies.filter(e=>e.combat.health>0)],this.world.bounds));}
 get canInteract(){if(this.status!=='playing')return false;if(this.airBusy)return this.air?.phase==='seated';if(this.air&&this.extractionReady&&this.nearAir)return !this.companion||this.companion.rescued&&this.companion.combat.health>0&&distance(this.companion,this.air)<5;if(this.currentStep?.step.type==='download'&&this.nearStep)return true;
  if(this.status!=='playing'||this.airBusy||this.boarding||this.action||this.throwing||this.traversal)return false;
  if(this.vehicleBusy)return this.car!.phase==='driving'&&Math.abs(this.car!.speed)<.2&&entryClear(this.car!,this.player.radius,missionObstacles(this.world,this.door),this.enemies.filter(e=>e.combat.health>0))&&(!this.companion?.riding||this.companion.riding.phase==='approaching'||this.companion.riding.phase==='seated'&&passengerEntryClear(this.car!,this.companion.radius,missionObstacles(this.world,this.door),[...this.enemies.filter(e=>e.combat.health>0)],this.world.bounds));
  if(!this.player.grounded||this.player.y>.1)return false;
  if(this.nearCargo)return true;
  if(this.pickupDoorNear)return this.canBoardPickup;
  if(this.mission.story==='clear')return false;if(this.companion)return !this.companion.riding&&this.nearCompanion;
  return !this.hasKey&&distance(this.player,this.world.key)<1.65||!this.car&&this.hasKey&&distance(this.player,this.world.gate)<2.25&&!this.opening;
 }
 private get nearCargo(){return this.player.grounded&&this.player.y<.1&&!!this.world.cargo&&!this.hasCargo&&distance(this.player,this.world.cargo.position)<1.65&&sight(this.player,{...this.player,...this.world.cargo.position,y:.8,height:.4},solidVolumes(this.world,this.door).filter(v=>v.id!=='mission-cargo-stand'));}
 /** Approach the accessible side of the stand instead of crossing it to a fixed front anchor. */
 private cargoAnchor():SpawnPoint|undefined{
  const cargo=this.world.cargo,stand=this.world.blocks.find(b=>b.id==='mission-cargo-stand');if(!cargo||!stand)return;
  const p=cargo.position,r=this.player.radius+.12,dx=this.player.x-p.x,dz=this.player.z-p.z,d=Math.hypot(dx,dz),nx=d>.01?dx/d:0,nz=d>.01?dz/d:1,w=stand.w/2+r,h=stand.d/2+r;
  const radial=1/Math.max(Math.abs(nx)/w,Math.abs(nz)/h),rects=[...this.traversalVolumes,...this.enemies.filter(e=>e.combat.health>0).map(enemyVolume),...(this.companion&&this.companion.combat.health>0&&!this.companion.riding?[enemyVolume(this.companion)]:[])];
  const candidates=[{x:p.x+nx*radial,z:p.z+nz*radial},{x:p.x-w,z:p.z},{x:p.x+w,z:p.z},{x:p.x,z:p.z-h},{x:p.x,z:p.z+h}];
  if(d<=1.15)candidates.push({x:this.player.x,z:this.player.z});
  const b=this.world.bounds,point=candidates.filter(q=>q.x>b.minX+this.player.radius+.2&&q.x<b.maxX-this.player.radius-.2&&q.z>b.minZ+this.player.radius+.2&&q.z<b.maxZ-this.player.radius-.2&&!blocked(q,this.player.radius,rects)&&clearPath(this.player,q,rects,this.player.radius)).sort((a,b)=>distance(this.player,a)-distance(this.player,b))[0];
  return point?{...point,yaw:Math.atan2(p.x-point.x,p.z-point.z)}:undefined;
 }
 private rescueAnchor():SpawnPoint|undefined {
  const c=this.companion!;const gap=distance(this.player,c),r=Math.max(1,this.player.radius+c.radius+.14),dx=gap>.01?(this.player.x-c.x)/gap:1,dz=gap>.01?(this.player.z-c.z)/gap:0,rects=[...missionObstacles(this.world,this.door),enemyVolume(c)];
  const candidates=[{x:c.x+dx*r,z:c.z+dz*r},{x:c.x-r,z:c.z},{x:c.x+r,z:c.z},{x:c.x,z:c.z-r},{x:c.x,z:c.z+r}];
  const p=candidates.filter(p=>!blocked(p,this.player.radius,rects)&&clearPath(this.player,p,rects,this.player.radius)).sort((a,b)=>distance(a,this.player)-distance(b,this.player))[0];return p?{...p,yaw:Math.atan2(c.x-p.x,c.z-p.z)}:undefined;
 }
 get interactLabel(){if(this.airBusy)return 'Alight helicopter';if(this.air&&this.nearAir)return 'Board helicopter';if(this.currentStep?.step.type==='download'&&this.nearStep)return 'Hold to download';if(this.nearCargo&&!this.vehicleBusy)return `Take ${this.world.cargo!.kind}`;return this.car&&this.hasKey&&(this.vehicleBusy||this.pickupDoorNear)?this.vehicleBusy?'Exit pickup':'Board pickup':this.companion?this.companion.rescued?this.companion.waiting?'Follow me':'Wait here':'Free':this.hasKey?'Unlock':'Take key';}
 get prompt(){if(this.airBusy)return this.air?.phase==='approach'?'Moving to aircraft doors…':this.air?.phase==='boarding'?'Boarding helicopter…':this.air?.phase==='seated'?'Departing shortly · E to alight':this.air?.phase==='alighting'?'Alighting helicopter…':'Extracting…';if(this.air&&this.nearAir)return this.extractionReady?'Board helicopter':'Complete the objectives before extraction';if(this.currentStep?.step.type==='download'&&this.nearStep)return `Hold E / Interact · ${Math.floor(this.stepProgress)}/${this.currentStep.step.duration??8}s`; if(this.action?.kind==='cargo')return this.action.approach?'Moving into reach…':`Securing ${this.world.cargo!.kind}…`;if(this.nearCargo&&!this.vehicleBusy)return `Take ${this.world.cargo!.kind}`;if(this.boarding)return 'Moving to the driver’s door…';if(this.car&&this.status==='playing'){if(this.car.phase==='boarding')return 'Boarding pickup…';if(this.car.phase==='alighting')return 'Alighting…';if(this.car.phase==='driving')return this.companion&&!this.readyToDrive?'Waiting for companion to board…':Math.abs(this.car.speed)>=.2?'Brake to exit':this.canInteract?'Exit pickup':'Driver’s door blocked · move to a clear spot';if(!this.cargoReady&&this.hasKey)return `Secure the ${this.world.cargo!.kind} before boarding`;if(this.hasKey&&(!this.companion||this.pickupDoorNear))return this.canBoardPickup?'Board pickup':this.companion?'Bring your following companion to the pickup · keep the passenger door clear':'Find the blue pickup marker';}if(this.mission.story==='clear')return '';if(this.throwing||this.status!=='playing')return '';if(this.action?.approach)return 'Moving into reach…';if(this.action)return this.action.kind==='rescue'?'Freeing companion…':this.action.kind==='key'?'Picking up key…':'Opening gate…';if(this.player.y>.1||!this.player.grounded||this.traversal)return '';if(this.companion)return this.canInteract?this.companion.rescued?this.companion.waiting?'Ask companion to follow':'Ask companion to wait':'Free companion':'';if(!this.hasKey&&distance(this.player,this.world.key)<1.65)return 'Pick up key';if(distance(this.player,this.world.gate)<2.25&&!this.opening)return this.hasKey?'Unlock gate':'Gate locked · find the key';return '';}
 shotTargets(owner='player'):ShotTarget[]{return [...(owner==='player'?[]:[{id:'player',body:this.player,alive:this.playerCombat.health>0}]),...this.enemies.filter(e=>e.id!==owner).map(e=>({id:e.id,body:e,alive:e.combat.health>0})),...(this.companion?[{id:'companion',body:this.companion,alive:this.companion.combat.health>0}]:[])];}
 /** Advance the same simulation at any display refresh rate. Interact is an edge, not held input. */
 update(dt:number,input:Input){if(this.status!=='playing')return;this.accumulator+=Math.min(.1,Math.max(0,dt));this.interactionQueued ||= input.interact;this.jumpQueued ||= !!input.jump;this.meleeQueued ||= !!input.melee;this.fireQueued ||= !!input.fire;this.reloadQueued ||= !!input.reload;if(input.throwGrenade){this.grenadeQueued=true;this.grenadeAim=input.aim?{...input.aim}:undefined;}let melee=this.meleeQueued,interact=this.interactionQueued,jump=this.jumpQueued,fire=this.fireQueued,refill=this.reloadQueued,toss=this.grenadeQueued;while(this.accumulator+1e-9>=1/60&&this.status==='playing'){this.step(1/60,{...input,melee,interact,jump,fire,reload:refill,throwGrenade:toss,aim:toss?this.grenadeAim:input.aim});melee=false;this.meleeQueued=false;interact=false;jump=false;fire=!!input.fire;refill=false;toss=false;this.grenadeQueued=false;this.grenadeAim=undefined;this.interactionQueued=false;this.jumpQueued=false;this.fireQueued=false;this.reloadQueued=false;this.accumulator=Math.max(0,this.accumulator-1/60);}}
 /** Drop buffered combat input when focus leaves the game, including sub-frame taps. */
 releaseCombat(){this.meleeQueued=false;this.grenadeAim=undefined;this.grenadeQueued=false;this.fireQueued=false;this.reloadQueued=false;this.interactionQueued=false;this.jumpQueued=false;this.playerCombat.aiming=false;}
 private hurtPlayer(amount:number,direction:HitDirection,kind:'bullet'|'blast'='bullet'){this.damageTaken+=Math.min(this.playerCombat.health,amount);damage(this.playerCombat,amount,direction,kind);}
 private shoot(owner:string,body:Body,aim:Point3,volumes:ReturnType<typeof solidVolumes>){
  const targets=this.shotTargets(owner),shooter=owner==='player'?undefined:this.enemies.find(e=>e.id===owner),gun=owner==='player'?this.playerCombat.weapon:shooter?.combat.weapon??'pistol',profile=weaponProfile(gun),enemyDamage=shooter?.kind==='sniper'?50:profile.enemyDamage;
  const shot={...traceShot(body,aim,volumes,targets,shooter?.kind==='sniper'?42:profile.range),weapon:isGun(gun)?gun:undefined,id:++this.shotSequence,owner};this.shots.push(shot);if(this.shots.length>32)this.shots.shift();if(shooter?.kind==='heavy'&&shot.blocked&&Math.hypot(aim.x-this.player.x,aim.z-this.player.z)<4)this.playerCombat.suppression=Math.min(1,(this.playerCombat.suppression??0)+.24);
  if(owner==='player'){
   this.alarmRaised=true;this.protection=0;for(const e of this.enemies)if(distance(e,body)<18)investigate(e,body);
   const enemy=this.enemies.find(e=>e.id===shot.hit);if(enemy){damage(enemy.combat,profile.damage,hitDirection(enemy,body));if(enemy.combat.health===0){enemy.combat.deathFloor=supportAt(enemy,enemy.y,this.traversalVolumes,enemy.radius);enemy.speed=0;enemy.path=[];this.reward(`defeat-${enemy.id}${this.waveSerial?'-wave-'+this.waveSerial:''}`,'Enemy defeated','combat',100);this.emit('enemy-defeated','Enemy down. Keep moving toward extraction.');}else{enemy.lastKnown={x:body.x,z:body.z};if(enemy.mode!=='chase')enemy.mode='investigate';enemy.repath=0;}}
   if(this.mission.plan==='quiet')this.fail('alarm','The gunshot raised the alarm. Stay silent in Leave no trace.');
  }else if(shot.hit==='player'&&this.protection===0){this.hurtPlayer(enemyDamage*(this.mission.difficulty==='easy'?.65:this.mission.difficulty==='hard'?1.35:1),hitDirection(this.player,body));if(this.playerCombat.health===0){this.playerCombat.deathFloor=supportAt(this.player,this.player.y,this.traversalVolumes,this.player.radius);this.fail('defeated','You were defeated. Use cover and watch for enemy aim.');}}
  else if(shot.hit==='companion'&&this.companion?.rescued&&this.protection===0){damage(this.companion.combat,enemyDamage,hitDirection(this.companion,body));if(this.companion.combat.health===0)this.fail('companion-defeated','Your companion was defeated. Keep them out of enemy fire.');}
 }
 private grenadeStep(dt:number,volumes:ReturnType<typeof solidVolumes>){
  for(let i=this.projectiles.length-1;i>=0;i--){const g=this.projectiles[i];advanceGrenade(g,dt,volumes);if(g.age<GRENADE.fuse-1e-7)continue;
   this.projectiles.splice(i,1);this.explosions.push({id:g.id,position:{...g.position},time:this.time});if(this.explosions.length>8)this.explosions.shift();
   this.emit('explosion','Grenade detonated.');
   for(const e of this.enemies){if(e.combat.health<=0)continue;const amount=blastDamage(g.position,e,volumes);if(amount){damage(e.combat,amount,hitDirection(e,g.position),'blast');if(e.combat.health===0){e.speed=0;e.path=[];e.combat.deathFloor=supportAt(e,e.y,volumes,e.radius);this.reward(`defeat-${e.id}${this.waveSerial?'-wave-'+this.waveSerial:''}`,'Enemy defeated','combat',100);}}if(e.combat.health>0&&distance(e,g.position)<24)investigate(e,g.position);}
   // Explosions can hurt the thrower and the companion: cover matters for everyone.
   const self=blastDamage(g.position,this.player,volumes);if(self){this.hurtPlayer(self,hitDirection(this.player,g.position),'blast');if(this.playerCombat.health===0){this.playerCombat.deathFloor=supportAt(this.player,this.player.y,this.traversalVolumes,this.player.radius);this.fail('defeated','Caught in the blast. Throw farther away or use cover.');}}
   if(this.companion&&this.companion.combat.health>0){const c=this.companion,amount=blastDamage(g.position,c,volumes);if(amount){damage(c.combat,amount,hitDirection(c,g.position));if(c.combat.health===0)this.fail('companion-defeated','Your companion was caught in the blast. Keep grenades away from them.');}}
   if(this.mission.plan==='quiet')this.fail('alarm','The explosion raised the alarm. Stay silent in Leave no trace.');
  }
 }
 private combatStep(dt:number,input:Input,volumes:ReturnType<typeof solidVolumes>){
  const c=this.playerCombat,ready=!this.downloading&&!this.playerCombat.melee&&!this.airBusy&&!this.boarding&&(!this.vehicleBusy||this.car?.phase==='driving')&&!this.action&&!this.throwing&&!this.traversal&&this.player.grounded&&this.player.landing===0;
  if(input.reload&&ready)reload(c);
  if(input.fire&&ready&&c.aim&&c.aiming){if(spendRound(c))this.shoot('player',this.player,c.aim,volumes);else if(c.magazine===0)reload(c);}
  if(this.status!=='playing')return;
  for(const e of this.enemies){
   const gun=e.combat;gun.aiming=false;
   const target=e.target==='companion'&&this.companion?.rescued?this.companion:this.player,targetId=target===this.companion?'companion':'player';
   const relativeAim=Math.atan2(Math.sin(Math.atan2(target.x-e.x,target.z-e.z)-e.yaw),Math.cos(Math.atan2(target.x-e.x,target.z-e.z)-e.yaw)),reachable=!e.vehicle||Math.abs(relativeAim)<=110*Math.PI/180;
   const role=roleProfile(e.kind),range=e.kind?role.range:e.response==='pistol'?14:weaponProfile(gun.weapon).range,clear=traceShot(e,chest(target),e.vehicle?volumes.filter(v=>v.id!=='pursuit'):volumes,this.shotTargets(e.id),range).hit===targetId,suppress=e.kind==='heavy'&&e.unseen<2.4;
   if(!reachable||gun.health<=0||!isGun(e.response)||this.protection>0||e.mode!=='chase'||distance(e,target)>range||!clear&&!suppress){gun.windup=0;gun.burst=0;continue;}
   if(gun.magazine===0){reload(gun);gun.burst=0;continue;}if(gun.reload>0)continue;
   gun.aiming=true;const aim=clear?chest(target):{x:e.lastKnown.x,y:chest(target).y,z:e.lastKnown.z};
   if(gun.cooldown>0){gun.aim=aim;gun.pitch=aimPitch(e,aim);continue;}
   const temperament=e.aggression==='cautious'?{windup:1.2,interval:1.3}:e.aggression==='relentless'?{windup:.65,interval:.8}:{windup:.9,interval:1},profile=e.kind?{windup:role.windup*temperament.windup,interval:role.interval*temperament.interval}:temperament;
   if(gun.weapon==='rifle'&&(gun.burst??0)>0){gun.aim=aim;gun.pitch=aimPitch(e,aim);if(spendRound(gun)){gun.burst!--;this.shoot(e.id,e,aim,e.vehicle?volumes.filter(v=>v.id!=='pursuit'):volumes);if(gun.burst===0)gun.cooldown=profile.interval;}}
   else{
    if(gun.windup===0){gun.windup=profile.windup;gun.aim=aim;}else gun.windup=Math.max(0,gun.windup-dt);
    if(gun.aim){gun.pitch=aimPitch(e,gun.aim);if(gun.windup===0&&spendRound(gun,gun.weapon==='rifle'?weaponProfile(gun.weapon).interval:profile.interval)){gun.burst=gun.weapon==='rifle'?Math.max(0,(e.kind?role.burst:3)-1):0;this.shoot(e.id,e,gun.aim,e.vehicle?volumes.filter(v=>v.id!=='pursuit'):volumes);if(gun.burst===0)gun.cooldown=profile.interval;}}
   }
   if(this.status!=='playing')return;
  }
 }
 get currentStep(){const s=this.stagedSteps[this.stepIndex];if(s?.step.type==='eliminate'){const target=this.enemies.find(e=>e.id===s.step.target);if(target)return {...s,position:{x:target.x,z:target.z}};}return s;}
 get nearStep(){const s=this.currentStep;return !!s&&this.player.y<.15&&this.player.grounded&&distance(this.player,s.position)<s.radius&&!this.action&&!this.traversal&&!this.vehicleBusy;}
 get chainProgress(){const s=this.currentStep;if(!s)return 'Reach extraction';return stepLabel(s.step)+(s.step.type==='download'||s.step.type==='defend'?` · ${Math.floor(this.stepProgress)}/${s.step.duration??(s.step.type==='defend'?60:8)}s`:s.step.type==='survive'?` · wave ${this.wave}/${s.step.waves??1}`:'');}
 private chainStep(dt:number){const staged=this.currentStep;if(!staged)return;const {step,position}=staged;let done=false;
  if(step.type==='reach')done=this.nearStep;
  if(step.type==='download'){if(this.downloading&&!this.playerCombat.melee){this.playerCombat.aiming=false;this.stepProgress+=dt;}done=this.stepProgress>=(step.duration??8);}
  if(step.type==='defend'){if(this.nearStep)this.stepProgress+=dt;done=this.stepProgress>=(step.duration??60);}
  if(step.type==='eliminate')done=this.enemies.find(e=>e.id===step.target)?.combat.health===0;
  if(step.type==='escort')done=this.nearStep&&!!this.companion?.rescued&&distance(this.companion,position)<3;
  if(step.type==='survive'&&this.remainingEnemies===0){if(this.wave>=(step.waves??1))done=true;else{this.waveDelay+=dt;if(this.waveDelay>=2){const starts=stageEnemies(this.world,this.enemies).map((p,i)=>this.pursuit?.driver===this.enemies[i].id?{...p,x:this.pursuit.car.x,z:this.pursuit.car.z,yaw:this.pursuit.car.yaw}:p);if(starts.some(p=>distance(p,this.player)<5)){this.emit('wave-wait','Move away from the reinforcement entry points.');this.waveDelay=0;}else{this.wave++;this.waveSerial++;this.waveDelay=0;this.moraleReported=false;this.enemies.forEach((e,i)=>{Object.assign(e,starts[i],{mode:'investigate',awareness:.6,lastKnown:{x:this.player.x,z:this.player.z},path:[],repath:0,unseen:0,foundBodies:[]});Object.assign(e.combat,makeCombatant({weapon:isGun(e.response)?e.response:'none',health:e.health??100,ammunition:'unlimited'}));});this.emit('reinforcements',`Reinforcements inbound · wave ${this.wave}/${step.waves??1}`);}}}}
  if(done){this.objective('step-'+this.stepIndex,stepLabel(step),500);this.emit('objective-complete',stepLabel(step)+' complete.');this.stepIndex++;this.stepProgress=0;this.wave=this.currentStep?.step.type==='survive'&&this.remainingEnemies===0?0:1;this.waveDelay=0;if(this.progression.weapon==='objective')this.unlockPistol();if(this.currentStep)this.emit('objective',this.chainProgress);else this.emit('objective','All steps complete. Reach extraction.');}
 }
 private noise(point:Point,radius:number){for(const enemy of this.enemies)if(enemy.combat.health>0&&Math.hypot(enemy.x-point.x,enemy.z-point.z)<radius)investigate(enemy,point);}
 private meleeStep(dt:number,input:Input){const c=this.playerCombat;
  if(input.melee&&!this.airBusy&&!c.melee&&c.cooldown===0&&this.player.grounded&&this.player.y<.2&&!this.vehicleBusy&&!this.action&&!this.boarding&&!this.traversal&&!this.throwing){const target=this.enemies.filter(e=>e.combat.health>0&&distance(e,this.player)<1.8&&Math.abs(e.y-this.player.y)<.6&&sight(this.player,e,this.combatVolumes)).sort((a,b)=>distance(a,this.player)-distance(b,this.player))[0];if(target){const angle=Math.atan2(this.player.x-target.x,this.player.z-target.z)-target.yaw,silent=(this.player.crouch??0)>.5&&Math.cos(angle)<-.5&&target.mode!=='chase';c.melee={time:0,target:target.id,silent,hit:false};this.player.yaw=Math.atan2(target.x-this.player.x,target.z-this.player.z);c.aiming=false;c.reload=0;c.cooldown=.95;this.protection=0;}}
  if(!c.melee)return;const m=c.melee;m.time+=dt;
  if(!m.hit&&m.time>=.32){m.hit=true;const e=this.enemies.find(e=>e.id===m.target);if(e&&e.combat.health>0&&distance(e,this.player)<1.85&&Math.abs(e.y-this.player.y)<.6&&sight(this.player,e,this.combatVolumes)){damage(e.combat,m.silent?e.combat.health:45,hitDirection(e,this.player),'melee');if(e.combat.health===0){e.speed=0;e.path=[];e.combat.deathFloor=supportAt(e,e.y,this.traversalVolumes,e.radius);this.reward(`defeat-${e.id}${this.waveSerial?'-wave-'+this.waveSerial:''}`,m.silent?'Silent takedown':'Enemy defeated','combat',m.silent?150:100);}else{e.mode='chase';e.awareness=1;e.lastKnown={x:this.player.x,z:this.player.z};}this.emit(m.silent?'takedown':'melee-hit',m.silent?'Silent takedown. Keep the body out of patrol sight.':'Melee strike.');if(!m.silent)this.noise(this.player,8);}}
  if(m.time>=.9)c.melee=undefined;
 }
 private step(dt:number,input:Input){
  this.time+=dt;this.elapsed+=dt;this.protection=Math.max(0,this.protection-dt);
  tickCombat(this.playerCombat,dt);for(const e of this.enemies)tickCombat(e.combat,dt);if(this.companion)tickCombat(this.companion.combat,dt);
  const volumes=[...solidVolumes(this.world,this.door),...(this.air&&this.air.phase!=='departing'?[{...airHull(this.air),h:2.4,id:'helicopter',climbable:false}]:[])];
  this.downloading=!!input.interactHeld&&this.currentStep?.step.type==='download'&&this.nearStep&&Math.hypot(input.x,input.z)<.1&&!input.fire&&!input.jump;this.meleeStep(dt,input);if(this.downloading){this.player.yaw=Math.PI;this.playerCombat.reload=0;}
  const duck=!!input.crouch&&this.player.grounded&&!input.jump&&!this.vehicleBusy&&!this.boarding&&!this.action&&!this.throwing&&!this.traversal;
  this.player.crouch=Math.max(0,Math.min(1,(this.player.crouch??0)+(duck?1:-1)*dt*7));
  if(input.jump&&!this.airBusy&&!this.boarding&&!this.vehicleBusy&&!this.action&&!this.throwing&&!this.traversal&&this.mission.movement==='agile')this.traversal=planTraversal(this.player,{x:input.x,z:input.z},this.car?[...volumes,...vehicleVolumes(this.car)]:volumes);
  if(this.companion&&distance(this.player,this.companion)<3&&sight(this.player,this.companion,volumes))this.companion.located=true;
  if(input.interact&&this.canInteract&&!(this.currentStep?.step.type==='download'&&this.nearStep)){
   if(this.air&&(this.airBusy||this.nearAir&&this.extractionReady)){this.air.phase=this.air.phase==='seated'?'alighting':'approach';this.air.time=0;this.air.approach=undefined;}
   else if(this.nearCargo&&!this.vehicleBusy){const anchor=this.cargoAnchor();if(anchor)this.action={kind:'cargo',time:0,done:false,approach:true,anchor};else this.emit('cargo-reach','Move beside the item to reach it.');}
   else if(this.car&&this.hasKey&&(this.vehicleBusy||this.canBoardPickup)){if(this.car.phase==='driving'){this.car.phase='alighting';if(this.companion?.riding?.phase==='seated')this.companion.riding={phase:'alighting',time:0};else if(this.companion)this.companion.riding=undefined;}else{this.boarding={anchor:driverStand(this.car),time:0};if(this.companion&&!this.companion.riding)beginPassenger(this.companion);}this.car.time=0;this.car.speed=0;this.velocity={x:0,z:0};this.playerCombat.reload=0;}else if(this.companion){if(this.companion.rescued){this.companion.waiting=!this.companion.waiting;this.companion.repath=0;this.companion.path=[];this.emit('escort-order',this.companion.waiting?'Companion waiting here. Return and ask them to follow when ready.':'Companion following. Reach extraction together.');}else{const anchor=this.rescueAnchor();if(anchor)this.action={kind:'rescue',time:0,done:false,approach:true,anchor};else this.emit('rescue-reach','Move beside your companion to free them.');}}
   else if(!this.hasKey&&distance(this.player,this.world.key)<1.65){this.action={kind:'key',time:0,done:false,approach:true};this.player.yaw=Math.atan2(this.world.key.x-this.player.x,this.world.key.z-this.player.z);}
   else if(this.hasKey&&distance(this.player,this.world.gate)<2.25&&!this.opening){this.action={kind:'door',time:0,done:false,approach:true};this.player.yaw=Math.atan2(this.world.gate.x-this.player.x,this.world.gate.z-this.player.z);}
  }
  if(input.throwGrenade&&!this.airBusy&&!this.boarding&&!this.vehicleBusy&&this.grenades>0&&!this.throwing&&!this.action&&!this.traversal&&this.player.grounded&&this.player.landing===0&&this.playerCombat.reload===0&&input.aim&&[input.aim.x,input.aim.y,input.aim.z].every(Number.isFinite)){
   const target={...input.aim},yaw=Math.atan2(target.x-this.player.x,target.z-this.player.z);this.throwing={time:0,released:false,target,yaw};this.grenades--;this.velocity={x:0,z:0};this.player.yaw=yaw;this.playerCombat.aiming=false;
  }
  if(this.throwing){const t=this.throwing;t.time+=dt;this.player.yaw=t.yaw;if(!t.released&&t.time>=GRENADE.release){t.released=true;this.projectiles.push(safeLaunch(this.player,t.target,volumes,++this.grenadeSequence));this.protection=0;this.emit('grenade-thrown','Grenade thrown. Move away from the blast.');}if(t.time>=GRENADE.duration)this.throwing=undefined;}
  if(this.action||this.traversal||this.throwing)this.playerCombat.reload=0;
  const c=this.playerCombat,validAim=input.aim&&[input.aim.x,input.aim.y,input.aim.z].every(Number.isFinite);
  c.aiming=isGun(c.weapon)&&!!(input.aiming||input.fire)&&!!validAim&&!this.downloading&&!c.melee&&!this.airBusy&&!this.boarding&&(!this.vehicleBusy||this.car?.phase==='driving')&&!this.action&&!this.throwing&&!this.traversal&&this.player.grounded&&c.reload===0;
  if(c.aiming&&input.aim){c.aim=this.car?.phase==='driving'?mountedAim(this.player,input.aim):{...input.aim};c.pitch=aimPitch(this.player,c.aim);}
  const anchor=this.boarding?.anchor??this.action?.anchor??(this.action?.kind==='rescue'?this.action.anchor??this.world.rescue.approach:this.action?.kind==='cargo'?this.world.checkpoints.cargo:this.action?.kind==='key'?this.world.checkpoints.key:this.world.checkpoints.gate);
  if(this.boarding){this.boarding.time+=dt;if(distance(this.player,anchor)<.05){Object.assign(this.player,anchor);this.boarding=undefined;this.car!.phase='boarding';this.car!.time=0;this.velocity={x:0,z:0};}else if(this.boarding.time>2.5||!entryClear(this.car!,this.player.radius,volumes,this.enemies.filter(e=>e.combat.health>0))){this.boarding=undefined;this.emit('door-blocked','Move beside a clear driver’s door to board.');}}
  if(this.action?.approach){const a=this.action;a.approachTime=(a.approachTime??0)+dt;
   if(distance(this.player,anchor)<.06){a.approach=false;this.player.yaw=a.anchor?.yaw??(a.kind==='rescue'?anchor.yaw:Math.PI);this.velocity={x:0,z:0};}
   else if(a.approachTime>2.5||input.jump||a.approachTime>.12&&Math.hypot(input.x,input.z)>.1&&input.x*(anchor.x-this.player.x)+input.z*(anchor.z-this.player.z)<=0){this.action=undefined;this.velocity={x:0,z:0};this.emit('interaction-blocked','Approach cancelled. Move closer and interact again.');}
  }
  if(this.action&&!this.action.approach){this.action.time+=dt;const timing=INTERACTIONS[this.action.kind],contact=timing.contact;if(!this.action.done&&this.action.time>=contact){this.action.done=true;if(this.action.kind==='cargo'){this.hasCargo=true;this.objective('cargo',`${this.world.cargo!.kind} secured`,500);this.emit('cargo',`${this.world.cargo!.kind} secured. Finish the mission and get out.`);}else if(this.action.kind==='key'){this.hasKey=true;this.objective('key','Key collected',250);if(this.car){this.opening=true;this.emit('key','Pickup keys collected. Return to the waiting truck.');}else this.emit('key','Key collected. Unlock the gate.');}else if(this.action.kind==='door'){this.opening=true;this.objective('gate','Gate unlocked',350);for(const enemy of this.enemies)if(distance(enemy,this.world.gate)<12)investigate(enemy,{x:this.world.gate.x,z:this.world.gate.z-1.8});this.emit('door','The gate is opening. The guard heard it.');}}if(this.action.time>timing.duration){if(this.action.kind==='rescue'&&this.companion){this.companion.rescued=true;this.objective('rescue','Companion freed',600);this.companion.state='following';this.companion.repath=0;if(this.car)this.hasKey=true;this.emit('rescued',this.car?'Companion freed. Lead them to the pickup and board together.':'Companion freed. Stay close and reach extraction together.');}this.action=undefined;}}
  if(this.opening)this.door=Math.min(1,this.door+dt/1.1);
  const rects=[...missionObstacles(this.world,this.door),...(this.air&&this.air.phase!=='departing'?[airHull(this.air)]:[])],n=Math.hypot(input.x,input.z),speed=this.downloading||this.action||this.throwing||c.melee?0:duck?1.15:c.aiming?1.8:c.reload>0?2.15:input.sprint?4.5:2.15;
  const approach=!!this.boarding||this.action?.approach,reach=distance(this.player,anchor),target=approach?{x:(anchor.x-this.player.x)/reach*1.6,z:(anchor.z-this.player.z)/reach*1.6}:n>.01?{x:input.x/Math.max(1,n)*speed,z:input.z/Math.max(1,n)*speed}:{x:0,z:0};
  const smooth=1-Math.exp(-dt*12);this.velocity.x+=(target.x-this.velocity.x)*smooth;this.velocity.z+=(target.z-this.velocity.z)*smooth;
  const old={x:this.player.x,z:this.player.z};
  if(this.airBusy){this.airStep(dt,volumes);}else if(this.vehicleBusy){this.drive(dt,input);}else if(this.traversal){
   const t=this.traversal;this.velocity={x:0,z:0};
   if(t.approach)approachTraversal(this.player,t,dt,volumes);
   else{t.time=Math.min(t.duration,t.time+dt);Object.assign(this.player,traversalPosition(t));this.player.yaw=Math.atan2(t.normal.x,t.normal.z);this.player.grounded=false;this.player.speed=0;if(t.time>=t.duration){Object.assign(this.player,t.to);this.player.grounded=true;this.player.vy=0;this.player.landing=0;this.traversal=undefined;}}
  }else{
   const actorVolume=[...(this.air?[{...airHull(this.air),h:2.4,id:'helicopter',climbable:false}]:[]),...this.enemies.filter(e=>e.combat.health>0&&Math.abs(this.player.y-e.y)<e.height).map(enemyVolume)];
   if(this.pursuit)actorVolume.push({...carObstacle(this.pursuit.car),h:this.pursuit.car.fit.height,id:'pursuit',climbable:false});
   if(this.car)actorVolume.push(...vehicleVolumes(this.car));
   if(this.companion&&!this.companion.riding&&this.companion.combat.health>0&&Math.abs(this.player.y-this.companion.y)<this.companion.height)actorVolume.push(enemyVolume(this.companion));
   motorStep(this.player,this.velocity.x*dt,this.velocity.z*dt,dt,[...volumes,...actorVolume],!!input.jump&&this.mission.movement==='agile'&&!this.action&&!this.throwing,this.world.bounds);
   this.player.speed=distance(old,this.player)/dt;
   if(!this.throwing&&(c.aiming&&c.aim||this.player.speed>.06)){const want=c.aiming&&c.aim?Math.atan2(c.aim.x-this.player.x,c.aim.z-this.player.z):Math.atan2(this.player.x-old.x,this.player.z-old.z),delta=Math.atan2(Math.sin(want-this.player.yaw),Math.cos(want-this.player.yaw));this.player.yaw+=delta*Math.min(1,dt*14);}
  }
  if(this.mission.stealth&&this.time-this.noiseTime>1&&this.player.grounded&&this.player.speed>3&&!this.vehicleBusy){this.noise(this.player,7);this.noiseTime=this.time;}
  const friend=this.companion&&this.companion.combat.health>0?this.companion:undefined;
  const reservations=this.car?[carObstacle(this.car),...(this.car.phase==='boarding'||this.car.phase==='alighting'?[{minX:driverStand(this.car).x-this.player.radius-.1,maxX:driverStand(this.car).x+this.player.radius+.1,minZ:driverStand(this.car).z-this.player.radius-.1,maxZ:driverStand(this.car).z+this.player.radius+.1}]:[])]:[];
  if(this.car&&friend?.riding&&friend.riding.phase!=='seated'){const p=passengerStand(this.car),r=friend.radius+.1;reservations.push({minX:p.x-r,maxX:p.x+r,minZ:p.z-r,maxZ:p.z+r});}
  if(this.pursuit){const p=this.pursuit,driver=this.enemies.find(e=>e.id===p.driver)!;if(driver.combat.health>0&&driver.mode==='chase'){pursuitStep(p,dt,this.player,this.vehicleSettings,[...rects,...(this.car?[carObstacle(this.car)]:[])],this.world.bounds,[this.player,...(this.companion?[this.companion]:[]),...this.enemies.filter(e=>e.id!==p.driver&&e.combat.health>0)]);if(!p.reported){p.reported=true;this.emit('vehicle-pursuit','Enemy pickup in pursuit. Break sight and use solid cover.');}}else p.car.speed=0;Object.assign(driver,{x:p.car.x,z:p.car.z,yaw:p.car.yaw,speed:0});reservations.push(carObstacle(p.car));}
  if(this.mission.overwatch&&this.time-this.overwatchTime>14){this.overwatchTime=this.time;const threat=this.enemies.filter(e=>e.combat.health>0).sort((a,b)=>distance(a,this.player)-distance(b,this.player))[0];if(threat){const dx=threat.x-this.player.x,dz=threat.z-this.player.z;this.emit('overwatch',`Overwatch: contact ${Math.abs(dx)>Math.abs(dz)?dx>0?'east':'west':dz>0?'south':'north'}, ${Math.round(distance(threat,this.player))} metres.`);}}
  updateEnemies({dt,player:this.player,companion:friend,companionActive:friend?.rescued,enemies:this.enemies,patrol:this.world.patrol,volumes:this.car&&!this.vehicleBusy?[...volumes,...vehicleVolumes(this.car)]:volumes,rects:[...rects,...reservations],navigationVolumes:this.car?[...volumes,...vehicleVolumes(this.car)]:volumes,bounds:this.world.bounds,protectedPlayer:this.protection>0,morale:this.squadMorale,bodies:!!this.mission.stealth,visibility:body=>(this.mission.difficulty==='easy'?.8:this.mission.difficulty==='hard'?1.15:1)*visibilityMultiplier(this.mission.environment??defaultEnvironment(),body,this.world.bounds,this.world.gate,body===this.player&&this.flashlight),emit:(type,text)=>this.emit(type,text)});
  if(friend?.riding&&this.car){if(!stepPassenger(friend,this.car,dt,rects,[this.player,...this.enemies.filter(e=>e.combat.health>0)],this.world.bounds))this.emit('passenger-blocked','Passenger door blocked. Exit and lead your companion to a clear door.');}
  else if(friend&&!this.airBusy){const state=friend.state;updateCompanion({dt,companion:friend,player:this.player,rects:this.car?[...rects,carObstacle(this.car)]:rects,exit:this.world.exit,bounds:this.world.bounds,others:[this.player,...this.enemies.filter(e=>e.combat.health>0)],busy:!!this.action});if(friend.state!==state&&friend.rescued){if(friend.state==='blocked')this.emit('escort-blocked','Your companion needs a clear ground route. Return and lead them around the obstacle.');else if(friend.state==='ground')this.emit('escort-ground','Your companion is waiting on the ground. Come down to continue.');}}
  this.grenadeStep(dt,volumes);
  if(this.status==='playing')this.combatStep(dt,input,this.combatVolumes);
  if(this.status==='playing')this.chainStep(dt);
  if(this.squadMorale<1&&!this.moraleReported){this.moraleReported=true;this.emit('leader-down','Squad leader down. The remaining guards are shaken.');}
  this.collectSupplies();
  if(this.mission.plan==='timed'&&this.time>=this.timeLimit)this.fail('time','Time ran out. Try a quicker route.');
  if(this.protection===0&&this.mission.plan==='quiet'&&this.enemies.some(e=>e.combat.health>0&&e.mode==='chase'))this.fail('alarm','The alarm was raised. Find a route that stays out of sight.');
  if(this.protection===0&&this.status==='playing'&&!this.vehicleBusy&&this.enemies.some(e=>e.combat.health>0&&!isGun(e.response)&&e.mode==='chase'&&Math.hypot(e.x-this.player.x,e.z-this.player.z,e.y-this.player.y)<this.player.radius+e.radius+.1&&sight(e,this.player,volumes))){this.fail('caught','Caught by the guard. Try using the containers as cover.');}
  if(this.protection===0&&friend?.rescued&&this.status==='playing'&&friend.riding?.phase!=='seated'&&this.enemies.some(e=>e.combat.health>0&&!isGun(e.response)&&e.mode==='chase'&&distance(e,friend)<e.radius+friend.radius+.1&&sight(e,friend,volumes)))this.fail('companion-captured','Your companion was captured. Stay close and protect their route.');
  if(this.status==='playing'&&this.cleared&&!this.earned.some(r=>r.id==='clear')){if(this.car)this.hasKey=true;this.objective('clear','Squad cleared',800);this.emit('squad-cleared','Squad cleared. Extraction is open.');}
  if(this.car?.phase==='driving'&&this.readyToDrive&&!this.earned.some(r=>r.id==='vehicle')){this.objective('vehicle',this.companion?'Both boarded':'Pickup boarded',350);this.emit('boarded',this.companion?'Both aboard. Drive to extraction and stop in the green ring.':'Pickup ready. Accelerate, steer and brake to reach extraction.');}
  if(this.status==='playing'&&this.extractionReady&&(this.air?this.air.phase==='departing'&&this.air.time>=4:this.player.y<.15&&(this.car?pickupAtExtraction(this.car,this.world.exit):distance(this.player,this.world.exit)<1.7))&&(!this.companion||!!this.air||this.companion.rescued&&this.companion.combat.health>0&&(this.car?this.companion.riding?.phase==='seated':distance(this.companion,this.world.exit)<2.2))){this.status='won';if(this.progression.reward)this.unlockWeapon(strongerWeapon(this.playerCombat.weapon,this.progression.reward) as 'pistol'|'rifle');if(this.car)this.car.speed=0;this.player.speed=0;this.objective('escape',this.companion?'Both escaped':'Extraction reached',1000);this.reward('time-bonus','Time bonus','bonus',Math.max(0,300-Math.floor(this.elapsed)*2));this.reward('retry-bonus','Few retries bonus','bonus',Math.max(0,200-(this.attempts-1)*50));this.emit('escape',this.companion?'You both made it to extraction.':this.mission.story==='clear'?'Squad cleared. Extraction complete.':`You escaped the ${this.world.name.toLowerCase()}.`);}
  if(this.status==='won'||this.status==='caught'){if(this.car)this.car.speed=0;for(const e of this.enemies)e.speed=0;this.player.speed=0;if(this.companion)this.companion.speed=0;}
  if(this.status==='playing'&&this.car?.phase==='driving'&&this.readyToDrive&&this.routeTarget&&distance(this.car,this.routeTarget)<4.5){this.routeStage++;this.emit('route',this.routeTarget?`Road checkpoint ${this.routeStage} reached. Follow the next gold marker.`:'Road clear. Drive to extraction and stop.');}
  this.saveCheckpoint();
 }
}
