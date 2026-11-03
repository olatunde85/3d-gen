/** Studio's render adapter. Uses the generator's unmodified mesh, materials and Animator. */
import * as THREE from 'three';
import type { Character } from '../core/human';
import { Animator, type Frame } from '../core/anim/evaluate';
import { clipById } from '../core/anim/clips';
import { localTransform, quatOf } from '../core/rig/rig';
import type { StudioProject } from './project';
import { timelineAt } from './project';

export class StudioActor {
  readonly group = new THREE.Group();
  readonly mesh: THREE.SkinnedMesh;
  readonly animator: Animator;
  readonly scale: number;
  readonly height: number;
  private bones: THREE.Bone[];
  private textures: THREE.Texture[] = [];
  constructor(readonly character: Character, texture: (file: string) => string) {
    const { mesh: m, rig } = character;
    if (!rig || !m.joints || !m.weights) throw new Error('Studio needs a rigged character.');
    this.height = character.height;
    this.scale = Math.max(...rig.bones.flatMap((b) => [b.head[1], b.tail[1]])) / 1.8;
    this.animator = new Animator(rig, character.face);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(m.uvs, 2));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(m.joints, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(m.weights, 4));
    if (m.morphs) {
      geo.morphTargetsRelative = true;
      geo.morphAttributes.position = m.morphs.deltas.map((d, i) => { const a = new THREE.BufferAttribute(d, 3); a.name = m.morphs!.names[i]; return a; });
    }
    const all = new Uint32Array(m.groups.reduce((sum, g) => sum + g.indices.length, 0));
    let offset = 0;
    for (const g of m.groups) { all.set(g.indices, offset); geo.addGroup(offset, g.indices.length, g.material); offset += g.indices.length; }
    geo.setIndex(new THREE.BufferAttribute(all, 1));
    const cache = new Map<string, THREE.Texture>(), loader = new THREE.TextureLoader();
    const get = (file: string, color: boolean) => {
      const key = `${color}:${file}`;
      let t = cache.get(key);
      if (!t) { t = loader.load(texture(file)); t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; cache.set(key, t); this.textures.push(t); }
      return t;
    };
    const materials = m.materials.map((mt) => {
      const material = new THREE.MeshStandardMaterial({ name: mt.name, color: mt.color,
        roughness: mt.roughnessMap ? 1 : mt.roughness, metalness: mt.metalness,
        map: mt.map ? get(mt.map, true) : null, normalMap: mt.normalMap ? get(mt.normalMap, false) : null,
        roughnessMap: mt.roughnessMap ? get(mt.roughnessMap, false) : null,
        side: mt.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
        emissive: mt.emissive ?? '#000000', emissiveIntensity: mt.emissive ? 1.6 : 0,
      });
      if (mt.doubleSided) material.shadowSide = THREE.FrontSide;
      if (mt.alpha === 'mask') { material.alphaTest = 0.5; material.alphaToCoverage = true; }
      if (mt.alpha === 'blend') { material.transparent = true; material.opacity = mt.opacity ?? 1; material.depthWrite = false; if (mt.map) material.alphaTest = 0.01; }
      return material;
    });
    this.mesh = new THREE.SkinnedMesh(geo, materials);
    this.bones = rig.bones.map((b, i) => { const bone = new THREE.Bone(), { t, R } = localTransform(rig.bones, i);
      bone.name = b.name; bone.position.set(...t); bone.quaternion.set(...quatOf(R)); return bone; });
    rig.bones.forEach((b, i) => (b.parent < 0 ? this.mesh : this.bones[b.parent]).add(this.bones[i]));
    this.mesh.updateMatrixWorld(true);
    this.mesh.bind(new THREE.Skeleton(this.bones));
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    // Animated limbs must not be culled against the static bind-pose bounding sphere.
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
  }
  async ready() {
    // TextureLoader is asynchronous. Export must never encode the untextured first frame.
    await Promise.all(this.textures.map((t) => new Promise<void>((resolve, reject) => {
      const image = t.image as HTMLImageElement | undefined;
      if (image?.complete && image.naturalWidth > 0) return resolve();
      const poll = setInterval(() => { const img = t.image as HTMLImageElement | undefined;
        if (img?.complete && img.naturalWidth > 0) { clearInterval(poll); clearTimeout(timeout); resolve(); } }, 30);
      const timeout = setTimeout(() => { clearInterval(poll); reject(new Error('A character texture could not load. Please try again.')); }, 25_000);
    })));
  }
  frame(project: StudioProject, time: number): Frame {
    const at = timelineAt(project, time), b = project.beats[at.index], clip = clipById.get(b.clip)!;
    const local = clip.loop ? at.phase % clip.duration : Math.min(at.phase, clip.duration);
    let frame = this.animator.frame(clip, local, { faceTime: time });
    if (at.index && at.local < 0.3 && project.beats[at.index - 1].clip !== b.clip) {
      const previous = project.beats[at.index - 1], fromClip = clipById.get(previous.clip)!;
      const prior = timelineAt(project, Math.max(0, at.start - 0.000001));
      const priorPhase = prior.phase + 0.000001;
      const fromTime = fromClip.loop ? priorPhase % fromClip.duration : Math.min(priorPhase, fromClip.duration);
      const from = this.animator.frame(fromClip, fromTime, { faceTime: time });
      const w = at.local / 0.3, ease = w * w * (3 - 2 * w);
      const rootPos = new Map(frame.rootPos);
      for (const [i, p] of rootPos) { const q = from.rootPos.get(i)!; rootPos.set(i, p.map((v, d) => q[d] + (v - q[d]) * ease) as [number, number, number]); }
      const a = new THREE.Quaternion(), c = new THREE.Quaternion();
      frame = { ...frame, rootPos, morph: frame.morph?.map((v, i) => (from.morph?.[i] ?? v) + (v - (from.morph?.[i] ?? v)) * ease), rot: frame.rot.map((q, i) => a.set(...from.rot[i]).slerp(c.set(...q), ease).toArray() as [number, number, number, number]) };
    }
    return frame;
  }
  pose(project: StudioProject, time: number) {
    const frame = this.frame(project, time);
    frame.rot.forEach((q, i) => this.bones[i].quaternion.set(...q));
    for (const [i, p] of frame.rootPos) this.bones[i].position.set(...p);
    frame.morph?.forEach((w, i) => { if (this.mesh.morphTargetInfluences) this.mesh.morphTargetInfluences[i] = w; });
    this.group.position.z = timelineAt(project, time).z * this.scale;
    this.group.updateMatrixWorld(true);
  }
  dispose() { this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material[]).forEach((m) => m.dispose());
    this.mesh.skeleton.dispose(); this.textures.forEach((t) => t.dispose()); this.group.removeFromParent(); }
}
