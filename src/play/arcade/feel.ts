/**
 * The feel of speed: the field of view widens with speed, impacts shake the camera, speed lines and a soft edge
 * blur grow with pace, boosts flash the screen and near misses briefly slow time. All screen effects are one 2D
 * overlay canvas, so they cost a few hundred line draws a frame.
 */
export class SpeedFeel {
  readonly overlay = document.createElement('canvas');
  private context = this.overlay.getContext('2d');
  private shakeAmount = 0; private flashAmount = 0; private flashColor = '255,255,255'; private slow = 0; private lines: { a: number; r: number; len: number; w: number }[] = [];
  /** 0..1 pace and whether a boost is running, updated every frame. */
  ratio = 0; boosting = false; reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  constructor() {
    this.overlay.className = 'arcade-speed';this.overlay.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 90; i++) this.lines.push({ a: Math.random() * Math.PI * 2, r: Math.random(), len: 0.2 + Math.random() * 0.4, w: 0.6 + Math.random() * 1.6 });
  }
  shake(amount: number) { if (!this.reduced) this.shakeAmount = Math.min(1, this.shakeAmount + amount); }
  flash(amount = 0.45, color = '255,255,255') { this.flashAmount = Math.max(this.flashAmount, this.reduced ? amount * 0.4 : amount);this.flashColor = color; }
  /** Slow time for `seconds` of real time. */
  slowMotion(seconds = 0.4) { if (!this.reduced) this.slow = Math.max(this.slow, seconds); }
  get timeScale() { return this.slow > 0 ? 0.35 : 1; }
  fov(base: number) { return base + this.ratio * 20 + (this.boosting ? 7 : 0); }
  /** A camera offset in metres for the current shake. */
  offset(time: number) { const s = this.shakeAmount * 0.32;return { x: Math.sin(time * 61) * s, y: Math.sin(time * 47 + 1) * s * 0.7, z: Math.sin(time * 53 + 2) * s * 0.5 }; }
  update(dt: number) {
    this.shakeAmount = Math.max(0, this.shakeAmount - dt * 2.6);this.flashAmount = Math.max(0, this.flashAmount - dt * 2.4);this.slow = Math.max(0, this.slow - dt);
    const c = this.context, canvas = this.overlay;if (!c) return;
    const w = canvas.clientWidth, h = canvas.clientHeight, dpr = Math.min(devicePixelRatio, 1.5);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr);canvas.height = Math.round(h * dpr); }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);c.clearRect(0, 0, w, h);
    const pace = Math.max(0, (this.ratio - 0.45) / 0.55) + (this.boosting ? 0.5 : 0);
    if (pace > 0 && !this.reduced) {
      // Streaks fly out from the centre; a soft dark edge stands in for motion blur.
      const cx = w / 2, cy = h * 0.46, reach = Math.hypot(w, h) / 2, count = Math.round(this.lines.length * Math.min(1, pace));
      c.strokeStyle = `rgba(255,255,255,${Math.min(0.5, 0.18 + pace * 0.22)})`;c.lineCap = 'round';
      for (let i = 0; i < count; i++) {
        const l = this.lines[i];l.r += dt * (1.2 + pace * 2.2);if (l.r > 1) { l.r = 0.35;l.a = Math.random() * Math.PI * 2; }
        const r0 = reach * l.r, r1 = r0 + reach * l.len * (0.4 + pace * 0.4);c.lineWidth = l.w;c.beginPath();c.moveTo(cx + Math.cos(l.a) * r0, cy + Math.sin(l.a) * r0);c.lineTo(cx + Math.cos(l.a) * r1, cy + Math.sin(l.a) * r1);c.stroke();
      }
      const blur = c.createRadialGradient(cx, cy, reach * 0.45, cx, cy, reach);blur.addColorStop(0, 'rgba(10,14,20,0)');blur.addColorStop(1, `rgba(10,14,20,${Math.min(0.42, pace * 0.3)})`);
      c.fillStyle = blur;c.fillRect(0, 0, w, h);
    }
    if (this.flashAmount > 0) { c.fillStyle = `rgba(${this.flashColor},${this.flashAmount})`;c.fillRect(0, 0, w, h); }
  }
  reset() { this.shakeAmount = 0;this.flashAmount = 0;this.slow = 0; }
}
