import { Injectable, inject, signal } from '@angular/core';
import {
  buildOfficialCatalogSnapshot,
  type ComponentCatalogSnapshot,
  type ComponentRevision,
} from '@fpv/component-catalog';
import {
  createDraft,
  publishRevision,
  resolveAssembly,
  type DroneBuildDraft,
} from '@fpv/drone-build-domain';
import {
  compileAircraft,
  fingerprintRuntimeCompatibility,
  type CompilationResult,
} from '@fpv/aircraft-compiler';
import {
  executePreEngineeringValidation,
  FREE_FLIGHT_POLICY,
} from '@fpv/compatibility-engine';
import { V1_1_VERSION_MANIFEST } from '@fpv/engineering-kernel';
import {
  createDraftEnvelope,
  type PersistedCompiledRevisionRecord,
  type PersistedDraftRecord,
} from '@fpv/drone-build-persistence';

import { AircraftCatalogService } from '../../../core/aircraft/services/aircraft-catalog.service';
import { SelectedAircraftService } from '../../../core/aircraft/services/selected-aircraft.service';
import { AppShellService } from '../../../core/shell/app-shell.service';
import { DroneBuildPersistenceService } from '../../../core/drone-build/drone-build-persistence.service';
import { getBuildIntentProfile } from '../../drone-builder/models/build-intent.profiles';
import type { CompatibilitySummaryLevel } from '../../drone-builder/models/drone-builder-view.models';
import { BuilderPresentationMapperService } from '../../drone-builder/services/builder-presentation-mapper.service';
import { ComponentPresentationMediaService } from '../../drone-builder/services/component-presentation-media.service';
import { createAircraftDefinitionFromCompilation } from '../../drone-builder/services/compiled-aircraft-definition.factory';
import { DroneBuilderFacadeService } from '../../drone-builder/services/drone-builder-facade.service';
import type {
  HangarCompiledCardView,
  HangarDraftCardView,
  HangarLibraryState,
  HangarRecoveryNoticeView,
  HangarRestoreOutcome,
} from '../models/hangar-library.models';

const SLOT_KEYS = [
  'frame',
  'motor',
  'propeller',
  'battery',
  'esc',
  'fc',
  'camera',
  'vtx',
  'receiver',
] as const;
type SlotKey = (typeof SLOT_KEYS)[number];
type SlotMap = Partial<Record<SlotKey, string>>;

function slotFromSelectionId(selectionId: string): SlotKey | null {
  if (selectionId === 'frame') return 'frame';
  if (selectionId.startsWith('motor-')) return 'motor';
  if (selectionId.startsWith('prop-')) return 'propeller';
  if (selectionId === 'battery') return 'battery';
  if (selectionId === 'esc') return 'esc';
  if (selectionId === 'fc') return 'fc';
  if (selectionId === 'camera') return 'camera';
  if (selectionId === 'vtx') return 'vtx';
  if (selectionId === 'receiver') return 'receiver';
  return null;
}

function slotsFromSelections(
  selections: readonly { selectionId: string; componentRevisionId: string }[],
): SlotMap {
  const slots: SlotMap = {};
  for (const selection of selections) {
    const slot = slotFromSelectionId(selection.selectionId);
    if (slot) {
      slots[slot] = selection.componentRevisionId;
    }
  }
  return slots;
}

function compatibilityLabel(level: CompatibilitySummaryLevel): string {
  switch (level) {
    case 'cannot-compile':
      return 'Cannot compile';
    case 'needs-attention':
      return 'Needs attention';
    case 'recommendation':
      return 'Recommendation';
    case 'all-compatible':
      return 'All compatible';
  }
}

function shortenAircraftId(id: string): string {
  if (id.length <= 18) return id;
  return `${id.slice(0, 10)}…${id.slice(-6)}`;
}

function formatTimestampLabel(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function round(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/**
 * Hangar library orchestration for Checkpoint 4.
 * Reads/writes go through DroneBuildPersistenceService only; this service
 * never touches IndexedDB directly. Restoring compiled revisions into the
 * runtime AircraftCatalogService is gated on RuntimeCompatibilitySignature —
 * an incompatible record is shown but never registered as flyable, and
 * "Fly" always resolves through SelectedAircraftService.trySelectExact (no
 * silent DEFAULT_AIRCRAFT_ID fallback).
 */
@Injectable({ providedIn: 'root' })
export class HangarLibraryService {
  private readonly persistence = inject(DroneBuildPersistenceService);
  private readonly aircraftCatalog = inject(AircraftCatalogService);
  private readonly facade = inject(DroneBuilderFacadeService);
  private readonly selectedAircraft = inject(SelectedAircraftService);
  private readonly shell = inject(AppShellService);
  private readonly media = inject(ComponentPresentationMediaService);
  private readonly mapper = inject(BuilderPresentationMapperService);

  private catalogSnapshot: ComponentCatalogSnapshot | null = null;
  private restoredOnce = false;
  private restorePromise: Promise<void> | null = null;

  private readonly _state = signal<HangarLibraryState>('loading');
  private readonly _draftCards = signal<HangarDraftCardView[]>([]);
  private readonly _compiledCards = signal<HangarCompiledCardView[]>([]);
  private readonly _recoveryNotice = signal<HangarRecoveryNoticeView | null>(
    null,
  );
  private readonly _errorMessage = signal<string | null>(null);
  private readonly _actionNotice = signal<string | null>(null);

  readonly state = this._state.asReadonly();
  readonly draftCards = this._draftCards.asReadonly();
  readonly compiledCards = this._compiledCards.asReadonly();
  readonly recoveryNotice = this._recoveryNotice.asReadonly();
  readonly errorMessage = this._errorMessage.asReadonly();
  readonly actionNotice = this._actionNotice.asReadonly();
  /** Factory (non-user-build) aircraft — unchanged Hangar behavior. */
  readonly factoryAircraft = this.aircraftCatalog.factoryAircraft;
  readonly storageMessage = () => this.persistence.userMessage();
  readonly isStorageUnavailable = () =>
    this.persistence.backend() === 'memory-fallback';

  /**
   * Idempotent app-startup restore. Safe to call from App ngOnInit without
   * blocking UI — callers should `void` this call.
   */
  ensureRestored(): Promise<void> {
    if (this.restoredOnce) {
      return Promise.resolve();
    }
    if (this.restorePromise) {
      return this.restorePromise;
    }
    this.restorePromise = this.refresh().finally(() => {
      this.restoredOnce = true;
      this.restorePromise = null;
    });
    return this.restorePromise;
  }

  /** Full reload: list drafts + compiled revisions, restore into the runtime catalog, rebuild cards. */
  async refresh(): Promise<void> {
    this._state.set('loading');
    this._errorMessage.set(null);
    try {
      await this.persistence.ensureReady();
      this.ensureCatalogSnapshot();

      const [draftsListed, compiledListed] = await Promise.all([
        this.persistence.listDraftRecords(),
        this.persistence.listCompiledRevisionRecords(),
      ]);

      const outcomes = this.restoreRecords(compiledListed.valid);

      const draftCards = draftsListed.valid
        .map((record) => this.buildDraftCard(record, compiledListed.valid))
        .sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso));

      const compiledCards = compiledListed.valid
        .map((record) =>
          this.buildCompiledCard(record, draftsListed.valid, outcomes),
        )
        .sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));

      this._draftCards.set(draftCards);
      this._compiledCards.set(compiledCards);

      const invalidDraftCount = draftsListed.invalid.length;
      const invalidCompiledCount = compiledListed.invalid.length;
      this._recoveryNotice.set(
        invalidDraftCount > 0 || invalidCompiledCount > 0
          ? { invalidDraftCount, invalidCompiledCount }
          : null,
      );

      // Precedence: failed > partial-recovery > (empty variants) > ready.
      // `storage-unavailable` and `partial-recovery` banners are also
      // exposed independently (isStorageUnavailable(), recoveryNotice()) so
      // the UI can show sections + a banner at the same time; `state` is the
      // single most useful headline for the whole library.
      if (invalidDraftCount > 0 || invalidCompiledCount > 0) {
        this._state.set('partial-recovery');
      } else if (draftCards.length === 0 && compiledCards.length === 0) {
        this._state.set(
          this.persistence.backend() === 'memory-fallback'
            ? 'storage-unavailable'
            : 'empty',
        );
      } else {
        this._state.set('ready');
      }
    } catch (error) {
      this._state.set('failed');
      this._errorMessage.set(
        error instanceof Error ? error.message : String(error),
      );
      console.warn('[hangar-library] refresh failed', error);
    }
  }

  /** Public entry point for standalone restore (also used internally by refresh()). */
  async restoreCompiledAircraftIntoCatalog(): Promise<
    ReadonlyMap<string, HangarRestoreOutcome>
  > {
    await this.persistence.ensureReady();
    this.ensureCatalogSnapshot();
    const listed = await this.persistence.listCompiledRevisionRecords();
    return this.restoreRecords(listed.valid);
  }

  clearActionNotice(): void {
    this._actionNotice.set(null);
  }

  // ---------------------------------------------------------------------
  // Draft actions
  // ---------------------------------------------------------------------

  async openDraftInBuilder(buildId: string): Promise<boolean> {
    const ok = await this.facade.openDraft(buildId);
    if (ok) {
      this.shell.showBuilder();
    } else {
      this._errorMessage.set('Could not open this draft in the Builder.');
    }
    return ok;
  }

  async duplicateDraft(buildId: string): Promise<string | null> {
    const newBuildId = await this.facade.duplicateDraft(buildId);
    await this.refresh();
    if (newBuildId) {
      this._actionNotice.set('Draft duplicated.');
    }
    return newBuildId;
  }

  /** Caller (UI) collects the new name and confirms before calling this. */
  async renameDraft(buildId: string, newName: string): Promise<boolean> {
    const trimmed = newName.trim();
    if (!trimmed) {
      return false;
    }
    await this.persistence.ensureReady();
    const existing = await this.persistence.getDraftRecord(buildId);
    if (!existing?.ok) {
      this._errorMessage.set('Could not rename — draft is unavailable.');
      return false;
    }
    const record = existing.record;
    const updatedDraft: DroneBuildDraft = { ...record.draft, name: trimmed };
    const now = new Date().toISOString();
    const envelope = createDraftEnvelope({
      draft: updatedDraft,
      intentId: record.intentId,
      sourceType: record.sourceType,
      createdAtIso: record.createdAtIso,
      updatedAtIso: now,
      compileStatus: record.compileStatus,
      attentionStatus: record.attentionStatus,
    });
    await this.persistence.saveDraftRecord(envelope);
    const build = await this.persistence.getBuild(buildId);
    if (build) {
      await this.persistence.saveBuild({
        ...build,
        name: trimmed,
        draft: updatedDraft,
      });
    }
    this._actionNotice.set(`Renamed to “${trimmed}”.`);
    await this.refresh();
    return true;
  }

  /** Caller (UI) must confirm first — compiled revisions for this draft remain flyable. */
  async deleteDraft(buildId: string): Promise<boolean> {
    const ok = await this.facade.deleteDraft(buildId);
    await this.refresh();
    if (ok) {
      this._actionNotice.set(
        'Draft deleted. Any compiled revisions remain flyable in the Hangar.',
      );
    }
    return ok;
  }

  async compileDraftFromHangar(buildId: string): Promise<boolean> {
    const opened = await this.facade.openDraft(buildId);
    if (!opened) {
      return false;
    }
    const result = await this.facade.compile();
    await this.refresh();
    return !Array.isArray(result) && result.ok;
  }

  async compileAndFlyDraft(buildId: string): Promise<boolean> {
    const opened = await this.facade.openDraft(buildId);
    if (!opened) {
      return false;
    }
    const ok = await this.facade.compileAndFly();
    await this.refresh();
    return ok;
  }

  // ---------------------------------------------------------------------
  // Compiled revision actions
  // ---------------------------------------------------------------------

  /** Exact-id fly only — never falls back to a different aircraft. */
  flyCompiled(revisionId: string): boolean {
    const card = this._compiledCards().find((c) => c.revisionId === revisionId);
    if (!card || !card.isFlyable) {
      this._errorMessage.set(
        'This compiled aircraft cannot be flown right now. It may be incompatible with the current simulator version — try recompiling from the source draft.',
      );
      return false;
    }
    const resolved = this.selectedAircraft.trySelectExact(card.aircraftId);
    if (!resolved) {
      this._errorMessage.set(
        'Compiled aircraft could not be selected. Try recompiling from the source draft.',
      );
      return false;
    }
    this.shell.showFlight({ kind: 'test-flight', aircraftId: resolved });
    return true;
  }

  /** Caller (UI) must confirm first. */
  async deleteCompiledRevision(revisionId: string): Promise<void> {
    const card = this._compiledCards().find((c) => c.revisionId === revisionId);
    await this.persistence.deleteCompiledRevisionRecord(revisionId);
    if (card) {
      this.aircraftCatalog.removeUserAircraft(card.aircraftId);
    }
    this._actionNotice.set('Compiled revision deleted.');
    await this.refresh();
  }

  /**
   * Duplicates the compiled revision's frozen selections into a new editable
   * draft and opens it directly in the Builder — compiled revisions are
   * immutable, so this is the only way to iterate on one.
   */
  async duplicateCompiledSourceIntoBuilder(
    revisionId: string,
  ): Promise<string | null> {
    await this.persistence.ensureReady();
    const result = await this.persistence.getCompiledRevisionRecord(
      revisionId,
    );
    if (!result?.ok) {
      this._errorMessage.set('Could not duplicate — compiled revision unavailable.');
      return null;
    }
    const record = result.record;
    const newBuildId = `user-copy-${Date.now().toString(36)}`;
    const copyName = `Copy of ${record.displayNameAtCompile}`;
    const copiedDraft = createDraft({
      buildId: newBuildId,
      name: copyName,
      description: `Duplicated from compiled revision ${record.revisionLabel}.`,
      catalogReleaseId: record.revision.catalogReleaseId,
      selections: record.revision.selections.map((s) => ({ ...s })),
      topology: record.revision.topology.map((e) => ({ ...e })),
      tuning: { ...record.revision.tuning },
    });
    const now = new Date().toISOString();
    const envelope = createDraftEnvelope({
      draft: copiedDraft,
      intentId: record.intentId,
      sourceType: 'user-draft',
      createdAtIso: now,
      updatedAtIso: now,
      compileStatus: 'never-compiled',
    });
    await this.persistence.saveDraftRecord(envelope);
    await this.persistence.saveBuild({
      buildId: copiedDraft.buildId,
      name: copiedDraft.name,
      description: copiedDraft.description,
      status: 'draft',
      draft: copiedDraft,
      publishedRevisionIds: [],
      latestPublishedRevisionId: null,
    });
    this._actionNotice.set(`Duplicated into a new draft “${copyName}”.`);
    const opened = await this.facade.openDraft(newBuildId);
    if (opened) {
      this.shell.showBuilder();
    }
    await this.refresh();
    return newBuildId;
  }

  // ---------------------------------------------------------------------
  // Restore internals
  // ---------------------------------------------------------------------

  private restoreRecords(
    records: readonly PersistedCompiledRevisionRecord[],
  ): Map<string, HangarRestoreOutcome> {
    this.ensureCatalogSnapshot();
    const expectedSignature = fingerprintRuntimeCompatibility(
      V1_1_VERSION_MANIFEST,
    );
    const outcomes = new Map<string, HangarRestoreOutcome>();

    for (const record of records) {
      try {
        if (record.artifact?.specification) {
          const runtimeCompatible =
            record.artifact.runtimeCompatibilitySignature ===
            expectedSignature;
          if (!runtimeCompatible) {
            outcomes.set(record.revisionId, {
              runtimeCompatible: false,
              flyable: false,
              reason: 'runtime-incompatible',
            });
            continue;
          }
          const compilation: CompilationResult = {
            ok: true,
            specification: record.artifact.specification,
            validation: record.artifact.specification.validation,
            integrityIssues: [],
            trace: [],
          };
          const registered = this.registerCompiledDefinition(
            record,
            compilation,
          );
          outcomes.set(record.revisionId, {
            runtimeCompatible: true,
            flyable: registered,
            reason: registered ? null : 'registration-failed',
          });
          continue;
        }

        // No cached artifact — best-effort recompile from the immutable
        // revision against the current catalog/policy. A fresh compile is
        // produced with the current runtime adapter, so it is compatible by
        // construction if it succeeds.
        const result = compileAircraft(
          record.revision,
          [...this.catalogSnapshot!.revisions.values()],
          { policy: FREE_FLIGHT_POLICY },
        );
        if (!result.ok || !result.specification) {
          outcomes.set(record.revisionId, {
            runtimeCompatible: true,
            flyable: false,
            reason: 'recompile-failed',
          });
          continue;
        }
        const registered = this.registerCompiledDefinition(record, result);
        outcomes.set(record.revisionId, {
          runtimeCompatible: true,
          flyable: registered,
          reason: registered ? null : 'registration-failed',
        });
      } catch (error) {
        outcomes.set(record.revisionId, {
          runtimeCompatible: false,
          flyable: false,
          reason: 'error',
        });
        console.warn(
          '[hangar-library] restore failed for revision',
          record.revisionId,
          error,
        );
      }
    }
    return outcomes;
  }

  private registerCompiledDefinition(
    record: PersistedCompiledRevisionRecord,
    compilation: CompilationResult,
  ): boolean {
    try {
      const definition = createAircraftDefinitionFromCompilation({
        aircraftId: record.aircraftId,
        displayName: record.displayNameAtCompile,
        buildId: record.buildId,
        revisionId: record.revisionId,
        intentId: record.intentId,
        // `presentationPackRef` persists the resulting AircraftCategory (e.g.
        // "freestyle-5inch"), not a factory template aircraft id — leave the
        // template unset so it is re-derived from intentId exactly as it was
        // at original compile time (see DroneBuilderFacadeService.compile()).
        compilation,
      });
      const validation = this.aircraftCatalog.validateDefinition(definition);
      if (!validation.ok) {
        return false;
      }
      this.aircraftCatalog.registerCompiledAircraft(definition);
      return true;
    } catch (error) {
      console.warn(
        '[hangar-library] could not register restored aircraft',
        record.aircraftId,
        error,
      );
      return false;
    }
  }

  // ---------------------------------------------------------------------
  // Card builders
  // ---------------------------------------------------------------------

  private buildDraftCard(
    record: PersistedDraftRecord,
    compiledValid: readonly PersistedCompiledRevisionRecord[],
  ): HangarDraftCardView {
    const compiledForBuild = compiledValid.filter(
      (r) => r.buildId === record.buildId,
    );
    const slots = slotsFromSelections(record.draft.selections);
    const filledCount = SLOT_KEYS.filter((k) => !!slots[k]).length;
    const hasMissingComponents =
      record.attentionStatus === 'missing-components' ||
      this.hasUnresolvableComponents(record.draft.selections);
    const compatibilityLevel = this.computeDraftCompatibility(
      record,
      hasMissingComponents,
    );
    const frameRevisionId = slots.frame ?? null;
    const frameMedia = this.media.resolve(
      frameRevisionId,
      'frame',
      this.componentDisplayName(frameRevisionId),
    );
    const intentProfile = getBuildIntentProfile(record.intentId ?? undefined);

    return {
      buildId: record.buildId,
      name: record.displayName,
      intentId: record.intentId,
      intentLabel: intentProfile?.title ?? null,
      completenessFraction: filledCount / SLOT_KEYS.length,
      completenessLabel: `${filledCount} of ${SLOT_KEYS.length} categories selected`,
      compatibilityLevel,
      compatibilityLabel: compatibilityLabel(compatibilityLevel),
      updatedAtIso: record.updatedAtIso,
      updatedLabel: formatTimestampLabel(record.updatedAtIso),
      hasCompiledRevisions: compiledForBuild.length > 0,
      compiledRevisionCount: compiledForBuild.length,
      isOutdated: record.compileStatus === 'stale-vs-draft',
      hasMissingComponents,
      sourceType: record.sourceType,
      frameMedia,
      canCompile: !hasMissingComponents && compatibilityLevel !== 'cannot-compile',
    };
  }

  private buildCompiledCard(
    record: PersistedCompiledRevisionRecord,
    draftsValid: readonly PersistedDraftRecord[],
    outcomes: ReadonlyMap<string, HangarRestoreOutcome>,
  ): HangarCompiledCardView {
    const outcome = outcomes.get(record.revisionId) ?? null;
    const sourceDraftExists = draftsValid.some(
      (d) => d.buildId === record.buildId,
    );
    const slots = slotsFromSelections(record.revision.selections);
    const frameRevisionId = slots.frame ?? null;
    const frameMedia = frameRevisionId
      ? this.media.resolve(
          frameRevisionId,
          'frame',
          this.componentDisplayName(frameRevisionId),
        )
      : null;
    const intentProfile = getBuildIntentProfile(record.intentId ?? undefined);
    const runtimeCompatible = outcome?.runtimeCompatible ?? false;

    return {
      revisionId: record.revisionId,
      buildId: record.buildId,
      aircraftId: record.aircraftId,
      aircraftIdShort: shortenAircraftId(record.aircraftId),
      nameAtCompile: record.displayNameAtCompile,
      revisionLabel: record.revisionLabel,
      intentId: record.intentId,
      intentLabel: intentProfile?.title ?? null,
      createdAtIso: record.createdAtIso,
      createdLabel: formatTimestampLabel(record.createdAtIso),
      massLabel: record.massKg != null ? `${round(record.massKg, 3)} kg` : null,
      thrustLabel:
        record.thrustNewtons != null
          ? `${round(record.thrustNewtons, 1)} N`
          : null,
      confidenceSummary: record.confidenceSummary,
      runtimeCompatible,
      runtimeCompatibilityLabel: runtimeCompatible
        ? 'Compatible with the current simulator version'
        : 'Incompatible with the current simulator version — recompile from the source draft to fly',
      sourceDraftExists,
      isOrphan: !sourceDraftExists,
      isFlyable: outcome?.flyable ?? false,
      frameMedia,
    };
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  private computeDraftCompatibility(
    record: PersistedDraftRecord,
    hasMissingComponents: boolean,
  ): CompatibilitySummaryLevel {
    if (hasMissingComponents) {
      return 'cannot-compile';
    }
    this.ensureCatalogSnapshot();
    try {
      const revision = publishRevision(
        record.draft,
        `${record.buildId}@hangar-preview`,
        null,
      );
      const assembly = resolveAssembly(
        revision,
        this.catalogSnapshot!.revisions,
      );
      const report = executePreEngineeringValidation(
        assembly,
        FREE_FLIGHT_POLICY,
      );
      const issues = this.mapper.mapValidationReport(report);
      return this.mapper.compatibilitySummaryLevel(issues);
    } catch {
      return 'cannot-compile';
    }
  }

  private hasUnresolvableComponents(
    selections: readonly { componentRevisionId: string }[],
  ): boolean {
    this.ensureCatalogSnapshot();
    return selections.some(
      (s) =>
        !this.catalogSnapshot!.revisions.has(
          s.componentRevisionId as ComponentRevision['revisionId'],
        ),
    );
  }

  private componentDisplayName(
    revisionId: string | null | undefined,
  ): string | null {
    if (!revisionId || !this.catalogSnapshot) return null;
    return (
      this.catalogSnapshot.revisions.get(
        revisionId as ComponentRevision['revisionId'],
      )?.display.displayName ?? null
    );
  }

  private ensureCatalogSnapshot(): void {
    if (!this.catalogSnapshot) {
      this.catalogSnapshot = buildOfficialCatalogSnapshot();
    }
  }
}
