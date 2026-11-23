/**
 * The short start of film_guide: enough to write most films in one go (the format, a worked example, the sets,
 * presets and everyday clips), so an assistant reads one answer instead of the whole guide. Everything else is a
 * topic it asks for only when the film needs it.
 */
import { CLIPS, clipById } from '../../../src/core/anim/clips';
import { PRESETS } from '../../../src/core/params';
import { EXPRESSIONS } from '../../../src/core/face';
import { SETS } from '../../../src/studio/catalog';
import { MUSIC_TRACKS } from '../../../src/studio/audio/schema';
import { MAX_ACTORS, MAX_DURATION } from '../../../src/studio/project';

/** A complete film in the quickstart's own format (checked by the CLI tests). */
export const QUICKSTART_EXAMPLE = {
  kind: 'ara-studio', version: 2, title: 'The Empty Room', template: 'bedroom-night',
  actors: [
    { id: 'maya', preset: 'The Schoolgirl', detail: 'medium', start: { x: -1, z: 0.5 }, beats: [
      { clip: 'texting', duration: 4, move: false, face: 0, expression: 'happy' },
      { clip: 'walk', to: { x: 0, z: 5 }, move: true, expression: 'afraid' },
      { clip: 'idle', duration: 8, move: false, hidden: true },
    ] },
    { id: 'mum', preset: 'Businesswoman', detail: 'medium', start: { x: 0, z: 5 }, beats: [
      { clip: 'idle', duration: 7, move: false, hidden: true },
      { clip: 'walk', to: { x: 0, z: 1.5 }, move: true, expression: 'happy' },
      { clip: 'look_around', duration: 3, move: false, expression: 'afraid' },
      { clip: 'phone_call', duration: 4, move: false, face: 0, expression: 'crying' },
    ] },
  ],
  shots: [
    { duration: 7, shot: 'medium', target: 'maya' },
    { duration: 5.4, shot: 'wide', target: 'all', camera: 'dolly' },
    { duration: 4, shot: 'close', target: 'mum', view: { azimuth: 25, elevation: 5, zoom: 1 } },
  ],
  camera: 'locked', view: { azimuth: 0, elevation: 0, zoom: 1 }, aspect: 'landscape', caption: false,
  texts: [{ id: 'later', text: 'Later that evening…', start: 5.5, duration: 1.5, style: 'text', anchor: 'screen', x: 0.5, y: 0.5, size: 40 }],
  audio: {
    speech: [
      { id: 'home', actor: 'mum', text: "Maya? I'm home!", voice: 'F2', start: 9, duration: 1.6 },
      { id: 'call', actor: 'mum', text: "Police? My daughter's gone.", voice: 'F2', start: 13, duration: 2.4, delivery: 'shaking, close to tears' },
    ],
    music: { track: 'horror', volume: 0.2 },
  },
};

/** Clips most films use, by group. Walking speeds come from the clips themselves. */
const COMMON = {
  'Stand and move': ['idle', 'walk', 'walk_slouch', 'run', 'walk_back', 'crouch', 'look_around', 'lean_wall', 'jump'],
  'Talk and react': ['talk', 'talk_gestures', 'wave', 'point', 'laugh', 'cry', 'cheer', 'clap', 'thumbs_up', 'bow', 'phone_call', 'texting', 'take_picture'],
  'Hands': ['pick_up', 'put_down', 'open_door', 'use_press', 'push', 'handshake'],
  'Sit and lie': ['sit_down', 'sit_idle', 'stand_up', 'lie_down', 'sleep'],
  'Fights and falls': ['fight_idle', 'punch_combo', 'hit_front', 'knockdown', 'get_up_face_up', 'death_forward', 'fall'],
};

export function filmQuickstart(brief = ''): string {
  const clip = (id: string) => { const c = clipById.get(id);if (!c) return '';const speed = c.travel ? Math.hypot(c.travel[0], c.travel[2]) : 0;return speed ? `${id} (${speed.toFixed(1)} m/s)` : id; };
  return `ARA STUDIO FILM QUICKSTART
Write the film as JSON and pass it to create_film. It checks the film as Studio does, saves it and returns a link that opens it in Ara Studio. An error names the field to fix: fix it and call create_film again. This answer is enough for most films; read a topic from the list at the end only when the film needs it.${brief ? `\n\nTHE BRIEF\n${brief}` : ''}

A WHOLE FILM (one set, up to ${MAX_DURATION} seconds, up to ${MAX_ACTORS} characters)
${JSON.stringify(QUICKSTART_EXAMPLE)}

HOW IT WORKS
- template: the set (list below). Each set's floor map (bounds, furniture, seats, open sides) comes with film_guide { "location": "<set id>" }; asking for the guide with the location returns this quickstart and the map together.
- Positions are metres on the floor: x left to right, z from the back of the set (negative) to the front (positive). Facing is in degrees: 0 faces the front (towards the default camera), 90 faces +x, 180 faces the back, -90 faces -x.
- Each character: a unique id, a character (below), detail "medium", "start": { x, z } (where its first action begins) and its actions ("beats") in order from 0 seconds.
- Each action: clip, duration in seconds (at most 12) and move (true when a walking or running clip should travel). Optional:
  - "to": { x, z } walks or runs straight there; its facing, travel and duration are worked out for you (leave duration out).
  - "face": the direction to face from this action on (later actions keep it).
  - "hidden": true keeps the character off stage for that action: not drawn, not framed and not staging-checked. Use it before an entrance and after an exit. A character goes off stage by walking out of an open side of the set.
  - "expression": ${EXPRESSIONS.join(', ')}; it lasts until another action sets one.
- Characters: "preset" with a name below; or "character" with a builder link (https://ara3dgen.com/app/#c=...) from create_character, which keeps a character made earlier exactly; or "preset" plus "params" with changes (fields in character_schema).
- Equipment on a character: "weapon" (pistol, rifle, sword, knife) and "carry" (phone, handbag, briefcase, backpack and more). A character carries one item. Actions that need one get it automatically: a phone for phone_call and texting, a broom for sweep, a box for carry_idle and carry_walk, the basin for head-load clips, the parachute rig for parachute clips and gym weights for the lifts. Choosing a different carry for such a character is an error, so leave carry out or match it.
- shots: the camera, one shot after another; their durations add up to the film's length. shot is wide, medium or close; target is "all" or a character id; optional camera (locked, dolly, orbit) and view { azimuth -180..180, elevation, zoom }. Off-stage characters are never framed.
- texts: on-screen words. style "text" or "subtitle" with anchor "screen" (x and y from 0 to 1), or "speech", "thought" or "shout" bubbles anchored to a character id.
- audio.speech: spoken lines { id, actor, text, voice, start, duration }; voices F1 and F2 (female), M1 and M2 (male). Allow about 0.35 s a word. delivery describes the tone. audio.music: { track, volume }.
- A story in several places: a version 3 film with up to five scenes, each one like the film above (topic core-rules).

SETS (template ids)
${SETS.map((s) => `${s.id} (${s.name})`).join(', ')}

PRESET CHARACTERS
${Object.keys(PRESETS).join(', ')}

EVERYDAY CLIPS (${CLIPS.length} in all: topic complete-animation-catalogue)
${Object.entries(COMMON).map(([group, ids]) => `- ${group}: ${ids.map(clip).filter(Boolean).join(', ')}`).join('\n')}
Turn a character with "face" rather than the turn clips.

MUSIC
${MUSIC_TRACKS.filter((t) => t.id !== 'none').map((t) => `${t.id} (${t.category})`).join(', ')}`;
}
