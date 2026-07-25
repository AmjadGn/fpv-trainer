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
  createMemoryBuildRepository,
  type DroneBuildRepository,
} from '@fpv/drone-build-persistence';
import {
  getFactoryManifest,
  materializeFactoryRevision,
  type FactoryAircraftId,
} from '@fpv/factory-aircraft';
import {
  asCatalogReleaseId,
  asDroneBuildId,
} from '@fpv/engineering-kernel';

import { AircraftCatalogService } from '../../../core/aircraft/services/aircraft-catalog.service';
import { SelectedAircraftService } from '../../../core/aircraft/services/selected-aircraft.service';
import { AppShellService } from '../../../core/shell/app-shell.service';
import {
  BUILD_INTENT_PROFILES,
  getBuildIntentProfile,
} from '../models/build-intent.profiles';
import type {
  BuilderCompatibilityIssueView,
  BuilderEngineeringStatView,
  BuilderMode,
  BuildIntentId,
} from '../models/drone-builder-view.models';
import { BuilderPresentationMapperService } from './builder-presentation-mapper.service';
import {
  createAircraftDefinitionFromCompilation,
  userAircraftIdForRevision,
} from './compiled-aircraft-definition.factory';
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

/**
 * Application orchestration for the shared Drone Builder core.
 * Coordinates catalog → domain → validation → engineering → persistence →
 * compilation → runtime selection. Does not embed engineering equations.
 */
@Injectable({ providedIn: 'root' })
export class DroneBuilderFacadeService {
  private readonly session = inject(DroneBuilderSessionService);
  private readonly mapper = inject(BuilderPresentationMapperService);
  private readonly aircraftCatalog = inject(AircraftCatalogService);
  private readonly selectedAircraft = inject(SelectedAircraftService);
  private readonly shell = inject(AppShellService);

  private catalogSnapshot: ComponentCatalogSnapshot | null = null;
  private draft: DroneBuildDraft | null = null;
  private lastPublishedRevision: DroneBuildRevision | null = null;
  private lastCompilation: CompilationResult | null = null;
  private buildRepo: DroneBuildRepository = createMemoryBuildRepository();
  private readonly policy: ValidationPolicy = FREE_FLIGHT_POLICY;

  private readonly _validationIssues = signal<BuilderCompatibilityIssueView[]>(
    [],
  );
  private readonly _engineeringStats = signal<BuilderEngineeringStatView[]>([]);
  private readonly _catalogLoaded = signal(false);
  private readonly _errorMessage = signal<string | null>(null);

  readonly sessionSnapshot = this.session.snapshot;
  readonly validationIssues = this._validationIssues.asReadonly();
  readonly engineeringStats = this._engineeringStats.asReadonly();
  readonly catalogLoaded = this._catalogLoaded.asReadonly();
  readonly errorMessage = this._errorMessage.asReadonly();
  readonly intents = BUILD_INTENT_PROFILES;

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

  /** Load official catalog into the builder session. */
  async bootstrap(): Promise<void> {
    this.session.setPhase('loadingCatalog');
    this._errorMessage.set(null);
    try {
      this.catalogSnapshot = buildOfficialCatalogSnapshot();
      this._catalogLoaded.set(true);
      if (!this.draft) {
        this.session.setPhase('idle');
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
    // Mode is presentation-only — selections stay on the shared draft.
    this.session.setMode(mode);
  }

  setActiveCategory(category: ComponentType): void {
    this.session.setActiveCategory(category);
  }

  setBuildName(name: string): void {
    if (!this.draft) return;
    this.draft = { ...this.draft, name };
    this.session.setBuildName(name);
  }

  /** Start from an intent-recommended factory preset (duplicated, not mutated). */
  startFromIntent(intentId: BuildIntentId): void {
    const profile = getBuildIntentProfile(intentId);
    if (!profile) {
      this._errorMessage.set(`Unknown intent: ${intentId}`);
      return;
    }
    this.session.setIntentId(intentId);
    this.duplicateFactoryAircraft(
      profile.recommendedFactoryAircraftId as FactoryAircraftId,
      `${profile.title} Build`,
    );
  }

  /** Duplicate a factory aircraft into an editable user draft. */
  duplicateFactoryAircraft(
    factoryAircraftId: FactoryAircraftId | string,
    name?: string,
  ): void {
    this.ensureCatalog();
    const manifest = getFactoryManifest(factoryAircraftId as FactoryAircraftId);
    const factoryRevision = materializeFactoryRevision(manifest);
    const buildId = `user-${factoryAircraftId}-${Date.now().toString(36)}`;
    const buildName = name ?? `${manifest.presentation.displayName} (Custom)`;

    this.draft = createDraft({
      buildId,
      name: buildName,
      description: `Duplicated from factory aircraft ${manifest.presentation.displayName}.`,
      catalogReleaseId: factoryRevision.catalogReleaseId,
      selections: factoryRevision.selections.map((s) => ({ ...s })),
      topology: factoryRevision.topology.map((e) => ({ ...e })),
      tuning: { ...factoryRevision.tuning },
    });
    this.lastPublishedRevision = null;
    this.lastCompilation = null;
    this._engineeringStats.set([]);
    this.session.setBuildIdentity(buildId, buildName);
    this.session.setSelectedRevisionIdsBySlot(
      this.slotsFromSelections(this.draft.selections),
    );
    this.session.setDirty(true);
    this.session.setLastCompile(null);
    this.revalidate();
  }

  /** Apply the recommended factory parts for the current intent. */
  applyRecommendedBuild(): void {
    const intentId = this.session.intentId();
    if (!intentId) {
      this._errorMessage.set('Choose a flying style before applying a recommended build.');
      return;
    }
    this.startFromIntent(intentId);
  }

  /** Replace one logical slot (frame/motor/…) and rebuild quad topology. */
  selectComponentForActiveCategory(revisionId: string): void {
    if (!this.draft) {
      this._errorMessage.set('Start a build before selecting components.');
      return;
    }
    this.ensureCatalog();
    const revision = this.catalogSnapshot!.revisions.get(
      revisionId as ComponentRevision['revisionId'],
    );
    if (!revision) {
      this._errorMessage.set(`Unknown component revision: ${revisionId}`);
      return;
    }

    const slot = this.slotForType(revision.componentType);
    if (!slot) {
      this._errorMessage.set(
        `${revision.componentType} is not selectable in the playable builder yet.`,
      );
      return;
    }

    const nextSlots = {
      ...this.session.selectedRevisionIdsBySlot(),
      [slot]: revisionId,
    };
    this.rebuildDraftFromSlots(nextSlots);
    this.session.patchSelectedRevision(slot, revisionId);
    this.revalidate();
  }

  optionsForActiveCategory(): ComponentRevision[] {
    this.ensureCatalog();
    const category = this.session.activeCategory();
    return [...this.catalogSnapshot!.revisions.values()].filter(
      (r) => r.componentType === category && r.releaseStatus === 'published',
    );
  }

  mappedOptionsForActiveCategory() {
    return this.optionsForActiveCategory().map((r) =>
      this.mapper.mapComponentOption(r),
    );
  }

  revalidate(): ValidationReport | null {
    if (!this.draft) {
      this.session.setPhase('idle');
      this.session.setCompileGate(false, 'Start or open a build first.');
      this._validationIssues.set([]);
      return null;
    }
    this.ensureCatalog();
    this.session.setPhase('validating');

    const revision = this.draftAsEphemeralRevision();
    const assembly = resolveAssembly(
      revision,
      this.catalogSnapshot!.revisions,
    );
    const report = executePreEngineeringValidation(assembly, this.policy);
    const issues = this.mapper.mapValidationReport(report);
    this._validationIssues.set(issues);

    if (!report.canCompile) {
      const first = issues.find((i) => i.issueClass === 'blocking-error');
      this.session.setCompileGate(
        false,
        first?.suggestedAction ?? 'Resolve blocking compatibility issues.',
      );
      this.session.setPhase('invalid');
      return report;
    }

    this.session.setCompileGate(true, null);
    this.session.setPhase('valid');
    return report;
  }

  async saveDraft(): Promise<boolean> {
    if (!this.draft) {
      this._errorMessage.set('Nothing to save.');
      return false;
    }
    this.session.setPhase('saving');
    try {
      const existing = await this.buildRepo.getBuild(this.draft.buildId);
      const build = {
        buildId: this.draft.buildId,
        name: this.draft.name,
        description: this.draft.description,
        status: 'draft' as const,
        draft: this.draft,
        publishedRevisionIds: existing?.publishedRevisionIds ?? [],
        latestPublishedRevisionId: existing?.latestPublishedRevisionId ?? null,
      };
      await this.buildRepo.saveBuild(build);
      await this.buildRepo.saveDraft(this.draft);
      this.session.setDirty(false);
      this.session.setPhase(this.session.canCompile() ? 'valid' : 'invalid');
      return true;
    } catch (error) {
      this._errorMessage.set(
        error instanceof Error ? error.message : String(error),
      );
      this.session.setPhase(this.session.canCompile() ? 'valid' : 'invalid');
      return false;
    }
  }

  /**
   * Compile the current draft through the shared aircraft compiler,
   * register the adapted definition, and select it — without launching flight.
   */
  compile(): BuilderCompatibilityIssueView[] | CompilationResult {
    if (!this.draft) {
      this._errorMessage.set('Start a build before compiling.');
      return this._validationIssues();
    }
    const gate = this.revalidate();
    if (!gate?.canCompile) {
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
      return this._validationIssues();
    }

    const previouslySelected = this.selectedAircraft.selectedAircraftId();
    this.session.setPhase('compiling');
    this.ensureCatalog();

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
      this._validationIssues.set(this.mapper.mapValidationReport(result.validation));
      // Do not replace the currently selected aircraft on failure.
      void previouslySelected;
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
        this.mapper.mapCompileResult(
          { ...result, ok: false },
          null,
          null,
        ),
      );
      return result;
    }

    this.aircraftCatalog.registerCompiledAircraft(definition);
    this.selectedAircraft.select(aircraftId);

    const compileView = this.mapper.mapCompileResult(
      result,
      aircraftId,
      definition.displayName,
    );
    this.session.setLastCompile(compileView);
    this.session.setPhase('compiled');
    this.session.setDirty(false);
    return result;
  }

  /**
   * Compile (if needed) and launch the compiled aircraft into the existing simulator.
   * Navigation occurs only after a successful compile + selection.
   */
  compileAndFly(): boolean {
    const current = this.session.lastCompile();
    const selectedId = this.selectedAircraft.selectedAircraftId();
    const needsCompile =
      !current?.ok ||
      !current.aircraftId ||
      current.aircraftId !== selectedId ||
      this.session.dirty();

    if (needsCompile) {
      const result = this.compile();
      if (!this.session.lastCompile()?.ok) {
        return false;
      }
      // compile() returns CompilationResult | issues; verify phase.
      if (this.session.phase() !== 'compiled') {
        return false;
      }
      void result;
    }

    const launch = this.session.lastCompile();
    if (!launch?.ok || !launch.aircraftId || !launch.aircraftDisplayName) {
      return false;
    }

    this.session.setPhase('launching');
    this.session.setLaunchAircraftName(launch.aircraftDisplayName);
    this.selectedAircraft.select(launch.aircraftId);
    this.shell.showFlight({
      kind: 'test-flight',
      aircraftId: launch.aircraftId,
    });
    return true;
  }

  /** Fingerprint helper for mode-parity tests. */
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

  /** Test seam: inject an alternate memory repository. */
  replaceBuildRepositoryForTests(repo: DroneBuildRepository): void {
    this.buildRepo = repo;
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

  private slotForType(type: ComponentType): SlotKey | null {
    const entry = (
      Object.entries(SLOT_TO_TYPE) as [SlotKey, ComponentType][]
    ).find(([, t]) => t === type);
    return entry?.[0] ?? null;
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
      this._errorMessage.set('Core components are required to rebuild the craft.');
      return;
    }

    const frame = this.catalogSnapshot!.revisions.get(
      frameId as ComponentRevision['revisionId'],
    );
    if (!frame || frame.engineering.type !== 'frame') {
      this._errorMessage.set('Selected frame revision is invalid.');
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
