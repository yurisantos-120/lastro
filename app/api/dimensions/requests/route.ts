import { createDimensionGovernanceHandlers } from '@/services/dimensions/handlers';
import { dimensionRepository } from '@/services/dimensions/runtime';
import { getAuthService } from '@/services/auth/auth-runtime';
const handlers=createDimensionGovernanceHandlers(token=>getAuthService().currentUser(token),dimensionRepository);
export const GET=(request:Request)=>handlers.requests(request);
export const POST=(request:Request)=>handlers.submit(request);
