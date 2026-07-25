import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';

import { TRAINING_MODULES } from '../../core/academy/config/training-modules.config';
import type {
  TrainingMedal,
  TrainingModuleDefinition,
} from '../../core/academy/models/training-module.models';
import { TrainingAcademyService } from '../../core/academy/services/training-academy.service';
import { TrainingProgressService } from '../../core/academy/services/training-progress.service';
import { ProgressionService } from '../../core/progression/services/progression.service';
import { AppShellService } from '../../core/shell/app-shell.service';

interface AcademyModuleCard {
  module: TrainingModuleDefinition;
  unlocked: boolean;
  bestScore: number;
  medal: TrainingMedal;
  attempts: number;
}

@Component({
  selector: 'app-academy',
  templateUrl: './academy.component.html',
  styleUrl: './academy.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AcademyComponent {
  private readonly shell = inject(AppShellService);
  private readonly academy = inject(TrainingAcademyService);
  private readonly trainingProgress = inject(TrainingProgressService);
  private readonly progression = inject(ProgressionService);

  protected readonly levelInfo = this.progression.levelInfo;
  protected readonly progress = this.progression.progress;

  protected readonly modules = computed<AcademyModuleCard[]>(() => {
    void this.trainingProgress.store();
    return TRAINING_MODULES.filter((m) => m.enabled).map((module) => {
      const record = this.trainingProgress.getModuleProgress(module.id);
      return {
        module,
        unlocked: this.trainingProgress.isUnlocked(module),
        bestScore: record?.bestScore ?? 0,
        medal: record?.highestMedal ?? 'none',
        attempts: record?.attempts ?? 0,
      };
    });
  });

  protected readonly completedCount = computed(() => {
    const store = this.trainingProgress.store();
    return TRAINING_MODULES.filter(
      (m) => m.enabled && store.modules[m.id]?.completed,
    ).length;
  });

  protected readonly medalSummary = computed(() => {
    const p = this.progress();
    return `${p.goldMedals} gold · ${p.silverMedals} silver · ${p.bronzeMedals} bronze`;
  });

  protected medalLabel(medal: TrainingMedal): string {
    switch (medal) {
      case 'gold':
        return 'Gold';
      case 'silver':
        return 'Silver';
      case 'bronze':
        return 'Bronze';
      default:
        return 'None';
    }
  }

  protected durationLabel(seconds: number): string {
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const mins = Math.round(seconds / 60);
    return `~${mins} min`;
  }

  protected onStart(moduleId: string): void {
    const opened = this.academy.openBriefing(moduleId);
    if (!opened) {
      return;
    }
    this.shell.showFlight({ kind: 'training', moduleId });
  }

  protected onBack(): void {
    this.shell.showHome();
  }
}
