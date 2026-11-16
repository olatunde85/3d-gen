/**
 * <ara-character>: a live, animated Ara character on any web page, from one script tag.
 *
 *   <script type="module" src="https://cdn.jsdelivr.net/npm/ara3d@0/dist/embed.js"></script>
 *   <ara-character preset="The Soldier" animation="rifle_idle" weapon="rifle"></ara-character>
 *   <ara-character preset="The Priest" animation="walk 3s, look_around, talk_gestures"></ara-character>
 *
 * The file bundles three.js and the library, so the page needs nothing else. Each element draws its own view, pauses
 * while it's off screen, and frees its GPU memory when it's removed.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { parseSteps } from './library/sequence';
import { ANIMATIONS, createCharacter, VEHICLE_CLIPS, type AraCharacter, type Sequence, type CharacterColors, type CharacterInput, type CharacterOptions } from './index';

/** Attributes that change the character itself, so it's rebuilt. */
const BUILD = ['preset', 'random', 'share', 'src', 'clips', 'detail', 'weapon', 'carry', 'vehicle', 'colors', 'assets-url'];
/** Attributes that apply at once. */
const LIVE = ['animation', 'expression', 'orbit', 'zoom', 'auto-rotate', 'background', 'margin'];

/** A standing figure, used as a mask for the loading silhouette. */
/** A standing figure (a mask for the loading silhouette), and its outline and contours. */
const FIGURE = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 260"><path d="M50 3.5 C57 3.5 61 8.5 61 16 C61 22.5 58 27.5 54 30 C52 31.2 48 31.2 46 30 C42 27.5 39 22.5 39 16 C39 8.5 43 3.5 50 3.5 Z"/><path d="M50 27 C47.5 27 45.5 28 45.4 32 C45.3 35 45 37 43.5 38.5 C40 40.5 35 41 31.5 43 C29.5 44.2 29.2 48 30 52 C30.6 56 31 60 31.4 64 C32 71 33.4 79 34.2 86 C34.6 90 34.4 94 33.6 99 C32.6 105 31.6 111 31.8 118 C32.2 132 33.4 150 35.4 168 C35.8 172 35.6 176 35.4 180 C34.4 190 34.2 202 36.2 216 C37 224 38 231 38.4 238 C38.4 242 35.4 245 35.8 248 C36.4 251 43 251 46.2 249 C47 246 46.4 242 46.2 238 C46 228 46.6 218 46.6 206 C46.6 196 45.8 188 46 181 C46.2 176 46.6 172 46.8 166 C47.6 150 48.6 137 49.2 127 C49.5 124 49.8 123 50 123 C50.2 123 50.5 124 50.8 127 C51.4 137 52.4 150 53.2 166 C53.4 172 53.8 176 54 181 C54.2 188 53.4 196 53.4 206 C53.4 218 54 228 53.8 238 C53.6 242 53 246 53.8 249 C57 251 63.6 251 64.2 248 C64.6 245 61.6 242 61.6 238 C62 231 63 224 63.8 216 C65.8 202 65.6 190 64.6 180 C64.4 176 64.2 172 64.6 168 C66.6 150 67.8 132 68.2 118 C68.4 111 67.4 105 66.4 99 C65.6 94 65.4 90 65.8 86 C66.6 79 68 71 68.6 64 C69 60 69.4 56 70 52 C70.8 48 70.5 44.2 68.5 43 C65 41 60 40.5 56.5 38.5 C55 37 54.7 35 54.6 32 C54.5 28 52.5 27 50 27 Z"/><path d="M31.4 43 C27 43.5 24.2 46 23.8 52 C23.4 60 22.6 68 22 76 C21.6 80 21 84 20.6 88 C19.8 96 19.4 104 19.4 111 C18.2 114 16.6 119 17.4 125 C18.2 130 22.6 131 24 127 C24.8 124 24.4 118 24.6 113 C25 106 25.8 98 26.4 90 C26.8 85 27.2 81 27.8 77 C28.6 70 29.2 62 29.8 55 C30 51 31 46 31.4 43 Z"/><path d="M68.6 43 C73 43.5 75.8 46 76.2 52 C76.6 60 77.4 68 78 76 C78.4 80 79 84 79.4 88 C80.2 96 80.6 104 80.6 111 C81.8 114 83.4 119 82.6 125 C81.8 130 77.4 131 76 127 C75.2 124 75.6 118 75.4 113 C75 106 74.2 98 73.6 90 C73.2 85 72.8 81 72.2 77 C71.4 70 70.8 62 70.2 55 C70 51 69 46 68.6 43 Z"/></svg>')}")`;
const CONTOURS = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 260" fill="none" stroke-linecap="round" stroke-linejoin="round"><g stroke="#e4e7ee" stroke-opacity="0.32" stroke-width="0.55"><path d="M50 3.5 C57 3.5 61 8.5 61 16 C61 22.5 58 27.5 54 30 C52 31.2 48 31.2 46 30 C42 27.5 39 22.5 39 16 C39 8.5 43 3.5 50 3.5 Z"/><path d="M50 27 C47.5 27 45.5 28 45.4 32 C45.3 35 45 37 43.5 38.5 C40 40.5 35 41 31.5 43 C29.5 44.2 29.2 48 30 52 C30.6 56 31 60 31.4 64 C32 71 33.4 79 34.2 86 C34.6 90 34.4 94 33.6 99 C32.6 105 31.6 111 31.8 118 C32.2 132 33.4 150 35.4 168 C35.8 172 35.6 176 35.4 180 C34.4 190 34.2 202 36.2 216 C37 224 38 231 38.4 238 C38.4 242 35.4 245 35.8 248 C36.4 251 43 251 46.2 249 C47 246 46.4 242 46.2 238 C46 228 46.6 218 46.6 206 C46.6 196 45.8 188 46 181 C46.2 176 46.6 172 46.8 166 C47.6 150 48.6 137 49.2 127 C49.5 124 49.8 123 50 123 C50.2 123 50.5 124 50.8 127 C51.4 137 52.4 150 53.2 166 C53.4 172 53.8 176 54 181 C54.2 188 53.4 196 53.4 206 C53.4 218 54 228 53.8 238 C53.6 242 53 246 53.8 249 C57 251 63.6 251 64.2 248 C64.6 245 61.6 242 61.6 238 C62 231 63 224 63.8 216 C65.8 202 65.6 190 64.6 180 C64.4 176 64.2 172 64.6 168 C66.6 150 67.8 132 68.2 118 C68.4 111 67.4 105 66.4 99 C65.6 94 65.4 90 65.8 86 C66.6 79 68 71 68.6 64 C69 60 69.4 56 70 52 C70.8 48 70.5 44.2 68.5 43 C65 41 60 40.5 56.5 38.5 C55 37 54.7 35 54.6 32 C54.5 28 52.5 27 50 27 Z"/><path d="M31.4 43 C27 43.5 24.2 46 23.8 52 C23.4 60 22.6 68 22 76 C21.6 80 21 84 20.6 88 C19.8 96 19.4 104 19.4 111 C18.2 114 16.6 119 17.4 125 C18.2 130 22.6 131 24 127 C24.8 124 24.4 118 24.6 113 C25 106 25.8 98 26.4 90 C26.8 85 27.2 81 27.8 77 C28.6 70 29.2 62 29.8 55 C30 51 31 46 31.4 43 Z"/><path d="M68.6 43 C73 43.5 75.8 46 76.2 52 C76.6 60 77.4 68 78 76 C78.4 80 79 84 79.4 88 C80.2 96 80.6 104 80.6 111 C81.8 114 83.4 119 82.6 125 C81.8 130 77.4 131 76 127 C75.2 124 75.6 118 75.4 113 C75 106 74.2 98 73.6 90 C73.2 85 72.8 81 72.2 77 C71.4 70 70.8 62 70.2 55 C70 51 69 46 68.6 43 Z"/></g><g stroke="#e4e7ee" stroke-opacity="0.2" stroke-width="0.45"><path d="M37 44 C41 45 45 45.5 48.5 44.6"/><path d="M63 44 C59 45 55 45.5 51.5 44.6"/><path d="M34 63 C38 67.5 45 68 49.4 65.5"/><path d="M66 63 C62 67.5 55 68 50.6 65.5"/><path d="M50 68 L50 104"/><path d="M44.5 76 C46.5 77 48.5 77 49.5 76.5"/><path d="M55.5 76 C53.5 77 51.5 77 50.5 76.5"/><path d="M45 86 C46.8 86.8 48.6 86.8 49.5 86.4"/><path d="M55 86 C53.2 86.8 51.4 86.8 50.5 86.4"/><path d="M35.5 96 C39 104 44 112 48.5 117"/><path d="M64.5 96 C61 104 56 112 51.5 117"/><path d="M38.8 176 C40.5 178.5 43 178.5 44.4 176"/><path d="M61.2 176 C59.5 178.5 57 178.5 55.6 176"/><path d="M38 192 C39 200 40 206 40.4 212"/><path d="M62 192 C61 200 60 206 59.6 212"/><path d="M24.4 79 C25 81 25.6 82 26.4 82.6"/><path d="M75.6 79 C75 81 74.4 82 73.6 82.6"/><path d="M46 27.6 C48.6 29 51.4 29 54 27.6"/></g></svg>')}")`;

const STYLE = `
:host { display: block; position: relative; width: 100%; aspect-ratio: 3 / 4; min-height: 160px; overflow: hidden; contain: content; }
:host([hidden]) { display: none; }
canvas { display: block; width: 100%; height: 100%; outline: none; touch-action: pan-y; }
.status { position: absolute; left: 50%; bottom: 10%; transform: translateX(-50%); width: min(120px, 40%); display: grid; gap: 6px; transition: opacity 0.25s; }
.status[hidden] { display: grid; opacity: 0; pointer-events: none; }
.bar { height: 3px; border-radius: 3px; background: rgba(138, 144, 156, 0.25); overflow: hidden; }
.bar i { display: block; height: 100%; width: 0; background: rgba(138, 144, 156, 0.75); transition: width 0.2s; }
/* "Loading…" is for screen readers; an error shows its message in a small panel. */
.status span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.status.error { bottom: 12px; width: min(240px, 84%); padding: 9px 11px; font: 12px/1.3 system-ui, sans-serif; text-align: center; color: #ffd2c4; background: rgba(15, 17, 22, 0.72); border-radius: 10px; }
.status.error .bar { display: none; }
.status.error span { position: static; width: auto; height: auto; overflow: visible; clip-path: none; white-space: normal; }
/* While the first character loads: a quiet, translucent figure with a soft light passing over it, standing where the
   character will. Grey on any background, so it suits any page. */
.figure { position: absolute; left: 50%; bottom: 17%; height: 70%; aspect-ratio: 100 / 260; transform: translateX(-50%); pointer-events: none; transition: opacity 0.5s; }
.figure i { position: absolute; inset: 0; background: linear-gradient(100deg, rgba(138, 144, 156, 0.26) 42%, rgba(196, 202, 214, 0.5) 50%, rgba(138, 144, 156, 0.26) 58%) 0 0 / 300% 100%;
  -webkit-mask: ${FIGURE} center / contain no-repeat; mask: ${FIGURE} center / contain no-repeat; animation: shimmer 2.2s ease-in-out infinite; }
.figure u { position: absolute; inset: 0; background: ${CONTOURS} center / contain no-repeat; }
.figure[hidden] { display: block; opacity: 0; }
@keyframes shimmer { from { background-position: 100% 0; } to { background-position: 0 0; } }
@media (prefers-reduced-motion: reduce) { .status, .bar i, .figure { transition: none; } .figure i { animation: none; } }`;

/** A round fade from solid in the middle to clear at the edge, so the water blends into the page. */
function fade() {
  const c = document.createElement('canvas');c.width = c.height = 128;
  const g = c.getContext('2d')!, fill = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  fill.addColorStop(0, '#fff');fill.addColorStop(0.55, '#bbb');fill.addColorStop(1, '#000');g.fillStyle = fill;g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/** The swimming clips, which show water. */
const SWIM = new Set(ANIMATIONS.filter((a) => a.category === 'Swimming' && a.id !== 'climb_out_of_water').map((a) => a.id));

/** "outfit: #1d2a44; carry: #8a1c1c" -> { outfit: '#1d2a44', carry: '#8a1c1c' } */
function parseColors(text: string): CharacterColors {
  const colors: Record<string, string> = {};
  for (const part of text.split(/[;,]/)) {
    const [name, value] = part.split(':').map((s) => s.trim());
    if (name && value) colors[name] = value;
  }
  return colors as CharacterColors;
}

/** A soft pool of shade under the character. */
function shade() {
  const c = document.createElement('canvas');c.width = c.height = 128;
  const g = c.getContext('2d')!, fill = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  fill.addColorStop(0, 'rgba(0,0,0,0.42)');fill.addColorStop(0.55, 'rgba(0,0,0,0.18)');fill.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = fill;g.fillRect(0, 0, 128, 128);
  const map = new THREE.CanvasTexture(c);map.colorSpace = THREE.SRGBColorSpace;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false }));
  disc.rotation.x = -Math.PI / 2;return disc;
}

export class AraCharacterElement extends HTMLElement {
  static observedAttributes = [...BUILD, ...LIVE];
  /** The character on show, once it has loaded. */
  character?: AraCharacter;
  private view?: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls; floor: THREE.Mesh; water: THREE.Mesh; mixers: THREE.AnimationMixer[]; last: number; resize: ResizeObserver; seen: IntersectionObserver };
  private status: HTMLDivElement;
  private figure: HTMLDivElement;
  private bar: HTMLElement;
  private label: HTMLSpanElement;
  private building = 0;
  private queued = false;
  private visible = true;
  private sequence?: Sequence;
  /** The clip playing on the character, for playClip()'s blends. */
  private active?: THREE.AnimationAction;
  private extentFor?: { hero: AraCharacter; animation: string; box: THREE.Box3 };

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLE}</style><div class="figure" part="figure" aria-hidden="true"><i></i><u></u></div><div class="status" part="status" role="status"><div class="bar"><i></i></div><span>Loading…</span></div>`;
    this.figure = root.querySelector('.figure')!;
    this.status = root.querySelector('.status')!;this.bar = root.querySelector('.bar i')!;this.label = root.querySelector('.status span')!;
  }

  connectedCallback() {
    if (this.view) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));renderer.toneMapping = THREE.ACESFilmicToneMapping;renderer.toneMappingExposure = 1.05;
    renderer.domElement.setAttribute('role', 'img');
    this.shadowRoot!.prepend(renderer.domElement);
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
    scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a2f3a, 1.7));
    const key = new THREE.DirectionalLight(0xffffff, 2.3);key.position.set(2.5, 4, 3);scene.add(key);
    const rim = new THREE.DirectionalLight(0x9db9ff, 1.2);rim.position.set(-3, 2.5, -3);scene.add(rim);
    const floor = shade();scene.add(floor);
    // Swimming clips float at a water surface on the floor plane, as in the builder: see-through water shows instead.
    const water = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshStandardMaterial({ color: '#2f8aa0', roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.6, alphaMap: fade(), depthWrite: false, side: THREE.DoubleSide }));
    water.rotation.x = -Math.PI / 2;water.visible = false;scene.add(water);
    const controls = new OrbitControls(camera, renderer.domElement);
    // OrbitControls blocks touch scrolling; a vertical swipe should still scroll the page.
    renderer.domElement.style.touchAction = 'pan-y';
    controls.enableDamping = true;controls.enablePan = false;controls.maxPolarAngle = Math.PI * 0.55;controls.autoRotateSpeed = 1.2;
    const resize = new ResizeObserver(() => this.fit());resize.observe(this);
    // Off screen, the element stops drawing.
    const seen = new IntersectionObserver(([entry]) => { this.visible = entry.isIntersecting; });seen.observe(this);
    this.view = { renderer, scene, camera, controls, floor, water, mixers: [], last: 0, resize, seen };
    this.applyLive();this.fit();
    renderer.setAnimationLoop((time) => this.draw(time));
    this.build();
  }

  disconnectedCallback() {
    const v = this.view;
    if (!v) return;
    v.renderer.setAnimationLoop(null);v.resize.disconnect();v.seen.disconnect();v.controls.dispose();
    this.character?.dispose();this.character = undefined;
    v.renderer.dispose();v.renderer.forceContextLoss();v.renderer.domElement.remove();
    this.view = undefined;this.building++;
  }

  attributeChangedCallback(name: string, before: string | null, after: string | null) {
    if (!this.view || before === after) return;
    if (BUILD.includes(name)) this.build();
    else if (name === 'animation') {
      let ids: string[];
      try { ids = this.clipIds(); } catch (error) { this.fail(error as Error);return; }
      if (ids.every((id) => this.character?.clip(id))) { this.frame();this.play(); } else this.build();
    }
    else if (name === 'expression') this.applyExpression();
    else if (name === 'margin') { if (this.character) this.frame(); }
    else this.applyLive();
  }

  /** What plays: the animation attribute (one clip, or a sequence such as "walk 3s, look_around"), a vehicle's riding clip, or idle. */
  get animation() {
    const vehicle = this.getAttribute('vehicle') ?? '';
    return this.getAttribute('animation')?.trim() || VEHICLE_CLIPS[vehicle] || 'idle';
  }

  /** The clips the animation uses, each once. */
  private clipIds() {
    return [...new Set(parseSteps(this.animation).map((s) => s.id))];
  }

  private on(name: string, fallback: boolean) {
    const value = this.getAttribute(name);
    return value === null ? fallback : value !== 'false';
  }

  private applyLive() {
    const v = this.view;
    if (!v) return;
    // Dragging turns the character; zooming is opt-in, so the page still scrolls over it.
    v.controls.enableRotate = this.on('orbit', true);v.controls.enableZoom = this.on('zoom', false);v.controls.autoRotate = this.on('auto-rotate', false);
    v.renderer.domElement.style.cursor = v.controls.enableRotate ? 'grab' : '';
    const background = this.getAttribute('background');
    v.scene.background = background ? new THREE.Color(background) : null;
  }

  private applyExpression() {
    const expression = this.getAttribute('expression');
    if (!this.character || !expression) return;
    try { this.character.setExpression(expression); } catch (error) { this.fail(error as Error); }
  }

  private fit() {
    const v = this.view;
    if (!v) return;
    const { width, height } = this.getBoundingClientRect();
    v.renderer.setSize(Math.max(1, width), Math.max(1, height), false);v.camera.aspect = Math.max(1, width) / Math.max(1, height);v.camera.updateProjectionMatrix();
    if (this.character) this.frame();
  }

  /** Frames the character and any vehicle from the front-right. */
  /**
   * The space the character fills while its animations play: each clip is posed at its start, middle and end, so a
   * swim or a crouch is framed as well as standing. Props count as they stand.
   */
  private extent() {
    const hero = this.character!;
    // Posing the clips takes a moment, so a resize reuses the last answer.
    if (this.extentFor?.hero === hero && this.extentFor.animation === this.animation) return this.extentFor.box;
    const box = new THREE.Box3(), skinned: THREE.SkinnedMesh[] = [];
    hero.scene.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(o as THREE.SkinnedMesh); });
    const add = () => {
      hero.scene.updateMatrixWorld(true);
      for (const mesh of skinned) { mesh.computeBoundingBox();box.union(mesh.boundingBox!.clone().applyMatrix4(mesh.matrixWorld)); }
    };
    const clips = [...new Set(parseSteps(this.animation).map((s) => hero.clip(s.id)).filter((c): c is THREE.AnimationClip => !!c))];
    if (!clips.length || !skinned.length) box.expandByObject(hero.scene);
    else {
      const mixer = new THREE.AnimationMixer(hero.scene);
      for (const clip of clips) {
        const action = mixer.clipAction(clip).play();
        for (const at of [0, 0.5, 0.95]) { mixer.setTime(clip.duration * at);add(); }
        action.stop();
      }
      mixer.stopAllAction();mixer.uncacheRoot(hero.scene);
    }
    for (const p of hero.props) box.expandByObject(p.scene);
    this.extentFor = { hero, animation: this.animation, box };
    return box;
  }

  private frame() {
    const v = this.view!, box = this.extent();
    const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    const fit = Math.max(size.y, Math.max(size.x, size.z) / Math.max(0.5, v.camera.aspect));
    // margin: how much room to leave around the character (1.3 by default; more leaves space to move around).
    const distance = (fit / (2 * Math.tan((v.camera.fov * Math.PI) / 360))) * (Number(this.getAttribute('margin')) || 1.3);
    v.controls.target.copy(center);v.camera.position.copy(center).add(new THREE.Vector3(0.35, 0.1, 1).normalize().multiplyScalar(distance));
    v.controls.minDistance = distance * 0.35;v.controls.maxDistance = distance * 2.5;
    v.floor.scale.setScalar(Math.max(0.6, Math.max(size.x, size.z) * 0.75));
    const swimming = parseSteps(this.animation).some((s) => SWIM.has(s.id));
    v.water.visible = swimming;v.floor.visible = !swimming;v.water.scale.setScalar(Math.max(1.1, Math.max(size.x, size.z) * 0.75));
    // Swimmers are seen from above, so the water reads as a pool rather than a line.
    if (swimming) v.camera.position.copy(center).add(new THREE.Vector3(0.35, 0.75, 1).normalize().multiplyScalar(distance));
  }

  /** The current frame as a 2D canvas, for thumbnails and transitions; transparent where there's no background. */
  snapshot(): HTMLCanvasElement | undefined {
    const v = this.view;
    if (!v) return undefined;
    // Read straight after drawing, while the frame is still in the buffer.
    v.renderer.render(v.scene, v.camera);
    const source = v.renderer.domElement, copy = document.createElement('canvas');
    copy.width = source.width;copy.height = source.height;copy.getContext('2d')!.drawImage(source, 0, 0);
    return copy;
  }

  /** Starts the animation again from the beginning. */
  restart() { this.play(); }

  private play() {
    const v = this.view, hero = this.character;
    if (!v || !hero) return;
    for (const m of v.mixers) m.stopAllAction();
    this.sequence?.stop();this.sequence = undefined;
    v.mixers = [];this.active = undefined;
    // A corrected attribute clears the message its mistake left.
    if (this.status.classList.contains('error')) this.status.hidden = true;
    const steps = parseSteps(this.animation);
    if (steps.length > 1 || steps[0]?.seconds || steps[0]?.times) {
      // A sequence plays on the character; a vehicle, if any, rests.
      const mixer = new THREE.AnimationMixer(hero.scene);
      try { this.sequence = hero.playSequence(mixer, this.animation); } catch (error) { this.fail(error as Error);return; }
      v.mixers = [mixer];
      return;
    }
    const clip = steps[0] && hero.clip(steps[0].id);
    if (!clip) return;
    // A vehicle has a clip of the same name for its wheels, pedals or rotors.
    for (const [root, clips] of [[hero.scene, [clip]], ...hero.props.map((p) => [p.scene, p.animations] as const)] as const) {
      const own = clips.find((c) => c.name === clip.name);
      if (own) { const mixer = new THREE.AnimationMixer(root), action = mixer.clipAction(own).play();v.mixers.push(mixer);if (root === hero.scene) this.active = action; }
    }
  }

  /**
   * Blends to a loaded clip (from animation or clips) without rebuilding or reframing, for games and controls:
   * el.playClip('run'). Returns false if the clip isn't loaded.
   */
  playClip(id: string, fade = 0.25): boolean {
    const v = this.view, hero = this.character, clip = hero?.clip(id);
    if (!v || !hero || !clip) return false;
    this.sequence?.stop();this.sequence = undefined;
    let mixer = v.mixers.find((m) => m.getRoot() === hero.scene);
    if (!mixer) { mixer = new THREE.AnimationMixer(hero.scene);v.mixers.unshift(mixer); }
    const next = mixer.clipAction(clip);
    if (next === this.active && next.isRunning()) return true;
    next.reset().setEffectiveWeight(1).play();
    if (this.active && this.active !== next) this.active.crossFadeTo(next, fade, false);
    this.active = next;
    return true;
  }

  private draw(time: number) {
    const v = this.view!, delta = v.last ? Math.min((time - v.last) / 1000, 0.1) : 0;
    v.last = time;
    if (!this.visible) return;
    for (const m of v.mixers) m.update(delta);
    this.character?.update(delta);
    // The shade stays under a character that's been moved.
    if (this.character) v.floor.position.set(this.character.scene.position.x, 0, this.character.scene.position.z);
    v.controls.update();v.renderer.render(v.scene, v.camera);
  }

  /** What to build, from the attributes. */
  private async input(): Promise<CharacterInput> {
    const src = this.getAttribute('src'), share = this.getAttribute('share'), random = this.getAttribute('random'), preset = this.getAttribute('preset');
    if (src) {
      const response = await fetch(new URL(src, document.baseURI));
      if (!response.ok) throw Error(`Could not load ${src} (${response.status}).`);
      return await response.json();
    }
    if (share) return share;
    if (random !== null) return { random: Number(random) };
    return preset || 'The Soldier';
  }

  private options(): CharacterOptions {
    // Extra clips to load without playing, for playClip().
    const extra = (this.getAttribute('clips') ?? '').split(',').map((c) => c.trim()).filter(Boolean);
    const options: CharacterOptions = { animations: [...new Set([...this.clipIds(), ...extra])] };
    const detail = this.getAttribute('detail'), colors = this.getAttribute('colors'), assets = this.getAttribute('assets-url');
    if (detail) options.detail = detail as CharacterOptions['detail'];
    for (const prop of ['weapon', 'carry', 'vehicle'] as const) { const value = this.getAttribute(prop);if (value) (options as Record<string, unknown>)[prop] = value; }
    if (colors) options.colors = parseColors(colors);
    if (assets) options.assetsUrl = new URL(assets, document.baseURI).href;
    return options;
  }

  /** Rebuilds the character once, however many attributes changed together. */
  private build() {
    if (this.queued) return;
    this.queued = true;
    queueMicrotask(() => { this.queued = false;void this.rebuild(); });
  }

  private async rebuild() {
    const id = ++this.building;
    this.show('Loading…', 0.03);
    try {
      const next = await createCharacter(await this.input(), { ...this.options(), onProgress: (_label, fraction) => { if (id === this.building) this.show('Loading…', 0.05 + fraction * 0.9); } });
      if (id !== this.building || !this.view) { next.dispose();return; }
      const v = this.view, last = this.character;
      if (last) { v.scene.remove(last.scene);for (const p of last.props) v.scene.remove(p.scene);last.dispose(); }
      this.character = next;v.scene.add(next.scene);for (const p of next.props) v.scene.add(p.scene);
      v.renderer.domElement.setAttribute('aria-label', `3D character: ${next.params.name}`);
      this.applyExpression();this.frame();this.play();
      this.status.hidden = true;this.figure.hidden = true;
      this.dispatchEvent(new CustomEvent('load', { detail: next }));
    } catch (error) {
      if (id === this.building) this.fail(error as Error);
    }
  }

  private show(text: string, fraction: number) {
    this.status.hidden = false;this.status.classList.remove('error');this.label.textContent = text;this.bar.style.width = `${Math.round(fraction * 100)}%`;
  }

  private fail(error: Error) {
    this.figure.hidden = true;this.status.hidden = false;this.status.classList.add('error');this.label.textContent = error.message;this.bar.style.width = '0';
    console.warn('<ara-character>:', error.message);
    this.dispatchEvent(new CustomEvent('error', { detail: error }));
  }
}

if (!customElements.get('ara-character')) customElements.define('ara-character', AraCharacterElement);

declare global {
  interface HTMLElementTagNameMap { 'ara-character': AraCharacterElement }
}
