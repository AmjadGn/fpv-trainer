import type { PersistedSourceType } from '@fpv/drone-build-persistence';

import type { CompatibilitySummaryLevel } from '../../drone-builder/models/drone-builder-view.models';
import type { ResolvedComponentMedia } from '../../drone-builder/models/component-presentation-media.models';

/**
 * Top-level Hangar library lifecycle state (Checkpoint 4).
 * Precedence when multiple conditions are true: failed > partial-recovery >
 * (storage-unavailable | empty, when there are no drafts/compiled cards) >
 * ready. `storage-unavailable` and `partial-recovery` are also exposed as
 * independent signals (see HangarLibraryService.isStorageUnavailable() and
 * .recoveryNotice()) so the UI can show a banner alongside non-empty,
 * otherwise-`ready` sections rather than hiding content behind the banner.
 */
export type HangarLibraryState =
  | 'loading'
  | 'ready'
  | 'empty'
  | 'storage-unavailable'
  | 'partial-recovery'
  | 'failed';

export interface HangarRecoveryNoticeView {
  readonly invalidDraftCount: number;
  readonly invalidCompiledCount: number;
}

export interface HangarDraftCardView {
  readonly buildId: string;
  readonly name: string;
  readonly intentId: string | null;
  readonly intentLabel: string | null;
  readonly completenessFraction: number;
  readonly completenessLabel: string;
  readonly compatibilityLevel: CompatibilitySummaryLevel;
  readonly compatibilityLabel: string;
  readonly updatedAtIso: string;
  readonly updatedLabel: string;
  readonly hasCompiledRevisions: boolean;
  readonly compiledRevisionCount: number;
  /** compileStatus === 'stale-vs-draft' — a compiled revision exists but the draft has changed since. */
  readonly isOutdated: boolean;
  /** One or more selected component revisions are no longer in the catalog. */
  readonly hasMissingComponents: boolean;
  readonly sourceType: PersistedSourceType;
  readonly frameMedia: ResolvedComponentMedia;
  /** Best-effort — whether this draft looks compilable without opening the Builder. */
  readonly canCompile: boolean;
}

export interface HangarCompiledCardView {
  readonly revisionId: string;
  readonly buildId: string;
  readonly aircraftId: string;
  readonly aircraftIdShort: string;
  readonly nameAtCompile: string;
  readonly revisionLabel: string;
  readonly intentId: string | null;
  readonly intentLabel: string | null;
  readonly createdAtIso: string;
  readonly createdLabel: string;
  readonly massLabel: string | null;
  readonly thrustLabel: string | null;
  readonly confidenceSummary: string | null;
  /** Matches current @fpv/engineering-kernel V1_1_VERSION_MANIFEST runtime signature. */
  readonly runtimeCompatible: boolean;
  readonly runtimeCompatibilityLabel: string;
  /** True when the originating draft (buildId) still has a persisted draft record. */
  readonly sourceDraftExists: boolean;
  /** Source draft was deleted — compiled revision remains flyable by design. */
  readonly isOrphan: boolean;
  /** Successfully restored and registered into AircraftCatalogService this session. */
  readonly isFlyable: boolean;
  readonly frameMedia: ResolvedComponentMedia | null;
}

export interface HangarRestoreOutcome {
  readonly runtimeCompatible: boolean;
  readonly flyable: boolean;
  readonly reason:
    | null
    | 'runtime-incompatible'
    | 'recompile-failed'
    | 'registration-failed'
    | 'error';
}
