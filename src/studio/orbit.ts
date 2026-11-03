/** Persistent camera offsets shared by pointer, touch, keyboard and deterministic exports. */
import type { View } from './project';
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
export function orbitControls(canvas: HTMLCanvasElement, state: () => View, enabled: () => boolean, begin: () => void, change: (v: View) => void, end: () => void) {
  const pointers = new Map<number, { x: number; y: number }>();
  let wheelTimer = 0;
  const rotate = (dx: number, dy: number) => { const v = state(); change({ ...v, azimuth: ((v.azimuth + dx + 540) % 360) - 180, elevation: clamp(v.elevation + dy, -35, 65) }); };
  const zoom = (factor: number) => change({ ...state(), zoom: clamp(state().zoom * factor, 0.5, 3) });
  canvas.addEventListener('pointerdown', e => { if (!enabled() || e.pointerType === 'mouse' && e.button !== 0) return;
    if (!pointers.size) begin(); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); canvas.setPointerCapture(e.pointerId); canvas.classList.add('orbiting');
  });
  canvas.addEventListener('pointermove', e => {
    const before = pointers.get(e.pointerId); if (!before || !enabled()) return;
    const other = [...pointers.entries()].find(([id]) => id !== e.pointerId)?.[1];
    if (other) { const a = Math.hypot(before.x-other.x,before.y-other.y), b = Math.hypot(e.clientX-other.x,e.clientY-other.y); if(a>4&&b>4)zoom(a/b); }
    else rotate((e.clientX-before.x)/Math.max(200,canvas.clientWidth)*240,(e.clientY-before.y)/Math.max(200,canvas.clientHeight)*100);
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  });
  const stop = (e: PointerEvent) => { if(!pointers.delete(e.pointerId))return; if(!pointers.size){canvas.classList.remove('orbiting');end();} };
  canvas.addEventListener('pointerup',stop);canvas.addEventListener('pointercancel',stop);canvas.addEventListener('lostpointercapture',stop);
  canvas.addEventListener('wheel',e=>{if(!enabled())return;e.preventDefault();if(!wheelTimer)begin();zoom(Math.exp(clamp(e.deltaY,-200,200)*0.0015));clearTimeout(wheelTimer);wheelTimer=window.setTimeout(()=>{wheelTimer=0;end();},220);},{passive:false});
  canvas.addEventListener('keydown',e=>{if(!enabled()||e.ctrlKey||e.metaKey||e.altKey)return;const keys=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Home'];if(!keys.includes(e.key))return;e.preventDefault();e.stopPropagation();begin();
    if(e.key==='Home')change({azimuth:0,elevation:0,zoom:1});else if(e.key==='+'||e.key==='=')zoom(0.9);else if(e.key==='-')zoom(1.1);else rotate(e.key==='ArrowLeft'?-10:e.key==='ArrowRight'?10:0,e.key==='ArrowUp'?5:e.key==='ArrowDown'?-5:0);end();
  });
}
