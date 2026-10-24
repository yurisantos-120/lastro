import 'server-only';
import { env } from 'cloudflare:workers';
import { getAuthRepository } from '@/db/auth-runtime';
import { AuthStorageError } from '@/db/auth-storage';
import { GlpiUserAuthClient, readGlpiUserAuthConfig } from '@/services/glpi/glpi-user-auth';
import { AuthError } from './auth-errors.ts';
import { AuthService } from './auth-service.ts';

function bootstrapGlpiUserId(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value.trim())) return undefined;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

export function getAuthService(): AuthService {
  let repository: ReturnType<typeof getAuthRepository>;
  try {
    repository = getAuthRepository();
  } catch (error) {
    if (error instanceof AuthStorageError) throw new AuthError('AUTH_STORAGE_UNAVAILABLE');
    throw new AuthError('AUTH_STORAGE_UNAVAILABLE');
  }
  return new AuthService({
    repository,
    // Session reads and local guards do not depend on GLPI transport.
    // Validate/build the external provider only for an actual login attempt.
    glpi: {
      authenticate: (username, password) =>
        new GlpiUserAuthClient(readGlpiUserAuthConfig(env)).authenticate(username, password),
    },
    bootstrapGlpiUserId: bootstrapGlpiUserId(env.OPUSLOG_BOOTSTRAP_GLPI_USER_ID),
  });
}
