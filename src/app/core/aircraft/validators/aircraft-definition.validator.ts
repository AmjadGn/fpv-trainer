import type { AircraftDefinition } from '../models/aircraft-definition.model';
import type { FlightProfile } from '../models/flight-profile.model';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

function finitePositive(n: number, label: string, errors: string[]): void {
  if (!Number.isFinite(n) || n <= 0) {
    errors.push(`${label} must be a finite positive number`);
  }
}

function finiteNonNeg(n: number, label: string, errors: string[]): void {
  if (!Number.isFinite(n) || n < 0) {
    errors.push(`${label} must be a finite non-negative number`);
  }
}

export function validateFlightProfile(profile: FlightProfile): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  finitePositive(profile.massKg, 'massKg', errors);
  finitePositive(profile.maxThrustNewtons, 'maxThrustNewtons', errors);
  finitePositive(profile.maxVelocity, 'maxVelocity', errors);
  finiteNonNeg(profile.linearDrag, 'linearDrag', errors);
  finitePositive(profile.rollInertia, 'rollInertia', errors);
  finitePositive(profile.pitchInertia, 'pitchInertia', errors);
  finitePositive(profile.yawInertia, 'yawInertia', errors);
  finitePositive(profile.maxRollRate, 'maxRollRate', errors);
  finitePositive(profile.maxPitchRate, 'maxPitchRate', errors);
  finitePositive(profile.maxYawRate, 'maxYawRate', errors);

  if (profile.hoverThrottleRatio <= 0 || profile.hoverThrottleRatio >= 1) {
    warnings.push('hoverThrottleRatio outside typical 0–1 range');
  }
  if (Number.isNaN(profile.rollInertia) || Number.isNaN(profile.pitchInertia)) {
    errors.push('inertia contains NaN');
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function validateAircraftDefinition(
  def: AircraftDefinition,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!def.id || !def.slug || !def.displayName) {
    errors.push('identity fields missing');
  }
  if (!def.fictionalManufacturer) {
    errors.push('commercial aircraft must use fictionalManufacturer');
  }
  finitePositive(def.takeoffMassKg, 'takeoffMassKg', errors);
  finitePositive(def.maximumThrustNewtons, 'maximumThrustNewtons', errors);
  finitePositive(def.widthMeters, 'widthMeters', errors);

  const flight = validateFlightProfile(def.flightProfile);
  errors.push(...flight.errors);
  warnings.push(...flight.warnings);

  if (!def.collisionProfile.parts.length) {
    errors.push('collision profile has no parts');
  }
  if (!def.visualProfile.supportedLiveries.length) {
    errors.push('visual profile needs at least one livery');
  }
  if (def.referenceProfileId && !def.referenceProfileId.startsWith('ref-')) {
    warnings.push('referenceProfileId should use ref- prefix');
  }

  return { ok: errors.length === 0, errors, warnings };
}
