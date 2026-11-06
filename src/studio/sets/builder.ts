/** Shared primitives and materials keep a set's geometry and GPU allocations bounded. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Mood } from '../catalog';
/** A place to sit: the seat's centre, the height of its top, and the way a sitter faces (radians; 0 faces +Z). */
export interface Seat { x: number; y: number; z: number; yaw: number }

export class SetBuilder {
  constructor(readonly mood: Mood = 'day', readonly surface: 'stone' | 'wood' | 'sand' | 'grass' = 'stone') {}
  private surfaceMaps = new Map<string, THREE.CanvasTexture>();
  readonly group = new THREE.Group();
  /** Semantic floor overlays, recorded beside the geometry used to render them. */
  surfaceBox(id:string,kind:'walkway'|'road'|'dock'|'court'|'stage',size:number[],pos:number[],color:string) {
    const mesh=this.box(size,pos,color);this.markSurface(id,kind,size,pos);return mesh;
  }
  markSurface(id:string,kind:'walkway'|'road'|'dock'|'court'|'stage',size:number[],pos:number[]) {
    const regions=this.group.userData.spatialRegions??=[];
    regions.push({id,kind,bounds:[pos[0]-size[0]/2,pos[2]-size[2]/2,pos[0]+size[0]/2,pos[2]+size[2]/2],y:0});
  }
  readonly waterAreas:{minX:number;maxX:number;minZ:number;maxZ:number}[]=[];
  readonly plantExclusions:{minX:number;maxX:number;minZ:number;maxZ:number}[]=[];
  readonly plantingSites:{x:number;z:number;radius:number}[]=[];
  /** Where characters can sit; seated performances use these instead of conjuring chairs. */
  readonly seats: Seat[] = [];
  seat(x: number, y: number, z: number, yaw = 0) { this.seats.push({ x, y, z, yaw }); }
  private geometries = new Map<string, THREE.BufferGeometry>();
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  /** Merges the pieces that share a material into one mesh, so a detailed set costs only a few draw calls. */
  compact() {
    const buckets = new Map<string, THREE.Mesh[]>();
    for (const child of this.group.children) {
      const m = child as THREE.Mesh;
      if (!m.isMesh || m.children.length || Array.isArray(m.material)) continue;
      const key = `${m.material.uuid}:${m.castShadow}`;
      const bucket=buckets.get(key);if(bucket)bucket.push(m);else buckets.set(key,[m]);
    }
    for (const meshes of buckets.values()) {
      if (meshes.length < 2) continue;
      const parts = meshes.map(m => {
        m.updateMatrix();
        const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
        return g.applyMatrix4(m.matrix);
      });
      const merged = mergeGeometries(parts); parts.forEach(g => g.dispose());
      if (!merged) continue;
      const out = new THREE.Mesh(merged, meshes[0].material); out.castShadow = meshes[0].castShadow; out.receiveShadow = true;
      for (const m of meshes) this.group.remove(m);
      this.group.add(out);
    }
    // Shared source shapes that no remaining mesh uses are released now.
    const used = new Set<THREE.BufferGeometry>(); this.group.traverse(o => { if ((o as THREE.Mesh).isMesh) used.add((o as THREE.Mesh).geometry); });
    for (const g of this.geometries.values()) if (!used.has(g)) g.dispose();
    this.geometries.clear();
  }
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
  room(wall: string, floor: string, windows = [-4, 3]) {
    this.group.userData.roomBounds={minX:-6,maxX:6,minZ:-5.5,maxZ:5.5};
    this.floor(floor); this.wall(12, 4.5, [0, 2.25, -5.5], wall); this.wall(11, 4.5, [-6, 2.25, 0], wall, Math.PI / 2); this.wall(11, 4.5, [6, 2.25, 0], wall, -Math.PI / 2);
    for (const x of windows) { this.box([2.5, 2.6, 0.06], [x, 2.3, -5.4], this.mood === 'night' ? '#354655' : '#748b96', 0.3); this.box([0.035, 2.6, 0.09], [x, 2.3, -5.34], '#b9c2c6'); this.box([2.5, 0.035, 0.09], [x, 2.3, -5.34], '#b9c2c6'); }
    this.box([12, 0.1, 0.08], [0, 0.05, -5.44], '#a39d90');
  }
  table(x: number, z: number, color = '#826342', width = 1.5, depth = 0.8, height = 0.76) {
    this.box([width, 0.075, depth], [x, height, z], color, 0.5);
    for (const dx of [-width * 0.4, width * 0.4]) for (const dz of [-depth * 0.35, depth * 0.35]) this.box([0.055, height, 0.055], [x + dx, height / 2, z + dz], '#3e4243');
  }
  /** Builds `make` around (x, z), then turns it by `yaw` radians. Unturned furniture faces +Z, towards the camera. */
  at(x: number, z: number, yaw: number, make: () => void) {
    const start = this.group.children.length, firstSeat = this.seats.length; make();
    if (!yaw) return;
    const pivot = new THREE.Vector3(x, 0, z), turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    for (const child of this.group.children.slice(start)) { child.position.sub(pivot).applyQuaternion(turn).add(pivot); child.quaternion.premultiply(turn); }
    for (const seat of this.seats.slice(firstSeat)) {
      const p = new THREE.Vector3(seat.x, 0, seat.z).sub(pivot).applyQuaternion(turn).add(pivot);
      seat.x = p.x; seat.z = p.z; seat.yaw = Math.atan2(Math.sin(seat.yaw + yaw), Math.cos(seat.yaw + yaw));
    }
  }
  chair(x: number, z: number, color = '#56666b', yaw = 0) {
    this.at(x, z, yaw, () => {
      this.box([0.5, 0.09, 0.48], [x, 0.46, z], color); this.box([0.5, 0.52, 0.075], [x, 0.73, z - 0.22], color);
      for (const dx of [-0.2, 0.2]) for (const dz of [-0.19, 0.19]) this.box([0.035, 0.43, 0.035], [x + dx, 0.22, z + dz], '#42454a');
      this.seat(x, 0.505, z + 0.02);
    });
  }
  armchair(x: number, z: number, color = '#7b6f62', yaw = 0) {
    this.at(x, z, yaw, () => {
      this.box([0.9, 0.32, 0.85], [x, 0.26, z], color); this.box([0.9, 0.5, 0.18], [x, 0.66, z - 0.36], color);
      for (const dx of [-0.39, 0.39]) this.box([0.14, 0.36, 0.85], [x + dx, 0.5, z], color);
      this.box([0.64, 0.12, 0.66], [x, 0.47, z + 0.05], '#b3ab9b');
      this.seat(x, 0.53, z + 0.05);
    });
  }
  sofa(x: number, z: number, color = '#68736d', yaw = 0) {
    this.at(x, z, yaw, () => {
      this.box([2.1, 0.3, 0.86], [x, 0.28, z], color); this.box([2.1, 0.55, 0.18], [x, 0.7, z - 0.4], color);
      for (const dx of [-1, 1]) this.box([0.16, 0.5, 0.9], [x + dx, 0.48, z], color);
      for (const dx of [-0.5, 0.5]) { this.box([0.93, 0.15, 0.72], [x + dx, 0.48, z + 0.04], '#a3a89b'); this.seat(x + dx, 0.555, z + 0.04); }
      for (const dx of [-0.72, 0.72]) { const c = this.box([0.42, 0.36, 0.12], [x + dx, 0.7, z - 0.24], dx < 0 ? '#c9b48e' : '#8d9d96'); c.rotation.z = dx < 0 ? 0.12 : -0.12; }
    });
  }
  /** A round stool; `yaw` is the way a sitter faces (towards a counter or bench). */
  stool(x: number, z: number, height = 0.75, color = '#6f5d4a', yaw = 0) {
    this.cylinder(0.2, 0.06, [x, height, z], color); this.cylinder(0.025, height, [x, height / 2, z], '#3f4446'); this.cylinder(0.17, 0.02, [x, 0.01, z], '#3f4446');
    this.cylinder(0.14, 0.02, [x, height * 0.35, z], '#3f4446', 0.14);
    this.seat(x, height + 0.03, z, yaw);
  }
  /** A flat rug that never casts shadows. */
  rug(x: number, z: number, width: number, depth: number, color = '#b59f86', border = '#8a7561') {
    for (const [w, d, c, y] of [[width, depth, border, 0.004], [width - 0.2, depth - 0.2, color, 0.008]] as const) { const m = this.box([w, 0.008, d], [x, y, z], c, 0.95); m.castShadow = false; }
  }
  /** A wall-mounted or standing screen whose picture faces +Z before turning. */
  screen(x: number, y: number, z: number, width: number, picture = '#3f6f86', yaw = 0, glow = 0.55, caption?: string) {
    this.at(x, z, yaw, () => {
      this.box([width, width * 0.58, 0.05], [x, y, z], '#16191c', 0.35);
      const face = this.box([width * 0.95, width * 0.53, 0.01], [x, y, z + 0.028], picture, 0.3); face.material = this.material(picture, 0.3, 0, glow); face.castShadow = false;
      if (caption) { const strip = this.label(caption, [x, y - width * 0.16, z + 0.036], width * 0.9, '#ffffff', '#141a20'); (strip.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.6; }
    });
  }
  tv(x: number, z: number, yaw = 0, picture = '#41708a') {
    this.at(x, z, yaw, () => {
      this.box([2.1, 0.48, 0.45], [x, 0.24, z], '#5d4c3d'); for (const dx of [-0.52, 0.52]) this.box([0.9, 0.36, 0.01], [x + dx, 0.26, z + 0.23], '#4e4034');
      this.screen(x, 1.15, z - 0.05, 1.55, picture); this.box([0.25, 0.05, 0.18], [x, 0.505, z - 0.02], '#26292c');
    });
  }
  /** An original abstract painting, generated from a seed. Faces +Z before turning. */
  art(x: number, y: number, z: number, width: number, height: number, seed = 1, yaw = 0) {
    const key = `art:${seed}`; let map = this.surfaceMaps.get(key);
    if (!map) {
      const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = Math.round(256 * height / width);
      const g = canvas.getContext('2d')!, colors = ['#c98b5f', '#3f5f6b', '#d9c49a', '#7d8f6a', '#a45d4f', '#e8e2d2', '#2f3a40'];
      let r = seed * 9301 + 49297; const random = () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; };
      g.fillStyle = colors[seed % colors.length]; g.fillRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < 7; i++) { g.fillStyle = colors[Math.floor(random() * colors.length)]; g.globalAlpha = 0.85;
        if (random() > 0.5) g.fillRect(random() * 200, random() * canvas.height, 30 + random() * 120, 20 + random() * 110);
        else { g.beginPath(); g.arc(random() * 256, random() * canvas.height, 15 + random() * 70, 0, Math.PI * 2); g.fill(); } }
      map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; this.surfaceMaps.set(key, map);
    }
    this.at(x, z, yaw, () => {
      this.box([width + 0.08, height + 0.08, 0.04], [x, y, z], '#2c2a27', 0.5);
      const m = this.mesh(this.geometry('label', () => new THREE.PlaneGeometry()), new THREE.MeshStandardMaterial({ map, roughness: 0.85 }), [x, y, z + 0.022], [width, height, 1]); m.castShadow = false;
    });
  }
  /** Handwriting on a board or sign: `lines` drawn in marker colours on `background`. */
  writing(lines: string[], pos: number[], width: number, height: number, background: string, inks: string[], yaw = 0) {
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = Math.round(1024 * height / width);
    const g = canvas.getContext('2d')!; g.fillStyle = background; g.fillRect(0, 0, canvas.width, canvas.height);
    const size = Math.min(64, canvas.height / (lines.length + 1.5)); g.font = `500 ${size}px "Comic Sans MS", "Segoe Print", "Bradley Hand", cursive`; g.textBaseline = 'middle';
    lines.forEach((line, i) => { g.fillStyle = inks[i % inks.length]; g.fillText(line, 60, size * (1.2 + i * 1.25), canvas.width - 120); });
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
    this.at(pos[0], pos[2], yaw, () => { const m = this.mesh(this.geometry('label', () => new THREE.PlaneGeometry()), new THREE.MeshStandardMaterial({ map, roughness: 0.4 }), pos, [width, height, 1]); m.castShadow = false; });
  }
  /** A whiteboard on the back wall, with a pen tray, markers and an eraser. */
  whiteboard(x: number, z: number, width: number, lines: string[]) {
    const h = width * 0.36, y = 1.55;
    this.box([width + 0.1, h + 0.1, 0.04], [x, y, z], '#b9bec2', 0.3, 0.6);
    this.writing(lines, [x, y, z + 0.022], width, h, '#f4f5f1', ['#2b4fa3', '#2c2f33', '#b23a32']);
    this.box([width * 0.7, 0.03, 0.09], [x, y - h / 2 - 0.06, z + 0.06], '#9da3a7', 0.3, 0.6);
    ['#b23a32', '#2b4fa3', '#2c2f33', '#2f7d4a'].forEach((ink, i) => {
      const pen = this.cylinder(0.011, 0.13, [x - 0.5 + i * 0.12, y - h / 2 - 0.035, z + 0.07], '#f2f2ee'); pen.rotation.z = Math.PI / 2;
      const cap = this.cylinder(0.012, 0.035, [x - 0.565 + i * 0.12, y - h / 2 - 0.035, z + 0.07], ink); cap.rotation.z = Math.PI / 2;
    });
    this.box([0.15, 0.04, 0.06], [x + 0.35, y - h / 2 - 0.025, z + 0.07], '#3a3f45'); this.box([0.15, 0.015, 0.06], [x + 0.35, y - h / 2 - 0.05, z + 0.07], '#d5d0c4');
  }
  /** A desk with a seat behind it, a monitor facing the seat, keyboard and mug. The sitter faces +Z before turning. */
  workstation(x: number, z: number, yaw = 0, top = '#86694d', chair = '#4f5a60', picture = '#5b8a98') {
    this.at(x, z, yaw, () => {
      this.table(x, z, top, 1.6, 0.75);
      this.chair(x, z - 0.75, chair);
      this.screen(x + 0.15, 1.1, z + 0.18, 0.62, picture, Math.PI); this.box([0.06, 0.25, 0.06], [x + 0.15, 0.9, z + 0.22], '#3a3f42'); this.box([0.24, 0.02, 0.18], [x + 0.15, 0.79, z + 0.22], '#3a3f42');
      this.box([0.44, 0.02, 0.14], [x + 0.1, 0.8, z - 0.12], '#2f3336'); this.box([0.07, 0.02, 0.1], [x + 0.42, 0.8, z - 0.12], '#2f3336');
      this.cylinder(0.04, 0.1, [x - 0.55, 0.85, z - 0.05], '#d9d4c8'); this.box([0.3, 0.03, 0.22], [x - 0.45, 0.8, z + 0.15], '#c7bfae');
    });
  }
  bookshelf(x: number, z: number, width = 1.8, height = 2.2, yaw = 0, wood = '#6e5c47') {
    this.at(x, z, yaw, () => {
      // An open carcass (back, sides, top and base) so the books show.
      this.box([width, height, 0.04], [x, height / 2, z - 0.16], wood); this.box([width, 0.05, 0.36], [x, height - 0.025, z], wood); this.box([width, 0.12, 0.36], [x, 0.06, z], wood);
      for (const dx of [-1, 1]) this.box([0.05, height, 0.36], [x + dx * (width / 2 - 0.025), height / 2, z], wood);
      const rows = Math.floor(height / 0.45), books = Math.floor((width - 0.2) / 0.11), palette = ['#9e815c', '#75877b', '#8e6961', '#58687a', '#c2ad83', '#6d5a72'];
      for (let j = 0; j < rows; j++) { this.box([width - 0.08, 0.025, 0.3], [x, 0.2 + j * 0.45, z + 0.04], '#5a4a3a');
        for (let i = 0; i < books; i++) { if ((i * 7 + j * 3) % 11 === 0) continue; const h = 0.24 + ((i * 5 + j) % 4) * 0.035;
          this.box([0.085, h, 0.22], [x - width / 2 + 0.14 + i * 0.11, 0.215 + j * 0.45 + h / 2, z + 0.05], palette[(i + j * 2) % palette.length]); } }
    });
  }
  pendant(x: number, z: number, y = 2.3, color = '#e8d3a8') {
    this.cylinder(0.006, 4.5 - y, [x, (4.5 + y) / 2, z], '#2e2e2c');
    const shade = this.cylinder(0.2, 0.22, [x, y, z], color, 0.08); shade.material = this.material(color, 0.6, 0.2, 0.5);
  }
  clock(x: number, y: number, z: number, yaw = 0) {
    this.at(x, z, yaw, () => {
      const face = this.cylinder(0.24, 0.04, [x, y, z], '#f1eee6'); face.rotation.x = Math.PI / 2;
      const rim = this.cylinder(0.26, 0.03, [x, y, z - 0.01], '#2f3338'); rim.rotation.x = Math.PI / 2;
      const hour = this.box([0.02, 0.12, 0.01], [x + 0.04, y + 0.04, z + 0.025], '#222'); hour.rotation.z = -0.8;
      const minute = this.box([0.014, 0.19, 0.01], [x - 0.02, y + 0.09, z + 0.03], '#222'); minute.rotation.z = 0.25;
    });
  }
  plate(x: number, y: number, z: number) { this.cylinder(0.13, 0.015, [x, y + 0.008, z], '#eeebe2'); this.cylinder(0.035, 0.12, [x + 0.2, y + 0.06, z - 0.1], '#c9dbe0'); }
  lamp(x: number, z: number, height = 1.7) {
    this.cylinder(0.13, 0.035, [x, 0.02, z], '#736552'); this.cylinder(0.018, height, [x, height / 2, z], '#897452');
    const shade = this.cylinder(0.24, 0.3, [x, height, z], '#e1cdaa', 0.17); shade.material = this.material('#e7d1a2', 0.8, 0, 0.6);
  }
  plant(x: number, z: number, height = 1.2) {
    this.cylinder(0.23, 0.4, [x, 0.2, z], '#a57f64', 0.29);
    for (let i = 0; i < 5; i++) { const a = i * 2.4; const leaf = this.ball([0.13, height * 0.4, 0.07], [x + Math.cos(a) * 0.18, height * 0.62, z + Math.sin(a) * 0.18], i % 2 ? '#52674b' : '#728660'); leaf.rotation.z = Math.cos(a) * 0.4; }
  }
  tree(x: number, z: number, height = 5) {
    const radius=height*.3;
    if([...this.waterAreas,...this.plantExclusions].some(a=>x+radius>a.minX&&x-radius<a.maxX&&z+radius>a.minZ&&z-radius<a.maxZ))return;
    this.plantingSites.push({x,z,radius});this.group.userData.plantingSites=this.plantingSites;
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
    this.waterAreas.push({minX:-width/2,maxX:width/2,minZ:z-depth/2,maxZ:z+depth/2});this.group.userData.waterAreas=this.waterAreas;
    const m = this.box([width, 0.025, depth], [0, 0.0125, z], color, 0.16, 0.3); m.castShadow = false;
    const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const g=canvas.getContext('2d')!,data=g.createImageData(256,256);
    for(let y=0;y<256;y++)for(let x=0;x<256;x++){const i=(y*256+x)*4;data.data[i]=128+Math.round(Math.sin((x+y*.4)*.14)*12);data.data[i+1]=128+Math.round(Math.cos((y-x*.2)*.18)*9);data.data[i+2]=254;data.data[i+3]=255;}
    g.putImageData(data,0,0);const normal=new THREE.CanvasTexture(canvas);normal.wrapS=normal.wrapT=THREE.RepeatWrapping;normal.repeat.set(width/4,depth/4);normal.anisotropy=4;
    (m.material as THREE.MeshStandardMaterial).normalMap=normal;(m.material as THREE.MeshStandardMaterial).normalScale.set(.4,.4);
    for (let i = 0; i < 8; i++) { const ripple = this.box([width * 0.8, 0.006, 0.025], [Math.sin(i) * width * 0.08, 0.028, z - depth * 0.4 + i * depth * 0.1], '#a7c8c4', 0.2); ripple.castShadow = false; }
  }
}
