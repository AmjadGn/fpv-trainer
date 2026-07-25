import type { Course, CourseGate } from '../models/course.model';
import { quatFromYaw } from '../models/course.model';

const GATE_W = 4.2;
const GATE_H = 3.2;
const GATE_D = 0.45;
const PAD = 0.35;

function gate(
  index: number,
  x: number,
  y: number,
  z: number,
  yaw: number,
): CourseGate {
  return {
    id: `starter-gate-${index + 1}`,
    index,
    position: { x, y, z },
    rotation: quatFromYaw(yaw),
    width: GATE_W,
    height: GATE_H,
    depth: GATE_D,
    triggerPadding: PAD,
  };
}

/**
 * Beginner-friendly 9-gate circuit fitted to Alpine Training Valley.
 *
 * Layout (from start pad looking toward −Z):
 *  1–2 opening straights across open grass
 *  3 gentle left around rock cluster
 *  4 near tree line
 *  5 elevated over a small visual ridge
 *  6 gentle descent
 *  7 right-hand turn by the mountain cabin
 *  8–9 final straight back toward the start area
 */
export const STARTER_CIRCUIT: Course = {
  id: 'starter-circuit',
  name: 'Starter Circuit',
  description:
    'Alpine valley beginner course: open straights, a rock turn, tree-line gate, elevated ridge, cabin turn, and a finish toward home.',
  version: 1,
  startPosition: { x: 0, y: 1, z: 6 },
  startOrientation: quatFromYaw(0),
  requireValidOpening: true,
  difficulty: 'beginner',
  environmentId: 'alpine-training-valley',
  comingSoon: false,
  gates: [
    gate(0, 0, 1.85, -8, 0),
    gate(1, 0, 1.85, -22, 0),
    gate(2, -8, 1.85, -36, -Math.PI / 7),
    gate(3, -16, 1.85, -50, -Math.PI / 6),
    gate(4, -12, 2.85, -64, -Math.PI / 18),
    gate(5, -2, 1.95, -76, Math.PI / 10),
    gate(6, 12, 1.85, -88, Math.PI / 5),
    gate(7, 16, 1.85, -100, Math.PI / 12),
    gate(8, 8, 1.85, -112, 0),
  ],
};

export const DEFAULT_COURSE = STARTER_CIRCUIT;
