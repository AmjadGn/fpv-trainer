import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';

import { GameplayAudioService } from '../../core/audio/services/gameplay-audio.service';
import { getAchievementById } from '../../core/progression/config/achievements.config';
import type { UnlockedAchievement } from '../../core/progression/models/achievement.models';
import { AchievementService } from '../../core/progression/services/achievement.service';
import { TrainerSettingsService } from '../../core/settings/services/trainer-settings.service';

interface ToastItem {
  unlock: UnlockedAchievement;
  title: string;
  icon: string;
}

const DISMISS_MS = 4000;

@Component({
  selector: 'app-achievement-toast',
  templateUrl: './achievement-toast.component.html',
  styleUrl: './achievement-toast.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AchievementToastComponent {
  private readonly achievements = inject(AchievementService);
  private readonly settings = inject(TrainerSettingsService);
  private readonly audio = inject(GameplayAudioService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly queue = signal<ToastItem[]>([]);
  protected readonly current = signal<ToastItem | null>(null);

  private dismissTimer: ReturnType<typeof setTimeout> | null = null;
  private showing = false;

  constructor() {
    effect(() => {
      const pending = this.achievements.pendingUnlocks();
      if (pending.length === 0) {
        return;
      }
      const enabled =
        this.settings.settings().progression.achievementNotificationsEnabled;
      const items = this.achievements.consumePendingUnlocks().map((unlock) => {
        const def = getAchievementById(unlock.id);
        return {
          unlock,
          title: def?.title ?? unlock.id,
          icon: iconForCategory(def?.category),
        };
      });
      if (!enabled || items.length === 0) {
        return;
      }
      this.queue.update((q) => [...q, ...items]);
      this.pump();
    });

    this.destroyRef.onDestroy(() => this.clearTimer());
  }

  protected onClose(): void {
    this.clearTimer();
    this.current.set(null);
    this.showing = false;
    this.pump();
  }

  private pump(): void {
    if (this.showing || this.current()) {
      return;
    }
    const [next, ...rest] = this.queue();
    if (!next) {
      return;
    }
    this.queue.set(rest);
    this.showing = true;
    this.current.set(next);
    this.audio.play('achievement');
    if (next.unlock.xpAwarded > 0) {
      this.audio.play('xp');
    }
    this.clearTimer();
    this.dismissTimer = setTimeout(() => this.onClose(), DISMISS_MS);
  }

  private clearTimer(): void {
    if (this.dismissTimer !== null) {
      clearTimeout(this.dismissTimer);
      this.dismissTimer = null;
    }
  }
}

function iconForCategory(category: string | undefined): string {
  switch (category) {
    case 'racing':
      return '◈';
    case 'training':
      return '◎';
    case 'improvement':
      return '△';
    case 'endurance':
      return '◇';
    case 'flight':
    default:
      return '✦';
  }
}
