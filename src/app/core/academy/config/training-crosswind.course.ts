import type { Course, CourseGate } from '../../course/models/course.model';
import { quatFromYaw } from '../../course/models/course.model';

const GATE_W = 4.0;
const GATE_H = 3.0;
const GATE_D = 0.45;
const PAD = 0.4;

function gate(
  index: number,
  x: number,
  y: number,
  z: number,
  yaw: number,
): CourseGate {
  return {
    id: `crosswind-gate-${index + 1}`,
    index,
    position: { x, y, z },
    rotation: quatFromYaw(yaw),
    width: GATE_W,
    height: GATE_H,
    depth: GATE_D,
    triggerPadding: PAD,
  };
}

/** Three aligned gates for Crosswind Fundamentals (Alpine). */
export const TRAINING_CROSSWIND_COURSE: Course = {
  id: 'training-crosswind-gates',
  name: 'Crosswind Gate Line',
  description: 'Three aligned gates for lateral wind compensation practice.',
  version: 1,
  startPosition: { x: 0, y: 1.2, z: 4 },
  startOrientation: quatFromYaw(0),
  requireValidOpening: true,
  difficulty: 'beginner',
  environmentId: 'alpine-training-valley',
  comingSoon: false,
  gates: [
    gate(0, 0, 1.85, -10, 0),
    gate(1, 0, 1.85, -22, 0),
    gate(2, 0, 1.85, -34, 0),
  ],
};
