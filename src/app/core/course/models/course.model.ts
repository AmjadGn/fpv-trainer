import type { Quat, Vec3 } from '../../flight/models/flight-state.model';

/**
 * A single racing gate. Opening lies in the gate local XY plane (z = 0).
 * Correct crossing direction is local -Z (matches drone forward convention).
 */
export interface CourseGate {
  id: string;
  index: number;
  position: Vec3;
  /** Unit quaternion orientation. */
  rotation: Quat;
  /** Opening width along local X (m). */
  width: number;
  /** Opening height along local Y (m). */
  height: number;
  /** Frame depth along local Z (m). */
  depth: number;
  /** Extra opening tolerance for crossing tests (m). */
  triggerPadding: number;
}

export interface Course {
  id: string;
  name: string;
  description: string;
  /** Bumped when gate layout changes; invalidates stored ghosts. */
  version: number;
  startPosition: Vec3;
  startOrientation: Quat;
  gates: CourseGate[];
  /**
   * When true, crossing the gate plane outside the opening only warns;
   * the active gate does not advance until a valid pass.
   */
  requireValidOpening?: boolean;
  /** Optional catalog metadata for course selection UI. */
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  environmentId?: string;
  comingSoon?: boolean;
}

/** Build a yaw-only orientation (radians about world +Y). */
export function quatFromYaw(yawRadians: number): Quat {
  const half = yawRadians * 0.5;
  return {
    x: 0,
    y: Math.sin(half),
    z: 0,
    w: Math.cos(half),
  };
}
