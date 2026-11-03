/** One pointer owner for orbiting, picking and actor placement, including touch gestures. */
import type { View } from './project';
export interface PlacementActor { id: string; x: number; y: number; z: number; worldX: number; worldZ: number; screenX: number; screenY: number }
export interface PlacementControls {
  pick(x: number, y: number): string | undefined;
  select(id: string): void;
  selected(): PlacementActor | undefined;
  point(x: number, y: number, elevation: number): { x: number; z: number } | undefined;
  clickToPlace(): boolean;
  begin(): void;
  move(x: number, z: number): void;
  end(cancelled: boolean): void;
}
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
export function orbitControls(canvas: HTMLCanvasElement, state: () => View, enabled: () => boolean, begin: () => void, change: (v: View) => void, end: () => void, placement?: PlacementControls) {
  const pointers = new Map<number, { x: number; y: number }>();
  type Gesture = { kind: 'orbit' | 'actor' | 'place' | 'pinch'; downX: number; downY: number; started: boolean; actor?: PlacementActor; anchor?: { x: number; z: number } };
  let gesture: Gesture | undefined, wheelTimer = 0;
  const rotate = (dx: number, dy: number) => { const v = state(); change({ ...v, azimuth: ((v.azimuth + dx + 540) % 360) - 180, elevation: clamp(v.elevation + dy, -35, 65) }); };
  const zoom = (factor: number) => change({ ...state(), zoom: clamp(state().zoom * factor, 0.5, 3) });
  function startOrbit() { if (!gesture || gesture.started) return; gesture.started = true; begin(); canvas.classList.add('orbiting'); }
  function startPlacement() { if (!gesture || gesture.started || !placement) return; gesture.started = true; placement.begin(); canvas.classList.add('placing'); }
  function placeAt(x: number, y: number) {
    const g = gesture; if (!g?.actor || !placement) return;
    const point = placement.point(g.kind === 'actor' ? x + g.actor.screenX - g.downX : x, g.kind === 'actor' ? y + g.actor.screenY - g.downY : y, g.actor.y); if (!point) return;
    startPlacement();
    if (g.kind === 'actor' && g.anchor) placement.move(g.actor.x + point.x - g.anchor.x, g.actor.z + point.z - g.anchor.z);
    else placement.move(point.x - (g.actor.worldX - g.actor.x), point.z - (g.actor.worldZ - g.actor.z));
  }
  canvas.addEventListener('pointerdown', e => {
    if (!enabled() || e.pointerType === 'mouse' && ![0, 2].includes(e.button)) return;
    if (wheelTimer) { clearTimeout(wheelTimer); wheelTimer=0; end(); }
    if (pointers.size) {
      // A second finger changes to camera control; it never leaves an accidental actor move.
      if (gesture?.started && (gesture.kind === 'actor' || gesture.kind === 'place')) placement?.end(true);
      else if (gesture?.started) end();
      gesture = { kind: 'pinch', downX: e.clientX, downY: e.clientY, started: false };
      startOrbit();
    } else {
      const orbitOnly = e.altKey || e.button === 2;
      const hit = orbitOnly ? undefined : placement?.pick(e.clientX, e.clientY);
      if (hit) placement?.select(hit);
      const actor = placement?.selected();
      const kind = hit ? 'actor' : !orbitOnly && actor && (e.shiftKey || placement?.clickToPlace()) ? 'place' : 'orbit';
      gesture = { kind, downX: e.clientX, downY: e.clientY, started: false, actor,
        anchor: actor ? placement?.point(kind === 'actor' ? actor.screenX : e.clientX, kind === 'actor' ? actor.screenY : e.clientY, actor.y) : undefined };
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    const before = pointers.get(e.pointerId), g = gesture; if (!before || !g || !enabled()) return;
    const other = [...pointers.entries()].find(([id]) => id !== e.pointerId)?.[1];
    if (other) {
      const a = Math.hypot(before.x - other.x, before.y - other.y), b = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      if (a > 4 && b > 4) zoom(a / b);
    } else if (g.kind !== 'pinch' && (g.started || Math.hypot(e.clientX - g.downX, e.clientY - g.downY) >= 4)) {
      if (g.kind === 'actor' || g.kind === 'place') placeAt(e.clientX, e.clientY);
      else { startOrbit(); rotate(-(e.clientX - before.x) / Math.max(200, canvas.clientWidth) * 240, (e.clientY - before.y) / Math.max(200, canvas.clientHeight) * 100); }
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  function finish(cancelled: boolean, x: number, y: number) {
    const g = gesture; if (!g) return;
    if (g.kind === 'place' && !g.started && !cancelled) placeAt(x, y);
    if (g.started) { if (g.kind === 'actor' || g.kind === 'place') placement?.end(cancelled); else end(); }
    gesture = undefined; canvas.classList.remove('orbiting', 'placing');
  }
  const stop = (e: PointerEvent) => {
    if (!pointers.delete(e.pointerId)) return;
    if (!pointers.size) finish(e.type === 'pointercancel' || e.type === 'lostpointercapture', e.clientX, e.clientY);
  };
  canvas.addEventListener('pointerup', stop); canvas.addEventListener('pointercancel', stop); canvas.addEventListener('lostpointercapture', stop);
  function cancel() {
    const ids = [...pointers.keys()]; pointers.clear(); finish(true, 0, 0);
    for (const id of ids) if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  }
  window.addEventListener('blur', cancel);
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('wheel', e => {
    if (!enabled()) return; e.preventDefault(); if (pointers.size) return;
    if (!wheelTimer) begin(); zoom(Math.exp(clamp(e.deltaY, -200, 200) * 0.0015));
    clearTimeout(wheelTimer); wheelTimer = window.setTimeout(() => { wheelTimer = 0; end(); }, 220);
  }, { passive: false });
  canvas.addEventListener('keydown', e => {
    if (e.key === 'Escape' && pointers.size) { e.preventDefault(); e.stopPropagation(); cancel(); return; }
    if(pointers.size){if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Home',' '].includes(e.key)){e.preventDefault();e.stopPropagation();}return;}
    if (!enabled() || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', 'Home'].includes(e.key)) return;
    e.preventDefault(); e.stopPropagation(); begin();
    if (e.key === 'Home') change({ azimuth: 0, elevation: 0, zoom: 1 });
    else if (e.key === '+' || e.key === '=') zoom(0.9);
    else if (e.key === '-') zoom(1.1);
    else rotate(e.key === 'ArrowLeft' ? 10 : e.key === 'ArrowRight' ? -10 : 0, e.key === 'ArrowUp' ? 5 : e.key === 'ArrowDown' ? -5 : 0);
    end();
  });
}
