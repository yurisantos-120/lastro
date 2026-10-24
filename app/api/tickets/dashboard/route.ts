import { env } from 'cloudflare:workers';
import { getAuthService } from '@/services/auth/auth-runtime';
import { TicketDashboardRepository } from '@/db/ticket-dashboard';
import { createDashboardHandler } from '@/services/tickets/dashboard-handlers';

export const GET = createDashboardHandler(
  (token) => getAuthService().currentUser(token),
  () => {
    if (!env.DB) throw new Error('DB unavailable');
    return new TicketDashboardRepository(env.DB);
  },
  () => env.NOC_TIME_ZONE,
);
