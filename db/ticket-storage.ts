import type { GlpiTicketDetails } from '@/services/glpi/types';
import type {
  CreateTicketRequest,
  LocalTicket,
  TicketRepository,
} from '@/services/tickets/types';

interface TicketRow extends Record<string, unknown> {
  id: number;
  operationKey: string;
  glpiTicketId: number | null;
  title: string;
  content: string;
  status: number | null;
  resultState: LocalTicket['resultState'];
  failureCode: string | null;
  createdAt: string;
  updatedAt: string;
  glpiCreatedAt: string | null;
  lastSyncedAt: string | null;
  createdBy: number | null;
  revision: number;
}

export class TicketStorageError extends Error {
  readonly code = 'TICKET_STORAGE_ERROR';

  constructor() {
    super('O armazenamento local de chamados está indisponível.');
    this.name = 'TicketStorageError';
  }
}

const columns = `id, operation_key AS operationKey, glpi_ticket_id AS glpiTicketId,
  title, content, status, result_state AS resultState, failure_code AS failureCode,
  created_at AS createdAt, updated_at AS updatedAt, glpi_created_at AS glpiCreatedAt,
  last_synced_at AS lastSyncedAt, created_by AS createdBy, revision`;

function normalize(row: TicketRow | null): LocalTicket | null {
  if (!row) return null;
  return {
    id: Number(row.id),
    operationKey: String(row.operationKey),
    glpiTicketId: row.glpiTicketId === null ? null : Number(row.glpiTicketId),
    title: String(row.title),
    content: String(row.content),
    status: row.status === null ? null : Number(row.status),
    resultState: row.resultState,
    failureCode: row.failureCode === null ? null : String(row.failureCode),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
    glpiCreatedAt: row.glpiCreatedAt === null ? null : String(row.glpiCreatedAt),
    lastSyncedAt: row.lastSyncedAt === null ? null : String(row.lastSyncedAt),
    createdBy: row.createdBy === null ? null : Number(row.createdBy),
    revision: Number(row.revision),
  };
}

export class D1TicketRepository implements TicketRepository {
  private readonly db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  private async findOne(sql: string, ...values: (string | number)[]) {
    const row = await this.db.prepare(sql).bind(...values).first<TicketRow>();
    return normalize(row);
  }

  private async requireById(id: number): Promise<LocalTicket> {
    const row = await this.findOne(`SELECT ${columns} FROM tickets WHERE id = ?`, id);
    if (!row) throw new TicketStorageError();
    return row;
  }

  async createPending(input: CreateTicketRequest) {
    try {
      const now = new Date().toISOString();
      const result = await this.db
        .prepare(`INSERT INTO tickets
          (operation_key, title, content, result_state, created_at, updated_at, created_by, revision)
          VALUES (?, ?, ?, 'pending', ?, ?, ?, 1)
          ON CONFLICT(operation_key) DO NOTHING`)
        .bind(input.operationKey, input.title, input.content, now, now, input.createdBy ?? null)
        .run();
      const ticket = await this.findOne(
        `SELECT ${columns} FROM tickets WHERE operation_key = ?`,
        input.operationKey,
      );
      if (!ticket) throw new TicketStorageError();
      return { ticket, inserted: result.meta.changes === 1 };
    } catch {
      throw new TicketStorageError();
    }
  }

  async markCreated(id: number, glpiTicket: { id: number }) {
    try {
      await this.db
        .prepare(`UPDATE tickets SET glpi_ticket_id = ?, result_state = 'created',
          failure_code = NULL, updated_at = ?, revision = revision + 1
          WHERE id = ? AND result_state = 'pending'`)
        .bind(glpiTicket.id, new Date().toISOString(), id)
        .run();
      return await this.requireById(id);
    } catch {
      throw new TicketStorageError();
    }
  }

  async markFailed(id: number, failureCode: string) {
    try {
      await this.db
        .prepare(`UPDATE tickets SET result_state = 'failed', failure_code = ?,
          updated_at = ?, revision = revision + 1 WHERE id = ? AND result_state = 'pending'`)
        .bind(failureCode, new Date().toISOString(), id)
        .run();
    } catch {
      throw new TicketStorageError();
    }
  }

  async markUncertain(id: number, failureCode: string, glpiTicketId?: number) {
    try {
      await this.db
        .prepare(`UPDATE tickets SET result_state = 'uncertain', failure_code = ?,
          glpi_ticket_id = COALESCE(?, glpi_ticket_id), updated_at = ?, revision = revision + 1
          WHERE id = ? AND result_state IN ('pending', 'uncertain')`)
        .bind(failureCode, glpiTicketId ?? null, new Date().toISOString(), id)
        .run();
      return await this.requireById(id);
    } catch {
      throw new TicketStorageError();
    }
  }

  async list(limit = 100): Promise<LocalTicket[]> {
    try {
      const result = await this.db
        .prepare(`SELECT ${columns} FROM tickets ORDER BY created_at DESC, id DESC LIMIT ?`)
        .bind(Math.min(Math.max(Math.trunc(limit), 1), 100))
        .all<TicketRow>();
      return result.results.map((row) => normalize(row)).filter((row): row is LocalTicket => row !== null);
    } catch {
      throw new TicketStorageError();
    }
  }

  async getByGlpiId(id: number): Promise<LocalTicket | null> {
    try {
      return await this.findOne(`SELECT ${columns} FROM tickets WHERE glpi_ticket_id = ?`, id);
    } catch {
      throw new TicketStorageError();
    }
  }

  async syncFromGlpi(ticket: GlpiTicketDetails): Promise<LocalTicket | null> {
    try {
      await this.db
        .prepare(`UPDATE tickets SET title = ?, content = ?, status = COALESCE(?, status),
          glpi_created_at = COALESCE(?, glpi_created_at), last_synced_at = ?, updated_at = ?,
          revision = revision + 1 WHERE glpi_ticket_id = ? AND result_state = 'created'`)
        .bind(
          ticket.title,
          ticket.content,
          ticket.status ?? null,
          ticket.createdAt ?? null,
          new Date().toISOString(),
          new Date().toISOString(),
          ticket.id,
        )
        .run();
      return await this.getByGlpiId(ticket.id);
    } catch {
      throw new TicketStorageError();
    }
  }
}
