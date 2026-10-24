import {
  digest,
  HandoffError,
  operationKey,
  parseDelivery,
  redactText,
  safeSummary,
  shiftPeriod,
  suggestedPeriod,
} from '../services/handoffs/handoffs.ts';
import type {
  HandoffPreview,
  HandoffRecord,
  ShiftConfig,
  Shift,
  HandoffList,
  HandoffSummary,
} from '../services/handoffs/handoffs.ts';
import type { DashboardTicket } from '../services/tickets/dashboard.ts';

const source = `FROM tickets t JOIN ticket_operations o ON o.ticket_id=t.id LEFT JOIN information r ON r.id=o.route_id
  WHERE t.result_state='created' AND t.glpi_ticket_id>0 AND
    (o.state IN ('in_progress','pending') OR (o.state='normalized' AND COALESCE(t.status,0)<>6))`;
// Only revision metadata is used in the atomic compare; raw free text never goes into the guard.
const guardSql = `SELECT COALESCE(json_group_array(json_array(id,revision,operationRevision,routeRevision)), '[]') AS guard FROM
  (SELECT t.id,t.revision,o.revision AS operationRevision,COALESCE(r.revision,0) AS routeRevision ${source} ORDER BY t.id LIMIT 501)`;
const selectHandoff = `SELECT h.*, s.received_by, s.received_name, s.received_at FROM shift_handoffs h LEFT JOIN shift_receipts s ON s.handoff_id=h.id`;
interface Row {
  id: string;
  operation_key: string;
  request_hash: string;
  config_json: string;
  period_json: string;
  snapshot_json: string;
  notes: string;
  guidance: string;
  delivered_by: number;
  delivered_name: string;
  delivered_at: string;
  received_by: number | null;
  received_name: string | null;
  received_at: string | null;
}
function record(row: Row): HandoffRecord {
  return {
    id: row.id,
    config: JSON.parse(row.config_json),
    period: JSON.parse(row.period_json),
    items: JSON.parse(row.snapshot_json),
    notes: row.notes,
    guidance: row.guidance,
    deliveredBy: row.delivered_by,
    deliveredName: row.delivered_name,
    deliveredAt: row.delivered_at,
    receipt:
      row.received_by === null
        ? null
        : {
            receivedBy: row.received_by,
            receivedName: row.received_name!,
            receivedAt: row.received_at!,
          },
  };
}
export class HandoffRepository {
  private readonly db: D1Database;
  private readonly config: ShiftConfig;
  private readonly now: () => Date;
  constructor(
    db: D1Database,
    config: ShiftConfig,
    now: () => Date = () => new Date(),
  ) {
    this.db = db;
    this.config = config;
    this.now = now;
  }
  private async actor(id: number) {
    const actor = await this.db
      .prepare(
        "SELECT name FROM users WHERE id=? AND active=1 AND role IN ('operator','admin')",
      )
      .bind(id)
      .first<{ name: string }>();
    if (!actor)
      throw new HandoffError('FORBIDDEN', 'Operador não autorizado.', 403);
    return { id, name: redactText(actor.name) };
  }
  private async capture() {
    const result = await this.db.batch([
      this.db
        .prepare(`SELECT t.id,t.title,t.glpi_ticket_id AS glpiTicketId,t.result_state AS resultState,t.status AS glpiStatus,o.state,
        t.created_at AS openedAt,t.last_synced_at AS lastSyncedAt,o.updated_at AS updatedAt,o.occurrence_type AS occurrenceType,
        o.route_description AS routeDescription,r.title AS routeTitle,o.responsible_organization AS responsibleOrganization,
        o.pending_reason AS pendingReason,o.guidance,
        COALESCE((SELECT COALESCE(NULLIF(e.description,''),json_extract(e.snapshot_json,'$.notes')) FROM ticket_operation_events e
          WHERE e.ticket_id=t.id ORDER BY e.revision DESC LIMIT 1),o.notes,'') AS lastObservation ${source} ORDER BY t.id LIMIT 501`),
      this.db.prepare(guardSql),
    ]);
    if (result[0].results.length > 500)
      throw new HandoffError(
        'SUMMARY_TOO_LARGE',
        'O resumo excede 500 ocorrências; nenhuma passagem foi gravada.',
        413,
      );
    const items = safeSummary(
      result[0].results as unknown as DashboardTicket[],
    );
    if (
      new TextEncoder().encode(JSON.stringify(items)).byteLength >
      2 * 1024 * 1024
    )
      throw new HandoffError(
        'SUMMARY_TOO_LARGE',
        'Resumo excede o limite seguro; nenhuma passagem foi gravada.',
        413,
      );
    const guard = (result[1].results[0] as unknown as { guard: string }).guard;
    return { items, guard };
  }
  async preview(date?: string, shift?: Shift): Promise<HandoffPreview> {
    const now = this.now();
    const period =
      date && shift
        ? shiftPeriod(this.config, date, shift)
        : suggestedPeriod(this.config, now);
    if (period.startAt > now.toISOString())
      throw new HandoffError('FUTURE_SHIFT', 'O turno ainda não começou.');
    const { items, guard } = await this.capture();
    return {
      config: this.config,
      period,
      items,
      token: await digest(JSON.stringify([this.config, period, guard, items])),
      generatedAt: now.toISOString(),
    };
  }
  async get(id: string): Promise<HandoffRecord> {
    const row = await this.db
      .prepare(`${selectHandoff} WHERE h.id=?`)
      .bind(id)
      .first<Row>();
    if (!row)
      throw new HandoffError('NOT_FOUND', 'Passagem não encontrada.', 404);
    return record(row);
  }
  async list(page = 1): Promise<HandoffList> {
    const result = await this.db.batch([
      this.db.prepare('SELECT count(*) AS total FROM shift_handoffs'),
      this.db
        .prepare(`SELECT h.id,h.period_json,h.delivered_name,h.delivered_at,s.received_name,s.received_at
        FROM shift_handoffs h LEFT JOIN shift_receipts s ON s.handoff_id=h.id ORDER BY h.delivered_at DESC,h.id DESC LIMIT 20 OFFSET ?`)
        .bind((page - 1) * 20),
      this.db
        .prepare(`SELECT h.id,h.period_json,h.delivered_name,h.delivered_at FROM shift_handoffs h
        WHERE NOT EXISTS(SELECT 1 FROM shift_receipts s WHERE s.handoff_id=h.id) ORDER BY h.delivered_at DESC,h.id DESC LIMIT 1`),
    ]);
    const summary = (value: unknown): HandoffSummary => {
      const row = value as Record<string, unknown>;
      return {
        id: row.id as string,
        period: JSON.parse(row.period_json as string),
        deliveredName: row.delivered_name as string,
        deliveredAt: row.delivered_at as string,
        receivedName: (row.received_name as string | null) ?? null,
        receivedAt: (row.received_at as string | null) ?? null,
      };
    };
    return {
      page,
      total: (result[0].results[0] as unknown as { total: number }).total,
      items: result[1].results.map(summary),
      available: result[2].results[0] ? summary(result[2].results[0]) : null,
      config: this.config,
    };
  }
  async deliver(actorId: number, raw: unknown) {
    const input = parseDelivery(raw),
      actor = await this.actor(actorId);
    const requestHash = await digest(JSON.stringify(input));
    const duplicate = async () => {
      const row = await this.db
        .prepare(
          'SELECT id,delivered_by,request_hash FROM shift_handoffs WHERE operation_key=?',
        )
        .bind(input.operationKey)
        .first<{ id: string; delivered_by: number; request_hash: string }>();
      if (!row) return null;
      if (row.delivered_by !== actorId || row.request_hash !== requestHash)
        throw new HandoffError(
          'KEY_CONFLICT',
          'Chave já usada para outra entrega.',
          409,
        );
      return { handoff: await this.get(row.id), reused: true };
    };
    const existing = await duplicate();
    if (existing) return existing;
    const period = shiftPeriod(this.config, input.date, input.shift),
      now = this.now().toISOString();
    if (period.startAt > now)
      throw new HandoffError('FUTURE_SHIFT', 'O turno ainda não começou.');
    const { items, guard } = await this.capture();
    const token = await digest(
      JSON.stringify([this.config, period, guard, items]),
    );
    if (token !== input.previewToken)
      throw new HandoffError(
        'PREVIEW_CHANGED',
        'Os dados ou horários mudaram. Atualize e revise o resumo antes de confirmar.',
        409,
      );
    const snapshot = JSON.stringify(items);
    if (new TextEncoder().encode(snapshot).byteLength > 2 * 1024 * 1024)
      throw new HandoffError(
        'SUMMARY_TOO_LARGE',
        'Resumo excede o limite seguro; nenhuma entrega foi gravada.',
        413,
      );
    const id = crypto.randomUUID();
    try {
      const result = await this.db
        .prepare(`INSERT INTO shift_handoffs (id,operation_key,request_hash,period_key,config_json,period_json,snapshot_json,notes,guidance,delivered_by,delivered_name,delivered_at)
        SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE (${guardSql})=?
          AND EXISTS(SELECT 1 FROM users WHERE id=? AND active=1 AND role IN ('operator','admin'))
        ON CONFLICT DO NOTHING`)
        .bind(
          id,
          input.operationKey,
          requestHash,
          period.key,
          JSON.stringify(this.config),
          JSON.stringify(period),
          snapshot,
          input.notes,
          input.guidance,
          actorId,
          actor.name,
          now,
          guard,
          actorId,
        )
        .run();
      if (result.meta.changes !== 1) {
        const repeated = await duplicate();
        if (repeated) return repeated;
        throw new HandoffError(
          'DELIVERY_CONFLICT',
          'O resumo mudou ou o período já foi entregue. Recarregue antes de continuar.',
          409,
        );
      }
    } catch (error) {
      if (error instanceof HandoffError) throw error;
      const repeated = await duplicate();
      if (repeated) return repeated;
      throw error;
    }
    return { handoff: await this.get(id), reused: false };
  }
  async receive(id: string, actorId: number, key: unknown) {
    const operation = operationKey(key),
      actor = await this.actor(actorId);
    const existing = async () => {
      const row = await this.db
        .prepare(
          'SELECT handoff_id,received_by,operation_key FROM shift_receipts WHERE handoff_id=? OR operation_key=?',
        )
        .bind(id, operation)
        .first<{
          handoff_id: string;
          received_by: number;
          operation_key: string;
        }>();
      if (!row) return null;
      if (
        row.handoff_id !== id ||
        row.received_by !== actorId ||
        row.operation_key !== operation
      )
        throw new HandoffError(
          'RECEIPT_CONFLICT',
          'Recebimento já confirmado ou chave utilizada em outra operação.',
          409,
        );
      return { handoff: await this.get(id), reused: true };
    };
    const duplicate = await existing();
    if (duplicate) return duplicate;
    const handoff = await this.get(id);
    if (handoff.deliveredBy === actorId)
      throw new HandoffError(
        'SELF_RECEIPT',
        'O recebimento deve ser confirmado por outro operador.',
        409,
      );
    const result = await this.db
      .prepare(`INSERT INTO shift_receipts (handoff_id,operation_key,received_by,received_name,received_at)
      SELECT ?,?,?,?,? FROM shift_handoffs WHERE id=? AND delivered_by<>?
      AND EXISTS(SELECT 1 FROM users WHERE id=? AND active=1 AND role IN ('operator','admin')) ON CONFLICT DO NOTHING`)
      .bind(
        id,
        operation,
        actorId,
        actor.name,
        this.now().toISOString(),
        id,
        actorId,
        actorId,
      )
      .run();
    if (result.meta.changes !== 1) {
      const repeated = await existing();
      if (repeated) return repeated;
      throw new HandoffError(
        'RECEIPT_CONFLICT',
        'Recebimento não registrado. Atualize a passagem.',
        409,
      );
    }
    return { handoff: await this.get(id), reused: false };
  }
}
