import type { GlpiClient } from './glpi-client.ts';
import type { GlpiTicket, GlpiTicketInput, GlpiTicketDetails } from './types.ts';
import { withGlpiSession } from './glpi-auth.ts';
import { GlpiError, isObject } from './glpi-errors.ts';
export function validateTicket(input: unknown): GlpiTicketInput {
  if (
    !isObject(input) ||
    Object.keys(input).some((key) => key !== 'title' && key !== 'content')
  )
    throw new GlpiError('GLPI_VALIDATION_ERROR', 400);
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const content = typeof input.content === 'string' ? input.content.trim() : '';
  if (!title || title.length > 255 || !content || content.length > 10000)
    throw new GlpiError('GLPI_VALIDATION_ERROR', 400);
  return { title, content };
}
export class GlpiTicketService {
  private readonly client: GlpiClient;
  constructor(client: GlpiClient) {
    this.client = client;
  }
  async testConnection(): Promise<void> {
    await withGlpiSession(this.client, (session) =>
      this.client.checkAuthenticatedSession(session),
    );
  }
  async createTicket(input: unknown): Promise<GlpiTicket> {
    const ticket = validateTicket(input);
    return withGlpiSession(this.client, (session) =>
      this.client.createTicket(session, ticket),
    );
  }
  async getTicket(id: number): Promise<GlpiTicketDetails> {
    if (!Number.isSafeInteger(id) || id <= 0) throw new GlpiError('GLPI_TICKET_NOT_FOUND', 400);
    return withGlpiSession(this.client, (session) => this.client.getTicket(session, id));
  }
}
