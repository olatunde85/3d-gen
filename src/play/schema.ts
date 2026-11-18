/**
 * JSON Schema for Ara Play game files (kind "ara-play", version 2). It mirrors the strict parsers in project.ts and the
 * per-part parsers it calls, and takes every ID list from the same constants, so the schema and the importer agree.
 * Rules that span several fields are stated in descriptions; the importer checks them when the game is opened.
 */
import type {Catalog} from '../core/assets';
import {PRESETS} from '../core/params';
import {characterSchema} from '../app/character-assist';
import {MAX_CHAPTERS} from './project';
import {AGGRESSION,MAX_ENEMIES} from './enemies';
import {ENEMY_ROLES} from './enemy-roles';
import {WEAPON_PROFILES} from './weapons';
import {LOCATIONS} from './locations';
import {PLANS} from './mission';
import {STEP_TYPES} from './objectives';
import {TIMES,WEATHER,AMBIENCES} from './environment';
import {CAMERA_VIEWS,MUSIC_TRACKS} from './presentation';
import {DRIVE_VEHICLES} from './driving';
import {SOUND_EFFECTS} from '../studio/audio/effects-catalog';
import {GAME_NAME_MAX,HOW_TO_PLAY_MAX} from './customize';
import {PLAY_MODES,RACE_CARS,RACE_PICKUPS,RUNNER_THEMES,RUNNER_OBSTACLES,RUNNER_POWER_UPS} from './arcade/modes';
import {TRACK_IDS,TRACK_THEMES} from './arcade/track';
import {RUNNER_OBJECT_TYPES,RUNNER_OBJECT_ICONS,MAX_RUNNER_OBJECTS} from './arcade/objects';
import {DEFAULT_RUNNER_MEDALS} from './arcade/medals';

type Schema=Record<string,unknown>;
const text=(maxLength:number,description?:string):Schema=>({type:'string',minLength:1,maxLength,pattern:'\\S',...(description?{description}:{})});
const choice=(values:readonly (string|number)[],description?:string):Schema=>({...(values.every(v=>typeof v==='string')?{type:'string'}:{}),enum:[...new Set(values)],...(description?{description}:{})});
const num=(minimum:number,maximum:number,description?:string):Schema=>({type:'number',minimum,maximum,...(description?{description}:{})});
const int=(minimum:number,maximum:number,description?:string):Schema=>({type:'integer',minimum,maximum,...(description?{description}:{})});
const flag=(description?:string):Schema=>({type:'boolean',...(description?{description}:{})});
const hex=(description?:string):Schema=>({type:'string',pattern:'^#[0-9a-fA-F]{6}$',...(description?{description}:{})});
const id=(description?:string):Schema=>({type:'string',pattern:'^[a-zA-Z0-9_-]{1,50}$',...(description?{description}:{})});
const set=(values:readonly string[],description:string,minItems=0):Schema=>({type:'array',uniqueItems:true,minItems,maxItems:values.length,items:choice(values),description});
const object=(properties:Record<string,Schema>,extra:Schema={}):Schema=>({type:'object',additionalProperties:false,properties,...extra});
const ref=(name:string,description?:string):Schema=>({$ref:`#/$defs/${name}`,...(description?{description}:{})});
const GUNS=Object.keys(WEAPON_PROFILES);

/** The schema for a complete `.ara-play.json` game. */
export function playSchema(catalog:Catalog){
 const builder=characterSchema(catalog),builderDefinition=Object.fromEntries(Object.entries(builder).filter(([key])=>!['$schema','title'].includes(key)));
 const media=(mimes:readonly string[],description:string)=>object({
  id:{type:'string',pattern:'^[a-f0-9]{64}$',description:'SHA-256 of the attached file, as Ara writes it. Never invent one: keep the IDs of files already attached.'},
  name:{type:'string',maxLength:120,description:'The original file name.'},
  mime:choice(mimes),duration:{type:'number',exclusiveMinimum:0,maximum:60.05,description:'Length in seconds, up to 60.'},
 },{required:['id','name','mime','duration'],description});
 const settings={
  story:ref('story'),identity:ref('identity'),mission:ref('mission'),
  enemies:{type:'array',minItems:1,maxItems:MAX_ENEMIES,items:ref('enemy'),description:`The opposing cast: 1 to ${MAX_ENEMIES} enemies with unique IDs. In races they drive the rival cars; in runs one of them chases the runner. At most two may be snipers, and mission.pursuit needs at least one enemy that is not a sniper.`},
  companion:ref('companion'),loadout:ref('loadout'),progression:ref('progression'),vehicle:ref('vehicle'),camera:ref('camera'),music:ref('music'),
  branch:ref('branch'),race:ref('race'),runner:ref('runner'),
  mode:choice(PLAY_MODES,'The rules: "mission" (the default) is a staged mission, "race" an arcade race and "runner" an endless runner.'),
 };
 const $defs:Record<string,Schema>={
  characterParams:{...builder.properties.params,description:'Character appearance parameters, as the character builder saves them.'},
  characterSpecification:{...builderDefinition,properties:{...builder.properties,params:ref('characterParams')},description:'An Ara character file: {"kind": "ara-character", "version": 1, "preset": ..., "params": {...}}.'},
  character:{description:'A character: an exact preset name, an Ara character object (kind "ara-character"), or plain appearance parameters from the character builder. Game characters always use the game rig and carry only a backpack or parachute.',oneOf:[
   choice(Object.keys(PRESETS),'An exact character preset name.'),ref('characterSpecification'),ref('characterParams'),
  ]},
  identity:object({
   title:text(80,'The chapter title shown to players, 1 to 80 characters.'),
   briefing:{type:'string',maxLength:600,description:'Briefing text shown before the chapter starts. Blank uses the automatic objective instructions.'},
   briefingIf:object({flag:id('A story flag set by a branch choice in an earlier chapter.'),text:text(600,'The briefing shown instead when the flag is set.')},{required:['flag','text'],description:'An alternative briefing for players who chose a branch option with this flag in an earlier chapter.'}),
  },{description:'The chapter title and briefing. Both are optional; the title defaults to "The Depot".'}),
  branch:object({
   prompt:text(160,'The question shown when the chapter is won.'),
   options:{type:'array',minItems:2,maxItems:3,items:object({label:text(80,'The choice as players see it.'),next:id('The ID of a later chapter this choice leads to.'),flag:id('A story flag recorded for this choice; later briefingIf settings can read it.')},{required:['label','next','flag']}),description:'Two or three choices, each leading to a different later chapter with a different flag. A flag can be set by only one branch in the game.'},
  },{required:['prompt','options'],description:'A choice offered at the end of this chapter that decides which chapter comes next.'}),
  poses:object({lookAround:flag('Play the hero\'s look-around while a mission or runner briefing is open. Default true.'),dance:flag('Play a dance on a completed mission or a reached runner goal. Default true.')},{description:'Shared hero moments for every chapter.'}),
  theme:object({accent:hex('Buttons, highlights and progress.'),background:hex('Screen background.'),text:hex('Text colour; needs at least 4.5:1 contrast with the background.')},{description:'The game\'s colours, shared by every chapter. Omitted colours use Ara\'s defaults (#f4f4f5 on #09090b).'}),
  enemy:object({
   id:{...id('Unique enemy ID, 1 to 50 letters, digits, underscores or hyphens.'),not:{enum:['player','companion']}},
   aggression:choice(Object.keys(AGGRESSION),'How far the enemy sees, how fast it reacts and how long it searches.'),
   character:ref('character'),
   response:choice(['capture',...GUNS],'What the enemy does on sight: chase to capture, or shoot with a pistol or rifle. Defaults to the role\'s response.'),
   health:choice([50,100,150,200,300],'Defaults to the role\'s health.'),
   kind:choice(Object.keys(ENEMY_ROLES),'Gameplay role. Omitted means a guard. Every role other than guard uses a rifle. Snipers are staged on roofs.'),
  },{required:['id','aggression','character'],allOf:[{if:{required:['kind'],properties:{kind:{not:{const:'guard'}}}},then:{properties:{response:{const:'rifle'}}}}]}),
  companion:object({character:ref('character'),health:choice([50,100,150],'Default 100.')},{required:['character'],description:'The unarmed companion rescued in rescue missions and escorted in escort steps. Race and runner games have none.'}),
  loadout:object({
   weapon:choice(['none',...GUNS],'The hero\'s starting weapon. Must be "none" when progression.weapon is "pickup" or "objective".'),
   health:choice([50,100,150]),ammunition:choice([24,48,96,'unlimited'],'Rounds carried.'),grenades:choice([0,2,5]),
  },{description:'The hero\'s starting equipment. Defaults: unarmed, 100 health, 48 rounds, no grenades.'}),
  mission:object({
   story:choice(['escape','rescue','clear','getaway'],'The goal: escape, rescue the companion and escape, or clear every enemy and extract. "getaway" is escape with pickup extraction and cannot use foot extraction.'),
   extraction:choice(['foot','pickup','helicopter'],'How the hero leaves. Rescue with pickup extraction needs vehicle.model "pickup" (or no model) for the passenger seat.'),
   location:choice(LOCATIONS.map(l=>l.id),'The map. Default depot.'),
   plan:choice(Object.keys(PLANS),'"breakout" (standard), "timed" (against the clock) or "quiet" (leave no trace). "quiet" is not available with story "clear" or pickup extraction.'),
   layout:choice(['balanced','open','dense'],'Cover layout.'),
   variation:int(0,11,'Staging arrangement: three spawn patterns combined with four cover packs.'),
   movement:choice(['agile','grounded'],'"agile" jumps, vaults and climbs automatically.'),
   lives:choice([1,3,5,'unlimited'],'Shared by every chapter: set it on the first mission only. A chapter that sets lives must use the same value.'),
   checkpoints:choice(['off','auto']),
   cargo:choice(['none','briefcase','package'],'An item to secure before extraction.'),
   driveDifficulty:choice(['easy','standard','hard'],'Length of the road out with pickup extraction.'),
   difficulty:choice(['easy','normal','hard'],'Enemy visibility and incoming damage.'),
   parTime:num(15,1800,'Par time in seconds for the Under par medal. Default 180.'),
   stealth:flag('Running footsteps draw investigations and patrols can discover bodies.'),
   overwatch:flag('A hovering helicopter with a spotlight reports the hero\'s position.'),
   pursuit:flag('An enemy pickup, driven by the first enemy that is not a sniper, chases spotted targets.'),
   steps:{type:'array',minItems:1,maxItems:8,items:ref('step'),description:'An ordered objective chain that replaces the story\'s key, rescue or clear goal. "chase" and "convoy" need pickup extraction; "eliminate" and "survive" need a starting firearm or a findable one.'},
   sideQuests:set(['delivery','street-race','bounty'],'Optional paid side jobs. "street-race" needs pickup extraction.'),
   environment:ref('environment'),
  },{description:'Mission rules. Every field is optional. A chapter\'s mission is merged over the first chapter\'s mission. Story "clear" without steps needs a starting firearm (loadout.weapon) or progression.weapon "pickup".'}),
  step:object({
   type:choice(STEP_TYPES,'reach an area, download intel, defend a zone, eliminate a named enemy, survive waves, escort the companion, chase a courier vehicle or escort a convoy.'),
   label:text(80,'Objective text. Defaults to a label for the type.'),
   duration:num(3,180,'Seconds, for download (capped at 15) and defend steps only.'),
   target:{type:'string',pattern:'^[\\w-]{1,50}$',description:'The ID of an enemy in this chapter, for eliminate steps only (required there).'},
   waves:int(1,3,'For survive and defend steps only.'),
  },{required:['type'],allOf:[
   {if:{properties:{type:{const:'eliminate'}}},then:{required:['target']},else:{not:{required:['target']}}},
   {if:{properties:{type:{enum:['download','defend']}}},else:{not:{required:['duration']}}},
   {if:{properties:{type:{enum:['survive','defend']}}},else:{not:{required:['waves']}}},
  ]}),
  environment:object({
   time:choice(TIMES),weather:choice(WEATHER),ambient:choice(AMBIENCES,'Looping ambience; "auto" picks one from the weather and location.'),
   effects:flag('Weather particles and lighting effects.'),flashlight:flag('Gives the hero a flashlight (L).'),volume:num(0,1,'Ambience volume.'),
  },{description:'Time of day, weather and ambience. Races and runs use time and weather for their sky too. Defaults: day, clear, no ambience.'}),
  progression:object({
   weapon:choice(['loadout','pickup','objective'],'"loadout" starts with loadout.weapon; "pickup" places the unlock weapon to find; "objective" unlocks it after the key or rescue. "pickup" and "objective" need loadout.weapon "none".'),
   unlock:choice(GUNS,'The weapon found or unlocked. Default pistol.'),reward:choice(GUNS,'A weapon unlocked on chapter completion and kept for later chapters.'),
   supplies:choice(['scarce','balanced','plentiful'],'2, 4 or 6 health and ammo boxes.'),scoring:choice(['off','objectives','action'],'"action" also scores defeated enemies.'),
  }),
  camera:object({
   allowed:{...set(CAMERA_VIEWS.map(v=>v.id),'The views players can switch between.',1)},
   default:choice(CAMERA_VIEWS.map(v=>v.id),'The starting view; must be one of allowed. Defaults to the first allowed view.'),
   rotate:flag('Players can rotate the camera. Default true.'),zoom:flag('Players can zoom. Default true.'),
  }),
  music:object({track:choice(MUSIC_TRACKS.map(t=>t.id),'A library track ID; "none" for silence.'),volume:num(0,1)}),
  vehicle:object({
   model:choice(DRIVE_VEHICLES.filter(v=>v!=='bus'),'The drivable vehicle for pickup extraction. Default pickup. Missions with a companion to carry need the pickup.'),
   color:hex('Paint colour.'),pace:choice(['relaxed','standard','fast'],'Top speed.'),
  },{description:'The mission\'s drivable vehicle.'}),
  city:object({
   size:choice(['local','district','vast'],'Vast is 300 m wide by 600 m long.'),
   pedestrians:choice([0,2,4]),traffic:choice([0,4,8],'Parked vehicles.'),movingTraffic:choice([0,4,8],'Moving cars on the side streets.'),
   police:flag(),repairShop:flag(),gunShop:flag(),pedestrianFights:flag(),
   pedestrianHostility:choice(['peaceful','retaliate','mixed','hostile']),weaponSwitch:flag(),
   radio:flag('Streams radio while driving; needs internet.'),radioCountry:{type:'string',pattern:'^[A-Z]{2}$',description:'Two-letter country code for radio stations.'},
  },{description:'The city district between chapters, shared by the whole game.'}),
  story:object({
   briefingVoice:flag('Read the briefing aloud.'),
   opening:media(['video/mp4','video/webm'],'A film played before the chapter first starts.'),
   ending:media(['video/mp4','video/webm'],'A film played after the chapter is won.'),
   cues:{type:'array',maxItems:24,items:ref('cue'),description:'Timed text, speech and sounds. Use [] in a chapter to drop inherited cues.'},
  },{required:['cues'],description:'Story films and cues for this chapter.'}),
  cue:object({
   id:{type:'string',pattern:'^[\\w-]{1,50}$',description:'Unique within the story.'},
   trigger:choice(['start','time','step','spotted','overwatch','reinforcements','objective-complete','escape'],'When the cue plays.'),
   at:num(0,1800,'Seconds after the start for "time" cues, or a 1-based objective number (1 to 8) for "step" cues. Only those triggers use it, and both need it.'),
   text:{type:'string',maxLength:500},duration:num(1,30,'Seconds on screen.'),
   speaker:{type:'string',description:'"radio", "player", "companion" or the ID of an enemy in this chapter.'},
   style:choice(['subtitle','caption','speech','thought'],'Speech and thought bubbles need a character speaker, not "radio".'),
   voice:flag('Speak the text.'),voiceId:{type:'string',pattern:'^(F1|F2|M1|M2|gemini/[A-Za-z]{2,40}|elevenlabs/[A-Za-z0-9]{8,64})$',description:'F1 and F2 are female voices, M1 and M2 male (Ara voices, free). gemini/<voice> and elevenlabs/<voice id> are spoken with the player\'s own key.'},
   audio:media(['audio/wav'],'Recorded or generated speech for this cue.'),
   sound:choice(SOUND_EFFECTS.map(s=>s.id),'A library sound effect.'),
  },{required:['id','trigger','text','duration','speaker','style','voice'],allOf:[
   {if:{properties:{trigger:{enum:['time','step']}}},then:{required:['at']},else:{not:{required:['at']}}},
   {if:{properties:{trigger:{const:'step'}}},then:{properties:{at:{type:'integer',minimum:1,maximum:8}}}},
   {if:{properties:{style:{enum:['speech','thought']}}},then:{properties:{speaker:{not:{const:'radio'}}}}},
  ]}),
  race:object({
   track:{oneOf:[choice(TRACK_IDS,'A built-in circuit.'),ref('customTrack')]},
   laps:int(1,9,'Default 3.'),opponents:int(3,7,'AI racers. Default 5.'),
   aiSkill:choice(['easy','medium','hard','expert']),rubberBand:flag('Keeps the pack close. Default true.'),
   handling:choice(['grip','drift'],'Default drift.'),nitro:flag('Default true.'),
   pickups:set(RACE_PICKUPS,'Track pickups. Default ["boost-pad"].'),ghost:flag('Record and replay the best lap. Default true.'),
   car:ref('raceCar'),medals:flag('false turns off podium medals.'),
   traction:choice(['normal','icy'],'Road grip. Omitted uses the circuit\'s own ground (snow is icy).'),
  },{description:'Race settings, used with mode "race". Every field is optional.'}),
  raceCar:object({model:choice(RACE_CARS,'Default sports_car.'),color:hex('Default #c8372d.')},{description:'The player\'s car.'}),
  customTrack:object({
   name:text(60),theme:choice(TRACK_THEMES,'Scenery around the circuit.'),width:num(10,24,'Road width in metres. Default 15.'),
   points:{type:'array',minItems:6,maxItems:64,items:{type:'array',minItems:2,maxItems:2,items:num(-2000,2000),description:'[x, z] in metres.'},description:'Control points in driving order. The closed loop must be 400 to 6000 m long and must not cross or touch itself.'},
  },{required:['points'],description:'A custom circuit.'}),
  runner:object({
   theme:choice(RUNNER_THEMES,'The course scenery.'),lanes:{const:3},
   startSpeed:num(6,20,'Metres per second. Default 10.'),maxSpeed:num(6,40,'Metres per second, at least startSpeed. Default 26.'),
   speedRamp:choice(['gentle','steady','steep']),
   obstacles:set(RUNNER_OBSTACLES,'Obstacle types on the course. "gunman" puts an armed enemy in the lanes.',1),
   powerUps:set(RUNNER_POWER_UPS,'Power-ups on the course.'),
   chaser:{type:'string',description:'The ID of the enemy chasing the runner, or "none". Defaults to the first enemy.'},
   goal:ref('runnerGoal'),revive:flag('Continue for coins. Default true.'),
   seed:int(0,2_147_483_647,'Gives the same course every run.'),
   objects:{type:'array',maxItems:MAX_RUNNER_OBJECTS,items:ref('runnerObject'),description:'Objects to find along the course, one at a time in list order.'},
   medals:{oneOf:[{const:false},ref('runnerMedals')],description:'Score targets for medals, or false for none.'},
   gunman:{type:'string',description:'The ID of the enemy that stands armed in the lanes with the "gunman" obstacle.'},
   weapon:choice(GUNS,'The runner\'s gun against armed enemies. Defaults to the loadout gun, or a pistol.'),
  },{description:'Endless runner settings, used with mode "runner". Every field is optional.'}),
  runnerGoal:object({type:choice(['endless','distance','coins','score','objects']),target:{type:'integer',description:'Distance 100 to 100000 m, coins 10 to 100000, or score 100 to 1000000. Endless and objects goals have no target.'}},{required:['type'],description:'"objects" completes the run when every object in runner.objects is found, and needs at least one object.',oneOf:[
   {properties:{type:{enum:['endless','objects']}},not:{required:['target']}},
   {properties:{type:{const:'distance'},target:{minimum:100,maximum:100_000}},required:['target']},
   {properties:{type:{const:'coins'},target:{minimum:10,maximum:100_000}},required:['target']},
   {properties:{type:{const:'score'},target:{minimum:100,maximum:1_000_000}},required:['target']},
  ]}),
  runnerObject:object({
   type:choice(RUNNER_OBJECT_TYPES,'The object\'s 3D model.'),name:text(40,'Defaults to the type\'s name.'),
   icon:choice(RUNNER_OBJECT_ICONS,'HUD icon. Defaults to the type.'),count:int(1,10,'Pieces to collect. Default 1.'),
   clue:{type:'string',maxLength:160,description:'Text revealed when the object is found.'},
  },{required:['type']}),
  runnerMedals:object({bronze:int(1,1_000_000),silver:int(1,1_000_000),gold:int(1,1_000_000)},{description:`Whole score targets, each higher than the one before. Defaults ${DEFAULT_RUNNER_MEDALS.bronze}, ${DEFAULT_RUNNER_MEDALS.silver} and ${DEFAULT_RUNNER_MEDALS.gold}.`}),
  chapter:object({id:{...id('Unique chapter ID; "chapter-1" is the first mission.'),not:{const:'chapter-1'}},...settings},{required:['id'],description:'A further chapter. It plays the hero, city, theme and poses of the first chapter, and inherits every setting it omits from the first chapter (race or runner settings only within the same mode). Its mission is merged over the first mission.'}),
 };
 return {
  $schema:'https://json-schema.org/draft/2020-12/schema',title:'Ara Play game',
  description:'An Ara Play game. The top-level settings are the first chapter; chapters add more. Ara Play also opens version 1 files, an older format with a single "enemy".',
  type:'object',additionalProperties:false,required:['kind','version','template','character','enemies'],
  properties:{
   $schema:{type:'string',description:'The schema this file follows, so editors can check and autocomplete it: https://ara3dgen.com/schemas/play-game.v2.json. Ara Play ignores it.'},kind:{const:'ara-play'},version:{const:2},template:{const:'escape-depot',description:'A fixed identifier; mission.location chooses the map.'},
   character:ref('character','The hero, shared by every chapter.'),
   ...settings,
   city:ref('city'),poses:ref('poses'),theme:ref('theme'),
   gameName:text(GAME_NAME_MAX,'The game\'s name in the title bar, browser tab and published address. Defaults to the first chapter\'s title.'),
   howToPlay:text(HOW_TO_PLAY_MAX,'Replaces the built-in How to play guide. Separate paragraphs with blank lines.'),
   difficulty:choice(['standard','relaxed'],'Read only from older files; set enemies[].aggression instead.'),
   chapters:{type:'array',minItems:1,maxItems:MAX_CHAPTERS-1,items:ref('chapter'),description:`Up to ${MAX_CHAPTERS-1} further chapters, with unique IDs.`},
  },
  allOf:[
   {if:{required:['race']},then:{required:['mode'],properties:{mode:{const:'race'}}}},
   {if:{required:['runner']},then:{required:['mode'],properties:{mode:{const:'runner'}}}},
  ],
  $defs,
 };
}
