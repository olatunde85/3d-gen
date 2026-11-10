/** Optional atmosphere is portable and shared by perception, rendering and audio. */
export const TIMES=['dawn','day','dusk','night']as const;
export const WEATHER=['clear','rain','fog','sandstorm']as const;
export const AMBIENCES=['none','auto','wind','forest-birds','ocean']as const;
export interface EnvironmentSettings {time:typeof TIMES[number];weather:typeof WEATHER[number];ambient:typeof AMBIENCES[number];effects:boolean;flashlight:boolean;volume:number}
export const defaultEnvironment=():EnvironmentSettings=>({time:'day',weather:'clear',ambient:'none',effects:true,flashlight:true,volume:.3});
export function parseEnvironment(raw:unknown):EnvironmentSettings{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Use valid atmosphere settings.');const p=raw as Record<string,unknown>;for(const key of Object.keys(p))if(!['time','weather','ambient','effects','flashlight','volume'].includes(key))throw Error(`Unsupported atmosphere setting: ${key}.`);
 const e={...defaultEnvironment(),...p};if(!TIMES.includes(e.time as EnvironmentSettings['time'])||!WEATHER.includes(e.weather as EnvironmentSettings['weather'])||!AMBIENCES.includes(e.ambient as EnvironmentSettings['ambient']))throw Error('Choose a supported time, weather and ambience.');if(typeof e.effects!=='boolean'||typeof e.flashlight!=='boolean'||typeof e.volume!=='number'||!Number.isFinite(e.volume)||e.volume<0||e.volume>1)throw Error('Use valid atmosphere sound and flashlight settings.');return e as EnvironmentSettings;
}
export function ambientEffect(e:EnvironmentSettings,location:string){return e.ambient==='auto'?e.weather!=='clear'||location==='desert-compound'?'wind':location==='market-street'&&e.time!=='night'?'forest-birds':'none':e.ambient;}

export function floodlightAnchors(bounds:{minX:number;maxX:number},gate:{x:number;z:number}){return [{x:bounds.minX+4,z:gate.z+5},{x:bounds.maxX-4,z:gate.z+5},{x:6,z:gate.z-8}];}
/** The renderer and AI use the same practical-light reach; weather also limits sight. */
export function visibilityMultiplier(e:EnvironmentSettings,p:{x:number;z:number},bounds:{minX:number;maxX:number},gate:{x:number;z:number},flashlight:boolean){const lit=floodlightAnchors(bounds,gate).some(l=>Math.hypot(l.x-p.x,l.z-p.z)<7);return (e.time==='night'?(lit||flashlight?1:.48):e.time==='dawn'||e.time==='dusk'?.85:1)*(e.weather==='fog'?.65:e.weather==='sandstorm'?.55:e.weather==='rain'?.85:1);}
