import type { GlpiConfig } from './types.ts';
import { GlpiError } from './glpi-errors.ts';
import { glpiHttpHost, glpiTransportUrl, privateGlpiHost } from './glpi-url.ts';
export interface GlpiEnvironment {
  GLPI_BASE_URL?: string;
  GLPI_PRIVATE_HTTP_HOST?: string;
  GLPI_HTTP_HOST?: string;
  GLPI_APP_TOKEN?: string;
  GLPI_USER_TOKEN?: string;
  GLPI_API_VERSION?: string;
  GLPI_TIMEOUT_MS?: string;
  GLPI_TICKET_CREATE_TIMEOUT_MS?: string;
}
export function readGlpiConfig(env: GlpiEnvironment): GlpiConfig {
  const invalid = () => new GlpiError('GLPI_CONFIG_ERROR', 503);
  if (env.GLPI_API_VERSION !== 'v1') throw invalid();
  let baseUrl: string;
  let privateHttpHost: string | undefined;
  let httpHost: string | undefined;
  try {
    privateHttpHost = privateGlpiHost(env.GLPI_PRIVATE_HTTP_HOST);
    httpHost = glpiHttpHost(env.GLPI_HTTP_HOST);
    baseUrl = glpiTransportUrl(env.GLPI_BASE_URL?.trim() || '', privateHttpHost, httpHost);
  } catch { throw invalid(); }
  const appToken = env.GLPI_APP_TOKEN?.trim() || '';
  const userToken = env.GLPI_USER_TOKEN?.trim() || '';
  if (
    !userToken ||
    /[^\x21-\x7E]/.test(userToken) ||
    /[^\x21-\x7E]/.test(appToken)
  )
    throw invalid();
  const timeoutMs = Number(env.GLPI_TIMEOUT_MS || 10000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000)
    throw invalid();
  const ticketCreateTimeoutMs = Number(env.GLPI_TICKET_CREATE_TIMEOUT_MS || 20000);
  if (
    !Number.isInteger(ticketCreateTimeoutMs) ||
    ticketCreateTimeoutMs < 1000 ||
    ticketCreateTimeoutMs > 30000
  )
    throw invalid();
  return {
    baseUrl,
    privateHttpHost,
    httpHost,
    appToken,
    userToken,
    timeoutMs,
    ticketCreateTimeoutMs,
    apiVersion: 'v1',
  };
}
