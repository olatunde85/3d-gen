// A playable Ara character in three.js: walk and run with the keyboard or by clicking the ground.
import * as THREE from 'three';
import { createCharacter } from 'ara3d';

// --- The scene: a renderer, a camera, lights and a floor ----------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#15161a');
scene.fog = new THREE.Fog('#15161a', 14, 40);

const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 2, 4.2);

scene.add(new THREE.HemisphereLight('#dfe8ff', '#2a2f3a', 1.6));
const sun = new THREE.DirectionalLight('#ffffff', 2.4);
sun.position.set(4, 8, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 });
scene.add(sun, sun.target);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#25262c', roughness: 1 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const grid = new THREE.GridHelper(200, 200, '#3a3b44', '#2c2d34');
grid.position.y = 0.002;
scene.add(grid);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// --- The character ------------------------------------------------------------------------------------------------
// Any preset works (see PRESET_NAMES), or { random: 42 } for a random character. Load the clips locomotion blends.
const hero = await createCharacter('The Adventurer', { animations: ['idle', 'walk', 'run'] });
hero.scene.traverse((o) => { if (o.isMesh) o.castShadow = true; });
scene.add(hero.scene);
document.getElementById('status').remove();

const mixer = new THREE.AnimationMixer(hero.scene);
// Blends idle, walk and run by speed: set legs.speed every frame from the character's movement.
const legs = hero.locomotion(mixer);

// --- Input: keys move relative to the camera; a click sets a place to walk to --------------------------------------
const keys = new Set();
addEventListener('keydown', (e) => { keys.add(e.code); if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault(); });
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

let goal = null, goalRun = false;
const ray = new THREE.Raycaster(), pointer = new THREE.Vector2();
const marker = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.24, 32), new THREE.MeshBasicMaterial({ color: '#6d8dff' }));
marker.rotation.x = -Math.PI / 2;
marker.visible = false;
scene.add(marker);
const pick = (e, run) => {
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(pointer, camera);
  const hit = ray.intersectObject(floor)[0];
  if (!hit) return;
  goal = hit.point.setY(0);
  goalRun = run;
  marker.position.set(goal.x, 0.01, goal.z);
  marker.visible = true;
};
renderer.domElement.addEventListener('click', (e) => pick(e, false));
renderer.domElement.addEventListener('dblclick', (e) => pick(e, true));

// --- Every frame: move, animate, follow with the camera ------------------------------------------------------------
const clock = new THREE.Clock();
const move = new THREE.Vector3(), forward = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
const follow = new THREE.Vector3(0, 2, 4.2), look = new THREE.Vector3();
let speed = 0;

renderer.setAnimationLoop(() => {
  const delta = Math.min(clock.getDelta(), 0.1);

  // Which way to go: the keys, relative to where the camera looks, or towards the clicked place.
  camera.getWorldDirection(forward).setY(0).normalize();
  right.crossVectors(forward, up);
  move.set(0, 0, 0);
  if (keys.has('KeyW') || keys.has('ArrowUp')) move.add(forward);
  if (keys.has('KeyS') || keys.has('ArrowDown')) move.sub(forward);
  if (keys.has('KeyD') || keys.has('ArrowRight')) move.add(right);
  if (keys.has('KeyA') || keys.has('ArrowLeft')) move.sub(right);
  let running = keys.has('ShiftLeft') || keys.has('ShiftRight');
  if (move.lengthSq() > 0) goal = null, marker.visible = false;
  else if (goal) {
    move.subVectors(goal, hero.scene.position).setY(0);
    running = goalRun;
    if (move.length() < 0.15) goal = null, marker.visible = false, move.set(0, 0, 0);
  }

  // Ease the speed towards walking or running pace, using the character's own natural speeds.
  const wanted = move.lengthSq() > 0 ? (running ? legs.runSpeed : legs.walkSpeed) : 0;
  speed = THREE.MathUtils.damp(speed, wanted, 6, delta);
  if (move.lengthSq() > 0) {
    move.normalize();
    // Turn to face the way of travel, smoothly.
    const heading = Math.atan2(move.x, move.z), turn = Math.atan2(Math.sin(heading - hero.scene.rotation.y), Math.cos(heading - hero.scene.rotation.y));
    hero.scene.rotation.y += turn * Math.min(1, delta * 10);
  }
  // Move along the way the character faces, so turns curve naturally.
  hero.scene.position.x += Math.sin(hero.scene.rotation.y) * speed * delta;
  hero.scene.position.z += Math.cos(hero.scene.rotation.y) * speed * delta;
  legs.speed = speed;

  // Standing still, the character looks at you; on the move, ahead.
  hero.lookAt(speed < 0.2 ? camera : null);

  mixer.update(delta);
  hero.update(delta); // blinking, looking (after the mixer has posed the body)

  // The camera follows from behind and above, and the sun's shadow follows too.
  follow.copy(hero.scene.position).add(new THREE.Vector3(0, 2, 4.2));
  camera.position.lerp(follow, 1 - Math.exp(-delta * 4));
  look.copy(hero.scene.position).setY(1.1);
  camera.lookAt(look);
  sun.position.copy(hero.scene.position).add(new THREE.Vector3(4, 8, 5));
  sun.target.position.copy(hero.scene.position);

  renderer.render(scene, camera);
});
