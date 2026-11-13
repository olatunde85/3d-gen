/**
 * Power-up pickups as small models of what they do: a horseshoe magnet, a knight's shield, a lightning bolt, a green
 * ×2 badge, a spring boot, a hoverboard and a stack of coins. Each is one painted geometry centred on its middle and facing +Z, about 0.8 m tall.
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
  const face = (): Part[] => [[box(0.2, w, 0.04).rotateZ(Math.PI / 4).translate(-0.13, 0, z), white], [box(0.2, w, 0.04).rotateZ(-Math.PI / 4).translate(-0.13, 0, z), white], ...two.map(([g, c]) => [g.clone(), c] as Part)];
  // The ×2 is on both faces, each reading the right way round from its own side.
  return painted([
    [cyl(0.4, 0.4, 0.08, 28).rotateX(Math.PI / 2), '#e8f6ea'],
    [cyl(0.34, 0.34, 0.1, 28).rotateX(Math.PI / 2), '#2f9e55'],
    ...face(), ...face().map(([g, c]) => [g.rotateY(Math.PI), c] as Part),
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

/**
 * A self-balancing hoverboard, its length along X: a blue body with a foot pad either side of the middle seam, and a
 * big wheel at each end under a cover with a strip of lights. The wheels touch y = 0; the pads' tops are at 0.18 m.
 */
export function hoverboardBody() {
  const blue = '#2442c8', dark = '#1a1d24', tyre = '#23262c', hub = '#c4cad2', light = '#dff6ff', R = 0.115, end = 0.34;
  return painted([
    // Body halves either side of the seam, a little narrower in the middle.
    ...[-1, 1].map((x) => [box(0.27, 0.09, 0.2, x * 0.14, 0.125, 0), blue] as Part), [box(0.03, 0.08, 0.17, 0, 0.125, 0), dark],
    ...[-1, 1].map((x) => [box(0.2, 0.012, 0.17, x * 0.15, 0.176, 0), dark] as Part),
    ...[-1, 1].map((x) => [cyl(0.018, 0.018, 0.012, 10).rotateX(Math.PI / 2).translate(x * 0.06, 0.125, 0.104), light] as Part),
    ...[-1, 1].flatMap((x) => [
      // Wheel and hub, rolling forward on an axle along the board.
      [cyl(R, R, 0.075, 22).rotateZ(Math.PI / 2).translate(x * end, R, 0), tyre] as Part,
      [cyl(R * 0.62, R * 0.62, 0.08, 16).rotateZ(Math.PI / 2).translate(x * end, R, 0), hub] as Part,
      // The cover arching over the top of the wheel, with its light strip at the front.
      ...[0.4, 1.2, 1.94, 2.74].map((k) => [box(0.1, 0.035, 0.07, x * end, R + Math.sin(k) * (R + 0.04), Math.cos(k) * (R + 0.04)).rotateX(0), blue] as Part),
      [box(0.08, 0.02, 0.012, x * end, R + Math.sin(0.4) * (R + 0.04), Math.cos(0.4) * (R + 0.04) + 0.036), light] as Part,
    ]),
  ]);
}
/** Side-on, as the player sees it from behind the runner. */
const hoverboard = () => hoverboardBody().translate(0, -0.13, 0).scale(1.2, 1.2, 1.2);

/** A leaning stack of gold coins. */
function coinStack() {
  const gold = '#f2c23c', rim = '#c9961e';
  return painted([
    ...Array.from({ length: 6 }, (_, i) => [cyl(0.22, 0.22, 0.06, 20, Math.sin(i * 1.7) * 0.03, -0.3 + i * 0.07, Math.cos(i * 1.3) * 0.03), i % 2 ? gold : rim] as Part),
    [cyl(0.24, 0.24, 0.05, 22).rotateX(Math.PI / 2).rotateZ(0.25).translate(0.04, 0.2, 0.05), gold], [cyl(0.15, 0.15, 0.055, 18).rotateX(Math.PI / 2).rotateZ(0.25).translate(0.04, 0.2, 0.06), '#ffe27a'],
  ]);
}

export const POWER_MODELS: Record<RunnerPowerUp, () => T.BufferGeometry> = { magnet, shield, boost: bolt, multiplier, springs: springBoot, hoverboard, 'coin-rush': coinStack };
