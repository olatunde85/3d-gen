import * as THREE from 'three';
import { Bicycle, BICYCLE_CLIP } from './bicycle';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Character } from '../core/human';
import { Animator, type Frame } from '../core/anim/evaluate';
import type { Clip } from '../core/anim/clips';
import { localTransform, quatOf } from '../core/rig/rig';

/** three.js viewport that displays a generated Character. */
export class Viewer {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
  private controls: OrbitControls;
  private mesh: THREE.Mesh | null = null;
  private helper: THREE.SkeletonHelper | null = null;
  private bones: THREE.Bone[] = [];
  private animator: Animator | null = null;
  private clip: Clip | null = null;
  private clipStart = 0;
  speed = 1;
  /** Preview root motion (travel) for locomotion clips. */
  rootMotion = false;
  private lastFrame: Frame | null = null;
  /** The bicycle shown while the Ride bicycle clip plays (built for the current character). */
  private bike: Bicycle | null = null;
  private vehicle: 'none' | 'bicycle' = 'none';
  private blendFrom: Frame | null = null;
  private blendStart = 0;
  /** Called with (clip, time) every frame while a clip plays (for the timeline UI). */
  onTick?: (clip: Clip | null, t: number) => void;
  private loader = new THREE.TextureLoader();
  private texCache = new Map<string, THREE.Texture>();
  private framedHeight = 0;
  /** The shown character's height (the close-up always follows it). */
  private height = 0;
  wireframe = false;
  showSkeleton = false;

  constructor(private canvas: HTMLCanvasElement, private textureUrl: (file: string) => string) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.scene.background = new THREE.Color('#2b2f38');
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;

    const key = new THREE.DirectionalLight('#fff4ea', 2.4);
    key.position.set(2, 4, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.015;
    Object.assign(key.shadow.camera, { left: -1.5, right: 1.5, top: 2.5, bottom: -0.5, near: 0.5, far: 12 });
    this.scene.add(key);
    const rim = new THREE.DirectionalLight('#b8c8ff', 1.2);
    rim.position.set(-2.5, 3, -3);
    this.scene.add(rim);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(4, 64).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#363b46', roughness: 1 }),
    );
    ground.receiveShadow = true;
    this.scene.add(ground);
    const grid = new THREE.GridHelper(8, 32, '#4c5262', '#3c414d');
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.5;
    grid.position.y = 0.001;
    this.scene.add(grid);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.minDistance = 0.3;
    this.camera.position.set(1.4, 1.3, 4.2);
    this.controls.target.set(0, 0.9, 0);

    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
    const loop = () => {
      this.tick();
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(loop);
    };
    loop();
  }

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private texture(file: string, color: boolean): THREE.Texture {
    const key = file + color;
    let t = this.texCache.get(key);
    if (!t) {
      t = this.loader.load(this.textureUrl(file));
      t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = 8;
      t.wrapS = t.wrapT = THREE.RepeatWrapping; // procedural fabrics tile beyond 0..1
      this.texCache.set(key, t);
    }
    return t;
  }

  show(ch: Character) {
    const { mesh: m } = ch;
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material[]).forEach((x) => x.dispose());
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(m.uvs, 2));
    if (m.morphs) {
      // Facial blend shapes (offsets relative to the rest positions).
      geo.morphAttributes.position = m.morphs.deltas.map((d, i) => {
        const a = new THREE.BufferAttribute(d, 3);
        a.name = m.morphs!.names[i];
        return a;
      });
      geo.morphTargetsRelative = true;
    }
    const total = m.groups.reduce((n, g) => n + g.indices.length, 0);
    const index = new Uint32Array(total);
    let o = 0;
    for (const g of m.groups) {
      index.set(g.indices, o);
      geo.addGroup(o, g.indices.length, g.material);
      o += g.indices.length;
    }
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    const mats = m.materials.map((mt) => {
      const mat = new THREE.MeshStandardMaterial({
        name: mt.name,
        color: new THREE.Color(mt.color),
        roughness: mt.roughness,
        metalness: mt.metalness,
        map: mt.map ? this.texture(mt.map, true) : null,
        normalMap: mt.normalMap ? this.texture(mt.normalMap, false) : null,
        side: mt.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
        emissive: mt.emissive ? new THREE.Color(mt.emissive) : new THREE.Color(0),
        emissiveIntensity: mt.emissive ? 1.6 : 0,
        wireframe: this.wireframe,
      });
      // Double-sided cloth would otherwise shadow itself (acne).
      if (mt.doubleSided) mat.shadowSide = THREE.FrontSide;
      if (mt.alpha === 'mask') {
        mat.alphaTest = 0.5;
        mat.alphaToCoverage = true;
      } else if (mt.alpha === 'blend') {
        mat.transparent = true;
        mat.opacity = mt.opacity ?? 1;
        mat.depthWrite = false;
        // Without an alpha test, transparent texels of a textured overlay (tattoos, stubble) would still cast shadows.
        if (mt.map) mat.alphaTest = 0.01;
      }
      return mat;
    });
    if (ch.rig && m.joints && m.weights) {
      geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(m.joints, 4));
      geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(m.weights, 4));
      const sk = new THREE.SkinnedMesh(geo, mats);
      this.bones = ch.rig.bones.map((b, i) => {
        const bone = new THREE.Bone();
        bone.name = b.name;
        const { t, R } = localTransform(ch.rig!.bones, i);
        bone.position.set(...t);
        bone.quaternion.set(...quatOf(R));
        return bone;
      });
      ch.rig.bones.forEach((b, i) => (b.parent >= 0 ? this.bones[b.parent] : sk).add(this.bones[i]));
      sk.updateMatrixWorld(true);
      sk.bind(new THREE.Skeleton(this.bones));
      this.mesh = sk;
    } else {
      this.bones = [];
      this.mesh = new THREE.Mesh(geo, mats);
    }
    // Resting expression (animation updates it per frame on rigged characters).
    m.morphs?.defaults.forEach((x, i) => this.mesh!.morphTargetInfluences && (this.mesh!.morphTargetInfluences[i] = x));
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.scene.add(this.mesh);
    this.drawSkeleton();
    this.animator = ch.rig && this.bones.length ? new Animator(ch.rig, ch.face) : null;
    this.dropBike();
    this.vehicle = ch.params.vehicle ?? 'none';
    this.tick();

    // Re-frame only when the height changes noticeably, so tweaking sliders doesn't jump the camera;
    // the face close-up always follows the face.
    this.height = ch.height;
    if (Math.abs(ch.height - this.framedHeight) > 0.2 || (this.faceMode && Math.abs(ch.height - this.framedHeight) > 0.02)) {
      this.framedHeight = ch.height;
      this.frame();
    }
  }

  private faceMode = false;

  private frame() {
    const h = this.framedHeight || 1.75;
    if (this.faceMode) {
      this.controls.target.set(0, h * 0.93, 0.02);
      this.camera.position.set(0.22, h * 0.95, 0.7);
    } else {
      // Full body with a little headroom for jumps and raised weapons.
      const dist = h * 2.45 + 0.5;
      this.controls.target.set(0, h * 0.5, 0);
      this.camera.position.set(dist * 0.33, h * 0.6, dist);
    }
  }

  /** Close-up on the face (or back to full body). */
  focusFace(on: boolean) {
    this.faceMode = on;
    if (this.height) this.framedHeight = this.height;
    this.frame();
  }

  private drawSkeleton() {
    if (this.helper) {
      this.scene.remove(this.helper);
      this.helper.dispose();
      this.helper = null;
    }
    if (!this.mesh || !this.bones.length) return;
    this.helper = new THREE.SkeletonHelper(this.mesh);
    (this.helper.material as THREE.LineBasicMaterial).depthTest = false;
    this.helper.renderOrder = 10;
    this.helper.visible = this.showSkeleton;
    this.scene.add(this.helper);
  }

  private tick() {
    if (!this.animator) return;
    const now = performance.now() / 1000;
    let t = 0;
    let frame: Frame;
    if (this.clip) {
      const el = (now - this.clipStart) * this.speed;
      t = this.clip.loop ? el % this.clip.duration : Math.min(el, this.clip.duration);
      frame = this.animator.frame(this.clip, t, { rootMotion: this.rootMotion, faceTime: now });
    } else frame = { ...this.animator.bind(), morph: this.animator.restFace(now) };
    // Crossfade from the previous clip over 0.25 s.
    if (this.blendFrom) {
      const w = Math.min(1, (now - this.blendStart) / 0.25);
      if (w >= 1 || this.blendFrom.rot.length !== frame.rot.length) this.blendFrom = null;
      else {
        const from = this.blendFrom;
        const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
        frame = {
          rot: frame.rot.map((q, i) => {
            qa.set(...from.rot[i]);
            qb.set(...q);
            qa.slerp(qb, w);
            return [qa.x, qa.y, qa.z, qa.w];
          }),
          rootPos: new Map([...frame.rootPos].map(([i, p]) => {
            const f = from.rootPos.get(i) ?? p;
            return [i, [f[0] + (p[0] - f[0]) * w, f[1] + (p[1] - f[1]) * w, f[2] + (p[2] - f[2]) * w]];
          })),
          morph: frame.morph,
        };
      }
    }
    this.lastFrame = frame;
    // Follow travelling characters with the camera target.
    if (this.rootMotion && this.clip?.travel) {
      const rp = [...frame.rootPos.values()][0];
      if (rp) this.controls.target.set(rp[0], this.controls.target.y, rp[2]);
    }
    frame.rot.forEach((q, i) => this.bones[i].quaternion.set(q[0], q[1], q[2], q[3]));
    for (const [i, p] of frame.rootPos) this.bones[i].position.set(p[0], p[1], p[2]);
    const inf = this.mesh?.morphTargetInfluences;
    if (inf) {
      // Face: the clip's weights, or the resting expression in the bind pose; crossfaded like the bones.
      const want = frame.morph ?? this.animator.face?.defaults ?? [];
      const w = this.blendFrom ? Math.min(1, (now - this.blendStart) / 0.25) : 1;
      want.forEach((x, i) => (inf[i] = inf[i] + (x - inf[i]) * w));
    }
    this.updateBike(frame);
    this.onTick?.(this.clip, t);
  }

  /** Ride bicycle shows a bicycle fitted to the character; other clips hide it. */
  private updateBike(frame: Frame) {
    const riding = this.clip?.id === BICYCLE_CLIP && this.vehicle === 'bicycle' && !!this.animator;
    if (riding && !this.bike) {
      try {
        this.bike = new Bicycle(this.animator!.rig, this.animator!, this.clip!);
        this.scene.add(this.bike.group);
      } catch {
        return; // rigs without hands or feet: no bike
      }
    }
    if (!this.bike) return;
    this.bike.group.visible = riding;
    if (riding) this.bike.update(this.animator!.positions(frame));
  }

  private dropBike() {
    if (!this.bike) return;
    this.scene.remove(this.bike.group);
    this.bike.dispose();
    this.bike = null;
  }

  /** Play a clip (null = bind pose). One-shot clips hold their last frame. */
  play(clip: Clip | null) {
    if (this.lastFrame) {
      this.blendFrom = this.lastFrame;
      this.blendStart = performance.now() / 1000;
    }
    this.clip = clip;
    this.clipStart = performance.now() / 1000;
    this.tick();
  }

  get playing(): Clip | null {
    return this.clip;
  }

  setWireframe(on: boolean) {
    this.wireframe = on;
    if (this.mesh) for (const m of this.mesh.material as THREE.MeshStandardMaterial[]) m.wireframe = on;
  }

  setSkeleton(on: boolean) {
    this.showSkeleton = on;
    if (this.helper) this.helper.visible = on;
  }

  /** The canvas this viewer renders to (for share images). */
  get canvasElement(): HTMLCanvasElement {
    return this.canvas;
  }

  /** Where the character is on the canvas right now (device pixels, current pose and camera), with a margin. */
  characterRect(margin = 0.08): { x: number; y: number; w: number; h: number } | null {
    if (!this.mesh) return null;
    this.mesh.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.mesh);
    if (box.isEmpty()) return null;
    const W = this.canvas.width, H = this.canvas.height;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      const v = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(this.camera);
      const px = ((v.x + 1) / 2) * W, py = ((1 - v.y) / 2) * H;
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
    }
    const mx = (x1 - x0) * margin, my = (y1 - y0) * margin;
    x0 = Math.max(0, x0 - mx); y0 = Math.max(0, y0 - my); x1 = Math.min(W, x1 + mx); y1 = Math.min(H, y1 + my);
    return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  }

  async snapshot(): Promise<Uint8Array> {
    const blob = await new Promise<Blob | null>((res) => this.canvas.toBlob(res, 'image/png'));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : new Uint8Array();
  }
}
