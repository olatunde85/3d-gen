/** A portable LLM contract, derived from the same registries as the editor. No API calls. */
import { PRESETS } from '../core/params';
import { CLIPS } from '../core/anim/clips';
import { decodeCharacter } from '../app/share';
import { SETS, sceneById } from './catalog';
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
export function parseStudioInput(text: string): StudioProject {
  if (text.length > 100_000) throw Error('Use JSON smaller than 100 KB.');
  const source = text.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, '$1');
  let value: unknown;
  try { value = JSON.parse(source); }
  catch { throw Error('This is not valid JSON. Paste the complete JSON object, without surrounding explanation.'); }
  if (!object(value) || value.version !== 2) return parseProject(source);
  fields(value, ['kind', 'version', 'title', 'template', 'actors', 'shots', 'camera', 'view', 'aspect', 'caption', 'texts'], 'Film');
  if (object(value.view)) fields(value.view, ['azimuth', 'elevation', 'zoom'], 'View');
  if (Array.isArray(value.shots)) value.shots.forEach((shot, i) => {
    if (object(shot)) fields(shot, ['id', 'duration', 'shot', 'target'], `Shot ${i + 1}`);
  });
  if (Array.isArray(value.actors) && (value.actors.length < 1 || value.actors.length > MAX_ACTORS)) throw Error('A film needs one or two characters.');
  if (Array.isArray(value.actors)) value.actors = value.actors.map((raw, i) => {
    if (!object(raw)) return raw;
    const path = `Character ${i + 1}`;
    fields(raw, ['id', 'preset', 'character', 'detail', 'weapon', 'carry', 'x', 'y', 'z', 'yaw', 'beats'], path);
    if (Array.isArray(raw.beats)) raw.beats.forEach((beat, j) => {
      if (object(beat)) fields(beat, ['id', 'clip', 'duration', 'move'], `${path}, action ${j + 1}`);
    });
    let character = raw.character;
    if ('preset' in raw) {
      if ('character' in raw) throw Error(`${path}: use either preset or character, not both.`);
      if (typeof raw.preset !== 'string' || !Object.hasOwn(PRESETS, raw.preset)) throw Error(`${path}: unknown preset. Copy an exact preset name from the guide.`);
      character = presetCode(raw.preset);
    }
    if (typeof character !== 'string' || !['low', 'medium', 'high'].includes(String(raw.detail)) || !decodeCharacter(character, raw.detail as 'low' | 'medium' | 'high')) throw Error(`${path}: choose a valid preset or character recipe and detail level.`);
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
  return {
    kind: 'ara-studio', version: 2, title: 'A poolside introduction', template: 'resort-pool',
    actors: [
      { id: 'host', preset: 'The Female Executive', detail: 'medium', weapon: 'none', carry: 'briefcase', x: -0.95, y: 0, z: 0, yaw: 20,
        beats: [{ clip: 'wave', duration: 3, move: false }, { clip: 'talk', duration: 3, move: false }, { clip: 'idle', duration: 3, move: false }] },
      { id: 'guest', preset: 'The Adventurer', detail: 'medium', weapon: 'none', carry: 'backpack', x: 0.95, y: 0, z: 0, yaw: -20,
        beats: [{ clip: 'idle', duration: 3, move: false }, { clip: 'talk', duration: 3, move: false }, { clip: 'wave', duration: 3, move: false }] },
    ],
    shots: [{ duration: 3, shot: 'wide', target: 'all' }, { duration: 3, shot: 'medium', target: 'host' }, { duration: 3, shot: 'wide', target: 'all' }],
    texts: [{id:'greeting',text:'Welcome to the pool!',start:0,duration:3,style:'speech',anchor:'host',x:0,y:-.12,size:28,color:'#141414',background:'#ffffff'},
      {id:'subtitle',text:'An unexpected meeting.',start:3,duration:3,style:'subtitle',anchor:'screen',x:.5,y:.9,size:26,color:'#ffffff',background:'#151820'}],
    camera: 'dolly', view: { azimuth: 0, elevation: 0, zoom: 1 }, aspect: 'landscape', caption: false,
  };
}

/** JSON Schema describes the portable input; total timeline duration is additionally validated at import. */
export function assistSchema() {
  const num = (minimum: number, maximum: number) => ({ type: 'number', minimum, maximum });
  const enumeration = (values: readonly string[]) => ({ type: 'string', enum: values });
  const id = { type: 'string', pattern: '^[a-zA-Z0-9_-]{1,50}$', not: { enum: ['all', 'camera'] } };
  const detail = enumeration(['low', 'medium', 'high']);
  const action = { type: 'object', additionalProperties: false, required: ['clip', 'duration', 'move'], properties: {
    id: { type: 'string' }, clip: enumeration(CLIPS.map(c => c.id)), duration: num(0.1, 12), move: { type: 'boolean' },
  } };
  const actor = { type: 'object', additionalProperties: false, required: ['id', 'detail', 'x', 'y', 'z', 'yaw', 'beats'],
    oneOf: [{ required: ['preset'], not: { required: ['character'] } }, { required: ['character'], not: { required: ['preset'] } }], properties: {
      id, preset: enumeration(Object.keys(PRESETS)), character: { type: 'string', description: 'An exact existing Ara character recipe; never invent or modify its encoded contents.' },
      detail, weapon: enumeration(WEAPONS), carry: enumeration(CARRIED), x: num(-12, 12), y: num(0, 3), z: num(-12, 12), yaw: num(-180, 180),
      beats: { type: 'array', minItems: 1, maxItems: MAX_ACTIONS, items: action },
    } };
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema', title: 'Ara Studio LLM input, version 2', type: 'object', additionalProperties: false,
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
      view: { type: 'object', additionalProperties: false, required: ['azimuth', 'elevation', 'zoom'], properties: { azimuth: num(-180, 180), elevation: num(-35, 65), zoom: num(0.5, 3) } },
    },
  };
}

export function generateAssistGuide(brief = '', current?: StudioProject): string {
  const json = (value: unknown) => JSON.stringify(value, null, 2);
  return `ARA STUDIO — LLM ASSIST GUIDE (project version 2)
You are directing a short silent 3D film in Ara Studio. Turn the user's brief into ONE complete JSON project that can be pasted or opened in Studio. Return only the JSON object: no code, comments, ellipses or invented capabilities. Use the exact IDs below. If the brief requires an unsupported capability, explain the limitation and suggest an achievable alternative before generating the project.

USER'S BRIEF
${brief.trim() || '[Describe the film you want here.]'}

CAPABILITIES AND STAGING
- One location per project, ${MAX_ACTORS} characters maximum. Choose from the complete location and animation catalogues below; you cannot generate new geometry, sets or clips.
- Each actor has its own sequential beats. Camera shots run on an independent sequential track. All tracks start at time 0; no overlaps within a track. Film duration is the longest track, rounded up to a 30 fps frame, at most ${MAX_DURATION} seconds. Every beat/shot lasts 0.1–12 seconds; up to ${MAX_ACTIONS} beats per actor and ${MAX_SHOTS} shots. Shorter actor tracks hold their final pose; the last shot holds until the film ends. Synchronize beats by matching cumulative durations.
- Looping clips repeat; one-shot clips play once and hold their final pose. Use catalogue duration for original clip timing. Consecutive identical looping beats continue their phase. No speed, blending or animation parameters are configurable in JSON.
- move:true enables native travel ONLY on clips with a travel vector. Other clips use move:false. Travel vectors are metres per second at reference character height in local [X,Y,Z], scaled to character height and rotated by yaw. The whole travel path is centred around actor x/z. For static staging use move:false. Yaw 0 faces +Z; positive yaw turns toward +X. X/Z are horizontal metres; Y is elevation. Actor placement stays constant apart from enabled animation travel. Keep actors apart and in clear performance space.
- Choose ONE of preset (exact catalogue name) or character (an existing encoded recipe copied verbatim). detail is low, medium or high. Optional weapon/carry IDs equip existing rigged props; none removes them. Omit equipment overrides to retain recipe/preset equipment. Never fabricate encoded character strings. Custom appearance beyond presets can be designed in the character builder and supplied as an existing recipe.
- A chair is fitted automatically for seated clips; a bicycle for ride_bicycle. Other vehicle clips are poses only. Set furniture is fixed. Elevation can stage a lying character on a raised surface, but contact must be reviewed visually.
- Camera shot: wide=full body, medium=waist-up, close=close-up; target=all or an actor id. Studio auto-frames the subject, including two actors. Global camera motion is locked, dolly (slow push-in) or orbit (gentle orbit), applied to every shot. view.azimuth/elevation are degree offsets from the default shot; zoom smaller than 1 is closer, larger than 1 is farther. No per-shot paths, camera coordinates or keyframes.
- landscape=16:9; portrait=9:16. title up to 60 characters; caption toggles its overlay. The editor supports timeline edits, dragging and keyboard placement, actor selection, equipment, orbit/zoom, Undo, project save/open and still-image export. Movies are silent H.264 MP4 at 30 fps, manually exported at 720p or 1080p. Export resolution and editor selection are not project fields.
- Timed text: optional texts array, up to ${MAX_TEXT_CUES} cues. Each cue has text (up to 500 characters, 12 lines), start in seconds (0–59.9), duration (0.1–60; start+duration <=60), style (subtitle, text, speech, thought or shout), and anchor (screen or an actor id). Text cues may overlap and can extend the film to their end time. Subtitle = a readable dark caption plate; text = plain outlined lettering; speech/thought = comic bubbles; shout = a comic burst. Text is included in PNG/MP4 exports. For an actor literally named screen, use anchor actor:screen to distinguish it from a fixed screen cue. Actor-attached text follows the animated head through movement and camera shots. Its x/y are offsets in frame fractions (-1..1) from the head, default (0,-0.12). Screen x/y are frame positions (0..1), default (0.5,0.9). size is 14–72 reference pixels at 720p, scaled by the output’s shorter dimension; default 28. Optional color/background are #RRGGBB; comic defaults are dark text on white, subtitles white on dark. Keep simultaneous subtitles at different y positions or schedule them sequentially. No audio is synthesized from this text.
- No audio, dialogue/lip-sync, text-to-speech, imported GLBs, paired handshakes/hugs/fights, automatic hand-to-object contact, collisions, prop handover, free prop placement, lighting overrides, custom backgrounds or location changes during a film. Talk is a silent performance. Do not invent fields for unsupported features.
- Actor ids must be unique, 1–50 letters/numbers/underscores/hyphens, excluding all and camera. Shot targets must exist. Beat/shot ids are optional and regenerated on import. Keep the JSON under 100 KB. Review the result in Studio and refine after import; staging is not physically solved.

COMPLETE LOCATION CATALOGUE
${json(SETS.map(s => ({ id: s.id, name: s.name, category: s.category, mood: s.mood, description: s.subtitle })))}

COMPLETE CHARACTER PRESET CATALOGUE
${json(Object.keys(PRESETS))}

EQUIPMENT IDS
${json({ weapons: WEAPONS.map(id => ({ id, name: WEAPON_LABELS[id] })), bags: CARRIED.map(id => ({ id, name: CARRY_LABELS[id] })) })}

COMPLETE ANIMATION CATALOGUE
${json(CLIPS.map(c => ({ id: c.id, name: c.name, category: c.category, duration: c.duration, loop: c.loop, travel: c.travel ? Array.from(c.travel) : null, note: actionNote(c.id) })))}

JSON SCHEMA
${json(assistSchema())}
Additional constraints: actor ids are unique; shot targets must be all or an actor id; each track and text cue must finish within ${MAX_DURATION}s. Screen text x/y must be 0..1; actor-relative x/y may be -1..1. Text IDs must be unique. Use move:true only for clips whose catalogue travel is non-null. Unknown fields are rejected.

VALID EXAMPLE (replace it with the requested film)
${json(assistExample())}${current ? `\n\nCURRENT FILM — use this as the starting point and preserve details not changed by the brief\n${json(current)}` : ''}

Now create the complete importable JSON for the user's brief using only these capabilities.`;
}

export function summarizeAssistProject(project: StudioProject): string {
  const names = project.actors.map(a => decodeCharacter(a.character, a.detail)?.name || a.id).join(' + ');
  return `${sceneById.get(project.template)!.name} · ${names} · ${durationOf(project)}s · ${project.shots.length} shots · ${project.actors.reduce((sum, a) => sum + a.beats.length, 0)} actions · ${project.texts.length} text cues`;
}
