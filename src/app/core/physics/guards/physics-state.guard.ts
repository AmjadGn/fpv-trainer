export interface PhysicsStateSample {
  position: { x: number; y: number; z: number };
  quaternion: { x: number; y: number; z: number; w: number };
  velocity?: { x: number; y: number; z: number };
  angularVelocity?: { x: number; y: number; z: number };
  thrust?: number;
  deltaTime?: number;
}

export interface PhysicsGuardResult {
  valid: boolean;
  reason: string | null;
}

const MAX_ABS_POSITION = 1_000_000;
const MAX_ABS_VELOCITY = 10_000;

export function validatePhysicsState(sample: PhysicsStateSample): PhysicsGuardResult {
  if (!isFiniteVec3(sample.position) || exceeds(sample.position, MAX_ABS_POSITION)) {
    return { valid: false, reason: 'invalid-position' };
  }
  if (!isFiniteQuat(sample.quaternion) || !isUnitishQuat(sample.quaternion)) {
    return { valid: false, reason: 'invalid-orientation' };
  }
  if (sample.velocity && (!isFiniteVec3(sample.velocity) || exceeds(sample.velocity, MAX_ABS_VELOCITY))) {
    return { valid: false, reason: 'invalid-velocity' };
  }
  if (
    sample.angularVelocity &&
    (!isFiniteVec3(sample.angularVelocity) || exceeds(sample.angularVelocity, MAX_ABS_VELOCITY))
  ) {
    return { valid: false, reason: 'invalid-angular-velocity' };
  }
  if (sample.thrust != null && (!Number.isFinite(sample.thrust) || sample.thrust < 0 || sample.thrust > 100)) {
    return { valid: false, reason: 'invalid-thrust' };
  }
  if (
    sample.deltaTime != null &&
    (!Number.isFinite(sample.deltaTime) || sample.deltaTime <= 0 || sample.deltaTime > 1)
  ) {
    return { valid: false, reason: 'invalid-delta-time' };
  }
  return { valid: true, reason: null };
}

function isFiniteVec3(v: { x: number; y: number; z: number }): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

function isFiniteQuat(q: { x: number; y: number; z: number; w: number }): boolean {
  return (
    Number.isFinite(q.x) &&
    Number.isFinite(q.y) &&
    Number.isFinite(q.z) &&
    Number.isFinite(q.w)
  );
}

function isUnitishQuat(q: { x: number; y: number; z: number; w: number }): boolean {
  const len = Math.hypot(q.x, q.y, q.z, q.w);
  return len > 0.5 && len < 1.5;
}

function exceeds(v: { x: number; y: number; z: number }, max: number): boolean {
  return Math.abs(v.x) > max || Math.abs(v.y) > max || Math.abs(v.z) > max;
}
