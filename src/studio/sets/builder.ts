/** Shared primitives and materials keep a set's geometry and GPU allocations bounded. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Mood } from '../catalog';
export class SetBuilder {
  constructor(readonly mood: Mood = 'day', readonly surface: 'stone' | 'wood' | 'sand' | 'grass' = 'stone') {}
  private surfaceMaps = new Map<string, THREE.CanvasTexture>();
  readonly group = new THREE.Group();
  private geometries = new Map<string, THREE.BufferGeometry>();
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  material(color: string, roughness = 0.8, metalness = 0, glow = 0) {
    const key = `${color}:${roughness}:${metalness}:${glow}`;
    if (!this.materials.has(key)) this.materials.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive: color, emissiveIntensity: glow }));
    return this.materials.get(key)!;
  }
  geometry(key: string, make: () => THREE.BufferGeometry) {
    if (!this.geometries.has(key)) this.geometries.set(key, make());
    return this.geometries.get(key)!;
  }
  mesh(geometry: THREE.BufferGeometry, material: THREE.Material, pos: number[], scale: number[] = [1, 1, 1]) {
    const m = new THREE.Mesh(geometry, material); m.position.set(pos[0], pos[1], pos[2]); m.scale.set(scale[0], scale[1], scale[2]);
    m.castShadow = true; m.receiveShadow = true; this.group.add(m); return m;
  }
  box(size: number[], pos: number[], color: string, roughness = 0.8, metalness = 0) { return this.mesh(this.geometry('box', () => new RoundedBoxGeometry(1, 1, 1, 2, 0.025)), this.material(color, roughness, metalness), pos, size); }
  ball(size: number[], pos: number[], color: string) { return this.mesh(this.geometry('ball', () => new THREE.SphereGeometry(1, 16, 12)), this.material(color), pos, size); }
  cylinder(radius: number, height: number, pos: number[], color: string, top = radius) { return this.mesh(this.geometry(`cylinder:${top / radius}`, () => new THREE.CylinderGeometry(top / radius, 1, 1, 16)), this.material(color), pos, [radius, height, radius]); }
  private surfaceMap(kind: string, repeat: number) {
    const key = `${kind}:${repeat}`; if(this.surfaceMaps.has(key))return this.surfaceMaps.get(key)!;
    const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const g=canvas.getContext('2d')!;g.fillStyle='#eeeeea';g.fillRect(0,0,512,512);
    let seed=781;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<14000;i++){const a=random()*0.075;g.fillStyle=`rgba(${random()>.5?'255,255,255':'35,35,30'},${a})`;const x=random()*512,y=random()*512;g.fillRect(x,y,kind==='wood'?random()*35+4:random()*2+0.5,kind==='wood'?0.65:1);}
    g.strokeStyle='rgba(40,40,32,.10)';g.lineWidth=1;
    if(kind==='wood'){for(let y=0;y<512;y+=64){g.beginPath();g.moveTo(0,y);g.lineTo(512,y);g.stroke();g.beginPath();g.moveTo(y%128?125:340,y);g.lineTo(y%128?125:340,y+64);g.stroke();}}
    if(kind==='stone'){g.strokeRect(0.5,0.5,511,511);g.beginPath();g.moveTo(0,256);g.lineTo(512,256);g.moveTo(256,0);g.lineTo(256,256);g.stroke();}
    const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(repeat,repeat);map.anisotropy=8;this.surfaceMaps.set(key,map);return map;
  }
  floor(color: string, size = 1000, y = -0.012) {
    const material=this.material(color);material.map=this.surfaceMap(this.surface,size/(this.surface==='wood'?2.8:3.2));
    const m=this.mesh(this.geometry('ground',()=>new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2)),material,[0,y,0],[size,1,size]);m.castShadow=false;return m;
  }
  wall(width: number, height: number, pos: number[], color: string, yaw = 0) {
    // Walls disappear when viewed from outside: orbiting a room gives a cutaway view.
    const m = this.mesh(this.geometry('wall', () => new THREE.PlaneGeometry()), this.material(color), pos, [width, height, 1]); m.rotation.y = yaw; return m;
  }
  label(text: string, pos: number[], width: number, color = '#d9dfdf', background = '#26343c') {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = background; ctx.fillRect(0, 0, 512, 128); ctx.fillStyle = color; ctx.font = '500 40px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 256, 64, 475);
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.7, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: 0.2 });
    const m = this.mesh(this.geometry('label', () => new THREE.PlaneGeometry()), mat, pos, [width, width / 4, 1]); m.castShadow = false; return m;
  }
  room(wall: string, floor: string) {
    this.floor(floor); this.wall(12, 4.5, [0, 2.25, -5.5], wall); this.wall(11, 4.5, [-6, 2.25, 0], wall, Math.PI / 2); this.wall(11, 4.5, [6, 2.25, 0], wall, -Math.PI / 2);
    for (const x of [-4, 3]) { this.box([2.5, 2.6, 0.06], [x, 2.3, -5.4], this.mood === 'night' ? '#354655' : '#748b96', 0.3); this.box([0.035, 2.6, 0.09], [x, 2.3, -5.34], '#b9c2c6'); this.box([2.5, 0.035, 0.09], [x, 2.3, -5.34], '#b9c2c6'); }
    this.box([12, 0.1, 0.08], [0, 0.05, -5.44], '#a39d90');
  }
  table(x: number, z: number, color = '#826342', width = 1.5, depth = 0.8, height = 0.76) {
    this.box([width, 0.075, depth], [x, height, z], color, 0.5);
    for (const dx of [-width * 0.4, width * 0.4]) for (const dz of [-depth * 0.35, depth * 0.35]) this.box([0.055, height, 0.055], [x + dx, height / 2, z + dz], '#3e4243');
  }
  chair(x: number, z: number, color = '#56666b', yaw = 0) {
    const start = this.group.children.length;
    this.box([0.5, 0.09, 0.48], [x, 0.46, z], color); this.box([0.5, 0.52, 0.075], [x, 0.73, z - 0.22], color);
    for (const dx of [-0.2, 0.2]) for (const dz of [-0.19, 0.19]) this.box([0.035, 0.43, 0.035], [x + dx, 0.22, z + dz], '#42454a');
    if (yaw) for (const child of this.group.children.slice(start)) { child.position.sub(new THREE.Vector3(x, 0, z)).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(new THREE.Vector3(x, 0, z)); child.rotation.y = yaw; }
  }
  sofa(x: number, z: number, color = '#68736d') {
    this.box([2.1, 0.3, 0.86], [x, 0.28, z], color); this.box([2.1, 0.55, 0.18], [x, 0.7, z - 0.4], color);
    for (const dx of [-1, 1]) this.box([0.16, 0.5, 0.9], [x + dx, 0.48, z], color);
    for (const dx of [-0.5, 0.5]) this.box([0.93, 0.15, 0.72], [x + dx, 0.48, z + 0.04], '#a3a89b');
  }
  lamp(x: number, z: number, height = 1.7) {
    this.cylinder(0.13, 0.035, [x, 0.02, z], '#736552'); this.cylinder(0.018, height, [x, height / 2, z], '#897452');
    const shade = this.cylinder(0.24, 0.3, [x, height, z], '#e1cdaa', 0.17); shade.material = this.material('#e7d1a2', 0.8, 0, 0.6);
  }
  plant(x: number, z: number, height = 1.2) {
    this.cylinder(0.23, 0.4, [x, 0.2, z], '#a57f64', 0.29);
    for (let i = 0; i < 5; i++) { const a = i * 2.4; const leaf = this.ball([0.13, height * 0.4, 0.07], [x + Math.cos(a) * 0.18, height * 0.62, z + Math.sin(a) * 0.18], i % 2 ? '#52674b' : '#728660'); leaf.rotation.z = Math.cos(a) * 0.4; }
  }
  tree(x: number, z: number, height = 5) {
    this.cylinder(0.13, height * 0.6, [x, height * 0.3, z], '#75664e');
    for (let i = 0; i < 3; i++) this.ball([height * 0.27, height * 0.25, height * 0.24], [x + Math.sin(i * 2.4) * 0.6, height * (0.65 + i * 0.08), z + Math.cos(i * 2.4) * 0.5], i % 2 ? '#627354' : '#788265');
  }
  palm(x: number, z: number, h = 5) {
    this.cylinder(0.12, h, [x, h / 2, z], '#9e8462', 0.075);
    const geo = this.geometry('palm-frond', () => { const vertices: number[] = [], indices: number[] = [];
      for (let i = 0; i <= 10; i++) { const t = i / 10, w = Math.sin(t * Math.PI) * 0.24; vertices.push(-w, -t * t * 1.4, t * 2.3, w, -t * t * 1.4, t * 2.3); if (i < 10) { const j = i * 2; indices.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); } }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); g.setIndex(indices); g.computeVertexNormals(); return g;
    });
    const mat = this.material('#617955'); mat.side = THREE.DoubleSide;
    for (let i = 0; i < 9; i++) { const leaf = this.mesh(geo, mat, [x, h, z]); leaf.rotation.y = i * Math.PI * 2 / 9; }
  }
  parasol(x: number, z: number, color = '#c9a36f') {
    this.cylinder(0.025, 2.4, [x, 1.2, z], '#dbd3c3'); this.cylinder(1.15, 0.35, [x, 2.4, z], color, 0.05);
  }
  skyline(z = -22) {
    for (let i = 0; i < 15; i++) { const x = (i - 7) * 2.6, h = 3 + ((i * 7) % 11) * 0.7; this.box([1.6, h, 2], [x, h / 2, z - i % 3 * 2], i % 2 ? '#7e8990' : '#65737f'); }
  }
  water(z = -13, width = 100, depth = 20, color = '#4a9faa') {
    const m = this.box([width, 0.025, depth], [0, 0.0125, z], color, 0.16, 0.3); m.castShadow = false;
    const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const g=canvas.getContext('2d')!,data=g.createImageData(256,256);
    for(let y=0;y<256;y++)for(let x=0;x<256;x++){const i=(y*256+x)*4;data.data[i]=128+Math.round(Math.sin((x+y*.4)*.14)*12);data.data[i+1]=128+Math.round(Math.cos((y-x*.2)*.18)*9);data.data[i+2]=254;data.data[i+3]=255;}
    g.putImageData(data,0,0);const normal=new THREE.CanvasTexture(canvas);normal.wrapS=normal.wrapT=THREE.RepeatWrapping;normal.repeat.set(width/4,depth/4);normal.anisotropy=4;
    (m.material as THREE.MeshStandardMaterial).normalMap=normal;(m.material as THREE.MeshStandardMaterial).normalScale.set(.4,.4);
    for (let i = 0; i < 8; i++) { const ripple = this.box([width * 0.8, 0.006, 0.025], [Math.sin(i) * width * 0.08, 0.028, z - depth * 0.4 + i * depth * 0.1], '#a7c8c4', 0.2); ripple.castShadow = false; }
  }
}
