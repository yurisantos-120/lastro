import {
  nextDay,
  startOfNocDay,
  validateNocTimeZone,
} from '../services/tickets/dashboard.ts';
import type {
  DashboardCounts,
  DashboardData,
  DashboardFilters,
  DashboardTicket,
} from '../services/tickets/dashboard.ts';

const confirmed = `(t.result_state = 'created' AND t.glpi_ticket_id > 0)`;
const active = `(${confirmed} AND (o.state IN ('in_progress', 'pending') OR (o.ticket_id IS NULL AND COALESCE(t.status, 0) <> 6)))`;
const joins = `FROM tickets t LEFT JOIN ticket_operations o ON o.ticket_id = t.id LEFT JOIN information r ON r.id = o.route_id`;

export class TicketDashboardRepository {
  private readonly db: D1Database;
  constructor(db: D1Database) {
    this.db = db;
  }

  async query(
    filters: DashboardFilters,
    timeZone: string,
    now = new Date(),
  ): Promise<DashboardData> {
    validateNocTimeZone(timeZone);
    const rfoAvailable = Boolean(
      await this.db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='ticket_rfos'",
        )
        .first(),
    );
    const queryJoins =
      joins +
      (rfoAvailable ? ' LEFT JOIN ticket_rfos rfo ON rfo.ticket_id=t.id' : '');
    const clauses: string[] = [];
    const values: (string | number)[] = [];
    if (filters.state === 'active') clauses.push(active);
    else if (filters.state === 'unconfirmed')
      clauses.push(`NOT COALESCE(${confirmed}, 0)`);
    else if (filters.state === 'unstarted')
      clauses.push(`${confirmed} AND o.ticket_id IS NULL`);
    else if (filters.state) {
      clauses.push(`${confirmed} AND o.state = ?`);
      values.push(filters.state);
    }
    if (filters.from) {
      clauses.push('julianday(t.created_at) >= julianday(?)');
      values.push(startOfNocDay(filters.from, timeZone));
    }
    if (filters.to) {
      clauses.push('julianday(t.created_at) < julianday(?)');
      values.push(startOfNocDay(nextDay(filters.to), timeZone));
    }
    // instr treats %, _ and SQL syntax literally. All values remain bound parameters.
    for (const [value, expression] of [
      [filters.occurrence, 'o.occurrence_type'],
      [
        filters.route,
        "COALESCE(o.route_description, '') || ' ' || COALESCE(r.title, '')",
      ],
      [filters.organization, 'o.responsible_organization'],
    ] as const) {
      if (value) {
        clauses.push(`instr(lower(COALESCE(${expression}, '')), lower(?)) > 0`);
        values.push(value);
      }
    }
    if (filters.glpiId) {
      clauses.push('t.glpi_ticket_id = ?');
      values.push(Number(filters.glpiId));
    }
    const where = clauses.length
      ? `WHERE ${clauses.map((clause) => `(${clause})`).join(' AND ')}`
      : '';
    const countState = (state: string) =>
      `COALESCE(SUM(CASE WHEN ${confirmed} AND o.state = '${state}' THEN 1 ELSE 0 END), 0)`;
    const aggregate = this.db
      .prepare(`SELECT COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN ${confirmed} THEN 1 ELSE 0 END), 0) AS confirmed,
      COALESCE(SUM(CASE WHEN ${active} THEN 1 ELSE 0 END), 0) AS active,
      ${countState('in_progress')} AS in_progress, ${countState('pending')} AS pending,
      ${countState('normalized')} AS normalized, ${countState('closed')} AS closed,
      COALESCE(SUM(CASE WHEN ${confirmed} AND o.ticket_id IS NULL THEN 1 ELSE 0 END), 0) AS unstarted,
      COALESCE(SUM(CASE WHEN ${confirmed} THEN 0 ELSE 1 END), 0) AS unconfirmed,
      MAX(t.last_synced_at) AS lastSyncedAt ${queryJoins} ${where}`)
      .bind(...values);
    const list = this.db
      .prepare(`SELECT ${rfoAvailable ? 'rfo.completion' : 'NULL'} AS rfoStatus, t.id, t.title, t.glpi_ticket_id AS glpiTicketId,
      t.result_state AS resultState, t.status AS glpiStatus, o.state, t.created_at AS openedAt,
      t.last_synced_at AS lastSyncedAt, o.updated_at AS updatedAt,
      COALESCE(o.occurrence_type, '') AS occurrenceType, COALESCE(o.route_description, '') AS routeDescription,
      r.title AS routeTitle, COALESCE(o.responsible_organization, '') AS responsibleOrganization,
      COALESCE(o.pending_reason, '') AS pendingReason, COALESCE(o.guidance, '') AS guidance,
      COALESCE((SELECT COALESCE(NULLIF(e.description, ''), json_extract(e.snapshot_json, '$.notes'))
        FROM ticket_operation_events e WHERE e.ticket_id = t.id ORDER BY e.revision DESC LIMIT 1), o.notes, '') AS lastObservation
      ${queryJoins} ${where} ORDER BY julianday(t.created_at) DESC, t.id DESC LIMIT ? OFFSET ?`)
      .bind(...values, filters.pageSize, (filters.page - 1) * filters.pageSize);
    const result = await this.db.batch([aggregate, list]);
    const row = result[0].results[0] as unknown as DashboardCounts & {
      lastSyncedAt: string | null;
    };
    const { lastSyncedAt, ...counts } = row;
    return {
      rfoAvailable,
      counts,
      lastSyncedAt,
      items: result[1].results as unknown as DashboardTicket[],
      page: filters.page,
      pageSize: filters.pageSize,
      totalPages: Math.ceil(counts.total / filters.pageSize),
      timeZone,
      generatedAt: now.toISOString(),
    };
  }
}
