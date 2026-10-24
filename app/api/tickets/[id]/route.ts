import { getTicketRepository } from '@/db/ticket-runtime';
import { getAuthService } from '@/services/auth/auth-runtime';
import { createLocalTicketHandler } from '@/services/tickets/dashboard-handlers';

const handler = createLocalTicketHandler(
  (token) => getAuthService().currentUser(token),
  getTicketRepository,
);
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handler(request, (await context.params).id);
}
