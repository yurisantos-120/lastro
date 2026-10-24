import { withRequiredRole, type CurrentUserResolver } from '../auth/api-access.ts';
import { readJsonBody, DataValidationError } from '../../app/api/data/validation.ts';
import { TicketOperationError } from './operations.ts';
import type { TicketOperationsRepository } from '../../db/ticket-operations.ts';

type Repository = Pick<TicketOperationsRepository, 'read' | 'save'>;

export function createTicketOperationHandlers(resolveUser: CurrentUserResolver, repository: () => Repository) {
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  const handle = async (id: string, action: (id: number) => Promise<unknown>) => {
    try {
      if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) throw new TicketOperationError('INVALID_TICKET_ID', 'Identificador local inválido.');
      return json({ success: true, ...await action(Number(id)) as object });
    } catch (error) {
      if (error instanceof TicketOperationError) return json({ success: false, code: error.code, message: error.message }, error.status);
      if (error instanceof DataValidationError) return json({ success: false, code: 'INVALID_OPERATION', message: error.message }, error.status);
      return json({ success: false, code: 'OPERATIONS_UNAVAILABLE', message: 'Dados operacionais indisponíveis. Verifique a preparação do banco e tente novamente.' }, 503);
    }
  };
  return {
    GET: (request: Request, id: string) => withRequiredRole(request, 'viewer', resolveUser, () => handle(id, (ticketId) => repository().read(ticketId))),
    PUT: (request: Request, id: string) => withRequiredRole(request, 'operator', resolveUser, (user) => handle(id, async (ticketId) => {
      if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new TicketOperationError('INVALID_CONTENT_TYPE', 'Envie JSON.', 415);
      const origin = request.headers.get('origin');
      if (origin && origin !== new URL(request.url).origin) throw new TicketOperationError('INVALID_ORIGIN', 'Origem não permitida.', 403);
      return repository().save(ticketId, user.id, await readJsonBody(request));
    })),
  };
}
