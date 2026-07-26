/**
 * Persistence-layer envelopes for IndexedDB.
 * Domain drafts/revisions remain the engineering source of truth;
 * envelopes add hangar/lifecycle metadata that must never enter fingerprints.
 */

import type {
  ArtifactFingerprint,
  BuildFingerprint,
  CompilationContextFingerprint,
  DroneBuildId,
  DroneBuildRevisionId,
  RuntimeCompatibilitySignature,
} from '@fpv/engineering-kernel';
import type {
  DroneBuild,
  DroneBuildDraft,
  DroneBuildRevision,
} from '@fpv/drone-build-domain';
import type { CompiledArtifactRecord } from '../ports/repositories';

/** Persistence envelope schema — independent of domain draft.schemaVersion. */
export const PERSISTENCE_RECORD_SCHEMA_VERSION = 1 as const;

/** Known older envelope schemas that can be migrated deterministically. */
export const SUPPORTED_PERSISTENCE_SCHEMA_VERSIONS = [1] as const;

export type PersistenceAttentionStatus =
  | 'ok'
  | 'unsupported-schema'
  | 'malformed'
  | 'missing-components'
  | 'incompatible-runtime';

export type PersistedSourceType = 'user-draft' | 'factory-duplicate';

export type PersistedCompileStatus =
  | 'never-compiled'
  | 'compiled'
  | 'stale-vs-draft';

export interface PersistedDraftRecord {
  readonly recordKind: 'draft';
  readonly recordSchemaVersion: number;
  readonly buildId: DroneBuildId;
  readonly displayName: string;
  readonly intentId: string | null;
  readonly sourceType: PersistedSourceType;
  readonly createdAtIso: string;
  readonly updatedAtIso: string;
  readonly compileStatus: PersistedCompileStatus;
  readonly attentionStatus: PersistenceAttentionStatus;
  readonly selectedComponentRevisionIds: readonly string[];
  readonly draft: DroneBuildDraft;
}

export interface PersistedBuildRecord {
  readonly recordKind: 'build';
  readonly recordSchemaVersion: number;
  readonly buildId: DroneBuildId;
  readonly displayName: string;
  readonly intentId: string | null;
  readonly sourceType: PersistedSourceType;
  readonly createdAtIso: string;
  readonly updatedAtIso: string;
  readonly build: DroneBuild;
  readonly attentionStatus: PersistenceAttentionStatus;
}

export interface PersistedCompiledRevisionRecord {
  readonly recordKind: 'compiled-revision';
  readonly recordSchemaVersion: number;
  readonly revisionId: DroneBuildRevisionId;
  readonly buildId: DroneBuildId;
  readonly displayNameAtCompile: string;
  readonly revisionLabel: string;
  readonly intentId: string | null;
  readonly aircraftId: string;
  readonly createdAtIso: string;
  readonly buildFingerprint: BuildFingerprint;
  readonly artifactFingerprint: ArtifactFingerprint;
  readonly compilationContextFingerprint: CompilationContextFingerprint;
  readonly runtimeCompatibilitySignature: RuntimeCompatibilitySignature;
  readonly engineeringModelVersion: string;
  readonly compilerVersion: string;
  readonly validationVersion: string | null;
  readonly runtimeAdapterVersion: string | null;
  readonly confidenceSummary: string | null;
  readonly massKg: number | null;
  readonly thrustNewtons: number | null;
  readonly presentationPackRef: string | null;
  readonly selectedComponentRevisionIds: readonly string[];
  readonly runtimeCompatibilityStatus:
    | 'compatible'
    | 'incompatible'
    | 'unknown';
  readonly attentionStatus: PersistenceAttentionStatus;
  readonly revision: DroneBuildRevision;
  /** Optional cached artifact for exact restore without recompile. */
  readonly artifact: CompiledArtifactRecord | null;
}

export type ValidatedRecordResult<T> =
  | { readonly ok: true; readonly record: T }
  | {
      readonly ok: false;
      readonly attentionStatus: PersistenceAttentionStatus;
      readonly reason: string;
      readonly raw: unknown;
      /** Preserve unsupported/malformed payloads for safe deletion/recovery. */
      readonly preserved: unknown;
    };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDomainDraft(value: unknown): value is DroneBuildDraft {
  if (!isObject(value)) return false;
  return (
    typeof value['buildId'] === 'string' &&
    typeof value['schemaVersion'] === 'string' &&
    typeof value['name'] === 'string' &&
    Array.isArray(value['selections']) &&
    value['mutable'] === true
  );
}

function isDomainRevision(value: unknown): value is DroneBuildRevision {
  if (!isObject(value)) return false;
  return (
    typeof value['revisionId'] === 'string' &&
    typeof value['buildId'] === 'string' &&
    typeof value['schemaVersion'] === 'string' &&
    Array.isArray(value['selections']) &&
    value['immutable'] === true
  );
}

function selectionIdsFromDraft(draft: DroneBuildDraft): string[] {
  return draft.selections.map((s) => s.componentRevisionId);
}

function selectionIdsFromRevision(revision: DroneBuildRevision): string[] {
  return revision.selections.map((s) => s.componentRevisionId);
}

/** Migrate a legacy bare domain draft (pre-envelope) into the current envelope. */
export function migrateLegacyDraft(
  raw: unknown,
  nowIso = new Date().toISOString(),
): ValidatedRecordResult<PersistedDraftRecord> {
  if (!isDomainDraft(raw)) {
    return {
      ok: false,
      attentionStatus: 'malformed',
      reason: 'Not a domain draft or draft envelope',
      raw,
      preserved: raw,
    };
  }
  return {
    ok: true,
    record: {
      recordKind: 'draft',
      recordSchemaVersion: PERSISTENCE_RECORD_SCHEMA_VERSION,
      buildId: raw.buildId,
      displayName: raw.name,
      intentId: null,
      sourceType: 'user-draft',
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
      compileStatus: 'never-compiled',
      attentionStatus: 'ok',
      selectedComponentRevisionIds: selectionIdsFromDraft(raw),
      draft: raw,
    },
  };
}

export function parsePersistedDraft(
  raw: unknown,
): ValidatedRecordResult<PersistedDraftRecord> {
  if (!isObject(raw)) {
    return {
      ok: false,
      attentionStatus: 'malformed',
      reason: 'Draft record is not an object',
      raw,
      preserved: raw,
    };
  }

  // Legacy bare draft
  if (raw['mutable'] === true && !('recordKind' in raw)) {
    return migrateLegacyDraft(raw);
  }

  const schemaVersion = raw['recordSchemaVersion'];
  if (typeof schemaVersion !== 'number') {
    return {
      ok: false,
      attentionStatus: 'malformed',
      reason: 'Missing recordSchemaVersion',
      raw,
      preserved: raw,
    };
  }
  if (schemaVersion > PERSISTENCE_RECORD_SCHEMA_VERSION) {
    return {
      ok: false,
      attentionStatus: 'unsupported-schema',
      reason: `Unsupported future draft schema ${schemaVersion}`,
      raw,
      preserved: raw,
    };
  }
  if (
    !(SUPPORTED_PERSISTENCE_SCHEMA_VERSIONS as readonly number[]).includes(
      schemaVersion,
    )
  ) {
    return {
      ok: false,
      attentionStatus: 'unsupported-schema',
      reason: `Unsupported draft schema ${schemaVersion}`,
      raw,
      preserved: raw,
    };
  }

  if (raw['recordKind'] !== 'draft' || !isDomainDraft(raw['draft'])) {
    return {
      ok: false,
      attentionStatus: 'malformed',
      reason: 'Draft envelope missing domain draft',
      raw,
      preserved: raw,
    };
  }

  const draft = raw['draft'] as DroneBuildDraft;
  return {
    ok: true,
    record: {
      recordKind: 'draft',
      recordSchemaVersion: schemaVersion,
      buildId: draft.buildId,
      displayName:
        typeof raw['displayName'] === 'string' ? raw['displayName'] : draft.name,
      intentId:
        typeof raw['intentId'] === 'string' || raw['intentId'] === null
          ? (raw['intentId'] as string | null)
          : null,
      sourceType:
        raw['sourceType'] === 'factory-duplicate'
          ? 'factory-duplicate'
          : 'user-draft',
      createdAtIso:
        typeof raw['createdAtIso'] === 'string'
          ? raw['createdAtIso']
          : new Date(0).toISOString(),
      updatedAtIso:
        typeof raw['updatedAtIso'] === 'string'
          ? raw['updatedAtIso']
          : new Date(0).toISOString(),
      compileStatus:
        raw['compileStatus'] === 'compiled' ||
        raw['compileStatus'] === 'stale-vs-draft'
          ? raw['compileStatus']
          : 'never-compiled',
      attentionStatus:
        raw['attentionStatus'] === 'missing-components' ||
        raw['attentionStatus'] === 'malformed' ||
        raw['attentionStatus'] === 'unsupported-schema' ||
        raw['attentionStatus'] === 'incompatible-runtime'
          ? raw['attentionStatus']
          : 'ok',
      selectedComponentRevisionIds: Array.isArray(
        raw['selectedComponentRevisionIds'],
      )
        ? (raw['selectedComponentRevisionIds'] as string[])
        : selectionIdsFromDraft(draft),
      draft,
    },
  };
}

export function parsePersistedCompiledRevision(
  raw: unknown,
): ValidatedRecordResult<PersistedCompiledRevisionRecord> {
  if (!isObject(raw)) {
    return {
      ok: false,
      attentionStatus: 'malformed',
      reason: 'Compiled revision record is not an object',
      raw,
      preserved: raw,
    };
  }

  // Legacy bare revision — preserve but mark as needing attention for hangar display
  if (raw['immutable'] === true && !('recordKind' in raw)) {
    if (!isDomainRevision(raw)) {
      return {
        ok: false,
        attentionStatus: 'malformed',
        reason: 'Legacy revision malformed',
        raw,
        preserved: raw,
      };
    }
    const revision = raw;
    return {
      ok: true,
      record: {
        recordKind: 'compiled-revision',
        recordSchemaVersion: PERSISTENCE_RECORD_SCHEMA_VERSION,
        revisionId: revision.revisionId,
        buildId: revision.buildId,
        displayNameAtCompile: revision.buildId,
        revisionLabel: revision.revisionId,
        intentId: null,
        aircraftId: `user-${revision.revisionId}`,
        createdAtIso: new Date(0).toISOString(),
        buildFingerprint: '' as BuildFingerprint,
        artifactFingerprint: '' as ArtifactFingerprint,
        compilationContextFingerprint: '' as CompilationContextFingerprint,
        runtimeCompatibilitySignature: '' as RuntimeCompatibilitySignature,
        engineeringModelVersion: '',
        compilerVersion: '',
        validationVersion: null,
        runtimeAdapterVersion: null,
        confidenceSummary: null,
        massKg: null,
        thrustNewtons: null,
        presentationPackRef: null,
        selectedComponentRevisionIds: selectionIdsFromRevision(revision),
        runtimeCompatibilityStatus: 'unknown',
        attentionStatus: 'ok',
        revision,
        artifact: null,
      },
    };
  }

  const schemaVersion = raw['recordSchemaVersion'];
  if (typeof schemaVersion !== 'number') {
    return {
      ok: false,
      attentionStatus: 'malformed',
      reason: 'Missing recordSchemaVersion',
      raw,
      preserved: raw,
    };
  }
  if (schemaVersion > PERSISTENCE_RECORD_SCHEMA_VERSION) {
    return {
      ok: false,
      attentionStatus: 'unsupported-schema',
      reason: `Unsupported future compiled revision schema ${schemaVersion}`,
      raw,
      preserved: raw,
    };
  }
  if (
    !(SUPPORTED_PERSISTENCE_SCHEMA_VERSIONS as readonly number[]).includes(
      schemaVersion,
    )
  ) {
    return {
      ok: false,
      attentionStatus: 'unsupported-schema',
      reason: `Unsupported compiled revision schema ${schemaVersion}`,
      raw,
      preserved: raw,
    };
  }

  if (
    raw['recordKind'] !== 'compiled-revision' ||
    !isDomainRevision(raw['revision'])
  ) {
    return {
      ok: false,
      attentionStatus: 'malformed',
      reason: 'Compiled revision envelope missing domain revision',
      raw,
      preserved: raw,
    };
  }

  const revision = raw['revision'] as DroneBuildRevision;
  return {
    ok: true,
    record: {
      recordKind: 'compiled-revision',
      recordSchemaVersion: schemaVersion,
      revisionId: revision.revisionId,
      buildId: revision.buildId,
      displayNameAtCompile:
        typeof raw['displayNameAtCompile'] === 'string'
          ? raw['displayNameAtCompile']
          : revision.buildId,
      revisionLabel:
        typeof raw['revisionLabel'] === 'string'
          ? raw['revisionLabel']
          : revision.revisionId,
      intentId:
        typeof raw['intentId'] === 'string' || raw['intentId'] === null
          ? (raw['intentId'] as string | null)
          : null,
      aircraftId:
        typeof raw['aircraftId'] === 'string'
          ? raw['aircraftId']
          : `user-${revision.revisionId}`,
      createdAtIso:
        typeof raw['createdAtIso'] === 'string'
          ? raw['createdAtIso']
          : new Date(0).toISOString(),
      buildFingerprint: String(
        raw['buildFingerprint'] ?? '',
      ) as BuildFingerprint,
      artifactFingerprint: String(
        raw['artifactFingerprint'] ?? '',
      ) as ArtifactFingerprint,
      compilationContextFingerprint: String(
        raw['compilationContextFingerprint'] ?? '',
      ) as CompilationContextFingerprint,
      runtimeCompatibilitySignature: String(
        raw['runtimeCompatibilitySignature'] ?? '',
      ) as RuntimeCompatibilitySignature,
      engineeringModelVersion: String(raw['engineeringModelVersion'] ?? ''),
      compilerVersion: String(raw['compilerVersion'] ?? ''),
      validationVersion:
        typeof raw['validationVersion'] === 'string'
          ? raw['validationVersion']
          : null,
      runtimeAdapterVersion:
        typeof raw['runtimeAdapterVersion'] === 'string'
          ? raw['runtimeAdapterVersion']
          : null,
      confidenceSummary:
        typeof raw['confidenceSummary'] === 'string'
          ? raw['confidenceSummary']
          : null,
      massKg: typeof raw['massKg'] === 'number' ? raw['massKg'] : null,
      thrustNewtons:
        typeof raw['thrustNewtons'] === 'number' ? raw['thrustNewtons'] : null,
      presentationPackRef:
        typeof raw['presentationPackRef'] === 'string'
          ? raw['presentationPackRef']
          : null,
      selectedComponentRevisionIds: Array.isArray(
        raw['selectedComponentRevisionIds'],
      )
        ? (raw['selectedComponentRevisionIds'] as string[])
        : selectionIdsFromRevision(revision),
      runtimeCompatibilityStatus:
        raw['runtimeCompatibilityStatus'] === 'compatible' ||
        raw['runtimeCompatibilityStatus'] === 'incompatible'
          ? raw['runtimeCompatibilityStatus']
          : 'unknown',
      attentionStatus:
        raw['attentionStatus'] === 'missing-components' ||
        raw['attentionStatus'] === 'malformed' ||
        raw['attentionStatus'] === 'unsupported-schema' ||
        raw['attentionStatus'] === 'incompatible-runtime'
          ? raw['attentionStatus']
          : 'ok',
      revision,
      artifact:
        isObject(raw['artifact']) &&
        typeof (raw['artifact'] as Record<string, unknown>)[
          'artifactFingerprint'
        ] === 'string'
          ? (raw['artifact'] as unknown as CompiledArtifactRecord)
          : null,
    },
  };
}

export function createDraftEnvelope(input: {
  readonly draft: DroneBuildDraft;
  readonly intentId: string | null;
  readonly sourceType: PersistedSourceType;
  readonly createdAtIso?: string;
  readonly updatedAtIso?: string;
  readonly compileStatus?: PersistedCompileStatus;
  readonly attentionStatus?: PersistenceAttentionStatus;
}): PersistedDraftRecord {
  const now = new Date().toISOString();
  return {
    recordKind: 'draft',
    recordSchemaVersion: PERSISTENCE_RECORD_SCHEMA_VERSION,
    buildId: input.draft.buildId,
    displayName: input.draft.name,
    intentId: input.intentId,
    sourceType: input.sourceType,
    createdAtIso: input.createdAtIso ?? now,
    updatedAtIso: input.updatedAtIso ?? now,
    compileStatus: input.compileStatus ?? 'never-compiled',
    attentionStatus: input.attentionStatus ?? 'ok',
    selectedComponentRevisionIds: selectionIdsFromDraft(input.draft),
    draft: input.draft,
  };
}

export function createCompiledRevisionEnvelope(input: {
  readonly revision: DroneBuildRevision;
  readonly displayNameAtCompile: string;
  readonly revisionLabel: string;
  readonly intentId: string | null;
  readonly aircraftId: string;
  readonly createdAtIso?: string;
  readonly buildFingerprint: BuildFingerprint;
  readonly artifactFingerprint: ArtifactFingerprint;
  readonly compilationContextFingerprint: CompilationContextFingerprint;
  readonly runtimeCompatibilitySignature: RuntimeCompatibilitySignature;
  readonly engineeringModelVersion: string;
  readonly compilerVersion: string;
  readonly validationVersion?: string | null;
  readonly runtimeAdapterVersion?: string | null;
  readonly confidenceSummary?: string | null;
  readonly massKg?: number | null;
  readonly thrustNewtons?: number | null;
  readonly presentationPackRef?: string | null;
  readonly runtimeCompatibilityStatus?:
    | 'compatible'
    | 'incompatible'
    | 'unknown';
  readonly artifact?: CompiledArtifactRecord | null;
}): PersistedCompiledRevisionRecord {
  return {
    recordKind: 'compiled-revision',
    recordSchemaVersion: PERSISTENCE_RECORD_SCHEMA_VERSION,
    revisionId: input.revision.revisionId,
    buildId: input.revision.buildId,
    displayNameAtCompile: input.displayNameAtCompile,
    revisionLabel: input.revisionLabel,
    intentId: input.intentId,
    aircraftId: input.aircraftId,
    createdAtIso: input.createdAtIso ?? new Date().toISOString(),
    buildFingerprint: input.buildFingerprint,
    artifactFingerprint: input.artifactFingerprint,
    compilationContextFingerprint: input.compilationContextFingerprint,
    runtimeCompatibilitySignature: input.runtimeCompatibilitySignature,
    engineeringModelVersion: input.engineeringModelVersion,
    compilerVersion: input.compilerVersion,
    validationVersion: input.validationVersion ?? null,
    runtimeAdapterVersion: input.runtimeAdapterVersion ?? null,
    confidenceSummary: input.confidenceSummary ?? null,
    massKg: input.massKg ?? null,
    thrustNewtons: input.thrustNewtons ?? null,
    presentationPackRef: input.presentationPackRef ?? null,
    selectedComponentRevisionIds: selectionIdsFromRevision(input.revision),
    runtimeCompatibilityStatus: input.runtimeCompatibilityStatus ?? 'compatible',
    attentionStatus: 'ok',
    revision: input.revision,
    artifact: input.artifact ?? null,
  };
}
