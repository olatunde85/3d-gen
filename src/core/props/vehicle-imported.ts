/**
 * A car built from an imported prop (see prop-models.ts) in place of Ara's own body for its base vehicle: the rider,
 * animations and boarding stay the base car's. The prop is placed so its seat is under the rider's hips (its lift,
 * from vehicleLift, brings the hips down or up to it) with its wheels on the ground; its wheels turn as it travels,
 * its lamps join the vehicle's lights and its paint takes the style's colour.
 */
import * as T from 'three';
import type { PropModel } from './prop-models';
import type { VehicleKit } from './vehicle-kit';

/** The paint colour a prop is designed in, as #rrggbb (its material tagged paint), if it has one. */
export function propPaint(prop: PropModel): string | undefined {
  let colour: string | undefined;
  prop.template.traverse((o) => {
    const mats = (o as T.Mesh).material;
    for (const m of (Array.isArray(mats) ? mats : mats ? [mats] : []) as T.MeshStandardMaterial[]) if (!colour && m.userData.ara_role === 'paint' && m.color) colour = `#${m.color.getHexString(T.SRGBColorSpace)}`;
  });
  return colour;
}

export function buildImportedCar(k: VehicleKit, prop: PropModel, passenger: boolean) {
  const s = k.fit.scale, model = prop.template.clone(true);
  model.name = prop.manifest.id;
  // Each car its own materials and geometry: lamps brighten per car, paint follows its style, and disposing one
  // car leaves the prop's model whole.
  const copies = new Map<T.Material, T.Material>();
  const own = (m: T.Material) => {
    let c = copies.get(m);
    if (!c) {
      c = m.clone();
      const role = m.userData.ara_role;
      if (role === 'headlight') c.name = 'Vehicle headlight';
      else if (role === 'brake_light') c.name = 'Vehicle tail lamps';
      else if (role === 'paint' && (c as T.MeshStandardMaterial).color) (c as T.MeshStandardMaterial).color.set(k.style.color);
      copies.set(m, c);
    }
    return c;
  };
  model.traverse((o) => {
    const mesh = o as T.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry = mesh.geometry.clone();
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(own) : own(mesh.material);
    const glass = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).some((m) => m.transparent);
    mesh.castShadow = !glass;mesh.receiveShadow = true;
  });
  // The seat under the rider's hips, the wheels on the ground (y 0).
  const seat = passenger && prop.seats.passenger ? prop.seats.passenger : prop.seats.driver, hip = k.fit.average('hip');
  model.scale.setScalar(s);
  model.position.set(hip.x - seat.x * s, 0, hip.z - seat.z * s);
  k.group.add(model);
  k.group.updateMatrixWorld(true);
  // Wheels turn about the car's own axle (X) through their centres, by the distance travelled (Vehicle.update).
  const wheels: T.Object3D[] = [], steering: T.Object3D[] = [];
  model.traverse((o) => { if (o.userData.ara_role === 'wheel') wheels.push(o);else if (o.userData.ara_role === 'steering') steering.push(o); });
  const inverse = k.group.matrixWorld.clone().invert();
  for (const wheel of wheels) {
    const box = new T.Box3().setFromObject(wheel).applyMatrix4(inverse), centre = box.getCenter(new T.Vector3()), size = box.getSize(new T.Vector3());
    const pivot = k.component(`Wheel_${wheel.userData.ara_axle ?? ''}_${wheel.userData.ara_side ?? ''}`.replace(/_+$/, ''), centre);
    pivot.userData.wheelRadius = Math.max(size.y, size.z) / 2;
    pivot.attach(wheel);
  }
  // The driver's hands steer Ara's own wheel, which follows them; a passenger sees the prop's wheel, still.
  if (!passenger) {
    for (const o of steering) o.visible = false;
    k.steering(0.17 * s, (28 * Math.PI) / 180);
  }
}
