import { handoffHandlers } from '@/services/handoffs/runtime';
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handoffHandlers.receive(request, (await context.params).id);
}
