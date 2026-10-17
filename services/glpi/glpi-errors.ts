import type { GlpiErrorCode, GlpiFailure } from './types.ts';

const messages: Record<GlpiErrorCode, string> = {
  GLPI_SESSION_ERROR: 'A sessão GLPI foi recusada ou expirou.',
  GLPI_TICKET_NOT_FOUND: 'Chamado não encontrado no GLPI ou indisponível para esta conta.',
  GLPI_CONFIG_ERROR:
    'Integração GLPI não configurada. Verifique as variáveis de ambiente no servidor.',
  GLPI_AUTH_ERROR:
    'Autenticação recusada pelo GLPI. Verifique os tokens e a configuração da API.',
  GLPI_FORBIDDEN:
    'Acesso recusado. Verifique o perfil, a entidade e as permissões no GLPI.',
  GLPI_CONNECTION_ERROR:
    'Não foi possível conectar ao GLPI. Verifique a disponibilidade e a rede.',
  GLPI_TIMEOUT:
    'O GLPI não respondeu no prazo. Confira no GLPI antes de repetir a criação de chamado.',
  GLPI_NOT_FOUND:
    'Endpoint GLPI não encontrado. Verifique a URL base e a versão da API.',
  GLPI_TICKET_UNCERTAIN:
    'Nao foi possivel confirmar se o GLPI criou o chamado. Verifique antes de tentar novamente.',
  GLPI_TICKET_CREATE_ERROR:
    'Não foi possível confirmar a criação. Confira no GLPI antes de tentar novamente.',
  GLPI_INVALID_RESPONSE:
    'Resposta inesperada do GLPI. Confira no GLPI antes de repetir a criação de chamado.',
  GLPI_VALIDATION_ERROR:
    'Informe título de 1 a 255 caracteres e descrição de 1 a 10000 caracteres em JSON.',
};
export class GlpiError extends Error {
  readonly code: GlpiErrorCode;
  readonly status: number;
  constructor(code: GlpiErrorCode, status = 502) {
    super(messages[code]);
    this.name = 'GlpiError';
    this.code = code;
    this.status = status;
  }
}
export function glpiFailure(error: unknown): {
  body: GlpiFailure;
  status: number;
} {
  const safe =
    error instanceof GlpiError ? error : new GlpiError('GLPI_CONNECTION_ERROR');
  return {
    body: { success: false, message: safe.message, code: safe.code },
    status: safe.status,
  };
}
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
