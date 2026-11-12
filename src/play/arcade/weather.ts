/**
 * Time of day and weather for the arcade scenes. Races and runs read the chapter's atmosphere setting and tint the
 * theme's sky, fog and lights from it. Every effect is cheap on phones: no extra real-time lights, one batched mesh
 * for rain or dust that wraps around the camera, and additive decals for lamp and headlight pools.
 */
import * as T from 'three';
import type { EnvironmentSettings } from '../environment';

export type ArcadeAtmosphere = Pick<EnvironmentSettings, 'time' | 'weather'>;
export interface SkyLook {
  sky: T.Color; fog: [number, number];
  /** Multipliers for the scene's own sun, hemisphere and reflection strengths. */
  sun: number; hemi: number; env: number;
  sunColor: string; hemiSky: string; hemiGround?: string;
  /** Headlamp and track lamp level, 0..1. */
  lamps: number; wet: boolean; night: boolean;
}

export function skyLook(base: { sky: string; fog: readonly [number, number] }, e: ArcadeAtmosphere = { time: 'day', weather: 'clear' }): SkyLook {
  const sky = new T.Color(base.sky), tint = (c: string, k: number) => sky.lerp(new T.Color(c), k), night = e.time === 'night';
  let [near, far] = base.fog, sun = 1, hemi = 1, env = 1, lamps = 0, sunColor = '#fff0d6', hemiSky = '#fff6e8', hemiGround: string | undefined;
  if (e.time === 'dawn') { tint('#e9b8a0', 0.5);sun = 0.75;hemi = 0.85;env = 0.7;sunColor = '#ffc597';hemiSky = '#f7dccb';lamps = 0.3; }
  if (e.time === 'dusk') { tint('#c9764d', 0.55);sun = 0.6;hemi = 0.72;env = 0.5;sunColor = '#ff9b5e';hemiSky = '#f3c6a8';lamps = 0.7; }
  if (night) { sky.set('#0c1424');sun = 0.3;hemi = 0.36;env = 0.12;sunColor = '#a3b9e8';hemiSky = '#7d92c4';hemiGround = '#15171c';lamps = 1;near *= 0.7;far *= 0.75; }
  if (e.weather === 'rain') { tint(night ? '#121822' : '#7e8992', 0.6);sun *= 0.4;hemi *= 0.85;near *= 0.5;far *= 0.55;lamps = Math.max(lamps, 0.4); }
  if (e.weather === 'fog') { tint(night ? '#1b2129' : '#c7cdd0', 0.7);sun *= 0.55;near *= 0.22;far *= 0.38;lamps = Math.max(lamps, 0.5); }
  if (e.weather === 'sandstorm') { tint(night ? '#33281c' : '#c39b68', 0.75);sun *= 0.55;sunColor = night ? sunColor : '#ffc98f';near *= 0.18;far *= 0.32;lamps = Math.max(lamps, 0.4); }
  return { sky, fog: [near, far], sun, hemi, env, sunColor, hemiSky, hemiGround, lamps, wet: e.weather === 'rain', night };
}

/** Apply a look to a scene's background, fog and its two lights, given their daytime strengths. */
export function applyLook(look: SkyLook, scene: T.Scene, hemi: T.HemisphereLight, sun: T.DirectionalLight, base: { hemi: number; sun: number; env: number }) {
  scene.background = look.sky.clone();scene.fog = new T.Fog(look.sky.clone(), look.fog[0], look.fog[1]);
  hemi.intensity = base.hemi * look.hemi;hemi.color.set(look.hemiSky);if (look.hemiGround) hemi.groundColor.set(look.hemiGround);
  sun.intensity = base.sun * look.sun;sun.color.set(look.sunColor);scene.environmentIntensity = base.env * look.env;
}

/** A soft round light pool texture for additive decals. */
export function poolTexture() {
  const canvas = document.createElement('canvas');canvas.width = canvas.height = 64;const c = canvas.getContext('2d')!, g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');g.addColorStop(0.45, 'rgba(255,255,255,.45)');g.addColorStop(1, 'rgba(255,255,255,0)');c.fillStyle = g;c.fillRect(0, 0, 64, 64);
  const texture = new T.CanvasTexture(canvas);texture.colorSpace = T.SRGBColorSpace;return texture;
}
/** An additive material for light decals laid on the road. */
export const glowMaterial = (map: T.Texture, color: string, opacity: number) => new T.MeshBasicMaterial({ map, color, transparent: true, opacity, blending: T.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

export type Particles = 'rain' | 'sandstorm' | 'snow' | 'embers' | 'fireflies';
const PARTICLES: Record<Particles, { count: number; box: number; color: string; opacity: number; additive?: boolean }> = {
  rain: { count: 900, box: 46, color: '#c9d6e2', opacity: 0.42 }, sandstorm: { count: 520, box: 54, color: '#e2c497', opacity: 0.38 },
  snow: { count: 700, box: 40, color: '#ffffff', opacity: 0.85 }, embers: { count: 260, box: 40, color: '#ff9a3c', opacity: 0.9, additive: true },
  fireflies: { count: 120, box: 36, color: '#d8ff7a', opacity: 0.9, additive: true },
};
/**
 * Falling rain streaks, blowing dust, drifting snow, rising embers or fireflies in a box around the camera. Each drop keeps a fixed place in the world and
 * wraps to the far side of the box as the camera passes, so speed reads correctly; one draw call, no allocation.
 */
export class Precipitation {
  readonly object: T.LineSegments;
  private seeds: Float32Array; private positions: Float32Array;
  private count: number; private box: number;
  constructor(readonly kind: Particles, private height = 22) {
    const look = PARTICLES[kind];this.count = look.count;this.box = look.box;
    this.seeds = new Float32Array(this.count * 3);for (let i = 0; i < this.seeds.length; i++) { const v = Math.sin(i * 12.9898 + 78.233) * 43758.5453;this.seeds[i] = v - Math.floor(v); }
    // Everything is drawn as short line streaks: point sprites break up into coloured specks on some phone graphics
    // chips. Snowflakes are short crosses, so they read as flakes from any side.
    const geometry = new T.BufferGeometry();this.positions = new Float32Array(this.count * (kind === 'snow' ? 12 : 6));geometry.setAttribute('position', new T.BufferAttribute(this.positions, 3));
    this.object = new T.LineSegments(geometry, new T.LineBasicMaterial({ color: look.color, transparent: true, opacity: look.opacity, depthWrite: false, ...(look.additive ? { blending: T.AdditiveBlending, fog: false } : {}) }));
    this.object.frustumCulled = false;this.object.renderOrder = 2;
  }
  update(time: number, camera: T.Vector3) {
    const { box, height, seeds, positions } = this, wrap = (v: number, centre: number) => v + box * Math.round((centre - v) / box);
    for (let i = 0; i < this.count; i++) {
      const sx = seeds[i * 3] * box, sy = seeds[i * 3 + 1], sz = seeds[i * 3 + 2] * box;
      if (this.kind === 'rain') {
        const x = wrap(sx - time * 2.5, camera.x), z = wrap(sz, camera.z), y = camera.y - height * 0.35 + ((((sy * height - time * 15) % height) + height) % height);
        const k = i * 6;positions[k] = x;positions[k + 1] = y;positions[k + 2] = z;positions[k + 3] = x + 0.05;positions[k + 4] = y - 0.75;positions[k + 5] = z;
      } else if (this.kind === 'snow') {
        const sway = Math.sin(time * 1.3 + i * 0.7) * 0.6, x = wrap(sx + time * 0.8 + sway, camera.x), z = wrap(sz + Math.cos(time * 0.9 + i) * 0.4, camera.z), y = camera.y - height * 0.35 + ((((sy * height - time * 1.6) % height) + height) % height);
        const k = i * 12, r = 0.05;positions.set([x - r, y, z, x + r, y, z, x, y - r, z - r * 0.5, x, y + r, z + r * 0.5], k);
      } else if (this.kind === 'embers') {
        const x = wrap(sx + Math.sin(time * 0.8 + i) * 1.5 + time * 0.6, camera.x), z = wrap(sz + Math.cos(time * 0.6 + i * 1.3), camera.z), y = camera.y - 3 + ((((sy * 14 + time * 2.2) % 14) + 14) % 14);
        const k = i * 6;positions[k] = x;positions[k + 1] = y;positions[k + 2] = z;positions[k + 3] = x + 0.03;positions[k + 4] = y + 0.12;positions[k + 5] = z;
      } else if (this.kind === 'fireflies') {
        const blink = Math.sin(time * 2 + i * 2.3) > 0.2 ? 1 : 0, x = wrap(sx + Math.sin(time * 0.5 + i) * 1.2, camera.x), z = wrap(sz + Math.cos(time * 0.4 + i * 1.7) * 1.2, camera.z), y = Math.max(0.3, camera.y - 1.5 + sy * 3.5 + Math.sin(time * 0.9 + i) * 0.3);
        const k = i * 6, r = 0.05 * blink;positions[k] = x - r;positions[k + 1] = y;positions[k + 2] = z;positions[k + 3] = x + r;positions[k + 4] = y + r;positions[k + 5] = z;
      } else {
        const x = wrap(sx + time * 11, camera.x), z = wrap(sz + time * 3, camera.z), y = Math.max(0.3, camera.y - 2 + sy * 7 + Math.sin(time * 1.7 + i) * 0.4);
        const k = i * 6;positions[k] = x;positions[k + 1] = y;positions[k + 2] = z;positions[k + 3] = x - 0.55;positions[k + 4] = y + 0.02;positions[k + 5] = z - 0.15;
      }
    }
    (this.object.geometry.getAttribute('position') as T.BufferAttribute).needsUpdate = true;
  }
  dispose() { this.object.geometry.dispose();(this.object.material as T.Material).dispose();this.object.removeFromParent(); }
}
