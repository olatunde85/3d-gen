/**
 * Small 3D models for the objects a runner finds, built from a few primitives each with shared materials. A found
 * object floats and turns above the path inside a soft beam of light, so it can be spotted down a long straight.
 */
import * as T from 'three';
import type { RunnerObjectType } from './objects';

type Materials = Record<'paper' | 'manila' | 'leather' | 'brass' | 'gold' | 'steel' | 'wood' | 'red' | 'jade' | 'glass' | 'gem' | 'dark' | 'ivory', T.Material>;

export function objectMaterials(): Materials {
  const m = (color: string, roughness: number, metalness = 0, extra: T.MeshStandardMaterialParameters = {}) => new T.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  return {
    paper: m('#efe6cf', 0.9), manila: m('#d6ad5c', 0.85), leather: m('#6e3f22', 0.7), brass: m('#c9a043', 0.35, 0.8), gold: m('#f0bf2e', 0.25, 1, { emissive: '#3a2a04' }),
    steel: m('#d5dade', 0.25, 0.9), wood: m('#7b5232', 0.8), red: m('#b8322c', 0.6), jade: m('#2f9e70', 0.35, 0.1), glass: m('#bfe4f2', 0.05, 0, { transparent: true, opacity: 0.45 }),
    gem: m('#38b6ea', 0.15, 0.2, { emissive: '#0b3a52', flatShading: true }), dark: m('#24201c', 0.8), ivory: m('#ebe2cc', 0.8),
  };
}

const mesh = (g: T.BufferGeometry, m: T.Material, x = 0, y = 0, z = 0) => { const o = new T.Mesh(g, m);o.position.set(x, y, z);o.castShadow = true;return o; };
const box = (w: number, h: number, d: number) => new T.BoxGeometry(w, h, d);
const rod = (r: number, len: number, seg = 10) => new T.CylinderGeometry(r, r, len, seg);

/** Each model stands about 0.5 m tall around its own centre, facing +Z. */
const BUILD: Record<RunnerObjectType, (m: Materials) => T.Object3D[]> = {
  dossier: (m) => [mesh(box(0.42, 0.55, 0.05), m.manila), mesh(box(0.37, 0.5, 0.03), m.paper, 0.03, 0.05, 0.01), mesh(box(0.43, 0.07, 0.06), m.red, 0, -0.08), mesh(box(0.16, 0.05, 0.062), m.dark, 0, 0.12)],
  letter: (m) => {
    const flap = mesh(new T.CylinderGeometry(0.31, 0.31, 0.035, 3).rotateX(Math.PI / 2), m.manila, 0, 0.06, 0.008);flap.scale.set(1, 0.55, 1);
    return [mesh(box(0.55, 0.36, 0.03), m.paper), flap, mesh(rod(0.055, 0.03, 14).rotateX(Math.PI / 2), m.red, 0, -0.04, 0.03)];
  },
  map: (m) => [mesh(box(0.5, 0.42, 0.012), m.manila), ...[0.22, -0.22].map((y) => mesh(rod(0.04, 0.58).rotateZ(Math.PI / 2), m.wood, 0, y)), mesh(box(0.06, 0.012, 0.016).rotateZ(Math.PI / 4), m.red, 0.08, 0.02, 0.01), mesh(box(0.06, 0.012, 0.016).rotateZ(-Math.PI / 4), m.red, 0.08, 0.02, 0.01)],
  journal: (m) => [mesh(box(0.4, 0.52, 0.1), m.leather), mesh(box(0.36, 0.48, 0.085), m.ivory, 0.03), mesh(box(0.05, 0.53, 0.105), m.brass, -0.12)],
  magnifier: (m) => [mesh(new T.TorusGeometry(0.18, 0.028, 10, 32), m.brass, 0, 0.1), mesh(rod(0.17, 0.012, 28).rotateX(Math.PI / 2), m.glass, 0, 0.1), mesh(rod(0.032, 0.28).rotateZ(0.5), m.wood, 0.12, -0.2)],
  key: (m) => [mesh(new T.TorusGeometry(0.09, 0.024, 8, 24), m.brass, 0, 0.2), mesh(rod(0.024, 0.4), m.brass, 0, -0.08), mesh(box(0.09, 0.04, 0.03), m.brass, 0.045, -0.24), mesh(box(0.07, 0.035, 0.03), m.brass, 0.035, -0.16)],
  compass: (m) => [mesh(rod(0.2, 0.06, 28).rotateX(Math.PI / 2), m.brass), mesh(rod(0.17, 0.065, 28).rotateX(Math.PI / 2), m.ivory, 0, 0, 0.003), mesh(box(0.025, 0.26, 0.07).rotateZ(Math.PI / 5), m.red, 0, 0, 0.004), mesh(new T.TorusGeometry(0.045, 0.014, 6, 16), m.brass, 0, 0.23)],
  dagger: (m) => {
    const blade = mesh(new T.CylinderGeometry(0, 0.065, 0.42, 4).rotateY(Math.PI / 4), m.steel, 0, 0.13);blade.scale.z = 0.25;
    return [blade, mesh(box(0.26, 0.04, 0.05), m.gold, 0, -0.09), mesh(rod(0.028, 0.16), m.leather, 0, -0.19), mesh(new T.SphereGeometry(0.045, 12, 8), m.gold, 0, -0.29), mesh(new T.OctahedronGeometry(0.03), m.red, 0, -0.09, 0.03)];
  },
  figurine: (m) => [mesh(box(0.26, 0.06, 0.26), m.dark, 0, -0.25), mesh(new T.CylinderGeometry(0.075, 0.12, 0.3, 12), m.gold, 0, -0.07), mesh(new T.SphereGeometry(0.09, 14, 10), m.gold, 0, 0.16), mesh(new T.ConeGeometry(0.1, 0.1, 12), m.gold, 0, 0.27), ...[-1, 1].map((s) => mesh(rod(0.025, 0.16).rotateZ(s * 0.6), m.gold, s * 0.11, -0.02))],
  mask: (m) => {
    const face = mesh(new T.SphereGeometry(0.22, 18, 12, 0, Math.PI), m.wood);face.scale.set(1, 1.35, 0.55);(face.material as T.Material).side = T.DoubleSide;
    return [face, ...[-1, 1].map((s) => mesh(new T.SphereGeometry(0.045, 10, 6), m.dark, s * 0.08, 0.06, 0.1)), mesh(box(0.1, 0.025, 0.04), m.dark, 0, -0.14, 0.1), ...[-1, 1].map((s) => mesh(box(0.025, 0.14, 0.03), m.red, s * 0.14, -0.04, 0.07)), mesh(box(0.025, 0.12, 0.03), m.ivory, 0, 0.2, 0.09)];
  },
  amulet: (m) => [mesh(new T.TorusGeometry(0.14, 0.03, 10, 28), m.gold), mesh(new T.OctahedronGeometry(0.1), m.red), mesh(new T.TorusGeometry(0.2, 0.01, 6, 28, Math.PI), m.gold, 0, 0.14)],
  gem: (m) => { const g = mesh(new T.OctahedronGeometry(0.22), m.gem);g.scale.y = 1.35;return [g]; },
  crown: (m) => {
    const band = mesh(new T.CylinderGeometry(0.2, 0.18, 0.14, 20, 1, true), m.gold, 0, -0.08);(band.material as T.Material).side = T.DoubleSide;
    return [band, ...Array.from({ length: 5 }, (_, i) => { const a = (i / 5) * Math.PI * 2;return mesh(new T.ConeGeometry(0.045, 0.14, 6), m.gold, Math.sin(a) * 0.19, 0.06, Math.cos(a) * 0.19); }), ...[0, 2, 4].map((i) => { const a = ((i + 0.5) / 5) * Math.PI * 2;return mesh(new T.OctahedronGeometry(0.03), i ? m.gem : m.red, Math.sin(a) * 0.2, -0.08, Math.cos(a) * 0.2); })];
  },
  chest: (m) => [mesh(box(0.5, 0.26, 0.32), m.wood, 0, -0.1), mesh(new T.CylinderGeometry(0.16, 0.16, 0.5, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), m.wood, 0, 0.03), ...[-0.17, 0.17].map((x) => mesh(box(0.05, 0.28, 0.33), m.brass, x, -0.1)), ...[-0.17, 0.17].map((x) => mesh(new T.CylinderGeometry(0.165, 0.165, 0.05, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), m.brass, x, 0.03)), mesh(box(0.08, 0.1, 0.03), m.gold, 0, -0.02, 0.17)],
  hourglass: (m) => [...[0.25, -0.25].map((y) => mesh(rod(0.17, 0.04, 16), m.wood, 0, y)), mesh(new T.CylinderGeometry(0.13, 0.02, 0.23, 14).translate(0, 0.115, 0), m.glass), mesh(new T.CylinderGeometry(0.02, 0.13, 0.23, 14).translate(0, -0.115, 0), m.glass), mesh(new T.ConeGeometry(0.09, 0.09, 14), m.manila, 0, -0.19), ...[0, 1, 2].map((i) => { const a = (i / 3) * Math.PI * 2 + 0.5;return mesh(rod(0.015, 0.48, 6), m.wood, Math.sin(a) * 0.15, 0, Math.cos(a) * 0.15); })],
};

/** One model, scaled up a little so it reads at running speed. */
export function objectModel(type: RunnerObjectType, materials: Materials) {
  const g = new T.Group();g.add(...BUILD[type](materials));g.scale.setScalar(1.35);return g;
}

/** A soft vertical beam and a ground ring that mark where an object waits. */
export function objectMarker() {
  // The beam fades out upward, so it reads as a soft shaft of light rather than a solid post. Only its far side is
  // drawn, so the object inside stays clear.
  const canvas = document.createElement('canvas');canvas.width = 4;canvas.height = 64;const c = canvas.getContext('2d')!, g = c.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, '#000');g.addColorStop(0.7, '#555');g.addColorStop(1, '#fff');c.fillStyle = g;c.fillRect(0, 0, 4, 64);const fade = new T.CanvasTexture(canvas);
  const beamMaterial = new T.MeshBasicMaterial({ color: '#ffcf5c', alphaMap: fade, transparent: true, opacity: 0.4, depthWrite: false, side: T.BackSide });
  const ringMaterial = new T.MeshBasicMaterial({ color: '#ffd77a', transparent: true, opacity: 0.55, depthWrite: false, blending: T.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2 });
  const beam = new T.Mesh(new T.CylinderGeometry(0.32, 0.42, 7, 20, 1, true).translate(0, 3.5, 0), beamMaterial), ring = new T.Mesh(new T.RingGeometry(0.5, 0.68, 32).rotateX(-Math.PI / 2), ringMaterial);
  ring.position.y = 0.03;beam.renderOrder = ring.renderOrder = 3;
  const group = new T.Group();group.add(beam, ring);
  return { group, ring, dispose: () => { fade.dispose();beam.geometry.dispose();ring.geometry.dispose();beamMaterial.dispose();ringMaterial.dispose(); } };
}
