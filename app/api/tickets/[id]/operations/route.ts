import { env } from 'cloudflare:workers';
import { getAuthService } from '@/services/auth/auth-runtime';
import { createTicketOperationHandlers } from '@/services/tickets/operation-handlers';
import { TicketOperationsRepository } from '@/db/ticket-operations';

const handlers = createTicketOperationHandlers(
  (token) => getAuthService().currentUser(token),
  () => {
    if (!env.DB) throw new Error('DB unavailable');
    return new TicketOperationsRepository(env.DB);
  },
);

type Context = { params: Promise<{ id: string }> };
// ID is the local ticket ID, never an inferred GLPI ID.
export async function GET(request: Request, context: Context) { return handlers.GET(request, (await context.params).id); }
export async function PUT(request: Request, context: Context) { return handlers.PUT(request, (await context.params).id); }
