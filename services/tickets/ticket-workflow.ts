import { GlpiError, glpiFailure, isObject } from '../glpi/glpi-errors.ts';
import type { GlpiTicketService } from '../glpi/glpi-ticket-service.ts';
import { validateTicket } from '../glpi/glpi-ticket-service.ts';
import type { CreateTicketRequest, LocalTicket, TicketRepository } from './types.ts';

export class TicketNotFoundError extends Error {
  constructor() {
    super('Chamado nao encontrado no historico local.');
    this.name = 'TicketNotFoundError';
  }
}

export class TicketWorkflow {
  private readonly repository: TicketRepository;
  private readonly glpi: GlpiTicketService;

  constructor(repository: TicketRepository, glpi: GlpiTicketService) {
    this.repository = repository;
    this.glpi = glpi;
  }

  async create(input: unknown, createdBy: number | null = null) {
    if (
      !isObject(input) ||
      typeof input.operationKey !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.operationKey)
    ) {
      throw new GlpiError('GLPI_VALIDATION_ERROR', 400);
    }

    const ticketInput = validateTicket({ title: input.title, content: input.content });
    const request: CreateTicketRequest = { operationKey: input.operationKey, ...ticketInput, createdBy };
    const pending = await this.repository.createPending(request);

    if (!pending.inserted) {
      if (pending.ticket.resultState === 'created') {
        return { resultState: 'created' as const, ticket: pending.ticket, reused: true };
      }
      const resultState = pending.ticket.resultState;
      const code: string = resultState === 'uncertain'
        ? 'GLPI_TICKET_UNCERTAIN'
        : resultState === 'failed'
          ? pending.ticket.failureCode ?? 'GLPI_TICKET_CREATE_ERROR'
          : 'TICKET_OPERATION_PENDING';
      const message = resultState === 'uncertain'
        ? 'Nao foi possivel confirmar se o GLPI criou o chamado. Verifique antes de tentar novamente.'
        : resultState === 'pending'
          ? 'Esta solicitacao ja foi iniciada. Atualize o historico antes de tentar outra vez.'
          : 'A tentativa anterior falhou. Confira o motivo antes de iniciar uma nova solicitacao.';
      return { resultState, ticket: pending.ticket, reused: true, code, message };
    }

    try {
      const created = await this.glpi.createTicket(ticketInput);
      try {
        const saved = await this.repository.markCreated(pending.ticket.id, created);
        return { resultState: 'created' as const, ticket: saved, reused: false };
      } catch {
        let uncertain: LocalTicket | null = null;
        try {
          uncertain = await this.repository.markUncertain(
            pending.ticket.id,
            'TICKET_STORAGE_ERROR',
            created.id,
          );
        } catch {
          // The pending row remains a durable warning; never repeat the GLPI POST.
        }
        return {
          resultState: 'uncertain' as const,
          ticket: uncertain ?? { ...pending.ticket, resultState: 'uncertain', glpiTicketId: created.id },
          reused: false,
          code: 'GLPI_TICKET_UNCERTAIN',
          message: 'Nao foi possivel confirmar se o GLPI criou o chamado. Verifique antes de tentar novamente.',
        };
      }
    } catch (error) {
      const failure = glpiFailure(error).body;
      const uncertain = failure.code === 'GLPI_TICKET_UNCERTAIN';
      if (uncertain) {
        let saved: LocalTicket | null = null;
        try {
          saved = await this.repository.markUncertain(pending.ticket.id, failure.code);
        } catch {
          // The operation key still prevents another POST while this row is pending.
        }
        return {
          resultState: 'uncertain' as const,
          ticket: saved ?? { ...pending.ticket, resultState: 'uncertain', failureCode: failure.code },
          reused: false,
          code: failure.code,
          message: failure.message,
        };
      }
      await this.repository.markFailed(pending.ticket.id, failure.code);
      return {
        resultState: 'failed' as const,
        ticket: { ...pending.ticket, resultState: 'failed', failureCode: failure.code },
        reused: false,
        code: failure.code,
        message: failure.message,
      };
    }
  }

  async list() {
    return this.repository.list();
  }

  async detail(glpiId: number): Promise<{
    ticket: LocalTicket;
    sync: { success: true } | { success: false; code: string; message: string };
  }> {
    const local = await this.repository.getByGlpiId(glpiId);
    if (!local) throw new TicketNotFoundError();
    try {
      const remote = await this.glpi.getTicket(glpiId);
      const updated = await this.repository.syncFromGlpi(remote);
      return { ticket: updated ?? local, sync: { success: true } };
    } catch (error) {
      const failure = glpiFailure(error).body;
      return { ticket: local, sync: { success: false, code: failure.code, message: failure.message } };
    }
  }
}
