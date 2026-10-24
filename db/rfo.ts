import { RfoError, editableRfo, parseRfo } from '../services/rfo/rfo.ts';
import type { RfoDetail, RfoRecord, RfoRevision } from '../services/rfo/rfo.ts';
import { containsSensitiveText } from '../lib/sensitive-text.ts';

const columns = `ticket_id AS ticketId,glpi_ticket_id AS glpiTicketId,investigation,completion,cause,
  technical_description AS technicalDescription,solution,responsible_team AS responsibleTeam,notes,
  normalized_at AS normalizedAt,created_at AS createdAt,updated_at AS updatedAt,completed_at AS completedAt,updated_by AS updatedBy,revision`;
interface Context {
  glpiTicketId: number | null;
  resultState: string;
  normalizedAt: string | null;
  operationRevision: number;
}
async function hash(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
}
export class RfoRepository {
  private readonly db: D1Database;
  private readonly now: () => Date;
  constructor(db: D1Database, now: () => Date = () => new Date()) {
    this.db = db;
    this.now = now;
  }
  private async context(ticketId: number) {
    const row = await this.db
      .prepare(`SELECT t.glpi_ticket_id AS glpiTicketId,t.result_state AS resultState,o.normalized_at AS normalizedAt,COALESCE(o.revision,0) AS operationRevision
      FROM tickets t LEFT JOIN ticket_operations o ON o.ticket_id=t.id WHERE t.id=?`)
      .bind(ticketId)
      .first<Context>();
    if (!row)
      throw new RfoError(
        'TICKET_NOT_FOUND',
        'Chamado local não encontrado.',
        404,
      );
    return row;
  }
  private normalization(value: string | null): string | null {
    const millis = value ? Date.parse(value) : NaN;
    return Number.isFinite(millis) && millis <= this.now().getTime()
      ? new Date(millis).toISOString()
      : null;
  }
  async read(ticketId: number, page = 1): Promise<RfoDetail> {
    const context = await this.context(ticketId);
    const result = await this.db.batch([
      this.db
        .prepare(`SELECT ${columns} FROM ticket_rfos WHERE ticket_id=?`)
        .bind(ticketId),
      this.db
        .prepare(
          `SELECT id,actor_id AS actorId,actor_name AS actorName,recorded_at AS recordedAt,revision,snapshot_json AS snapshotJson FROM ticket_rfo_revisions WHERE ticket_id=? ORDER BY revision DESC LIMIT 20 OFFSET ?`,
        )
        .bind(ticketId, (page - 1) * 20),
      this.db
        .prepare(
          'SELECT count(*) AS total FROM ticket_rfo_revisions WHERE ticket_id=?',
        )
        .bind(ticketId),
    ]);
    const rfo = result[0].results[0]
      ? ({ ...result[0].results[0] } as unknown as RfoRecord)
      : null;
    const revisions = (
      result[1].results as unknown as (Omit<RfoRevision, 'snapshot'> & {
        snapshotJson: string;
      })[]
    ).map(({ snapshotJson, ...row }) => ({
      ...row,
      snapshot: JSON.parse(snapshotJson) as RfoRecord,
    }));
    return {
      rfo,
      normalizationAvailable:
        this.normalization(context.normalizedAt) ??
        this.normalization(rfo?.normalizedAt ?? null),
      revisions,
      page,
      total: (result[2].results[0] as unknown as { total: number }).total,
    };
  }
  async save(
    ticketId: number,
    actorId: number,
    raw: unknown,
  ): Promise<RfoDetail & { reused: boolean }> {
    const input = parseRfo(raw),
      requestHash = await hash(JSON.stringify(input));
    const actor = await this.db
      .prepare(
        "SELECT name FROM users WHERE id=? AND active=1 AND role IN ('operator','admin')",
      )
      .bind(actorId)
      .first<{ name: string }>();
    if (!actor)
      throw new RfoError('FORBIDDEN', 'Operador não autorizado.', 403);
    const duplicate = async () => {
      const row = await this.db
        .prepare(
          'SELECT ticket_id AS ticketId,actor_id AS actorId,request_hash AS requestHash FROM ticket_rfo_revisions WHERE operation_key=?',
        )
        .bind(input.operationKey)
        .first<{ ticketId: number; actorId: number; requestHash: string }>();
      if (!row) return null;
      if (
        row.ticketId !== ticketId ||
        row.actorId !== actorId ||
        row.requestHash !== requestHash
      )
        throw new RfoError(
          'KEY_CONFLICT',
          'Chave já utilizada para outra revisão de RFO.',
          409,
        );
      return { ...(await this.read(ticketId)), reused: true };
    };
    const repeated = await duplicate();
    if (repeated) return repeated;
    const context = await this.context(ticketId);
    if (
      context.resultState !== 'created' ||
      !context.glpiTicketId ||
      context.glpiTicketId <= 0
    )
      throw new RfoError(
        'OPEN_UNCONFIRMED',
        'A abertura do chamado ainda não foi confirmada pelo GLPI.',
        409,
      );
    const detail = await this.read(ticketId),
      previous = detail.rfo;
    if ((previous?.revision ?? 0) !== input.expectedRevision)
      throw this.conflict();
    const normalizedAt =
      this.normalization(context.normalizedAt) ??
      this.normalization(previous?.normalizedAt ?? null);
    if (input.completion === 'completed' && !normalizedAt)
      throw new RfoError(
        'NORMALIZATION_REQUIRED',
        'Registre a normalização no acompanhamento operacional antes de concluir a RFO. A normalização não exige RFO concluída.',
        409,
      );
    const now = this.now().toISOString();
    const snapshot: RfoRecord = {
      ...editableRfo(input),
      ticketId,
      glpiTicketId: context.glpiTicketId,
      normalizedAt,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      updatedBy: actorId,
      revision: input.expectedRevision + 1,
      completedAt:
        input.completion === 'completed'
          ? previous?.completion === 'completed'
            ? previous.completedAt
            : now
          : null,
    };
    const eligible = `EXISTS(SELECT 1 FROM tickets t LEFT JOIN ticket_operations o ON o.ticket_id=t.id WHERE t.id=?
      AND t.result_state='created' AND t.glpi_ticket_id=? AND COALESCE(o.revision,0)=?)
      AND EXISTS(SELECT 1 FROM users WHERE id=? AND active=1 AND role IN ('operator','admin'))`;
    const prerequisites = [
      ticketId,
      context.glpiTicketId,
      context.operationRevision,
      actorId,
    ];
    const fields = [
      snapshot.glpiTicketId,
      snapshot.investigation,
      snapshot.completion,
      snapshot.cause,
      snapshot.technicalDescription,
      snapshot.solution,
      snapshot.responsibleTeam,
      snapshot.notes,
      snapshot.normalizedAt,
      snapshot.createdAt,
      snapshot.updatedAt,
      snapshot.completedAt,
      actorId,
      snapshot.revision,
    ];
    const write = previous
      ? this.db
          .prepare(
            `UPDATE ticket_rfos SET glpi_ticket_id=?,investigation=?,completion=?,cause=?,technical_description=?,solution=?,responsible_team=?,notes=?,normalized_at=?,created_at=?,updated_at=?,completed_at=?,updated_by=?,revision=? WHERE ticket_id=? AND revision=? AND ${eligible}`,
          )
          .bind(...fields, ticketId, input.expectedRevision, ...prerequisites)
      : this.db
          .prepare(`INSERT INTO ticket_rfos (ticket_id,glpi_ticket_id,investigation,completion,cause,technical_description,solution,responsible_team,notes,normalized_at,created_at,updated_at,completed_at,updated_by,revision)
        SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${eligible} ON CONFLICT(ticket_id) DO NOTHING`)
          .bind(ticketId, ...fields, ...prerequisites);
    try {
      const result = await this.db.batch([
        write,
        this.db
          .prepare(`INSERT INTO ticket_rfo_revisions (ticket_id,operation_key,request_hash,actor_id,actor_name,recorded_at,revision,snapshot_json)
        SELECT ?,?,?,?,?,?,?,? WHERE changes()=1`)
          .bind(
            ticketId,
            input.operationKey,
            requestHash,
            actorId,
            containsSensitiveText(actor.name) ? '[Nome omitido]' : actor.name,
            now,
            snapshot.revision,
            JSON.stringify(snapshot),
          ),
      ]);
      if (result[0].meta.changes !== 1) {
        const existing = await duplicate();
        if (existing) return existing;
        throw this.conflict();
      }
    } catch (error) {
      if (error instanceof RfoError) throw error;
      const existing = await duplicate();
      if (existing) return existing;
      throw error;
    }
    return { ...(await this.read(ticketId)), reused: false };
  }
  private conflict() {
    return new RfoError(
      'REVISION_CONFLICT',
      'RFO, normalização ou permissões mudaram. Recarregue os dados antes de salvar.',
      409,
    );
  }
}
