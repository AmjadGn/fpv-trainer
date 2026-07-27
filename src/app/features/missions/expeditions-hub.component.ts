import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  evaluateMissionAircraftCompatibility,
  type MissionAircraftCompatibilityResult,
} from '@fpv/mission-domain';
import { SCORING_POLICY_VERSION } from '@fpv/photography-domain';

import { AircraftCatalogService } from '../../core/aircraft/services/aircraft-catalog.service';
import { SelectedAircraftService } from '../../core/aircraft/services/selected-aircraft.service';
import { MissionAircraftCapabilitiesAdapter } from '../../core/mission/adapters/mission-aircraft-capabilities.adapter';
import { createMissionFlightLaunchIntent } from '../../core/mission/models/mission-launch-intent';
import { ExpeditionMissionCatalog } from '../../core/mission/services/expedition-mission-catalog.service';
import type { ExpeditionMissionSummary } from '../../core/mission/services/expedition-mission-catalog.service';
import { MissionHistoryFacade } from '../../core/mission-persistence/mission-history.facade';
import { AppShellService } from '../../core/shell/app-shell.service';
import { FpvPageHeaderComponent } from '../../shared/ui/fpv-page-header.component';
import { FpvPanelComponent } from '../../shared/ui/fpv-panel.component';
import { FpvButtonDirective } from '../../shared/ui/fpv-button.directive';

type HubPhase = 'list' | 'briefing' | 'loading' | 'error';

/**
 * Fly → Expeditions entry with Coastal Ruins Survey briefing and launch.
 * Shows durable local progress / Personal Best from mission persistence.
 */
@Component({
  selector: 'app-expeditions-hub',
  standalone: true,
  imports: [FpvPageHeaderComponent, FpvPanelComponent, FpvButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fpv-page-bg">
      <main class="fpv-page">
        <fpv-page-header
          eyebrow="Fly"
          title="Expeditions Preview"
          support="Photography missions in curated locations. Coastal Ruins uses repository-owned proxy art — not final production art."
        />

        @if (phase() === 'list') {
          <fpv-panel title="Expeditions Preview" subtitle="Installed mission packages for this build.">
            @for (mission of missions(); track mission.missionId) {
              <article class="mission-row" data-testid="expedition-mission-row">
                <div>
                  <h3>{{ mission.title }}</h3>
                  <p class="meta">
                    {{ mission.locationTitle }} · {{ mission.subregionId }}
                  </p>
                  <p class="copy">{{ mission.briefingSummary }}</p>
                  @if (history().missionScopeKey) {
                    <div class="progress" data-testid="mission-progress">
                      <p class="meta">
                        {{ history().completed ? 'Completed' : 'Not completed' }}
                        · {{ history().completionCount }} completions
                      </p>
                      <p class="meta">
                        Personal Best:
                        {{ history().summary?.bestScore ?? '—' }}
                        · Latest: {{ history().summary?.latestScore ?? '—' }}
                      </p>
                      @if (history().lastPlayedAtIso; as played) {
                        <p class="meta">Last played: {{ formatDate(played) }}</p>
                      }
                      <p class="meta">Images: {{ history().imageStatus }}</p>
                      @if (history().memoryOnly) {
                        <p class="notice" data-testid="memory-only-warning">
                          Progress is memory-only on this device and will not survive reload.
                        </p>
                      }
                      @if (history().recentResults.length > 0) {
                        <ul class="recent" data-testid="recent-results">
                          @for (result of history().recentResults; track result.resultId) {
                            <li>
                              {{ result.status }} · {{ result.totalScore }} /
                              {{ result.maximumScore }}
                            </li>
                          }
                        </ul>
                      }
                    </div>
                  }
                </div>
                <button
                  type="button"
                  fpvButton
                  variant="primary"
                  size="sm"
                  (click)="openBriefing(mission)"
                >
                  Briefing
                </button>
              </article>
            }
            <div class="actions">
              <button type="button" fpvButton variant="secondary" size="sm" (click)="backToFly()">
                Back to Fly
              </button>
              <button
                type="button"
                fpvButton
                variant="secondary"
                size="sm"
                data-testid="clear-mission-data"
                (click)="requestClearMissionData()"
              >
                Clear mission data
              </button>
            </div>
            @if (clearConfirm()) {
              <div class="clear-confirm" data-testid="clear-confirm">
                <p class="copy">
                  Clear durable mission results, Personal Bests, and mission photos on this device?
                  Replay, aircraft builds, and settings are not affected.
                </p>
                <div class="actions">
                  <button type="button" fpvButton variant="secondary" size="sm" (click)="cancelClear()">
                    Cancel
                  </button>
                  <button
                    type="button"
                    fpvButton
                    variant="primary"
                    size="sm"
                    data-testid="clear-scope"
                    (click)="confirmClearScope()"
                  >
                    Clear this mission
                  </button>
                  <button
                    type="button"
                    fpvButton
                    variant="primary"
                    size="sm"
                    data-testid="clear-all"
                    (click)="confirmClearAll()"
                  >
                    Clear all mission data
                  </button>
                </div>
              </div>
            }
          </fpv-panel>
        }

        @if (phase() === 'briefing' && selected(); as mission) {
          <fpv-panel [title]="mission.title" subtitle="Mission briefing">
            <p class="copy">{{ mission.briefingSummary }}</p>
            <ul class="objectives">
              @for (obj of mission.objectivesSummary; track obj) {
                <li>{{ obj }}</li>
              }
            </ul>
            <p class="meta">
              Recommended aircraft:
              {{ mission.recommendedCategories.join(', ') || 'any camera-equipped craft' }}
            </p>
            <p class="meta">Selected aircraft: {{ selectedAircraftLabel() }}</p>
            <p class="compat" [attr.data-status]="compat()?.status ?? 'unknown'">
              Compatibility: {{ compatibilityLabel() }}
            </p>
            @if (mission.captureScoringEnabled) {
              <p class="notice" data-testid="capture-enabled">
                Photo capture is scored in flight — press <kbd>V</kbd> or the HUD shutter with the
                FPV camera active. Results are saved locally on this device.
              </p>
            } @else {
              <p class="notice" data-testid="capture-not-enabled">
                Photography capture and scoring are not enabled in this build. Launch explores the
                Coastal Ruins location through the shared flight runtime.
              </p>
            }
            @if (errorMessage()) {
              <p class="error">{{ errorMessage() }}</p>
            }
            <div class="actions">
              <button type="button" fpvButton variant="secondary" size="sm" (click)="backToList()">
                Return to Expeditions
              </button>
              <button
                type="button"
                fpvButton
                variant="primary"
                size="sm"
                [disabled]="!canLaunch()"
                (click)="launch()"
              >
                Launch
              </button>
            </div>
          </fpv-panel>
        }

        @if (phase() === 'loading') {
          <fpv-panel title="Loading location" subtitle="Preparing Coastal Ruins…">
            <p class="copy">{{ loadingMessage() }}</p>
            <div class="actions">
              <button type="button" fpvButton variant="secondary" size="sm" (click)="cancelLoad()">
                Cancel
              </button>
            </div>
          </fpv-panel>
        }

        @if (phase() === 'error') {
          <fpv-panel title="Location load failed" subtitle="Expedition could not start.">
            <p class="error">{{ errorMessage() }}</p>
            <div class="actions">
              <button type="button" fpvButton variant="secondary" size="sm" (click)="backToList()">
                Return to Expeditions
              </button>
              <button type="button" fpvButton variant="primary" size="sm" (click)="retry()">
                Retry
              </button>
            </div>
          </fpv-panel>
        }
      </main>
    </div>
  `,
  styles: [
    `
      .mission-row {
        display: flex;
        gap: 1rem;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 1rem;
      }
      .mission-row h3 {
        margin: 0 0 0.25rem;
        font-size: 1.05rem;
      }
      .copy {
        margin: 0 0 0.75rem;
        color: var(--fpv-text-muted, #9aa49c);
      }
      .meta {
        margin: 0 0 0.5rem;
        color: var(--fpv-text-muted, #9aa49c);
        font-size: 0.9rem;
      }
      .objectives {
        margin: 0 0 1rem;
        padding-left: 1.1rem;
      }
      .recent {
        margin: 0.35rem 0 0.75rem;
        padding-left: 1.1rem;
        color: var(--fpv-text-muted, #9aa49c);
        font-size: 0.85rem;
      }
      .notice {
        margin: 0 0 1rem;
        padding: 0.75rem;
        border-left: 3px solid var(--fpv-accent, #c4a35a);
        color: var(--fpv-text-muted, #9aa49c);
      }
      .clear-confirm {
        margin-top: 1rem;
        padding-top: 0.75rem;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
      }
      .compat[data-status='incompatible'] {
        color: #c45c5c;
      }
      .compat[data-status='compatibleWithWarnings'] {
        color: #c4a35a;
      }
      .error {
        color: #c45c5c;
        margin: 0 0 1rem;
      }
      .actions {
        display: flex;
        gap: 0.75rem;
        flex-wrap: wrap;
      }
    `,
  ],
})
export class ExpeditionsHubComponent implements OnInit, OnDestroy {
  private readonly shell = inject(AppShellService);
  private readonly catalog = inject(ExpeditionMissionCatalog);
  private readonly selectedAircraft = inject(SelectedAircraftService);
  private readonly aircraftCatalog = inject(AircraftCatalogService);
  private readonly capabilitiesAdapter = inject(MissionAircraftCapabilitiesAdapter);
  private readonly historyFacade = inject(MissionHistoryFacade);

  protected readonly phase = signal<HubPhase>('list');
  protected readonly selected = signal<ExpeditionMissionSummary | null>(null);
  protected readonly compat = signal<MissionAircraftCompatibilityResult | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly loadingMessage = signal('Resolving location…');
  protected readonly clearConfirm = signal(false);

  protected readonly missions = computed(() => this.catalog.list());
  protected readonly history = this.historyFacade.viewModel;

  protected readonly selectedAircraftLabel = computed(() => {
    const id = this.selectedAircraft.selectedAircraftId();
    const def = this.aircraftCatalog.getById(id);
    return def ? `${def.displayName} (${def.category})` : id;
  });

  protected readonly canLaunch = computed(() => {
    const c = this.compat();
    return c !== null && c.status !== 'incompatible';
  });

  ngOnInit(): void {
    void this.refreshHistory();
  }

  ngOnDestroy(): void {
    this.historyFacade.release();
  }

  protected formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  }

  protected compatibilityLabel(): string {
    const c = this.compat();
    if (!c) {
      return 'Checking…';
    }
    if (c.status === 'compatible') {
      return 'Compatible';
    }
    if (c.status === 'compatibleWithWarnings') {
      return `Compatible with warnings (${c.issues.map((i) => i.code).join(', ')})`;
    }
    return `Incompatible — change aircraft (${c.issues.map((i) => i.code).join(', ')})`;
  }

  protected backToFly(): void {
    this.shell.showFly();
  }

  protected backToList(): void {
    this.phase.set('list');
    this.selected.set(null);
    this.errorMessage.set(null);
    void this.refreshHistory();
  }

  protected openBriefing(mission: ExpeditionMissionSummary): void {
    this.selected.set(mission);
    this.errorMessage.set(null);
    this.phase.set('briefing');
    this.refreshCompatibility(mission.missionId);
  }

  protected requestClearMissionData(): void {
    this.clearConfirm.set(true);
  }

  protected cancelClear(): void {
    this.clearConfirm.set(false);
  }

  protected async confirmClearScope(): Promise<void> {
    const scopeKey = this.history().missionScopeKey;
    if (scopeKey) {
      await this.historyFacade.clearMissionScope(scopeKey);
    }
    this.clearConfirm.set(false);
    await this.refreshHistory();
  }

  protected async confirmClearAll(): Promise<void> {
    await this.historyFacade.clearAllMissionData();
    this.clearConfirm.set(false);
    await this.refreshHistory();
  }

  protected launch(): void {
    const mission = this.selected();
    if (!mission || !this.canLaunch()) {
      this.errorMessage.set(
        'Selected aircraft is incompatible. Change aircraft in Hangar, then return.',
      );
      return;
    }

    const pack = this.catalog.get(mission.missionId);
    if (!pack) {
      this.errorMessage.set('MISSION_DEFINITION_NOT_FOUND');
      this.phase.set('error');
      return;
    }

    const aircraftId = this.selectedAircraft.selectedAircraftId();
    const definition = this.aircraftCatalog.getById(aircraftId);
    if (!definition) {
      this.errorMessage.set('Selected aircraft is not available');
      return;
    }
    const adapted = this.capabilitiesAdapter.adapt(definition);
    if (!adapted.ok) {
      this.errorMessage.set(adapted.reason);
      return;
    }

    const intent = createMissionFlightLaunchIntent({
      missionId: mission.missionId,
      locationId: mission.locationId,
      aircraftId,
      aircraftSourceType: adapted.capabilities.sourceType,
      spawnPointId: 'spawn-coastal-ruins-main',
      returnDestination: 'expeditions',
    });
    if (!intent.ok) {
      this.errorMessage.set(intent.reason);
      this.phase.set('error');
      return;
    }

    this.phase.set('loading');
    this.loadingMessage.set('Launching shared flight runtime…');
    this.shell.showFlight(intent.intent);
  }

  protected cancelLoad(): void {
    this.phase.set('briefing');
  }

  protected retry(): void {
    const mission = this.selected();
    if (mission) {
      this.openBriefing(mission);
      this.launch();
    } else {
      this.backToList();
    }
  }

  private async refreshHistory(): Promise<void> {
    const first = this.catalog.list()[0];
    if (!first) {
      return;
    }
    const pack = this.catalog.get(first.missionId);
    if (!pack) {
      return;
    }
    await this.historyFacade.refreshForMission({
      missionId: String(pack.mission.missionId),
      missionVersion: String(pack.mission.versions.version),
      scoringPolicyVersion: pack.scoringPolicy.policyVersion || SCORING_POLICY_VERSION,
      recentLimit: 5,
    });
  }

  private refreshCompatibility(missionId: string): void {
    const pack = this.catalog.get(missionId);
    const aircraftId = this.selectedAircraft.selectedAircraftId();
    const definition = this.aircraftCatalog.getById(aircraftId);
    if (!pack || !definition) {
      this.compat.set({
        status: 'incompatible',
        issues: [
          {
            code: 'INSUFFICIENT_RUNTIME_DATA',
            severity: 'error',
            path: 'aircraft',
          },
        ],
      });
      return;
    }
    const adapted = this.capabilitiesAdapter.adapt(definition);
    if (!adapted.ok) {
      this.compat.set({
        status: 'incompatible',
        issues: [
          {
            code: 'INSUFFICIENT_RUNTIME_DATA',
            severity: 'error',
            path: 'aircraft',
          },
        ],
      });
      return;
    }
    this.compat.set(
      evaluateMissionAircraftCompatibility(
        adapted.capabilities,
        pack.mission.aircraftCompatibilityPolicy,
      ),
    );
  }
}
