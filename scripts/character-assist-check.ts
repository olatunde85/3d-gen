/** Character Assist uses installed asset IDs and rejects unsupported instructions before any build. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Catalog } from '../src/core/assets';
import { PRESETS, DEFAULT_PARAMS, ageToYears } from '../src/core/params';
import { characterExample, characterRules, characterSchema, generateCharacterGuide, parseCharacterInput } from '../src/app/character-assist';
import {VEHICLE_CHOICES} from '../src/core/props/vehicles';
import {characterSettings,readCharacterSettings} from '../src/app/character-file';
const cat=JSON.parse(readFileSync(new URL('../public/assets/catalog.json',import.meta.url),'utf8'))as Catalog;
const example=characterExample(),p=parseCharacterInput(JSON.stringify(example),cat);
assert.equal(p.name,'Desert explorer');assert.equal(p.hair,'cornrows');assert.equal(p.carry,'backpack');assert.equal(p.gender,0);assert.equal(p.garmentStyles.tank_top.color,'#436b67');assert.ok(Math.abs(ageToYears(p.age)-34)<1e-8);
assert.deepEqual(parseCharacterInput(JSON.stringify(p),cat),p);assert.deepEqual(parseCharacterInput('```json\n'+JSON.stringify(example)+'\n```',cat),p);
for(const preset of Object.keys(PRESETS)){
 const built=parseCharacterInput(JSON.stringify({kind:'ara-character',version:1,preset}),cat);assert.equal(built.name,preset);
 assert.deepEqual(parseCharacterInput(JSON.stringify(built),cat),built,`Existing ${preset} parameters must remain importable`);
}
const schema=characterSchema(cat),rules=characterRules(cat),guide=generateCharacterGuide(cat,'An explorer with a backpack',p);
for(const key of Object.keys(DEFAULT_PARAMS))assert.ok(rules[key],key);
function uniqueEnums(value:unknown){if(!value||typeof value!=='object')return;const record=value as Record<string,unknown>;if(Array.isArray(record.enum))assert.equal(new Set(record.enum.map(v=>JSON.stringify(v))).size,record.enum.length);for(const child of Object.values(record))uniqueEnums(child);}uniqueEnums(schema);
assert.equal(schema.properties.kind.const,'ara-character');assert.ok(guide.includes('An explorer with a backpack'));assert.ok(guide.includes('CURRENT CHARACTER'));assert.ok(guide.includes(JSON.stringify({kind:'ara-character',version:1,params:p},null,2)));
for(const item of cat.hair)assert.ok(guide.includes('"'+item.id+'"'));for(const group of cat.sliders)for(const slider of group.sliders)assert.ok(guide.includes('"'+slider.id+'"'));
for(const patch of [{height:5},{ageYears:4},{age:.5,ageYears:32},{seed:1.5},{hair:'invented'},{skin:'https://example.com/texture.png'},{outfit:'made-up'},{top:'made-up'},{accessories:['imaginary']},{accessories:['gloves','gloves']},{tattoos:['imaginary']},{modifiers:{'invented/slider':1}},{garmentStyles:{tank_top:{pattern:'invented'}}},{garmentStyles:{tank_top:{color:'red'}}},{garmentStyles:{unknown:{color:'#ffffff'}}},{faceBones:'yes'},{camera:'orbit'}])assert.throws(()=>parseCharacterInput(JSON.stringify({kind:'ara-character',version:1,params:patch}),cat),JSON.stringify(patch));
for(const input of ['{bad','null',JSON.stringify({kind:'ara-studio',version:2}),JSON.stringify({kind:'ara-character',version:1,preset:'toString'}),JSON.stringify({kind:'ara-character',version:1,actors:[]}),JSON.stringify({kind:'ara-character',version:1,params:{__unsupported:true}}),' '.repeat(100001)])assert.throws(()=>parseCharacterInput(input,cat));
console.log(`Character Assist: ${Object.keys(PRESETS).length} preset/params round trips, live catalogues, body ranges, styles, schema and invalid JSON passed (${guide.length} guide characters).`);

for(const vehicle of VEHICLE_CHOICES){const p=parseCharacterInput(JSON.stringify({vehicle,vehicleStyle:{color:'#176a80',accentColor:'#e5ddd0',seatColor:'#393129',finish:'gloss',variant:'sport'}}),cat);assert.equal(p.vehicle,vehicle);assert.equal(p.vehicleStyle.color,'#176a80');assert.deepEqual(parseCharacterInput(JSON.stringify(p),cat),p);}
for(const params of [{vehicle:'helicopter'},{vehicleStyle:{color:'red'}},{vehicleStyle:{finish:'mirror'}},{vehicleStyle:{variant:'racing'}},{vehicleStyle:{wheels:6}},{vehicleStyle:[]}])assert.throws(()=>parseCharacterInput(JSON.stringify(params),cat));
console.log('Vehicle Assist: all choices, strict nested colours/finish/style and parameter round trips passed.');

assert.equal(parseCharacterInput(JSON.stringify({vehicle:'sports_car'}),cat).vehicleStyle.color,'#168c9b');
assert.equal(parseCharacterInput(JSON.stringify({vehicle:'suv',vehicleStyle:{color:'#8a5535'}}),cat).vehicleStyle.color,'#8a5535');
assert.equal(parseCharacterInput(JSON.stringify({vehicle:'suv'}),cat,{...DEFAULT_PARAMS,vehicleStyle:{...DEFAULT_PARAMS.vehicleStyle,color:'#176a80'}}).vehicleStyle.color,'#176a80');

for(const preset of Object.keys(PRESETS)){const p=parseCharacterInput(JSON.stringify({kind:'ara-character',version:1,preset}),cat);assert.deepEqual(readCharacterSettings(characterSettings(p),cat),p);}
console.log('Saved character settings: all presets round-trip with complete editable body, appearance and equipment settings.');
