import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthSessionService } from '../services/auth-session.service';
import { environment } from '../../../../environments/environment';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const session = inject(AuthSessionService);
  const token = session.token();
  const authorized = token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request;

  return next(authorized).pipe(
    catchError((error: HttpErrorResponse) => {
      const isApiRequest = request.url.startsWith(environment.apiBaseUrl);
      const isLogin = request.url === `${environment.apiBaseUrl}/auth/login`;
      if (error.status === 401 && isApiRequest && !isLogin) session.clear();
      return throwError(() => error);
    }),
  );
};
