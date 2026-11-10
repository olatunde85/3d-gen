/** Portable creator choices; player preferences never widen the creator's allowed views. */
import {MUSIC_TRACKS,type MusicId} from '../studio/audio/tracks';
export {MUSIC_TRACKS,type MusicId};
export const CAMERA_VIEWS=[
 {id:'orbit',name:'Third person',description:'Follow the character with a wider view of the set.'},
 {id:'close',name:'Close follow',description:'Closer to the action, with room beside the character to aim.'},
 {id:'overhead',name:'Top-down',description:'A view from above with a clear view of routes and cover.'},
 {id:'isometric',name:'Isometric',description:'Diagonal framing with a clear view of the surrounding set.'},
]as const;
export type CameraView=typeof CAMERA_VIEWS[number]['id'];
export interface CameraSettings {allowed:CameraView[];default:CameraView;rotate:boolean;zoom:boolean}
export interface MusicSettings {track:MusicId;volume:number}
export const defaultCamera=():CameraSettings=>({allowed:CAMERA_VIEWS.map(v=>v.id),default:'orbit',rotate:true,zoom:true});
export const defaultMusic=():MusicSettings=>({track:'none',volume:.22});
const object=(raw:unknown):raw is Record<string,unknown>=>!!raw&&typeof raw==='object'&&!Array.isArray(raw);
export function parseCamera(raw:unknown):CameraSettings {
 if(raw===undefined)return defaultCamera();if(!object(raw))throw Error('Use valid camera settings.');
 for(const key of Object.keys(raw))if(!['allowed','default','rotate','zoom'].includes(key))throw Error(`Unsupported camera setting: ${key}.`);
 const allowed=raw.allowed===undefined?defaultCamera().allowed:raw.allowed;
 if(!Array.isArray(allowed)||allowed.length<1||allowed.length>CAMERA_VIEWS.length||new Set(allowed).size!==allowed.length||allowed.some(id=>!CAMERA_VIEWS.some(v=>v.id===id)))throw Error('Choose at least one camera view, without duplicates.');
 const start=raw.default===undefined?allowed[0]:raw.default;if(!allowed.includes(start))throw Error('The starting camera must be an allowed view.');
 for(const field of ['rotate','zoom'])if(raw[field]!==undefined&&typeof raw[field]!=='boolean')throw Error(`Camera ${field} must be true or false.`);
 return {allowed:[...allowed],default:start as CameraView,rotate:raw.rotate===undefined?true:raw.rotate as boolean,zoom:raw.zoom===undefined?true:raw.zoom as boolean};
}
export function parseMusic(raw:unknown):MusicSettings {
 if(raw===undefined)return defaultMusic();if(!object(raw))throw Error('Use valid music settings.');
 for(const key of Object.keys(raw))if(!['track','volume'].includes(key))throw Error(`Unsupported music setting: ${key}.`);
 const result={...defaultMusic(),...raw};
 if(!MUSIC_TRACKS.some(t=>t.id===result.track))throw Error('Choose background music from the library.');
 if(typeof result.volume!=='number'||!Number.isFinite(result.volume)||result.volume<0||result.volume>1)throw Error('Music volume must be between 0 and 1.');
 return result as MusicSettings;
}
