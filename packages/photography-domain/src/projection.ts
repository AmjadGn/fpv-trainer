/**
 * Deterministic camera-projection math for photography scoring.
 *
 * Coordinate convention (matches `SIMULATOR_COORDINATE_SYSTEM_V1` from
 * `@fpv/simulation-contracts`): +X right, +Y up, -Z forward, right-handed,
 * meters. Orientation quaternions map body-space to world-space
 * (`v_world = q ⊗ v_body ⊗ q*`). A camera's local frame follows the same
 * convention, so an *unrotated* camera looks down world -Z; after applying
 * the camera's world orientation, "forward" is whatever direction that
 * orientation maps body -Z to.
 *
 * Screen-space convention (matches `NormalizedScreenPoint` docs): origin
 * `(0, 0)` is top-left, `(1, 1)` is bottom-right. `u` increases rightward,
 * `v` increases *downward*. The optical center is `(0.5, 0.5)`.
 *
 * Invalid-input policy: quaternion helpers here **reject** non-finite or
 * non-unit quaternions with an explicit `{ ok: false, reason }` result
 * rather than silently substituting the identity quaternion or
 * renormalizing. Callers that want a "best effort" identity fallback must
 * do that explicitly at their own boundary — this module never guesses.
 */

import {
  isFiniteNumber,
  isFiniteQuat,
  isFiniteVec3,
  isUnitQuat,
  DEFAULT_UNIT_QUAT_EPSILON,
  createNormalizedScreenRectangle,
  type Vec3,
  type Quat,
  type Pose,
  type CameraSnapshot,
  type NormalizedScreenPoint,
  type NormalizedScreenRectangle,
  type AltitudeRange,
} from '@fpv/simulation-contracts';

/** Result of a validating projection computation — never throws for bad geometry input. */
export type ProjectionResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: string };

function ok<T>(value: T): ProjectionResult<T> {
  return { ok: true, value };
}

function fail<T>(reason: string): ProjectionResult<T> {
  return { ok: false, reason };
}

// ---------------------------------------------------------------------------
// Vector helpers (private — pure numeric, no external math dependency)
// ---------------------------------------------------------------------------

function vecSub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function vecScale(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

function vecCross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function vecDot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function vecLength(a: Vec3): number {
  return Math.sqrt(vecDot(a, a));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Aircraft/camera body-space forward direction under `SIMULATOR_COORDINATE_SYSTEM_V1`. */
const BODY_FORWARD: Vec3 = { x: 0, y: 0, z: -1 };
/** Aircraft/camera body-space right direction under `SIMULATOR_COORDINATE_SYSTEM_V1`. */
const BODY_RIGHT: Vec3 = { x: 1, y: 0, z: 0 };

// ---------------------------------------------------------------------------
// Quaternion invert / rotate — reject-invalid policy
// ---------------------------------------------------------------------------

/**
 * Inverts a unit quaternion (conjugate, since `|q| = 1` implies `q^-1 = q*`).
 *
 * Rejects (does not throw) if `q` is non-finite or not unit-length within
 * `epsilon`. This is a deliberate reject-invalid policy: callers must fix
 * upstream orientation data rather than have this module silently
 * renormalize or fall back to identity.
 */
export function invertUnitQuat(
  q: Quat,
  epsilon: number = DEFAULT_UNIT_QUAT_EPSILON,
): ProjectionResult<Quat> {
  if (!isFiniteQuat(q)) {
    return fail('invertUnitQuat: quaternion must be finite');
  }
  if (!isUnitQuat(q, epsilon)) {
    return fail('invertUnitQuat: quaternion must be unit-length within epsilon (reject-invalid policy)');
  }
  return ok({ x: -q.x, y: -q.y, z: -q.z, w: q.w });
}

/** Rotates `v` by unit quaternion `q`, assuming both are already known-valid. */
function rotateVectorByUnitQuatUnchecked(v: Vec3, q: Quat): Vec3 {
  // v' = v + 2*w*(qv × v) + 2*(qv × (qv × v))
  const qv: Vec3 = { x: q.x, y: q.y, z: q.z };
  const t = vecScale(vecCross(qv, v), 2);
  const tCrossQv = vecCross(qv, t);
  return {
    x: v.x + q.w * t.x + tCrossQv.x,
    y: v.y + q.w * t.y + tCrossQv.y,
    z: v.z + q.w * t.z + tCrossQv.z,
  };
}

/**
 * Rotates world/body vector `v` by unit quaternion `q` (`v_world = q ⊗ v_body ⊗ q*`).
 *
 * Rejects non-finite `v`, non-finite `q`, or non-unit `q` (within `epsilon`)
 * rather than normalizing or substituting identity.
 */
export function rotateVectorByQuat(
  v: Vec3,
  q: Quat,
  epsilon: number = DEFAULT_UNIT_QUAT_EPSILON,
): ProjectionResult<Vec3> {
  if (!isFiniteVec3(v)) {
    return fail('rotateVectorByQuat: vector must be finite');
  }
  if (!isFiniteQuat(q)) {
    return fail('rotateVectorByQuat: quaternion must be finite');
  }
  if (!isUnitQuat(q, epsilon)) {
    return fail('rotateVectorByQuat: quaternion must be unit-length within epsilon (reject-invalid policy)');
  }
  return ok(rotateVectorByUnitQuatUnchecked(v, q));
}

// ---------------------------------------------------------------------------
// World -> camera-local
// ---------------------------------------------------------------------------

/**
 * Transforms a world-space point into the camera's local frame, where the
 * camera looks down local -Z (matching body-space forward).
 *
 * `world_to_local(p) = inverse(cameraOrientation) ⊗ (p - cameraPosition) ⊗ cameraOrientation*`
 */
export function worldPointToCameraLocal(
  point: Vec3,
  cameraWorldPose: Pose,
  epsilon: number = DEFAULT_UNIT_QUAT_EPSILON,
): ProjectionResult<Vec3> {
  if (!isFiniteVec3(point)) {
    return fail('worldPointToCameraLocal: point must be finite');
  }
  if (!isFiniteVec3(cameraWorldPose.position)) {
    return fail('worldPointToCameraLocal: camera position must be finite');
  }
  const inverse = invertUnitQuat(cameraWorldPose.orientation, epsilon);
  if (!inverse.ok) {
    return inverse;
  }
  const relative = vecSub(point, cameraWorldPose.position);
  return rotateVectorByQuat(relative, inverse.value, epsilon);
}

// ---------------------------------------------------------------------------
// In-front test
// ---------------------------------------------------------------------------

/**
 * Default epsilon (meters) for `isInFrontOfCamera`. Points with local depth
 * shallower than this are treated as *not* in front, guarding the
 * perspective-division singularity at `localZ = 0`.
 */
export const DEFAULT_IN_FRONT_EPSILON_METERS = 1e-6;

/**
 * Whether a camera-local point is in front of the camera.
 *
 * Policy: "in front" means `localPoint.z < -epsilon` (camera looks down
 * local -Z, so points in front have negative local Z). This is a pure
 * geometric sign check — it is intentionally independent of the camera's
 * `nearMeters`/`farMeters` clip range; clip-range membership is a separate
 * concern handled by `projectWorldPoint`'s `withinClipRange` flag.
 */
export function isInFrontOfCamera(
  localPoint: Vec3,
  epsilonMeters: number = DEFAULT_IN_FRONT_EPSILON_METERS,
): boolean {
  return localPoint.z < -epsilonMeters;
}

// ---------------------------------------------------------------------------
// Perspective projection to normalized screen space
// ---------------------------------------------------------------------------

/**
 * Projects an already-camera-local, already-in-front point to normalized
 * screen space using a symmetric perspective frustum.
 *
 * `verticalFovDeg` is the full vertical field of view in degrees, in
 * `(0, 180)`. `aspect` is width / height. Origin is top-left, `u` right,
 * `v` down, optical center `(0.5, 0.5)`.
 *
 * Rejects points that are not in front of the camera (`localZ >= -epsilon`)
 * — perspective division is undefined/meaningless there. Callers should
 * check `isInFrontOfCamera` (or use `projectWorldPoint`, which does this
 * for you) before calling this directly.
 */
export function projectPerspectiveToNormalized(
  localPoint: Vec3,
  verticalFovDeg: number,
  aspect: number,
): ProjectionResult<NormalizedScreenPoint> {
  if (!isFiniteVec3(localPoint)) {
    return fail('projectPerspectiveToNormalized: localPoint must be finite');
  }
  if (!isFiniteNumber(verticalFovDeg) || verticalFovDeg <= 0 || verticalFovDeg >= 180) {
    return fail('projectPerspectiveToNormalized: verticalFovDeg must be finite in (0, 180)');
  }
  if (!isFiniteNumber(aspect) || aspect <= 0) {
    return fail('projectPerspectiveToNormalized: aspect must be a finite positive number');
  }
  if (!isInFrontOfCamera(localPoint)) {
    return fail('projectPerspectiveToNormalized: localPoint must be in front of the camera (localZ < -epsilon)');
  }

  const verticalFovRad = (verticalFovDeg * Math.PI) / 180;
  const tanHalfVertical = Math.tan(verticalFovRad / 2);
  const tanHalfHorizontal = tanHalfVertical * aspect;

  const depth = -localPoint.z; // positive distance along camera forward axis
  const ndcX = localPoint.x / depth / tanHalfHorizontal; // [-1, 1] left..right
  const ndcY = localPoint.y / depth / tanHalfVertical; // [-1, 1] bottom..top

  const u = (ndcX + 1) / 2; // 0 = left, 1 = right
  const v = (1 - ndcY) / 2; // 0 = top, 1 = bottom (v grows downward)

  return ok({ u, v });
}

// ---------------------------------------------------------------------------
// Full world-point projection
// ---------------------------------------------------------------------------

export interface ProjectedPoint {
  readonly worldPoint: Vec3;
  readonly localPoint: Vec3;
  /** Pure geometric sign check: `localPoint.z < -epsilon`. */
  readonly inFrontOfCamera: boolean;
  /** `inFrontOfCamera` AND depth within `[projection.nearMeters, projection.farMeters]`. */
  readonly withinClipRange: boolean;
  /** Straight-line distance from camera position to `worldPoint`, in meters. */
  readonly distanceMeters: number;
  /** Normalized screen coordinates, or `null` if not `withinClipRange`. */
  readonly screen: NormalizedScreenPoint | null;
}

/**
 * Projects a single world point through a camera snapshot's world pose and
 * projection, producing local-frame, distance, and (if within the clip
 * range) normalized screen-space data.
 *
 * Fails only on invalid geometry (non-finite point, non-finite/non-unit
 * camera orientation) — a point that is behind the camera or outside the
 * near/far range is a normal, successful result with `screen: null`.
 */
export function projectWorldPoint(
  point: Vec3,
  cameraSnapshot: CameraSnapshot,
  epsilon: number = DEFAULT_UNIT_QUAT_EPSILON,
): ProjectionResult<ProjectedPoint> {
  const localResult = worldPointToCameraLocal(point, cameraSnapshot.worldPose, epsilon);
  if (!localResult.ok) {
    return localResult;
  }
  const localPoint = localResult.value;
  const inFront = isInFrontOfCamera(localPoint);
  const depth = -localPoint.z;
  const { nearMeters, farMeters, verticalFovDegrees, aspectRatio } = cameraSnapshot.projection;
  const withinClipRange = inFront && depth >= nearMeters && depth <= farMeters;

  let screen: NormalizedScreenPoint | null = null;
  if (withinClipRange) {
    const projected = projectPerspectiveToNormalized(localPoint, verticalFovDegrees, aspectRatio);
    if (!projected.ok) {
      // Should be unreachable given withinClipRange implies in-front, but
      // propagate rather than assume.
      return projected;
    }
    screen = projected.value;
  }

  const distanceMeters = vecLength(vecSub(point, cameraSnapshot.worldPose.position));

  return ok({ worldPoint: point, localPoint, inFrontOfCamera: inFront, withinClipRange, distanceMeters, screen });
}

/**
 * Projects a set of subject sample points (e.g. a coarse point cloud
 * approximating a subject's silhouette) through the same camera snapshot.
 *
 * Fails fast (short-circuits) on the first invalid point/camera geometry —
 * a single bad quaternion/point makes the whole batch meaningless.
 */
export function projectSubjectSamplePoints(
  points: readonly Vec3[],
  cameraSnapshot: CameraSnapshot,
  epsilon: number = DEFAULT_UNIT_QUAT_EPSILON,
): ProjectionResult<readonly ProjectedPoint[]> {
  const results: ProjectedPoint[] = [];
  for (const point of points) {
    const projected = projectWorldPoint(point, cameraSnapshot, epsilon);
    if (!projected.ok) {
      return projected;
    }
    results.push(projected.value);
  }
  return ok(results);
}

// ---------------------------------------------------------------------------
// Screen-space aggregation
// ---------------------------------------------------------------------------

/**
 * Computes the axis-aligned normalized-screen-space bounding rectangle of a
 * set of projected points, considering **only** points that are
 * `withinClipRange` (i.e. have a non-null `screen`).
 *
 * Fails if no points qualify.
 */
export function computeNormalizedScreenRectangle(
  projectedPoints: readonly ProjectedPoint[],
): ProjectionResult<NormalizedScreenRectangle> {
  let minU = Number.POSITIVE_INFINITY;
  let minV = Number.POSITIVE_INFINITY;
  let maxU = Number.NEGATIVE_INFINITY;
  let maxV = Number.NEGATIVE_INFINITY;
  let count = 0;

  for (const point of projectedPoints) {
    if (point.screen === null) {
      continue;
    }
    count += 1;
    minU = Math.min(minU, point.screen.u);
    maxU = Math.max(maxU, point.screen.u);
    minV = Math.min(minV, point.screen.v);
    maxV = Math.max(maxV, point.screen.v);
  }

  if (count === 0) {
    return fail('computeNormalizedScreenRectangle: no sample points are within the camera clip range');
  }

  const rect = createNormalizedScreenRectangle(minU, minV, maxU, maxV);
  if (!rect.ok) {
    return fail(rect.reason);
  }
  return ok(rect.value);
}

const FULL_FRAME_RECTANGLE: NormalizedScreenRectangle = { minU: 0, minV: 0, maxU: 1, maxV: 1 };

function rectangleArea(rect: NormalizedScreenRectangle): number {
  return Math.max(0, rect.maxU - rect.minU) * Math.max(0, rect.maxV - rect.minV);
}

function rectangleIntersection(
  a: NormalizedScreenRectangle,
  b: NormalizedScreenRectangle,
): NormalizedScreenRectangle | null {
  const minU = Math.max(a.minU, b.minU);
  const minV = Math.max(a.minV, b.minV);
  const maxU = Math.min(a.maxU, b.maxU);
  const maxV = Math.min(a.maxV, b.maxV);
  if (minU >= maxU || minV >= maxV) {
    return null;
  }
  return { minU, minV, maxU, maxV };
}

/**
 * Fraction of `rect`'s own area that lies within the visible frame
 * `[0,1] x [0,1]`. `1.0` means fully on-screen; `0.0` means fully off-screen.
 *
 * Degenerate case: a zero-area rectangle (a single projected point, e.g. a
 * single-sample subject) is treated as fully in (`1`) if the point lies
 * within the frame, else fully out (`0`).
 */
export function frameIntersectionRatio(rect: NormalizedScreenRectangle): number {
  const area = rectangleArea(rect);
  if (area === 0) {
    const withinFrame = rect.minU >= 0 && rect.maxU <= 1 && rect.minV >= 0 && rect.maxV <= 1;
    return withinFrame ? 1 : 0;
  }
  const intersection = rectangleIntersection(rect, FULL_FRAME_RECTANGLE);
  if (!intersection) {
    return 0;
  }
  return clamp(rectangleArea(intersection) / area, 0, 1);
}

/**
 * Fraction of the *full frame's* area (`[0,1] x [0,1]`, area `1`) covered by
 * `rect`'s intersection with the frame. Used against
 * `PhotographyObjectiveDefinition.coverageRange`.
 */
export function coverageRatio(rect: NormalizedScreenRectangle): number {
  const intersection = rectangleIntersection(rect, FULL_FRAME_RECTANGLE);
  if (!intersection) {
    return 0;
  }
  return clamp(rectangleArea(intersection), 0, 1);
}

/** The optical center of normalized screen space. */
export const SCREEN_CENTER: NormalizedScreenPoint = { u: 0.5, v: 0.5 };

/** Maximum possible Euclidean distance from `SCREEN_CENTER` to a screen corner. */
export const MAX_CENTERING_DISTANCE = Math.sqrt(0.5 * 0.5 + 0.5 * 0.5);

/**
 * Euclidean distance from `anchor` to `target` (defaults to `SCREEN_CENTER`)
 * in normalized screen space. `0` is perfectly centered.
 */
export function centeringError(
  anchor: NormalizedScreenPoint,
  target: NormalizedScreenPoint = SCREEN_CENTER,
): number {
  const du = anchor.u - target.u;
  const dv = anchor.v - target.v;
  return Math.sqrt(du * du + dv * dv);
}

// ---------------------------------------------------------------------------
// Distance / viewing angle / viewing side
// ---------------------------------------------------------------------------

/** Straight-line distance between two world points, in meters. */
export function distance(a: Vec3, b: Vec3): number {
  return vecLength(vecSub(a, b));
}

/**
 * Angle, in degrees, between the camera's world-space forward direction and
 * the direction from the camera to `subjectPosition`. `0°` means the
 * subject is dead-center on the camera's boresight; larger angles mean the
 * subject is farther off-axis.
 */
export function viewingAngle(
  cameraWorldPose: Pose,
  subjectPosition: Vec3,
  epsilon: number = DEFAULT_UNIT_QUAT_EPSILON,
): ProjectionResult<number> {
  if (!isFiniteVec3(subjectPosition)) {
    return fail('viewingAngle: subjectPosition must be finite');
  }
  const forward = rotateVectorByQuat(BODY_FORWARD, cameraWorldPose.orientation, epsilon);
  if (!forward.ok) {
    return forward;
  }
  const toSubject = vecSub(subjectPosition, cameraWorldPose.position);
  const len = vecLength(toSubject);
  if (!(len > 1e-9)) {
    return fail('viewingAngle: subjectPosition coincides with camera position; direction undefined');
  }
  const toSubjectNormalized = vecScale(toSubject, 1 / len);
  const cosAngle = clamp(vecDot(forward.value, toSubjectNormalized), -1, 1);
  const angleRad = Math.acos(cosAngle);
  return ok((angleRad * 180) / Math.PI);
}

export type ViewingSide = 'front' | 'back' | 'left' | 'right';

export interface ViewingSideEvaluation {
  readonly side: ViewingSide;
  /** Angle, in degrees, between the subject's forward direction and the subject->camera direction. */
  readonly angleFromSubjectFrontDeg: number;
}

/**
 * Classifies which side of `subjectWorldPose` the camera is viewing from.
 *
 * Policy (documented, not derived from any external spec): compute the
 * angle between the subject's forward direction and the subject->camera
 * direction. `<= 45°` is `'front'` (camera sees the subject's front face),
 * `>= 135°` is `'back'`, and the 45°..135° band is split into `'left'` /
 * `'right'` using the sign of the subject's right-axis component of the
 * subject->camera direction.
 */
export function evaluateViewingSide(
  cameraWorldPose: Pose,
  subjectWorldPose: Pose,
  epsilon: number = DEFAULT_UNIT_QUAT_EPSILON,
): ProjectionResult<ViewingSideEvaluation> {
  const subjectForward = rotateVectorByQuat(BODY_FORWARD, subjectWorldPose.orientation, epsilon);
  if (!subjectForward.ok) {
    return subjectForward;
  }
  const subjectRight = rotateVectorByQuat(BODY_RIGHT, subjectWorldPose.orientation, epsilon);
  if (!subjectRight.ok) {
    return subjectRight;
  }
  if (!isFiniteVec3(cameraWorldPose.position) || !isFiniteVec3(subjectWorldPose.position)) {
    return fail('evaluateViewingSide: camera/subject position must be finite');
  }
  const toCamera = vecSub(cameraWorldPose.position, subjectWorldPose.position);
  const len = vecLength(toCamera);
  if (!(len > 1e-9)) {
    return fail('evaluateViewingSide: camera coincides with subject position; direction undefined');
  }
  const toCameraNormalized = vecScale(toCamera, 1 / len);

  const forwardDot = clamp(vecDot(subjectForward.value, toCameraNormalized), -1, 1);
  const angleFromSubjectFrontDeg = (Math.acos(forwardDot) * 180) / Math.PI;

  let side: ViewingSide;
  if (angleFromSubjectFrontDeg <= 45) {
    side = 'front';
  } else if (angleFromSubjectFrontDeg >= 135) {
    side = 'back';
  } else {
    const rightDot = vecDot(subjectRight.value, toCameraNormalized);
    side = rightDot >= 0 ? 'right' : 'left';
  }

  return ok({ side, angleFromSubjectFrontDeg });
}

// ---------------------------------------------------------------------------
// Altitude / speed threshold gates
// ---------------------------------------------------------------------------

/** Inclusive altitude-range membership check. */
export function evaluateAltitudeRange(altitudeMeters: number, range: AltitudeRange): boolean {
  return isFiniteNumber(altitudeMeters) && altitudeMeters >= range.minMeters && altitudeMeters <= range.maxMeters;
}

export interface SpeedThresholdEvaluation {
  readonly withinLinearSpeed: boolean;
  readonly withinAngularSpeed: boolean;
  readonly withinAllThresholds: boolean;
}

/** Inclusive (`<=`) linear/angular speed threshold check. */
export function evaluateSpeedThresholds(
  linearSpeedMps: number,
  bodyAngularSpeedRadps: number,
  maxLinearSpeedMps: number,
  maxBodyAngularSpeedRadps: number,
): SpeedThresholdEvaluation {
  const withinLinearSpeed = isFiniteNumber(linearSpeedMps) && linearSpeedMps <= maxLinearSpeedMps;
  const withinAngularSpeed = isFiniteNumber(bodyAngularSpeedRadps) && bodyAngularSpeedRadps <= maxBodyAngularSpeedRadps;
  return {
    withinLinearSpeed,
    withinAngularSpeed,
    withinAllThresholds: withinLinearSpeed && withinAngularSpeed,
  };
}
