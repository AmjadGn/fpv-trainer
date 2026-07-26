import { Injectable, computed, inject, signal } from '@angular/core';
import {
  buildOfficialCatalogSnapshot,
  type ComponentCatalogSnapshot,
  type ComponentRevision,
  type ComponentType,
} from '@fpv/component-catalog';
import {
  createDraft,
  createQuadSelections,
  publishRevision,
  resolveAssembly,
  type ComponentSelection,
  type DroneBuildDraft,
  type DroneBuildRevision,
  type TopologyEdge,
} from '@fpv/drone-build-domain';
import {
  compileAircraft,
  type CompilationResult,
} from '@fpv/aircraft-compiler';
import {
  executePreEngineeringValidation,
  FREE_FLIGHT_POLICY,
  type ValidationPolicy,
  type ValidationReport,
} from '@fpv/compatibility-engine';
import {
  createCompiledRevisionEnvelope,
  createDraftEnvelope,
  type PersistedCompiledRevisionRecord,
  type PersistedDraftRecord,
  type PersistedSourceType,
} from '@fpv/drone-build-persistence';
import {
  getFactoryManifest,
  materializeFactoryRevision,
  type FactoryAircraftId,
} from '@fpv/factory-aircraft';
import {
  asCatalogReleaseId,
  asDroneBuildId,
  V1_1_VERSION_MANIFEST,
} from '@fpv/engineering-kernel';

import { AircraftCatalogService } from '../../../core/aircraft/services/aircraft-catalog.service';
import { SelectedAircraftService } from '../../../core/aircraft/services/selected-aircraft.service';
import { AppShellService } from '../../../core/shell/app-shell.service';
import { DroneBuildPersistenceService } from '../../../core/drone-build/drone-build-persistence.service';
import {
  BUILD_INTENT_PROFILES,
  defaultBuildNameForIntent,
  getBuildIntentProfile,
  stockedCategoryLabel,
} from '../models/build-intent.profiles';
import {
  SIMPLE_STOCKED_CATEGORIES,
  type BuilderCategoryProgressView,
  type BuilderCompatibilityIssueView,
  type BuilderComponentOptionView,
  type BuilderEngineeringStatView,
  type BuilderMode,
  type BuildIntentId,
  type BuildReadinessState,
} from '../models/drone-builder-view.models';
import { BuilderPresentationMapperService } from './builder-presentation-mapper.service';
import {
  createAircraftDefinitionFromCompilation,
  userAircraftIdForRevision,
} from './compiled-aircraft-definition.factory';
import { ComponentPresentationMediaService } from './component-presentation-media.service';
import { DroneBuilderSessionService } from './drone-builder-session.service';

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

const SLOT_TO_TYPE: Record<SlotKey, ComponentType> = {
  frame: 'frame',
  motor: 'motor',
  propeller: 'propeller',
  battery: 'battery',
  esc: 'esc',
  fc: 'flight-controller',
  camera: 'camera',
  vtx: 'video-transmitter',
  receiver: 'receiver',
};

const TYPE_TO_SLOT: Record<string, SlotKey> = {
  frame: 'frame',
  motor: 'motor',
  propeller: 'propeller',
  battery: 'battery',
  esc: 'esc',
  'flight-controller': 'fc',
  camera: 'camera',
  'video-transmitter': 'vtx',
  receiver: 'receiver',
};

export type IntentChangeDecision =
  | 'applied'
  | 'needs-confirmation'
  | 'unchanged';

/**
 * Application orchestration for the shared Drone Builder core.
 * Coordinates catalog → domain → validation → engineering → persistence →
 * compilation → runtime selection. Does not embed engineering equations.
 */
@Injectable({ providedIn: 'root' })
export class DroneBuilderFacadeService {
  private readonly session = inject(DroneBuilderSessionService);
  private readonly mapper = inject(BuilderPresentationMapperService);
  private readonly media = inject(ComponentPresentationMediaService);
  private readonly aircraftCatalog = inject(AircraftCatalogService);
  private readonly selectedAircraft = inject(SelectedAircraftService);
  private readonly shell = inject(AppShellService);
  private readonly persistence = inject(DroneBuildPersistenceService);

  private catalogSnapshot: ComponentCatalogSnapshot | null = null;
  private draft: DroneBuildDraft | null = null;
  private lastPublishedRevision: DroneBuildRevision | null = null;
  private lastCompilation: CompilationResult | null = null;
  private lastEngineeringPreview: CompilationResult | null = null;
  private readonly policy: ValidationPolicy = FREE_FLIGHT_POLICY;
  private pendingIntentId: BuildIntentId | null = null;
  private baselineSlots: SlotMap = {};
  private draftCreatedAtIso: string | null = null;
  private draftSourceType: PersistedSourceType = 'user-draft';
  private compileSequence = 0;

  private readonly _validationIssues = signal<BuilderCompatibilityIssueView[]>(
    [],
  );
  private readonly _engineeringStats = signal<BuilderEngineeringStatView[]>([]);
  private readonly _catalogLoaded = signal(false);
  private readonly _errorMessage = signal<string | null>(null);
  private readonly _saveNotice = signal<string | null>(null);

  readonly sessionSnapshot = this.session.snapshot;
  readonly validationIssues = this._validationIssues.asReadonly();
  readonly engineeringStats = this._engineeringStats.asReadonly();
  readonly catalogLoaded = this._catalogLoaded.asReadonly();
  readonly errorMessage = this._errorMessage.asReadonly();
  readonly saveNotice = this._saveNotice.asReadonly();
  readonly intents = BUILD_INTENT_PROFILES;
  readonly stockedCategories = SIMPLE_STOCKED_CATEGORIES;

  readonly simpleStats = computed(() =>
    this._engineeringStats().filter((s) => !s.advancedOnly),
  );
  readonly advancedStats = computed(() => this._engineeringStats());

  readonly blockingIssues = computed(() =>
    this._validationIssues().filter((i) => i.issueClass === 'blocking-error'),
  );
  readonly warningIssues = computed(() =>
    this._validationIssues().filter((i) => i.issueClass === 'warning'),
  );
  readonly infoIssues = computed(() =>
    this._validationIssues().filter(
      (i) =>
        i.issueClass === 'recommendation' || i.issueClass === 'information',
    ),
  );
  readonly recommendationIssues = computed(() =>
    this._validationIssues().filter((i) => i.issueClass === 'recommendation'),
  );
  readonly informationIssues = computed(() =>
    this._validationIssues().filter((i) => i.issueClass === 'information'),
  );

  readonly categoryProgress = computed<BuilderCategoryProgressView[]>(() =>
    this.buildCategoryProgress(),
  );

  readonly selectedCount = computed(
    () => this.categoryProgress().filter((c) => c.status !== 'missing').length,
  );

  readonly readinessSummaryLines = computed(() => {
    const selected = this.selectedCount();
    const total = SIMPLE_STOCKED_CATEGORIES.length;
    const lines = [`${selected} of ${total} required categories selected`];
    if (this.blockingIssues().length === 0) {
      lines.push('No blocking compatibility issues');
    } else {
      lines.push(
        `${this.blockingIssues().length} blocking issue${this.blockingIssues().length === 1 ? '' : 's'}`,
      );
    }
    if (this.simpleStats().some((s) => s.available)) {
      lines.push('Engineering estimate available');
    } else {
      lines.push('Engineering estimate not available yet');
    }
    if (this.session.compileStale()) {
      lines.push('Previous compile is outdated — recompile before flying');
    }
    return lines;
  });

  readonly canLaunchCompiled = computed(() => {
    const compile = this.session.lastCompile();
    if (!compile?.ok || !compile.aircraftId || this.session.compileStale()) {
      return false;
    }
    return !!this.aircraftCatalog.getById(compile.aircraftId);
  });

  readonly pendingIntent = computed(() =>
    this.pendingIntentId
      ? getBuildIntentProfile(this.pendingIntentId) ?? null
      : null,
  );

  /** Load official catalog into the builder session. */
  async bootstrap(): Promise<void> {
    this.session.setPhase('loadingCatalog');
    this._errorMessage.set(null);
    try {
      await this.persistence.ensureReady();
      this.session.setPersistenceBackend(this.persistence.backend());
      if (this.persistence.backend() === 'memory-fallback') {
        this.session.setSaveState('storage-unavailable');
        this._saveNotice.set(this.persistence.userMessage());
      }
      this.catalogSnapshot = buildOfficialCatalogSnapshot();
      this._catalogLoaded.set(true);
      if (!this.draft) {
        this.session.setPhase('idle');
        this.updateReadiness();
      } else {
        this.revalidate();
      }
    } catch (error) {
      this._errorMessage.set(
        error instanceof Error ? error.message : String(error),
      );
      this.session.setPhase('idle');
    }
  }

  setMode(mode: BuilderMode): void {
    this.session.setMode(mode);
  }

  setActiveCategory(category: ComponentType): void {
    if (!SIMPLE_STOCKED_CATEGORIES.includes(category)) return;
    this.session.setActiveCategory(category);
  }

  setBuildName(name: string): void {
    const trimmed = name.trim() || 'Untitled Build';
    if (!this.draft) {
      this.session.setBuildName(trimmed, true);
      return;
    }
    this.draft = { ...this.draft, name: trimmed };
    this.session.setBuildName(trimmed, true);
  }

  /**
   * Request an intent change. Returns needs-confirmation when the user has
   * modified the current draft selections.
   */
  requestIntentChange(intentId: BuildIntentId): IntentChangeDecision {
    const profile = getBuildIntentProfile(intentId);
    if (!profile) {
      this._errorMessage.set(`Unknown flying style: ${intentId}`);
      return 'unchanged';
    }

    if (this.session.intentId() === intentId && this.draft) {
      return 'unchanged';
    }

    const userModified = this.hasUserModifiedSelections();
    if (this.draft && userModified) {
      this.pendingIntentId = intentId;
      return 'needs-confirmation';
    }

    this.applyIntentReplaceSelections(intentId);
    return 'applied';
  }

  confirmIntentReplaceSelections(): void {
    if (!this.pendingIntentId) return;
    const intentId = this.pendingIntentId;
    this.pendingIntentId = null;
    this.applyIntentReplaceSelections(intentId);
  }

  confirmIntentLabelOnly(): void {
    if (!this.pendingIntentId) return;
    this.session.setIntentId(this.pendingIntentId);
    this.pendingIntentId = null;
    this.session.setDirty(true);
  }

  cancelPendingIntentChange(): void {
    this.pendingIntentId = null;
  }

  /** Start from an intent-recommended factory preset (duplicated, not mutated). */
  startFromIntent(intentId: BuildIntentId): void {
    this.applyIntentReplaceSelections(intentId);
  }

  /** Duplicate a factory aircraft into an editable user draft. */
  duplicateFactoryAircraft(
    factoryAircraftId: FactoryAircraftId | string,
    name?: string,
  ): void {
    this.loadFactoryIntoDraft(factoryAircraftId, name, {
      preserveManualName: false,
      markNameManual: false,
    });
  }

  applyRecommendedBuild(): void {
    const intentId = this.session.intentId();
    if (!intentId) {
      this._errorMessage.set(
        'Choose a flying style before applying a recommended build.',
      );
      return;
    }
    this.applyIntentReplaceSelections(intentId);
  }

  resetBuild(): void {
    this.draft = null;
    this.lastPublishedRevision = null;
    this.lastCompilation = null;
    this.lastEngineeringPreview = null;
    this.baselineSlots = {};
    this.pendingIntentId = null;
    this.draftCreatedAtIso = null;
    this.draftSourceType = 'user-draft';
    this.compileSequence = 0;
    this._validationIssues.set([]);
    this._engineeringStats.set([]);
    this._saveNotice.set(null);
    this._errorMessage.set(null);
    const mode = this.session.mode();
    const backend = this.session.persistenceBackend();
    this.session.resetSession();
    this.session.setMode(mode);
    this.session.setPersistenceBackend(backend);
    if (backend === 'memory-fallback') {
      this.session.setSaveState('storage-unavailable');
    }
  }

  selectComponentForActiveCategory(revisionId: string): void {
    if (!this.draft) {
      this._errorMessage.set('Choose a flying style before selecting parts.');
      return;
    }
    this.ensureCatalog();
    const revision = this.catalogSnapshot!.revisions.get(
      revisionId as ComponentRevision['revisionId'],
    );
    if (!revision) {
      this._errorMessage.set(`Unknown component: ${revisionId}`);
      return;
    }

    const slot = TYPE_TO_SLOT[revision.componentType];
    if (!slot) {
      this._errorMessage.set(
        `${revision.componentType} is not available in Simple Builder yet.`,
      );
      return;
    }

    const nextSlots: SlotMap = {
      ...(this.session.selectedRevisionIdsBySlot() as SlotMap),
      [slot]: revisionId,
    };
    this.rebuildDraftFromSlots(nextSlots);
    this.markCompilationStale();
    this.revalidate();
  }

  optionsForActiveCategory(): ComponentRevision[] {
    this.ensureCatalog();
    const category = this.session.activeCategory();
    return [...this.catalogSnapshot!.revisions.values()].filter(
      (r) => r.componentType === category && r.releaseStatus === 'published',
    );
  }

  mappedOptionsForActiveCategory(): BuilderComponentOptionView[] {
    const recommended = this.recommendedSlotsForCurrentIntent();
    const selected = this.session.selectedRevisionIdsBySlot() as SlotMap;
    const active = this.session.activeCategory();
    const slot = TYPE_TO_SLOT[active];
    return this.optionsForActiveCategory().map((r) =>
      this.mapper.mapComponentOption(r, {
        selected: slot ? selected[slot] === r.revisionId : false,
        isRecommended: slot ? recommended[slot] === r.revisionId : false,
        compatibilityStatus: 'compatible',
      }),
    );
  }

  mappedAdvancedDetailsForActiveCategory() {
    const recommended = this.recommendedSlotsForCurrentIntent();
    const selected = this.session.selectedRevisionIdsBySlot() as SlotMap;
    const active = this.session.activeCategory();
    const slot = TYPE_TO_SLOT[active];
    return this.optionsForActiveCategory().map((r) =>
      this.mapper.mapAdvancedComponentDetail(r, {
        selected: slot ? selected[slot] === r.revisionId : false,
        isRecommended: slot ? recommended[slot] === r.revisionId : false,
        compatibilityStatus: 'compatible',
      }),
    );
  }

  currentTuningInfo() {
    return this.mapper.mapTuningInfo(this.draft?.tuning ?? null);
  }

  currentProvenanceInfo() {
    const spec =
      this.lastEngineeringPreview?.specification ??
      this.lastCompilation?.specification;
    const thrustStat = this._engineeringStats().find((s) => s.id === 'thrust');
    return this.mapper.mapProvenanceInfo(
      spec?.propulsion.dataProvenance ??
        (thrustStat?.source === 'Curated synthetic'
          ? 'curated-estimate-table'
          : thrustStat?.source === 'Legacy fallback'
            ? 'peak-thrust-hint-fallback'
            : thrustStat?.source === 'Estimated'
              ? 'estimated'
              : thrustStat?.source === 'Measured'
                ? 'measured-table'
                : undefined),
      spec?.propulsion.confidence ?? thrustStat?.confidence,
    );
  }

  navigateToAffectedCategory(
    category: ComponentType | 'build' | 'unknown',
  ): void {
    if (category === 'build' || category === 'unknown') return;
    this.setActiveCategory(category);
  }

  selectedOptionName(category: ComponentType): string | null {
    const slot = TYPE_TO_SLOT[category];
    if (!slot) return null;
    const revisionId = (this.session.selectedRevisionIdsBySlot() as SlotMap)[
      slot
    ];
    if (!revisionId || !this.catalogSnapshot) return null;
    return (
      this.catalogSnapshot.revisions.get(
        revisionId as ComponentRevision['revisionId'],
      )?.display.displayName ?? null
    );
  }

  revalidate(): ValidationReport | null {
    if (!this.draft) {
      this.session.setPhase('idle');
      this.session.setCompileGate(false, 'Choose a flying style to start.');
      this._validationIssues.set([]);
      this._engineeringStats.set([]);
      this.updateReadiness();
      return null;
    }
    this.ensureCatalog();
    this.refreshMissingComponentState();
    if (this.session.hasMissingComponents()) {
      this.session.setPhase('invalid');
      this.updateReadiness();
      return null;
    }
    this.session.setPhase('validating');

    const missing = this.missingRequiredSlots();
    if (missing.length > 0) {
      this.session.setCompileGate(
        false,
        `Select ${missing.map(stockedCategoryLabel).join(', ')} before compiling.`,
      );
      this._validationIssues.set([]);
      this._engineeringStats.set([]);
      this.session.setCompatibilityLevel('cannot-compile');
      this.session.setPhase('invalid');
      this.updateReadiness();
      return null;
    }

    const revision = this.draftAsEphemeralRevision();
    const assembly = resolveAssembly(
      revision,
      this.catalogSnapshot!.revisions,
    );
    const report = executePreEngineeringValidation(assembly, this.policy);
    const issues = this.mapper.mapValidationReport(report);
    this._validationIssues.set(issues);
    this.session.setCompatibilityLevel(
      this.mapper.compatibilitySummaryLevel(issues),
    );

    if (!report.canCompile) {
      const first = issues.find((i) => i.issueClass === 'blocking-error');
      this.session.setCompileGate(
        false,
        first?.suggestedAction ??
          'Resolve blocking compatibility issues before compiling.',
      );
      this._engineeringStats.set([]);
      this.session.setPhase('invalid');
      this.updateReadiness();
      return report;
    }

    this.session.setCompileGate(true, null);
    this.refreshEngineeringPreview(revision);
    this.session.setPhase('valid');
    this.updateReadiness();
    return report;
  }

  async saveDraft(): Promise<boolean> {
    if (!this.draft) {
      this._errorMessage.set('Nothing to save yet.');
      return false;
    }
    this.session.setPhase('saving');
    this.session.setSaveState('saving');
    this._saveNotice.set(null);
    this._errorMessage.set(null);
    try {
      await this.persistence.ensureReady();
      const now = new Date().toISOString();
      const existing = await this.persistence.getDraftRecord(this.draft.buildId);
      const createdAtIso =
        existing?.ok === true
          ? existing.record.createdAtIso
          : (this.draftCreatedAtIso ?? now);
      this.draftCreatedAtIso = createdAtIso;

      const compiledForBuild =
        await this.persistence.listCompiledRevisionRecordsForBuild(
          this.draft.buildId,
        );
      const hasCompiled = compiledForBuild.valid.length > 0;

      const envelope = createDraftEnvelope({
        draft: this.draft,
        intentId: this.session.intentId(),
        sourceType: this.draftSourceType,
        createdAtIso,
        updatedAtIso: now,
        compileStatus: hasCompiled
          ? this.session.compileStale() || !this.session.lastCompile()?.ok
            ? 'stale-vs-draft'
            : 'compiled'
          : 'never-compiled',
        attentionStatus: this.session.hasMissingComponents()
          ? 'missing-components'
          : 'ok',
      });

      const build = {
        buildId: this.draft.buildId,
        name: this.draft.name,
        description: this.draft.description,
        status: 'draft' as const,
        draft: this.draft,
        publishedRevisionIds: (
          await this.persistence.getBuild(this.draft.buildId)
        )?.publishedRevisionIds ??
          compiledForBuild.valid.map((r) => r.revisionId),
        latestPublishedRevisionId:
          (await this.persistence.getBuild(this.draft.buildId))
            ?.latestPublishedRevisionId ??
          compiledForBuild.valid[compiledForBuild.valid.length - 1]
            ?.revisionId ??
          null,
      };

      await this.persistence.saveBuild(build);
      await this.persistence.saveDraftRecord(envelope);

      const persistent = this.persistence.backend() === 'indexeddb';
      this.session.setPersistenceBackend(this.persistence.backend());
      if (persistent) {
        this.session.setSaveState('saved', now);
        this._saveNotice.set(
          `Saved locally on this device · Last saved at ${formatSaveClock(now)}`,
        );
      } else {
        this.session.setSaveState('storage-unavailable', now);
        this._saveNotice.set(
          this.persistence.userMessage() ??
            'Persistent storage is unavailable. Your changes are currently saved only for this session.',
        );
      }
      this.session.setPhase(this.session.canCompile() ? 'valid' : 'invalid');
      this.updateReadiness();
      return true;
    } catch (error) {
      this.session.setSaveState('save-failed');
      this._errorMessage.set(
        error instanceof Error ? error.message : String(error),
      );
      this._saveNotice.set('Saving failed — retry');
      this.session.setPhase(this.session.canCompile() ? 'valid' : 'invalid');
      return false;
    }
  }

  /** Reopen a persisted draft into the shared builder session. */
  async openDraft(buildId: string): Promise<boolean> {
    await this.persistence.ensureReady();
    this.ensureCatalog();
    const result = await this.persistence.getDraftRecord(buildId);
    if (!result) {
      this._errorMessage.set('Saved draft was not found.');
      return false;
    }
    if (!result.ok) {
      this._errorMessage.set(
        result.attentionStatus === 'unsupported-schema'
          ? 'This saved draft uses an unsupported schema and cannot be opened safely.'
          : 'This saved draft is damaged and cannot be opened. It was preserved for recovery.',
      );
      return false;
    }

    const record = result.record;
    this.applyPersistedDraft(record);
    this.revalidate();
    this.session.setSaveState(
      this.persistence.backend() === 'indexeddb' ? 'saved' : 'storage-unavailable',
      record.updatedAtIso,
    );
    this._saveNotice.set(
      this.persistence.backend() === 'indexeddb'
        ? `Saved locally on this device · Last saved at ${formatSaveClock(record.updatedAtIso)}`
        : this.persistence.userMessage(),
    );
    return true;
  }

  /** Duplicate the current draft or a persisted draft into a new build ID. */
  async duplicateDraft(sourceBuildId?: string): Promise<string | null> {
    await this.persistence.ensureReady();
    let source: PersistedDraftRecord | null = null;
    if (sourceBuildId) {
      const loaded = await this.persistence.getDraftRecord(sourceBuildId);
      if (!loaded?.ok) {
        this._errorMessage.set('Could not duplicate — source draft unavailable.');
        return null;
      }
      source = loaded.record;
    } else if (this.draft) {
      source = createDraftEnvelope({
        draft: this.draft,
        intentId: this.session.intentId(),
        sourceType: this.draftSourceType,
        createdAtIso: this.draftCreatedAtIso ?? new Date().toISOString(),
      });
    }
    if (!source) {
      this._errorMessage.set('Nothing to duplicate.');
      return null;
    }

    const newBuildId = `user-copy-${Date.now().toString(36)}`;
    const copyName = `Copy of ${source.displayName}`;
    const copiedDraft = createDraft({
      buildId: newBuildId,
      name: copyName,
      description: source.draft.description,
      catalogReleaseId: source.draft.catalogReleaseId,
      selections: source.draft.selections.map((s) => ({ ...s })),
      topology: source.draft.topology.map((e) => ({ ...e })),
      tuning: { ...source.draft.tuning },
    });
    const now = new Date().toISOString();
    const envelope = createDraftEnvelope({
      draft: copiedDraft,
      intentId: source.intentId,
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
    this.applyPersistedDraft(envelope);
    this.revalidate();
    this.session.setSaveState(
      this.persistence.backend() === 'indexeddb' ? 'saved' : 'storage-unavailable',
      now,
    );
    this._saveNotice.set(`Duplicated as “${copyName}”.`);
    return newBuildId;
  }

  /**
   * Delete a draft. Compiled revisions are preserved by design.
   * UI must confirm before calling.
   */
  async deleteDraft(buildId: string): Promise<boolean> {
    await this.persistence.ensureReady();
    try {
      await this.persistence.deleteDraftRecord(buildId);
      await this.persistence.deleteBuild(buildId);
      if (this.draft?.buildId === buildId) {
        this.resetBuild();
      }
      this._saveNotice.set(
        'Draft deleted. Compiled revisions (if any) remain flyable in the Hangar.',
      );
      return true;
    } catch (error) {
      this._errorMessage.set(
        error instanceof Error ? error.message : String(error),
      );
      return false;
    }
  }

  async renameCurrentDraft(name: string): Promise<boolean> {
    this.setBuildName(name);
    return this.saveDraft();
  }

  async listPersistedDrafts(): Promise<readonly PersistedDraftRecord[]> {
    await this.persistence.ensureReady();
    const listed = await this.persistence.listDraftRecords();
    return listed.valid;
  }

  async listCompiledRevisionsForCurrentBuild(): Promise<
    readonly PersistedCompiledRevisionRecord[]
  > {
    if (!this.draft) return [];
    await this.persistence.ensureReady();
    const listed =
      await this.persistence.listCompiledRevisionRecordsForBuild(
        this.draft.buildId,
      );
    return listed.valid;
  }

  async compile(): Promise<BuilderCompatibilityIssueView[] | CompilationResult> {
    if (!this.draft) {
      this._errorMessage.set('Choose a flying style before compiling.');
      return this._validationIssues();
    }
    if (this.session.hasMissingComponents()) {
      this._errorMessage.set(
        'Replace outdated or missing components before compiling.',
      );
      this.session.setPhase('compileFailed');
      return this._validationIssues();
    }
    const previouslySelected = this.selectedAircraft.selectedAircraftId();
    const gate = this.revalidate();
    if (!gate?.canCompile || !this.session.canCompile()) {
      this.session.setPhase('compileFailed');
      this.session.setLastCompile(
        this.mapper.mapCompileResult(
          {
            ok: false,
            specification: null,
            validation: gate ?? {
              issues: [],
              hasFatal: true,
              hasError: true,
              hasWarning: false,
              canCompile: false,
            },
            integrityIssues: [],
            trace: [],
          },
          null,
          null,
        ),
      );
      this.updateReadiness();
      return this._validationIssues();
    }

    this.session.setPhase('compiling');
    this.ensureCatalog();

    this.compileSequence += 1;
    const revisionId = `${this.draft.buildId}@${Date.now().toString(36)}`;
    const published = publishRevision(
      this.draft,
      revisionId,
      this.lastPublishedRevision?.revisionId ?? null,
    );
    const result = compileAircraft(
      published,
      [...this.catalogSnapshot!.revisions.values()],
      { policy: this.policy },
    );

    if (!result.ok || !result.specification) {
      this.lastCompilation = result;
      this.session.setPhase('compileFailed');
      this.session.setLastCompile(
        this.mapper.mapCompileResult(result, null, null),
      );
      this._validationIssues.set(
        this.mapper.mapValidationReport(result.validation),
      );
      if (this.selectedAircraft.selectedAircraftId() !== previouslySelected) {
        this.selectedAircraft.select(previouslySelected);
      }
      this.updateReadiness();
      return result;
    }

    const existingCompiled =
      await this.persistence.listCompiledRevisionRecordsForBuild(
        this.draft.buildId,
      );
    const duplicate = existingCompiled.valid.find(
      (r) =>
        r.artifactFingerprint === result.specification!.artifactFingerprint,
    );
    if (duplicate) {
      this.lastPublishedRevision = duplicate.revision;
      this.lastCompilation = result;
      this._engineeringStats.set(
        this.mapper.mapEngineeringStats(result.specification),
      );
      const definition = createAircraftDefinitionFromCompilation({
        aircraftId: duplicate.aircraftId,
        displayName: duplicate.displayNameAtCompile,
        buildId: duplicate.buildId,
        revisionId: duplicate.revisionId,
        intentId: duplicate.intentId,
        presentationTemplateAircraftId: duplicate.presentationPackRef,
        compilation: result,
      });
      this.aircraftCatalog.registerCompiledAircraft(definition);
      this.selectedAircraft.select(duplicate.aircraftId);
      this.session.setLastCompile(
        this.mapper.mapCompileResult(
          result,
          duplicate.aircraftId,
          duplicate.displayNameAtCompile,
        ),
      );
      this.session.setCompileStale(false);
      this.session.setPhase('compiled');
      this.session.setDirty(false);
      this.updateReadiness();
      return result;
    }

    this.lastPublishedRevision = published;
    this.lastCompilation = result;
    this._engineeringStats.set(
      this.mapper.mapEngineeringStats(result.specification),
    );

    const aircraftId = userAircraftIdForRevision(published.revisionId);
    const definition = createAircraftDefinitionFromCompilation({
      aircraftId,
      displayName: this.draft.name,
      buildId: this.draft.buildId,
      revisionId: published.revisionId,
      intentId: this.session.intentId(),
      compilation: result,
    });

    const validation = this.aircraftCatalog.validateDefinition(definition);
    if (!validation.ok) {
      this.session.setPhase('compileFailed');
      this._errorMessage.set(validation.errors.join('; '));
      this.session.setLastCompile(
        this.mapper.mapCompileResult({ ...result, ok: false }, null, null),
      );
      if (this.selectedAircraft.selectedAircraftId() !== previouslySelected) {
        this.selectedAircraft.select(previouslySelected);
      }
      this.updateReadiness();
      return result;
    }

    const spec = result.specification;
    const artifact = {
      buildFingerprint: spec.buildFingerprint,
      compilationContextFingerprint: spec.compilationContextFingerprint,
      runtimeCompatibilitySignature: spec.runtimeCompatibilitySignature,
      artifactFingerprint: spec.artifactFingerprint,
      engineeringModelVersion: spec.versionManifest.engineeringModelVersion,
      compilerVersion: spec.versionManifest.compilerVersion,
      specification: spec,
      createdAtIso: new Date().toISOString(),
      trustStatus: 'local' as const,
    };

    const revisionLabel = `Revision ${existingCompiled.valid.length + 1}`;
    const envelope = createCompiledRevisionEnvelope({
      revision: published,
      displayNameAtCompile: this.draft.name,
      revisionLabel,
      intentId: this.session.intentId(),
      aircraftId,
      buildFingerprint: spec.buildFingerprint,
      artifactFingerprint: spec.artifactFingerprint,
      compilationContextFingerprint: spec.compilationContextFingerprint,
      runtimeCompatibilitySignature: spec.runtimeCompatibilitySignature,
      engineeringModelVersion: spec.versionManifest.engineeringModelVersion,
      compilerVersion: spec.versionManifest.compilerVersion,
      validationVersion: V1_1_VERSION_MANIFEST.validationRulesVersion,
      runtimeAdapterVersion: V1_1_VERSION_MANIFEST.runtimeAdapterVersion,
      confidenceSummary: `${spec.propulsion.confidence} · ${spec.propulsion.dataProvenance}`,
      massKg: spec.physicalAssembly.totalMassKg,
      thrustNewtons: spec.propulsion.totalMaxThrustNewtons,
      presentationPackRef: definition.category,
      artifact,
    });

    try {
      await this.persistence.ensureReady();
      await this.persistence.saveCompiledRevisionRecord(envelope);
      const existingBuild = await this.persistence.getBuild(this.draft.buildId);
      const publishedIds = [
        ...(existingBuild?.publishedRevisionIds ?? []),
        published.revisionId,
      ];
      await this.persistence.saveBuild({
        buildId: this.draft.buildId,
        name: this.draft.name,
        description: this.draft.description,
        status: 'compiled',
        draft: this.draft,
        publishedRevisionIds: publishedIds,
        latestPublishedRevisionId: published.revisionId,
      });
      await this.persistence.saveDraftRecord(
        createDraftEnvelope({
          draft: this.draft,
          intentId: this.session.intentId(),
          sourceType: this.draftSourceType,
          createdAtIso: this.draftCreatedAtIso ?? new Date().toISOString(),
          updatedAtIso: new Date().toISOString(),
          compileStatus: 'compiled',
        }),
      );
    } catch (error) {
      this._saveNotice.set(
        'Compile succeeded for this session, but persistent save of the compiled revision failed.',
      );
      console.warn('[builder] compiled revision persist failed', error);
    }

    this.aircraftCatalog.registerCompiledAircraft(definition);
    this.selectedAircraft.select(aircraftId);

    const compileView = this.mapper.mapCompileResult(
      result,
      aircraftId,
      definition.displayName,
    );
    this.session.setLastCompile(compileView);
    this.session.setCompileStale(false);
    this.session.setPhase('compiled');
    this.session.setDirty(false);
    this.updateReadiness();
    return result;
  }

  /**
   * Compile (if needed) and launch the compiled aircraft into the existing simulator.
   * Stale compilations cannot launch without recompilation.
   */
  async compileAndFly(): Promise<boolean> {
    const current = this.session.lastCompile();
    const needsCompile =
      !current?.ok ||
      !current.aircraftId ||
      this.session.compileStale() ||
      !this.aircraftCatalog.getById(current.aircraftId);

    if (needsCompile) {
      if (!this.session.canCompile()) {
        return false;
      }
      await this.compile();
      if (this.session.phase() !== 'compiled' || !this.session.lastCompile()?.ok) {
        return false;
      }
    }

    const launch = this.session.lastCompile();
    if (
      !launch?.ok ||
      !launch.aircraftId ||
      !launch.aircraftDisplayName ||
      this.session.compileStale()
    ) {
      return false;
    }

    const registered = this.aircraftCatalog.getById(launch.aircraftId);
    if (!registered) {
      this._errorMessage.set(
        'Compiled aircraft is missing from the catalog. Compile again before flying.',
      );
      return false;
    }

    this.session.setPhase('launching');
    this.session.setLaunchAircraftName(launch.aircraftDisplayName);
    const selected = this.selectedAircraft.select(launch.aircraftId);
    if (selected !== launch.aircraftId) {
      this._errorMessage.set(
        'Could not select the compiled aircraft. Flight launch was cancelled.',
      );
      this.session.setPhase('compiled');
      return false;
    }

    this.shell.showFlight({
      kind: 'test-flight',
      aircraftId: launch.aircraftId,
    });
    return true;
  }

  compileFingerprintForCurrentDraft(): string | null {
    if (!this.draft) return null;
    this.ensureCatalog();
    const published = publishRevision(
      this.draft,
      `${this.draft.buildId}@fingerprint`,
      null,
    );
    const result = compileAircraft(
      published,
      [...this.catalogSnapshot!.revisions.values()],
      { policy: this.policy },
    );
    return result.specification?.artifactFingerprint ?? null;
  }

  getDraftSelections(): readonly ComponentSelection[] {
    return this.draft?.selections ?? [];
  }

  getLastCompilation(): CompilationResult | null {
    return this.lastCompilation;
  }

  hasUserModifiedSelections(): boolean {
    if (!this.draft) return false;
    const current = this.session.selectedRevisionIdsBySlot() as SlotMap;
    for (const key of SLOT_KEYS) {
      if ((current[key] ?? null) !== (this.baselineSlots[key] ?? null)) {
        return true;
      }
    }
    return false;
  }

  replaceBuildRepositoryForTests(): void {
    this.persistence.replaceWithMemoryForTests();
    this.session.setPersistenceBackend('memory-fallback');
  }

  private applyPersistedDraft(record: PersistedDraftRecord): void {
    this.ensureCatalog();
    this.draft = {
      ...record.draft,
      selections: record.draft.selections.map((s) => ({ ...s })),
      topology: record.draft.topology.map((e) => ({ ...e })),
      tuning: { ...record.draft.tuning },
      mutable: true,
    };
    this.draftCreatedAtIso = record.createdAtIso;
    this.draftSourceType = record.sourceType;
    this.lastPublishedRevision = null;
    this.lastCompilation = null;
    this._engineeringStats.set([]);
    this.session.setIntentId(
      (record.intentId as BuildIntentId | null) ?? null,
    );
    this.session.setBuildIdentity(record.buildId, record.displayName);
    this.session.setNameManuallySet(true);
    const slots = this.slotsFromSelections(this.draft.selections);
    // Preserve original revision IDs even when missing from catalog.
    for (const selection of record.draft.selections) {
      const slot = TYPE_TO_SLOT[
        this.catalogSnapshot?.revisions.get(selection.componentRevisionId)
          ?.componentType ?? ''
      ];
      if (!slot) {
        // Infer slot from selectionId when catalog entry is missing.
        const inferred = this.slotFromSelectionId(selection.selectionId);
        if (inferred) {
          slots[inferred] = selection.componentRevisionId;
        }
      }
    }
    this.baselineSlots = { ...slots };
    this.session.setSelectedRevisionIdsBySlot(slots as Record<string, string>);
    this.session.setDirty(false);
    this.session.setLastCompile(null);
    this.session.setCompileStale(record.compileStatus === 'stale-vs-draft');
    this.session.setActiveCategory('frame');
    this.refreshMissingComponentState();
  }

  private slotFromSelectionId(selectionId: string): SlotKey | null {
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

  private refreshMissingComponentState(): void {
    if (!this.draft || !this.catalogSnapshot) {
      this.session.setHasMissingComponents(false);
      return;
    }
    const missing = this.draft.selections.filter(
      (s) => !this.catalogSnapshot!.revisions.has(s.componentRevisionId),
    );
    this.session.setHasMissingComponents(missing.length > 0);
    if (missing.length > 0) {
      const issues: BuilderCompatibilityIssueView[] = missing.map((s) => {
        const slot = this.slotFromSelectionId(s.selectionId);
        const category = slot ? SLOT_TO_TYPE[slot] : 'unknown';
        return {
          issueClass: 'blocking-error' as const,
          title: 'Missing component revision',
          explanation: `This build references component revision “${s.componentRevisionId}”, which is no longer in the current catalog.`,
          suggestedAction:
            'Choose a replacement part in this category before compiling.',
          affectedPartLabel: s.componentRevisionId,
          affectedCategory: category === 'unknown' ? 'unknown' : category,
          relatedSelectionIds: [s.selectionId],
          domainCode: 'MISSING_COMPONENT_REVISION',
          severity: 'error' as const,
        };
      });
      this._validationIssues.set(issues);
      this.session.setCompileGate(
        false,
        'Replace outdated or missing components before compiling.',
      );
      this.session.setCompatibilityLevel('cannot-compile');
    }
  }

  private applyIntentReplaceSelections(intentId: BuildIntentId): void {
    const profile = getBuildIntentProfile(intentId);
    if (!profile) return;
    this.session.setIntentId(intentId);
    const preserveManualName = this.session.nameManuallySet();
    const name = preserveManualName
      ? this.session.buildName()
      : defaultBuildNameForIntent(profile.title);
    this.loadFactoryIntoDraft(
      profile.recommendedFactoryAircraftId as FactoryAircraftId,
      name,
      {
        preserveManualName,
        markNameManual: preserveManualName,
      },
    );
  }

  private loadFactoryIntoDraft(
    factoryAircraftId: FactoryAircraftId | string,
    name: string | undefined,
    options: { preserveManualName: boolean; markNameManual: boolean },
  ): void {
    this.ensureCatalog();
    const manifest = getFactoryManifest(factoryAircraftId as FactoryAircraftId);
    const factoryRevision = materializeFactoryRevision(manifest);
    const buildId = `user-${factoryAircraftId}-${Date.now().toString(36)}`;
    const buildName =
      name ?? `${manifest.presentation.displayName} (Custom)`;

    this.draft = createDraft({
      buildId,
      name: buildName,
      description: `Duplicated from factory aircraft ${manifest.presentation.displayName}.`,
      catalogReleaseId: factoryRevision.catalogReleaseId,
      selections: factoryRevision.selections.map((s) => ({ ...s })),
      topology: factoryRevision.topology.map((e) => ({ ...e })),
      tuning: { ...factoryRevision.tuning },
    });
    this.draftCreatedAtIso = new Date().toISOString();
    this.draftSourceType = 'factory-duplicate';
    this.lastPublishedRevision = null;
    this.lastCompilation = null;
    this._engineeringStats.set([]);
    this._saveNotice.set(null);
    this.session.setBuildIdentity(buildId, buildName);
    this.session.setNameManuallySet(options.markNameManual);
    const slots = this.slotsFromSelections(this.draft.selections);
    this.baselineSlots = { ...slots };
    this.session.setSelectedRevisionIdsBySlot(slots as Record<string, string>);
    this.session.setDirty(false);
    this.session.setSaveState('unsaved');
    this.session.setLastCompile(null);
    this.session.setCompileStale(false);
    this.session.setHasMissingComponents(false);
    this.session.setActiveCategory('frame');
    this.revalidate();
  }

  private refreshEngineeringPreview(revision: DroneBuildRevision): void {
    this.ensureCatalog();
    const result = compileAircraft(
      revision,
      [...this.catalogSnapshot!.revisions.values()],
      { policy: this.policy },
    );
    if (result.ok && result.specification) {
      this.lastEngineeringPreview = result;
      this._engineeringStats.set(
        this.mapper.mapEngineeringStats(result.specification),
      );
    } else {
      this.lastEngineeringPreview = null;
      this._engineeringStats.set([]);
    }
  }

  private markCompilationStale(): void {
    if (this.session.lastCompile()?.ok) {
      this.session.setCompileStale(true);
    }
  }

  private missingRequiredSlots(): ComponentType[] {
    const slots = this.session.selectedRevisionIdsBySlot() as SlotMap;
    const missing: ComponentType[] = [];
    for (const category of SIMPLE_STOCKED_CATEGORIES) {
      const slot = TYPE_TO_SLOT[category];
      if (!slot || !slots[slot]) {
        missing.push(category);
      }
    }
    return missing;
  }

  private recommendedSlotsForCurrentIntent(): SlotMap {
    const intentId = this.session.intentId();
    const profile = getBuildIntentProfile(intentId);
    if (!profile) return {};
    try {
      const manifest = getFactoryManifest(
        profile.recommendedFactoryAircraftId as FactoryAircraftId,
      );
      const revision = materializeFactoryRevision(manifest);
      return this.slotsFromSelections(revision.selections);
    } catch {
      return {};
    }
  }

  private buildCategoryProgress(): BuilderCategoryProgressView[] {
    const slots = this.session.selectedRevisionIdsBySlot() as SlotMap;
    const recommended = this.recommendedSlotsForCurrentIntent();
    const blockingCats = new Set(
      this.blockingIssues()
        .map((i) => i.affectedCategory)
        .filter((c): c is ComponentType => c !== 'build' && c !== 'unknown'),
    );
    const active = this.session.activeCategory();

    return SIMPLE_STOCKED_CATEGORIES.map((category) => {
      const slot = TYPE_TO_SLOT[category];
      const selectedId = slot ? slots[slot] : undefined;
      let status: BuilderCategoryProgressView['status'] = 'missing';
      if (selectedId) {
        const inCatalog = !!this.catalogSnapshot?.revisions.get(
          selectedId as ComponentRevision['revisionId'],
        );
        if (!inCatalog) {
          status = 'needs-attention';
        } else if (blockingCats.has(category)) {
          status = 'needs-attention';
        } else if (slot && recommended[slot] === selectedId) {
          status = 'recommended';
        } else {
          status = 'selected';
        }
      }
      const selectedName = this.selectedOptionName(category);
      return {
        category,
        label: stockedCategoryLabel(category),
        status,
        selectedName: selectedName ?? (selectedId ? 'Unavailable / outdated' : null),
        selectedRevisionId: selectedId ?? null,
        media: selectedId
          ? this.media.resolve(selectedId, category, selectedName)
          : this.media.resolveForCategory(category),
        active: active === category,
      };
    });
  }

  private updateReadiness(): void {
    const readiness = this.computeReadiness();
    this.session.setReadiness(readiness);
  }

  private computeReadiness(): BuildReadinessState {
    if (
      this.session.lastCompile()?.ok &&
      !this.session.compileStale() &&
      this.session.phase() === 'compiled'
    ) {
      return 'compiled';
    }
    if (this.missingRequiredSlots().length > 0) {
      return 'incomplete';
    }
    if (this.blockingIssues().length > 0 || !this.session.canCompile()) {
      return 'has-blocking-issues';
    }
    return 'ready-to-compile';
  }

  private ensureCatalog(): void {
    if (!this.catalogSnapshot) {
      this.catalogSnapshot = buildOfficialCatalogSnapshot();
      this._catalogLoaded.set(true);
    }
  }

  private draftAsEphemeralRevision(): DroneBuildRevision {
    if (!this.draft) {
      throw new Error('No draft');
    }
    return publishRevision(this.draft, `${this.draft.buildId}@working`, null);
  }

  private slotsFromSelections(
    selections: readonly ComponentSelection[],
  ): SlotMap {
    const slots: SlotMap = {};
    for (const selection of selections) {
      if (selection.selectionId === 'frame') {
        slots.frame = selection.componentRevisionId;
      } else if (selection.selectionId.startsWith('motor-')) {
        slots.motor = selection.componentRevisionId;
      } else if (selection.selectionId.startsWith('prop-')) {
        slots.propeller = selection.componentRevisionId;
      } else if (selection.selectionId === 'battery') {
        slots.battery = selection.componentRevisionId;
      } else if (selection.selectionId === 'esc') {
        slots.esc = selection.componentRevisionId;
      } else if (selection.selectionId === 'fc') {
        slots.fc = selection.componentRevisionId;
      } else if (selection.selectionId === 'camera') {
        slots.camera = selection.componentRevisionId;
      } else if (selection.selectionId === 'vtx') {
        slots.vtx = selection.componentRevisionId;
      } else if (selection.selectionId === 'receiver') {
        slots.receiver = selection.componentRevisionId;
      }
    }
    return slots;
  }

  private rebuildDraftFromSlots(slots: Readonly<SlotMap>): void {
    if (!this.draft) return;
    this.ensureCatalog();

    const frameId = slots.frame;
    const motorId = slots.motor;
    const propId = slots.propeller;
    const batteryId = slots.battery;
    const escId = slots.esc;
    if (!frameId || !motorId || !propId || !batteryId || !escId) {
      this.session.setSelectedRevisionIdsBySlot(slots as Record<string, string>);
      this.session.setDirty(true);
      return;
    }

    const frame = this.catalogSnapshot!.revisions.get(
      frameId as ComponentRevision['revisionId'],
    );
    if (!frame || frame.engineering.type !== 'frame') {
      this._errorMessage.set('Selected frame is invalid.');
      return;
    }

    const built = createQuadSelections({
      frameRevisionId: frameId,
      motorRevisionId: motorId,
      propellerRevisionId: propId,
      batteryRevisionId: batteryId,
      escRevisionId: escId,
      fcRevisionId: slots.fc,
      cameraRevisionId: slots.camera,
      vtxRevisionId: slots.vtx,
      receiverRevisionId: slots.receiver,
      armPositions: frame.engineering.frame.armPositions,
    });

    this.draft = {
      ...this.draft,
      selections: built.selections,
      topology: built.topology as TopologyEdge[],
      catalogReleaseId: asCatalogReleaseId(
        this.catalogSnapshot!.release.releaseId,
      ),
      buildId: asDroneBuildId(this.draft.buildId),
    };
    this.session.setSelectedRevisionIdsBySlot(slots as Record<string, string>);
    this.session.setDirty(true);
  }
}

function formatSaveClock(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}
