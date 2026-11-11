/** Portable settings and deterministic geometry for the district between chapters. */
import type {MissionWorld} from './mission';
import type {Block} from './world';

export interface CitySettings {size:'local'|'district'|'vast';pedestrians:0|2|4|8;traffic:0|4|8|12;police:boolean;repairShop:boolean;gunShop:boolean;pedestrianFights:boolean;weaponSwitch:boolean;radio:boolean;radioCountry:string}
export const defaultCity=():CitySettings=>({size:'vast',pedestrians:2,traffic:8,police:true,repairShop:true,gunShop:true,pedestrianFights:false,weaponSwitch:true,radio:false,radioCountry:'NG'});
export const cityExtent=(settings:CitySettings)=>({local:60,district:150,vast:300}[settings.size]);
export const cityPedestrianPosition=(index:number,time:number,extent=300,count=2)=>{const rows=Math.ceil(count/2),base=Math.min(42,extent*.35),stride=Math.min(57,(extent-base-12)/Math.max(1,rows-1)),sway=Math.min(7,stride*.2);return {x:index%2?18:-18,z:(index%2?-1:1)*(base+Math.floor(index/2)*stride)+Math.sin(time*.22+index*2.1)*sway,yaw:Math.cos(time*.22+index*2.1)>0?0:Math.PI};};
export function parseCity(raw:unknown):CitySettings {
 if(raw===undefined)return defaultCity();if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Use valid city district settings.');
 const p=raw as Record<string,unknown>;if(Object.keys(p).some(key=>!['size','pedestrians','traffic','police','repairShop','gunShop','pedestrianFights','weaponSwitch','radio','radioCountry'].includes(key)))throw Error('Unsupported city district setting.');
 const result={...defaultCity(),...p};if(!['local','district','vast'].includes(String(result.size)))throw Error('City size must be Local, District or Vast.');
 if(![0,2,4,8].includes(Number(result.pedestrians)))throw Error('City pedestrians must be Off, Few, Normal or Crowded.');
 if(![0,4,8,12].includes(Number(result.traffic)))throw Error('City parked vehicles must be Off, Few, Normal or Many.');
 for(const key of ['police','repairShop','gunShop','pedestrianFights','weaponSwitch','radio'] as const)if(typeof result[key]!=='boolean')throw Error(`City ${key} must be on or off.`);
 if(typeof result.radioCountry!=='string'||!/^[A-Z]{2}$/.test(result.radioCountry))throw Error('Radio country must be a two-letter country code.');return result as CitySettings;
}
export function extendCity(world:MissionWorld,settings:CitySettings){
 const extent=cityExtent(settings),palette=['#879399','#a3aaa8','#77868b','#9c9790','#67777c'],blocks:Block[]=[];
 for(const sx of [-1,1])for(const sz of [-1,1])for(let ix=0;39+ix*52<extent/2-18;ix++)for(let iz=0;39+iz*52<extent-18;iz++){
  const x=sx*(39+ix*52),z=sz*(39+iz*52);if((ix+iz)%5===4)continue;
  blocks.push({id:`city-block-${sx<0?'w':'e'}${ix}-${sz<0?'n':'s'}${iz}`,x,z,w:24+(ix+iz)%3*2,d:26+(ix*2+iz)%3*2,h:5+(ix*3+iz*5)%5*2,kind:'building',color:palette[(ix+iz*2+(sx<0?1:0))%palette.length]});
 }
 world.blocks=world.blocks.filter(block=>!['west','east','north','south'].includes(block.id)).concat(blocks);
 world.bounds={minX:-extent/2,maxX:extent/2,minZ:-extent,maxZ:extent};
 world.exit={x:0,z:-extent+14};world.id+=`-city-${settings.size}-${settings.pedestrians}-${settings.traffic}-${settings.police}`;
}
