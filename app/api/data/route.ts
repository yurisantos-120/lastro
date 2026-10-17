import { createDataHandlers } from './handlers';
import { createCategory, createRecord, readAll, updateCategory, updateRecord } from '@/db/storage';
import { getAuthService } from '@/services/auth/auth-runtime';
import { withRequiredRole } from '@/services/auth/api-access';

const handlers = createDataHandlers({ readAll, createCategory, createRecord, updateCategory, updateRecord });

const resolveCurrentUser = (token: string | null) => getAuthService().currentUser(token);

export const GET = (request: Request) =>
  withRequiredRole(request, 'viewer', resolveCurrentUser, () => handlers.GET());
export const POST = (request: Request) =>
  withRequiredRole(request, 'operator', resolveCurrentUser, () => handlers.POST(request));
export const PUT = (request: Request) =>
  withRequiredRole(request, 'operator', resolveCurrentUser, () => handlers.PUT(request));
