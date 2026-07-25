import { Injectable, inject, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AnalyticsConsentService } from '../analytics/analytics-consent.service';
import { ProductAnalyticsService } from '../analytics/product-analytics.service';
import { createDiagnosticId } from '../product/diagnostic-id';
import { getAppVersionInfo } from '../product/app-version';
import type { ErrorReportContext, ErrorReportPayload } from './error-context.model';
import type { ErrorReportingProvider } from './error-reporting-provider.interface';

class ConsoleErrorProvider implements ErrorReportingProvider {
  readonly id = 'console';
  report(payload: ErrorReportPayload): void {
    if (!environment.production) {
      console.warn('[FPV error]', payload.context.diagnosticId, payload.message, payload);
    }
  }
}

@Injectable({ providedIn: 'root' })
export class ErrorReporterService {
  private readonly consent = inject(AnalyticsConsentService);
  private readonly analytics = inject(ProductAnalyticsService);
  private readonly providers: ErrorReportingProvider[] = [new ConsoleErrorProvider()];

  readonly lastDiagnosticId = signal<string | null>(null);

  private route: string | null = null;
  private mode: string | null = null;
  private aircraftId: string | null = null;
  private environmentId: string | null = null;
  private graphicsPreset: string | null = null;

  setRoute(route: string | null): void {
    this.route = route;
  }

  setMode(mode: string | null): void {
    this.mode = mode;
  }

  setAircraftId(id: string | null): void {
    this.aircraftId = id;
  }

  setEnvironmentId(id: string | null): void {
    this.environmentId = id;
  }

  setGraphicsPreset(preset: string | null): void {
    this.graphicsPreset = preset;
  }

  report(
    error: unknown,
    source: ErrorReportPayload['source'] = 'manual',
  ): string {
    const diagnosticId = createDiagnosticId(
      `${source}-${String((error as Error)?.message ?? error)}-${Date.now()}`,
    );
    this.lastDiagnosticId.set(diagnosticId);

    if (!environment.errorReportingEnabled || !this.consent.canReportErrors()) {
      return diagnosticId;
    }

    const normalized = normalizeError(error);
    const version = getAppVersionInfo();
    const context: ErrorReportContext = {
      route: this.route,
      appVersion: version.appVersion,
      buildId: version.buildId,
      releaseChannel: version.releaseChannel,
      aircraftId: this.aircraftId,
      environmentId: this.environmentId,
      mode: this.mode,
      graphicsPreset: this.graphicsPreset,
      browserSummary: summarizeBrowser(),
      lastProductEvent: this.analytics.lastEvent(),
      diagnosticId,
    };

    const payload: ErrorReportPayload = {
      message: redactSecrets(normalized.message),
      name: normalized.name,
      stack: environment.production ? undefined : normalized.stack,
      source,
      context,
      timestamp: new Date().toISOString(),
    };

    for (const provider of this.providers) {
      try {
        provider.report(payload);
      } catch {
        /* ignore */
      }
    }
    return diagnosticId;
  }
}

function normalizeError(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { name: 'Error', message: String(error) };
}

function redactSecrets(message: string): string {
  return message
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [redacted]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[jwt-redacted]');
}

function summarizeBrowser(): string {
  if (typeof navigator === 'undefined') return 'ssr';
  return `${navigator.userAgent.slice(0, 120)} | mem=${(navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? '?'} | cores=${navigator.hardwareConcurrency ?? '?'}`;
}
