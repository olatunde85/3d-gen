/** Shared weapon rules drive simulation, animation, HUD and bundled sound selection. */
export type Gun='pistol'|'rifle';
export type Equipment='none'|Gun;
export interface WeaponProfile {name:string;magazine:number;reload:number;interval:number;range:number;damage:number;enemyDamage:number;fireWindow:number;sound:'suppressed-pistol-shot'|'rifle-shot'}
export const WEAPON_PROFILES:Record<Gun,WeaponProfile>={
 pistol:{name:'Pistol',magazine:12,reload:1.8,interval:.3,range:24,damage:34,enemyDamage:18,fireWindow:.5,sound:'suppressed-pistol-shot'},
 rifle:{name:'Rifle',magazine:30,reload:2.2,interval:.12,range:38,damage:26,enemyDamage:9,fireWindow:.22,sound:'rifle-shot'},
};
export const isGun=(value:unknown):value is Gun=>value==='pistol'||value==='rifle';
export const weaponProfile=(weapon:Equipment)=>WEAPON_PROFILES[weapon==='rifle'?'rifle':'pistol'];
export const strongerWeapon=(a:Equipment,b:Equipment):Equipment=>a==='rifle'||b==='rifle'?'rifle':a==='pistol'||b==='pistol'?'pistol':'none';
