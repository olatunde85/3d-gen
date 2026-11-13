/**
 * Shared scenery for the arcade scenes: a gradient sky dome with sun glow and night stars, a distant silhouette ring
 * (peaks, skylines, palms, canopy or a smoking volcano) that blends into the fog, and animated water and lava. The
 * dome and ring follow the camera, so they cost two draw calls whatever the scene size.
 */
import * as T from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type Part = [T.BufferGeometry, string];
/** Merge primitives into one geometry with painted vertex colours, so a prop draws with one shared material. */
export function painted(parts: Part[]) {
  const geometries = parts.map(([g, color]) => {
    const flat = g.index ? g.toNonIndexed() : g, c = new T.Color(color), n = flat.getAttribute('position').count, colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.toArray(colors, i * 3);
    flat.setAttribute('color', new T.BufferAttribute(colors, 3));flat.deleteAttribute('uv');if (flat !== g) g.dispose();return flat;
  });
  const merged = mergeGeometries(geometries)!;geometries.forEach((g) => g.dispose());return merged;
}
export const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0) => new T.BoxGeometry(w, h, d).translate(x, y, z);
export const cyl = (top: number, bottom: number, h: number, seg: number, x = 0, y = 0, z = 0) => new T.CylinderGeometry(top, bottom, h, seg).translate(x, y, z);
export const cone = (r: number, h: number, seg: number, x = 0, y = 0, z = 0) => new T.ConeGeometry(r, h, seg).translate(x, y, z);
export const ball = (r: number, x = 0, y = 0, z = 0, detail = 0) => new T.IcosahedronGeometry(r, detail).translate(x, y, z);

/** A small seeded generator for repeatable scenery. */
export function rng(seed: number) { let a = seed >>> 0 || 1;return () => { a = (a * 16807) % 2147483647;return a / 2147483647; }; }

export function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, repeat = true, srgb = true) {
  const canvas = document.createElement('canvas');canvas.width = w;canvas.height = h;draw(canvas.getContext('2d')!);
  const texture = new T.CanvasTexture(canvas);if (srgb) texture.colorSpace = T.SRGBColorSpace;texture.anisotropy = 4;
  if (repeat) texture.wrapS = texture.wrapT = T.RepeatWrapping;return texture;
}

export type Horizon = 'none' | 'hills' | 'peaks' | 'mountains' | 'skyline' | 'palms' | 'canopy' | 'pines' | 'volcano' | 'dunes' | 'mesas';
export interface SkyStyle { horizon: string; zenith: string; ground?: string; sun?: T.Vector3; sunColor?: string; stars?: number; silhouette: Horizon; tint?: string; lit?: boolean }

/** Silhouettes drawn in two layers: a hazy far range and a nearer, darker one. */
function silhouetteTexture(kind: Horizon, horizon: T.Color, tint: T.Color, lit: boolean) {
  const W = 2048, H = 256, random = rng(kind.length * 977 + 13), far = horizon.clone().lerp(tint, 0.35), near = horizon.clone().lerp(tint, 0.7);
  return canvasTexture(W, H, (c) => {
    c.clearRect(0, 0, W, H);
    const ridge = (color: T.Color, base: number, amp: number, rough: number, seed: number, jag = false) => {
      c.fillStyle = `#${color.getHexString()}`;c.beginPath();c.moveTo(0, H);
      for (let x = 0; x <= W; x += 8) {
        const t = (x / W) * Math.PI * 2;let y = base + amp * (0.55 * Math.sin(t * 3 + seed) + 0.3 * Math.sin(t * 7 + seed * 2.1) + rough * Math.sin(t * 23 + seed * 3.7));
        if (jag) y += amp * 0.5 * Math.abs(Math.sin(t * 11 + seed)) ** 3;
        c.lineTo(x, H - Math.max(4, y));
      }
      c.lineTo(W, H);c.fill();
    };
    const towers = (color: T.Color, count: number, minH: number, maxH: number, windows: boolean) => {
      for (let i = 0; i < count; i++) {
        const w = 18 + random() * 46, h = minH + random() ** 1.6 * (maxH - minH), x = random() * W;
        c.fillStyle = `#${color.getHexString()}`;c.fillRect(x, H - h, w, h);if (random() < 0.25) c.fillRect(x + w * 0.4, H - h - 18, 3, 18);
        if (windows) for (let wy = H - h + 6; wy < H - 6; wy += 7) for (let wx = x + 4; wx < x + w - 4; wx += 6) if (random() < 0.32) { c.fillStyle = random() < 0.8 ? '#ffd890' : '#9fe7ff';c.fillRect(wx, wy, 2, 3); }
      }
    };
    const trees = (color: T.Color, count: number, pine: boolean) => {
      c.fillStyle = `#${color.getHexString()}`;
      for (let i = 0; i < count; i++) {
        const x = random() * W, h = 26 + random() * 40, w = h * (pine ? 0.32 : 0.8);
        if (pine) { c.beginPath();c.moveTo(x - w / 2, H - 20);c.lineTo(x, H - 20 - h);c.lineTo(x + w / 2, H - 20);c.fill(); }
        else { c.beginPath();c.ellipse(x, H - 26 - h * 0.5, w / 2, h * 0.45, 0, 0, Math.PI * 2);c.fill(); }
      }
      c.fillRect(0, H - 22, W, 22);
    };
    if (kind === 'hills') { ridge(far, 46, 22, 0.1, 1);ridge(near, 26, 14, 0.12, 4); }
    if (kind === 'mountains') { ridge(far, 90, 55, 0.15, 2, true);ridge(near, 46, 30, 0.2, 5, true); }
    if (kind === 'peaks') {
      ridge(far, 110, 70, 0.2, 3, true);
      // Snow caps: the upper band of the far range is repainted white.
      const img = c.getImageData(0, 0, W, H);for (let x = 0; x < W; x++) { let top = -1;for (let y = 0; y < H; y++) if (img.data[(y * W + x) * 4 + 3] > 0) { top = y;break; } if (top < 0) continue;const depth = 18 + 14 * Math.sin(x * 0.05);for (let y = top; y < Math.min(H, top + depth) && y < H - 110; y++) { const k = (y * W + x) * 4;img.data[k] = 238;img.data[k + 1] = 244;img.data[k + 2] = 250; } }
      c.putImageData(img, 0, 0);ridge(near, 50, 32, 0.25, 6, true);
    }
    if (kind === 'skyline') { towers(far, 70, 40, 190, lit);towers(near, 45, 20, 110, lit); }
    if (kind === 'palms') {
      ridge(far, 26, 16, 0.08, 7);c.fillStyle = `#${near.getHexString()}`;
      for (let i = 0; i < 26; i++) {
        const x = random() * W, h = 50 + random() * 40, lean = (random() - 0.5) * 30;c.lineWidth = 4;c.strokeStyle = c.fillStyle;c.beginPath();c.moveTo(x, H - 18);c.quadraticCurveTo(x + lean * 0.3, H - 18 - h * 0.6, x + lean, H - 18 - h);c.stroke();
        for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2;c.beginPath();c.ellipse(x + lean + Math.cos(a) * 14, H - 18 - h + Math.sin(a) * 5 + 4, 16, 3.5, a, 0, Math.PI * 2);c.fill(); }
      }
      c.fillRect(0, H - 20, W, 20);
    }
    if (kind === 'canopy') { ridge(far, 70, 30, 0.35, 8);trees(near, 160, false); }
    if (kind === 'pines') { ridge(far, 60, 30, 0.2, 9, true);trees(near, 260, true); }
    if (kind === 'dunes') { ridge(far, 40, 26, 0.04, 10);ridge(near, 22, 12, 0.03, 11); }
    if (kind === 'mesas') { c.fillStyle = `#${far.getHexString()}`;for (let i = 0; i < 9; i++) { const x = random() * W, w = 90 + random() * 200, h = 60 + random() * 70;c.beginPath();c.moveTo(x - 20, H);c.lineTo(x, H - h);c.lineTo(x + w, H - h);c.lineTo(x + w + 20, H);c.fill(); } ridge(near, 22, 10, 0.05, 12); }
    if (kind === 'volcano') {
      ridge(far, 50, 30, 0.2, 13, true);c.fillStyle = `#${near.getHexString()}`;
      for (const [cx, w, h] of [[W * 0.25, 520, 200], [W * 0.75, 380, 150]]) {
        c.beginPath();c.moveTo(cx - w / 2, H);c.quadraticCurveTo(cx - w * 0.12, H - h * 0.7, cx - w * 0.07, H - h);c.lineTo(cx + w * 0.07, H - h);c.quadraticCurveTo(cx + w * 0.12, H - h * 0.7, cx + w / 2, H);c.fill();
        const glow = c.createRadialGradient(cx, H - h, 2, cx, H - h, 46);glow.addColorStop(0, 'rgba(255,150,60,0.95)');glow.addColorStop(1, 'rgba(255,90,30,0)');c.fillStyle = glow;c.fillRect(cx - 50, H - h - 46, 100, 70);
        for (let k = 0; k < 4; k++) { c.strokeStyle = 'rgba(255,120,40,0.85)';c.lineWidth = 3;c.beginPath();c.moveTo(cx + (random() - 0.5) * 20, H - h + 4);c.quadraticCurveTo(cx + (random() - 0.5) * w * 0.3, H - h * 0.5, cx + (random() - 0.5) * w * 0.5, H - 6);c.stroke(); }
        c.fillStyle = `#${near.getHexString()}`;
      }
    }
  }, true);
}

/**
 * The sky: a gradient dome drawn behind everything, plus a ring of distant silhouettes. Both follow the camera; the
 * dome's horizon matches the fog colour so the land fades into it.
 */
export class Sky {
  readonly group = new T.Group(); private dome: T.Mesh; private ring?: T.Mesh; private material: T.ShaderMaterial; private texture?: T.Texture;
  constructor(style: SkyStyle, private radius: number) {
    const horizon = new T.Color(style.horizon), zenith = new T.Color(style.zenith), ground = new T.Color(style.ground ?? style.horizon);
    this.material = new T.ShaderMaterial({
      uniforms: { zenith: { value: zenith }, horizon: { value: horizon }, ground: { value: ground }, sunDir: { value: (style.sun ?? new T.Vector3(-0.5, 0.45, 0.4)).clone().normalize() }, sunColor: { value: new T.Color(style.sunColor ?? '#fff1d0') }, stars: { value: style.stars ?? 0 } },
      vertexShader: 'varying vec3 vDir;void main(){vDir=normalize(position);vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_Position=p.xyww;}',
      fragmentShader: `uniform vec3 zenith;uniform vec3 horizon;uniform vec3 ground;uniform vec3 sunDir;uniform vec3 sunColor;uniform float stars;varying vec3 vDir;
        float hash(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453);}
        void main(){vec3 d=normalize(vDir);float h=d.y;vec3 c=h>0.0?mix(horizon,zenith,pow(smoothstep(0.0,1.0,h),0.55)):mix(horizon,ground,smoothstep(0.0,0.12,-h));
        float s=max(dot(d,sunDir),0.0);c+=sunColor*(pow(s,900.0)*2.0+pow(s,12.0)*0.22);
        if(stars>0.0){vec3 q=floor(d*420.0);float st=step(0.9975,hash(q))*smoothstep(0.06,0.35,h);c+=vec3(st*stars*(0.55+0.45*hash(q+3.1)));}
        gl_FragColor=vec4(c,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`,
      side: T.BackSide, depthWrite: false, fog: false,
    });
    this.dome = new T.Mesh(new T.SphereGeometry(10, 32, 16), this.material);this.dome.frustumCulled = false;this.dome.renderOrder = -10;this.group.add(this.dome);
    if (style.silhouette !== 'none') {
      this.texture = silhouetteTexture(style.silhouette, horizon, new T.Color(style.tint ?? '#3a4650'), !!style.lit);this.texture.repeat.set(2, 1);this.texture.wrapT = T.ClampToEdgeWrapping;
      const material = new T.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false, fog: false, side: T.BackSide, toneMapped: true });
      this.ring = new T.Mesh(new T.CylinderGeometry(1, 1, 1, 64, 1, true).translate(0, 0.5, 0), material);this.ring.frustumCulled = false;this.ring.renderOrder = -5;this.group.add(this.ring);
    }
  }
  /** Keep the sky centred on the camera; the ring sits on the horizon line. */
  update(camera: T.Camera, ground = 0) {
    this.dome.position.copy(camera.position);
    if (this.ring) { const r = this.radius;this.ring.position.set(camera.position.x, ground - r * 0.035, camera.position.z);this.ring.scale.set(r, r * 0.2, r); }
  }
  dispose() { this.dome.geometry.dispose();this.material.dispose();if (this.ring) { this.ring.geometry.dispose();(this.ring.material as T.Material).dispose(); } this.texture?.dispose();this.group.removeFromParent(); }
}

/** A tileable ripple normal map for water. */
export function rippleNormals() {
  const N = 128, heights = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const u = (x / N) * Math.PI * 2, v = (y / N) * Math.PI * 2;heights[y * N + x] = Math.sin(u * 3 + v * 2) * 0.5 + Math.sin(u * 5 - v * 4 + 1.3) * 0.3 + Math.sin(u * 9 + v * 7 + 2.1) * 0.18 + Math.sin(u * 2 - v * 11) * 0.12; }
  return canvasTexture(N, N, (c) => {
    const img = c.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const hx = heights[y * N + ((x + 1) % N)] - heights[y * N + ((x - 1 + N) % N)], hy = heights[((y + 1) % N) * N + x] - heights[((y - 1 + N) % N) * N + x];
      const nx = -hx * 1.6, ny = -hy * 1.6, l = Math.hypot(nx, ny, 1), k = (y * N + x) * 4;img.data.set([((nx / l) * 0.5 + 0.5) * 255, ((ny / l) * 0.5 + 0.5) * 255, ((1 / l) * 0.5 + 0.5) * 255, 255], k);
    }
    c.putImageData(img, 0, 0);
  }, true, false);
}
/** Glossy water with drifting ripples; call `flow` each frame. */
export function waterMaterial(color: string, repeat = 60) {
  const normalMap = rippleNormals();normalMap.repeat.set(repeat, repeat);
  const material = new T.MeshStandardMaterial({ color, roughness: 0.12, metalness: 0.15, normalMap, normalScale: new T.Vector2(0.55, 0.55), envMapIntensity: 1.2 });
  return { material, flow: (time: number) => { normalMap.offset.set(time * 0.012, time * 0.02); }, dispose: () => { normalMap.dispose();material.dispose(); } };
}
/** Glowing lava with dark crust plates that drift; it lights itself and ignores the scene lights. */
export function lavaMaterial(repeat = 40) {
  const random = rng(77), map = canvasTexture(256, 256, (c) => {
    const g = c.createLinearGradient(0, 0, 256, 256);g.addColorStop(0, '#ff6a1a');g.addColorStop(0.5, '#ffb12e');g.addColorStop(1, '#ff4d12');c.fillStyle = g;c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 60; i++) {
      const x = random() * 256, y = random() * 256, r = 10 + random() * 26;c.fillStyle = random() < 0.5 ? '#2a130c' : '#3a1a0e';
      for (const [dx, dy] of [[0, 0], [256, 0], [-256, 0], [0, 256], [0, -256]]) { c.beginPath();c.ellipse(x + dx, y + dy, r, r * (0.6 + random() * 0.4), random() * 3, 0, Math.PI * 2);c.fill(); }
    }
  });
  map.repeat.set(repeat, repeat);const material = new T.MeshBasicMaterial({ map, toneMapped: false });
  return { material, flow: (time: number) => { map.offset.set(time * 0.01, time * 0.015); }, dispose: () => { map.dispose();material.dispose(); } };
}
