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

/**
 * Falling rain streaks or blowing dust in a box around the camera. Each drop keeps a fixed place in the world and
 * wraps to the far side of the box as the camera passes, so speed reads correctly; one draw call, no allocation.
 */
export class Precipitation {
  readonly object: T.LineSegments | T.Points;
  private seeds: Float32Array; private positions: Float32Array;
  constructor(readonly kind: 'rain' | 'sandstorm', private count = kind === 'rain' ? 900 : 520, private box = kind === 'rain' ? 46 : 54, private height = 22) {
    this.seeds = new Float32Array(count * 3);for (let i = 0; i < this.seeds.length; i++) { const v = Math.sin(i * 12.9898 + 78.233) * 43758.5453;this.seeds[i] = v - Math.floor(v); }
    const geometry = new T.BufferGeometry();
    if (kind === 'rain') {
      this.positions = new Float32Array(count * 6);geometry.setAttribute('position', new T.BufferAttribute(this.positions, 3));
      this.object = new T.LineSegments(geometry, new T.LineBasicMaterial({ color: '#c9d6e2', transparent: true, opacity: 0.42, depthWrite: false }));
    } else {
      this.positions = new Float32Array(count * 3);geometry.setAttribute('position', new T.BufferAttribute(this.positions, 3));
      this.object = new T.Points(geometry, new T.PointsMaterial({ color: '#d8b68a', size: 0.14, transparent: true, opacity: 0.55, depthWrite: false }));
    }
    this.object.frustumCulled = false;this.object.renderOrder = 2;
  }
  update(time: number, camera: T.Vector3) {
    const { box, height, seeds, positions } = this, wrap = (v: number, centre: number) => v + box * Math.round((centre - v) / box);
    for (let i = 0; i < this.count; i++) {
      const sx = seeds[i * 3] * box, sy = seeds[i * 3 + 1], sz = seeds[i * 3 + 2] * box;
      if (this.kind === 'rain') {
        const x = wrap(sx - time * 2.5, camera.x), z = wrap(sz, camera.z), y = camera.y - height * 0.35 + ((((sy * height - time * 15) % height) + height) % height);
        const k = i * 6;positions[k] = x;positions[k + 1] = y;positions[k + 2] = z;positions[k + 3] = x + 0.05;positions[k + 4] = y - 0.75;positions[k + 5] = z;
      } else {
        const x = wrap(sx + time * 11, camera.x), z = wrap(sz + time * 3, camera.z), y = Math.max(0.1, camera.y - 2 + sy * 7 + Math.sin(time * 1.7 + i) * 0.4);
        positions[i * 3] = x;positions[i * 3 + 1] = y;positions[i * 3 + 2] = z;
      }
    }
    (this.object.geometry.getAttribute('position') as T.BufferAttribute).needsUpdate = true;
  }
  dispose() { this.object.geometry.dispose();(this.object.material as T.Material).dispose();this.object.removeFromParent(); }
}
