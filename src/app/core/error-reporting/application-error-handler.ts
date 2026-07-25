import { ErrorHandler, Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { ErrorReporterService } from './error-reporter.service';

@Injectable()
export class ApplicationErrorHandler implements ErrorHandler {
  private readonly reporter = inject(ErrorReporterService);

  handleError(error: unknown): void {
    this.reporter.report(error, 'angular');
    if (!environment.production) {
      console.error(error);
    }
  }
}
