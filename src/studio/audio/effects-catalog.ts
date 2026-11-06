/** Recorded effects and ambiences. IDs are shared by the editor, validation and LLM guide. */
export const SOUND_EFFECTS=[
  {id:'suppressed-pistol-shot',name:'Suppressed pistol shot',category:'Weapon',duration:.6065,file:'suppressed-pistol-shot.mp3',folder:'sound-for-ara',source:'Single_suppressed_pistol_shot.wav',description:'One suppressed pistol shot. Schedule it at the firing moment of an independently directed animation.'},
  {id:'body-fall-thump',name:'Body fall thump',category:'Impact',duration:.6065,file:'body-fall-thump.mp3',folder:'sound-for-ara',source:'Body_fall_thump.wav',description:'A short body landing impact. Schedule it at the visible landing or contact moment.'},
  {id:'rifle-shot',name:'Rifle shot',category:'Weapon',duration:1,file:'rifle-shot.mp3',folder:'new-sound-effects',source:'rifle_shot_#2-1793963191245.wav',description:'One rifle shot with its decay. Place at a visible firing moment.'},
  {id:'motorcycle-engine',name:'Motorcycle engine',category:'Vehicle',duration:8,file:'motorcycle-engine.mp3',folder:'new-sound-effects',source:'sustained_motorcycle_#3-1793882377486.wav',description:'Sustained motorcycle engine. Trim to the riding interval; repeat adjacent cues for longer travel.'},
  {id:'car-engine',name:'Car engine',category:'Vehicle',duration:8,file:'car-engine.mp3',folder:'new-sound-effects',source:'sustained_car_sound__#3-1793882476167.wav',description:'Sustained car engine. Use for car or SUV travel, with volume chosen for camera distance.'},
  {id:'boat-engine',name:'Boat engine',category:'Vehicle',duration:8,file:'boat-engine.mp3',folder:'new-sound-effects',source:'sustained_boat_sound_#3-1793882521640.wav',description:'Sustained motorboat engine. Use while driving; omit for silent paddling or rowing.'},
  {id:'wind',name:'Wind',category:'Ambience',duration:4,file:'wind.mp3',folder:'new-sound-effects',source:'sustained_wind_sound_#1-1793962999219.wav',description:'Outdoor wind ambience. Layer quietly under dialogue and repeat adjacent cues if needed.'},
  {id:'forest-birds',name:'Forest and birds',category:'Ambience',duration:4,file:'forest-birds.mp3',folder:'new-sound-effects',source:'forest_with_birds_an_#3-1793963029362.wav',description:'Woodland ambience with birds. Suits forest trails, parks and a lakeside camp.'},
  {id:'ocean',name:'Ocean',category:'Ambience',duration:4,file:'ocean.mp3',folder:'new-sound-effects',source:'sustained_ocean_soun_#1-1793963083248.wav',description:'Ocean ambience for beach, harbour and waterfront scenes. Repeat adjacent cues for a longer bed.'},
] as const;
export type SoundEffectId=typeof SOUND_EFFECTS[number]['id'];
export const soundEffectById=(id:string)=>SOUND_EFFECTS.find(s=>s.id===id);
