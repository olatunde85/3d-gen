/** Focused regression for the eighteen new character presets and the dispatch motorcycle. */
import assert from 'node:assert/strict';
import { nodeLibrary } from './node-assets';
import { buildHuman } from '../src/core/human';
import { DEFAULT_PARAMS, PRESETS } from '../src/core/params';
import { garmentById } from '../src/core/garments/catalog';
import { OUTFIT_SETS } from '../src/core/garments/sets';
import { CARRY_STYLES } from '../src/core/props/carry';
import { sanitizeVehicleStyle } from '../src/core/props/vehicles';
import { parseCharacterInput } from '../src/app/character-assist';
import { Animator } from '../src/core/anim/evaluate';
import { clipById } from '../src/core/anim/clips';
import { Vehicle } from '../src/core/props/vehicle';
import { DEFAULT_EXPORT, planExport, runExport } from '../src/export';
import { unzipSync } from 'fflate';

const checks: Record<string, string[]> = {
  'The Resort Guest': ['Short-sleeve resort shirt', 'Resort shirt source collar', 'Resort shirt collar facing', 'Resort shirt short loose sleeves', 'Resort shirt open sleeve hems', 'Loose shorts fabric', 'Loose shorts elastic waistband'],
  'The Lifeguard': ['Singlet rib-knit cotton', 'Singlet sewn bindings', 'Loose shorts fabric', 'Loose shorts elastic waistband', 'Loose shorts white drawstring'],
  'The Paramedic': ['Short-sleeve resort shirt', 'Resort shirt continuous hem', 'Resort shirt short loose sleeves', 'Resort shirt source collar', 'Epaulettes', 'Suit trousers', 'Medical cross'],
  'The Flight Attendant': ['Neck scarf silk', 'Neck scarf knot and ends', 'Fitted uniform shirt', 'Fitted mini skirt', 'Fitted mini skirt waistband', 'Fitted mini skirt hem', 'Heels'],
  'The Nurse': ['Scrub top', 'Scrub top lower pockets', 'Suit trousers', 'Stethoscope tubing', 'Stethoscope metal'],
  'The Airline Pilot': ['Fitted uniform shirt', 'Suit trousers'],
  'The Road Worker': ['Hard hat', 'Hard hat ridge', 'Reflective vest', 'Reflective tape', 'Reflective vest binding'],
  'The Getaway Driver': ['Knitted balaclava', 'Open racing jacket', 'Racing jacket red panels'],
  'The Security Guard': ['Fitted uniform shirt', 'Police badge', 'Utility belt'],
  'The Motorcycle Cop': ['Fitted uniform shirt', 'Open-face motorcycle helmet shell', 'Police badge'],
  'The Army Medic': ['Fatigue shirt', 'Medical cross'],
  'The Dispatch Rider': ['Techwear jacket', 'Open-face motorcycle helmet shell', 'Open-face helmet transparent visor', 'Open-face helmet chin strap', 'Sport gloves fingerless leather'],
  'The Street Racer': ['Racer casual shirt', 'Racer shirt underarm lining', 'Cargo pants', 'Open racing jacket', 'Racing jacket red panels', 'Racing jacket edge piping', 'Open-face motorcycle helmet shell', 'Sport gloves fingerless leather'],
  'The Police Officer (USA)': ['Fitted uniform shirt', 'Fitted uniform loose short sleeves', 'Uniform chest pockets', 'Uniform pocket flaps', 'Epaulettes', 'Police badge', 'Police nameplate', 'Utility belt', 'Suit trousers'],
  'The MMA Fighter': ['Singlet rib-knit cotton', 'Loose shorts', 'Sport gloves fingerless leather', 'Sport gloves padded knuckles', 'Sport gloves wrist straps'],
  'The Mob Boss': ['Fatigue shirt', 'Open leather coat', 'Full shearling collar and lapels', 'Raised shearling collar'],
  'The Clown': ['Clown nose', 'Short-sleeve resort shirt'],
  'The Masked Robber': ['Knitted balaclava', 'Techwear jacket'],
};

assert.equal(Object.keys(PRESETS).length, 50);
assert.equal(garmentById.get('tropical_short_shirt')?.fromOutfit, 'male_casualsuit03');
assert.equal(garmentById.get('uniform_camp_shirt')?.fromOutfit, 'male_casualsuit01');
assert.equal(PRESETS['The Paramedic'].top, 'tropical_short_shirt');
assert.equal(PRESETS['The Paramedic'].bottom, 'suit_trousers');
assert.ok(PRESETS['The Paramedic'].accessories?.includes('epaulette_accent'));
assert.equal(PRESETS['The Paramedic'].garmentStyles?.tropical_short_shirt?.pattern, 'solid');
assert.equal(PRESETS['The Police Officer (USA)'].top, 'uniform_camp_shirt');
assert.equal(PRESETS['The Police Officer (USA)'].bottom, 'suit_trousers');
assert.equal(PRESETS['The Flight Attendant'].top, 'uniform_camp_shirt');
assert.equal(PRESETS['The Flight Attendant'].bottom, 'fitted_mini_skirt');
assert.equal(PRESETS['The Flight Attendant'].hair, 'ponytail01');
assert.equal(PRESETS['The Flight Attendant'].shoes, 'heels');
assert.equal(PRESETS['The Police Officer (USA)'].shoes, 'shoes03');
assert.deepEqual(PRESETS['The MMA Fighter'].accessories, ['sport_gloves']);
assert.equal(PRESETS['The Street Racer'].top, 'racer_casual_shirt');
assert.equal(PRESETS['The Street Racer'].bottom, 'cargo_pants');
assert.equal(PRESETS['The Street Racer'].garmentStyles?.cargo_pants?.color, '#292b30');
assert.equal(garmentById.get('racer_casual_shirt')?.preserveUnderJacket, true);
assert.equal(garmentById.get('racer_casual_shirt')?.fromOutfit, 'female_casualsuit01');
assert.ok(PRESETS['The Street Racer'].accessories?.includes('open_face_helmet'));
assert.ok(PRESETS['The Street Racer'].accessories?.includes('sport_gloves'));
const lib = await nodeLibrary();
const racerSource = lib.catalog.outfits.find(item => item.id === 'female_sportsuit01');
const racerVariant = lib.catalog.outfits.find(item => item.id === 'female_sportsuit01_racer');
assert.equal(racerVariant?.file, racerSource?.file, 'Racer colourway must reuse the fitted sportsuit mesh');
assert.notEqual(racerVariant?.material?.diffuse, racerSource?.material?.diffuse,
  'Racer colourway must have its own red-striped texture');
const wardrobe = new Map<string, readonly string[] | undefined>();
for (const [id, garment] of garmentById) wardrobe.set(id, garment.patterns);
for (const set of OUTFIT_SETS) wardrobe.set(set.id, set.patterns);
for (const [id, carry] of Object.entries(CARRY_STYLES)) wardrobe.set(id, carry.patterns);
for (const [name, expected] of Object.entries(checks)) {
  const patch = PRESETS[name];
  assert.ok(patch, `${name}: missing preset`);
  for (const id of [patch.top, patch.jacket, patch.bottom, ...(patch.accessories ?? [])])
    if (id && id !== 'none') assert.ok(garmentById.has(id), `${name}: unknown garment ${id}`);
  for (const [id, style] of Object.entries(patch.garmentStyles ?? {})) {
    assert.ok(wardrobe.has(id), `${name}: unknown style target ${id}`);
    const patterns = wardrobe.get(id);
    if (style.pattern && patterns) assert.ok(patterns.includes(style.pattern), `${name}: ${id} does not support ${style.pattern}`);
  }
  const ch = await buildHuman(lib, { ...DEFAULT_PARAMS, ...patch, name, detail: 'low' });
  assert.ok(ch.rig && ch.mesh.positions.length > 9000, `${name}: incomplete mesh or rig`);
  const materials = ch.mesh.materials.map(m => m.name);
  for (const label of expected) assert.ok(materials.some(m => m.includes(label)), `${name}: missing ${label}; got ${materials.join(', ')}`);
  if (name === 'The Resort Guest') {
    assert.ok(!materials.some(m => m.includes('Loose shorts white drawstring')),
      'Resort shirt must conceal the shorts drawstring');
  }
  if (name === 'The Flight Attendant') {
    assert.ok(!materials.some(m => m.includes('skirt lining')),
      'Flight attendant skirt must keep its original single fabric layer');
    assert.ok(patch.accessories?.includes('neck_scarf'), 'Flight attendant wears the silk neck scarf as an accessory');
  }
  if (name === 'The MMA Fighter') {
    assert.ok(!materials.includes('Gloves'), 'MMA fighter must not wear full-finger leather gloves');
  }
  if (name === 'The Street Racer') {
    const shirt = ch.mesh.materials.find(m => m.name === 'Racer casual shirt');
    const lining = ch.mesh.materials.find(m => m.name === 'Racer shirt underarm lining');
    assert.equal(lining?.map, shirt?.map, 'Racer lining should use the same fabric as the shirt');
    assert.equal(lining?.normalMap, shirt?.normalMap, 'Racer lining should share the shirt surface detail');
  }
  if (name === 'The Dispatch Rider') {
    const visor = ch.mesh.materials.find(m => m.name === 'Open-face helmet transparent visor');
    assert.ok(visor?.alpha === 'blend' && (visor.opacity ?? 1) < 0.5,
      'Dispatch helmet visor must remain translucent');
  }
  for (const value of ch.mesh.positions) assert.ok(Number.isFinite(value), `${name}: non-finite vertex`);
  console.log(`OK ${name}: ${ch.mesh.positions.length / 3} vertices, ${materials.length} materials`);
}

const rider = PRESETS['The Dispatch Rider'];
assert.equal(rider.top, 'techwear_jacket');
assert.ok(rider.accessories?.includes('open_face_helmet'));
assert.ok(rider.accessories?.includes('sport_gloves') && !rider.accessories?.includes('gloves'));
assert.equal(rider.garmentStyles?.techwear_jacket?.color, '#535a60');
assert.ok(!rider.accessories?.includes('helmet') && !rider.accessories?.includes('reflective_vest'));
assert.equal(rider.vehicle, 'motorcycle');
assert.equal(rider.vehicleStyle?.deliveryBox, true);
assert.equal(sanitizeVehicleStyle(rider.vehicleStyle).deliveryBox, true);
assert.equal(parseCharacterInput(JSON.stringify({ kind: 'ara-character', version: 1, preset: 'The Dispatch Rider', params: { vehicleStyle: { deliveryBox: true } } }), lib.catalog).vehicleStyle.deliveryBox, true);
const ch = await buildHuman(lib, { ...DEFAULT_PARAMS, ...rider, detail: 'low' });
const animator = new Animator(ch.rig!);
const clip = clipById.get('ride_motorcycle')!;
const withBox = new Vehicle('motorcycle', ch.rig!, animator, clip, rider.vehicleStyle!);
const withoutBox = new Vehicle('motorcycle', ch.rig!, animator, clip, { ...rider.vehicleStyle!, deliveryBox: false });
assert.ok(withBox.asset().mesh.positions.length > withoutBox.asset().mesh.positions.length, 'Delivery box adds no vehicle geometry');
withBox.dispose(); withoutBox.dispose();
const exported = await runExport(lib, ch, planExport(ch, { ...DEFAULT_EXPORT, mode: 'rigged', format: 'glb', vehicleFile: true }));
const files = exported.name.endsWith('.zip') ? Object.entries(unzipSync(exported.data)) : [[exported.name, exported.data] as const];
assert.ok(files.some(([name, bytes]) => name.endsWith('.glb') && String.fromCharCode(...bytes.slice(0, 4)) === 'glTF'), 'Dispatch rider GLB missing');
assert.ok(files.some(([name]) => name.includes('motorcycle') && name.endsWith('.glb')), 'Motorcycle GLB missing from dispatch export');
console.log('50 presets and dispatch motorcycle box passed.');
