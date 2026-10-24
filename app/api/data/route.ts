import { createDataHandlers } from './handlers';
import { dataOperationStore, readCatalogQuery } from '@/db/storage';
import { getAuthService } from '@/services/auth/auth-runtime';
import { withRequiredRole } from '@/services/auth/api-access';

const handlers = (actorId: number) => createDataHandlers({ read: readCatalogQuery, execute: (...args) => dataOperationStore().execute(...args), recover: (...args) => dataOperationStore().recover(...args) }, actorId);

const resolveCurrentUser = (token: string | null) => getAuthService().currentUser(token);

export const GET = (request: Request) =>
  withRequiredRole(request, 'viewer', resolveCurrentUser, (user) => handlers(user.id).GET(request));
export const POST = (request: Request) =>
  withRequiredRole(request, 'operator', resolveCurrentUser, (user) => handlers(user.id).POST(request));
export const PUT = (request: Request) =>
  withRequiredRole(request, 'operator', resolveCurrentUser, (user) => handlers(user.id).PUT(request));
