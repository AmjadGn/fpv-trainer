export interface AuthUser {
  id: string;
  username: string;
  email: string;
  displayName: string;
  countryCode: string | null;
  competitiveStatus: string;
  isAdmin: boolean;
  emailVerifiedAt?: string | null;
}
