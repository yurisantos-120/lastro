import { GlpiError, glpiFailure } from '@/services/glpi/glpi-errors';
import { getTicketRepository } from '@/db/ticket-runtime';
import { TicketStorageError } from '@/db/ticket-storage';
import { getTicketWorkflow } from '@/services/tickets/ticket-workflow-runtime';
import { getAuthService } from '@/services/auth/auth-runtime';
import { withRequiredRole } from '@/services/auth/api-access';
import type { AuthUser } from '@/services/auth/auth-types';
import { readJsonBody, DataValidationError } from '@/app/api/data/validation';

const resolveCurrentUser = (token: string | null) => getAuthService().currentUser(token);

async function listTickets() {
  try {
    const tickets = await getTicketRepository().list();
    return Response.json({ success: true, tickets }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const failure = error instanceof TicketStorageError
      ? { body: { success: false as const, code: error.code, message: error.message }, status: 503 }
      : glpiFailure(error);
    return Response.json(failure.body, { status: failure.status, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function GET(request: Request) {
  return withRequiredRole(request, 'viewer', resolveCurrentUser, () => listTickets());
}

async function createTicket(request: Request, user: AuthUser) {
  try {
    if (
      request.headers
        .get('content-type')
        ?.split(';')[0]
        .trim()
        .toLowerCase() !== 'application/json'
    )
      throw new GlpiError('GLPI_VALIDATION_ERROR', 415);
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin)
      throw new GlpiError('GLPI_FORBIDDEN', 403);
    let input: unknown;
    try {
      input = await readJsonBody(request);
    } catch (error) {
      if (error instanceof DataValidationError) return Response.json({ success: false, code: 'GLPI_VALIDATION_ERROR', message: 'Corpo JSON inválido ou excede o limite de 64 KiB.' }, { status: error.status, headers: { 'Cache-Control': 'no-store' } });
      throw new GlpiError('GLPI_VALIDATION_ERROR', 400);
    }
    const result = await getTicketWorkflow().create(input, user.id);
    if (result.resultState === 'created') {
      return Response.json(
        { success: true, ticket: result.ticket, reused: result.reused },
        { status: result.reused ? 200 : 201, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return Response.json(
      {
        success: false,
        resultState: result.resultState,
        code: result.code,
        message: result.message,
        ticket: result.ticket,
        reused: result.reused,
      },
      {
        status: result.resultState === 'uncertain' ? 503 : result.resultState === 'pending' ? 409 : 502,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch (error) {
    const failure = error instanceof TicketStorageError
      ? { body: { success: false as const, code: error.code, message: error.message }, status: 503 }
      : glpiFailure(error);
    return Response.json(failure.body, {
      status: failure.status,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}

export async function POST(request: Request) {
  return withRequiredRole(request, 'operator', resolveCurrentUser, (user) => createTicket(request, user));
}
