/**
 * @fpv/simulation-contracts — pure TypeScript data contracts shared by
 * simulation-facing packages (physics, rendering, camera, telemetry).
 *
 * No Angular, no Three.js, no Rapier, no IndexedDB, no `src/app` imports.
 * Deliberate public API — see individual modules for details.
 */

export type {
  Vec2,
  Vec3,
  Quat,
  Pose,
  Transform,
} from './math';
export {
  vec2,
  vec3,
  ZERO_VEC2,
  ZERO_VEC3,
  quatIdentity,
  IDENTITY_QUAT,
  identityPose,
  identityTransform,
  isFiniteNumber,
  isFiniteVec2,
  isFiniteVec3,
  isFiniteQuat,
  isFinitePose,
  isFiniteTransform,
  isUnitQuat,
  DEFAULT_UNIT_QUAT_EPSILON,
} from './math';

export type { SimulationTick, ElapsedTicks, FixedStepDuration } from './time';
export {
  asSimulationTick,
  asElapsedTicks,
  createFixedStepDuration,
  ticksToSeconds,
  secondsToTicks,
} from './time';

export type { Handedness, CoordinateSystemConvention } from './coordinate-system';
export {
  COORDINATE_SYSTEM_VERSION,
  SIMULATOR_COORDINATE_SYSTEM_V1,
} from './coordinate-system';

export type {
  Sphere,
  Aabb,
  Obb,
  AltitudeRange,
  NormalizedScreenPoint,
  NormalizedScreenRectangle,
  PolygonPrism,
  SpatialConstructionResult,
} from './spatial';
export {
  createSphere,
  createAabb,
  createObb,
  createAltitudeRange,
  createNormalizedScreenPoint,
  createNormalizedScreenRectangle,
  createPolygonPrism,
} from './spatial';

export type {
  CameraProjection,
  CameraRigDefinition,
  CameraSnapshot,
  CameraConstructionResult,
} from './camera';
export {
  PROJECTION_MODEL_VERSION,
  MISSION_CAPTURE_ASPECT_RATIO,
  createCameraProjection,
  isFiniteCameraProjection,
  isFiniteCameraSnapshot,
} from './camera';

export type { ValidationSeverity, ValidationIssue, ValidationReport } from './validation';
export {
  createIssue,
  createReport,
  mergeReports,
  reportHasErrors,
} from './validation';

export type { Brand } from './ids';
export { brand, brandNumber } from './ids';

export type { VersionString, MajorMinorPatch } from './versioning';
export {
  parseMajorMinorPatch,
  isExactVersion,
  isCompatibleMajor,
} from './versioning';
