import 'server-only';
import { env } from 'cloudflare:workers';
import { readGlpiConfig } from './glpi-config.ts';
import { GlpiClient } from './glpi-client.ts';
import { GlpiTicketService } from './glpi-ticket-service.ts';
export function getGlpiService(): GlpiTicketService {
  return new GlpiTicketService(new GlpiClient(readGlpiConfig(env)));
}
