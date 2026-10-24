import { env } from 'cloudflare:workers';
import { getAuthService } from '@/services/auth/auth-runtime';
import { RfoRepository } from '@/db/rfo';
import { createRfoHandlers } from '@/services/rfo/handlers';
const handlers = createRfoHandlers(
  (token) => getAuthService().currentUser(token),
  () => {
    if (!env.DB) throw new Error('DB unavailable');
    return new RfoRepository(env.DB);
  },
);
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return handlers.GET(request, (await context.params).id);
}
export async function PUT(request: Request, context: Context) {
  return handlers.PUT(request, (await context.params).id);
}
