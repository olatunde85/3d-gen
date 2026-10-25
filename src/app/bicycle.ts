/**
 * A bicycle for the Ride bicycle clip, built to fit the rider: the saddle sits under the hips, the
 * grips under the hands and the crank at the centre of the pedalling circle, all measured from the
 * clip on this character. Each frame the crank turns to follow the left foot and the wheels spin.
 * Preview only (three.js); units are metres, the character faces +Z, +X is its left.
 */
import * as THREE from 'three';
import type { Animator } from '../core/anim/evaluate';
import type { Clip } from '../core/anim/clips';
import type { Vec3 } from '../core/math';
import { boneFor } from '../core/rig/poses';
import type { Rig } from '../core/rig/rig';

export const BICYCLE_CLIP = 'ride_bicycle';

type V = THREE.Vector3;
const vec = (p: Vec3 | number[]) => new THREE.Vector3(p[0], p[1], p[2]);

/** The joints the bike is fitted to (positions in model space). */
function joints(rig: Rig, pos: Vec3[]) {
  const at = (g: string) => {
    const i = rig.bones.findIndex((b) => b.name === boneFor(rig.type, g));
    return i >= 0 ? vec(pos[i]) : undefined;
  };
  // The pedal sits under the ball of the foot: between the ankle and the toes.
  const ball = (s: string) => {
    const a = at(`${s}Foot`), t = at(`${s}ToeBase`);
    return a && t ? a.clone().lerp(t, 0.75) : a;
  };
  // Grips run through the closed fist: the centre of the knuckles and the curled middle joints.
  const palm = (s: string) => {
    const pts = ['HandIndex1', 'HandPinky1', 'HandIndex2', 'HandMiddle2', 'HandRing2', 'HandMiddle3'].map((f) => at(`${s}${f}`));
    if (pts.some((p) => !p)) {
      const w = at(`${s}Hand`), m = at(`${s}HandMiddle1`);
      return w && m ? w.clone().lerp(m, 0.75) : w;
    }
    return pts.reduce<V>((a, p) => a.add(p!), new THREE.Vector3()).divideScalar(pts.length);
  };
  const thigh = (s: string): [V, V] | undefined => {
    const a = at(`${s}UpLeg`), b = at(`${s}Leg`);
    return a && b ? [a, b] : undefined;
  };
  return { hips: at('Hips'), hl: palm('Left'), hr: palm('Right'), bl: ball('Left'), br: ball('Right'), tl: thigh('Left'), tr: thigh('Right') };
}

export class Bicycle {
  readonly group = new THREE.Group();
  private crank = new THREE.Group();
  private wheels: THREE.Group[] = [];
  private crankCentre: V;
  private lastAngle = 0;
  private wheelAngle = 0;

  constructor(private rig: Rig, animator: Animator, clip: Clip) {
    // Measure the clip: hips and hands averaged, the pedal circle from both balls of the feet.
    const n = 24;
    const hips = new THREE.Vector3(), hl = new THREE.Vector3(), hr = new THREE.Vector3();
    const balls: V[] = [];
    const thighs: [V, V][] = [];
    let lowHips = Infinity;
    for (let k = 0; k < n; k++) {
      const j = joints(rig, animator.positions(animator.frame(clip, (k / n) * clip.duration)));
      if (!j.hips || !j.hl || !j.hr || !j.bl || !j.br) throw new Error('rig without hands or feet');
      hips.add(j.hips);
      lowHips = Math.min(lowHips, j.hips.y);
      hl.add(j.hl);
      hr.add(j.hr);
      balls.push(j.bl, j.br);
      if (j.tl) thighs.push(j.tl);
      if (j.tr) thighs.push(j.tr);
    }
    hips.divideScalar(n);
    hl.divideScalar(n);
    hr.divideScalar(n);
    const C = balls.reduce((s, b) => s.add(b), new THREE.Vector3()).divideScalar(balls.length);
    C.x = 0;
    const crankR = balls.reduce((s, b) => s + Math.hypot(b.y - C.y, b.z - C.z), 0) / balls.length;
    this.crankCentre = C;

    // Wheels: 26-inch for an adult, scaled with the rider; placed around the crank.
    const scale = Math.min(1.15, Math.max(0.7, (hips.y + 0.1) / 1.0));
    const wr = 0.33 * scale, tyre = 0.022 * scale;
    const rear = new THREE.Vector3(0, wr, C.z - 0.43 * scale);
    const front = new THREE.Vector3(0, wr, C.z + 0.62 * scale);
    // Saddle under the sit bones; grips under the palms; the head tube between the bars and the front hub.
    const saddle = new THREE.Vector3(0, lowHips - 0.08 * scale, hips.z - 0.04 * scale);
    // The bar runs through the palms; the stem comes forward and down from it to the head tube.
    const grips = hl.clone().add(hr).multiplyScalar(0.5);
    const stemTop = new THREE.Vector3(0, grips.y - 0.01 * scale, grips.z);
    // Top tube and head tube as low as the thighs need: lower them until every thigh (hip to knee,
    // about 8 cm thick) clears the top tube and stem through the whole pedal stroke.
    const clear = 0.085 * scale;
    const segDist = (a: V, b: V, c: V, d: V) => {
      let m = Infinity;
      for (let i = 0; i <= 12; i++) {
        const p = a.clone().lerp(b, i / 12);
        const cd = d.clone().sub(c), t = Math.max(0, Math.min(1, p.clone().sub(c).dot(cd) / cd.lengthSq()));
        m = Math.min(m, p.distanceTo(c.clone().addScaledVector(cd, t)));
      }
      return m;
    };
    let drop = 0.07 * scale, seatK = 0.78, headTop = new THREE.Vector3(), seatCluster = new THREE.Vector3();
    for (let it = 0; it < 30; it++) {
      headTop = new THREE.Vector3(0, stemTop.y - drop, stemTop.z - 0.06 * scale);
      seatCluster = C.clone().lerp(saddle, seatK);
      const worst = Math.min(...thighs.map(([a, b]) => Math.min(segDist(seatCluster, headTop, a, b), segDist(headTop, stemTop, a, b))));
      if (worst >= clear) break;
      drop += 0.012 * scale;
      seatK = Math.max(0.55, seatK - 0.015);
    }
    const headBottom = headTop.clone().lerp(front, 0.28);

    const paint = new THREE.MeshStandardMaterial({ color: '#c8342b', roughness: 0.35, metalness: 0.45 });
    const metal = new THREE.MeshStandardMaterial({ color: '#b9bec7', roughness: 0.3, metalness: 0.9 });
    const dark = new THREE.MeshStandardMaterial({ color: '#1b1c1f', roughness: 0.75, metalness: 0.1 });
    const rubber = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.9 });

    const tube = (a: V, b: V, r: number, mat: THREE.Material, parent: THREE.Object3D = this.group) => {
      const len = a.distanceTo(b);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14), mat);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    const s = scale;
    // Frame
    tube(C, headBottom, 0.019 * s, paint); // down tube
    tube(seatCluster, headTop, 0.016 * s, paint); // top tube
    tube(C, seatCluster, 0.017 * s, paint); // seat tube
    tube(headBottom, headTop, 0.02 * s, paint); // head tube
    for (const x of [1, -1]) {
      const r = rear.clone().setX(0.055 * s * x);
      tube(C.clone().setX(0.03 * s * x), r, 0.009 * s, paint); // chain stays
      tube(seatCluster.clone().setX(0.012 * s * x), r, 0.008 * s, paint); // seat stays
      const f = front.clone().setX(0.05 * s * x);
      tube(headBottom.clone().setX(0.025 * s * x), f, 0.011 * s, metal); // fork blades
    }
    tube(seatCluster, saddle.clone().add(new THREE.Vector3(0, -0.03 * s, 0.01 * s)), 0.012 * s, metal); // seat post
    tube(headTop, stemTop, 0.013 * s, metal); // stem
    // Handlebar: straight across the grips, with dark grips at the ends.
    const half = Math.max(0.22 * s, Math.abs(hl.x - hr.x) / 2 + 0.05 * s);
    tube(new THREE.Vector3(-half, stemTop.y, stemTop.z), new THREE.Vector3(half, stemTop.y, stemTop.z), 0.011 * s, metal);
    for (const x of [1, -1]) tube(new THREE.Vector3(x * (half - 0.11 * s), stemTop.y, stemTop.z), new THREE.Vector3(x * half, stemTop.y, stemTop.z), 0.017 * s, dark);
    // Saddle: a rounded wedge, wide at the back.
    const seat = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), dark);
    seat.scale.set(0.075 * s, 0.025 * s, 0.14 * s);
    seat.position.copy(saddle).add(new THREE.Vector3(0, 0, 0.02 * s));
    seat.castShadow = true;
    this.group.add(seat);

    // Wheels: tyre, rim, hub and spokes, spinning about the axle.
    for (const centre of [rear, front]) {
      const w = new THREE.Group();
      w.position.copy(centre);
      const tyreMesh = new THREE.Mesh(new THREE.TorusGeometry(wr - tyre, tyre, 12, 64), rubber);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(wr - tyre * 2.2, 0.007 * s, 8, 64), metal);
      for (const m of [tyreMesh, rim]) {
        m.rotation.y = Math.PI / 2;
        m.castShadow = true;
        w.add(m);
      }
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.02 * s, 0.02 * s, 0.1 * s, 12), metal);
      hub.rotation.z = Math.PI / 2;
      w.add(hub);
      for (let k = 0; k < 18; k++) {
        const a = (k / 18) * Math.PI * 2, x = (k % 2 ? 1 : -1) * 0.035 * s;
        tube(new THREE.Vector3(x, 0, 0), new THREE.Vector3(0, Math.sin(a) * (wr - tyre * 2.3), Math.cos(a) * (wr - tyre * 2.3)), 0.0016 * s, metal, w);
      }
      this.group.add(w);
      this.wheels.push(w);
    }

    // Drivetrain: chainring and chain on the right (-X), crank arms and pedals turning about C.
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1 * s, 0.006 * s, 6, 40), dark);
    ring.rotation.y = Math.PI / 2;
    this.crank.add(ring);
    const chainX = -0.06 * s;
    ring.position.x = chainX;
    const top = new THREE.Vector3(chainX, C.y + 0.1 * s, C.z), bot = new THREE.Vector3(chainX, C.y - 0.1 * s, C.z);
    tube(top, new THREE.Vector3(chainX, rear.y + 0.04 * s, rear.z), 0.004 * s, dark);
    tube(bot, new THREE.Vector3(chainX, rear.y - 0.04 * s, rear.z), 0.004 * s, dark);
    this.crank.position.copy(C);
    for (const [x, dir] of [[0.075, 1], [-0.085, -1]] as const) {
      // Left arm points to angle 0 (straight up at rest); the right one opposite.
      const end = new THREE.Vector3(x * s, dir * crankR, 0);
      tube(new THREE.Vector3(x * s, 0, 0), end, 0.009 * s, metal, this.crank);
      const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.1 * s, 0.02 * s, 0.07 * s), dark);
      pedal.position.copy(end).add(new THREE.Vector3(Math.sign(x) * 0.05 * s, 0, 0));
      pedal.castShadow = true;
      pedal.userData.counter = true; // stays level while the crank turns
      this.crank.add(pedal);
    }
    tube(C.clone().setX(-0.08 * s), C.clone().setX(0.07 * s), 0.02 * s, metal); // bottom bracket
    this.group.add(this.crank);
  }

  /** Follow the rider: the crank points at the left foot; the wheels turn with it (about 2.5:1). */
  update(pos: Vec3[]): void {
    const { bl } = joints(this.rig, pos);
    if (!bl) return;
    const a = Math.atan2(bl.z - this.crankCentre.z, bl.y - this.crankCentre.y); // 0 = up, + = forward
    let d = a - this.lastAngle;
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    this.lastAngle = a;
    this.crank.rotation.x = a;
    for (const c of this.crank.children) if (c.userData.counter) c.rotation.x = -a;
    this.wheelAngle += d * 2.5;
    for (const w of this.wheels) w.rotation.x = this.wheelAngle;
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    const mats = new Set<THREE.Material>();
    this.group.traverse((o) => o instanceof THREE.Mesh && mats.add(o.material as THREE.Material));
    mats.forEach((m) => m.dispose());
  }
}
