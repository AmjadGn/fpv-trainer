import type { Vec3 } from '../../flight/models/flight-state.model';

export interface FpvCameraProfile {
  localPosition: Vec3;
  /** Degrees pitch-up relative to body forward. */
  cameraAngleDeg: number;
  angleRangeDeg: { min: number; max: number };
  defaultFov: number;
  minFov: number;
  maxFov: number;
  vibrationResponse: number;
  impactShakeMultiplier: number;
  cameraNoise: number;
  propellerVisibility: boolean;
  bodyVisibility: boolean;
}

export interface ChaseCameraProfile {
  localOffset: Vec3;
  targetOffset: Vec3;
  followLag: number;
  rotationLag: number;
  dynamicDistance: number;
  dynamicFov: number;
  collisionAvoidanceRadius: number;
}

export interface ReplayCameraProfile {
  orbitDistance: number;
  cinematicDistance: number;
  trackingStiffness: number;
  crashFraming: number;
  hangarFraming: number;
}

export interface CameraProfile {
  id: string;
  version: string;
  fpv: FpvCameraProfile;
  chase: ChaseCameraProfile;
  replay: ReplayCameraProfile;
}
