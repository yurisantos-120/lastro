import 'server-only';
import { getGlpiService } from '../glpi/glpi-runtime.ts';
import { getTicketRepository } from '@/db/ticket-runtime';
import { TicketWorkflow } from './ticket-workflow.ts';

export function getTicketWorkflow() {
  return new TicketWorkflow(getTicketRepository(), getGlpiService());
}
