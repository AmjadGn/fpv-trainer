import { Injectable, inject, signal } from '@angular/core';
import { ErrorReporterService } from '../../error-reporting/error-reporter.service';
import {
  validatePhysicsState,
  type PhysicsGuardResult,
  type PhysicsStateSample,
} from './physics-state.guard';

@Injectable({ providedIn: 'root' })
export class PhysicsIntegrityService {
  private readonly reporter = inject(ErrorReporterService);
  readonly lastFailure = signal<PhysicsGuardResult | null>(null);
  readonly locked = signal(false);

  check(sample: PhysicsStateSample): PhysicsGuardResult {
    if (this.locked()) {
      return this.lastFailure() ?? { valid: false, reason: 'locked' };
    }
    const result = validatePhysicsState(sample);
    if (!result.valid) {
      this.lastFailure.set(result);
      this.locked.set(true);
      this.reporter.report(
        new Error(`Invalid physics state: ${result.reason}`),
        'physics',
      );
    }
    return result;
  }

  clearLock(): void {
    this.locked.set(false);
    this.lastFailure.set(null);
  }
}
