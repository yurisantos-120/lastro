import { env } from 'cloudflare:workers';
import { TicketStorageError, D1TicketRepository } from './ticket-storage.ts';

export function getTicketRepository(): D1TicketRepository {
  if (!env.DB) throw new TicketStorageError();
  return new D1TicketRepository(env.DB);
}
