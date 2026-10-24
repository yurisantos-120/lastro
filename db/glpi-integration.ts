import { D1TicketRepository } from './ticket-storage.ts';
import {
  IntegrationError,
  type IntegrationOperation,
  type IntegrationRequest,
  type IntegrationState,
} from '../services/glpi/integration.ts';
import type { GlpiTicketDetails } from '../services/glpi/types.ts';

const columns = `id, ticket_id AS ticketId, action, request_json AS requestJson, actor_id AS actorId,
  updated_by AS updatedBy, state, code, remote_id AS remoteId, solution_id AS solutionId,
  observation_json AS observationJson, created_at AS createdAt, updated_at AS updatedAt, revision`;
export class GlpiIntegrationRepository {
  readonly tickets: D1TicketRepository;
  readonly db: D1Database;
  constructor(db: D1Database) {
    this.db = db;
    this.tickets = new D1TicketRepository(db);
  }
  async actor(id: number, admin = false) {
    const user = await this.db
      .prepare(
        `SELECT id FROM users WHERE id=? AND active=1 AND role IN (${admin ? "'admin'" : "'admin','operator'"})`,
      )
      .bind(id)
      .first();
    if (!user)
      throw new IntegrationError('FORBIDDEN', 'Operador não autorizado.', 403);
  }
  async get(id: string) {
    return this.db
      .prepare(`SELECT ${columns} FROM glpi_operations WHERE id=?`)
      .bind(id)
      .first<IntegrationOperation>();
  }
  async read(ticketId: number, page = 1) {
    const ticket = await this.tickets.getByLocalId(ticketId);
    if (!ticket)
      throw new IntegrationError(
        'NOT_FOUND',
        'Chamado local não encontrado.',
        404,
      );
    const operations = (
      await this.db
        .prepare(
          `SELECT ${columns} FROM glpi_operations WHERE ticket_id=? ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET ?`,
        )
        .bind(ticketId, (page - 1) * 20)
        .all<IntegrationOperation>()
    ).results;
    const events = (
      await this.db
        .prepare(
          `SELECT e.id,e.operation_id AS operationId,e.actor_id AS actorId,u.name AS actorName,e.recorded_at AS recordedAt,e.revision,e.snapshot_json AS snapshotJson FROM glpi_operation_events e JOIN users u ON u.id=e.actor_id WHERE e.operation_id IN (SELECT id FROM glpi_operations WHERE ticket_id=?) ORDER BY e.id DESC LIMIT 50 OFFSET ?`,
        )
        .bind(ticketId, (page - 1) * 50)
        .all()
    ).results;
    const active = await this.db
      .prepare(
        `SELECT ${columns} FROM glpi_operations WHERE ticket_id=? AND state IN ('pending','uncertain')`,
      )
      .bind(ticketId)
      .first<IntegrationOperation>();
    const operational = await this.db
      .prepare('SELECT state FROM ticket_operations WHERE ticket_id=?')
      .bind(ticketId)
      .first<{ state: string }>();
    const divergence =
      (ticket.status === 6 && operational && operational.state !== 'closed') ||
      (operational?.state === 'closed' && ticket.status !== 6)
        ? 'O estado operacional e o status oficial GLPI divergem. Revisão manual necessária.'
        : null;
    return { ticket, operations, events, active, divergence, page };
  }
  async reserve(
    ticketId: number,
    actorId: number,
    request: IntegrationRequest,
  ) {
    await this.actor(actorId, request.action === 'associate');
    const existing = await this.get(request.operationKey);
    const requestJson = JSON.stringify(request);
    if (existing) {
      if (
        existing.ticketId !== ticketId ||
        existing.actorId !== actorId ||
        existing.requestJson !== requestJson
      )
        throw new IntegrationError(
          'KEY_CONFLICT',
          'Chave já utilizada para outra intenção.',
          409,
        );
      return { operation: existing, inserted: false };
    }
    const ticket = await this.tickets.getByLocalId(ticketId);
    if (!ticket)
      throw new IntegrationError('NOT_FOUND', 'Chamado não encontrado.', 404);
    if (request.action === 'associate') {
      if (
        !['pending', 'uncertain'].includes(ticket.resultState) ||
        (ticket.glpiTicketId && ticket.glpiTicketId !== request.candidateId) ||
        (ticket.resultState === 'pending' &&
          Date.now() - Date.parse(ticket.updatedAt) < 120000)
      )
        throw new IntegrationError(
          'ASSOCIATION_BLOCKED',
          'A abertura precisa estar incerta ou pendente há pelo menos dois minutos. Confira o ID conhecido.',
          409,
        );
    } else if (ticket.resultState !== 'created' || !ticket.glpiTicketId)
      throw new IntegrationError(
        'UNCONFIRMED_CREATION',
        'A abertura ainda não está confirmada.',
        409,
      );
    if (ticket.revision !== request.expectedRevision)
      throw new IntegrationError(
        'REVISION_CONFLICT',
        'Recarregue o chamado antes de enviar.',
        409,
      );
    const now = new Date().toISOString();
    let result;
    try {
      result = await this.db
        .prepare(`INSERT INTO glpi_operations
        (id,ticket_id,action,request_json,actor_id,updated_by,state,remote_id,created_at,updated_at)
        SELECT ?,?,?,?,?,?,'pending',?,?,? FROM tickets WHERE id=? AND revision=?
        ON CONFLICT DO NOTHING`)
        .bind(
          request.operationKey,
          ticketId,
          request.action,
          requestJson,
          actorId,
          actorId,
          request.candidateId ?? ticket.glpiTicketId,
          now,
          now,
          ticketId,
          request.expectedRevision,
        )
        .run();
    } catch {
      throw new IntegrationError(
        'INTEGRATION_UNAVAILABLE',
        'Não foi possível registrar a operação. Nenhum envio foi iniciado.',
        503,
      );
    }
    // D1 counts history-trigger writes too; zero alone means the CAS did not write.
    if (result.meta.changes === 0) {
      const raced = await this.get(request.operationKey);
      if (
        raced &&
        raced.ticketId === ticketId &&
        raced.actorId === actorId &&
        raced.requestJson === requestJson
      )
        return { operation: raced, inserted: false };
      throw new IntegrationError(
        'INTEGRATION_BUSY',
        'Existe operação pendente de reconciliação ou alteração concorrente. Consulte o histórico.',
        409,
      );
    }
    return {
      operation: (await this.get(request.operationKey))!,
      inserted: true,
    };
  }
  async finish(
    operation: IntegrationOperation,
    actorId: number,
    state: IntegrationState,
    code: string,
    remote?: GlpiTicketDetails,
    solutionId?: number | null,
  ) {
    await this.actor(actorId, operation.action === 'associate');
    const now = new Date().toISOString();
    // CAS and event trigger share the transaction with the confirmed cache update.
    // Store only remote metadata; credential-bearing text is never copied into events.
    const observation = JSON.stringify({
      remoteStatus: remote?.status ?? null,
      previousState: operation.state,
      solutionId: solutionId ?? operation.solutionId,
    });
    const statements = [
      this.db
        .prepare(`UPDATE glpi_operations SET state=?,code=?,updated_by=?,updated_at=?,revision=revision+1,observation_json=?,solution_id=COALESCE(?,solution_id)
      WHERE id=? AND revision=? AND state IN ('pending','uncertain')`)
        .bind(
          state,
          code,
          actorId,
          now,
          observation,
          solutionId ?? null,
          operation.id,
          operation.revision,
        ),
    ];
    if (remote)
      statements.push(
        this.db
          .prepare(`UPDATE tickets SET glpi_ticket_id=?,title=?,content=?,status=?,glpi_created_at=COALESCE(?,glpi_created_at),
      result_state=CASE WHEN ?='associate' AND ?='confirmed' THEN 'created' ELSE result_state END,
      failure_code=CASE WHEN ?='associate' AND ?='confirmed' THEN NULL ELSE failure_code END,
      last_synced_at=?,updated_at=?,revision=revision+1 WHERE id=?
      AND changes()=1 AND EXISTS(SELECT 1 FROM glpi_operations WHERE id=? AND revision=? AND updated_at=? AND updated_by=?)`)
          .bind(
            remote.id,
            remote.title,
            remote.content,
            remote.status ?? null,
            remote.createdAt ?? null,
            operation.action,
            state,
            operation.action,
            state,
            now,
            now,
            operation.ticketId,
            operation.id,
            operation.revision + 1,
            now,
            actorId,
          ),
      );
    const results = await this.db.batch(statements);
    if (results[0].meta.changes === 0)
      throw new IntegrationError(
        'OPERATION_CONFLICT',
        'A operação foi atualizada. Consulte o histórico.',
        409,
      );
    return (await this.get(operation.id))!;
  }
}
