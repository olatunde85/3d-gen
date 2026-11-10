import {isGun,weaponProfile,WEAPON_PROFILES,type Equipment,type Gun} from './weapons';
/** Deterministic pistol rules and height-aware hit tests, independent of rendering. */
import {rectLocal} from './world';
import {stanceHeight,type MotorBody,type Volume} from './motor';
export type Health=50|100|150;
export type Ammunition=24|48|96|'unlimited';
export type EnemyResponse='capture'|Gun;
export type HitDirection='front'|'back'|'left'|'right';
export type GrenadeInventory=0|2|5;
export interface Loadout {weapon:Equipment;health:Health;ammunition:Ammunition;grenades?:GrenadeInventory}
export const defaultLoadout=():Loadout=>({weapon:'none',health:100,ammunition:48});
export const PISTOL=WEAPON_PROFILES.pistol;
export interface Point3 {x:number;y:number;z:number}
export interface Combatant {
 weapon:Equipment;health:number;maxHealth:number;magazine:number;reserve:number|null;
 reload:number;cooldown:number;fireAge:number;hitAge:number;hitDirection:HitDirection;aiming:boolean;aim?:Point3;pitch:number;windup:number;
 melee?:{time:number;target?:string;silent:boolean;hit:boolean};damageKind?:'bullet'|'melee'|'blast';deathFloor?:number;burst?:number;suppression?:number;
}
export interface AmmoSnapshot {magazine:number;reserve:number|null}
export function makeCombatant(loadout:Omit<Loadout,'health'>&{health:number}):Combatant {
 const armed=isGun(loadout.weapon),profile=weaponProfile(loadout.weapon),total=loadout.ammunition==='unlimited'?null:loadout.ammunition;
 return {weapon:loadout.weapon,health:loadout.health,maxHealth:loadout.health,magazine:armed?Math.min(profile.magazine,total??profile.magazine):0,reserve:armed?total===null?null:Math.max(0,total-profile.magazine):0,reload:0,cooldown:0,fireAge:Infinity,hitAge:Infinity,hitDirection:'front',aiming:false,aim:undefined,pitch:0,windup:0,deathFloor:undefined};
}
export function parseLoadout(raw:unknown):Loadout {
 if(raw===undefined)return defaultLoadout();if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Use a valid player loadout.');
 const p=raw as Record<string,unknown>;for(const key of Object.keys(p))if(!['weapon','health','ammunition','grenades'].includes(key))throw Error(`Unsupported loadout setting: ${key}.`);
 if(p.grenades!==undefined&&![0,2,5].includes(p.grenades as number))throw Error('Choose no grenades, 2 grenades or 5 grenades.');
 const result={...defaultLoadout(),...p};if(result.weapon!=='none'&&!isGun(result.weapon))throw Error('Choose Unarmed, Pistol or Rifle.');if(![50,100,150].includes(result.health as number))throw Error('Choose 50, 100 or 150 health.');if(![24,48,96,'unlimited'].includes(result.ammunition as Ammunition))throw Error('Choose 24, 48, 96 or unlimited rounds.');return result as Loadout;
}
export function tickCombat(c:Combatant,dt:number){
 if(c.suppression)c.suppression=Math.max(0,c.suppression-dt*.3);
 c.cooldown=Math.max(0,c.cooldown-dt);c.fireAge+=dt;c.hitAge+=dt;
 if(c.health<=0){c.aiming=false;c.reload=0;c.windup=0;return;}
 if(c.reload>0){c.reload=Math.max(0,c.reload-dt);if(c.reload===0){const amount=Math.min(weaponProfile(c.weapon).magazine-c.magazine,c.reserve??weaponProfile(c.weapon).magazine);c.magazine+=amount;if(c.reserve!==null)c.reserve-=amount;}}
}
export function reload(c:Combatant):boolean {
 if(!isGun(c.weapon)||c.health<=0||c.reload>0||c.magazine===weaponProfile(c.weapon).magazine||c.reserve===0)return false;c.reload=weaponProfile(c.weapon).reload;c.aiming=false;c.windup=0;return true;
}
export function spendRound(c:Combatant,interval:number=weaponProfile(c.weapon).interval):boolean {
 if(!isGun(c.weapon)||c.health<=0||c.cooldown>0||c.reload>0||c.magazine===0)return false;c.magazine--;c.cooldown=interval;c.fireAge=0;return true;
}
export function damage(c:Combatant,amount:number,direction:HitDirection='front',kind:Combatant['damageKind']='bullet'){if(c.health<=0||amount<=0)return;c.damageKind=kind;c.health=Math.max(0,c.health-amount);c.hitAge=0;c.hitDirection=direction;if(c.health===0){c.reload=0;c.aiming=false;c.windup=0;}}
/** Record the impact relative to the victim's facing at the instant the shot lands. */
export function hitDirection(body:MotorBody,source:{x:number;z:number}):HitDirection {
 const angle=Math.atan2(source.x-body.x,source.z-body.z)-body.yaw,forward=Math.cos(angle);
 return forward>Math.SQRT1_2?'front':forward<-Math.SQRT1_2?'back':Math.sin(angle)>0?'left':'right';
}
export const chest=(b:MotorBody):Point3=>({x:b.x,y:b.y+stanceHeight(b)*.74,z:b.z});
export function aimPitch(body:MotorBody,target:Point3){const from=chest(body);return Math.max(-Math.PI/4,Math.min(Math.PI/3,Math.atan2(target.y-from.y,Math.hypot(target.x-from.x,target.z-from.z))));}
export interface ShotTarget {id:string;body:MotorBody;alive:boolean}
export interface Shot {weapon?:Gun;id:number;owner:string;from:Point3;to:Point3;hit?:string;blocked:boolean}
/** Distance along a finite ray to a box, including a ray beginning inside cover. */
export function boxHit(origin:Point3,dir:Point3,min:Point3,max:Point3,range:number):number|undefined {
 let near=0,far=range;for(const axis of ['x','y','z']as const){const d=dir[axis];if(Math.abs(d)<1e-9){if(origin[axis]<min[axis]||origin[axis]>max[axis])return;}else{const a=(min[axis]-origin[axis])/d,b=(max[axis]-origin[axis])/d;near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));if(near>far)return;}}return near;
}
/** Trace from the torso through the muzzle: a barrel pushed through a wall cannot bypass it. */
export function traceShot(body:MotorBody,target:Point3,volumes:readonly Volume[],targets:readonly ShotTarget[],range:number=PISTOL.range):Omit<Shot,'id'|'owner'> {
 const from=chest(body),yaw=Math.atan2(target.x-from.x,target.z-from.z),pitch=aimPitch(body,target),dir={x:Math.sin(yaw)*Math.cos(pitch),y:Math.sin(pitch),z:Math.cos(yaw)*Math.cos(pitch)};
 let length=range,hit:string|undefined,blocked=false;
 for(const v of volumes){const r=v.obb?.box??v,o=v.obb?{...rectLocal(from,v.obb),y:from.y}:from,c=Math.cos(v.obb?.yaw??0),s=Math.sin(v.obb?.yaw??0),direction=v.obb?{x:c*dir.x-s*dir.z,y:dir.y,z:s*dir.x+c*dir.z}:dir,d=boxHit(o,direction,{x:r.minX,y:0,z:r.minZ},{x:r.maxX,y:v.h,z:r.maxZ},length);if(d!==undefined&&d<=length){length=d;hit=undefined;blocked=true;}}
 if(dir.y<0){const floor=-from.y/dir.y;if(floor>=0&&floor<length){length=floor;blocked=true;}}
 for(const t of targets){if(!t.alive)continue;const b=t.body,d=boxHit(from,dir,{x:b.x-b.radius,y:b.y+.08,z:b.z-b.radius},{x:b.x+b.radius,y:b.y+stanceHeight(b)*.96,z:b.z+b.radius},length);if(d!==undefined&&d<length-1e-5){length=d;hit=t.id;blocked=false;}}
 return {from,to:{x:from.x+dir.x*length,y:from.y+dir.y*length,z:from.z+dir.z*length},hit,blocked};
}

/** Use exactly the same reachable mounted cone as Ara's weapon performance. */
export function mountedAim(body:MotorBody,target:Point3):Point3{const origin=chest(body),dx=target.x-origin.x,dz=target.z-origin.z,d=Math.max(2,Math.hypot(dx,dz)),relative=Math.atan2(Math.sin(Math.atan2(dx,dz)-body.yaw),Math.cos(Math.atan2(dx,dz)-body.yaw)),yaw=body.yaw+Math.max(-110*Math.PI/180,Math.min(110*Math.PI/180,relative)),pitch=Math.max(-45*Math.PI/180,Math.min(60*Math.PI/180,Math.atan2(target.y-origin.y,d)));return {x:origin.x+Math.sin(yaw)*d,y:origin.y+Math.tan(pitch)*d,z:origin.z+Math.cos(yaw)*d};}
