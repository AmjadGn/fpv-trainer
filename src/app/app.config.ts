import { ApplicationConfig, ErrorHandler, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { provideClientHydration } from '@angular/platform-browser';
import { authInterceptor } from './core/auth/interceptors/auth.interceptor';
import { ApplicationErrorHandler } from './core/error-reporting/application-error-handler';
import { provideMissionLocationRuntime } from './core/mission/providers/mission-location-runtime.providers';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideClientHydration(),
    { provide: ErrorHandler, useClass: ApplicationErrorHandler },
    ...provideMissionLocationRuntime(),
  ]
};
