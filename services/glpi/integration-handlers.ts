import {
  withRequiredRole,
  type CurrentUserResolver,
} from '../auth/api-access.ts';
import {
  DataValidationError,
  readJsonBody,
} from '../../app/api/data/validation.ts';
import { IntegrationError } from './integration.ts';
import type { GlpiIntegrationWorkflow } from './integration-workflow.ts';
export function createIntegrationHandlers(
  resolve: CurrentUserResolver,
  workflow: () => GlpiIntegrationWorkflow,
) {
  const json = (body: unknown, status = 200) =>
    Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  const handle = async (id: string, fn: (id: number) => Promise<unknown>) => {
    try {
      if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)))
        throw new IntegrationError('INVALID_ID', 'ID local inválido.');
      return json({ success: true, ...((await fn(Number(id))) as object) });
    } catch (error) {
      if (
        error instanceof IntegrationError ||
        error instanceof DataValidationError
      )
        return json(
          {
            success: false,
            code:
              error instanceof IntegrationError ? error.code : 'INVALID_BODY',
            message: error.message,
          },
          error.status,
        );
      return json(
        {
          success: false,
          code: 'INTEGRATION_UNAVAILABLE',
          message:
            'Integração indisponível. Verifique a preparação do banco e consulte o histórico antes de reenviar.',
        },
        503,
      );
    }
  };
  return {
    GET: (request: Request, id: string) =>
      withRequiredRole(request, 'operator', resolve, () =>
        handle(id, async (ticketId) => {
          const params = new URL(request.url).searchParams,
            page = params.get('page') ?? '1';
          if (
            [...params.keys()].some((key) => key !== 'page') ||
            params.getAll('page').length > 1 ||
            !/^[1-9]\d*$/.test(page) ||
            Number(page) > 1000000
          )
            throw new IntegrationError('INVALID_PAGE', 'Página inválida.');
          return workflow().repo.read(ticketId, Number(page));
        }),
      ),
    POST: (request: Request, id: string) =>
      withRequiredRole(request, 'operator', resolve, (user) =>
        handle(id, async (ticketId) => {
          const origin = request.headers.get('origin');
          if (origin && origin !== new URL(request.url).origin)
            throw new IntegrationError('ORIGIN', 'Origem não permitida.', 403);
          if (
            request.headers
              .get('content-type')
              ?.split(';')[0]
              .trim()
              .toLowerCase() !== 'application/json'
          )
            throw new IntegrationError('CONTENT_TYPE', 'Envie JSON.', 415);
          const body = await readJsonBody(request);
          if (
            body &&
            typeof body === 'object' &&
            !Array.isArray(body) &&
            'reconcileKey' in body
          ) {
            if (
              Object.keys(body).length !== 1 ||
              typeof body.reconcileKey !== 'string'
            )
              throw new IntegrationError(
                'INVALID_BODY',
                'Reconciliação inválida.',
              );
            return workflow().reconcile(ticketId, user.id, body.reconcileKey);
          }
          return workflow().execute(ticketId, user.id, body);
        }),
      ),
  };
}
