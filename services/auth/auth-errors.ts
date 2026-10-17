export type AuthErrorCode =
  | 'AUTH_INVALID_REQUEST'
  | 'AUTH_LOGIN_FAILED'
  | 'AUTH_PROVIDER_UNAVAILABLE'
  | 'AUTH_STORAGE_UNAVAILABLE'
  | 'AUTH_RATE_LIMITED';

export type AuthDiagnosticStage =
  | 'request' | 'glpi_config' | 'glpi_init' | 'glpi' | 'glpi_identity' | 'glpi_cleanup'
  | 'bootstrap' | 'authorization' | 'storage';

export type AuthDiagnosticReason =
  | 'AUTH_INVALID_REQUEST' | 'AUTH_LOGIN_FAILED' | 'AUTH_PROVIDER_UNAVAILABLE' | 'AUTH_STORAGE_UNAVAILABLE' | 'AUTH_RATE_LIMITED'
  | 'ORIGIN_MISMATCH' | 'INVALID_CREDENTIALS' | 'GLPI_UNAVAILABLE' | 'GLPI_CONFIG_ERROR'
  | 'GLPI_IDENTITY_ERROR' | 'GLPI_SESSION_CLEANUP_ERROR' | 'GLPI_USER_NOT_AUTHORIZED'
  | 'BOOTSTRAP_CLOSED' | 'LOCAL_USER_INACTIVE';

export type AuthDiagnostic = { stage: AuthDiagnosticStage; reason: AuthDiagnosticReason };

const messages: Record<AuthErrorCode, string> = {
  AUTH_INVALID_REQUEST: 'Solicitação de login inválida.',
  AUTH_LOGIN_FAILED: 'Não foi possível autenticar ou autorizar essa conta no OpusLog.',
  AUTH_PROVIDER_UNAVAILABLE: 'O serviço de autenticação está temporariamente indisponível.',
  AUTH_STORAGE_UNAVAILABLE: 'Não foi possível concluir a autenticação no momento.',
  AUTH_RATE_LIMITED: 'Muitas tentativas de login. Aguarde antes de tentar novamente.',
};

const statuses: Record<AuthErrorCode, number> = {
  AUTH_INVALID_REQUEST: 400,
  AUTH_LOGIN_FAILED: 401,
  AUTH_PROVIDER_UNAVAILABLE: 503,
  AUTH_STORAGE_UNAVAILABLE: 503,
  AUTH_RATE_LIMITED: 429,
};

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  readonly status: number;
  readonly reason?: 'GLPI_CREDENTIALS_INVALID' | 'GLPI_USER_NOT_AUTHORIZED' | 'LOCAL_USER_INACTIVE' | 'BOOTSTRAP_CLOSED';
  readonly diagnostic: AuthDiagnostic;

  constructor(code: AuthErrorCode, reason?: AuthError['reason'], diagnostic?: AuthDiagnostic) {
    super(messages[code]);
    this.name = 'AuthError';
    this.code = code;
    this.status = statuses[code];
    this.reason = reason;
    this.diagnostic = diagnostic ?? defaultDiagnostic(code, reason);
  }
}

function defaultDiagnostic(code: AuthErrorCode, reason?: AuthError['reason']): AuthDiagnostic {
  if (reason === 'GLPI_CREDENTIALS_INVALID') return { stage: 'glpi_init', reason: 'INVALID_CREDENTIALS' };
  if (reason === 'GLPI_USER_NOT_AUTHORIZED') return { stage: 'bootstrap', reason };
  if (reason === 'BOOTSTRAP_CLOSED') return { stage: 'bootstrap', reason };
  if (reason === 'LOCAL_USER_INACTIVE') return { stage: 'authorization', reason };
  if (code === 'AUTH_STORAGE_UNAVAILABLE') return { stage: 'storage', reason: code };
  if (code === 'AUTH_PROVIDER_UNAVAILABLE') return { stage: 'glpi', reason: code };
  return { stage: 'request', reason: code };
}

export function authFailure(error: unknown): { body: { success: false; code: AuthErrorCode; message: string }; status: number } {
  const safe = error instanceof AuthError ? error : new AuthError('AUTH_STORAGE_UNAVAILABLE');
  return {
    body: { success: false, code: safe.code, message: safe.message },
    status: safe.status,
  };
}
