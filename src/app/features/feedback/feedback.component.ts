import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FeedbackService } from '../../core/feedback/feedback.service';
import type { FeedbackCategory, FeedbackSeverity } from '../../core/feedback/feedback.models';
import { ProductAnalyticsService } from '../../core/analytics/product-analytics.service';
import { AnalyticsEvents } from '../../core/analytics/analytics-events';
import { SelectedAircraftService } from '../../core/aircraft/services/selected-aircraft.service';
import { TrainerSettingsService } from '../../core/settings/services/trainer-settings.service';
import { AppShellService } from '../../core/shell/app-shell.service';
import { FpvPageHeaderComponent } from '../../shared/ui/fpv-page-header.component';
import { FpvButtonDirective } from '../../shared/ui/fpv-button.directive';

@Component({
  selector: 'app-feedback',
  standalone: true,
  imports: [FpvPageHeaderComponent, FpvButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './feedback.component.html',
  styleUrl: './feedback.component.scss',
})
export class FeedbackComponent {
  private readonly feedback = inject(FeedbackService);
  private readonly analytics = inject(ProductAnalyticsService);
  private readonly aircraft = inject(SelectedAircraftService);
  private readonly settings = inject(TrainerSettingsService);
  private readonly shell = inject(AppShellService);

  protected readonly draft = this.feedback.draft;
  protected readonly status = this.feedback.lastStatus;
  protected readonly diagnosticId = this.feedback.lastDiagnosticId;

  constructor() {
    this.analytics.track(AnalyticsEvents.feedbackOpened, {});
    this.feedback.updateDraft({
      aircraftId: this.aircraft.selectedAircraftId(),
      environmentId: this.settings.environmentSettings().selectedEnvironmentId,
      route: 'feedback',
    });
  }

  protected onCategory(event: Event): void {
    this.feedback.updateDraft({
      category: (event.target as HTMLSelectElement).value as FeedbackCategory,
    });
  }

  protected onSeverity(event: Event): void {
    this.feedback.updateDraft({
      severity: (event.target as HTMLSelectElement).value as FeedbackSeverity,
    });
  }

  protected onTitle(event: Event): void {
    this.feedback.updateDraft({ title: (event.target as HTMLInputElement).value });
  }

  protected onDescription(event: Event): void {
    this.feedback.updateDraft({ description: (event.target as HTMLTextAreaElement).value });
  }

  protected onEmail(event: Event): void {
    this.feedback.updateDraft({ email: (event.target as HTMLInputElement).value });
  }

  protected onDiagnostics(event: Event): void {
    this.feedback.updateDraft({
      includeDiagnostics: (event.target as HTMLInputElement).checked,
    });
  }

  protected async submit(): Promise<void> {
    const result = await this.feedback.submit();
    if (result.status === 'submitted') {
      this.analytics.track(AnalyticsEvents.feedbackSubmitted, {
        category: result.category,
        includeDiagnostics: result.includeDiagnostics,
      });
    }
  }

  protected back(): void {
    this.shell.showHome();
  }
}
