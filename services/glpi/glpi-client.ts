import type { GlpiConfig, GlpiTicket, GlpiTicketInput, GlpiTicketDetails } from './types.ts';
import { GlpiError, isObject } from './glpi-errors.ts';
export class GlpiClient {
  private readonly config: GlpiConfig;
  private readonly http: typeof fetch;
  constructor(config: GlpiConfig, http: typeof fetch = fetch) {
    this.config = config;
    this.http = http;
  }
  private async request(
    path: string,
    method: 'GET' | 'POST',
    session?: string,
    body?: unknown,
  ): Promise<unknown> {
    const ticketPost = method === 'POST' && path === 'Ticket';
    const timeoutMs = ticketPost
      ? this.config.ticketCreateTimeoutMs
      : this.config.timeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      };
      if (this.config.appToken) headers['App-Token'] = this.config.appToken;
      if (session) headers['Session-Token'] = session;
      else headers.Authorization = `user_token ${this.config.userToken}`;
      const response = await this.http(`${this.config.baseUrl}/${path}`, {
        method,
        headers,
        signal: controller.signal,
        // Workerd rejects `redirect: 'error'`; `manual` prevents following redirects in both runtimes.
        redirect: 'manual',
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (
        response.type === 'opaqueredirect' ||
        (response.status >= 300 && response.status < 400)
      ) {
        throw new GlpiError('GLPI_CONNECTION_ERROR');
      }
      if (!response.ok) {
        let errorBody: unknown;
        try { errorBody = await response.json(); } catch {
          if (controller.signal.aborted)
            throw new GlpiError(ticketPost ? 'GLPI_TICKET_UNCERTAIN' : 'GLPI_TIMEOUT', ticketPost ? 503 : 504);
          // Never expose upstream text.
        }
        const upstreamCode = Array.isArray(errorBody) ? errorBody[0] : undefined;
        if (upstreamCode === 'ERROR_SESSION_TOKEN_INVALID' || upstreamCode === 'ERROR_SESSION_TOKEN_MISSING') {
          throw new GlpiError('GLPI_SESSION_ERROR', 401);
        }
        if (upstreamCode === 'ERROR_ITEM_NOT_FOUND' && path.startsWith('Ticket/')) {
          throw new GlpiError('GLPI_TICKET_NOT_FOUND', 404);
        }
      }
      if (response.status === 401) throw new GlpiError(session ? 'GLPI_SESSION_ERROR' : 'GLPI_AUTH_ERROR', 401);
      if (response.status === 403) throw new GlpiError('GLPI_FORBIDDEN', 403);
      if (response.status === 404) throw new GlpiError(path.startsWith('Ticket/') ? 'GLPI_TICKET_NOT_FOUND' : 'GLPI_NOT_FOUND', path.startsWith('Ticket/') ? 404 : 502);
      if (!response.ok) {
        if (ticketPost && response.status >= 500)
          throw new GlpiError('GLPI_TICKET_UNCERTAIN', 503);
        if (path === 'initSession' && response.status === 400)
          throw new GlpiError('GLPI_AUTH_ERROR', 401);
        throw new GlpiError(
          ticketPost
            ? 'GLPI_TICKET_CREATE_ERROR'
            : 'GLPI_CONNECTION_ERROR',
        );
      }
      if (path === 'killSession') return undefined;
      try {
        return (await response.json()) as unknown;
      } catch {
        if (ticketPost)
          throw new GlpiError('GLPI_TICKET_UNCERTAIN', 503);
        throw new GlpiError(
          controller.signal.aborted ? 'GLPI_TIMEOUT' : 'GLPI_INVALID_RESPONSE',
          controller.signal.aborted ? 504 : 502,
        );
      }
    } catch (error) {
      if (error instanceof GlpiError) throw error;
      if (controller.signal.aborted)
        throw new GlpiError(ticketPost ? 'GLPI_TICKET_UNCERTAIN' : 'GLPI_TIMEOUT', ticketPost ? 503 : 504);
      throw new GlpiError(
        ticketPost
          ? 'GLPI_TICKET_UNCERTAIN'
          : method === 'POST'
          ? 'GLPI_TICKET_CREATE_ERROR'
          : 'GLPI_CONNECTION_ERROR',
      );
    } finally {
      clearTimeout(timer);
    }
  }
  async initSession(): Promise<string> {
    const data = await this.request('initSession', 'GET');
    if (
      !isObject(data) ||
      typeof data.session_token !== 'string' ||
      !/^[\x21-\x7E]+$/.test(data.session_token)
    )
      throw new GlpiError('GLPI_INVALID_RESPONSE');
    return data.session_token;
  }
  async killSession(session: string): Promise<void> {
    await this.request('killSession', 'GET', session);
  }
  async checkAuthenticatedSession(session: string): Promise<void> {
    const data = await this.request('getActiveProfile', 'GET', session);
    if (!isObject(data)) throw new GlpiError('GLPI_INVALID_RESPONSE');
  }
  async getTicket(session: string, id: number): Promise<GlpiTicketDetails> {
    if (!Number.isSafeInteger(id) || id <= 0) throw new GlpiError('GLPI_TICKET_NOT_FOUND', 400);
    const data = await this.request(`Ticket/${id}`, 'GET', session);
    if (!isObject(data) || (typeof data.id !== 'number' && typeof data.id !== 'string') || Number(data.id) !== id || typeof data.name !== 'string' || typeof data.content !== 'string') {
      throw new GlpiError('GLPI_INVALID_RESPONSE');
    }
    const ticket: GlpiTicketDetails = { id, title: data.name, content: data.content };
    if (typeof data.status === 'number' && Number.isInteger(data.status)) ticket.status = data.status;
    else if (typeof data.status === 'string' && /^\d+$/.test(data.status)) ticket.status = Number(data.status);
    if (typeof data.date_creation === 'string') ticket.createdAt = data.date_creation;
    else if (typeof data.date === 'string') ticket.createdAt = data.date;
    return ticket;
  }
  async createTicket(
    session: string,
    ticket: GlpiTicketInput,
  ): Promise<GlpiTicket> {
    const data = await this.request('Ticket', 'POST', session, {
      input: { name: ticket.title, content: ticket.content },
    });
    const rawId = isObject(data) ? data.id : undefined;
    const id =
      typeof rawId === 'number'
        ? rawId
        : typeof rawId === 'string' && /^\d+$/.test(rawId)
          ? Number(rawId)
          : NaN;
    if (!Number.isSafeInteger(id) || id <= 0)
      throw new GlpiError('GLPI_TICKET_UNCERTAIN', 503);
    return { id };
  }
}
