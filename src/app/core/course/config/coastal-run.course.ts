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
    id: `coastal-run-gate-${index + 1}`,
    index,
    position: { x, y, z },
    rotation: quatFromYaw(yaw),
    width: GATE_W,
    height: GATE_H,
    depth: GATE_D,
    triggerPadding: PAD,
  };
}

export const COASTAL_RUN: Course = {
  id: 'coastal-run',
  name: 'Coastal Run',
  description:
    'Coastal ruins course: sea-facing opening, stone arch, watchtower climb, beach sweep, and lighthouse finish.',
  version: 1,
  startPosition: { x: 0, y: 1, z: 6 },
  startOrientation: quatFromYaw(0),
  requireValidOpening: true,
  difficulty: 'intermediate',
  environmentId: 'coastal-ruins',
  comingSoon: false,
  gates: [
    gate(0, 0, 1.85, -8, 0),
    gate(1, -6, 1.85, -22, -Math.PI / 8),
    gate(2, -12, 1.95, -36, -Math.PI / 6),
    gate(3, -4, 1.85, -50, 0),
    gate(4, 8, 2.9, -62, Math.PI / 7),
    gate(5, 18, 1.95, -76, Math.PI / 5),
    gate(6, 12, 1.75, -90, Math.PI / 10),
    gate(7, 2, 2.4, -100, -Math.PI / 10),
    gate(8, -8, 1.95, -110, -Math.PI / 8),
    gate(9, 0, 1.85, -120, 0),
  ],
};
