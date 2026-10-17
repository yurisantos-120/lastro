import { authErrorResponse, createAuthHandlers } from '@/services/auth/auth-handlers';
import { getAuthService } from '@/services/auth/auth-runtime';
import { loginRateLimiter } from '@/services/auth/login-rate-limit';

export async function GET(request: Request): Promise<Response> {
  try {
    return await createAuthHandlers({ service: getAuthService, limiter: loginRateLimiter }).me(request);
  } catch (error) {
    return authErrorResponse(error);
  }
}
