import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { authInterceptor } from './auth.interceptor';
import { AuthSessionService } from '../services/auth-session.service';

describe('authInterceptor', () => {
  const session = { token: () => 'token', clear: vi.fn() };
  let http: HttpClient; let requests: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(), { provide: AuthSessionService, useValue: session }] });
    http = TestBed.inject(HttpClient); requests = TestBed.inject(HttpTestingController); session.clear.mockReset();
  });
  it('keeps a failed login session intact', () => {
    http.post('http://localhost:8000/api/v1/auth/login', {}).subscribe({ error: () => undefined });
    requests.expectOne('http://localhost:8000/api/v1/auth/login').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(session.clear).not.toHaveBeenCalled();
  });
  it('clears a session for protected API 401s', () => {
    http.get('http://localhost:8000/api/v1/profile').subscribe({ error: () => undefined });
    requests.expectOne('http://localhost:8000/api/v1/profile').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(session.clear).toHaveBeenCalled();
  });
});
