/** Portable settings and deterministic geometry for the district between chapters. */
import type {MissionWorld} from './mission';
import type {Block} from './world';

export interface CitySettings {size:'local'|'district'|'vast';pedestrians:0|2|4|8;traffic:0|4|8|12;movingTraffic:0|4|8|12;police:boolean;repairShop:boolean;gunShop:boolean;pedestrianFights:boolean;pedestrianHostility:'peaceful'|'retaliate'|'mixed'|'hostile';weaponSwitch:boolean;radio:boolean;radioCountry:string}
export const defaultCity=():CitySettings=>({size:'vast',pedestrians:2,traffic:8,movingTraffic:8,police:true,repairShop:true,gunShop:true,pedestrianFights:false,pedestrianHostility:'retaliate',weaponSwitch:true,radio:false,radioCountry:'NG'});
export const cityExtent=(settings:CitySettings)=>({local:60,district:150,vast:300}[settings.size]);
export const CITY_SHOPS={repair:{x:-23,z:32,front:-19.8,side:-1},gun:{x:23,z:32,front:19.8,side:1}} as const;
export const cityPedestrianPosition=(index:number,time:number,extent=300,count=2)=>{const rows=Math.ceil(count/2),base=Math.min(42,extent*.35),stride=Math.min(57,(extent-base-12)/Math.max(1,rows-1)),sway=Math.min(7,stride*.2);return {x:index%2?18:-18,z:(index%2?-1:1)*(base+Math.floor(index/2)*stride)+Math.sin(time*.22+index*2.1)*sway,yaw:Math.cos(time*.22+index*2.1)>0?0:Math.PI};};
export function parseCity(raw:unknown):CitySettings {
 if(raw===undefined)return defaultCity();if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Use valid city district settings.');
 const p=raw as Record<string,unknown>;if(Object.keys(p).some(key=>!['size','pedestrians','traffic','movingTraffic','police','repairShop','gunShop','pedestrianFights','pedestrianHostility','weaponSwitch','radio','radioCountry'].includes(key)))throw Error('Unsupported city district setting.');
 const result={...defaultCity(),...p};if(!['local','district','vast'].includes(String(result.size)))throw Error('City size must be Local, District or Vast.');
 if(![0,2,4,8].includes(Number(result.pedestrians)))throw Error('City pedestrians must be Off, Few, Normal or Crowded.');
 if(![0,4,8,12].includes(Number(result.traffic)))throw Error('City parked vehicles must be Off, Few, Normal or Many.');
 if(![0,4,8,12].includes(Number(result.movingTraffic)))throw Error('City moving traffic must be Off, Light, Normal or Busy.');
 if(!['peaceful','retaliate','mixed','hostile'].includes(String(result.pedestrianHostility)))throw Error('Pedestrian hostility must be Peaceful, Retaliate, Mixed or Hostile.');
 for(const key of ['police','repairShop','gunShop','pedestrianFights','weaponSwitch','radio'] as const)if(typeof result[key]!=='boolean')throw Error(`City ${key} must be on or off.`);
 if(typeof result.radioCountry!=='string'||!/^[A-Z]{2}$/.test(result.radioCountry))throw Error('Radio country must be a two-letter country code.');return result as CitySettings;
}
export function extendCity(world:MissionWorld,settings:CitySettings){
 const extent=cityExtent(settings),palette=['#879399','#a3aaa8','#77868b','#9c9790','#67777c'],blocks:Block[]=[];
 for(const sx of [-1,1])for(const sz of [-1,1])for(let ix=0;39+ix*52<extent/2-18;ix++)for(let iz=0;39+iz*52<extent-18;iz++){
  const x=sx*(39+ix*52),z=sz*(39+iz*52);if((ix+iz)%5===4||sz===1&&ix===0&&iz===0&&(sx<0?settings.repairShop:settings.gunShop))continue;
  blocks.push({id:`city-block-${sx<0?'w':'e'}${ix}-${sz<0?'n':'s'}${iz}`,x,z,w:24+(ix+iz)%3*2,d:26+(ix*2+iz)%3*2,h:5+(ix*3+iz*5)%5*2,kind:'building',color:palette[(ix+iz*2+(sx<0?1:0))%palette.length]});
 }
 for(const [id,enabled,side] of [['repair',settings.repairShop,-1],['gun',settings.gunShop,1]] as const){if(!enabled)continue;const x=side*24.7,z=32,color=id==='repair'?'#7d6658':'#556d70';
  for(const [part,bx,bz,w,d,h,baseY] of [
   ['back',side*29.6,z,.35,10.4,3.2,0],['north',x,26.8,10,.35,3.2,0],['south',x,37.2,10,.35,3.2,0],
   ['front-north',side*19.8,28.4,.35,3.2,3.2,0],['front-south',side*19.8,35.6,.35,3.2,3.2,0],
   ['lintel',side*19.8,z,.35,3.2,3.2,2.45],['roof',x,z,10,10.4,3.4,3.2],
  ] as const)blocks.push({id:`shop-${id}-${part}`,x:bx,z:bz,w,d,h,baseY,kind:'wall',color});
 }
 world.blocks=world.blocks.filter(block=>!['west','east','north','south'].includes(block.id)).concat(blocks);
 world.bounds={minX:-extent/2,maxX:extent/2,minZ:-extent,maxZ:extent};
 world.exit={x:0,z:-extent+14};world.id+=`-city-${settings.size}-${settings.pedestrians}-${settings.traffic}-${settings.movingTraffic}-${settings.police}`;
}
