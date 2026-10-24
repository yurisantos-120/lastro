import {
  withRequiredRole,
  type CurrentUserResolver,
} from '../auth/api-access.ts';
import {
  DataValidationError,
  readJsonBody,
} from '../../app/api/data/validation.ts';
import { HandoffError, operationKey } from './handoffs.ts';
import type { Shift } from './handoffs.ts';
import type { HandoffRepository } from '../../db/handoffs.ts';

export function createHandoffHandlers(
  resolveUser: CurrentUserResolver,
  repo: () => HandoffRepository,
) {
  const json = (body: unknown, status = 200) =>
    Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  const handle = async (action: () => Promise<unknown>) => {
    try {
      return json({ success: true, ...((await action()) as object) });
    } catch (error) {
      if (error instanceof HandoffError)
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
          code: 'HANDOFF_UNAVAILABLE',
          message:
            'Passagens indisponíveis. Verifique a configuração e a preparação do banco.',
        },
        503,
      );
    }
  };
  const read = (request: Request, action: () => Promise<unknown>) =>
    withRequiredRole(request, 'viewer', resolveUser, () => handle(action));
  const write = (
    request: Request,
    action: (id: number, body: unknown) => Promise<unknown>,
  ) =>
    withRequiredRole(request, 'operator', resolveUser, (user) =>
      handle(async () => {
        if (
          request.headers
            .get('content-type')
            ?.split(';')[0]
            .trim()
            .toLowerCase() !== 'application/json'
        )
          throw new HandoffError('CONTENT_TYPE', 'Envie JSON.', 415);
        const origin = request.headers.get('origin');
        if (origin && origin !== new URL(request.url).origin)
          throw new HandoffError('ORIGIN', 'Origem não permitida.', 403);
        return action(user.id, await readJsonBody(request));
      }),
    );
  const validId = (id: string) => operationKey(id);
  return {
    list: (request: Request) =>
      read(request, async () => {
        const params = new URL(request.url).searchParams;
        if (
          [...params.keys()].some((key) => key !== 'page') ||
          params.getAll('page').length > 1
        )
          throw new HandoffError('INVALID_PAGE', 'Paginação inválida.');
        const page = params.get('page') ?? '1';
        if (!/^[1-9]\d*$/.test(page) || Number(page) > 1000000)
          throw new HandoffError('INVALID_PAGE', 'Paginação inválida.');
        return repo().list(Number(page));
      }),
    preview: (request: Request) =>
      read(request, async () => {
        const params = new URL(request.url).searchParams;
        if (
          [...params.keys()].some(
            (key) =>
              !['date', 'shift'].includes(key) || params.getAll(key).length > 1,
          )
        )
          throw new HandoffError('INVALID_PERIOD', 'Parâmetros inválidos.');
        const date = params.get('date'),
          shift = params.get('shift');
        if (
          (date === null) !== (shift === null) ||
          (shift !== null && !['day', 'night'].includes(shift))
        )
          throw new HandoffError('INVALID_PERIOD', 'Informe data e turno.');
        return repo().preview(date ?? undefined, shift as Shift | undefined);
      }),
    get: (request: Request, id: string) =>
      read(request, async () => ({ handoff: await repo().get(validId(id)) })),
    deliver: (request: Request) =>
      write(request, (id, body) => repo().deliver(id, body)),
    receive: (request: Request, id: string) =>
      write(request, (actor, body) => {
        if (
          !body ||
          typeof body !== 'object' ||
          Array.isArray(body) ||
          Object.keys(body).some((key) => key !== 'operationKey')
        )
          throw new HandoffError('INVALID_RECEIPT', 'Recebimento inválido.');
        return repo().receive(
          validId(id),
          actor,
          (body as { operationKey?: unknown }).operationKey,
        );
      }),
  };
}
