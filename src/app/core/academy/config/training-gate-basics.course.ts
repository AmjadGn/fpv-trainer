import type { Course, CourseGate } from '../../course/models/course.model';
import { quatFromYaw } from '../../course/models/course.model';

const GATE_W = 5;
const GATE_H = 3.5;
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
    id: `training-gate-basics-${index + 1}`,
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
 * Wide-spaced 4-gate training line for Gate Basics.
 * Straight corridor down −Z with gentle spacing for beginners.
 */
export const TRAINING_GATE_BASICS_COURSE: Course = {
  id: 'training-gate-basics',
  name: 'Gate Basics',
  description:
    'Four wide gates spaced for learning clean center passes without racing pressure.',
  version: 1,
  startPosition: { x: 0, y: 1, z: 4 },
  startOrientation: quatFromYaw(0),
  requireValidOpening: true,
  difficulty: 'beginner',
  environmentId: 'alpine-training-valley',
  comingSoon: false,
  gates: [
    gate(0, 0, 2, -10, 0),
    gate(1, 0, 2, -28, 0),
    gate(2, 4, 2.2, -46, Math.PI / 18),
    gate(3, 0, 2, -64, 0),
  ],
};
