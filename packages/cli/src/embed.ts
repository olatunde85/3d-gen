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
import FIGURE_MALE from './library/loading-figure-male.png?inline';
import FIGURE_FEMALE from './library/loading-figure-female.png?inline';
import CATALOG from 'virtual:ara-catalog';
import { ANIMATIONS, createCharacter, VEHICLE_CLIPS, type AraCharacter, type Sequence, type CharacterColors, type CharacterInput, type CharacterOptions } from './index';

/** Attributes that change the character itself, so it's rebuilt. */
const BUILD = ['preset', 'random', 'share', 'src', 'clips', 'detail', 'weapon', 'carry', 'vehicle', 'colors', 'assets-url'];
/** Attributes that apply at once. */
const LIVE = ['animation', 'expression', 'orbit', 'zoom', 'auto-rotate', 'background', 'margin'];

/** A standing figure, used as a mask for the loading silhouette. */
/** Real Ara characters as wireframes, standing relaxed (scripts/loading-figure.ts): the masks for the loading figure. */
const FIGURE = `url("${FIGURE_MALE}")`, FIGURE_F = `url("${FIGURE_FEMALE}")`;
const WOMEN = new Set(CATALOG.women);

const STYLE = `
:host { display: block; position: relative; width: 100%; aspect-ratio: 3 / 4; min-height: 160px; overflow: hidden; contain: content; }
:host([hidden]) { display: none; }
canvas { display: block; width: 100%; height: 100%; outline: none; touch-action: pan-y; }
.status { position: absolute; left: 50%; bottom: 10%; transform: translateX(-50%); width: min(120px, 40%); display: grid; gap: 6px; transition: opacity 0.25s; }
.status[hidden] { display: grid; opacity: 0; pointer-events: none; }
/* "Loading…" is for screen readers; an error shows its message in a small panel. */
.status span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.status.error { bottom: 12px; width: min(240px, 84%); padding: 9px 11px; font: 12px/1.3 system-ui, sans-serif; text-align: center; color: #ffd2c4; background: rgba(15, 17, 22, 0.72); border-radius: 10px; }
.status.error .status.error span { position: static; width: auto; height: auto; overflow: visible; clip-path: none; white-space: normal; }
/* While the first character loads: a quiet, translucent figure with a soft light passing over it, standing where the
   character will. Grey on any background, so it suits any page. */
.figure { position: absolute; left: 50%; bottom: 12%; height: 76%; aspect-ratio: 360 / 900; transform: translateX(-50%); pointer-events: none; transition: opacity 0.5s; }
.figure i { position: absolute; inset: 0; background: linear-gradient(100deg, rgba(150, 156, 170, 0.5) 40%, rgba(225, 230, 240, 0.95) 50%, rgba(150, 156, 170, 0.5) 60%) 0 0 / 300% 100%;
  -webkit-mask: ${FIGURE} center / contain no-repeat; mask: ${FIGURE} center / contain no-repeat; animation: shimmer 2.2s ease-in-out infinite; }
.figure[data-body="female"] i { -webkit-mask-image: ${FIGURE_F}; mask-image: ${FIGURE_F}; }
.figure[hidden] { display: block; opacity: 0; }
@keyframes shimmer { from { background-position: 100% 0; } to { background-position: 0 0; } }
@media (prefers-reduced-motion: reduce) { .status, .figure { transition: none; } .figure i { animation: none; } }`;

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
    root.innerHTML = `<style>${STYLE}</style><div class="figure" part="figure" aria-hidden="true"><i></i></div><div class="status" part="status" role="status"><span>Loading…</span></div>`;
    this.figure = root.querySelector('.figure')!;
    this.status = root.querySelector('.status')!;this.label = root.querySelector('.status span')!;
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
    // While a new character builds, the loading figure stands in for the old one.
    if (this.character) { this.character.scene.visible = false;for (const p of this.character.props) p.scene.visible = false; }
    // The figure matches who's coming: a preset's own body, otherwise the character being replaced.
    const preset = this.getAttribute('preset'), coming = this.hasAttribute('src') || this.hasAttribute('share') || this.hasAttribute('random') ? undefined : preset;
    this.figure.dataset.body = coming ? (WOMEN.has(coming) ? 'female' : 'male') : this.character && this.character.params.gender < 0.5 ? 'female' : this.figure.dataset.body ?? 'male';
    this.figure.hidden = false;
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

  private show(text: string, _fraction?: number) {
    this.status.hidden = false;this.status.classList.remove('error');this.label.textContent = text;
  }

  private fail(error: Error) {
    this.figure.hidden = true;this.status.hidden = false;this.status.classList.add('error');this.label.textContent = error.message;
    console.warn('<ara-character>:', error.message);
    this.dispatchEvent(new CustomEvent('error', { detail: error }));
  }
}

if (!customElements.get('ara-character')) customElements.define('ara-character', AraCharacterElement);

declare global {
  interface HTMLElementTagNameMap { 'ara-character': AraCharacterElement }
}
