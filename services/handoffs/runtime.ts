import { env } from 'cloudflare:workers';
import { HandoffRepository } from '@/db/handoffs';
import { getAuthService } from '@/services/auth/auth-runtime';
import { shiftConfig } from './handoffs';
import { createHandoffHandlers } from './handlers';

export const handoffHandlers = createHandoffHandlers(
  (token) => getAuthService().currentUser(token),
  () => {
    if (!env.DB) throw new Error('DB unavailable');
    return new HandoffRepository(env.DB, shiftConfig(env));
  },
);
