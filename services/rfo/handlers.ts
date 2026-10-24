import {
  withRequiredRole,
  type CurrentUserResolver,
} from '../auth/api-access.ts';
import {
  DataValidationError,
  readJsonBody,
} from '../../app/api/data/validation.ts';
import { RfoError } from './rfo.ts';
import type { RfoRepository } from '../../db/rfo.ts';

export function createRfoHandlers(
  resolveUser: CurrentUserResolver,
  repo: () => RfoRepository,
) {
  const json = (body: unknown, status = 200) =>
    Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  const handle = async (
    id: string,
    action: (ticketId: number) => Promise<unknown>,
  ) => {
    try {
      if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)))
        throw new RfoError('INVALID_ID', 'Identificador local inválido.');
      return json({ success: true, ...((await action(Number(id))) as object) });
    } catch (error) {
      if (error instanceof RfoError)
        return json(
          { success: false, code: error.code, message: error.message },
          error.status,
        );
      if (error instanceof DataValidationError)
        return json(
          { success: false, code: 'INVALID_BODY', message: error.message },
          error.status,
        );
      return json(
        {
          success: false,
          code: 'RFO_UNAVAILABLE',
          message:
            'RFO indisponível. Verifique a preparação do banco e tente novamente.',
        },
        503,
      );
    }
  };
  return {
    GET: (request: Request, id: string) =>
      withRequiredRole(request, 'viewer', resolveUser, () =>
        handle(id, async (ticketId) => {
          const params = new URL(request.url).searchParams,
            page = params.get('page') ?? '1';
          if (
            [...params.keys()].some((key) => key !== 'page') ||
            params.getAll('page').length > 1 ||
            !/^[1-9]\d*$/.test(page) ||
            Number(page) > 1000000
          )
            throw new RfoError('INVALID_PAGE', 'Paginação inválida.');
          return repo().read(ticketId, Number(page));
        }),
      ),
    PUT: (request: Request, id: string) =>
      withRequiredRole(request, 'operator', resolveUser, (user) =>
        handle(id, async (ticketId) => {
          if (
            request.headers
              .get('content-type')
              ?.split(';')[0]
              .trim()
              .toLowerCase() !== 'application/json'
          )
            throw new RfoError('CONTENT_TYPE', 'Envie JSON.', 415);
          const origin = request.headers.get('origin');
          if (origin && origin !== new URL(request.url).origin)
            throw new RfoError('ORIGIN', 'Origem não permitida.', 403);
          return repo().save(ticketId, user.id, await readJsonBody(request));
        }),
      ),
  };
}
