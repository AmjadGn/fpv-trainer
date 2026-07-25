/** Branded string identifiers — opaque at compile time. */

declare const Brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [Brand]: B };

export type ComponentId = Brand<string, 'ComponentId'>;
export type ComponentRevisionId = Brand<string, 'ComponentRevisionId'>;
export type CatalogReleaseId = Brand<string, 'CatalogReleaseId'>;
export type DroneBuildId = Brand<string, 'DroneBuildId'>;
export type DroneBuildRevisionId = Brand<string, 'DroneBuildRevisionId'>;
export type MountPointId = Brand<string, 'MountPointId'>;
export type InstallationSlotId = Brand<string, 'InstallationSlotId'>;
export type BuildFingerprint = Brand<string, 'BuildFingerprint'>;
export type CompilationContextFingerprint = Brand<
  string,
  'CompilationContextFingerprint'
>;
export type ArtifactFingerprint = Brand<string, 'ArtifactFingerprint'>;
export type RuntimeCompatibilitySignature = Brand<
  string,
  'RuntimeCompatibilitySignature'
>;

export function asComponentId(value: string): ComponentId {
  return value as ComponentId;
}
export function asComponentRevisionId(value: string): ComponentRevisionId {
  return value as ComponentRevisionId;
}
export function asCatalogReleaseId(value: string): CatalogReleaseId {
  return value as CatalogReleaseId;
}
export function asDroneBuildId(value: string): DroneBuildId {
  return value as DroneBuildId;
}
export function asDroneBuildRevisionId(value: string): DroneBuildRevisionId {
  return value as DroneBuildRevisionId;
}
export function asMountPointId(value: string): MountPointId {
  return value as MountPointId;
}
export function asInstallationSlotId(value: string): InstallationSlotId {
  return value as InstallationSlotId;
}
export function asBuildFingerprint(value: string): BuildFingerprint {
  return value as BuildFingerprint;
}
export function asCompilationContextFingerprint(
  value: string,
): CompilationContextFingerprint {
  return value as CompilationContextFingerprint;
}
export function asArtifactFingerprint(value: string): ArtifactFingerprint {
  return value as ArtifactFingerprint;
}
export function asRuntimeCompatibilitySignature(
  value: string,
): RuntimeCompatibilitySignature {
  return value as RuntimeCompatibilitySignature;
}
