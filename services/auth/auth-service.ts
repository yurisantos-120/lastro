import { AuthError } from './auth-errors.ts';
import type { AuthRepository, AuthSessionResult, AuthUser, GlpiIdentity, GlpiIdentityProvider } from './auth-types.ts';
import { GlpiUserAuthError } from '../glpi/glpi-user-auth.ts';

const SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000;

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createSessionToken(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export function normalizeGlpiUsername(username: string): string {
  return username.trim().replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

export class AuthService {
  private readonly repository: AuthRepository;
  private readonly glpi: GlpiIdentityProvider;
  private readonly bootstrapGlpiUserId: number | undefined;
  private readonly now: () => Date;
  private readonly tokenFactory: () => string;

  constructor(input: {
    repository: AuthRepository;
    glpi: GlpiIdentityProvider;
    bootstrapGlpiUserId?: number;
    now?: () => Date;
    tokenFactory?: () => string;
  }) {
    this.repository = input.repository;
    this.glpi = input.glpi;
    this.bootstrapGlpiUserId = input.bootstrapGlpiUserId;
    this.now = input.now ?? (() => new Date());
    this.tokenFactory = input.tokenFactory ?? createSessionToken;
  }

  async login(username: string, password: string): Promise<AuthSessionResult> {
    let identity: GlpiIdentity;
    try {
      identity = await this.glpi.authenticate(username, password);
    } catch (error) {
      if (error instanceof GlpiUserAuthError && error.failure !== 'invalid-credentials') {
        const stage = error.failure === 'configuration' ? 'glpi_config'
          : error.failure === 'identity' ? 'glpi_identity'
            : error.failure === 'session-cleanup' ? 'glpi_cleanup' : 'glpi';
        throw new AuthError('AUTH_PROVIDER_UNAVAILABLE', undefined, {
          stage,
          reason: error.failure === 'configuration' ? 'GLPI_CONFIG_ERROR'
            : error.failure === 'identity' ? 'GLPI_IDENTITY_ERROR'
              : error.failure === 'session-cleanup' ? 'GLPI_SESSION_CLEANUP_ERROR' : 'GLPI_UNAVAILABLE',
        });
      }
      throw new AuthError('AUTH_LOGIN_FAILED', 'GLPI_CREDENTIALS_INVALID');
    }

    try {
      const normalizedUsername = normalizeGlpiUsername(identity.username);
      let user = await this.repository.findByGlpiUserId(identity.glpiUserId);
      if (!user) {
        if (this.bootstrapGlpiUserId !== identity.glpiUserId)
          throw new AuthError('AUTH_LOGIN_FAILED', 'GLPI_USER_NOT_AUTHORIZED');
        user = await this.repository.bootstrapFirstAdmin(
          { ...identity, username: normalizedUsername },
          this.bootstrapGlpiUserId,
        );
        // A simultaneous first login may have completed the one-time bootstrap; re-read the same GLPI ID.
        if (!user) user = await this.repository.findByGlpiUserId(identity.glpiUserId);
        if (!user) throw new AuthError('AUTH_LOGIN_FAILED', 'BOOTSTRAP_CLOSED');
      }
      // Unknown, inactive and bootstrap-closed identities share the public response.
      if (!user || !user.active) throw new AuthError('AUTH_LOGIN_FAILED', 'LOCAL_USER_INACTIVE');

      const token = this.tokenFactory();
      const tokenHash = await hashSessionToken(token);
      const now = this.now();
      const createdAt = now.toISOString();
      const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS).toISOString();
      await this.repository.createSession({ userId: user.id, tokenHash, createdAt, expiresAt });
      return { token, expiresAt, user };
    } catch (error) {
      if (error instanceof AuthError) throw error;
      throw new AuthError('AUTH_STORAGE_UNAVAILABLE');
    }
  }

  async currentUser(token: string | null): Promise<AuthUser | null> {
    if (!token || !/^[A-Za-z0-9_-]{40,50}$/.test(token)) {
      try {
        await this.repository.checkSessionStorage();
        return null;
      } catch {
        throw new AuthError('AUTH_STORAGE_UNAVAILABLE');
      }
    }
    try {
      return await this.repository.getSessionUser({
        tokenHash: await hashSessionToken(token),
        now: this.now().toISOString(),
      });
    } catch {
      throw new AuthError('AUTH_STORAGE_UNAVAILABLE');
    }
  }

  async logout(token: string | null): Promise<void> {
    if (!token || !/^[A-Za-z0-9_-]{40,50}$/.test(token)) return;
    try {
      await this.repository.revokeSession({
        tokenHash: await hashSessionToken(token),
        revokedAt: this.now().toISOString(),
      });
    } catch {
      throw new AuthError('AUTH_STORAGE_UNAVAILABLE');
    }
  }
}
