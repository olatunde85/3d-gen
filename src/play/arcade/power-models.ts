/**
 * Power-up pickups as small models of what they do: a horseshoe magnet, a knight's shield, a lightning bolt, a green
 * ×2 badge and a spring boot. Each is one painted geometry centred on its middle and facing +Z, about 0.8 m tall.
 */
import * as T from 'three';
import type { RunnerPowerUp } from './modes';
import { ball, box, cyl, painted, type Part } from './scenery';

const extrude = (shape: T.Shape, depth: number, bevel = 0.02) => new T.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10 }).translate(0, 0, -depth / 2);

function magnet() {
  const red = '#d8342c', steel = '#e3e7ec', r = 0.24, tube = 0.1, leg = 0.26;
  return painted([
    [new T.TorusGeometry(r, tube, 10, 20, Math.PI).translate(0, 0.12, 0), red],
    ...[-1, 1].map((s) => [cyl(tube, tube, leg, 14, s * r, 0.12 - leg / 2, 0), red] as Part),
    ...[-1, 1].map((s) => [cyl(tube * 1.02, tube * 1.02, 0.12, 14, s * r, 0.12 - leg - 0.06, 0), steel] as Part),
  ]).translate(0, 0.02, 0);
}

function shield() {
  const outline = (k: number) => { const s = new T.Shape();s.moveTo(-0.32 * k, 0.36 * k);s.lineTo(0.32 * k, 0.36 * k);s.lineTo(0.32 * k, 0.05 * k);s.quadraticCurveTo(0.3 * k, -0.28 * k, 0, -0.44 * k);s.quadraticCurveTo(-0.3 * k, -0.28 * k, -0.32 * k, 0.05 * k);s.closePath();return s; };
  return painted([
    [extrude(outline(1), 0.06), '#d9dde2'],
    [extrude(outline(0.84), 0.06).translate(0, 0.01, 0.04), '#2f6fd0'],
    [box(0.08, 0.5, 0.04, 0, 0, 0.09), '#f4d35e'], [box(0.4, 0.08, 0.04, 0, 0.1, 0.09), '#f4d35e'],
  ]);
}

function bolt() {
  const s = new T.Shape();
  s.moveTo(0.06, 0.46);s.lineTo(-0.24, -0.02);s.lineTo(-0.02, -0.02);s.lineTo(-0.1, -0.46);s.lineTo(0.24, 0.06);s.lineTo(0.02, 0.06);s.lineTo(0.14, 0.46);s.closePath();
  return painted([[extrude(s, 0.1, 0.025), '#ffb21c'], [extrude(s, 0.02, 0).scale(0.7, 0.7, 1).translate(0, 0, 0.07), '#fff3b0']]);
}

/** A green badge with a white ×2: the cross from two bars, the 2 from five strokes. */
function multiplier() {
  const white = '#ffffff', z = 0.06, w = 0.05;
  const two: Part[] = [[box(0.16, w, 0.04, 0.12, 0.16, z), white], [box(w, 0.14, 0.04, 0.18, 0.09, z), white], [box(0.16, w, 0.04, 0.12, 0.0, z), white], [box(w, 0.14, 0.04, 0.06, -0.08, z), white], [box(0.16, w, 0.04, 0.12, -0.16, z), white]];
  return painted([
    [cyl(0.4, 0.4, 0.08, 28).rotateX(Math.PI / 2), '#e8f6ea'],
    [cyl(0.34, 0.34, 0.1, 28).rotateX(Math.PI / 2), '#2f9e55'],
    [box(0.2, w, 0.04).rotateZ(Math.PI / 4).translate(-0.13, 0, z), white], [box(0.2, w, 0.04).rotateZ(-Math.PI / 4).translate(-0.13, 0, z), white],
    ...two,
  ]);
}

/** A boot side-on, toe forward, on a coiled spring. */
function springBoot() {
  const purple = '#8b3fd9', dark = '#3a2052', steel = '#d9dde3';
  return painted([
    [box(0.16, 0.34, 0.2, 0, 0.12, -0.06), purple], [box(0.17, 0.06, 0.21, 0, 0.3, -0.06), '#c99bff'],
    [box(0.16, 0.14, 0.24, 0, -0.04, 0.12), purple], [ball(0.08, 0, -0.04, 0.24, 1).scale(1, 0.85, 1), purple],
    [box(0.18, 0.04, 0.46, 0, -0.12, 0.05), dark],
    ...[-0.18, -0.25, -0.32].map((y) => [new T.TorusGeometry(0.09, 0.02, 6, 16).rotateX(Math.PI / 2).translate(0, y, 0.05), steel] as Part),
    [box(0.2, 0.03, 0.26, 0, -0.38, 0.05), dark],
  ]).rotateY(Math.PI / 2).translate(0, 0.08, 0);
}

export const POWER_MODELS: Record<RunnerPowerUp, () => T.BufferGeometry> = { magnet, shield, boost: bolt, multiplier, springs: springBoot };
