import { handoffHandlers } from '@/services/handoffs/runtime';
export const GET = handoffHandlers.list;
export const POST = handoffHandlers.deliver;
