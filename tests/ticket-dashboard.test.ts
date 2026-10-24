import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { TicketDashboardRepository } from '../db/ticket-dashboard.ts';
import { D1TicketRepository } from '../db/ticket-storage.ts';
import {
  createDashboardHandler,
  createLocalTicketHandler,
} from '../services/tickets/dashboard-handlers.ts';
import {
  dateBucket,
  nocDay,
  parseDashboardFilters,
  startOfNocDay,
} from '../services/tickets/dashboard.ts';
import type { AuthUser } from '../services/auth/auth-types.ts';

class ReadHarness {
  readonly sqlite = new DatabaseSync(':memory:');
  readonly queries: string[] = [];
  constructor(migrate = true) {
    if (!migrate) return;
    this.sqlite.exec('PRAGMA foreign_keys=ON');
    for (const file of readdirSync('drizzle')
      .filter((file) => /^\d{4}_.+\.sql$/.test(file))
      .sort())
      this.sqlite.exec(
        readFileSync(`drizzle/${file}`, 'utf8').replaceAll(
          '--> statement-breakpoint',
          '',
        ),
      );
  }
  prepare(sql: string) {
    this.queries.push(sql);
    let values: SQLInputValue[] = [];
    const statement = {
      bind(...input: SQLInputValue[]) {
        values = input;
        return statement;
      },
      all: async <T>() => ({
        results: this.sqlite.prepare(sql).all(...values) as T[],
        meta: { changes: 0 },
        success: true,
      }),
      first: async <T>() =>
        (this.sqlite.prepare(sql).get(...values) as T | undefined) ?? null,
    };
    return statement;
  }
  async batch(statements: Array<ReturnType<ReadHarness['prepare']>>) {
    this.sqlite.exec('BEGIN');
    try {
      const rows = await Promise.all(statements.map((s) => s.all()));
      this.sqlite.exec('COMMIT');
      return rows;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }
  asD1() {
    return this as unknown as D1Database;
  }
  ticket(
    id: number,
    state: string | null = null,
    opening = 'created',
    opened = '2026-10-22T12:00:00.000Z',
    official: number | null = 2,
  ) {
    this.sqlite
      .prepare(`INSERT INTO tickets (id, operation_key, glpi_ticket_id, title, content, result_state, status, created_at, updated_at, last_synced_at)
      VALUES (?, ?, ?, ?, 'Descrição anterior', ?, ?, ?, ?, ?)`)
      .run(
        id,
        `key-${id}`,
        opening === 'created' ? id + 1000 : null,
        `Chamado ${id}`,
        opening,
        official,
        opened,
        opened,
        opening === 'created' ? '2026-10-22T15:00:00.000Z' : null,
      );
    if (state)
      this.sqlite
        .prepare(`INSERT INTO ticket_operations (ticket_id, occurrence_type, route_description, responsible_organization, state, pending_reason, notes, guidance, opened_at, updated_at, normalized_at, closed_at, updated_by, revision)
      VALUES (?, 'Rompimento', 'Trecho livre', 'Gerência A', ?, ?, 'Observação atual', 'Acesso pela portaria', ?, ?, ?, ?, 1, 1)`)
        .run(
          id,
          state,
          state === 'pending' ? 'Aguardando acesso' : '',
          opened,
          '2026-10-22T16:00:00.000Z',
          state === 'normalized' ? opened : null,
          state === 'closed' ? opened : null,
        );
  }
}
const filters = (query = '') =>
  parseDashboardFilters(new URLSearchParams(query));
const zone = 'America/Sao_Paulo';
const now = new Date('2026-10-22T16:00:00.000Z');
async function fixture(
  fn: (h: ReadHarness, repo: TicketDashboardRepository) => Promise<void>,
) {
  const h = new ReadHarness();
  h.sqlite.exec(
    `INSERT INTO users (id, glpi_user_id, name, username, role, active, created_at, updated_at) VALUES (1, 10, 'Operador', 'operador', 'operator', 1, '2026-10-01', '2026-10-01')`,
  );
  try {
    await fn(h, new TicketDashboardRepository(h.asD1()));
  } finally {
    h.sqlite.close();
  }
}

void test('counts mutually exclusive states, separates attempts and defines active without double counting', async () =>
  fixture(async (h, repo) => {
    h.ticket(1, 'in_progress');
    h.ticket(2, 'pending');
    h.ticket(3, 'normalized');
    h.ticket(4, 'closed', 'created', undefined, 6);
    h.ticket(5);
    h.ticket(6, null, 'created', undefined, 6);
    h.ticket(7, null, 'uncertain');
    h.ticket(8, null, 'failed');
    h.ticket(9, null, 'pending');
    const data = await repo.query(filters(), zone, now);
    assert.deepEqual(
      { ...data.counts },
      {
        total: 9,
        confirmed: 6,
        active: 3,
        in_progress: 1,
        pending: 1,
        normalized: 1,
        closed: 1,
        unstarted: 2,
        unconfirmed: 3,
      },
    );
    assert.equal(data.lastSyncedAt, '2026-10-22T15:00:00.000Z');
    assert.equal(new Set(data.items.map((row) => row.id)).size, 9);
    assert.equal(
      (await repo.query(filters('state=active'), zone)).counts.total,
      3,
    );
    assert.equal(
      (await repo.query(filters('state=unconfirmed'), zone)).counts.total,
      3,
    );
    assert.equal(
      (await repo.query(filters('state=unstarted'), zone)).counts.total,
      2,
    );
    assert.equal(
      (await repo.query(filters('state=normalized'), zone)).counts.total,
      1,
    );
  }));

void test('NOC civil date boundaries distinguish today/yesterday and retain older active incidents', async () =>
  fixture(async (h, repo) => {
    h.ticket(1, 'pending', 'created', '2026-10-22T02:59:59.999Z');
    h.ticket(2, 'in_progress', 'created', '2026-10-22T03:00:00.000Z');
    h.ticket(3, 'in_progress', 'created', '2025-01-01T03:00:00.000Z');
    assert.equal(
      dateBucket('2026-10-22T02:59:59.999Z', now.toISOString(), zone),
      'yesterday',
    );
    assert.equal(
      dateBucket('2026-10-22T03:00:00.000Z', now.toISOString(), zone),
      'today',
    );
    assert.equal(
      dateBucket('2025-01-01T03:00:00.000Z', now.toISOString(), zone),
      'earlier',
    );
    assert.deepEqual(
      (
        await repo.query(filters('from=2026-10-22&to=2026-10-22'), zone)
      ).items.map((r) => r.id),
      [2],
    );
    assert.deepEqual(
      (
        await repo.query(filters('from=2026-10-21&to=2026-10-21'), zone)
      ).items.map((r) => r.id),
      [1],
    );
    assert.ok(
      (await repo.query(filters('state=active'), zone)).items.some(
        (r) => r.id === 3,
      ),
    );
    assert.equal(startOfNocDay('2026-10-22', zone), '2026-10-22T03:00:00.000Z');
    assert.equal(
      startOfNocDay('2026-03-08', 'America/New_York'),
      '2026-03-08T05:00:00.000Z',
    );
    assert.equal(
      startOfNocDay('2026-03-09', 'America/New_York'),
      '2026-03-09T04:00:00.000Z',
    );
    assert.equal(nocDay('2026-10-22T01:00:00Z', zone), '2026-10-21');
  }));

void test('filters type, free text/explicit route, organization and exact GLPI number with bound literal values', async () =>
  fixture(async (h, repo) => {
    h.ticket(1, 'pending');
    h.ticket(2);
    h.sqlite
      .exec(`INSERT INTO categories (id,name,description,color,scope,created_at,updated_at) VALUES (1,'Rotas','','#000000','general','2026-01-01','2026-01-01');
    INSERT INTO information (id,title,category_id,responsible,validation,contact,notes,updated_at) VALUES (1,'Rota vinculada',1,'','','','','2026-01-01');
    UPDATE ticket_operations SET route_id=1 WHERE ticket_id=1;`);
    for (const query of [
      'occurrence=rompimento',
      'route=Trecho',
      'route=vinculada',
      'organization=Ger%C3%AAncia',
      'glpiId=1001',
      'state=pending&occurrence=Rompimento&route=livre&organization=A&glpiId=1001',
    ])
      assert.deepEqual(
        (await repo.query(filters(query), zone)).items.map((r) => r.id),
        [1],
      );
    for (const query of [
      'glpiId=1',
      'route=%25',
      'route=%27%20OR%201%3D1--',
      'organization=outra',
    ])
      assert.equal((await repo.query(filters(query), zone)).counts.total, 0);
  }));

void test('pagination is deterministic, bounded and returns totals over all pages without reading full history', async () =>
  fixture(async (h, repo) => {
    for (let i = 1; i <= 125; i++) h.ticket(i, 'pending');
    const first = await repo.query(filters('page=1&pageSize=50'), zone);
    const second = await repo.query(filters('page=2&pageSize=50'), zone);
    const third = await repo.query(filters('page=3&pageSize=50'), zone);
    assert.equal(first.counts.pending, 125);
    assert.equal(first.totalPages, 3);
    assert.equal(
      new Set(
        [...first.items, ...second.items, ...third.items].map((r) => r.id),
      ).size,
      125,
    );
    assert.equal(first.items[0].id, 125);
    assert.equal(third.items.at(-1)?.id, 1);
    assert.equal(
      (await repo.query(filters('page=4&pageSize=50'), zone)).items.length,
      0,
    );
    assert.ok(h.queries.every((sql) => !/SELECT \*/i.test(sql)));
    assert.ok(
      h.queries
        .filter((sql) => sql.includes('ticket_operation_events'))
        .every((sql) => sql.includes('LIMIT 1')),
    );
  }));

void test('pending cards use latest movement observation without joining all events or duplicating counts', async () =>
  fixture(async (h, repo) => {
    h.ticket(1, 'pending');
    for (let i = 1; i <= 3; i++)
      h.sqlite
        .prepare(
          `INSERT INTO ticket_operation_events (ticket_id,operation_key,request_json,actor_id,actor_name,occurred_at,type,next_state,description,snapshot_json,revision) VALUES (1,?, '{}',1,'Operador',?,'updated','pending',?, '{}',?)`,
        )
        .run(`e${i}`, `2026-10-22T16:00:0${i}Z`, `Observação ${i}`, i);
    const result = await repo.query(filters(), zone);
    assert.equal(result.counts.pending, 1);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].lastObservation, 'Observação 3');
    assert.equal(result.items[0].pendingReason, 'Aguardando acesso');
    assert.equal(result.items[0].guidance, 'Acesso pela portaria');
  }));

void test('empty database returns zero counts; invalid query parameters are rejected', async () =>
  fixture(async (_h, repo) => {
    const result = await repo.query(filters(), zone);
    assert.equal(result.counts.total, 0);
    assert.equal(result.counts.active, 0);
    assert.equal(result.items.length, 0);
    assert.equal(result.lastSyncedAt, null);
    for (const query of [
      'page=0',
      'pageSize=51',
      'page=1.2',
      'state=invalid',
      'from=2026-02-30',
      'from=2026-10-22&to=2026-10-21',
      'glpiId=NaN',
      'page=1&page=2',
      'unknown=1',
    ])
      assert.throws(() => filters(query));
  }));

void test('dashboard access and local details enforce roles; API errors are safe and no GLPI fetch is needed', async () =>
  fixture(async (h, repo) => {
    h.ticket(1, 'pending');
    const identity = (role: AuthUser['role'], active = true): AuthUser => ({
      id: 1,
      name: 'Operador',
      username: 'operador',
      glpiUserId: 10,
      role,
      active,
    });
    const request = (query = '', cookie = true) =>
      new Request(`https://lastro.invalid/api/tickets/dashboard${query}`, {
        headers: cookie ? { Cookie: `opuslog_session=${'a'.repeat(43)}` } : {},
      });
    const api = (user: AuthUser | null) =>
      createDashboardHandler(
        async () => user,
        () => repo,
      );
    assert.equal((await api(null)(request())).status, 401);
    assert.equal(
      (await api(identity('viewer'))(request('', false))).status,
      401,
    );
    assert.equal((await api(identity('admin', false))(request())).status, 401);
    for (const role of ['viewer', 'operator', 'admin'] as const)
      assert.equal((await api(identity(role))(request())).status, 200);
    assert.equal(
      (await api(identity('viewer'))(request('?state=bogus'))).status,
      400,
    );
    const broken = createDashboardHandler(
      async () => identity('viewer'),
      () => {
        throw new Error('secret SQL');
      },
    );
    const failure = await broken(request());
    assert.equal(failure.status, 503);
    assert.doesNotMatch(await failure.text(), /secret SQL/);
    const zoneError = createDashboardHandler(
      async () => identity('viewer'),
      () => repo,
      () => 'invalid-zone',
    );
    assert.equal((await zoneError(request())).status, 503);
    const local = (role: AuthUser['role']) =>
      createLocalTicketHandler(
        async () => identity(role),
        () => new D1TicketRepository(h.asD1()),
      );
    assert.equal((await local('viewer')(request(), '1')).status, 403);
    assert.equal((await local('operator')(request(), '1')).status, 200);
    assert.equal((await local('admin')(request(), '999')).status, 404);
    assert.equal((await local('admin')(request(), 'bad')).status, 400);
    assert.equal(
      (await api(identity('viewer'))(request())).headers.get('cache-control'),
      'no-store',
    );
  }));

void test('missing operational tables returns API 503 instead of false empty indicators', async () => {
  const h = new ReadHarness();
  h.sqlite.exec(
    'DROP TABLE ticket_operation_events; DROP TABLE ticket_operations;',
  );
  try {
    const api = createDashboardHandler(
      async () => ({
        id: 1,
        glpiUserId: 1,
        name: 'A',
        username: 'a',
        role: 'viewer',
        active: true,
      }),
      () => new TicketDashboardRepository(h.asD1()),
    );
    assert.equal(
      (
        await api(
          new Request('https://lastro.invalid/api/tickets/dashboard', {
            headers: { Cookie: `opuslog_session=${'a'.repeat(43)}` },
          }),
        )
      ).status,
      503,
    );
  } finally {
    h.sqlite.close();
  }
});
