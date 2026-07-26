/**
 * Adapter-safe aircraft capability DTO consumed by mission-domain's
 * compatibility evaluator.
 *
 * CRITICAL: this is already-normalized, authoritative aircraft state as
 * produced by `@fpv/aircraft-runtime-adapter` (or an equivalent factory
 * aircraft descriptor). It deliberately contains NONE of the following:
 *   - raw controller axis values or mappings
 *   - calibration version / calibration state
 *   - stick inversion flags
 *   - input device identity
 *
 * Those concepts belong entirely to the controller-calibration layer and
 * must never leak into mission evaluation. See `aircraft-compatibility.ts`
 * for the corresponding policy type and the defensive rejection of any
 * such fields that might arrive via untyped/untrusted data.
 */

/**
 * Where a piece of capability data ultimately came from, in order of
 * decreasing trustworthiness:
 *  - 'runtime': read directly off a live/compiled aircraft runtime.
 *  - 'template-derived': inferred from a factory template/category default,
 *    not measured on the actual aircraft instance.
 *  - 'estimated': a coarse heuristic estimate (e.g. endurance modeling).
 *  - 'insufficient': the source system could not produce a value at all.
 */
export type CapabilityProvenance = 'runtime' | 'template-derived' | 'estimated' | 'insufficient';

/** Declares the FOV range an aircraft's camera can support, plus its provenance. */
export interface CameraProfileCapability {
  readonly minFovDeg: number;
  readonly maxFovDeg: number;
  readonly provenance: 'runtime' | 'template-derived';
}

/**
 * Normalized, adapter-safe snapshot of an aircraft's mission-relevant
 * capabilities. This is the ONLY aircraft-shaped input mission-domain ever
 * consumes — never a raw drone-build, controller state, or engineering
 * component graph.
 */
export interface MissionAircraftCapabilities {
  readonly aircraftId: string;
  readonly sourceType: 'factory' | 'user-compiled';
  readonly category: string;

  readonly widthMeters?: number;
  readonly heightMeters?: number;
  readonly takeoffMassKg?: number;
  readonly thrustToWeight?: number;
  readonly recommendedMaxSpeedMps?: number;

  readonly hasCamera: boolean;
  readonly cameraProfileCapability?: CameraProfileCapability;

  readonly collisionProfileAvailable: boolean;
  readonly collisionProvenance?: 'runtime' | 'template-derived';

  /** Compatibility surface of the runtime that produced this snapshot. */
  readonly runtimeCompatibilityVersion: string;
  /** Version of the underlying aircraft definition/template, if applicable. */
  readonly definitionVersion?: string;

  /**
   * Estimated flight endurance in minutes, derived from battery/power
   * modeling. This value is informational only (e.g. for briefing UI) —
   * it is NEVER a hard blocking constraint for mission eligibility.
   * `aircraft-compatibility.ts` has no mechanism to gate on this field,
   * and any attempt to smuggle an endurance constraint into a policy is
   * rejected. See `assertNoUnsupportedAircraftConstraints`.
   */
  readonly estimatedEnduranceMinutes?: number;
}
