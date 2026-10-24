import type { GlpiIntegrationRepository } from '../../db/glpi-integration.ts';
import type { GlpiTicketService } from './glpi-ticket-service.ts';
import { GlpiError, glpiFailure } from './glpi-errors.ts';
import {
  IntegrationError,
  validOperationKey,
  validateIntegration,
  type IntegrationOperation,
  type IntegrationRequest,
} from './integration.ts';
import type { GlpiTicketDetails } from './types.ts';

type Remote = Pick<
  GlpiTicketService,
  'getTicket' | 'updateTicket' | 'solveTicket' | 'closeTicket' | 'findSolution'
>;
export class GlpiIntegrationWorkflow {
  readonly repo: GlpiIntegrationRepository;
  readonly remote: () => Remote;
  constructor(repo: GlpiIntegrationRepository, remote: () => Remote) {
    this.repo = repo;
    this.remote = remote;
  }
  async execute(ticketId: number, actorId: number, input: unknown) {
    const request = validateIntegration(input);
    const reserved = await this.repo.reserve(ticketId, actorId, request);
    if (!reserved.inserted)
      return { operation: reserved.operation, reused: true };
    return {
      operation: await this.run(reserved.operation, actorId, request),
      reused: false,
    };
  }
  private async run(
    operation: IntegrationOperation,
    actorId: number,
    request: IntegrationRequest,
  ) {
    let dispatched = false;
    let writeReturned = false;
    let observed: GlpiTicketDetails | undefined;
    let solutionId: number | null = null;
    try {
      const remote = this.remote();
      observed = await remote.getTicket(operation.remoteId);
      if (observed.status === undefined)
        throw new GlpiError('GLPI_INVALID_RESPONSE');
      if (request.action === 'associate') {
        const local = await this.repo.tickets.getByLocalId(operation.ticketId);
        const associated = await this.repo.tickets.getByGlpiId(
          operation.remoteId,
        );
        if (
          !local ||
          (associated && associated.id !== local.id) ||
          observed.title !== local.title ||
          observed.content !== local.content
        )
          throw new IntegrationError(
            'ASSOCIATION_MISMATCH',
            'O chamado remoto precisa corresponder exatamente ao título e conteúdo locais e estar livre de outro vínculo. Revise no GLPI.',
            409,
          );
        // Operator attestation is mandatory: identical content alone is not identity proof.
        return await this.repo.finish(
          operation,
          actorId,
          'confirmed',
          'ASSOCIATION_REVIEWED',
          observed,
        );
      }
      if (request.action === 'close' && observed.status !== 5)
        throw new IntegrationError(
          'NOT_SOLVED',
          'Solicitação de fechamento permitida somente após solução oficial (status 5).',
          409,
        );
      if (request.action === 'solution' && observed.status >= 5)
        throw new IntegrationError(
          'ALREADY_SOLVED',
          'O GLPI já apresenta solução ou fechamento. Sincronize e revise.',
          409,
        );
      if (request.action === 'update' && observed.status === 6)
        throw new IntegrationError(
          'ALREADY_CLOSED',
          'O GLPI já apresenta fechamento. Atualização não enviada.',
          409,
        );
      if (request.action === 'update') {
        const local = await this.repo.tickets.getByLocalId(operation.ticketId);
        if (
          local?.title !== observed.title ||
          local?.content !== observed.content
        )
          throw new IntegrationError(
            'REMOTE_CHANGED',
            'Os dados remotos mudaram. Sincronize e revise antes de substituir título e descrição.',
            409,
          );
      }
      if (request.action !== 'sync') {
        dispatched = true;
        if (request.action === 'update')
          await remote.updateTicket(operation.remoteId, {
            title: request.title!,
            content: request.content!,
          });
        else if (request.action === 'solution')
          solutionId = await remote.solveTicket(
            operation.remoteId,
            request.content!,
            operation.id,
          );
        else await remote.closeTicket(operation.remoteId);
        writeReturned = true;
        observed = await remote.getTicket(operation.remoteId);
        if (observed.status === undefined)
          throw new GlpiError('GLPI_INVALID_RESPONSE');
      }
      const confirmed =
        request.action === 'sync' ||
        (request.action === 'update' &&
          observed.title === request.title &&
          observed.content === request.content) ||
        (request.action === 'close' && observed.status === 6) ||
        (request.action === 'solution' && !!solutionId && observed.status >= 5);
      return await this.repo.finish(
        operation,
        actorId,
        confirmed ? 'confirmed' : 'uncertain',
        confirmed ? 'REMOTE_CONFIRMED' : 'RECONCILIATION_REQUIRED',
        observed,
        solutionId,
      );
    } catch (error) {
      // A known refusal is safe to report; ambiguous writes and persistence failures remain locked.
      const knownRefusal =
        !writeReturned &&
        error instanceof GlpiError &&
        [
          'GLPI_FORBIDDEN',
          'GLPI_TICKET_NOT_FOUND',
          'GLPI_SESSION_ERROR',
          'GLPI_AUTH_ERROR',
        ].includes(error.code);
      const uncertain = dispatched && !knownRefusal;
      const code =
        error instanceof IntegrationError
          ? error.code
          : glpiFailure(error).body.code;
      try {
        return await this.repo.finish(
          operation,
          actorId,
          uncertain ? 'uncertain' : 'failed',
          code,
          request.action === 'associate' || observed?.status === undefined
            ? undefined
            : observed,
          solutionId,
        );
      } catch {
        throw new IntegrationError(
          'RECONCILIATION_REQUIRED',
          'A operação ficou registrada; consulte e reconcilie. Nenhum reenvio será feito.',
          503,
        );
      }
    }
  }
  async reconcile(ticketId: number, actorId: number, key: string) {
    if (!validOperationKey(key))
      throw new IntegrationError('INVALID_KEY', 'Chave inválida.');
    const operation = await this.repo.get(key);
    if (!operation || operation.ticketId !== ticketId)
      throw new IntegrationError('NOT_FOUND', 'Operação não encontrada.', 404);
    await this.repo.actor(actorId, operation.action === 'associate');
    if (['confirmed', 'failed'].includes(operation.state))
      return { operation, reused: true };
    const request = JSON.parse(operation.requestJson) as IntegrationRequest;
    let observed: GlpiTicketDetails | undefined;
    let solutionId = operation.solutionId;
    let confirmed = false;
    let code = 'RECONCILIATION_REQUIRED';
    try {
      const remote = this.remote();
      observed = await remote.getTicket(operation.remoteId);
      if (observed.status === undefined)
        throw new GlpiError('GLPI_INVALID_RESPONSE');
      if (operation.action === 'solution')
        solutionId = await remote.findSolution(
          operation.remoteId,
          operation.id,
        );
      if (operation.action === 'associate') {
        const local = await this.repo.tickets.getByLocalId(ticketId);
        const associated = await this.repo.tickets.getByGlpiId(
          operation.remoteId,
        );
        confirmed =
          !!local &&
          (!associated || associated.id === ticketId) &&
          local.title === observed.title &&
          local.content === observed.content;
      } else
        confirmed =
          operation.action === 'sync' ||
          (operation.action === 'close' && observed.status === 6) ||
          (operation.action === 'solution' &&
            !!solutionId &&
            observed.status >= 5) ||
          (operation.action === 'update' &&
            observed.title === request.title &&
            observed.content === request.content);
      if (confirmed) code = 'RECONCILED_BY_READ';
    } catch (error) {
      code = glpiFailure(error).body.code;
      if (observed?.status === undefined) observed = undefined;
    }
    return {
      operation: await this.repo.finish(
        operation,
        actorId,
        confirmed ? 'confirmed' : 'uncertain',
        code,
        operation.action === 'associate' && !confirmed ? undefined : observed,
        solutionId,
      ),
      reused: false,
    };
  }
}
