import {
  withRequiredRole,
  type CurrentUserResolver,
} from '../auth/api-access.ts';
import {
  DashboardError,
  parseDashboardFilters,
  validateNocTimeZone,
} from './dashboard.ts';
import type { TicketDashboardRepository } from '../../db/ticket-dashboard.ts';
import type { D1TicketRepository } from '../../db/ticket-storage.ts';

export function createDashboardHandler(
  resolveUser: CurrentUserResolver,
  repository: () => Pick<TicketDashboardRepository, 'query'>,
  zone: () => string | undefined = () => undefined,
) {
  return (request: Request) =>
    withRequiredRole(request, 'viewer', resolveUser, async () => {
      const json = (body: unknown, status = 200) =>
        Response.json(body, {
          status,
          headers: { 'Cache-Control': 'no-store' },
        });
      try {
        const filters = parseDashboardFilters(
          new URL(request.url).searchParams,
        );
        const timeZone = validateNocTimeZone(zone());
        return json({
          success: true,
          ...(await repository().query(filters, timeZone)),
        });
      } catch (error) {
        if (error instanceof DashboardError)
          return json({ success: false, message: error.message }, 400);
        return json(
          {
            success: false,
            message:
              'Dashboard indisponível. Verifique a configuração e a preparação do banco, sem aplicar migrations automaticamente.',
          },
          503,
        );
      }
    });
}

export function createLocalTicketHandler(
  resolveUser: CurrentUserResolver,
  repository: () => Pick<D1TicketRepository, 'getByLocalId'>,
) {
  return (request: Request, id: string) =>
    withRequiredRole(request, 'operator', resolveUser, async () => {
      const json = (body: unknown, status = 200) =>
        Response.json(body, {
          status,
          headers: { 'Cache-Control': 'no-store' },
        });
      if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)))
        return json(
          { success: false, message: 'Identificador local inválido.' },
          400,
        );
      try {
        const ticket = await repository().getByLocalId(Number(id));
        return ticket
          ? json({ success: true, ticket })
          : json({ success: false, message: 'Chamado não encontrado.' }, 404);
      } catch {
        return json(
          {
            success: false,
            message: 'Não foi possível consultar os detalhes locais.',
          },
          503,
        );
      }
    });
}
