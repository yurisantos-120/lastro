import { TicketOperationError, parseOperationalUpdate } from '../services/tickets/operations.ts';
import type { OperationalDetail, TicketOperation, TicketOperationEvent, OperationalUpdate } from '../services/tickets/operations.ts';

const columns = `ticket_id AS ticketId, occurrence_type AS occurrenceType, route_description AS routeDescription,
  route_id AS routeId, responsible_organization AS responsibleOrganization, state, pending_reason AS pendingReason,
  notes, guidance, opened_at AS openedAt, updated_at AS updatedAt, normalized_at AS normalizedAt,
  closed_at AS closedAt, updated_by AS updatedBy, revision`;

interface TicketRow { createdAt: string; resultState: string; glpiTicketId: number | null; status: number | null; lastSyncedAt: string | null }
interface StoredEvent extends Omit<TicketOperationEvent, 'snapshot'> { snapshotJson: string; requestJson: string }

export class TicketOperationsRepository {
  private readonly db: D1Database;
  private readonly now: () => Date;
  constructor(db: D1Database, now: () => Date = () => new Date()) { this.db = db; this.now = now; }

  private async ticket(id: number) {
    const ticket = await this.db.prepare(`SELECT created_at AS createdAt, result_state AS resultState,
      glpi_ticket_id AS glpiTicketId, status, last_synced_at AS lastSyncedAt FROM tickets WHERE id = ?`).bind(id).first<TicketRow>();
    if (!ticket) throw new TicketOperationError('TICKET_NOT_FOUND', 'Chamado não encontrado.', 404);
    return ticket;
  }

  async read(ticketId: number): Promise<OperationalDetail> {
    await this.ticket(ticketId);
    // One D1 batch provides a consistent snapshot of the summary and its history.
    const result = await this.db.batch([
      this.db.prepare(`SELECT ${columns} FROM ticket_operations WHERE ticket_id = ?`).bind(ticketId),
      this.db.prepare(`SELECT id, ticket_id AS ticketId, actor_id AS actorId, actor_name AS actorName,
        occurred_at AS occurredAt, type, previous_state AS previousState, next_state AS nextState,
        description, snapshot_json AS snapshotJson FROM ticket_operation_events WHERE ticket_id = ? ORDER BY revision ASC, id ASC`).bind(ticketId),
    ]);
    return {
      operation: result[0].results[0] ? { ...result[0].results[0] } as unknown as TicketOperation : null,
      events: (result[1].results as unknown as StoredEvent[]).map(({ snapshotJson, ...event }) => ({ ...event, snapshot: JSON.parse(snapshotJson) as TicketOperation })),
    };
  }

  private async duplicate(ticketId: number, actorId: number, input: OperationalUpdate) {
    const event = await this.db.prepare(`SELECT ticket_id AS ticketId, actor_id AS actorId, request_json AS requestJson
      FROM ticket_operation_events WHERE operation_key = ?`).bind(input.operationKey).first<StoredEvent>();
    if (!event) return false;
    if (event.ticketId !== ticketId || event.actorId !== actorId || event.requestJson !== JSON.stringify(input)) {
      throw new TicketOperationError('OPERATION_KEY_CONFLICT', 'Identificador já utilizado para outra movimentação.', 409);
    }
    return true;
  }

  async save(ticketId: number, actorId: number, raw: unknown): Promise<OperationalDetail & { reused: boolean }> {
    const input = parseOperationalUpdate(raw);
    const actor = await this.db.prepare(`SELECT name FROM users WHERE id = ? AND active = 1 AND role IN ('operator', 'admin')`).bind(actorId).first<{ name: string }>();
    if (!actor) throw new TicketOperationError('AUTH_FORBIDDEN', 'Operador não autorizado.', 403);
    if (await this.duplicate(ticketId, actorId, input)) return { ...await this.read(ticketId), reused: true };
    const ticket = await this.ticket(ticketId);
    if (ticket.resultState !== 'created' || !ticket.glpiTicketId || ticket.glpiTicketId <= 0) {
      throw new TicketOperationError('GLPI_OPEN_UNCONFIRMED', 'A abertura ainda não foi confirmada pelo GLPI.', 409);
    }
    if (input.state === 'closed' && (ticket.status !== 6 || !ticket.lastSyncedAt)) {
      throw new TicketOperationError('GLPI_CLOSE_UNCONFIRMED', 'Consulte o GLPI: o fechamento oficial ainda não foi confirmado.', 409);
    }
    if (input.routeId !== null && !await this.db.prepare(`SELECT id FROM information WHERE id = ? AND kind = 'general'`).bind(input.routeId).first()) {
      throw new TicketOperationError('INVALID_ROUTE', 'Selecione um cadastro de rota válido ou mantenha apenas a descrição livre.');
    }
    const previous = (await this.read(ticketId)).operation;
    if ((previous?.revision ?? 0) !== input.expectedRevision) throw this.conflict();
    const now = this.now().toISOString();
    const snapshot: TicketOperation = {
      occurrenceType: input.occurrenceType, routeDescription: input.routeDescription, routeId: input.routeId,
      responsibleOrganization: input.responsibleOrganization, state: input.state, pendingReason: input.pendingReason,
      notes: input.notes, guidance: input.guidance, ticketId, revision: input.expectedRevision + 1,
      openedAt: previous?.openedAt ?? ticket.createdAt, updatedAt: now, updatedBy: actorId,
      normalizedAt: input.state === 'normalized' ? (previous?.state === 'normalized' ? previous.normalizedAt : now)
        : input.state === 'closed' ? previous?.normalizedAt ?? null : null,
      closedAt: input.state === 'closed' ? previous?.closedAt ?? now : null,
    };
    // Recheck mutable prerequisites in the conditional write, not only in the preceding reads.
    const eligible = `EXISTS (SELECT 1 FROM tickets WHERE id = ? AND result_state = 'created' AND glpi_ticket_id > 0
      AND (? <> 'closed' OR (status = 6 AND last_synced_at IS NOT NULL)))
      AND EXISTS (SELECT 1 FROM users WHERE id = ? AND active = 1 AND role IN ('operator', 'admin'))
      AND (? IS NULL OR EXISTS (SELECT 1 FROM information WHERE id = ? AND kind = 'general'))`;
    const prerequisites = [ticketId, input.state, actorId, input.routeId, input.routeId];
    const fields = [snapshot.occurrenceType, snapshot.routeDescription, snapshot.routeId, snapshot.responsibleOrganization,
      snapshot.state, snapshot.pendingReason, snapshot.notes, snapshot.guidance, snapshot.openedAt,
      snapshot.updatedAt, snapshot.normalizedAt, snapshot.closedAt, actorId, snapshot.revision];
    const write = previous
      ? this.db.prepare(`UPDATE ticket_operations SET occurrence_type = ?, route_description = ?, route_id = ?,
          responsible_organization = ?, state = ?, pending_reason = ?, notes = ?, guidance = ?, opened_at = ?,
          updated_at = ?, normalized_at = ?, closed_at = ?, updated_by = ?, revision = ?
          WHERE ticket_id = ? AND revision = ? AND ${eligible}`).bind(...fields, ticketId, input.expectedRevision, ...prerequisites)
      : this.db.prepare(`INSERT INTO ticket_operations (ticket_id, occurrence_type, route_description, route_id,
          responsible_organization, state, pending_reason, notes, guidance, opened_at, updated_at, normalized_at,
          closed_at, updated_by, revision) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${eligible}
          ON CONFLICT(ticket_id) DO NOTHING`).bind(ticketId, ...fields, ...prerequisites);
    const type = !previous ? 'initialized' : previous.state !== input.state ? 'state_changed' : 'updated';
    try {
      const result = await this.db.batch([
        write,
        this.db.prepare(`INSERT INTO ticket_operation_events (ticket_id, operation_key, request_json, actor_id, actor_name,
          occurred_at, type, previous_state, next_state, description, snapshot_json, revision)
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1`)
          .bind(ticketId, input.operationKey, JSON.stringify(input), actorId, actor.name, now, type,
            previous?.state ?? null, input.state, input.description, JSON.stringify(snapshot), snapshot.revision),
      ]);
      if (result[0].meta.changes !== 1) {
        if (await this.duplicate(ticketId, actorId, input)) return { ...await this.read(ticketId), reused: true };
        throw this.conflict();
      }
    } catch (error) {
      // D1 batch rolls back both the summary and event if either statement fails.
      if (error instanceof TicketOperationError) throw error;
      if (await this.duplicate(ticketId, actorId, input)) return { ...await this.read(ticketId), reused: true };
      throw error;
    }
    return { ...await this.read(ticketId), reused: false };
  }

  private conflict() { return new TicketOperationError('REVISION_CONFLICT', 'Os dados ou permissões mudaram. Recarregue antes de salvar.', 409); }
}
