/**
 * Checks prop files and imported cars: reading and refusing prop files, registering them, choosing one as a
 * vehicle's model, and the car Ara builds from it: seated at the rider's hips, on the ground, wheels turning, lamps
 * joining the vehicle's lights, paint taking the style's colour. A style naming a prop that isn't loaded builds
 * Ara's own car.
 *   npx tsx scripts/props-check.ts
 */
import assert from 'node:assert/strict';
import * as T from 'three';
import { nodeLibrary } from './node-assets';
import { PROP_FIXTURE_ID, propFile } from './prop-fixture';
import { buildHuman } from '../src/core/human';
import { DEFAULT_PARAMS } from '../src/core/params';
import { Animator } from '../src/core/anim/evaluate';
import { clipById } from '../src/core/anim/clips';
import { loadPropModel, propModel, readPropFile, registerPropModel, SEATED_HIP, unregisterPropModel } from '../src/core/props/prop-models';
import { DEFAULT_VEHICLE_STYLE, sanitizeVehicleStyle, vehicleLift, vehicleModelChoices, vehicleModelValue, vehicleName, vehicleStyleForModel } from '../src/core/props/vehicles';
import { Vehicle } from '../src/core/props/vehicle';

const byRole = (root: T.Object3D, role: string) => { let found: T.Object3D | undefined;root.traverse((o) => { if (!found && o.userData.ara_role === role) found = o; });return found!; };
const buffer = (bytes: Uint8Array) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

// Reading and refusing.
const { manifest, cost } = readPropFile(buffer(propFile()));
assert.equal(manifest.id, PROP_FIXTURE_ID);assert.equal(cost.meshes, 7);
assert.throws(() => readPropFile(buffer(propFile({ details: null }))), /no prop details/);
assert.throws(() => readPropFile(buffer(propFile({ details: { id: 'Box Car' } }))), /author\/prop/);
assert.throws(() => readPropFile(buffer(propFile({ details: { base: 'helicopter' } }))), /one of Ara's cars/);
assert.throws(() => readPropFile(buffer(propFile({ details: { license: '' } }))), /licence/);
await assert.rejects(loadPropModel(buffer(propFile({ wheels: 2 }))), /wheels aren't tagged/);
console.log('OK prop files are read, and refused with the reason');

// Registered, it's offered for its base vehicle and kept in a style by its ID.
const model = await loadPropModel(buffer(propFile()), { textures: false });
registerPropModel(model);
assert.ok(vehicleModelChoices('sports_car').some((c) => c.value === `prop:${PROP_FIXTURE_ID}`));
assert.ok(!vehicleModelChoices('suv').some((c) => c.value.startsWith('prop:')), 'only for its base');
const style = vehicleStyleForModel('sports_car', `prop:${PROP_FIXTURE_ID}`, vehicleStyleForModel('sports_car', '', DEFAULT_VEHICLE_STYLE));
assert.equal(style.model, PROP_FIXTURE_ID);assert.equal(style.body, undefined);
assert.equal(vehicleModelValue('sports_car', style), `prop:${PROP_FIXTURE_ID}`);assert.equal(vehicleName('sports_car', style), 'Box car');
assert.equal(style.color, '#e77c59', 'a newly chosen prop arrives in its own paint');
assert.deepEqual(sanitizeVehicleStyle(JSON.parse(JSON.stringify(style))), style);
assert.equal(sanitizeVehicleStyle({ ...style, model: 'not a prop' }).model, undefined);
console.log('OK a prop is offered for its base vehicle and kept in the style');

// The car Ara builds: the rider's hips on the prop's seat, the wheels on the ground and turning, the lamps lit.
const lib = await nodeLibrary();
const ch = await buildHuman(lib, { ...DEFAULT_PARAMS, detail: 'low', outfit: 'none', hair: 'none', carry: 'none', vehicle: 'auto', faceShapes: false });
const animator = new Animator(ch.rig!);
const car = new Vehicle('sports_car', ch.rig!, animator, clipById.get('drive_sports_car')!, style);
const s = car.fit.scale, hip = car.fit.average('hip');
assert.ok(Math.abs(car.lift - (0.35 - SEATED_HIP) * s) < 1e-9 && Math.abs(vehicleLift('sports_car', s, style) - car.lift) < 1e-9, 'lift from the seat');
assert.ok(Math.abs(hip.y - 0.35 * s) < 0.02, `hips on the seat (${hip.y.toFixed(3)})`);
const wheels: T.Object3D[] = [];car.group.traverse((o) => { if (o.userData.wheelRadius) wheels.push(o); });
assert.equal(wheels.length, 4);
for (const w of wheels) { assert.ok(Math.abs(w.userData.wheelRadius - 0.33 * s) < 1e-3, 'radius');assert.ok(Math.abs(w.getWorldPosition(new T.Vector3()).y - 0.33 * s) < 1e-3, 'on the ground'); }
car.update(0, undefined, 1);
assert.ok(Math.abs(wheels[0].rotation.x - 1 / wheels[0].userData.wheelRadius) < 1e-6, 'turning with distance');
const seatX = byRole(car.group, 'seat_driver').getWorldPosition(new T.Vector3());
assert.ok(Math.abs(seatX.x - hip.x) < 1e-6 && Math.abs(seatX.z - hip.z) < 1e-6, 'seat under the hips');
const mats = new Set<T.Material>();car.group.traverse((o) => { const m = (o as T.Mesh).material;if (m) for (const x of [m].flat()) mats.add(x); });
const tail = [...mats].find((m) => m.name === 'Vehicle tail lamps') as T.MeshStandardMaterial, paint = [...mats].find((m) => m.userData.ara_role === 'paint') as T.MeshStandardMaterial;
assert.ok(tail, 'brake lamps join the lights');car.setLights(1);assert.ok(tail.emissiveIntensity > 2.5, 'brake lamps brighten');
assert.equal(`#${paint.color.getHexString(T.SRGBColorSpace)}`, style.color, 'paint takes the style colour');
assert.equal(byRole(car.group, 'steering').visible, false, 'the driver steers Ara\'s wheel');
const passenger = new Vehicle('sports_car', ch.rig!, animator, clipById.get('sit_sports_car_passenger')!, style);
assert.equal(byRole(passenger.group, 'steering').visible, true, 'a passenger sees the prop\'s wheel');
// The prop's own model is left whole for the next car.
let parts = 0;propModel(PROP_FIXTURE_ID)!.template.traverse((o) => { if ((o as T.Mesh).isMesh && (o as T.Mesh).geometry.getAttribute('position')) parts++; });assert.equal(parts, 7);
console.log('OK the imported car seats its rider, stands on its wheels, turns them, lights its lamps and takes its paint');

// Not loaded: Ara's own sports car, with Ara's lift.
unregisterPropModel(PROP_FIXTURE_ID);
const fallback = new Vehicle('sports_car', ch.rig!, animator, clipById.get('drive_sports_car')!, style);
assert.equal(fallback.group.getObjectByName(PROP_FIXTURE_ID), undefined);assert.equal(fallback.lift, vehicleLift('sports_car', s));
assert.equal(vehicleName('sports_car', style), 'Modern sports car');
console.log('OK a style naming a prop that isn\'t loaded builds Ara\'s own car');
console.log('Prop checks passed.');
