/** Three small, self-contained sets. All geometry and textures are original and deterministic. */
import * as THREE from 'three';


export interface StudioSet { group: THREE.Group; background: string; floor: string; key: string; fill: string; exposure: number; seats: { x: number; y: number; z: number; yaw: number }[] }
function stoneTexture(color: string) {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d')!; g.fillStyle = color; g.fillRect(0, 0, 512, 512);
  let seed = 827;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 16000; i++) { g.fillStyle = random() > 0.5 ? 'rgba(255,255,255,.035)' : 'rgba(20,12,6,.025)'; g.fillRect(random() * 512, random() * 512, random() * 3 + 0.5, 0.5); }
  g.strokeStyle = 'rgba(30,24,20,.09)'; g.lineWidth = 1;
  g.strokeRect(0.5, 0.5, 511, 511); g.beginPath(); g.moveTo(0, 256); g.lineTo(512, 256); g.moveTo(256, 0); g.lineTo(256, 256); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(350, 350); t.anisotropy = 8;
  return t;
}
export function createOriginalSet(id: 'portrait' | 'runway' | 'courtyard'): StudioSet {
  const group = new THREE.Group(), seats: StudioSet['seats'] = [];
  const palette = {
    portrait: { background: '#b8b3aa', floor: '#b8b3aa', key: '#fff5e8', fill: '#e4ebff', exposure: 1.05 },
    runway: { background: '#14171c', floor: '#202329', key: '#fff0d8', fill: '#c4d7ff', exposure: 1.12 },
    courtyard: { background: '#d4d4cb', floor: '#c1b6a0', key: '#ffe3b2', fill: '#d9e9f1', exposure: 1.04 },
  }[id];
  const material = (color: string, roughness = 0.85, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const box = (size: [number, number, number], pos: [number, number, number], mat: THREE.Material) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...size), mat); m.position.set(...pos); m.castShadow = true; m.receiveShadow = true; group.add(m); return m;
  };
  const floorMat = material(palette.floor, id === 'runway' ? 0.3 : 0.9);
  if (id === 'courtyard') floorMat.map = stoneTexture('#d3c9b5');
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000).rotateX(-Math.PI / 2), floorMat); floor.receiveShadow = true; floor.position.y = -0.008; group.add(floor);
  if(id==='runway')group.userData.spatialRegions=[{id:'runway',kind:'walkway',bounds:[-.825,-35,.825,35],y:0}];
  if (id === 'portrait') {
    // Quiet architectural framing, outside the character's walking corridor.
    const plaster = material('#c6c0b4'), dark = material('#97958b');
    box([0.75, 3.8, 0.75], [-3.2, 1.9, -3.5], plaster);
    box([0.75, 3.8, 0.75], [3.2, 1.9, -3.5], plaster);
    box([7.2, 0.6, 0.75], [0, 4, -3.5], plaster);
    box([1, 0.8, 1], [-2.6, 0.4, 0.5], plaster);
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.32, 48, 32), material('#817366', 0.35, 0.2)); sphere.position.set(-2.6, 1.12, 0.5); sphere.castShadow = true; group.add(sphere);
    box([0.04, 3.1, 0.05], [3.64, 1.55, -3], dark);
  } else if (id === 'runway') {
    const dark = material('#181b21', 0.3), bronze = material('#9c8050', 0.35, 0.65);
    box([1.65, 0.008, 70], [0, 0.001, 0], material('#2d3035', 0.36));
    for (const x of [-0.86, 0.86]) box([0.012, 0.012, 70], [x, 0.008, 0], bronze);
    for (let z = -20; z <= 20; z += 5) {
      for (const x of [-3.1, 3.1]) {
        box([0.55, 4.5, 0.8], [x, 2.25, z], dark);
        box([0.035, 3.5, 0.04], [x + (x < 0 ? 0.29 : -0.29), 2, z + 0.42], new THREE.MeshStandardMaterial({ color: '#cbb28b', emissive: '#d4a968', emissiveIntensity: 1.4 }));
      }
      box([6.8, 0.45, 0.8], [0, 4.45, z], dark);
    }
  } else {
    const plaster = material('#d2bd9d'), trim = material('#c5ac87'), stone = material('#b6a48c');
    box([30, 5.5, 0.4], [0, 2.75, -8], plaster);
    // Recessed, dark archways give the set depth without putting obstacles in the performance path.
    const arch = (x: number) => {
      const shape = new THREE.Shape(); shape.moveTo(-0.9, 0); shape.lineTo(0.9, 0); shape.lineTo(0.9, 2); shape.absarc(0, 2, 0.9, 0, Math.PI, false); shape.closePath();
      const panel = new THREE.Mesh(new THREE.ShapeGeometry(shape, 48), material('#776f61')); panel.position.set(x, 0, -7.78); group.add(panel);
      box([0.16, 2.1, 0.28], [x - 1, 1.05, -7.65], trim); box([0.16, 2.1, 0.28], [x + 1, 1.05, -7.65], trim);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 8, 48, Math.PI), trim); ring.position.set(x, 2, -7.65); group.add(ring);
    };
    for (const x of [-5, -1.8, 1.8, 5]) arch(x);
    for (const x of [-4, 4]) {
      box([1.8, 0.38, 0.8], [x, 0.19, -1.5], stone);
      box([1.95, 0.08, 0.9], [x, 0.42, -1.5], material('#8e785b'));
      for (const dx of [-0.5, 0.5]) seats.push({ x: x + dx, y: 0.46, z: -1.5, yaw: 0 });
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.25, 0.6, 40), material('#a87355')); pot.position.set(x, 0.3, -4.5); pot.castShadow = true; group.add(pot);
      const soil = new THREE.Mesh(new THREE.CircleGeometry(0.34, 32).rotateX(-Math.PI / 2), material('#514638')); soil.position.set(x, 0.61, -4.5); group.add(soil);
      for (let i = 0; i < 9; i++) {
        const a = i * 2.399, h = 0.55 + (i % 3) * 0.12;
        const points = [new THREE.Vector3(x, 0.6, -4.5), new THREE.Vector3(x + Math.cos(a) * 0.12, 0.6 + h * 0.7, -4.5 + Math.sin(a) * 0.12), new THREE.Vector3(x + Math.cos(a) * 0.27, 0.6 + h, -4.5 + Math.sin(a) * 0.27)];
        const leaf = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 8, 0.025, 4), material(i % 2 ? '#56624b' : '#677457')); leaf.castShadow = true; group.add(leaf);
      }
    }
  }
  return { group, seats, ...palette };
}
