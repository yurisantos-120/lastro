import { env } from 'cloudflare:workers';
import { AuthStorageError, D1AuthRepository } from './auth-storage.ts';

export function getAuthRepository(): D1AuthRepository {
  if (!env.DB) throw new AuthStorageError();
  return new D1AuthRepository(env.DB);
}
