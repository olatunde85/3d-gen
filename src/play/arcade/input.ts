/**
 * Arcade input: keyboard and gamepad as before, plus swipes, one-thumb steering and optional phone tilt. Listeners
 * stay attached; they only act while the arcade player is active and its game is running.
 */
export type Swipe = 'left' | 'right' | 'up' | 'down';
export class ArcadeInput {
  active = false; tilt = false;
  readonly keys = new Set<string>();
  /** One-thumb steering: horizontal drag from where the thumb landed, -1 (left) to 1 (right). */
  thumb = 0; touching = false; tiltValue = 0;
  private pressed = new Set<string>(); private swipes: Swipe[] = []; private start?: { id: number; x: number; y: number; t: number; swiped: boolean };
  private pad = { buttons: [] as boolean[] };
  constructor(surface: HTMLElement) {
    addEventListener('keydown', (e) => { if (!this.active || (e.target as HTMLElement).closest?.('input,select,textarea')) return;if (!e.repeat) this.pressed.add(e.code);this.keys.add(e.code);if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault(); });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear();this.thumb = 0;this.touching = false; });
    surface.addEventListener('pointerdown', (e) => {
      if (!this.active || e.pointerType === 'mouse' || (e.target as HTMLElement).closest('button')) return;
      this.start = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), swiped: false };this.touching = true;this.thumb = 0;
    });
    surface.addEventListener('pointermove', (e) => {
      const s = this.start;if (!this.active || !s || s.id !== e.pointerId) return;
      const dx = e.clientX - s.x, dy = e.clientY - s.y;this.thumb = Math.max(-1, Math.min(1, dx / 70));
      // A quick, decisive flick counts as one swipe; the thumb keeps steering afterwards.
      if (!s.swiped && Math.hypot(dx, dy) > 34 && performance.now() - s.t < 450) { s.swiped = true;this.swipes.push(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'); }
    });
    const end = (e: PointerEvent) => { if (this.start?.id === e.pointerId) { this.start = undefined;this.touching = false;this.thumb = 0; } };
    surface.addEventListener('pointerup', end);surface.addEventListener('pointercancel', end);
    addEventListener('deviceorientation', (e) => {
      if (e.gamma === null) return;
      // Landscape holds turn the phone's roll into the beta axis.
      const landscape = Math.abs((screen.orientation?.angle ?? 0) % 180) === 90, angle = landscape ? (e.beta ?? 0) * ((screen.orientation?.angle ?? 0) === 90 ? 1 : -1) : e.gamma;
      this.tiltValue = Math.max(-1, Math.min(1, angle / 22));
    });
  }
  /** iOS asks for motion access from a tap. */
  async enableTilt() {
    const request = (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission;
    try { if (request && (await request()) !== 'granted') return false; } catch { return false; }
    this.tilt = true;return true;
  }
  /** True once per key press. */
  tap(...codes: string[]) { let hit = false;for (const c of codes) if (this.pressed.delete(c)) hit = true;return hit; }
  held(...codes: string[]) { return codes.some((c) => this.keys.has(c)); }
  takeSwipes() { const out = this.swipes;this.swipes = [];return out; }
  private snapshot?: ReturnType<ArcadeInput['read']>;
  /** Read the gamepad once per frame, so every reader sees the same button presses. */
  poll() { this.snapshot = this.read(); }
  /** Standard-mapping gamepad: buttons as pressed edges and held states, plus the left stick and triggers. */
  gamepad() { return this.snapshot; }
  private read() {
    const pad = [...(navigator.getGamepads?.() ?? [])].find((p) => p?.connected && p.mapping === 'standard');
    if (!pad) return;
    const now = pad.buttons.map((b) => b.pressed), edge = now.map((b, i) => b && !this.pad.buttons[i]);this.pad.buttons = now;
    const dead = (v: number) => (Math.abs(v) < 0.15 ? 0 : v);
    return { stick: dead(pad.axes[0] ?? 0), stickY: dead(pad.axes[1] ?? 0), throttle: pad.buttons[7]?.value ?? 0, brake: pad.buttons[6]?.value ?? 0, held: now, edge };
  }
  clear() { this.pressed.clear();this.swipes = [];this.keys.clear(); }
}
