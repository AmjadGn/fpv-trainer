/**
 * Drone Builder preparation — build domain now lives in @fpv/drone-build-domain.
 * Factory aircraft use immutable published revisions compiled to AircraftDefinition.
 */
export type {
  ComponentSelection as DroneBuildComponentSelection,
  DroneBuildRevision,
  DroneBuildDraft,
  DroneBuild,
  BuildLifecycleStatus,
} from '@fpv/drone-build-domain';

/** @deprecated Prefer installation slots from drone-build-domain. Kept for hangar stubs. */
export type DroneBuildSlot =
  | 'frame'
  | 'motors'
  | 'propellers'
  | 'battery'
  | 'camera'
  | 'antenna'
  | 'payload'
  | 'livery';

/** @deprecated Use ComponentSelection from @fpv/drone-build-domain. */
export interface DroneBuildComponentRef {
  slot: DroneBuildSlot;
  componentId: string;
  locked: true;
}

/** @deprecated Use DroneBuildRevision + factory manifests. */
export interface DroneBuildDefinition {
  buildId: string;
  aircraftId: string;
  components: DroneBuildComponentRef[];
  /** Physics are produced by @fpv/aircraft-compiler, not this stub. */
  generatesDefinition: boolean;
}
