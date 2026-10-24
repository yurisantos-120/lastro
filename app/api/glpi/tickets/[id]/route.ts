import { env } from 'cloudflare:workers';
import { getGlpiService } from '@/services/glpi/glpi-runtime';
import { getTicketRepository } from '@/db/ticket-runtime';
import { GlpiIntegrationRepository } from '@/db/glpi-integration';
import { GlpiIntegrationWorkflow } from '@/services/glpi/integration-workflow';
import { IntegrationError } from '@/services/glpi/integration';
import { getAuthService } from '@/services/auth/auth-runtime';
import { withRequiredRole } from '@/services/auth/api-access';
// Compatibility endpoint: id is remote, unlike /api/tickets/:id/integration.
// Retains explicit synchronization but now journals every request.
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withRequiredRole(
    request,
    'operator',
    (token) => getAuthService().currentUser(token),
    async (user) => {
      const json = (body: unknown, status = 200) =>
        Response.json(body, {
          status,
          headers: { 'Cache-Control': 'no-store' },
        });
      try {
        const { id } = await context.params;
        if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)))
          throw new IntegrationError('INVALID_ID', 'ID GLPI inválido.');
        const origin = request.headers.get('origin');
        if (origin && origin !== new URL(request.url).origin)
          throw new IntegrationError('ORIGIN', 'Origem não permitida.', 403);
        const local = await getTicketRepository().getByGlpiId(Number(id));
        if (!local)
          throw new IntegrationError(
            'NOT_FOUND',
            'Chamado local não encontrado.',
            404,
          );
        if (!env.DB) throw new Error('Unavailable');
        const workflow = new GlpiIntegrationWorkflow(
          new GlpiIntegrationRepository(env.DB),
          getGlpiService,
        );
        const result = await workflow.execute(local.id, user.id, {
          operationKey: crypto.randomUUID(),
          action: 'sync',
          expectedRevision: local.revision,
        });
        const updated = await getTicketRepository().getByLocalId(local.id);
        return json({
          success: true,
          ticket: updated ?? local,
          sync:
            result.operation.state === 'confirmed'
              ? { success: true }
              : {
                  success: false,
                  code: result.operation.code,
                  message:
                    'Não foi possível confirmar a consulta. Consulte o histórico da integração.',
                },
        });
      } catch (error) {
        return json(
          {
            success: false,
            code:
              error instanceof IntegrationError
                ? error.code
                : 'INTEGRATION_UNAVAILABLE',
            message:
              error instanceof IntegrationError
                ? error.message
                : 'Integração indisponível. Consulte o histórico local.',
          },
          error instanceof IntegrationError ? error.status : 503,
        );
      }
    },
  );
}
