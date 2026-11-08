import {animationGroup} from '../core/anim/groups';
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

import {VEHICLE_FOR_CLIP} from '../core/props/vehicles';
import {WEAPON_POSES} from '../core/anim/riding-weapons';
import {VEHICLE_TRANSITIONS} from '../core/props/vehicle-actions';

import {studioTravel,VEHICLE_SPEED,MAX_TRAVEL_SPEED,STAGE_LIMIT} from './motion';
import {VEHICLE_SEATS,seatsForVehicle} from './vehicle-seats';
import {VEHICLE_IDS} from '../core/props/vehicles';
import type {SetId} from './catalog';
import {locationMapFile,locationMapIndex} from './spatial-maps';
import {stagingReport,type StagingReport} from './spatial-report';
import {BOAT_EDGE_TOLERANCE} from './spatial-geometry';

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
    if (object(shot)) {fields(shot, ['id', 'duration', 'shot', 'target','view','camera'], `Shot ${i + 1}`);if(object(shot.view))fields(shot.view,['azimuth','elevation','zoom'],`Shot ${i+1} view`);}
  });
  if (Array.isArray(value.actors) && (value.actors.length < 1 || value.actors.length > MAX_ACTORS)) throw Error(`A film needs one to ${MAX_ACTORS} characters.`);
  if (Array.isArray(value.actors)) value.actors = value.actors.map((raw, i) => {
    if (!object(raw)) return raw;
    const path = `Character ${i + 1}`;
    fields(raw, ['id', 'preset', 'character', 'params', 'detail', 'weapon', 'carry', 'vehicle', 'x', 'y', 'z', 'yaw', 'beats'], path);
    if (Array.isArray(raw.beats)) raw.beats.forEach((beat, j) => {
      if (object(beat)) fields(beat, ['id', 'clip', 'duration', 'move', 'travelSpeed', 'flightHeight', 'showVehicle', 'showProp', 'weaponPose', 'weaponYaw', 'weaponPitch', 'vehicleId', 'vehicleSeat'], `${path}, action ${j + 1}`);
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
    id: { type: 'string' }, vehicleId:{type:'string',pattern:'^[a-zA-Z0-9_-]{1,80}$',description:'Physical vehicle identity shared across actors and entry/ride/exit beats. Omit for an actor-owned model.'},vehicleSeat:{...enumeration(VEHICLE_SEATS),description:'operator by default. Passengers reference the operator’s vehicleId and use a seat supported by its model.'}, clip: enumeration(CLIPS.map(c => c.id)), duration: num(0.1, 12), move: { type: 'boolean' },showVehicle:{type:'boolean',description:'Operator vehicle visibility. Shared passengers use the existing physical prop, without duplicates.'},showProp:{type:'boolean',description:'Climbing and cover actions only: false hides the ladder, obstacle, ledge wall or cover wall for that span (the motion is unchanged), e.g. when the set already has one.'},flightHeight:{...num(0,30),description:'Aircraft: flight altitude with takeoff/landing, default 3m moving or 0 stationary. Aerial actions: START altitude, easing to the next aerial start height. Defaults skydive20/deploy12/glide8/land2 m; land reaches ground at touchdown. Passengers inherit pilot height.'},travelSpeed:{...num(.1,MAX_TRAVEL_SPEED),description:'Vehicle travel metres per second. Does not change animation playback. Only for riding/driving actions; not boarding/alighting.'},weaponPose:{...enumeration(WEAPON_POSES),description:'Mounted and pistol/rifle performances: hold/aim/fire. Fire requires pistol/rifle. Hidden works on any beat. Omitted: wield while riding, hide during entry/exit, native pose otherwise.'},weaponPitch:{...num(-45,60),description:'Weapon elevation in degrees: positive up, negative down. Works on mounted and pistol/rifle performances.'},weaponYaw:{...num(-110,110),description:'Weapon heading in degrees: 0 forwards, positive left, negative right.'},
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
      detail, weapon: enumeration(WEAPONS), carry: enumeration(CARRIED), vehicle: enumeration(['auto','none']), x: num(-STAGE_LIMIT, STAGE_LIMIT), y: num(0, 3), z: num(-STAGE_LIMIT, STAGE_LIMIT), yaw: num(-180, 180),
      beats: { type: 'array', minItems: 1, maxItems: MAX_ACTIONS, items: action },
    } };
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema', title: 'Ara Studio LLM input, version 2', type: 'object', additionalProperties: false,
    $defs:{characterParams:builder.properties.params,characterSpecification},
    required: ['kind', 'version', 'title', 'template', 'actors', 'shots', 'camera', 'view', 'aspect', 'caption'], properties: {
      kind: { const: 'ara-studio' }, version: { const: 2 }, title: { type: 'string', maxLength: 60 }, template: enumeration(SETS.map(s => s.id)),
      actors: { type: 'array', minItems: 1, maxItems: MAX_ACTORS, items: actor },
      shots: { type: 'array', minItems: 1, maxItems: MAX_SHOTS, items: { type: 'object', additionalProperties: false, required: ['duration', 'shot', 'target'], properties: {
        view: {type:'object',additionalProperties:false,required:['azimuth','elevation','zoom'],properties:{azimuth:num(-180,180),elevation:num(-35,65),zoom:num(.5,3)}},camera:enumeration(['locked','dolly','orbit']),
        id: { type: 'string' }, duration: num(0.1, 12), shot: enumeration(['wide', 'medium', 'close']), target: { type: 'string', description: 'all, or an actor id in this project' },
      } } }, camera: enumeration(['locked', 'dolly', 'orbit']), aspect: enumeration(['landscape', 'portrait']), caption: { type: 'boolean' },
      texts: {type:'array',maxItems:MAX_TEXT_CUES,items:{type:'object',additionalProperties:false,required:['text','start','duration','style','anchor'],properties:{
        id:{type:'string',pattern:'^[a-zA-Z0-9_-]{1,50}$'},text:{type:'string',maxLength:500},start:num(0,59.9),duration:num(.1,60),style:enumeration(TEXT_STYLES),
        anchor:{type:'string',description:'screen, or an actor id to follow their animated head'},x:num(-1,1),y:num(-1,1),size:num(14,72),
        color:{type:'string',pattern:'^#[a-fA-F0-9]{6}$'},background:{type:'string',pattern:'^#[a-fA-F0-9]{6}$'}}}},
      audio:{type:'object',additionalProperties:false,properties:{
        muted:{type:'boolean'},music:{type:'object',additionalProperties:false,properties:{start:num(0,59.9),duration:num(.1,60),track:enumeration(MUSIC_TRACKS.map(t=>t.id)),volume:num(0,1),ducking:{type:'boolean'},fadeIn:num(0,10),fadeOut:num(0,10)}},
        effects:{type:'array',maxItems:MAX_SOUND_EFFECTS,items:{type:'object',additionalProperties:false,required:['sound'],properties:{
          id:{type:'string',pattern:'^[a-zA-Z0-9_-]{1,50}$'},name:{type:'string',maxLength:80},sound:enumeration(SOUND_EFFECTS.map(s=>s.id)),actor:{type:'string',description:'Optional existing actor ID for organization; omit for a scene sound. Does not add spatial audio.'},
          loop:{type:'boolean',default:false},start:num(0,59.9),duration:num(.01,60),offset:{...num(0,60),description:'Source seconds; must be strictly less than this sound’s library duration.'},speed:num(.5,2),volume:num(0,2),pan:num(-1,1)}}},
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
export function generateAssistGuide(catalog:Catalog,brief = '', current?: StudioProject,location?:SetId,currentStaging?:StagingReport): string {
  const json = (value: unknown) => JSON.stringify(value);
  const selected=location??current?.template??'portrait';
  return `ARA STUDIO — LLM ASSIST GUIDE (project version 2)
You are directing a short 3D film in Ara Studio. Turn the user's brief into ONE complete JSON project that can be pasted or opened in Studio. Return only the JSON object: no code, comments, ellipses or invented capabilities. Use the exact IDs below. If the brief requires an unsupported capability, explain the limitation and suggest an achievable alternative before generating the project.

USER'S BRIEF
${brief.trim() || '[Describe the film you want here.]'}

SPATIAL-STAGING REQUIREMENT
Boat shoreline/dock warnings allow ${BOAT_EDGE_TOLERANCE*100} cm of inset on the conservative rectangular envelope to avoid minor docking-contact warnings. Map boundaries, land/water geometry and verified routes remain unchanged; plan clear routes instead of relying on the allowance. Larger overlaps, travel across land/docks, and static-obstacle conflicts still warn. The pasted-JSON review uses estimated reference-size boats; Check staging after Build uses fitted boats.
Before generating a film, calculate the world-space position AND facing direction of each moving actor at EVERY action transition, including both sides of an entry/exit. Validate the COMPLETE swept path and the complete vehicle/body footprint against the selected location's land, water and obstacle boundaries, not just the first frame. Ground vehicles and running/walking characters must remain on navigable land; boats must remain in navigable water. Check parked/waiting props too. Stop vehicles before the end of a verified lane and keep all entry/exit intervals stationary. Do not infer that a large floor under a water surface is navigable land. No automatic pathfinding or physical collision prevention runs during playback.

The guide includes a compact index for EVERY location, then the FULL machine-readable staging map for ${selected}. If you choose another location, request its map (LLM Assist > Location for this film > Save map .json), or the All location maps file, before authoring any route whose geometry is unavailable. Identify the uncertainty; never invent safe coordinates. A verified lane is a geometric reference corridor, not a traffic law, collision simulation or permission to extend the route indefinitely. A set without a verified dock does not have a verified boat boarding point. Pools are water surfaces, not automatically navigable boat routes.

COORDINATES AND TRAVEL CALCULATION
All map poses and bounds are world metres; rect=[minX,minZ,maxX,maxZ], yaw in degrees, 0=+Z, 90=+X, 180=-Z, -90=-X. Seats are [x,y,z,yaw], y=seat-top height. Land is map.bounds minus all water rectangles, plus walkable dock overlays. Regions mark exact rendered walkway/road/court/dock edges; obstacles are conservative geometry envelopes with bottom/top heights. Remain within map.bounds even though the actor placement fields allow ±${STAGE_LIMIT}. Static floor colour outside those bounds does not certify a route. Keep ordinary actor.y=0: raising a character does not make water into ground. Helicopter flight is checked in 3D against obstacle heights; takeoff/landing still require clear ground.

Actor x/z are the CENTRE of the complete enabled local travel, NOT the start. For each beat i let v_i be the catalogue local travel (vehicle speed override applied) if move:true, otherwise [0,0,0]. Let D=sum(v_i*duration_i) over the actor's ENTIRE timeline. At time t the nominal local displacement is cumulativeTravel(t)-D/2. With rig scale s and yaw a: worldX=actor.x+s*(localX*cos(a)+localZ*sin(a)); worldZ=actor.z+s*(-localX*sin(a)+localZ*cos(a)). To start at world S, solve actor.xz=S+R(a)*(s*D/2). Final nominal position is actor.xz+R(a)*(s*D/2). Never recompute the centre per beat. Adding later travel shifts earlier nominal positions. Rowboat velocity points local -Z. Visual turn clips animate the skeleton; they DO NOT rotate the actor's travel axes or change its authored yaw between beats. Do not invent per-beat x/z/yaw or waypoints.

Vehicle/doorway offsets then modify that nominal path: boardingStand is measured in anatomical boardingScale b (distinct from rig scale s), and passengers use the OPERATOR's vehicle transform. A first board starts at the vehicle origin + R(a)*boardingStand*b. An alight ends at that same doorway offset from the last vehicle origin; that offset is carried into the following ground span. For the next NEW vehicle, Studio places its waiting origin at the end of the preceding ground span minus R(a)*boardingStand*b. It exists there from time zero. Reusing a vehicleId returns to its last parked position; ground spans are adjusted to connect the real doorways, so their direction can differ from nominal travel. Passengers inherit the host's full motion; do not apply their own centred path or offset them by hand. These offsets require re-evaluating the whole track after edits. Use Check staging in Studio to export actual fitted-body transition positions and issues; a reference-scale calculation is provisional until reviewed with the loaded cast.

BOAT BOARDING CONTRACT
Motorboat operator boardingStand=[1.62,-0.42] in local X/Z, scaled by b. The map's harbour anchor has an on-land approach, exact standing gate pose, a separate waiting boat origin and a verified water departure. Follow all four. Reference anchors/vehicle envelopes use s=b=1; custom bodies require re-checking dock reach and footprint. The harbour shoreline is z=-7.5 (land toward +Z, water toward -Z); its pier extends into water and is the only verified boarding anchor. For the east-pier anchor, yaw=180, stand=(0.85,0,-11.5), waiting motorboat origin=(2.47,0,-11.92), departure=(2.47,0,-45). Solve actor origin from its full timeline: do not paste the stand coordinate into actor.x/z. A motorcycle → alight → run → board_motorboat sequence must leave the motorcycle on land, end its run at the pier gate, keep the future boat fully in water from frame zero, and depart along the verified water lane. Add drive_boat move:false if another passenger is still boarding; shared entries use the same gate and must be staggered. No automatic docking, turning, shoreline following or bank-to-bank route is supplied.

ALL LOCATION MAP INDEX (compact JSON; seats=[x,y,z,yaw]; full obstacles and verified lane endpoints are in the selected map/file)
${JSON.stringify(locationMapIndex())}

SELECTED LOCATION STAGING MAP — reference data only, do not add it to film JSON
${JSON.stringify(locationMapFile(selected))}
${current?`\nCURRENT FILM STAGING REPORT — measurements apply to these unchanged character recipes only; changed/new characters need a fresh fitted check\n${JSON.stringify(currentStaging??stagingReport(current))}`:''}

CAPABILITIES AND STAGING
- One location per project, ${MAX_ACTORS} characters maximum. Choose from the complete location and animation catalogues below; you cannot generate new geometry, sets or clips.
- Each actor has its own sequential beats. Camera shots run on an independent sequential track. All tracks start at time 0; no overlaps within a track. Film duration is the longest track, rounded up to a 30 fps frame, at most ${MAX_DURATION} seconds. Every beat/shot lasts 0.1–12 seconds; up to ${MAX_ACTIONS} beats per actor and ${MAX_SHOTS} shots. Shorter actor tracks hold their final pose; the last shot holds until the film ends. Synchronize beats by matching cumulative durations.
- Looping clips repeat; one-shot clips play once and hold their final pose. Use catalogue duration for original clip timing. Consecutive identical looping beats continue their phase. Animation playback speed and blending are fixed; vehicle travelSpeed controls only movement through the set.
- Pistol performances include pistol_walk, pistol_run, pistol_sprint, pistol_strafe_left/right and pistol_aim_one_hand; equip weapon:pistol. Rifle walk/run/sprint/strafe retain the recorded gait under their weapon hold. Walk backwards is the recorded Walk played in reverse. Laugh runs at half its previous speed. All recorded turns run at 2x speed (0.95 seconds for 45/90 degrees, 3.6 seconds for 360). Use the catalogue duration.
- Swimming (category Swimming): tread_water, swim_freestyle, swim_breaststroke, swim_backstroke (travels head first, i.e. backwards), dive_into_water (from the bank, ~3.5m with move:true) and climb_out_of_water (onto a bank at water level, ~0.9m). The water surface is the ground plane; strokes must stay inside a map water rect (path review flags swimmer-on-land). Start a dive at the water's edge facing the water and a climb-out within 0.5m of the bank facing it. Weapons are hidden while swimming; hand-carried bags are not.
- Climbing (group Climbing): ladder_up / ladder_down (loops, 0.5 m/s up, 0.43 m/s down, always travel; a ladder stands in front of the climb's start), vault_over (1.2s, 2.8m forward over a 0.9m obstacle placed 1.1m ahead), ledge_hang (loop) then ledge_climb_up (2.8s, ends standing on a 2.15m ledge 0.62m forward; later beats continue up there). Each climb's prop (ladder, obstacle or ledge wall) is placed where the climb starts and stays for the film; showProp:false on a climbing or cover action hides it, for example to climb something the set already has. Place a climb with its prop clear of set obstacles and walls. Hand-carried bags are put away while climbing.
- Combat (group Combat): fight_idle is a boxing guard (loop); punch_combo (jab, cross, hook, 1.6s), kick_front (1.1s), kick_roundhouse (1.4s, pivots on the front foot) and block (0.8s) start and end in it, so chain them with fight_idle between; keep weapon none. sword_combo (three cuts, 2.1s) and sword_thrust (1.1s) start and end in sword_idle; equip a sword. Pair attackers with hit_* / block on the defender at matching times (no contact is solved).
- Cover (group Shooter, equip a rifle): take_cover (1.2s, always travels ~0.46m: two steps and a crouch) places a 1.1m cover wall ahead, which stays for the film; then cover_idle (loop, head hidden) and cover_fire (2.4s: rise, three shots, duck) use it. Start take_cover from rifle_idle facing the threat with ~1.5m clear ahead. rifle_hit_front / rifle_hit_back keep the rifle at low ready; rifle_death_forward / rifle_death_backward lay the rifle down and end where death_forward / death_backward end (get_up_* follow).
- Everyday NPCs (group Everyday): talk_gestures, phone_call and texting (carry:phone; the phone only shows in these clips), lean_wall (back to a wall ~0.2m behind the heels), look_around, sweep (carry:broom; the broom only shows while sweeping).
- Equip carry:head_load (enamel basin of produce on a head pad) and use head_load_idle / head_load_walk (move:true travels) for carrying a load on the head with the right hand steadying it.
- Equip carry:parcel and weapon:none for a two-hand box. Ordinary walk, run, backwards/slouch/model walk, strafes, turns, idle, talk and laugh automatically keep it between the hands, preserving the original gait and speed; carry_idle/carry_walk remain available. Pickup starts on the floor and lifts after contact; put_down takes 3.4 seconds and places the box on the floor around 1.6 seconds. After put_down, Studio keeps it on the ground as the character walks away, until a later pick_up. Stage the character back at the box before pickup; it is not an automatic navigation or reach-to-object system. Pickup grip is around 1.5 seconds and lifting begins around 1.8 seconds. Other performances (combat, jumps, gestures, sitting/lying and vehicles) use their original arm poses and do not support this carry layer; use carry:none for those. No transfers between characters or grabbing arbitrary set props. Scale and stage the character normally; do not add separate box geometry or attachment fields.
- move:true enables travel on locomotion AND vehicle clips with a catalogue travel vector. For vehicles only, optional travelSpeed 0.1..${MAX_TRAVEL_SPEED} overrides their default metres per second. The complete vehicle and rider move together; stationary actions keep move:false. This does not retime the riding performance. Other clips use move:false. Travel vectors are metres per second at reference character height in local [X,Y,Z], scaled to character height and rotated by yaw. The whole travel path is centred around actor x/z. For static staging use move:false. Yaw 0 faces +Z; positive yaw turns toward +X. X/Z are horizontal metres; Y is elevation. Actor placement stays constant apart from enabled animation travel. Keep actors apart and in clear performance space. Check staging reports conservative land/water/obstacle conflicts over the whole film, but playback has no physical collision response, navigation mesh, pathfinding or stop-at-wall logic. Reports are advisory; movement can still pass through geometry until the film is corrected. Use move:false when a clear route cannot be staged, and review travelling clips before export.
- Design each character inside the film JSON: use actor.params alone to build from defaults, or actor.preset plus actor.params to inherit a preset and override its appearance. The shared character-building instructions and complete parameter schema below apply to these params. You can also paste an entire character-builder response into actor.character: {"kind":"ara-character","version":1,"preset":"The Adventurer","params":{"name":"Custom explorer","ageYears":34}}. A raw builder .params.json object is also accepted in actor.character. No separate builder visit is required.
- Existing encoded actor.character strings still work. Add actor.params to override that existing character; never invent or edit an encoded string yourself. Do not combine preset and character, or put params both inside a character object and on its actor. Omitted fields inherit from the selected preset/existing recipe, or defaults when neither is provided. Supplied arrays/maps replace the inherited values, so include all desired entries. actor.detail (low/medium/high) always overrides embedded params.detail. Top-level actor.weapon/carry override equipment in the character specification; omit them to retain it, use none to remove it.
- Studio needs an animated rig: rig none is rendered with the game rig, and animations are enabled for Studio performances. All other supported body, face, skin, hair, clothing, colours, modifiers and rig options use the builder specification below. Character parameters belong only inside params or a character specification; placement x/y/z/yaw and performance beats stay on the actor.
- With three to five actors, author a distinct x/z/yaw placement for every actor; no blocking/arrangement field exists in JSON. Start with about 1.5–1.9 metres between standing roots, stagger rows or use a conversation semicircle, and review travel paths. Use wide establishing shots for the cast and medium/close shots targeting individual actor IDs for dialogue, especially in portrait. The editor’s arrangement dropdown is available only with exactly two actors; place larger casts individually.
- Seated clips (sit_down, sit_idle, stand_up) use the set's own furniture: Studio moves the character onto the nearest free seat (chair, sofa, armchair, bench, stool or log) and faces them the way the seat faces, so stage sitters near a seat. Choose a set with seating for seated scenes; sets such as studios, beaches and streets may have none. No chairs are added. Vehicle models follow actions automatically: ${json(VEHICLE_FOR_CLIP)}. Vehicle travel defaults are ${json(VEHICLE_SPEED)} metres per second (the helicopter flies at 12m/s). travelSpeed overrides 0.1..${MAX_TRAVEL_SPEED}; it changes travel, never animation cadence. Rowing travels backwards; other vehicles travel forwards. Keep carry:none. Appearance comes from the operator's character params.vehicleStyle (color, accentColor, seatColor, finish, variant). actor.vehicle remains legacy auto/none; action showVehicle controls the operator's prop. No water physics or obstacle navigation.
- Grenade: equip weapon:grenade for throw_grenade (2.2s, move:false). The rigid prop follows the hand until release at 0.82s, then follows a visual arc. Studio retains the released prop when the actor walks away. Another throw supplies another prop. Grenades hide during riding/entry/exit. No explosion or damage simulation. Do not combine the grenade with firearm aim/fire.
- Armed riding: choose actor.weapon (pistol, rifle, sword or knife), then use ordinary vehicle clips. The actor keeps that weapon model across the film; individual beats control weaponPose: hold (wield, the default while riding), aim (guns aim; blades present a guard), fire (pistol/rifle recoil, repeating approximately twice per second), or hidden. weaponPose:hidden also works on non-vehicle actions, so the actor can free both hands without changing its character recipe. Boarding/alighting hide the weapon automatically and keep both hands available. Explicit poses, weaponYaw and weaponPitch are supported on riding/driving and pistol/rifle performances, not boarding/alighting. Guns and blades use the right hand; the left keeps the wheel, handlebar or both reins. Paddling/rowing pauses while wielding a weapon; paddles/oars are held at rest. Choose hidden to resume the original two-hand stroke. Move/travelSpeed remain available for riding, drifting or coasting while armed. Car side windows lower automatically while armed. A car driver defaults to aiming out the left window, a passenger out the right, the horse to the right of its neck, other vehicles diagonally right. Override weaponYaw (-110..110 degrees, 0 forward, positive left, negative right) to direct the weapon, with weaponPitch (-45..60 degrees, positive up, negative down) for elevation. On-foot pistol/rifle clips default to yaw 0. Both fields are saved per beat; the native stance and gait remain. Preview clearance for custom directions and long blades. No automatic aim tracking, targets, bullets, impacts, damage or muzzle flashes; add timed gunshot effects separately. For a hero who boards, fires while riding and exits, keep actor.weapon:pistol and use board_motorcycle (1.7s, move:false), ride_motorcycle (3s, move:true, weaponPose:fire), alight_motorcycle (1.7s, move:false); the prop is hidden only during the transitions. There is no need to set weapon:none for riders. Keep carry:none to leave the hands available.
- Aerial choreography: equip carry:parachute and use skydive (loop) → parachute_deploy (full 2.4s) → parachute_glide (loop; optional move:true, 2m/s forward) → parachute_land (full 3s) → idle/walk. Pack, harness, canopy and lines are fitted and exported with prop joints; body bones never scale. Weapons hide automatically during aerial actions. The canopy inflates during deployment, stays open while gliding, and collapses away during landing; landing ends in the exact upright idle pose. These are authored performances, not wind/cloth/flight physics. Start the aerial sequence in the air; no mid-flight vehicle ejection animation is provided.
- Aerial altitude: flightHeight on an aerial beat is its START height above actor.y, in metres (0..30). Defaults: skydive20, parachute_deploy12, parachute_glide8, parachute_land2. Each aerial beat eases toward the next aerial beat’s start height. A final skydive/deploy/glide beat holds its start height if there is no following aerial action. Land parachute descends to zero by touchdown (0.65s of the native 3s), then absorbs impact and recovers. Keep actor.y:0 for ground-level landing and use native timing for deploy/land. Put land before walking to avoid a sudden cut from altitude to ground. The start height control appears for aerial actions. Preview the complete path, canopy clearance and landing surface; no terrain-following or automatic obstacle avoidance.
- Expanded fleet: pickup (drive_pickup, two seats, open load bed), military tank (drive_tank, one operator, tracked chassis) and jet (fly_jet, one pilot). Each has board_MODEL and alight_MODEL; pickup also has passenger clips. Aircraft flightHeight controls continuous takeoff/landing; use 0 to taxi. For a realistic jet flight use board_jet → takeoff_jet (6s, always travels ~80m, climbs to flightHeight, default next flight's height else 8m) → fly_jet (move:true) → land_jet (6s, ~85m, touchdown at 3.6s then stops) → alight_jet. The jet pitches with its climb, banks gently and folds its gear in the air. taxi_jet drives the jet along the runway (loop, always travels, 8m/s). The tank driver sits enclosed under a closed roof hatch; gun_tank stands them in the hatch firing the shielded roof machine gun (loop, optional move). Personal weapons stay hidden in tank and jet manoeuvres. Bail-outs: with carry:parachute, bailout_jet (2.6s, always travels) or bailout_helicopter (2.6s, pilot or passenger seat) leave a flying aircraft at 20–30m flightHeight, then skydive → parachute_deploy → parachute_glide → parachute_land; free fall starts just below the aircraft and later aerial defaults scale down; the empty aircraft flies on and leaves the shot. Crash escapes: crash_car, crash_sports_car, crash_suv, crash_pickup, crash_motorcycle and crash_bicycle (3.6s, move:false) — the driver dives out left, rolls and stands ~3m to the left while the vehicle rolls over and stays upside down; follow with on-foot actions. crash_fall_MODEL (same vehicles, 3.4s, move:false) throws the driver out to land on their back ~3m to the left, lying still; follow with get_up_face_up or leave them down. roll_forward, dodge_left and dodge_right are on-foot evasive moves (move:true travels). A jet needs a wide runway/flight corridor, not a harbour pier. Do not infer a safe lane for a larger vehicle from a car lane.
- Vehicle stunt rolls: tumble_MODEL is available for each mechanical vehicle (not horse). Use its full 3 seconds, move:false and keep extra lateral/overhead space. Rider and vehicle rotate together through a complete 360-degree roll and end upright; no crash physics, damage, collisions, ejection or automatic route correction. The weapon is hidden during the stunt. Aircraft rolls accept flightHeight (default 3m); place them between matching fly actions at the same height to roll in the air without an intermediate landing.
- Vehicle entry/exit: ${VEHICLE_TRANSITIONS.length*2} one-shot actions, with matching pairs for every model and car driver/passenger role. Pair table [suffix, riding clip, label, duration seconds]: ${json(VEHICLE_TRANSITIONS)}. Use full clip-length entry/exit (twice the previous speed) actions with move:false, then a matching riding beat. Vehicles are persistent scene objects: every scheduled vehicle is already waiting at its first boarding position from frame zero, stays at its last position after exit, and is retained when an actor uses another vehicle. A motorcycle → alight → run → board_motorboat → drive_boat sequence automatically stages the waiting boat at the end of the run and keeps the motorcycle behind. Leading ground beats meet the first entry; ground spans connect the exit and next entrance. Reusing the same vehicleId returns to the same parked prop; use different IDs for distinct vehicles of the same model. Preview paths and leave physical room. There is no pathfinding or collision avoidance.
- Shared occupants: assign the SAME vehicleId (e.g. getaway) to the operator's and passengers' matching vehicle beats. The operator uses vehicleSeat:operator (default); every passenger uses a different supported seat. Seat catalogue: ${json(Object.fromEntries(VEHICLE_IDS.map(id=>[id,seatsForVehicle(id)])))}. Standard/sports cars have two seats; SUV four; motorboat three. Use the host model's own boarding/riding/alighting clips for boat passengers; the seat setting supplies seated passenger choreography through the boarding gate. For cars, choose matching passenger clips (rear-left may use the driver-side entry). The editor's Vehicle and Seat selectors link the complete contiguous entry/ride/exit sequence. Passengers attach to the actual vehicle, inherit its yaw/travel and keep contact across body sizes; omit passenger travelSpeed and use move:false. Do not add hand-authored seat/elevation offsets or hide a duplicate prop: only one vehicle is rendered. Keep the operator stationary during ALL boarding/alighting intervals (including passengers), then drive. Stagger boat entries through the single gate; add differently timed walking approaches so waiting actors occupy different positions. Car occupants can use separate doors. Duplicate seats, mismatched models, missing operators and moving-doorway boarding are rejected. After a passenger exits, they stay on the ground even when the vehicle departs.
- Helicopter: use board_helicopter (2.2s), fly_helicopter (looping pilot pose), alight_helicopter (2.2s). Four seats: operator (pilot, right), front-passenger (left), rear-left, rear-right. Share the same vehicleId and use fly_helicopter plus matching transitions on passengers with move:false; omit passenger flightHeight/travelSpeed. Four real hinged doors open for their assigned occupants. Pilot travel defaults to 12m/s. Optional pilot-only flightHeight is 0..30m above actor.y; omit for 3m with move:true or 0 with move:false. A positive height with move:false hovers. A continuous span of fly_helicopter beats on the same vehicle takes off once and lands once, easing to/from ground; height changes ease between beats. Keep the pilot grounded and stationary during every entry/exit. Before passengers board, use fly_helicopter with move:false,flightHeight:0; put positive-height flight after all entries, then alight after it lands. Keep actor.y=0 for ordinary ground-level boarding. Rotors stop during entry/exit and while the parked vehicle waits; running flight clips rotate both rotors. Leave roughly 4m rotor clearance around the cabin and 6m behind it for the tail. No collision avoidance, autopilot route planning, combat projectiles, rotor sound, aviation physics or real terrain landing detection; add a supported sound effect separately. Character/prop exports include the fitted pilot/boarding poses, doors and rotors, not Studio world travel/flight height.
- Outdoor locations have extended paths, promenades, landscapes and water in both horizontal directions, with a 360m-wide/deep performance area. Actor X/Z placement allows -${STAGE_LIMIT}..${STAGE_LIMIT} metres. Furniture keeps its real dimensions; indoor rooms keep their original layouts. Camera clipping and fog support the larger sites. The basketball court is centred at x=9,z=0 (edges x=4..14,z=-8..8), beside the main walkway x=-3..3. Mountain-lake shoreline is z=-9; campsite shoreline z=-14; water is beyond those lines in negative Z. Trees stay on land and the mountains stand beyond the far bank. Stage clear routes and use wide establishing shots for vehicle travel.
- Camera shot: wide=full body, medium=waist-up, close=close-up; target=all or an actor id. Studio auto-frames the subject, including all five actors. Global camera motion is locked, dolly (slow push-in) or orbit (gentle orbit). Each shot may override camera and/or view; omitted values inherit the film defaults. A shot view is a complete object {azimuth,elevation,zoom}, with azimuth -180..180 degrees, elevation -35..65 degrees, zoom .5..3. These are offsets from the default framing; zoom smaller than 1 is closer, larger than 1 is farther. Use different shot views for reverse angles, profile shots or higher views. For example {"duration":3,"shot":"medium","target":"actor-a","camera":"locked","view":{"azimuth":90,"elevation":5,"zoom":1}}. Orbit/zoom in the preview edits the active custom shot; otherwise it edits the film default. No camera coordinates, paths or keyframes.
- landscape=16:9; portrait=9:16. title up to 60 characters; caption toggles its overlay. The editor supports adding/removing up to five independent actors, adding saved custom-character JSON files from the builder, timeline edits, dragging and keyboard placement, actor selection, equipment, orbit/zoom, two-character arrangements (side by side, conversation, facing each other), Undo, project save/open and still-image export. Movies are H.264 MP4 with an optional stereo soundtrack at 30 fps, manually exported at 720p or 1080p. Export resolution and editor selection are not project fields.
- Timed text: optional texts array, up to ${MAX_TEXT_CUES} cues. Each cue has text (up to 500 characters, 12 lines), start in seconds (0–59.9), duration (0.1–60; start+duration <=60), style (subtitle, text, speech, thought or shout), and anchor (screen or an actor id). Text cues may overlap and can extend the film to their end time. Subtitle = a readable dark caption plate; text = plain outlined lettering; speech/thought = comic bubbles; shout = a comic burst. Text is included in PNG/MP4 exports. For an actor literally named screen, use anchor actor:screen to distinguish it from a fixed screen cue. Actor-attached text follows the animated head through movement and camera shots. Its x/y are offsets in frame fractions (-1..1) from the head, default (0,-0.12). Screen x/y are frame positions (0..1), default (0.5,0.9). size is 14–72 reference pixels at 720p, scaled by the output’s shorter dimension; default 28. Optional color/background are #RRGGBB; comic defaults are dark text on white, subtitles white on dark. Keep simultaneous subtitles at different y positions or schedule them sequentially. Text overlays do not automatically create audio; define separate speech clips for audible dialogue.
- Sound: optional audio object with speech (up to ${MAX_SPEECH} timed clips), effects, music and muted. New typed dialogue uses source:tts, text (up to 600 characters), voice F1/F2/M1/M2, actor (narrator or an actor id), start and duration seconds (end <=60). Speech can extend the film to its end time. Omitted fields default to narrator, F1, start 0, duration 3, offset 0, speed 1, volume 1, pan 0 and natural effect. Use actor:narrator for an actor whose id is narrator. Actor assignment is organizational; it does not automate lip-sync or spatial audio. Pair with a talk animation and matching subtitle/comic text explicitly.
- Typed dialogue is generated automatically when valid JSON is pasted or opened in Studio LLM Assist. Voices are prepared during review, before Build film, with progress and Stop generation. First use downloads a ~265 MB local English speech model, then inference runs on device. Sound > Generate all speech is the primary manual action for outstanding scripts; Generate this clip handles an individual take. Generated take duration may differ from the requested timing: the user must review, fit/trim the take and adjust text/actions. Native browser device voices offer a quick rate/pitch read-through only; their audio cannot be filtered or exported. Recording and audio upload are also available in Sound.
- Speech effect: natural, robotic (ring modulation), dramatic (warm EQ/reverb), radio, telephone or echo. Effects process audio; dramatic does not generate emotional acting. volume 0..1.5, pan -1..1, speed 0.5..1.5 (changes timing and pitch), offset is a trim offset in the source audio. Preserve existing source/asset for an unchanged take. When changing a generated take's text/voice, remove asset so the user can generate it again. Never invent asset hashes. Only reuse asset IDs from CURRENT FILM: recordings are stored on that device or in an audio project ZIP bundle, not inside JSON. Missing audio must be generated or attached before playback/export; music-only JSON plays immediately.
- Music: track must be one of the exact IDs in MUSIC LIBRARY below, volume 0..1 (default .22), ducking true/false (default true lowers music during speech), fadeIn/fadeOut 0..10 seconds. Music is one recorded track from the library, loaded on demand and played from its beginning; none disables it. Omit start/duration to follow the whole film (default). Optional start (0..59.9) and duration (.1..60, end<=60) place a music window, with fades relative to its edges. An explicit music duration can extend the film; without one, start must precede the film end. Timeline music edges edit this window; disable Custom music timing to follow the whole film again. Muted true exports a silent film. Library duration is the full source-song duration, not the film duration; movies remain at most 60 seconds. The full-song files are FFmpeg-compressed and loudness-matched; the renderer retains at most one 60-second decoded excerpt. No arbitrary audio URLs, soundtrack uploads, music seek offsets, multiple music beds or per-clip audio paths.
- Sound effects: optional audio.effects array, up to ${MAX_SOUND_EFFECTS} independent recorded cues. The library includes weapon shots, an impact, vehicle engines and outdoor ambience. Use sound (an exact SOUND EFFECT LIBRARY ID), optional id/name, start in seconds (0–59.9), duration (0.01–60; end <=60), offset in source seconds, speed 0.5–2 (changes timing and pitch), volume 0–2, and pan -1..1. Defaults: start 0, offset 0, speed 1, volume 1, pan 0; omitted duration uses the recording's remaining duration divided by speed. A shorter window trims the take. Optional loop:true repeats the recording from offset to its end, at speed, until exactly start+duration; use it for sustained engines/ambience. Default loop:false plays once and leaves silence if its cue window is longer than the source. Looping is explicit, not automatic; individual shots/impacts usually stay loop:false. Engine takes last 8 seconds, outdoor ambience 4 seconds, rifle shot 1 second; use the library's exact durations. Do not use boat-engine for canoe/kayak/rowing. Effects may overlap speech, music and each other, and can extend the film. Cue IDs must be unique within effects. Sounds do not trigger automatically from animation or physics.
- Optional effect.actor is an existing actor ID for organization only; omit it for a scene sound. It does not follow an actor acoustically or automate spatial panning. Align start with the visual firing/landing/contact moment yourself. Sounds do not add weapons, projectiles, damage, ragdolls, collisions or animations. Use existing performances and equipment independently. Effects are included in preview, WAV/MP4, project files and reload recovery; they never need speech generation.
- No automatic lip-sync, imported GLBs, paired handshakes/hugs/fights, automatic hand-to-object contact, collisions, prop handover, free prop placement, lighting overrides, custom backgrounds or location changes during a film. Talk is a visual performance; schedule speech separately. Do not invent fields for unsupported features.
- Actor ids must be unique, 1–50 letters/numbers/underscores/hyphens, excluding all and camera. Shot targets must exist. Beat/shot ids are optional and regenerated on import. Keep the JSON under 100 KB. Review the result in Studio and refine after import; staging is not physically solved.

COMPLETE LOCATION CATALOGUE
Use template as a location ID. Staging notes describe the actual floor plan and are guidance, not additional project fields.
${JSON.stringify(SETS.map(s => ({ id: s.id, name: s.name, category: s.category, mood: s.mood, description: s.subtitle,...(s.staging?{staging:s.staging}:{}) })))}

COMPLETE CHARACTER PRESET CATALOGUE
${json(Object.keys(PRESETS))}

CHARACTER CREATION REFERENCE — applies to each actor's params/character, not the outer film object
${characterReference(catalog)}
Use the characterParams and characterSpecification definitions in the film JSON Schema below. Return a complete ara-studio film, not a standalone ara-character response.

EQUIPMENT IDS
${json({ weapons: WEAPONS.map(id => ({ id, name: WEAPON_LABELS[id] })), bags: CARRIED.map(id => ({ id, name: CARRY_LABELS[id] })) })}

SOUND EFFECT LIBRARY
${JSON.stringify(SOUND_EFFECTS.map(s=>({id:s.id,name:s.name,category:s.category,duration:s.duration,description:s.description})))}

SOUND-EFFECT EXAMPLE — merge into the film's audio object, preserving any speech/music:
${json({effects:[{id:'landing',sound:'body-fall-thump',start:2.4,volume:.8,pan:0}]})}
This is a scene sound. To tag it to a character, add actor with that film actor's exact ID. Replace start with the visible contact time; the sound does not create a fall animation.

MUSIC LIBRARY
${JSON.stringify(MUSIC_TRACKS.map(t=>({id:t.id,name:t.name,artist:t.artist,category:t.category,duration:t.duration,description:t.description})))}

COMPLETE ANIMATION CATALOGUE
Each row: {id, name, group, duration (seconds), loop (only when true), travel (local metres per second with move:true; absent = no travel), note (key into ANIMATION NOTES)}.
${animationCatalogue()}

JSON SCHEMA
${JSON.stringify(assistSchema(catalog))}
Additional constraints: actor ids are unique; shot targets must be all or an actor id; each track, speech clip, sound-effect cue and text cue must finish within ${MAX_DURATION}s. Screen text x/y must be 0..1; actor-relative x/y may be -1..1. Text IDs must be unique. Use move:true only for clips whose catalogue travel is non-null. Unknown fields are rejected.

VALID EXAMPLE (replace it with the requested film)
${json(assistExample())}${current ? `\n\nCURRENT FILM — use this as the starting point and preserve details not changed by the brief\n${JSON.stringify(projectForAssist(current),null,2)}` : ''}

Now create the complete importable JSON for the user's brief using only these capabilities.`;
}

/** Headline and facts for the review card. */
/** Compact catalogue: each distinct usage note appears once in ANIMATION NOTES and rows reference it by key. */
function animationCatalogue(){
  const keys=new Map<string,string>(),rows=CLIPS.map(c=>{const note=actionNote(c.id);if(!keys.has(note))keys.set(note,`n${keys.size+1}`);const travel=studioTravel(c.id);
    return {id:c.id,name:c.name,group:animationGroup(c),duration:c.duration,...(c.loop?{loop:true}:{}),...(travel?{travel:Array.from(travel)}:{}),note:keys.get(note)};});
  return `${JSON.stringify(rows)}\n\nANIMATION NOTES\n${JSON.stringify(Object.fromEntries([...keys].map(([note,key])=>[key,note])))}`;
}
export function describeAssistProject(project: StudioProject) {
  const names = project.actors.map(a => decodeCharacter(a.character, a.detail)?.name || a.id);
  const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const speech = project.audio.speech.length,effects=project.audio.effects.length, music = project.audio.music.track !== 'none' && !project.audio.muted;
  const spatial=stagingReport(project);
  return {
    headline: `${project.title || 'Untitled film'} · ${sceneById.get(project.template)!.name}`,
    warnings:spatial.issues.length?[...spatial.issues.slice(0,5).map(i=>`${i.entity}, ${i.start}–${i.end}s: ${i.message}.`),'Estimated reference-size check. Build film, then use Check staging for your actual character and vehicle sizes. Findings do not block movement.']:[],
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
