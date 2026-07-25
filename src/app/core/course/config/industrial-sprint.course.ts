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
  height = GATE_H,
): CourseGate {
  return {
    id: `industrial-sprint-gate-${index + 1}`,
    index,
    position: { x, y, z },
    rotation: quatFromYaw(yaw),
    width: GATE_W,
    height,
    depth: GATE_D,
    triggerPadding: PAD,
  };
}

export const INDUSTRIAL_SPRINT: Course = {
  id: 'industrial-sprint',
  name: 'Industrial Sprint',
  description:
    'Desert yard sprint through containers, under a pipe, hangar entrance, crane turn, and a finish slalom.',
  version: 1,
  startPosition: { x: 0, y: 1, z: 8 },
  startOrientation: quatFromYaw(0),
  requireValidOpening: true,
  difficulty: 'intermediate',
  environmentId: 'desert-industrial-yard',
  comingSoon: false,
  gates: [
    gate(0, 0, 1.85, -10, 0),
    gate(1, 0, 1.85, -24, 0),
    gate(2, -10, 1.85, -38, -Math.PI / 5),
    gate(3, -18, 1.55, -52, -Math.PI / 6, 2.6),
    gate(4, -8, 1.85, -66, 0),
    gate(5, 8, 1.85, -78, Math.PI / 5),
    gate(6, 14, 3.0, -90, Math.PI / 8),
    gate(7, 6, 1.95, -102, 0),
    gate(8, -4, 1.85, -112, -Math.PI / 7),
    gate(9, 4, 1.85, -122, Math.PI / 8),
    gate(10, 0, 1.85, -134, 0),
  ],
};
