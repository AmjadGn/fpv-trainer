import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';

import { AppShellService } from '../../core/shell/app-shell.service';
import { FpvPageHeaderComponent } from '../../shared/ui/fpv-page-header.component';
import { FpvPanelComponent } from '../../shared/ui/fpv-panel.component';
import { FpvButtonDirective } from '../../shared/ui/fpv-button.directive';
import type { BuildIntentId } from './models/drone-builder-view.models';
import { DroneBuilderFacadeService } from './services/drone-builder-facade.service';

/**
 * Checkpoint 1 scaffold — shared builder core orchestration with minimal UI.
 * Simple/Advanced playable loops land in checkpoints 2–3.
 */
@Component({
  selector: 'app-drone-builder',
  standalone: true,
  imports: [
    DecimalPipe,
    FpvPageHeaderComponent,
    FpvPanelComponent,
    FpvButtonDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './drone-builder.component.html',
  styleUrl: './drone-builder.component.scss',
})
export class DroneBuilderComponent implements OnInit {
  private readonly shell = inject(AppShellService);
  protected readonly facade = inject(DroneBuilderFacadeService);

  protected readonly snapshot = this.facade.sessionSnapshot;
  protected readonly intents = this.facade.intents;
  protected readonly blocking = this.facade.blockingIssues;
  protected readonly warnings = this.facade.warningIssues;
  protected readonly simpleStats = this.facade.simpleStats;
  protected readonly options = computed(() =>
    this.facade.mappedOptionsForActiveCategory(),
  );
  protected readonly launchLabel = computed(() => {
    const name =
      this.snapshot().launchAircraftName ?? this.snapshot().buildName;
    return `Compile & Fly: ${name}`;
  });

  ngOnInit(): void {
    void this.facade.bootstrap();
  }

  protected setMode(mode: 'simple' | 'advanced'): void {
    this.facade.setMode(mode);
  }

  protected chooseIntent(id: BuildIntentId): void {
    this.facade.startFromIntent(id);
  }

  protected applyRecommended(): void {
    this.facade.applyRecommendedBuild();
  }

  protected selectOption(revisionId: string): void {
    this.facade.selectComponentForActiveCategory(revisionId);
  }

  protected setCategory(category: string): void {
    this.facade.setActiveCategory(category as never);
  }

  protected async save(): Promise<void> {
    await this.facade.saveDraft();
  }

  protected compile(): void {
    this.facade.compile();
  }

  protected compileAndFly(): void {
    this.facade.compileAndFly();
  }

  protected backToHangar(): void {
    this.shell.showHangar();
  }

  protected backToFly(): void {
    this.shell.showFly();
  }
}
