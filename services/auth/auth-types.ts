export type LocalAuthRole = 'viewer' | 'operator' | 'admin';

export interface GlpiIdentity {
  glpiUserId: number;
  username: string;
  name: string;
}

export interface AuthUser {
  id: number;
  glpiUserId: number;
  username: string;
  name: string;
  role: LocalAuthRole;
  active: boolean;
}

export interface AuthSessionResult {
  token: string;
  expiresAt: string;
  user: AuthUser;
}

export interface AuthRepository {
  checkSessionStorage(): Promise<void>;
  findByGlpiUserId(glpiUserId: number): Promise<AuthUser | null>;
  bootstrapFirstAdmin(identity: GlpiIdentity, allowedGlpiUserId: number): Promise<AuthUser | null>;
  createSession(input: {
    userId: number;
    tokenHash: string;
    createdAt: string;
    expiresAt: string;
  }): Promise<void>;
  getSessionUser(input: { tokenHash: string; now: string }): Promise<AuthUser | null>;
  revokeSession(input: { tokenHash: string; revokedAt: string }): Promise<void>;
}

export interface GlpiIdentityProvider {
  authenticate(username: string, password: string): Promise<GlpiIdentity>;
}
