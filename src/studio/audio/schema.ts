/** Portable audio direction; recordings and generated waveforms live in the local asset library. */
import { soundEffectById, type SoundEffectId } from './effects-catalog';
import { MUSIC_TRACKS, migrateMusic, type MusicId } from './tracks';
import { FILM_LIMITS, durationWords, type SceneLimits } from '../limits';
export { MUSIC_TRACKS, type MusicId } from './tracks';
export const MAX_SPEECH = 24, MAX_SOUND_EFFECTS=64;
export const VOICE_EFFECTS = ['natural','robotic','dramatic','radio','telephone','echo'] as const;
export const EFFECT_LABELS:Record<VoiceEffect,string>={natural:'Natural',robotic:'Robotic',dramatic:'Dramatic',radio:'Radio',telephone:'Telephone',echo:'Echo'};
export type VoiceEffect = typeof VOICE_EFFECTS[number];
export const STUDIO_VOICES=['F1','F2','M1','M2'] as const;
/** Ara's own voices, or a provider voice such as gemini/Kore or elevenlabs/<voice id> (spoken with the visitor's own key). */
export const SPEECH_VOICE_PATTERN=/^(F1|F2|M1|M2|gemini\/[A-Za-z]{2,40}|elevenlabs\/[A-Za-z0-9]{8,64})$/;
export type SpeechVoice=string;
/** The VOICES part of an Assist guide when no voice provider is connected. */
export const ARA_VOICE_GUIDE='VOICES\n- F1, F2: female; M1, M2: male. Ara voices, free, spoken on the user\'s device. They ignore delivery.';
export const VOICE_LABELS={F1:'Studio voice · F1',F2:'Studio voice · F2',M1:'Studio voice · M1',M2:'Studio voice · M2'};
export const speechActor=(id:string)=>id==='narrator'?'actor:narrator':id;
export const resolveSpeechActor=(id:string)=>id==='actor:narrator'?'narrator':id;
export interface SpeechCue {source:'tts'|'file'|'recording';id:string;name:string;actor:string;text:string;voice:SpeechVoice;delivery?:string;asset?:string;start:number;duration:number;offset:number;speed:number;volume:number;pan:number;effect:VoiceEffect}
/** Music is a library track, or music composed from a description (track 'generated', with its audio in asset once made). */
export interface MusicSettings {start?:number;duration?:number;track:MusicId|'generated';prompt?:string;instrumental?:boolean;asset?:string;volume:number;ducking:boolean;fadeIn:number;fadeOut:number}
/** A library sound, or one made from a description (sound 'generated', with its audio in asset once made). */
export interface SoundEffectCue {loop?:boolean;id:string;name:string;sound:SoundEffectId|'generated';prompt?:string;asset?:string;actor?:string;start:number;duration:number;offset:number;speed:number;volume:number;pan:number}
export interface FilmAudio {speech:SpeechCue[];effects:SoundEffectCue[];music:MusicSettings;muted:boolean}
export const defaultAudio=():FilmAudio=>({speech:[],effects:[],music:{track:'none',volume:.22,ducking:true,fadeIn:.6,fadeOut:1.2},muted:false});
export const hasAudio=(audio?:FilmAudio)=>!!audio&&!audio.muted&&(audio.music.track!=='none'&&audio.music.volume>0||audio.speech.some(c=>c.volume>0)||audio.effects.some(c=>c.volume>0));
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function parseAudio(raw:unknown,actors:Set<string>,limits:SceneLimits=FILM_LIMITS):FilmAudio{
  const end=limits.duration,last=end-.1,within=durationWords(end);
  if(raw===undefined)return defaultAudio();if(!object(raw))throw Error('Audio must be an object.');
  const fields=(v:Record<string,unknown>,keys:string[],label:string)=>{for(const key of Object.keys(v))if(!keys.includes(key))throw Error(`${label}: unsupported field ${key}.`);};
  const num=(v:unknown,min:number,max:number,label:string,fallback:number)=>{const n=v??fallback;if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)throw Error(`${label}: use a number from ${min} to ${max}.`);return n;};
  const bool=(v:unknown,fallback:boolean,label:string)=>{if(v===undefined)return fallback;if(typeof v!=='boolean')throw Error(`${label}: use true or false.`);return v;};
  const str=(v:unknown,max:number,label:string,fallback='')=>{const s=v??fallback;if(typeof s!=='string'||s.length>max)throw Error(`${label}: use up to ${max} characters.`);return s;};
  fields(raw,['speech','effects','music','muted'],'Audio');const speech=raw.speech??[];
  if(!Array.isArray(speech)||speech.length>limits.speech)throw Error(`Use at most ${limits.speech} speech clips.`);
  const ids=new Set<string>();const cues=speech.map((value,i):SpeechCue=>{
    if(!object(value))throw Error(`Invalid speech clip ${i+1}.`);const label=`Speech ${i+1}`;
    fields(value,['source','id','name','actor','text','voice','delivery','asset','start','duration','offset','speed','volume','pan','effect'],label);
    const id=str(value.id,50,label,`speech-${i}`);if(!/^[a-zA-Z0-9_-]+$/.test(id)||ids.has(id))throw Error('Speech IDs must be unique.');ids.add(id);
    const actor=str(value.actor,50,label,'narrator');if(actor!=='narrator'&&!actors.has(resolveSpeechActor(actor)))throw Error(`${label}: choose the narrator or an existing actor.`);
    const text=str(value.text,600,label),asset=value.asset===undefined?undefined:str(value.asset,64,label);
    if(asset!==undefined&&!/^[a-f0-9]{64}$/.test(asset))throw Error(`${label}: invalid audio asset ID.`);
    if(!asset&&!text.trim()&&(value.source??'tts')!=='tts')throw Error(`${label}: add dialogue text or an audio asset.`);
    const voice=value.voice??'F1',effect=value.effect??'natural',source=value.source??(asset?'file':'tts');if(!['tts','file','recording'].includes(String(source)))throw Error(`${label}: invalid speech source.`);
    if(typeof voice!=='string'||!SPEECH_VOICE_PATTERN.test(voice))throw Error(`${label}: choose F1, F2, M1 or M2, or a provider voice such as gemini/Kore.`);if(!VOICE_EFFECTS.includes(effect as never))throw Error(`${label}: unsupported voice effect.`);
    const delivery=value.delivery===undefined?undefined:str(value.delivery,200,`${label} delivery`).trim()||undefined;
    const start=num(value.start,0,last,label,0),duration=num(value.duration,.1,end,label,3);if(start+duration>end+1e-7)throw Error(`${label}: finish within ${within}.`);
    return{source:source as SpeechCue['source'],id,name:str(value.name,80,label,`Speech ${i+1}`),actor,text,voice,...(delivery?{delivery}:{}),asset,start,duration,
      offset:num(value.offset,0,last,label,0),speed:num(value.speed,.5,1.5,label,1),volume:num(value.volume,0,1.5,label,1),pan:num(value.pan,-1,1,label,0),effect:effect as VoiceEffect};
  });
  const effects=raw.effects??[];if(!Array.isArray(effects)||effects.length>limits.effects)throw Error(`Use at most ${limits.effects} sound-effect cues.`);
  const effectIds=new Set<string>(),effectCues=effects.map((value,i):SoundEffectCue=>{
    if(!object(value))throw Error(`Invalid sound effect ${i+1}.`);const label=`Sound effect ${i+1}`;
    fields(value,['id','name','sound','actor','start','duration','offset','speed','volume','pan','loop','prompt','asset'],label);
    const id=str(value.id,50,label,`fx-${i}`);if(!/^[a-zA-Z0-9_-]+$/.test(id)||effectIds.has(id))throw Error('Sound-effect IDs must be unique.');effectIds.add(id);
    const made=value.sound==='generated';
    if(!made&&(typeof value.sound!=='string'||!soundEffectById(value.sound)))throw Error(`${label}: choose a sound from the effects library, or "generated" with a prompt.`);
    const prompt=made?str(value.prompt,300,`${label} prompt`).trim():undefined;if(made&&!prompt)throw Error(`${label}: describe the sound to make in prompt.`);if(!made&&value.prompt!==undefined)throw Error(`${label}: prompt is only for generated sounds.`);
    const asset=value.asset===undefined?undefined:str(value.asset,64,label);if(asset!==undefined&&(!made||!/^[a-f0-9]{64}$/.test(asset)))throw Error(`${label}: invalid audio asset ID.`);
    const sound=made?{id:'generated' as const,name:prompt!.slice(0,60),duration:30}:soundEffectById(value.sound as string)!;
    const actor=value.actor===undefined?undefined:str(value.actor,50,label);if(actor!==undefined&&!actors.has(actor))throw Error(`${label}: choose an existing actor or omit actor for a scene sound.`);
    const offset=num(value.offset,0,sound.duration,label,0);if(offset>=sound.duration)throw Error(`${label}: trim starts beyond the end of the recording.`);
    const speed=num(value.speed,.5,2,label,1),start=num(value.start,0,last,label,0),duration=num(value.duration,.01,end,label,(sound.duration-offset)/speed);
    if(start+duration>end+1e-7)throw Error(`${label}: finish within ${within}.`);
    return{...(value.loop===undefined?{}:{loop:bool(value.loop,false,label)}),id,name:str(value.name,80,label,sound.name),sound:sound.id,...(prompt?{prompt}:{}),...(asset?{asset}:{}),...(actor===undefined?{}:{actor}),start,duration,offset,speed,volume:num(value.volume,0,2,label,1),pan:num(value.pan,-1,1,label,0)};
  });
  const music=raw.music??{};if(!object(music))throw Error('Music must be an object.');fields(music,['track','volume','ducking','fadeIn','fadeOut','start','duration','prompt','instrumental','asset'],'Music');
  const track=migrateMusic(music.track??'none'),composed=track==='generated';if(!composed&&!MUSIC_TRACKS.some(t=>t.id===track))throw Error('Choose a music track from the library, or "generated" with a prompt.');
  const musicPrompt=composed?str(music.prompt,400,'Music prompt').trim():undefined;if(composed&&!musicPrompt)throw Error('Music: describe the music to compose in prompt.');if(!composed&&(music.prompt!==undefined||music.asset!==undefined))throw Error('Music: prompt and asset are only for generated music.');
  const musicAsset=music.asset===undefined?undefined:str(music.asset,64,'Music asset');if(musicAsset!==undefined&&!/^[a-f0-9]{64}$/.test(musicAsset))throw Error('Music: invalid audio asset ID.');
  const musicStart=num(music.start,0,last,'Music start',0),musicDuration=music.duration===undefined?undefined:num(music.duration,.1,end,'Music duration',3);if(musicDuration!==undefined&&musicStart+musicDuration>end+1e-7)throw Error(`Music must finish within ${within}.`);
  return{speech:cues,effects:effectCues,music:{...(music.start===undefined?{}:{start:musicStart}),...(musicDuration===undefined?{}:{duration:musicDuration}),track:track as MusicId|'generated',...(composed?{prompt:musicPrompt,instrumental:bool(music.instrumental,true,'Music instrumental'),...(musicAsset?{asset:musicAsset}:{})}:{}),volume:num(music.volume,0,1,'Music volume',.22),ducking:bool(music.ducking,true,'Music ducking'),fadeIn:num(music.fadeIn,0,10,'Music fade in',.6),fadeOut:num(music.fadeOut,0,10,'Music fade out',1.2)},muted:bool(raw.muted,false,'Audio muted')};
}
