import { dataOperationStore } from '@/db/storage';
import { createDataHandlers } from '@/app/api/data/handlers';
import { getAuthService } from '@/services/auth/auth-runtime';
import { withRequiredRole } from '@/services/auth/api-access';

export async function GET(request: Request, context: {params:Promise<{operationKey:string}>}) {
  return withRequiredRole(request,'operator',(token) => getAuthService().currentUser(token), async (user) => {
    const store = dataOperationStore();
    const handlers = createDataHandlers({read:async()=>null,execute:(...args)=>store.execute(...args),recover:(...args)=>store.recover(...args)},user.id);
    return handlers.RECOVER((await context.params).operationKey);
  });
}
