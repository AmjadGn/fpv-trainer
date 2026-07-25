import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { formatAppVersionLabel, getAppVersionInfo } from '../../core/product/app-version';
import { FrameTimeMonitorService } from '../../core/performance/frame-time-monitor.service';
import { BrowserCapabilityService } from '../../core/browser/browser-capability.service';
import { ErrorReporterService } from '../../core/error-reporting/error-reporter.service';
import { AppShellService } from '../../core/shell/app-shell.service';
import { FpvPageHeaderComponent } from '../../shared/ui/fpv-page-header.component';
import { FpvButtonDirective } from '../../shared/ui/fpv-button.directive';

@Component({
  selector: 'app-diagnostics-panel',
  standalone: true,
  imports: [FpvPageHeaderComponent, FpvButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fpv-page-bg">
      <main class="fpv-page">
        <fpv-page-header
          eyebrow="Advanced"
          title="Diagnostics"
          support="Performance and capability summary for alpha troubleshooting."
        />

        <dl class="diag">
          <div><dt>Version</dt><dd>{{ versionLabel }}</dd></div>
          <div><dt>Channel</dt><dd>{{ version.releaseChannel }}</dd></div>
          <div><dt>Physics</dt><dd>{{ version.physicsVersion }}</dd></div>
          <div><dt>Replay format</dt><dd>{{ version.replayFormatVersion }}</dd></div>
          <div><dt>Browser</dt><dd>{{ caps().summary }}</dd></div>
          <div><dt>FPS</dt><dd>{{ snap().fps }}</dd></div>
          <div><dt>Frame avg / p95 / p99 (ms)</dt><dd>{{ snap().avgMs }} / {{ snap().p95Ms }} / {{ snap().p99Ms }}</dd></div>
          <div><dt>Quality</dt><dd>{{ snap().qualityPreset }}</dd></div>
          <div><dt>Last issue ID</dt><dd>{{ lastId() ?? '—' }}</dd></div>
        </dl>

        @if (!diagnosticsVisible) {
          <p>Detailed runtime HUD is hidden in this release channel.</p>
        }

        <button type="button" fpvButton variant="ghost" (click)="back()">Back</button>
      </main>
    </div>
  `,
  styles: [
    `
      .diag {
        display: grid;
        gap: 0.75rem;
        margin-bottom: 1.5rem;
      }
      .diag div {
        display: grid;
        grid-template-columns: 12rem 1fr;
        gap: 0.5rem;
      }
      dt {
        opacity: 0.7;
      }
      dd {
        margin: 0;
        font-family: ui-monospace, monospace;
        font-size: 0.9rem;
      }
    `,
  ],
})
export class DiagnosticsPanelComponent {
  private readonly frames = inject(FrameTimeMonitorService);
  private readonly browser = inject(BrowserCapabilityService);
  private readonly errors = inject(ErrorReporterService);
  private readonly shell = inject(AppShellService);

  protected readonly versionLabel = formatAppVersionLabel();
  protected readonly version = getAppVersionInfo();
  protected readonly snap = this.frames.snapshot;
  protected readonly caps = this.browser.capabilities;
  protected readonly lastId = this.errors.lastDiagnosticId;
  protected readonly diagnosticsVisible = environment.diagnosticsVisible;

  protected back(): void {
    this.shell.showSettings();
  }
}
