/** Built-in one-shot recordings. IDs are shared by the editor, validation and LLM guide. */
export const SOUND_EFFECTS=[
  {id:'suppressed-pistol-shot',name:'Suppressed pistol shot',category:'Weapon',duration:.6065,file:'suppressed-pistol-shot.mp3',source:'Single_suppressed_pistol_shot.wav',description:'One suppressed pistol shot. Schedule it at the firing moment of an independently directed animation.'},
  {id:'body-fall-thump',name:'Body fall thump',category:'Impact',duration:.6065,file:'body-fall-thump.mp3',source:'Body_fall_thump.wav',description:'A short body landing impact. Schedule it at the visible landing or contact moment.'},
] as const;
export type SoundEffectId=typeof SOUND_EFFECTS[number]['id'];
export const soundEffectById=(id:string)=>SOUND_EFFECTS.find(s=>s.id===id);
