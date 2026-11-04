/** Recorded soundtrack catalogue. IDs are the portable JSON contract; files load only when selected. */
export const MUSIC_TRACKS=[
  {id:'none',name:'No music',artist:'',category:'None',duration:0,file:'',source:'',description:'Silence'},
  {id:'adventure-trailer',name:'Dramatic Adventure Trailer',artist:'331Music',category:'Cinematic',duration:74.266,file:'adventure-trailer-600429.mp3',source:'331music-dramatic-adventure-trailer-600429.mp3',description:'Dramatic adventure and trailer music'},
  {id:'tropical-pop',name:'Tropical Relaxing Pop',artist:'331Music',category:'Relaxed',duration:131.84,file:'tropical-pop-603080.mp3',source:'331music-tropical-relaxing-pop-603080.mp3',description:'Relaxed tropical pop for beaches, resorts and warm scenes'},
  {id:'restaurant-jazz',name:'Jazz Restaurant Music',artist:'Alex Morgan',category:'Jazz',duration:169.224,file:'restaurant-jazz-556244.mp3',source:'alex-morgan-jazz-restaurant-music-556244.mp3',description:'Restaurant jazz for cafés, dinners and conversations'},
  {id:'horror',name:'Horror',artist:'ArctSound',category:'Suspense',duration:67.892,file:'horror-515155.mp3',source:'arctsound-horror-515155.mp3',description:'Horror atmosphere for unsettling scenes'},
  {id:'hip-hop-story',name:'Urban Hip Hop Beat · Hip Hop Story',artist:'BombinSound',category:'Hip hop',duration:130.038,file:'hip-hop-story-623450.mp3',source:'bombinsound-urban-hip-hop-beat-hip-hop-story-623450.mp3',description:'Urban hip-hop beat for street scenes and character introductions'},
  {id:'spy-opening',name:'Spy Opening Scene',artist:'BrutalDesign',category:'Spy',duration:134.664,file:'spy-opening-588498.mp3',source:'brutaldesign-spy-opening-scene-588498.mp3',description:'Spy-film opening music for mysteries and investigations'},
  {id:'afrobeat-alone',name:'Afrobeat Instrumental · Alone',artist:'DMSoundworks',category:'Afrobeat',duration:168.438,file:'afrobeat-alone-464383.mp3',source:'dmsoundworks-afrobeat-instrumental-2026-alone-burnaboy-x-wizkid-x-fireboy-typebeat-464383.mp3',description:'Afrobeat instrumental for social scenes, city life and celebrations'},
  {id:'spy-mission',name:'Spy Agent Mission Music',artist:'Sound4Stock',category:'Spy',duration:87.51,file:'spy-mission-574523.mp3',source:'sound4stock-spy-agent-mission-music-574523.mp3',description:'Spy and mission music for covert operations and action'},
  {id:'old-school-salsa',name:'Old School Salsa 02',artist:'VJGalaxy',category:'Latin',duration:129.864,file:'old-school-salsa-499571.mp3',source:'vjgalaxy-old-school-salsa-02-499571.mp3',description:'Old-school salsa for dancing and lively social scenes'},
] as const;
export type MusicId=typeof MUSIC_TRACKS[number]['id'];
const LEGACY_MUSIC:Record<string,MusicId>={ambient:'tropical-pop',cinematic:'adventure-trailer',suspense:'spy-mission',lofi:'hip-hop-story',playful:'old-school-salsa',uplifting:'afrobeat-alone'};
/** Existing films inherit a recorded selection; synthetic tracks are no longer rendered or offered. */
export const migrateMusic=(value:unknown):unknown=>typeof value==='string'&&Object.hasOwn(LEGACY_MUSIC,value)?LEGACY_MUSIC[value]:value;
