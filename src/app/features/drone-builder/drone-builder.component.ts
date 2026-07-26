import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';

import { AppShellService } from '../../core/shell/app-shell.service';
import { FpvPageHeaderComponent } from '../../shared/ui/fpv-page-header.component';
import { FpvPanelComponent } from '../../shared/ui/fpv-panel.component';
import { FpvButtonDirective } from '../../shared/ui/fpv-button.directive';
import { FpvDialogComponent } from '../../shared/ui/fpv-dialog.component';
import type {
  BuildIntentId,
  BuilderMode,
} from './models/drone-builder-view.models';
import type { ComponentType } from '@fpv/component-catalog';
import { DroneBuilderFacadeService } from './services/drone-builder-facade.service';
import { ComponentPresentationMediaService } from './services/component-presentation-media.service';

/**
 * Simple Builder product experience over the shared builder facade/session.
 */
@Component({
  selector: 'app-drone-builder',
  standalone: true,
  imports: [
    FpvPageHeaderComponent,
    FpvPanelComponent,
    FpvButtonDirective,
    FpvDialogComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './drone-builder.component.html',
  styleUrl: './drone-builder.component.scss',
})
export class DroneBuilderComponent implements OnInit {
  private readonly shell = inject(AppShellService);
  protected readonly facade = inject(DroneBuilderFacadeService);
  private readonly mediaService = inject(ComponentPresentationMediaService);

  protected readonly snapshot = this.facade.sessionSnapshot;
  protected readonly intents = this.facade.intents;
  protected readonly blocking = this.facade.blockingIssues;
  protected readonly warnings = this.facade.warningIssues;
  protected readonly infoIssues = this.facade.infoIssues;
  protected readonly recommendationIssues = this.facade.recommendationIssues;
  protected readonly informationIssues = this.facade.informationIssues;
  protected readonly simpleStats = this.facade.simpleStats;
  protected readonly advancedStats = this.facade.advancedStats;
  protected readonly categoryProgress = this.facade.categoryProgress;
  protected readonly readinessLines = this.facade.readinessSummaryLines;
  protected readonly canLaunch = this.facade.canLaunchCompiled;
  protected readonly pendingIntent = this.facade.pendingIntent;
  protected readonly options = computed(() =>
    this.facade.mappedOptionsForActiveCategory(),
  );
  protected readonly selectedOption = computed(
    () => this.options().find((o) => o.selected) ?? null,
  );
  protected readonly advancedDetails = computed(() =>
    this.facade.mappedAdvancedDetailsForActiveCategory(),
  );
  protected readonly selectedAdvancedDetail = computed(
    () => this.advancedDetails().find((d) => d.option.selected) ?? null,
  );
  protected readonly tuningInfo = computed(() => this.facade.currentTuningInfo());
  protected readonly provenanceInfo = computed(() =>
    this.facade.currentProvenanceInfo(),
  );
  protected readonly massStats = computed(() =>
    this.advancedStats().filter((s) =>
      ['total-mass', 'dry-mass', 'battery-mass', 'payload-mass'].includes(s.id),
    ),
  );
  protected readonly propulsionStats = computed(() =>
    this.advancedStats().filter((s) =>
      ['twr', 'thrust', 'hover-throttle', 'power-confidence'].includes(s.id),
    ),
  );
  protected readonly electricalStats = computed(() =>
    this.advancedStats().filter((s) =>
      ['battery-config', 'estimated-current', 'esc-headroom'].includes(s.id),
    ),
  );
  protected readonly enduranceStats = computed(() =>
    this.advancedStats().filter((s) => s.id === 'flight-time'),
  );
  protected readonly runtimeStats = computed(() =>
    this.advancedStats().filter((s) =>
      ['runtime-mass', 'runtime-thrust'].includes(s.id),
    ),
  );

  protected readonly intentDialogOpen = signal(false);
  protected readonly resetDialogOpen = signal(false);
  protected readonly nameDraft = signal('');

  protected readonly readinessLabel = computed(() => {
    switch (this.snapshot().readiness) {
      case 'incomplete':
        return 'Incomplete';
      case 'has-blocking-issues':
        return 'Has blocking issues';
      case 'ready-to-compile':
        return 'Ready to compile';
      case 'compiled':
        return 'Compiled';
    }
  });

  protected readonly compatibilityHeadline = computed(() => {
    switch (this.snapshot().compatibilityLevel) {
      case 'cannot-compile':
        return 'Cannot compile';
      case 'needs-attention':
        return 'Needs attention';
      case 'recommendation':
        return 'Recommendation';
      case 'all-compatible':
        return 'All compatible';
    }
  });

  protected readonly compileDisabledReason = computed(() => {
    if (this.snapshot().canCompile) return null;
    return (
      this.snapshot().compileBlockedReason ??
      'Resolve the issues above before compiling.'
    );
  });

  protected readonly flyLabel = computed(() => {
    const name =
      this.snapshot().launchAircraftName ?? this.snapshot().buildName;
    if (this.snapshot().compileStale) {
      return `Recompile & Fly: ${name}`;
    }
    if (this.canLaunch()) {
      return `Fly: ${name}`;
    }
    return `Compile & Fly: ${name}`;
  });

  protected readonly lastSavedClock = computed(() => {
    const iso = this.snapshot().lastSavedAtIso;
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  });

  protected readonly activeIntent = computed(() =>
    this.intents.find((i) => i.id === this.snapshot().intentId) ?? null,
  );

  ngOnInit(): void {
    void this.facade.bootstrap();
    this.nameDraft.set(this.snapshot().buildName);
  }

  protected setMode(mode: BuilderMode): void {
    this.facade.setMode(mode);
  }

  protected chooseIntent(id: BuildIntentId): void {
    const result = this.facade.requestIntentChange(id);
    if (result === 'needs-confirmation') {
      this.intentDialogOpen.set(true);
      return;
    }
    this.nameDraft.set(this.snapshot().buildName);
  }

  protected confirmReplaceIntent(): void {
    this.facade.confirmIntentReplaceSelections();
    this.intentDialogOpen.set(false);
    this.nameDraft.set(this.snapshot().buildName);
  }

  protected confirmIntentLabelOnly(): void {
    this.facade.confirmIntentLabelOnly();
    this.intentDialogOpen.set(false);
  }

  protected cancelIntentDialog(): void {
    this.facade.cancelPendingIntentChange();
    this.intentDialogOpen.set(false);
  }

  protected applyRecommended(): void {
    this.facade.applyRecommendedBuild();
    this.nameDraft.set(this.snapshot().buildName);
  }

  protected selectOption(revisionId: string): void {
    this.facade.selectComponentForActiveCategory(revisionId);
  }

  protected setCategory(category: ComponentType): void {
    this.facade.setActiveCategory(category);
  }

  protected onNameInput(value: string): void {
    this.nameDraft.set(value);
  }

  protected commitName(): void {
    this.facade.setBuildName(this.nameDraft());
    this.nameDraft.set(this.snapshot().buildName);
  }

  protected async save(): Promise<void> {
    this.commitName();
    await this.facade.saveDraft();
  }

  protected compile(): void {
    void this.facade.compile();
  }

  protected compileAndFly(): void {
    void this.facade.compileAndFly();
  }

  protected requestReset(): void {
    if (this.snapshot().dirty || this.facade.hasUserModifiedSelections()) {
      this.resetDialogOpen.set(true);
      return;
    }
    this.facade.resetBuild();
    this.nameDraft.set(this.snapshot().buildName);
  }

  protected confirmReset(): void {
    this.facade.resetBuild();
    this.resetDialogOpen.set(false);
    this.nameDraft.set(this.snapshot().buildName);
  }

  protected cancelReset(): void {
    this.resetDialogOpen.set(false);
  }

  protected backToHangar(): void {
    this.shell.showHangar();
  }

  protected backToFly(): void {
    this.shell.showFly();
  }

  protected statusLabel(
    status: 'selected' | 'missing' | 'needs-attention' | 'recommended',
  ): string {
    switch (status) {
      case 'selected':
        return 'Selected';
      case 'missing':
        return 'Missing';
      case 'needs-attention':
        return 'Needs attention';
      case 'recommended':
        return 'Recommended';
    }
  }

  protected compatibilityStatusLabel(
    status: 'compatible' | 'warning' | 'incompatible' | 'unknown',
  ): string {
    switch (status) {
      case 'compatible':
        return 'Looks compatible';
      case 'warning':
        return 'Needs attention';
      case 'incompatible':
        return 'Not compatible';
      case 'unknown':
        return 'Compatibility unchecked';
    }
  }

  protected onMediaError(event: Event, category: ComponentType): void {
    this.mediaService.onImageError(event, category);
  }

  protected goToIssueCategory(
    category: ComponentType | 'build' | 'unknown',
  ): void {
    this.facade.navigateToAffectedCategory(category);
  }

  protected issueClassLabel(
    issueClass: 'blocking-error' | 'warning' | 'recommendation' | 'information',
  ): string {
    switch (issueClass) {
      case 'blocking-error':
        return 'Blocking';
      case 'warning':
        return 'Warning';
      case 'recommendation':
        return 'Recommendation';
      case 'information':
        return 'Information';
    }
  }
}
