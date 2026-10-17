import { AuthError, authFailure } from './auth-errors.ts';
import { readAuthCookie } from './api-access.ts';
import type { AuthService } from './auth-service.ts';
import { LoginRateLimiter } from './login-rate-limit.ts';
import type { AuthUser } from './auth-types.ts';

const COOKIE_NAME = 'opuslog_session';
const COOKIE_MAX_AGE_SECONDS = 8 * 60 * 60;
const LOGIN_BODY_MAX_BYTES = 2048;

function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Cache-Control', 'no-store');
  responseHeaders.set('Content-Type', 'application/json; charset=utf-8');
  return Response.json(body, { status, headers: responseHeaders });
}

export function authErrorResponse(error: unknown): Response {
  const failure = authFailure(error);
  return json(failure.body, failure.status);
}

function cookieHeader(request: Request, value: string, maxAge: number): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}

function isLocalDevelopmentRequest(request: Request): boolean {
  const { hostname } = new URL(request.url);
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
}

export function logLocalAuthFailure(
  request: Request,
  error: unknown,
  logger: (message: string) => void = (message) => console.warn(message),
): void {
  if (!isLocalDevelopmentRequest(request)) return;
  const failure = error instanceof AuthError ? error : new AuthError('AUTH_STORAGE_UNAVAILABLE');
  logger(`AUTH_LOGIN_FAILURE stage=${failure.diagnostic.stage} reason=${failure.diagnostic.reason}`);
}

async function readSmallJson(request: Request): Promise<unknown> {
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > LOGIN_BODY_MAX_BYTES))
    throw new AuthError('AUTH_INVALID_REQUEST');
  if (!request.body) throw new AuthError('AUTH_INVALID_REQUEST');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > LOGIN_BODY_MAX_BYTES) {
        await reader.cancel();
        throw new AuthError('AUTH_INVALID_REQUEST');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new AuthError('AUTH_INVALID_REQUEST');
  }
}

function validateLoginPayload(input: unknown): { username: string; password: string } {
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    throw new AuthError('AUTH_INVALID_REQUEST');
  const record = input as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== 'username' && key !== 'password'))
    throw new AuthError('AUTH_INVALID_REQUEST');
  if (typeof record.username !== 'string' || typeof record.password !== 'string')
    throw new AuthError('AUTH_INVALID_REQUEST');
  const username = record.username.trim();
  const password = record.password;
  const hasForbiddenControl = (value: string) => value.includes('\r') || value.includes('\n') || value.includes('\0');
  if (!username || username.includes(':') || username.length > 128 || !password || password.length > 512 || hasForbiddenControl(username) || hasForbiddenControl(password))
    throw new AuthError('AUTH_INVALID_REQUEST');
  return { username, password };
}

function publicUser(user: AuthUser) {
  return {
    id: user.id,
    glpiUserId: user.glpiUserId,
    username: user.username,
    name: user.name,
    role: user.role,
    active: user.active,
  };
}

function clientIp(request: Request): string {
  // CF-Connecting-IP is set at the Cloudflare edge; do not trust arbitrary X-Forwarded-For.
  return request.headers.get('cf-connecting-ip')?.trim().slice(0, 64) || 'unknown';
}

type AuthServiceSource = AuthService | (() => AuthService);

function resolveService(source: AuthServiceSource): AuthService {
  return typeof source === 'function' ? source() : source;
}

export function createAuthHandlers(input: { service: AuthServiceSource; limiter: LoginRateLimiter }) {
  return {
    async login(request: Request): Promise<Response> {
      const ip = clientIp(request);
      const limit = input.limiter.consume(ip);
      if (!limit.allowed) {
        return json(
          { success: false, code: 'AUTH_RATE_LIMITED', message: 'Muitas tentativas de login. Aguarde antes de tentar novamente.' },
          429,
          { 'Retry-After': String(limit.retryAfterSeconds) },
        );
      }
      try {
        if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json')
          throw new AuthError('AUTH_INVALID_REQUEST');
        if (!sameOrigin(request)) {
          logLocalAuthFailure(request, new AuthError('AUTH_LOGIN_FAILED', undefined, {
            stage: 'request', reason: 'ORIGIN_MISMATCH',
          }));
          return json({ success: false, code: 'AUTH_LOGIN_FAILED', message: 'Não foi possível autenticar ou autorizar essa conta no OpusLog.' }, 401);
        }
        const credentials = validateLoginPayload(await readSmallJson(request));
        let result;
        try {
          result = await resolveService(input.service).login(credentials.username, credentials.password);
        } finally {
          // Drop this reference promptly; JS cannot promise physical erasure of immutable strings.
          credentials.password = '';
        }
        input.limiter.reset(ip);
        return json(
          { success: true, user: publicUser(result.user) },
          200,
          { 'Set-Cookie': cookieHeader(request, result.token, COOKIE_MAX_AGE_SECONDS) },
        );
      } catch (error) {
        const failure = authFailure(error);
        if (failure.status === 401 || failure.status === 503) logLocalAuthFailure(request, error);
        return json(failure.body, failure.status);
      }
    },

    async me(request: Request): Promise<Response> {
      const cookie = readAuthCookie(request);
      try {
        const user = await resolveService(input.service).currentUser(cookie.token);
        return json(
          { user: user ? publicUser(user) : null },
          200,
          cookie.malformed ? { 'Set-Cookie': cookieHeader(request, '', 0) } : {},
        );
      } catch (error) {
        const failure = authFailure(error);
        return json(failure.body, failure.status);
      }
    },

    async logout(request: Request): Promise<Response> {
      const cookie = readAuthCookie(request);
      try {
        if (!sameOrigin(request))
          return json({ success: false, code: 'AUTH_LOGIN_FAILED', message: 'Não foi possível concluir a solicitação.' }, 403);
        await resolveService(input.service).logout(cookie.token);
        return json({ success: true }, 200, { 'Set-Cookie': cookieHeader(request, '', 0) });
      } catch (error) {
        const failure = authFailure(error);
        return json(failure.body, failure.status, { 'Set-Cookie': cookieHeader(request, '', 0) });
      }
    },
  };
}
