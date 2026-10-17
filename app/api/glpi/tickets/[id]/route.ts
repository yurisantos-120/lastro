import { getGlpiService } from '@/services/glpi/glpi-runtime';
import { GlpiError, glpiFailure } from '@/services/glpi/glpi-errors';
import { getTicketRepository } from '@/db/ticket-runtime';
import { TicketStorageError } from '@/db/ticket-storage';
import { TicketNotFoundError, TicketWorkflow } from '@/services/tickets/ticket-workflow';
import { getAuthService } from '@/services/auth/auth-runtime';
import { withRequiredRole } from '@/services/auth/api-access';

async function readTicket(context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) {
      throw new GlpiError('GLPI_TICKET_NOT_FOUND', 400);
    }
    const repository = getTicketRepository();
    const local = await repository.getByGlpiId(Number(id));
    if (!local) throw new TicketNotFoundError();
    let glpi;
    try {
      glpi = getGlpiService();
    } catch (error) {
      const failure = glpiFailure(error).body;
      return Response.json(
        { success: true, ticket: local, sync: { success: false, code: failure.code, message: failure.message } },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const workflow = new TicketWorkflow(repository, glpi);
    const result = await workflow.detail(Number(id));
    return Response.json({ success: true, ...result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const failure = error instanceof TicketNotFoundError
      ? { body: { success: false as const, code: 'TICKET_NOT_FOUND', message: error.message }, status: 404 }
      : error instanceof TicketStorageError
        ? { body: { success: false as const, code: error.code, message: error.message }, status: 503 }
        : glpiFailure(error);
    return Response.json(failure.body, { status: failure.status, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return withRequiredRole(
    request,
    'operator',
    (token) => getAuthService().currentUser(token),
    () => readTicket(context),
  );
}
