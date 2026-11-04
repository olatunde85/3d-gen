/** A portable LLM contract, derived from the same registries as the editor. No API calls. */
import { WAREHOUSE_EXAMPLE } from './examples/warehouse';
import type { Catalog } from '../core/assets';
import { parseCharacterInput, characterSchema, characterReference } from '../app/character-assist';
import { PRESETS } from '../core/params';
import { CLIPS } from '../core/anim/clips';
import { decodeCharacter, encodeCharacter } from '../app/share';
import { SETS, sceneById } from './catalog';
import { MAX_SPEECH, MAX_SOUND_EFFECTS, VOICE_EFFECTS, STUDIO_VOICES, MUSIC_TRACKS } from './audio/schema';
import { SOUND_EFFECTS } from './audio/effects-catalog';
import { MAX_TEXT_CUES, TEXT_STYLES } from './text';
import { actionNote } from './animations';
import { equipActor, WEAPONS, WEAPON_LABELS, CARRIED, CARRY_LABELS } from './equipment';
import { MAX_ACTORS, MAX_ACTIONS, MAX_SHOTS, MAX_DURATION, parseProject, presetCode, durationOf, type StudioProject } from './project';

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function fields(value: Record<string, unknown>, allowed: string[], path: string) {
  const unsupported = Object.keys(value).filter(key => !allowed.includes(key));
  if (unsupported.length) throw Error(`${path}: unsupported field ${unsupported.join(', ')}. Use the fields in the LLM guide.`);
}

/** Accept saved projects or LLM-friendly preset/equipment names; keep the canonical validator authoritative. */
export function parseStudioInput(text: string, catalog?: Catalog): StudioProject {
  if (text.length > 100_000) throw Error('Use JSON smaller than 100 KB.');
  const source = text.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, '$1');
  let value: unknown;
  try { value = JSON.parse(source); }
  catch { throw Error('This is not valid JSON. Paste the complete JSON object, without surrounding explanation.'); }
  if (!object(value) || value.version !== 2) return parseProject(source);
  fields(value, ['kind', 'version', 'title', 'template', 'actors', 'shots', 'camera', 'view', 'aspect', 'caption', 'texts', 'audio'], 'Film');
  if (object(value.view)) fields(value.view, ['azimuth', 'elevation', 'zoom'], 'View');
  if (Array.isArray(value.shots)) value.shots.forEach((shot, i) => {
    if (object(shot)) fields(shot, ['id', 'duration', 'shot', 'target'], `Shot ${i + 1}`);
  });
  if (Array.isArray(value.actors) && (value.actors.length < 1 || value.actors.length > MAX_ACTORS)) throw Error(`A film needs one to ${MAX_ACTORS} characters.`);
  if (Array.isArray(value.actors)) value.actors = value.actors.map((raw, i) => {
    if (!object(raw)) return raw;
    const path = `Character ${i + 1}`;
    fields(raw, ['id', 'preset', 'character', 'params', 'detail', 'weapon', 'carry', 'x', 'y', 'z', 'yaw', 'beats'], path);
    if (Array.isArray(raw.beats)) raw.beats.forEach((beat, j) => {
      if (object(beat)) fields(beat, ['id', 'clip', 'duration', 'move'], `${path}, action ${j + 1}`);
    });
    const detail=raw.detail;
    if(!['low','medium','high'].includes(String(detail)))throw Error(`${path}: choose low, medium or high detail.`);
    let character=raw.character;
    if('preset'in raw&&'character'in raw)throw Error(`${path}: use either preset or character, not both.`);
    if(object(character)&&'params'in raw)throw Error(`${path}: put params inside the character specification or on the actor, not both.`);
    const custom=object(character)||'params'in raw;
    if(custom){
      if(!catalog)throw Error(`${path}: custom characters need the installed builder catalogue.`);
      try{
        if(object(character))character=encodeCharacter({...parseCharacterInput(JSON.stringify(character),catalog),detail:detail as 'low'|'medium'|'high'});
        else{
          let base;
          if('character'in raw){
            if(typeof character!=='string'||!(base=decodeCharacter(character,detail as 'low'|'medium'|'high')))throw Error('Invalid existing character recipe.');
          }
          const specification={kind:'ara-character',version:1,...('preset'in raw?{preset:raw.preset}:{}),params:raw.params};
          character=encodeCharacter({...parseCharacterInput(JSON.stringify(specification),catalog,base),detail:detail as 'low'|'medium'|'high'});
        }
      }catch(error){throw Error(`${path}: ${(error as Error).message}`);}
    }else if('preset'in raw){
      if(typeof raw.preset!=='string'||!Object.hasOwn(PRESETS,raw.preset))throw Error(`${path}: unknown preset. Copy an exact preset name from the guide.`);
      character=presetCode(raw.preset);
    }
    if(typeof character!=='string'||!decodeCharacter(character,detail as 'low'|'medium'|'high'))throw Error(`${path}: provide a preset, params or a valid character specification/recipe.`);
    const actor = { character, detail: raw.detail as 'low' | 'medium' | 'high' };
    for (const slot of ['weapon', 'carry'] as const) if (slot in raw) {
      if (typeof raw[slot] !== 'string') throw Error(`${path}: ${slot} must be an equipment ID from the guide.`);
      try { actor.character = equipActor(actor, slot, raw[slot]); }
      catch (error) { throw Error(`${path}: ${(error as Error).message}`); }
    }
    return { ...raw, character: actor.character };
  });
  return parseProject(JSON.stringify(value));
}

export function assistExample() {
  return structuredClone(WAREHOUSE_EXAMPLE);
}

/** JSON Schema describes the portable input; total timeline duration is additionally validated at import. */
export function assistSchema(catalog:Catalog) {
  const num = (minimum: number, maximum: number) => ({ type: 'number', minimum, maximum });
  const enumeration = (values: readonly string[]) => ({ type: 'string', enum: values });
  const id = { type: 'string', pattern: '^[a-zA-Z0-9_-]{1,50}$', not: { enum: ['all', 'camera'] } };
  const detail = enumeration(['low', 'medium', 'high']);
  const action = { type: 'object', additionalProperties: false, required: ['clip', 'duration', 'move'], properties: {
    id: { type: 'string' }, clip: enumeration(CLIPS.map(c => c.id)), duration: num(0.1, 12), move: { type: 'boolean' },
  } };
  const builder=characterSchema(catalog),builderDefinition=Object.fromEntries(Object.entries(builder).filter(([key])=>!['$schema','title'].includes(key)));
  const characterSpecification={...builderDefinition,properties:{...builder.properties,params:{$ref:'#/$defs/characterParams'}}};
  const actor = { type: 'object', additionalProperties: false, required: ['id', 'detail', 'x', 'y', 'z', 'yaw', 'beats'],
    oneOf: [
      {required:['preset'],not:{required:['character']}},
      {required:['character'],not:{required:['preset']}},
      {required:['params'],not:{anyOf:[{required:['preset']},{required:['character']}]}}
    ],
    allOf:[{if:{required:['character'],properties:{character:{type:'object'}}},then:{not:{required:['params']}}}],
    properties: {
      id, preset: enumeration(Object.keys(PRESETS)), params:{$ref:'#/$defs/characterParams',description:'Custom character parameters; override the preset or existing encoded character, or build from defaults.'},
      character:{oneOf:[{type:'string',description:'An existing encoded character recipe copied verbatim.'},{$ref:'#/$defs/characterSpecification'},{$ref:'#/$defs/characterParams'}]},
      detail, weapon: enumeration(WEAPONS), carry: enumeration(CARRIED), x: num(-12, 12), y: num(0, 3), z: num(-12, 12), yaw: num(-180, 180),
      beats: { type: 'array', minItems: 1, maxItems: MAX_ACTIONS, items: action },
    } };
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema', title: 'Ara Studio LLM input, version 2', type: 'object', additionalProperties: false,
    $defs:{characterParams:builder.properties.params,characterSpecification},
    required: ['kind', 'version', 'title', 'template', 'actors', 'shots', 'camera', 'view', 'aspect', 'caption'], properties: {
      kind: { const: 'ara-studio' }, version: { const: 2 }, title: { type: 'string', maxLength: 60 }, template: enumeration(SETS.map(s => s.id)),
      actors: { type: 'array', minItems: 1, maxItems: MAX_ACTORS, items: actor },
      shots: { type: 'array', minItems: 1, maxItems: MAX_SHOTS, items: { type: 'object', additionalProperties: false, required: ['duration', 'shot', 'target'], properties: {
        id: { type: 'string' }, duration: num(0.1, 12), shot: enumeration(['wide', 'medium', 'close']), target: { type: 'string', description: 'all, or an actor id in this project' },
      } } }, camera: enumeration(['locked', 'dolly', 'orbit']), aspect: enumeration(['landscape', 'portrait']), caption: { type: 'boolean' },
      texts: {type:'array',maxItems:MAX_TEXT_CUES,items:{type:'object',additionalProperties:false,required:['text','start','duration','style','anchor'],properties:{
        id:{type:'string',pattern:'^[a-zA-Z0-9_-]{1,50}$'},text:{type:'string',maxLength:500},start:num(0,59.9),duration:num(.1,60),style:enumeration(TEXT_STYLES),
        anchor:{type:'string',description:'screen, or an actor id to follow their animated head'},x:num(-1,1),y:num(-1,1),size:num(14,72),
        color:{type:'string',pattern:'^#[a-fA-F0-9]{6}$'},background:{type:'string',pattern:'^#[a-fA-F0-9]{6}$'}}}},
      audio:{type:'object',additionalProperties:false,properties:{
        muted:{type:'boolean'},music:{type:'object',additionalProperties:false,properties:{track:enumeration(MUSIC_TRACKS.map(t=>t.id)),volume:num(0,1),ducking:{type:'boolean'},fadeIn:num(0,10),fadeOut:num(0,10)}},
        effects:{type:'array',maxItems:MAX_SOUND_EFFECTS,items:{type:'object',additionalProperties:false,required:['sound'],properties:{
          id:{type:'string',pattern:'^[a-zA-Z0-9_-]{1,50}$'},name:{type:'string',maxLength:80},sound:enumeration(SOUND_EFFECTS.map(s=>s.id)),actor:{type:'string',description:'Optional existing actor ID for organization; omit for a scene sound. Does not add spatial audio.'},
          start:num(0,59.9),duration:num(.01,60),offset:{...num(0,60),description:'Source seconds; must be strictly less than this sound’s library duration.'},speed:num(.5,2),volume:num(0,2),pan:num(-1,1)}}},
        speech:{type:'array',maxItems:MAX_SPEECH,items:{type:'object',additionalProperties:false,properties:{
          id:{type:'string',pattern:'^[a-zA-Z0-9_-]{1,50}$'},source:enumeration(['tts','file','recording']),name:{type:'string',maxLength:80},actor:{type:'string',description:'narrator or an existing actor id; actor:narrator for an actor named narrator'},
          text:{type:'string',maxLength:600},voice:enumeration(STUDIO_VOICES),asset:{type:'string',pattern:'^[a-f0-9]{64}$',description:'Only copy an existing asset ID from CURRENT FILM. Never invent one.'},
          start:num(0,59.9),duration:num(.1,60),offset:num(0,59.9),speed:num(.5,1.5),volume:num(0,1.5),pan:num(-1,1),effect:enumeration(VOICE_EFFECTS)}}},
      }},
      view: { type: 'object', additionalProperties: false, required: ['azimuth', 'elevation', 'zoom'], properties: { azimuth: num(-180, 180), elevation: num(-35, 65), zoom: num(0.5, 3) } },
    },
  };
}

/** Expand saved recipes for an LLM to inspect/edit without touching opaque encoded strings. */
export function projectForAssist(project:StudioProject){
  return {...project,actors:project.actors.map(({character,...actor})=>{
    const params=decodeCharacter(character,actor.detail);
    return {...actor,character:params?{kind:'ara-character',version:1,params}:character};
  })};
}
export function generateAssistGuide(catalog:Catalog,brief = '', current?: StudioProject): string {
  const json = (value: unknown) => JSON.stringify(value, null, 2);
  return `ARA STUDIO — LLM ASSIST GUIDE (project version 2)
You are directing a short 3D film in Ara Studio. Turn the user's brief into ONE complete JSON project that can be pasted or opened in Studio. Return only the JSON object: no code, comments, ellipses or invented capabilities. Use the exact IDs below. If the brief requires an unsupported capability, explain the limitation and suggest an achievable alternative before generating the project.

USER'S BRIEF
${brief.trim() || '[Describe the film you want here.]'}

CAPABILITIES AND STAGING
- One location per project, ${MAX_ACTORS} characters maximum. Choose from the complete location and animation catalogues below; you cannot generate new geometry, sets or clips.
- Each actor has its own sequential beats. Camera shots run on an independent sequential track. All tracks start at time 0; no overlaps within a track. Film duration is the longest track, rounded up to a 30 fps frame, at most ${MAX_DURATION} seconds. Every beat/shot lasts 0.1–12 seconds; up to ${MAX_ACTIONS} beats per actor and ${MAX_SHOTS} shots. Shorter actor tracks hold their final pose; the last shot holds until the film ends. Synchronize beats by matching cumulative durations.
- Looping clips repeat; one-shot clips play once and hold their final pose. Use catalogue duration for original clip timing. Consecutive identical looping beats continue their phase. No speed, blending or animation parameters are configurable in JSON.
- move:true enables native travel ONLY on clips with a travel vector. Other clips use move:false. Travel vectors are metres per second at reference character height in local [X,Y,Z], scaled to character height and rotated by yaw. The whole travel path is centred around actor x/z. For static staging use move:false. Yaw 0 faces +Z; positive yaw turns toward +X. X/Z are horizontal metres; Y is elevation. Actor placement stays constant apart from enabled animation travel. Keep actors apart and in clear performance space. There is NO obstacle collision detection, navigation mesh, pathfinding or stop-at-wall logic: characters can walk through bricks, walls, tables, other props or other actors. The guide cannot enforce an unobstructed path. Use move:false when a clear route cannot be staged, and review travelling clips before export.
- Design each character inside the film JSON: use actor.params alone to build from defaults, or actor.preset plus actor.params to inherit a preset and override its appearance. The shared character-building instructions and complete parameter schema below apply to these params. You can also paste an entire character-builder response into actor.character: {"kind":"ara-character","version":1,"preset":"The Adventurer","params":{"name":"Custom explorer","ageYears":34}}. A raw builder .params.json object is also accepted in actor.character. No separate builder visit is required.
- Existing encoded actor.character strings still work. Add actor.params to override that existing character; never invent or edit an encoded string yourself. Do not combine preset and character, or put params both inside a character object and on its actor. Omitted fields inherit from the selected preset/existing recipe, or defaults when neither is provided. Supplied arrays/maps replace the inherited values, so include all desired entries. actor.detail (low/medium/high) always overrides embedded params.detail. Top-level actor.weapon/carry override equipment in the character specification; omit them to retain it, use none to remove it.
- Studio needs an animated rig: rig none is rendered with the game rig, and animations are enabled for Studio performances. All other supported body, face, skin, hair, clothing, colours, modifiers and rig options use the builder specification below. Character parameters belong only inside params or a character specification; placement x/y/z/yaw and performance beats stay on the actor.
- With three to five actors, author a distinct x/z/yaw placement for every actor; no blocking/arrangement field exists in JSON. Start with about 1.5–1.9 metres between standing roots, stagger rows or use a conversation semicircle, and review travel paths. Use wide establishing shots for the cast and medium/close shots targeting individual actor IDs for dialogue, especially in portrait. The editor’s arrangement buttons are optional UI commands.
- Seated clips (sit_down, sit_idle, stand_up) use the set's own furniture: Studio moves the character onto the nearest free seat (chair, sofa, armchair, bench, stool or log) and faces them the way the seat faces, so stage sitters near a seat. Choose a set with seating for seated scenes; sets such as studios, beaches and streets may have none. No chairs are added. A bicycle is fitted for ride_bicycle. Other vehicle clips are poses only. Set furniture is fixed. Elevation can stage a lying character on a raised surface, but contact must be reviewed visually.
- Camera shot: wide=full body, medium=waist-up, close=close-up; target=all or an actor id. Studio auto-frames the subject, including all five actors. Global camera motion is locked, dolly (slow push-in) or orbit (gentle orbit), applied to every shot. view.azimuth/elevation are degree offsets from the default shot; zoom smaller than 1 is closer, larger than 1 is farther. No per-shot paths, camera coordinates or keyframes.
- landscape=16:9; portrait=9:16. title up to 60 characters; caption toggles its overlay. The editor supports adding/removing up to five independent actors, timeline edits, dragging and keyboard placement, actor selection, equipment, orbit/zoom, group arrangements (side-by-side, conversation semicircle, opposing groups), Undo, project save/open and still-image export. Movies are H.264 MP4 with an optional stereo soundtrack at 30 fps, manually exported at 720p or 1080p. Export resolution and editor selection are not project fields.
- Timed text: optional texts array, up to ${MAX_TEXT_CUES} cues. Each cue has text (up to 500 characters, 12 lines), start in seconds (0–59.9), duration (0.1–60; start+duration <=60), style (subtitle, text, speech, thought or shout), and anchor (screen or an actor id). Text cues may overlap and can extend the film to their end time. Subtitle = a readable dark caption plate; text = plain outlined lettering; speech/thought = comic bubbles; shout = a comic burst. Text is included in PNG/MP4 exports. For an actor literally named screen, use anchor actor:screen to distinguish it from a fixed screen cue. Actor-attached text follows the animated head through movement and camera shots. Its x/y are offsets in frame fractions (-1..1) from the head, default (0,-0.12). Screen x/y are frame positions (0..1), default (0.5,0.9). size is 14–72 reference pixels at 720p, scaled by the output’s shorter dimension; default 28. Optional color/background are #RRGGBB; comic defaults are dark text on white, subtitles white on dark. Keep simultaneous subtitles at different y positions or schedule them sequentially. Text overlays do not automatically create audio; define separate speech clips for audible dialogue.
- Sound: optional audio object with speech (up to ${MAX_SPEECH} timed clips), effects, music and muted. New typed dialogue uses source:tts, text (up to 600 characters), voice F1/F2/M1/M2, actor (narrator or an actor id), start and duration seconds (end <=60). Speech can extend the film to its end time. Omitted fields default to narrator, F1, start 0, duration 3, offset 0, speed 1, volume 1, pan 0 and natural effect. Use actor:narrator for an actor whose id is narrator. Actor assignment is organizational; it does not automate lip-sync or spatial audio. Pair with a talk animation and matching subtitle/comic text explicitly.
- Typed dialogue is generated automatically when valid JSON is pasted or opened in Studio LLM Assist. Voices are prepared during review, before Build film, with progress and Stop generation. First use downloads a ~265 MB local English speech model, then inference runs on device. Sound > Generate all speech is the primary manual action for outstanding scripts; Generate this clip handles an individual take. Generated take duration may differ from the requested timing: the user must review, fit/trim the take and adjust text/actions. Native browser device voices offer a quick rate/pitch read-through only; their audio cannot be filtered or exported. Recording and audio upload are also available in Sound.
- Speech effect: natural, robotic (ring modulation), dramatic (warm EQ/reverb), radio, telephone or echo. Effects process audio; dramatic does not generate emotional acting. volume 0..1.5, pan -1..1, speed 0.5..1.5 (changes timing and pitch), offset is a trim offset in the source audio. Preserve existing source/asset for an unchanged take. When changing a generated take's text/voice, remove asset so the user can generate it again. Never invent asset hashes. Only reuse asset IDs from CURRENT FILM: recordings are stored on that device or in an audio project ZIP bundle, not inside JSON. Missing audio must be generated or attached before playback/export; music-only JSON plays immediately.
- Music: track must be one of the exact IDs in MUSIC LIBRARY below, volume 0..1 (default .22), ducking true/false (default true lowers music during speech), fadeIn/fadeOut 0..10 seconds. Music is one recorded track from the library, loaded on demand and played from its beginning across the film; none disables it. Muted true exports a silent film. Library duration is the full source-song duration, not the film duration; movies remain at most 60 seconds. The full-song files are FFmpeg-compressed and loudness-matched; the renderer retains at most one 60-second decoded excerpt. No arbitrary audio URLs, soundtrack uploads, music seek offsets, multiple music beds or per-clip audio paths.
- Sound effects: optional audio.effects array, up to ${MAX_SOUND_EFFECTS} independent one-shot cues. Use sound (an exact SOUND EFFECT LIBRARY ID), optional id/name, start in seconds (0–59.9), duration (0.01–60; end <=60), offset in source seconds, speed 0.5–2 (changes timing and pitch), volume 0–2, and pan -1..1. Defaults: start 0, offset 0, speed 1, volume 1, pan 0; omitted duration uses the recording's remaining duration divided by speed. A shorter window trims the take; a longer window holds silence after it ends. No looping; create separate cues for repeated shots/impacts. Effects may overlap speech, music and each other, and can extend the film. Cue IDs must be unique within effects.
- Optional effect.actor is an existing actor ID for organization only; omit it for a scene sound. It does not follow an actor acoustically or automate spatial panning. Align start with the visual firing/landing/contact moment yourself. Sounds do not add weapons, projectiles, damage, ragdolls, collisions or animations. Use existing performances and equipment independently. Effects are included in preview, WAV/MP4, project files and reload recovery; they never need speech generation.
- No automatic lip-sync, imported GLBs, paired handshakes/hugs/fights, automatic hand-to-object contact, collisions, prop handover, free prop placement, lighting overrides, custom backgrounds or location changes during a film. Talk is a visual performance; schedule speech separately. Do not invent fields for unsupported features.
- Actor ids must be unique, 1–50 letters/numbers/underscores/hyphens, excluding all and camera. Shot targets must exist. Beat/shot ids are optional and regenerated on import. Keep the JSON under 100 KB. Review the result in Studio and refine after import; staging is not physically solved.

COMPLETE LOCATION CATALOGUE
${json(SETS.map(s => ({ id: s.id, name: s.name, category: s.category, mood: s.mood, description: s.subtitle })))}

COMPLETE CHARACTER PRESET CATALOGUE
${json(Object.keys(PRESETS))}

CHARACTER CREATION REFERENCE — applies to each actor's params/character, not the outer film object
${characterReference(catalog)}
Use the characterParams and characterSpecification definitions in the film JSON Schema below. Return a complete ara-studio film, not a standalone ara-character response.

EQUIPMENT IDS
${json({ weapons: WEAPONS.map(id => ({ id, name: WEAPON_LABELS[id] })), bags: CARRIED.map(id => ({ id, name: CARRY_LABELS[id] })) })}

SOUND EFFECT LIBRARY
${json(SOUND_EFFECTS.map(s=>({id:s.id,name:s.name,category:s.category,duration:s.duration,description:s.description})))}

SOUND-EFFECT EXAMPLE — merge into the film's audio object, preserving any speech/music:
${json({effects:[{id:'landing',sound:'body-fall-thump',start:2.4,volume:.8,pan:0}]})}
This is a scene sound. To tag it to a character, add actor with that film actor's exact ID. Replace start with the visible contact time; the sound does not create a fall animation.

MUSIC LIBRARY
${json(MUSIC_TRACKS.map(t=>({id:t.id,name:t.name,artist:t.artist,category:t.category,duration:t.duration,description:t.description})))}

COMPLETE ANIMATION CATALOGUE
${json(CLIPS.map(c => ({ id: c.id, name: c.name, category: c.category, duration: c.duration, loop: c.loop, travel: c.travel ? Array.from(c.travel) : null, note: actionNote(c.id) })))}

JSON SCHEMA
${json(assistSchema(catalog))}
Additional constraints: actor ids are unique; shot targets must be all or an actor id; each track, speech clip, sound-effect cue and text cue must finish within ${MAX_DURATION}s. Screen text x/y must be 0..1; actor-relative x/y may be -1..1. Text IDs must be unique. Use move:true only for clips whose catalogue travel is non-null. Unknown fields are rejected.

VALID EXAMPLE (replace it with the requested film)
${json(assistExample())}${current ? `\n\nCURRENT FILM — use this as the starting point and preserve details not changed by the brief\n${json(projectForAssist(current))}` : ''}

Now create the complete importable JSON for the user's brief using only these capabilities.`;
}

/** Headline and facts for the review card. */
export function describeAssistProject(project: StudioProject) {
  const names = project.actors.map(a => decodeCharacter(a.character, a.detail)?.name || a.id);
  const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const speech = project.audio.speech.length,effects=project.audio.effects.length, music = project.audio.music.track !== 'none' && !project.audio.muted;
  return {
    headline: `${project.title || 'Untitled film'} · ${sceneById.get(project.template)!.name}`,
    facts: [names.join(' + '), `${durationOf(project)} seconds`, count(project.shots.length, 'shot'),
      count(project.actors.reduce((sum, a) => sum + a.beats.length, 0), 'action'),
      ...(project.texts.length ? [count(project.texts.length, 'text cue')] : []),
      ...(speech ? [count(speech, 'speech line')] : []),...(effects?[count(effects,'sound effect')]:[]), ...(music ? ['Music'] : []), project.aspect === 'portrait' ? '9:16' : '16:9'],
  };
}

export function summarizeAssistProject(project: StudioProject): string {
  const names = project.actors.map(a => decodeCharacter(a.character, a.detail)?.name || a.id).join(' + ');
  return `${sceneById.get(project.template)!.name} · ${names} · ${durationOf(project)}s · ${project.shots.length} shots · ${project.actors.reduce((sum, a) => sum + a.beats.length, 0)} actions · ${project.texts.length} text cues`;
}
