/**
 * Movement helpers for a character: locomotion (idle, walk and run blended by speed), a head that looks at things,
 * and lip-sync from audio. Each runs as the page calls mixer.update() and the character's update().
 */
import { LoopRepeat, MathUtils, Quaternion, Vector3, type AnimationClip, type AnimationMixer, type Bone, type Object3D } from 'three';

// --- Locomotion ----------------------------------------------------------------------------------------------------

export interface LocomotionOptions {
  /** The clips to blend, by Ara clip ID (defaults: idle, walk, run). Load them with the animations option. */
  idle?: string; walk?: string; run?: string;
  /** How quickly the gait follows a change of speed, in seconds (default 0.25). */
  smoothing?: number;
}
export interface Locomotion {
  /** Metres per second. Set it from your own movement every frame; 0 stands still. */
  speed: number;
  /** The speed at which the walk plays at its natural pace, for this character's size. */
  readonly walkSpeed: number;
  /** The speed at which the run plays at its natural pace. */
  readonly runSpeed: number;
  /** Stops blending and leaves the mixer to you. */
  stop(): void;
}

/** Natural speeds of the walk and run clips for a character 1.78 m tall (measured from their root motion). */
const WALK_SPEED = 1.5, RUN_SPEED = 3.7;

export function locomotion(clip: (id: string) => AnimationClip | undefined, mixer: AnimationMixer, height: number, options: LocomotionOptions = {}): Locomotion {
  const { idle = 'idle', walk = 'walk', run = 'run', smoothing = 0.25 } = options;
  const clips = [idle, walk, run].map((id) => {
    const c = clip(id);
    if (!c) throw Error(`The animation "${id}" isn't loaded. Add it to the animations option, such as animations: ['idle', 'walk', 'run'].`);
    return c;
  });
  const [idleAction, walkAction, runAction] = clips.map((c) => mixer.clipAction(c));
  mixer.stopAllAction();
  for (const a of [idleAction, walkAction, runAction]) { a.reset();a.setLoop(LoopRepeat, Infinity);a.setEffectiveWeight(0);a.play(); }
  idleAction.setEffectiveWeight(1);
  // Longer legs take longer strides: the clips' natural speeds scale with the character's height.
  const scale = height / 1.78, walkSpeed = WALK_SPEED * scale, runSpeed = RUN_SPEED * scale;
  const walkLength = clips[1].duration, runLength = clips[2].duration;
  // Stride lengths (metres per cycle), so the blended stride sets how fast both cycles play.
  const walkStride = walkSpeed * walkLength, runStride = runSpeed * runLength;
  let shown = 0, stopped = false;
  const update = mixer.update;
  const state: Locomotion = {
    speed: 0, walkSpeed, runSpeed,
    stop() { stopped = true;mixer.update = update; },
  };
  mixer.update = (delta: number) => {
    if (stopped) return update.call(mixer, delta);
    const target = Math.max(0, Number.isFinite(state.speed) ? state.speed : 0);
    shown += (target - shown) * (smoothing > 0 ? 1 - Math.exp(-delta / smoothing) : 1);
    if (Math.abs(shown - target) < 1e-3) shown = target;
    // Standing to walking over the first half of the walk speed; walking to running between the two.
    const moving = MathUtils.clamp(shown / (walkSpeed * 0.5), 0, 1);
    const toRun = MathUtils.clamp((shown - walkSpeed) / (runSpeed - walkSpeed), 0, 1);
    idleAction.setEffectiveWeight(1 - moving);
    walkAction.setEffectiveWeight(moving * (1 - toRun));
    runAction.setEffectiveWeight(moving * toRun);
    // Both cycles play at the rate that covers the ground at this speed, with the stride blended between them; below a
    // slow walk the steps keep a steady minimum pace rather than freezing mid-stride.
    const stride = MathUtils.lerp(walkStride, runStride, toRun), rate = Math.max(shown, walkSpeed * 0.45) / stride;
    walkAction.setEffectiveTimeScale(rate * walkLength);runAction.setEffectiveTimeScale(rate * runLength);
    update.call(mixer, delta);
    // The run follows the walk's phase, so the feet stay in step through the blend.
    runAction.time = (walkAction.time / walkLength) * runLength;
    return mixer;
  };
  return state;
}

// --- Looking at things ---------------------------------------------------------------------------------------------

export interface LookOptions {
  /** How far the head turns, from 0 to 1 (default 1). */
  amount?: number;
  /** How quickly the head turns, in seconds (default 0.2). */
  smoothing?: number;
}
/** The neck takes part of the turn and the head the rest; limits keep it natural. */
const SHARES: [string, number][] = [['Neck', 0.4], ['Head', 0.6]];
const MAX_YAW = MathUtils.degToRad(75), MAX_PITCH = MathUtils.degToRad(35);

export function lookControls(root: Object3D) {
  const bones = SHARES.map(([name, share]) => ({ bone: root.getObjectByName(name) as Bone | undefined, share })).filter((b) => b.bone);
  const head = root.getObjectByName('Head');
  let target: Vector3 | Object3D | null = null, amount = 1, smoothing = 0.2, yaw = 0, pitch = 0, weight = 0;
  const point = new Vector3(), from = new Vector3(), up = new Vector3(0, 1, 0), right = new Vector3(), forward = new Vector3();
  const rootQ = new Quaternion(), turn = new Quaternion(), tilt = new Quaternion(), world = new Quaternion(), parent = new Quaternion();
  return {
    lookAt(next: Vector3 | Object3D | null, options: LookOptions = {}) {
      target = next;amount = MathUtils.clamp(options.amount ?? 1, 0, 1);smoothing = options.smoothing ?? 0.2;
    },
    /** After the mixer has posed the body: turns the neck and head towards the target. */
    update(delta: number) {
      if (!head || !bones.length) return;
      let wantYaw = 0, wantPitch = 0, wantWeight = 0;
      if (target) {
        root.updateWorldMatrix(true, true);
        if ((target as Object3D).isObject3D) (target as Object3D).getWorldPosition(point);else point.copy(target as Vector3);
        head.getWorldPosition(from);
        // The direction in the character's own frame: +Z is where the body faces.
        root.getWorldQuaternion(rootQ);
        const d = point.sub(from).applyQuaternion(rootQ.clone().invert());
        if (d.lengthSq() > 1e-6) {
          wantYaw = Math.atan2(d.x, d.z);
          wantPitch = Math.atan2(-d.y, Math.hypot(d.x, d.z));
          // Behind the character: ease back to the front instead of snapping round.
          const behind = Math.abs(wantYaw) > MathUtils.degToRad(120);
          wantYaw = MathUtils.clamp(wantYaw, -MAX_YAW, MAX_YAW);wantPitch = MathUtils.clamp(wantPitch, -MAX_PITCH, MAX_PITCH);
          wantWeight = behind ? 0 : amount;
        }
      }
      const k = smoothing > 0 ? 1 - Math.exp(-delta / smoothing) : 1;
      yaw += (wantYaw - yaw) * k;pitch += (wantPitch - pitch) * k;weight += (wantWeight - weight) * k;
      if (weight < 1e-3) return;
      root.getWorldQuaternion(rootQ);
      up.set(0, 1, 0).applyQuaternion(rootQ);right.set(1, 0, 0).applyQuaternion(rootQ);forward.set(0, 0, 1).applyQuaternion(rootQ);
      for (const { bone, share } of bones) {
        // Turn in world space about the body's up axis, then tilt about its side axis, on top of the animated pose.
        turn.setFromAxisAngle(up, yaw * share * weight);
        tilt.setFromAxisAngle(right.clone().applyQuaternion(turn), pitch * share * weight);
        bone!.getWorldQuaternion(world);
        bone!.parent!.getWorldQuaternion(parent);
        bone!.quaternion.copy(parent.invert().multiply(tilt.multiply(turn)).multiply(world));
        bone!.updateWorldMatrix(false, true);
      }
    },
  };
}

// --- Lip-sync ------------------------------------------------------------------------------------------------------

export interface LipSync {
  /** Stops moving the mouth and closes it. The audio keeps playing. */
  stop(): void;
}
export type LipSyncSource = HTMLMediaElement | MediaStream | AudioNode;

let context: AudioContext | undefined;
const elementSources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();

/**
 * Reads the sound as it plays and picks a mouth shape for it: closed in silence, rounded for low vowels, open for
 * mid ones, wide for bright ones, and teeth together for hissing sounds. Loudness sets how far the mouth opens.
 */
export function lipSync(source: LipSyncSource, setMouth: (shape: string | null, weight?: number) => void) {
  const audio = (source as AudioNode).context as AudioContext | undefined ?? (context ??= new AudioContext());
  const analyser = audio.createAnalyser();analyser.fftSize = 1024;analyser.smoothingTimeConstant = 0.35;
  let input: AudioNode;
  if (typeof HTMLMediaElement !== 'undefined' && source instanceof HTMLMediaElement) {
    // A media element can be connected only once; keep its node, and keep it playing through the speakers.
    let node = elementSources.get(source);
    if (!node) { node = audio.createMediaElementSource(source);node.connect(audio.destination);elementSources.set(source, node); }
    input = node;
    source.addEventListener('play', () => void audio.resume());
  } else if (typeof MediaStream !== 'undefined' && source instanceof MediaStream) input = audio.createMediaStreamSource(source);
  else input = source as AudioNode;
  input.connect(analyser);void audio.resume();
  const bins = new Float32Array(analyser.frequencyBinCount), wave = new Float32Array(analyser.fftSize);
  const hz = audio.sampleRate / analyser.fftSize;
  const band = (lo: number, hi: number) => { let sum = 0;for (let i = Math.floor(lo / hz); i <= Math.min(bins.length - 1, Math.ceil(hi / hz)); i++) sum += 10 ** (bins[i] / 10);return sum; };
  let shape: string | null = null, candidate: string | null = null, held = 0, open = 0, stopped = false, peak = 0.05;
  return {
    stop() { if (stopped) return;stopped = true;input.disconnect(analyser);setMouth(null); },
    update(delta: number) {
      if (stopped) return;
      analyser.getFloatTimeDomainData(wave);analyser.getFloatFrequencyData(bins);
      let rms = 0;for (const v of wave) rms += v * v;rms = Math.sqrt(rms / wave.length);
      // Loudness relative to the recent peak, so quiet and loud recordings both open the mouth fully.
      peak = Math.max(rms, peak * Math.exp(-delta / 3), 0.02);
      const level = MathUtils.clamp((rms / peak - 0.12) / 0.6, 0, 1);
      // Where the voice's energy sits: low for rounded vowels (o, u), middle for open ones (a), high for wide ones (e, i),
      // and above the voice for hissing sounds (s, sh, f).
      let power = 0, weighted = 0;
      for (let i = Math.floor(200 / hz); i <= Math.min(bins.length - 1, Math.ceil(4000 / hz)); i++) { const p = 10 ** (bins[i] / 10);power += p;weighted += p * i * hz; }
      const centre = power > 0 ? weighted / power : 0, hiss = band(4500, 9000);
      let next: string | null = null;
      if (level > 0.05) next = hiss > power * 0.6 ? 'viseme_SS' : centre < 900 ? 'viseme_O' : centre < 1700 ? 'viseme_aa' : 'viseme_E';
      // A new shape takes over only once it has lasted a moment, so the mouth doesn't flicker.
      if (next === candidate) held += delta;else { candidate = next;held = delta; }
      if (candidate !== shape && held >= (candidate === null ? 0.08 : 0.05)) shape = candidate;
      const want = shape ? MathUtils.lerp(0.35, 1, level) : 0;
      open += (want - open) * (1 - Math.exp(-delta / 0.06));
      setMouth(open > 0.02 ? shape ?? 'viseme_aa' : null, open);
    },
  };
}
