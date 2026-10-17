import { authFailure } from './auth-errors.ts';
import type { AuthUser, LocalAuthRole } from './auth-types.ts';

const COOKIE_NAME = 'opuslog_session';
const roleRank: Record<LocalAuthRole, number> = { viewer: 0, operator: 1, admin: 2 };

export interface AuthCookie {
  token: string | null;
  malformed: boolean;
}

export type CurrentUserResolver = (token: string | null) => Promise<AuthUser | null>;
export type AuthenticatedResult = { user: AuthUser } | { response: Response };

export function readAuthCookie(request: Request): AuthCookie {
  const cookie = request.headers.get('cookie');
  if (!cookie) return { token: null, malformed: false };
  const matches = cookie.split(';').map((part) => part.trim()).filter((part) => part.startsWith(`${COOKIE_NAME}=`));
  if (matches.length !== 1) return { token: null, malformed: matches.length > 0 };
  const token = matches[0].slice(COOKIE_NAME.length + 1);
  return { token: token || null, malformed: !/^[A-Za-z0-9_-]{40,50}$/.test(token) };
}

function authResponse(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function requireAuthenticatedUser(
  request: Request,
  resolveCurrentUser: CurrentUserResolver,
): Promise<AuthenticatedResult> {
  const { token } = readAuthCookie(request);
  if (!token) {
    return { response: authResponse({ success: false, code: 'AUTH_REQUIRED', message: 'Autenticação necessária.' }, 401) };
  }

  try {
    const user = await resolveCurrentUser(token);
    if (user?.active) return { user };
    return { response: authResponse({ success: false, code: 'AUTH_REQUIRED', message: 'Autenticação necessária.' }, 401) };
  } catch (error) {
    const failure = authFailure(error);
    return { response: authResponse(failure.body, failure.status) };
  }
}

export function requireRole(user: AuthUser, minimumRole: LocalAuthRole): Response | null {
  if (!user.active) {
    return authResponse({ success: false, code: 'AUTH_REQUIRED', message: 'Autenticação necessária.' }, 401);
  }
  if (roleRank[user.role] >= roleRank[minimumRole]) return null;
  return authResponse({ success: false, code: 'AUTH_FORBIDDEN', message: 'Você não tem permissão para esta operação.' }, 403);
}

export async function withRequiredRole(
  request: Request,
  minimumRole: LocalAuthRole,
  resolveCurrentUser: CurrentUserResolver,
  handler: (user: AuthUser) => Response | Promise<Response>,
): Promise<Response> {
  const authentication = await requireAuthenticatedUser(request, resolveCurrentUser);
  if ('response' in authentication) return authentication.response;
  const authorization = requireRole(authentication.user, minimumRole);
  if (authorization) return authorization;
  return handler(authentication.user);
}
