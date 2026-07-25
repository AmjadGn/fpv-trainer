/** Branded propulsion-dataset identifiers — opaque at compile time. */

declare const Brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [Brand]: B };

export type PropulsionDatasetId = Brand<string, 'PropulsionDatasetId'>;
export type PropulsionDatasetRevisionId = Brand<
  string,
  'PropulsionDatasetRevisionId'
>;
export type PropulsionDatasetReleaseId = Brand<
  string,
  'PropulsionDatasetReleaseId'
>;
export type PropulsionCalibrationProfileId = Brand<
  string,
  'PropulsionCalibrationProfileId'
>;
export type PropulsionCalibrationRevisionId = Brand<
  string,
  'PropulsionCalibrationRevisionId'
>;
export type PropulsionDatasetFingerprint = Brand<
  string,
  'PropulsionDatasetFingerprint'
>;
export type PropulsionCalibrationFingerprint = Brand<
  string,
  'PropulsionCalibrationFingerprint'
>;

export function asPropulsionDatasetId(value: string): PropulsionDatasetId {
  return value as PropulsionDatasetId;
}
export function asPropulsionDatasetRevisionId(
  value: string,
): PropulsionDatasetRevisionId {
  return value as PropulsionDatasetRevisionId;
}
export function asPropulsionDatasetReleaseId(
  value: string,
): PropulsionDatasetReleaseId {
  return value as PropulsionDatasetReleaseId;
}
export function asPropulsionCalibrationProfileId(
  value: string,
): PropulsionCalibrationProfileId {
  return value as PropulsionCalibrationProfileId;
}
export function asPropulsionCalibrationRevisionId(
  value: string,
): PropulsionCalibrationRevisionId {
  return value as PropulsionCalibrationRevisionId;
}
export function asPropulsionDatasetFingerprint(
  value: string,
): PropulsionDatasetFingerprint {
  return value as PropulsionDatasetFingerprint;
}
export function asPropulsionCalibrationFingerprint(
  value: string,
): PropulsionCalibrationFingerprint {
  return value as PropulsionCalibrationFingerprint;
}
