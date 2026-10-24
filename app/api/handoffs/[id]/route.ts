import { handoffHandlers } from '@/services/handoffs/runtime';
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handoffHandlers.get(request, (await context.params).id);
}
