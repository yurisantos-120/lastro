import type { GlpiClient } from './glpi-client.ts';
import { glpiFailure } from './glpi-errors.ts';
export async function withGlpiSession<T>(
  client: GlpiClient,
  operation: (session: string) => Promise<T>,
): Promise<T> {
  const session = await client.initSession();
  try {
    return await operation(session);
  } finally {
    try {
      await client.killSession(session);
    } catch (error) {
      // Never hide a created ticket because cleanup failed; log no upstream data.
      console.warn('GLPI_SESSION_CLEANUP_FAILED', glpiFailure(error).body.code);
    }
  }
}
