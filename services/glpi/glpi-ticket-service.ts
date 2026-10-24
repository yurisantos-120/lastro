import type { GlpiClient } from './glpi-client.ts';
import type { GlpiTicket, GlpiTicketInput, GlpiTicketDetails } from './types.ts';
import { withGlpiSession } from './glpi-auth.ts';
import { GlpiError, isObject } from './glpi-errors.ts';
import { containsSensitiveText } from '../../lib/sensitive-text.ts';
import { validOperationKey } from './integration.ts';
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
  async updateTicket(id: number, input: { title: string; content: string }): Promise<void> {
    this.assertId(id);
    const ticket = validateTicket(input);
    if (containsSensitiveText(ticket.title) || containsSensitiveText(ticket.content)) throw new GlpiError('GLPI_VALIDATION_ERROR',400);
    return withGlpiSession(this.client, (session) => this.client.updateTicket(session, id, { name: ticket.title, content: ticket.content }));
  }
  async solveTicket(id: number, content: string, key: string): Promise<number> {
    this.assertId(id);
    if (typeof content !== 'string' || !content.trim() || content.length > 10000 || containsSensitiveText(content) || !validOperationKey(key))
      throw new GlpiError('GLPI_VALIDATION_ERROR',400);
    // Stable marker permits read-only reconciliation after an ambiguous POST.
    const escaped = content.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\n', '<br>');
    return withGlpiSession(this.client, (session) => this.client.addSolution(session, id, `<p>${escaped}</p><p>[LASTRO:${key}]</p>`));
  }
  async closeTicket(id: number): Promise<void> {
    this.assertId(id);
    return withGlpiSession(this.client, (session) => this.client.updateTicket(session, id, { status: 6 }));
  }
  async findSolution(id: number, key: string): Promise<number | null> {
    this.assertId(id);
    if (!validOperationKey(key)) throw new GlpiError('GLPI_VALIDATION_ERROR',400);
    return withGlpiSession(this.client, (session) => this.client.findSolution(session, id, `[LASTRO:${key}]`));
  }
  private assertId(id: number) {
    if (!Number.isSafeInteger(id) || id <= 0) throw new GlpiError('GLPI_VALIDATION_ERROR',400);
  }
}
