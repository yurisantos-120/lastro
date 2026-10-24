import { env } from 'cloudflare:workers';
import { getAuthService } from '@/services/auth/auth-runtime';
import { GlpiIntegrationRepository } from '@/db/glpi-integration';
import { GlpiIntegrationWorkflow } from '@/services/glpi/integration-workflow';
import { createIntegrationHandlers } from '@/services/glpi/integration-handlers';
import { getGlpiService } from '@/services/glpi/glpi-runtime';
const handlers = createIntegrationHandlers(
  (token) => getAuthService().currentUser(token),
  () => {
    if (!env.DB) throw new Error('DB unavailable');
    return new GlpiIntegrationWorkflow(
      new GlpiIntegrationRepository(env.DB),
      getGlpiService,
    );
  },
);
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return handlers.GET(request, (await context.params).id);
}
export async function POST(request: Request, context: Context) {
  return handlers.POST(request, (await context.params).id);
}
