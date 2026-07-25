import { AuthUser } from './auth-user.model';

export interface AuthSession {
  token: string;
  user: AuthUser;
}

export interface LoginCredentials {
  identifier: string;
  password: string;
  deviceName?: string;
}

export interface RegisterCredentials {
  displayName: string;
  username: string;
  email: string;
  password: string;
  passwordConfirmation: string;
  acceptedTerms: boolean;
  countryCode?: string;
}
