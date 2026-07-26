/**
 * Coordinate convention (Three.js / right-handed):
 * - X: right
 * - Y: up
 * - Z: backward
 * - Drone forward: local -Z
 * - Drone up:      local +Y
 * - Drone right:   local +X
 *
 * Orientation is a unit quaternion (x, y, z, w) that maps body → world
 * (v_world = q ⊗ v_body ⊗ q*). Local axes are recovered by rotating
 * (1,0,0), (0,1,0), and (0,0,-1) through q.
 *
 * Angular velocity is body-frame rates (rad/s):
 * - pitch: about local +X (positive = nose down / forward)
 * - yaw:   about local +Y (positive = rotate right)
 * - roll:  about local forward (-Z); positive = tilt right
 *
 * Body-rate integration uses dq/dt = ½ q ⊗ ω_body (not ω ⊗ q).
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

/** Body-frame angular rates (rad/s). */
export interface AngularVelocity {
  pitch: number;
  yaw: number;
  roll: number;
}

export interface FlightStateSnapshot {
  armed: boolean;
  position: Vec3;
  velocity: Vec3;
  orientation: Quat;
  angularVelocity: AngularVelocity;
  altitude: number;
  speed: number;
  crashed: boolean;
  flightTime: number;
}

export type CameraMode = 'fpv' | 'chase';
