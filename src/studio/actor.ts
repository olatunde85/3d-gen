/** Studio's render adapter. Uses the generator's unmodified mesh, materials and Animator. */
import * as THREE from 'three';
import type { Character } from '../core/human';
import { Animator, type Frame } from '../core/anim/evaluate';
import { clipById } from '../core/anim/clips';
import { localTransform, quatOf } from '../core/rig/rig';
import type { ActorTrack, StudioProject } from './project';
import { Bicycle, BICYCLE_CLIP } from '../app/bicycle';
import { boneFor } from '../core/rig/poses';
import { SetBuilder } from './sets/builder';
import { disposeSet } from './sets';
import { timelineAt } from './project';

const SEATED = ['sit_down', 'sit_idle', 'stand_up'];

export class StudioActor {
  readonly group = new THREE.Group();
  readonly mesh: THREE.SkinnedMesh;
  readonly animator: Animator;
  readonly scale: number;
  readonly height: number;
  framingPadding = 0;
  private bones: THREE.Bone[];
  private chair?: THREE.Group;
  private bike?: Bicycle;
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
  frame(project: StudioProject, time: number, track = project.actors[0]): Frame {
    const at = timelineAt(project, time, track), b = track.beats[at.index], clip = clipById.get(b.clip)!;
    const faceTime = time + Math.max(0, project.actors.indexOf(track)) * 0.83;
    const local = clip.loop ? at.phase % clip.duration : Math.min(at.phase, clip.duration);
    let frame = this.animator.frame(clip, local, { faceTime });
    if (at.index && at.local < 0.3 && (track.beats[at.index - 1].clip !== b.clip || !clip.loop)) {
      const previous = track.beats[at.index - 1], fromClip = clipById.get(previous.clip)!;
      const prior = timelineAt(project, Math.max(0, at.start - 0.000001), track);
      const priorPhase = prior.phase + 0.000001;
      const fromTime = fromClip.loop ? priorPhase % fromClip.duration : Math.min(priorPhase, fromClip.duration);
      const from = this.animator.frame(fromClip, fromTime, { faceTime });
      const w = at.local / 0.3, ease = w * w * (3 - 2 * w);
      const rootPos = new Map(frame.rootPos);
      for (const [i, p] of rootPos) { const q = from.rootPos.get(i)!; rootPos.set(i, p.map((v, d) => q[d] + (v - q[d]) * ease) as [number, number, number]); }
      const a = new THREE.Quaternion(), c = new THREE.Quaternion();
      frame = { ...frame, rootPos, morph: frame.morph?.map((v, i) => (from.morph?.[i] ?? v) + (v - (from.morph?.[i] ?? v)) * ease), rot: frame.rot.map((q, i) => a.set(...from.rot[i]).slerp(c.set(...q), ease).toArray() as [number, number, number, number]) };
    }
    return frame;
  }
  pose(project: StudioProject, time: number, track: ActorTrack = project.actors[0]) {
    const frame = this.frame(project, time, track);
    frame.rot.forEach((q, i) => this.bones[i].quaternion.set(...q));
    for (const [i, p] of frame.rootPos) this.bones[i].position.set(...p);
    frame.morph?.forEach((w, i) => { if (this.mesh.morphTargetInfluences) this.mesh.morphTargetInfluences[i] = w; });
    const at = timelineAt(project, time, track);
    this.place(this.group, track, at);
    this.framingPadding=track.beats[at.index].clip===BICYCLE_CLIP?0.9*this.scale:0;
    this.props(track.beats[at.index].clip, frame, at.phase);
    // A chair is set furniture: it stands where the character first sits, before they sit and after they stand.
    const seat = track.beats.findIndex(b => SEATED.includes(b.clip));
    if (seat < 0) { if (this.chair) this.chair.visible = false; }
    else {
      this.fitChair();
      const start = track.beats.slice(0, seat).reduce((sum, b) => sum + b.duration, 0);
      this.place(this.chair!, track, timelineAt(project, start + 1e-4, track));
      this.chair!.visible = true;
      if (this.group.parent && this.chair!.parent !== this.group.parent) this.group.parent.add(this.chair!);
      this.chair!.updateMatrixWorld(true);
    }
    this.group.updateMatrixWorld(true);
  }
  private place(object: THREE.Object3D, track: ActorTrack, at: { x: number; z: number }) {
    const yaw = track.yaw * Math.PI / 180;
    object.rotation.y = yaw;
    object.position.set(track.x + (at.x * Math.cos(yaw) + at.z * Math.sin(yaw)) * this.scale, track.y, track.z + (-at.x * Math.sin(yaw) + at.z * Math.cos(yaw)) * this.scale);
  }
  private fitChair() {
    if (!this.chair) {
      const rig = this.character.rig!, hips = rig.bones.findIndex(b => b.name === boneFor(rig.type, 'Hips'));
      const p = this.animator.positions(this.animator.frame(clipById.get('sit_idle')!, 0))[Math.max(0, hips)];
      const b = new SetBuilder(), s = this.scale, y = Math.max(0.25, p[1] - 0.12 * s);
      b.box([0.52*s,0.08*s,0.5*s],[p[0],y,p[2]],'#81715d');
      b.box([0.52*s,0.55*s,0.07*s],[p[0],y+0.27*s,p[2]-0.23*s],'#81715d');
      for(const x of [-0.21,0.21])for(const z of [-0.2,0.2])b.box([0.035*s,y,0.035*s],[p[0]+x*s,y/2,p[2]+z*s],'#4d5556');
      this.chair = b.group;
    }
  }
  private props(clip: string, frame: Frame, phase: number) {
    if(clip===BICYCLE_CLIP&&!this.bike){this.bike=new Bicycle(this.character.rig!,this.animator,clipById.get(BICYCLE_CLIP)!);this.group.add(this.bike.group);}
    if(this.bike){this.bike.group.visible=clip===BICYCLE_CLIP;if(clip===BICYCLE_CLIP)this.bike.update(this.animator.positions(frame), phase / clipById.get(BICYCLE_CLIP)!.duration * Math.PI * 5);}
  }
  /** Takes the character and its set furniture out of the scene. */
  detach() { this.group.removeFromParent(); this.chair?.removeFromParent(); }
  dispose() { if(this.chair)disposeSet(this.chair);this.bike?.dispose();this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material[]).forEach((m) => m.dispose());
    this.mesh.skeleton.dispose(); this.textures.forEach((t) => t.dispose()); this.group.removeFromParent(); }
}
