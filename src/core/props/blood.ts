/**
 * Blood for gunshot reactions (clips with `wounds`): a wound mark on the body, a spray of droplets along the
 * bullet's path that land as splats, and a pool spreading under a body that is down. Everything is a pure function
 * of the time since the hit, so scrubbing, looping and offline rendering agree. Built only when a gunshot clip plays;
 * two instanced meshes and a few small meshes per character.
 */
import * as T from 'three';
import type { Clip, Wound } from '../anim/clips/types';
import type { Animator } from '../anim/evaluate';
import { boneFor } from '../rig/poses';

const DROPS = 42, MAX_HITS = 4, GRAVITY = 9.8;
const BLOOD = new T.Color('#6a0408'), DARK = new T.Color('#3a0204'), WOUND = new T.Color('#2c0103');

/** A gunshot clip in play: `elapsed` seconds into it; `place` moves its blood from the frame it was shot in to the current one. */
export interface BloodHit { clip: Clip; elapsed: number; place?: T.Matrix4 }

interface Drop { v: T.Vector3; size: number; land: number; spot: T.Vector3 }
interface Shot { origin: T.Vector3; drops: Drop[]; pool?: { at: T.Vector3; start: number }; mark: T.Mesh }

/** Seeded random numbers, so the same shot always sprays the same way. */
function random(seed: number) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

/** A blotch: a disc with a ragged edge, lying in the XZ plane. */
function blotch(seed: number, points = 28) {
  const r = random(seed), shape = new T.Shape();
  for (let i = 0; i <= points; i++) {
    const a = (i / points) * Math.PI * 2, k = i === points ? 1 : 0.84 + 0.22 * r();
    if (i === 0) shape.moveTo(k, 0); else if (i === points) shape.closePath(); else shape.lineTo(Math.cos(a) * k, Math.sin(a) * k);
  }
  return new T.ShapeGeometry(shape).rotateX(-Math.PI / 2);
}

export class Blood {
  readonly group = new T.Group();
  private readonly drops: T.InstancedMesh;
  private readonly splats: T.InstancedMesh;
  private readonly pools: T.Mesh[] = [];
  private readonly shots = new Map<string, Shot>();
  private readonly wet = new T.MeshStandardMaterial({ color: BLOOD, roughness: 0.18, metalness: 0 });
  private readonly floor = new T.MeshStandardMaterial({ color: DARK, roughness: 0.45, metalness: 0, envMapIntensity: 0.25, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  private readonly skin = new T.MeshStandardMaterial({ color: WOUND, roughness: 0.4, metalness: 0, envMapIntensity: 0.4, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });

  constructor(private readonly mesh: T.SkinnedMesh, private readonly animator: Animator, private readonly scale: number) {
    this.drops = new T.InstancedMesh(new T.IcosahedronGeometry(1, 1), this.wet, DROPS * MAX_HITS);
    this.splats = new T.InstancedMesh(blotch(7, 10), this.floor, DROPS * MAX_HITS);
    for (const m of [this.drops, this.splats]) { m.count = 0; m.frustumCulled = false; this.group.add(m); }
    this.splats.receiveShadow = true;
    for (let i = 0; i < MAX_HITS; i++) {
      const pool = new T.Mesh(blotch(31 + i), this.floor);
      pool.visible = false; pool.receiveShadow = true; pool.matrixAutoUpdate = false; this.pools.push(pool); this.group.add(pool);
    }
  }

  /** Shows the blood of these hits (most recent last); anything not listed is cleared. */
  update(hits: readonly BloodHit[]) {
    const m = new T.Matrix4(), q = new T.Quaternion(), p = new T.Vector3(), s = new T.Vector3(), up = new T.Vector3(0, 1, 0);
    let drops = 0, splats = 0, pools = 0;
    const seen = new Set<T.Mesh>();
    for (const hit of hits.slice(-MAX_HITS)) {
      (hit.clip.wounds ?? []).forEach((wound, w) => {
        const shot = this.shot(hit.clip, wound, w), dt = hit.elapsed - wound.t, place = hit.place ?? new T.Matrix4();
        if (dt < 0) return;
        // The wound grows a little as it bleeds.
        seen.add(shot.mark);
        shot.mark.visible = true;
        shot.mark.scale.setScalar(this.scale * (0.018 + 0.012 * Math.min(1, dt / 0.6)));
        for (const d of shot.drops) {
          if (dt < d.land) {
            if (drops >= this.drops.instanceMatrix.count) continue;
            p.copy(shot.origin).addScaledVector(d.v, dt);
            p.y -= 0.5 * GRAVITY * dt * dt;
            const speed = Math.hypot(d.v.x, d.v.y - GRAVITY * dt, d.v.z);
            q.setFromUnitVectors(up, new T.Vector3(d.v.x, d.v.y - GRAVITY * dt, d.v.z).normalize());
            s.set(d.size, d.size * (1 + Math.min(2.5, speed * 0.5)), d.size);
            this.drops.setMatrixAt(drops++, m.compose(p, q, s).premultiply(place));
          } else if (splats < this.splats.instanceMatrix.count) {
            const grow = Math.min(1, (dt - d.land) / 0.15), r = d.size * 2.6 * (0.6 + 0.4 * grow);
            this.splats.setMatrixAt(splats++, m.compose(d.spot, q.identity(), s.set(r, 1, r)).premultiply(place));
          }
        }
        if (shot.pool && hit.elapsed > shot.pool.start && pools < this.pools.length) {
          const pool = this.pools[pools++], r = 0.45 * this.scale * (1 - Math.exp(-(hit.elapsed - shot.pool.start) / 1.1));
          pool.visible = true;
          pool.matrix.compose(shot.pool.at, q.identity(), s.set(r, 1, r * 0.8)).premultiply(place);
          pool.matrixWorldNeedsUpdate = true;
        }
      });
    }
    for (const shot of this.shots.values()) if (!seen.has(shot.mark)) shot.mark.visible = false;
    for (let i = pools; i < this.pools.length; i++) this.pools[i].visible = false;
    this.drops.count = drops; this.splats.count = splats;
    this.drops.instanceMatrix.needsUpdate = this.splats.instanceMatrix.needsUpdate = true;
  }

  /** Where this wound is on this body, worked out once: the entry point on the skin facing the shooter. */
  private shot(clip: Clip, wound: Wound, index: number): Shot {
    const key = `${clip.id}:${index}`;
    let shot = this.shots.get(key);
    if (shot) return shot;
    const rig = this.animator.rig, bone = rig.bones.findIndex((b) => b.name === boneFor(rig.type, wound.bone));
    const bones = this.mesh.skeleton.bones, target = bones[Math.max(0, bone)];
    const { point, normal } = this.entry(Math.max(0, bone), wound);
    // The mark rides on the bone: bind-pose skin point and normal in the bone's own frame.
    const inverse = this.mesh.skeleton.boneInverses[Math.max(0, bone)], local = point.clone().applyMatrix4(inverse);
    const turn = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().extractRotation(inverse));
    const mark = new T.Mesh(blotch(11 + index, 18), this.skin);
    mark.position.copy(local).addScaledVector(normal.clone().applyQuaternion(turn), 0.002 * this.scale);
    mark.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), normal.clone().applyQuaternion(turn).normalize());
    mark.visible = false;
    target.add(mark);
    // The spray starts from the mark posed at the moment of the hit, and the pool spreads under it once the body is down.
    const at = (time: number) => this.posed(clip, time, () => mark.getWorldPosition(new T.Vector3()));
    const origin = at(wound.t), r = random(key.length * 97 + index * 13 + clip.id.charCodeAt(6));
    const dir = new T.Vector3(...wound.dir).normalize(), drops: Drop[] = [];
    for (let i = 0; i < DROPS; i++) {
      // Most droplets leave along the bullet's path; a few spatter back towards the shooter.
      const back = i % 6 === 0, spread = back ? 0.5 : 0.32, speed = (back ? 0.7 : 1.4) + (back ? 0.8 : 2.4) * r();
      const v = dir.clone().multiplyScalar(back ? -1 : 1).add(new T.Vector3(r() - 0.5, r() - 0.3, r() - 0.5).multiplyScalar(2 * spread)).normalize().multiplyScalar(speed * this.scale);
      const size = this.scale * (0.004 + 0.007 * r() * r());
      // Time to reach the floor: origin.y + v.y t - g t^2 / 2 = 0.
      const land = (v.y + Math.sqrt(v.y * v.y + 2 * GRAVITY * Math.max(0.01, origin.y))) / GRAVITY;
      drops.push({ v, size, land, spot: new T.Vector3(origin.x + v.x * land, 0.002 + i * 1e-5, origin.z + v.z * land) });
    }
    const pool = wound.pool === undefined ? undefined : { at: at(clip.duration).setY(0.003), start: wound.pool };
    shot = { origin, drops, pool, mark };
    this.shots.set(key, shot);
    return shot;
  }

  /** The skin vertex weighted to `bone` that faces the shooter, nearest the line through the bone's skin centre. */
  private entry(bone: number, wound: Wound) {
    const g = this.mesh.geometry, pos = g.getAttribute('position'), nrm = g.getAttribute('normal'), joint = g.getAttribute('skinIndex'), weight = g.getAttribute('skinWeight');
    const mine: number[] = [], c = new T.Vector3(), p = new T.Vector3();
    for (let i = 0; i < pos.count; i++) {
      let best = 0, top = -1;
      for (let k = 0; k < 4; k++) { const w = weight.getComponent(i, k); if (w > top) { top = w; best = joint.getComponent(i, k); } }
      if (best === bone && top > 0.5) { mine.push(i); c.add(p.fromBufferAttribute(pos, i)); }
    }
    const facing = new T.Vector3(...wound.dir).normalize().negate();
    if (!mine.length) return { point: new T.Vector3().setFromMatrixPosition(this.mesh.skeleton.bones[bone].matrixWorld), normal: facing };
    c.divideScalar(mine.length);
    // The forehead rather than the nose; the chest a little to the right of the breastbone.
    if (wound.bone === 'Head') c.y += 0.035 * this.scale;
    if (wound.bone === 'Spine2') c.x -= 0.05 * this.scale;
    let pick = mine[0], score = -Infinity;
    for (const i of mine) {
      p.fromBufferAttribute(pos, i).sub(c);
      const along = p.dot(facing), off = p.clone().addScaledVector(facing, -along).length(), sc = along - 3 * off;
      if (sc > score) { score = sc; pick = i; }
    }
    return { point: new T.Vector3().fromBufferAttribute(pos, pick), normal: new T.Vector3().fromBufferAttribute(nrm, pick).normalize() };
  }

  /** Reads `read()` with the body posed at `time` in `clip`, in the mesh parent's frame, then restores the pose. */
  private posed(clip: Clip, time: number, read: () => T.Vector3): T.Vector3 {
    const bones = this.mesh.skeleton.bones, saved = bones.map((b) => [b.position.clone(), b.quaternion.clone(), b.scale.clone()] as const);
    const f = this.animator.frame(clip, time);
    f.rot.forEach((r, i) => { bones[i].quaternion.set(...r); bones[i].scale.set(1, 1, 1); });
    for (const [i, x] of f.rootPos) bones[i].position.set(...x);
    this.mesh.updateMatrixWorld(true);
    const out = read();
    (this.mesh.parent ?? this.mesh).worldToLocal(out);
    bones.forEach((b, i) => { b.position.copy(saved[i][0]); b.quaternion.copy(saved[i][1]); b.scale.copy(saved[i][2]); });
    this.mesh.updateMatrixWorld(true);
    return out;
  }

  dispose() {
    for (const shot of this.shots.values()) { shot.mark.removeFromParent(); shot.mark.geometry.dispose(); }
    this.group.removeFromParent();
    this.drops.geometry.dispose(); this.splats.geometry.dispose(); this.pools.forEach((p) => p.geometry.dispose());
    this.wet.dispose(); this.floor.dispose(); this.skin.dispose(); this.drops.dispose(); this.splats.dispose();
  }
}
