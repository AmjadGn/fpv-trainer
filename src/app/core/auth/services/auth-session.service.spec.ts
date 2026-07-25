import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AuthApiService } from './auth-api.service';
import { AuthSessionService } from './auth-session.service';
import { AuthStorageService } from './auth-storage.service';

describe('AuthSessionService', () => {
  const storage = { getToken: () => 'token', setToken: vi.fn(), clear: vi.fn() };
  const api = { me: () => of({ id: '1', username: 'pilot', displayName: 'Pilot', email: 'p@example.com', countryCode: null, competitiveStatus: 'active', isAdmin: false }) };
  beforeEach(() => TestBed.configureTestingModule({ providers: [AuthSessionService, { provide: AuthApiService, useValue: api }, { provide: AuthStorageService, useValue: storage }] }));
  it('restores the user from the wrapped me contract', () => {
    const service = TestBed.inject(AuthSessionService);
    service.restoreSession().subscribe();
    expect(service.user()?.username).toBe('pilot');
  });
});
