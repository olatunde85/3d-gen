/** Character-only LLM contract. IDs and ranges come from the installed builder catalogues. */
import type { Catalog } from '../core/assets';
import { DEFAULT_PARAMS, PRESETS, DETAILS, sanitizeParams, yearsToAge, type HumanParams } from '../core/params';
import { GARMENTS, OUTFIT_SETS, PATTERNS } from '../core/garments';
import { HAIRSTYLES, FACIAL_HAIR, EARRINGS, TATTOOS } from '../core/looks';
import { EXPRESSIONS } from '../core/face';
import { WEAPONS } from '../core/props/weapons';
import { CARRIED, CARRY_STYLES } from '../core/props/carry';
import {VEHICLE_CHOICES,VEHICLE_FOR_CLIP,VEHICLE_FINISHES,VEHICLE_VARIANTS,vehicleStyleForChoice,type VehicleChoice} from '../core/props/vehicles';
const vehicleStyleRules={color:{type:'string',pattern:'^#[a-fA-F0-9]{6}$'},accentColor:{type:'string',pattern:'^#[a-fA-F0-9]{6}$'},seatColor:{type:'string',pattern:'^#[a-fA-F0-9]{6}$'},finish:{type:'string',enum:VEHICLE_FINISHES},variant:{type:'string',enum:VEHICLE_VARIANTS}};
type Rule = {type:string;enum?:readonly string[];minimum?:number;maximum?:number;maxLength?:number;pattern?:string;description?:string;default?:unknown};
const numeric=(minimum:number,maximum:number):Rule=>({type:'number',minimum,maximum});
const enumeration=(values:readonly string[]):Rule=>({type:'string',enum:[...new Set(values)]});
export function characterRules(cat:Catalog){
  const rules:Record<string,Rule>={};
  for(const [key,value]of Object.entries(DEFAULT_PARAMS))rules[key]=typeof value==='number'?numeric(0,1):typeof value==='boolean'?{type:'boolean'}:typeof value==='string'?{type:'string',maxLength:80}:{type:'object'};
  rules.seed={type:'integer',minimum:0,maximum:1e9};rules.age=numeric(yearsToAge(12),1);rules.ageYears={...numeric(12,90),description:'Human years; use instead of normalized age, never both.'};
  for(const key of ['skinTint','hairTint','hairColor','outfitTint','beardColor','tattooInk'])rules[key]={type:'string',pattern:'^#[a-fA-F0-9]{6}$'};
  const items=(key:'skins'|'eyes'|'eyebrows'|'eyelashes'|'hair'|'outfits'|'shoes'|'hats'|'teeth')=>cat[key].map(i=>i.id);
  const garments=(slot:string)=>GARMENTS.filter(g=>g.slot===slot).map(g=>g.id);
  Object.assign(rules,{
    skin:enumeration(['auto',...items('skins')]),eyes:enumeration(items('eyes')),eyebrows:enumeration(['none',...items('eyebrows')]),eyelashes:enumeration(['none',...items('eyelashes')]),
    hair:enumeration(['none',...items('hair'),...HAIRSTYLES.map(h=>h.id)]),outfit:enumeration(['none',...items('outfits'),...OUTFIT_SETS.map(s=>s.id)]),
    top:enumeration(['none',...garments('top')]),jacket:enumeration(['none',...garments('jacket')]),bottom:enumeration(['none',...garments('bottom')]),
    shoes:enumeration(['none','sandals','combat_boots','flipflops',...items('shoes'),...garments('feet')]),hat:enumeration(['none',...items('hats'),...garments('hat')]),
    detail:enumeration(DETAILS),rig:enumeration(['none','game','game_lite','full']),restPose:enumeration(['A','T']),weapon:enumeration(WEAPONS),carry:enumeration(CARRIED),
    vehicle:enumeration(VEHICLE_CHOICES),expression:enumeration(EXPRESSIONS),facialHair:enumeration(FACIAL_HAIR),earrings:enumeration(EARRINGS),earringMetal:enumeration(['gold','silver']),teeth:enumeration(['none',...items('teeth')]),
    accessories:{type:'array'},tattoos:{type:'array'},modifiers:{type:'object'},garmentStyles:{type:'object'},
  });
  return rules;
}
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
function check(value:unknown,rule:Rule,path:string){
  if(rule.type==='number'||rule.type==='integer'){
    if(typeof value!=='number'||!Number.isFinite(value)||rule.type==='integer'&&!Number.isInteger(value)||value<(rule.minimum??-Infinity)||value>(rule.maximum??Infinity))throw Error(`${path}: use ${rule.type==='integer'?'an integer':'a number'} from ${rule.minimum} to ${rule.maximum}.`);
  }else if(rule.type==='string'){
    if(typeof value!=='string'||rule.maxLength!==undefined&&value.length>rule.maxLength||rule.enum&&!rule.enum.includes(value)||rule.pattern&&!new RegExp(rule.pattern).test(value))throw Error(`${path}: use ${rule.enum?'an exact ID from the guide':rule.pattern?'a #RRGGBB colour':'a string of up to 80 characters'}.`);
  }else if(rule.type==='boolean'){if(typeof value!=='boolean')throw Error(`${path}: use true or false.`);}
  else if(rule.type==='array'){if(!Array.isArray(value))throw Error(`${path}: use an array.`);}
  else if(!object(value))throw Error(`${path}: use an object.`);
}
function modifierRanges(cat:Catalog){
  const mods=new Map(cat.sliders.flatMap(g=>g.sliders.map(s=>[s.id,{label:s.label,minimum:s.bipolar?-1:0,maximum:1}]as const)));
  for(const preset of Object.values(PRESETS))for(const key of Object.keys(preset.modifiers??{}))if(!mods.has(key))mods.set(key,{label:key,minimum:-1,maximum:1});
  return mods;
}
export function parseCharacterInput(source:string,cat:Catalog,initial:HumanParams=DEFAULT_PARAMS):HumanParams{
  if(source.length>100_000)throw Error('Use character JSON smaller than 100 KB.');
  let raw:unknown;try{raw=JSON.parse(source.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i,'$1'));}catch{throw Error('Paste a complete JSON object, without surrounding explanation.');}
  if(!object(raw))throw Error('Use an Ara character JSON object.');
  let patch:Record<string,unknown>,base=structuredClone(initial);
  if('kind'in raw){
    if(raw.kind!=='ara-character'||raw.version!==1)throw Error('Use ara-character version 1. Studio film JSON belongs in Ara Studio.');
    for(const key of Object.keys(raw))if(!['kind','version','preset','params'].includes(key))throw Error(`Unsupported character field: ${key}.`);
    if('preset'in raw){if(typeof raw.preset!=='string'||!Object.hasOwn(PRESETS,raw.preset))throw Error('Choose an exact character preset from the guide.');base={...base,...structuredClone(PRESETS[raw.preset]),name:raw.preset};}
    if(raw.params===undefined&&!('preset'in raw))throw Error('Provide a preset or params.');
    if(raw.params!==undefined&&!object(raw.params))throw Error('params must be an object.');patch=(raw.params??{})as Record<string,unknown>;
  }else patch=raw; // Also accepts the builder's existing .params.json exports.
  const rules=characterRules(cat);
  for(const [key,value]of Object.entries(patch)){if(!Object.hasOwn(rules,key))throw Error(`Unknown character parameter: ${key}.`);check(value,rules[key],key);}
  if('age'in patch&&'ageYears'in patch)throw Error('Use either ageYears or age, not both.');
  for(const [key,allowed,max]of [['accessories',GARMENTS.filter(g=>g.slot==='acc').map(g=>g.id),40],['tattoos',TATTOOS,20]]as const)if(key in patch){const array=patch[key]as unknown[];if(array.length>max||new Set(array).size!==array.length||array.some(v=>typeof v!=='string'||!(allowed as readonly string[]).includes(v)))throw Error(`${key}: use available IDs from the guide.`);}
  if(object(patch.modifiers)){const ranges=modifierRanges(cat);if(Object.keys(patch.modifiers).length>400)throw Error('Use at most 400 detail sliders.');for(const [key,value]of Object.entries(patch.modifiers)){const range=ranges.get(key);if(!range)throw Error(`Unknown detail slider: ${key}.`);check(value,numeric(range.minimum,1),`modifiers.${key}`);}}
  if(object(patch.vehicleStyle))for(const [key,value]of Object.entries(patch.vehicleStyle)){if(!Object.hasOwn(vehicleStyleRules,key))throw Error(`Unsupported vehicle style: ${key}.`);check(value,vehicleStyleRules[key as keyof typeof vehicleStyleRules],`vehicleStyle.${key}`);}
  if(object(patch.garmentStyles)){
    const defs=new Map<string,{patterns?:readonly string[]}>([...GARMENTS,...OUTFIT_SETS].map(g=>[g.id,g]));for(const [id,def]of Object.entries(CARRY_STYLES))defs.set(id,def);
    for(const preset of Object.values(PRESETS))for(const id of Object.keys(preset.garmentStyles??{}))if(!defs.has(id))defs.set(id,{patterns:PATTERNS});
    if(Object.keys(patch.garmentStyles).length>60)throw Error('Use at most 60 garment style overrides.');
    for(const [id,style]of Object.entries(patch.garmentStyles)){
      const def=defs.get(id);if(!def||!object(style))throw Error(`Unknown garment style: ${id}.`);
      for(const [key,value]of Object.entries(style)){if(!['pattern','color','color2'].includes(key))throw Error(`Unsupported style field: ${key}.`);check(value,key==='pattern'?enumeration(def.patterns??PATTERNS):{type:'string',pattern:'^#[a-fA-F0-9]{6}$'},`garmentStyles.${id}.${key}`);}
    }
  }
  const result={...base,...patch,...('ageYears'in patch?{age:yearsToAge(patch.ageYears as number)}:{})};delete (result as Record<string,unknown>).ageYears;
  if('vehicle'in patch&&!('vehicleStyle'in patch))result.vehicleStyle=vehicleStyleForChoice(patch.vehicle as VehicleChoice,base.vehicleStyle);
  return sanitizeParams(result);
}
export function characterExample(){return{kind:'ara-character',version:1,preset:'The Adventurer',params:{name:'Desert explorer',ageYears:34,hair:'cornrows',carry:'backpack',weapon:'none',expression:'determined',garmentStyles:{tank_top:{pattern:'solid',color:'#436b67'},cargo_shorts:{pattern:'khaki',color:'#9c875f'}}}};}
export function characterSchema(cat:Catalog){
  const properties:Record<string,unknown>={...characterRules(cat)};
  properties.vehicleStyle={type:'object',additionalProperties:false,properties:vehicleStyleRules};
  properties.accessories={type:'array',maxItems:40,uniqueItems:true,items:enumeration(GARMENTS.filter(g=>g.slot==='acc').map(g=>g.id))};
  properties.tattoos={type:'array',maxItems:20,uniqueItems:true,items:enumeration(TATTOOS)};
  properties.modifiers={type:'object',additionalProperties:false,maxProperties:400,properties:Object.fromEntries([...modifierRanges(cat)].map(([id,range])=>[id,{type:'number',minimum:range.minimum,maximum:range.maximum,description:range.label}]))};
  properties.garmentStyles={type:'object',maxProperties:60,propertyNames:{enum:[...new Set([...GARMENTS.map(g=>g.id),...OUTFIT_SETS.map(s=>s.id),...Object.keys(CARRY_STYLES),...Object.values(PRESETS).flatMap(p=>Object.keys(p.garmentStyles??{}))])]},additionalProperties:{type:'object',additionalProperties:false,properties:{pattern:enumeration(PATTERNS),color:{type:'string',pattern:'^#[a-fA-F0-9]{6}$'},color2:{type:'string',pattern:'^#[a-fA-F0-9]{6}$'}}}};
  return{$schema:'https://json-schema.org/draft/2020-12/schema',title:'Ara character input',type:'object',additionalProperties:false,required:['kind','version'],anyOf:[{required:['preset']},{required:['params']}],properties:{kind:{const:'ara-character'},version:{const:1},preset:enumeration(Object.keys(PRESETS)),params:{type:'object',additionalProperties:false,properties,not:{required:['age','ageYears']}}}};
}
/** Shared appearance instructions and live assets, without an LLM task or output schema. */
export function characterReference(cat:Catalog):string{
  const json=(value:unknown)=>JSON.stringify(value);
  return `CAPABILITIES
All body controls are normalized 0..1: gender 0 female / 1 male; muscle, weight, height, proportions, breastSize and breastFirmness. Height is a body proportion, not centimetres. Use ageYears 12..90 for age in years, OR normalized age (never both); age 0.5 is 25 years. african/asian/caucasian are blended ancestry weights; use values summing to 1. seed is an integer 0..1e9. Facial and body detail sliders use exact modifiers IDs below, range -1..1 if bipolar, otherwise 0..1.
Choose skin/eye/brow/lash/hair assets, procedural hair and facial hair, tattoos, earrings, expressions, teeth and tongue. Hex colours multiply textures: skinTint/hairTint/outfitTint darken their source; procedural hair uses hairColor. You cannot lighten a dark texture with a tint. Existing age-dependent clothing and tattoo rules still apply (tattoos and removing underwear are adult-only).
Clothing: choose an outfit ID or outfit set; choose outfit none to combine top, jacket, bottom, underwear and accessories. Outfit sets supply their own top/bottom/jacket; standalone jacket applies with separate pieces or a mesh outfit. Garment styles use garment/set/bag IDs and only the patterns offered for that item, with optional color/color2 #RRGGBB overrides. Omit maps to keep preset styling; if you supply a map include all desired overrides. Shoes and hat are independent. Colour/pattern overrides affect procedural pieces, sets and bags. Legacy mesh-style metadata from presets is retained, but does not recolour imported textures; use outfitTint for imported clothing. weapon/carry equip fitted props; vehicle accepts none, auto (match animation), bicycle, car (classic convertible), sports_car (enclosed modern coupe), suv, motorcycle, horse, canoe, kayak, rowboat, motorboat, helicopter (chopper), pickup, tank or jet. vehicleStyle uses color (body/coat), accentColor (trim/mane), seatColor (upholstery/tack), finish (matte/satin/gloss) and variant (classic/sport). Use a rig for fitting. The vehicle appears only during its matching riding/driving animation and is exported as a separate fitted prop; animated GLB/FBX exports include its wheels/controls/paddles/tack. Static exports keep the rider in the bind pose; apply the matching rider clip to seat them. Vehicle colours and style preserve all rider contact points. The coupe uses a rounded two-door cabin, solid rear pillars, split grille, sculpted bodywork and alloy wheels. The SUV uses an upright five-door cabin, separate rectangular windows, round LED headlights, flared arches, running boards and a rear spare wheel. The coupe factory appearance is teal gloss with sport trim; the upright SUV factory is red gloss with dark trim; specify vehicleStyle for other colours. Boarding/alighting use explicit matching actions; there is no automatic driving navigation. The character builder does not coordinate multiple occupants; Studio shares vehicles with its own vehicleId/vehicleSeat film fields. Equipped pistol, rifle, sword or knife enable mounted wielding on riding/driving clips, preserving the seat and gait. The left hand keeps the wheel, bar, reins or helicopter collective; paddle strokes pause while armed. Entry/exit hide the weapon to free both hands. Builder previews and character exports use the default wield pose. Studio can additionally aim, fire guns or hide the weapon per action with its film fields; do not put weaponPose/weaponYaw/weaponPitch into character params. Matching clips: ${json(VEHICLE_FOR_CLIP)}. sports_car and suv also support drive_car and sit_passenger. The motorboat has two aft passenger seats. The helicopter has a rounded four-seat cabin, landing skids, working doors and animated main/tail rotors. Use fly_helicopter for the pilot pose, board_helicopter/alight_helicopter for fitted entry/exit. Studio additionally supports shared passengers and flight height; those film controls are not character params. Pickup adds a two-seat enclosed cabin and open load bed; tank has an enclosed hull, a roof hatch the driver climbs through and animated tracked running gear; jet has a rounded single-seat cockpit, hinged canopy (boarded from the pilot's right), swept wings and retractable gear, with taxi_jet, takeoff_jet, land_jet and bailout_jet clips (they play their own runway and flight motion in the builder and exports); the helicopter has bailout_helicopter; the tank has a shielded roof machine gun used by gun_tank. Bail-outs suit carry:parachute. Each supports matching board/alight and drive/fly clips. tumble_MODEL actions perform controlled full vehicle/rider stunt rolls and return upright. These are authored animations, not crash physics. Parachute is a carry prop with pack, harness, striped canopy and suspension lines. Choose carry:parachute, then skydive/parachute_deploy/parachute_glide/parachute_land; only the prop joints scale to open the canopy. Studio adds altitude/descent controls through film beats; do not put flightHeight into character params. Grenade is an equipped weapon prop for throw_grenade: it releases at 0.82s and follows an animated arc. No explosion simulation. Do not use scene, timeline, subtitle or camera fields here.
Carry parcel adds a cardboard box with packing tape and a shipping label. Use a rig (game/game_lite/full) and weapon none. It is held with two hands during ordinary walk, run, backwards/slouch/model walk, strafes, turns, idle, talk and laugh, as well as the dedicated pickup/carry/put-down performances. The original gait and speed are preserved. Other performances keep their original arm poses. The parcel mesh and its animation bone are included in exports. parcel styles accept solid with color (cardboard) and color2 (tape).
Output settings: detail low/medium/high; rig none/game/game_lite/full; restPose A/T; faceBones, animations, faceShapes and speechShapes booleans. These configure character construction/export capabilities, not a movie or file download. Exports are chosen manually in the builder. Supported parameters are all listed in the schema; unknown keys or invalid asset IDs are rejected before building. No image-to-avatar, custom meshes, arbitrary clothing, external URLs, sounds or scene generation.

DEFAULT CHARACTER PARAMETERS
${json(DEFAULT_PARAMS)}

PRESETS AND THEIR SETTINGS
${json(PRESETS)}

INSTALLED ASSET CATALOGUE
${json(Object.fromEntries((['skins','eyes','eyebrows','eyelashes','hair','outfits','shoes','hats','teeth']as const).map(key=>[key,cat[key].map(i=>({id:i.id,name:i.name,tags:i.tags}))])))}

PROCEDURAL HAIR
${json(HAIRSTYLES)}

GARMENTS AND ALLOWED PATTERNS
${json(GARMENTS.map(g=>({id:g.id,name:g.label,slot:g.slot,patterns:g.patterns,color:g.color,color2:g.color2})))}

OUTFIT SETS
${json(OUTFIT_SETS)}

BAG FINISHES
${json(CARRY_STYLES)}`;
}
export function generateCharacterGuide(cat:Catalog,brief='',current?:HumanParams){
  const json=(value:unknown)=>JSON.stringify(value,null,2);
  return `ARA 3D GEN — CHARACTER LLM ASSIST (version 1)
Create ONE character, not a Studio film. Return only a complete JSON object using kind ara-character and version 1. Choose an optional preset as the base, then override its settings with params. Omitted fields keep the preset values or the listed defaults; arrays and maps replace their base values when supplied. The user will paste or open this JSON in Ara 3D Gen. Do not invent asset IDs, sliders, fields or new geometry. If a request exceeds the available builder, explain and suggest a supported alternative before returning JSON.

USER'S BRIEF
${brief.trim()||'[Describe the character you want here.]'}

${characterReference(cat)}

JSON SCHEMA (also lists equipment, expressions, facial hair, tattoos, earrings and every detail slider)
${json(characterSchema(cat))}

VALID EXAMPLE
${json(characterExample())}${current?`\n\nCURRENT CHARACTER — use as the starting point for this revision; return complete params to preserve unspecified settings\n${json({kind:'ara-character',version:1,params:current})}`:''}

Generate the character JSON for the user's brief, using only these capabilities.`;
}

