/**
 * Flight-domain input consumed by FlightControllerService.
 *
 * Semantics (acro-style rates / thrust):
 * - throttle: 0..1 (thrust magnitude; ~0.5 hovers when upright)
 * - yaw:     -1..1 (positive = rotate right about local up)
 * - pitch:   -1..1 (positive = nose forward/down about local right)
 * - roll:    -1..1 (positive = tilt right about local forward)
 *
 * Values are expected to already be calibrated / normalized.
 * Keyboard fallback is merged upstream and clamped to these ranges.
 */
export interface FlightInput {
  throttle: number;
  yaw: number;
  pitch: number;
  roll: number;
}

export const ZERO_FLIGHT_INPUT: Readonly<FlightInput> = {
  throttle: 0,
  yaw: 0,
  pitch: 0,
  roll: 0,
};
