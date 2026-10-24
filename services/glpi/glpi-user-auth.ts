import type { GlpiIdentity } from '../auth/auth-types.ts';
import { isObject } from './glpi-errors.ts';
import { glpiHttpHost, glpiTransportUrl, privateGlpiHost } from './glpi-url.ts';

export interface GlpiUserAuthEnvironment {
  GLPI_API_VERSION?: string;
  GLPI_BASE_URL?: string;
  GLPI_PRIVATE_HTTP_HOST?: string;
  GLPI_HTTP_HOST?: string;
  GLPI_APP_TOKEN?: string;
  GLPI_TIMEOUT_MS?: string;
}

export interface GlpiUserAuthConfig {
  baseUrl: string;
  privateHttpHost?: string;
  httpHost?: string;
  appToken: string;
  timeoutMs: number;
}

export type GlpiUserAuthFailure =
  | 'invalid-credentials'
  | 'unavailable'
  | 'configuration'
  | 'session-cleanup'
  | 'identity';

export class GlpiUserAuthError extends Error {
  readonly failure: GlpiUserAuthFailure;

  constructor(failure: GlpiUserAuthFailure) {
    super('GLPI user authentication failed');
    this.name = 'GlpiUserAuthError';
    this.failure = failure;
  }
}

export function readGlpiUserAuthConfig(env: GlpiUserAuthEnvironment): GlpiUserAuthConfig {
  if (env.GLPI_API_VERSION !== 'v1') throw new GlpiUserAuthError('configuration');
  let baseUrl: string;
  let privateHttpHost: string | undefined;
  let httpHost: string | undefined;
  try {
    privateHttpHost = privateGlpiHost(env.GLPI_PRIVATE_HTTP_HOST);
    httpHost = glpiHttpHost(env.GLPI_HTTP_HOST);
    baseUrl = glpiTransportUrl(env.GLPI_BASE_URL?.trim() || '', privateHttpHost, httpHost);
  } catch { throw new GlpiUserAuthError('configuration'); }
  const appToken = env.GLPI_APP_TOKEN?.trim() || '';
  if (/[^\x21-\x7E]/.test(appToken)) throw new GlpiUserAuthError('configuration');
  const timeoutMs = Number(env.GLPI_TIMEOUT_MS || 10000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000)
    throw new GlpiUserAuthError('configuration');
  return { baseUrl, privateHttpHost, httpHost, appToken, timeoutMs };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function positiveInteger(value: unknown): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

export function parseGlpiIdentity(data: unknown): GlpiIdentity {
  if (!isObject(data) || !isObject(data.session)) throw new GlpiUserAuthError('identity');
  const session = data.session;
  const glpiUserId = positiveInteger(session.glpiID ?? session.glpiid ?? session.glpi_id);
  const username = typeof session.glpiname === 'string' ? session.glpiname.trim() : '';
  const firstName = typeof session.glpifirstname === 'string' ? session.glpifirstname.trim() : '';
  const realName = typeof session.glpirealname === 'string' ? session.glpirealname.trim() : '';
  const name = [firstName, realName].filter(Boolean).join(' ').trim() || username;
  if (!glpiUserId || !username || !name || username.length > 128 || name.length > 255)
    throw new GlpiUserAuthError('identity');
  return { glpiUserId, username, name };
}

export class GlpiUserAuthClient {
  private readonly config: GlpiUserAuthConfig;
  private readonly http: typeof fetch;

  constructor(config: GlpiUserAuthConfig, http: typeof fetch = fetch) {
    try { this.config = { ...config, baseUrl: glpiTransportUrl(config.baseUrl, config.privateHttpHost, config.httpHost) }; }
    catch { throw new GlpiUserAuthError('configuration'); }
    this.http = http;
  }

  private async get(path: string, sessionToken?: string, authorization?: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    if (this.config.appToken) headers['App-Token'] = this.config.appToken;
    if (sessionToken) headers['Session-Token'] = sessionToken;
    if (authorization) headers.Authorization = authorization;
    try {
      const response = await this.http(`${this.config.baseUrl}/${path}`, {
        method: 'GET', headers, signal: controller.signal, redirect: 'manual',
      });
      if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400))
        throw new GlpiUserAuthError('unavailable');
      if (path === 'initSession' && [400, 401].includes(response.status))
        throw new GlpiUserAuthError('invalid-credentials');
      if (!response.ok) throw new GlpiUserAuthError('unavailable');
      if (path === 'killSession') return undefined;
      return await response.json() as unknown;
    } catch (error) {
      if (error instanceof GlpiUserAuthError) throw error;
      throw new GlpiUserAuthError('unavailable');
    } finally {
      clearTimeout(timer);
    }
  }

  async authenticate(username: string, password: string): Promise<GlpiIdentity> {
    const hasForbiddenControl = (value: string) => value.includes('\r') || value.includes('\n') || value.includes('\0');
    if (!username || !password || hasForbiddenControl(username) || hasForbiddenControl(password))
      throw new GlpiUserAuthError('invalid-credentials');
    let authorization = `Basic ${bytesToBase64(new TextEncoder().encode(`${username}:${password}`))}`;
    let sessionToken: string | null = null;
    let identity: GlpiIdentity | null = null;
    let failure: unknown;
    try {
      const init = await this.get('initSession', undefined, authorization);
      authorization = '';
      if (!isObject(init) || typeof init.session_token !== 'string' || !/^[\x21-\x7E]+$/.test(init.session_token))
        throw new GlpiUserAuthError('identity');
      sessionToken = init.session_token;
      identity = parseGlpiIdentity(await this.get('getFullSession', sessionToken));
    } catch (error) {
      authorization = '';
      failure = error;
    }
    if (sessionToken) {
      try {
        await this.get('killSession', sessionToken);
      } catch {
        if (!failure) failure = new GlpiUserAuthError('session-cleanup');
      }
    }
    if (failure) throw failure;
    if (!identity) throw new GlpiUserAuthError('identity');
    return identity;
  }
}
