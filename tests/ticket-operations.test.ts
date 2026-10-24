import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import test from 'node:test';
import { TicketOperationsRepository } from '../db/ticket-operations.ts';
import { parseOperationalUpdate } from '../services/tickets/operations.ts';
import { createTicketOperationHandlers } from '../services/tickets/operation-handlers.ts';
import type { AuthUser } from '../services/auth/auth-types.ts';

class Harness {
  readonly sqlite = new DatabaseSync(':memory:');
  failEvent = false;
  constructor() {
    this.sqlite.exec('PRAGMA foreign_keys=ON');
    for (const name of readdirSync('drizzle').filter((name) => /^\d{4}_.+\.sql$/.test(name) && !name.startsWith('0008')).sort()) {
      this.sqlite.exec(readFileSync(`drizzle/${name}`, 'utf8').replaceAll('--> statement-breakpoint', ''));
    }
    this.sqlite.exec(`INSERT INTO users (id, glpi_user_id, name, username, role, active, created_at, updated_at)
      VALUES (1, 11, 'Operador A', 'operator-a', 'operator', 1, '2026-10-01', '2026-10-01'),
        (2, 12, 'Consulta', 'viewer', 'viewer', 1, '2026-10-01', '2026-10-01'),
        (3, 13, 'Administrador', 'admin', 'admin', 1, '2026-10-01', '2026-10-01');
      INSERT INTO categories (id, name, description, color, scope, created_at, updated_at)
        VALUES (1, 'Rotas', '', '#000000', 'general', '2026-10-01', '2026-10-01'),
          (2, 'Câmeras', '', '#000000', 'camera', '2026-10-01', '2026-10-01');
      INSERT INTO information (id, title, category_id, responsible, validation, contact, notes, kind, updated_at)
        VALUES (1, 'Rota cadastrada', 1, '', '', '', '', 'general', '2026-10-01'),
          (2, 'Câmera', 2, '', '', '', '', 'camera', '2026-10-01');
      INSERT INTO tickets (id, operation_key, glpi_ticket_id, title, content, status, result_state, created_at, updated_at)
        VALUES (1, 'legacy-one', 101, 'Existente', 'Conteúdo anterior', 2, 'created', '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
          (2, 'legacy-two', NULL, 'Incerto', 'Não confirmar abertura', NULL, 'uncertain', '2026-10-01', '2026-10-01');`);
  }
  migrate() { this.sqlite.exec(readFileSync('drizzle/0008_ticket_operations.sql', 'utf8').replaceAll('--> statement-breakpoint', '')); }
  prepare(sql: string) {
    let bindings: SQLInputValue[] = [];
    const statement = {
      bind(...values: SQLInputValue[]) { bindings = values; return statement; },
      first: async <T>() => (this.sqlite.prepare(sql).get(...bindings) as T | undefined) ?? null,
      all: async <T>() => ({ success: true, results: this.sqlite.prepare(sql).all(...bindings) as T[] }),
      execute: () => {
        if (this.failEvent && sql.startsWith('INSERT INTO ticket_operation_events')) { this.failEvent = false; throw new Error('synthetic event failure'); }
        const query = this.sqlite.prepare(sql);
        if (query.columns().length) return { success: true, results: query.all(...bindings), meta: { changes: 0 } };
        const result = query.run(...bindings);
        return { success: true, results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
      },
    };
    return statement;
  }
  async batch(statements: Array<ReturnType<Harness['prepare']>>) {
    this.sqlite.exec('BEGIN');
    try { const results = statements.map((statement) => statement.execute()); this.sqlite.exec('COMMIT'); return results; }
    catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
  asD1() { return this as unknown as D1Database; }
}

async function fixture(action: (repository: TicketOperationsRepository, h: Harness) => Promise<void>) {
  const h = new Harness();
  h.migrate();
  let clock = Date.parse('2026-10-22T12:00:00Z');
  const repository = new TicketOperationsRepository(h.asD1(), () => new Date(clock++));
  try { await action(repository, h); } finally { h.sqlite.close(); }
}
const input = (overrides: Record<string, unknown> = {}) => ({
  operationKey: crypto.randomUUID(), expectedRevision: 0, state: 'in_progress',
  occurrenceType: 'Rompimento', routeDescription: 'Trecho informado livremente', responsibleOrganization: 'Gerência de rede',
  ...overrides,
});

void test('additive migration preserves legacy tickets and does not backfill operational data', () => {
  const h = new Harness();
  try {
    const before = h.sqlite.prepare('SELECT * FROM tickets ORDER BY id').all();
    h.migrate();
    assert.deepEqual(h.sqlite.prepare('SELECT * FROM tickets ORDER BY id').all(), before);
    assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM ticket_operations').get()?.n, 0);
    assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM ticket_operation_events').get()?.n, 0);
    assert.equal(h.sqlite.prepare('PRAGMA foreign_key_check').all().length, 0);
  } finally { h.sqlite.close(); }
});

void test('creates and reads operational data with explicit route FK and authenticated actor/server timestamps', async () => fixture(async (repository, h) => {
  const original = h.sqlite.prepare('SELECT * FROM tickets WHERE id=1').get();
  assert.deepEqual(await repository.read(1), { operation: null, events: [] });
  const result = await repository.save(1, 1, input({ routeId: 1, notes: 'Observação', guidance: 'Orientação' }));
  assert.equal(result.operation?.routeId, 1);
  assert.equal(result.operation?.openedAt, '2026-10-01T12:00:00.000Z');
  assert.equal(result.operation?.updatedAt, '2026-10-22T12:00:00.000Z');
  assert.equal(result.operation?.updatedBy, 1);
  assert.equal(result.operation?.notes, 'Observação');
  assert.equal(result.events[0].actorName, 'Operador A');
  assert.equal(result.events[0].actorId, 1);
  assert.equal(result.events[0].type, 'initialized');
  assert.deepEqual(result.events[0].snapshot, result.operation);
  assert.deepEqual(h.sqlite.prepare('SELECT * FROM tickets WHERE id=1').get(), original);
}));

void test('text does not infer a route link and only pending justification is required', async () => fixture(async (repository) => {
  const result = await repository.save(1, 1, { operationKey: crypto.randomUUID(), expectedRevision: 0, state: 'pending', pendingReason: 'Aguardando acesso' });
  assert.equal(result.operation?.routeId, null);
  assert.equal(result.operation?.notes, '');
  assert.equal(result.operation?.guidance, '');
  assert.equal(result.operation?.pendingReason, 'Aguardando acesso');
  assert.equal(result.operation?.occurrenceType, '');
  for (const reason of ['', '   ', undefined]) await assert.rejects(repository.save(1, 1, input({ state: 'pending', pendingReason: reason })), { code: 'INVALID_OPERATION' });
}));

void test('transitions preserve chronological immutable events, actors and normalization/closure dates', async () => fixture(async (repository, h) => {
  await repository.save(1, 1, input());
  await repository.save(1, 3, input({ expectedRevision: 1, state: 'pending', pendingReason: 'Acesso', description: 'Portaria avisada' }));
  const normalized = await repository.save(1, 1, input({ expectedRevision: 2, state: 'normalized' }));
  assert.ok(normalized.operation?.normalizedAt);
  assert.equal(normalized.operation?.pendingReason, '');
  await assert.rejects(repository.save(1, 1, input({ expectedRevision: 3, state: 'closed' })), { code: 'GLPI_CLOSE_UNCONFIRMED' });
  h.sqlite.exec("UPDATE tickets SET status=6, last_synced_at='2026-10-22T12:00:01.000Z' WHERE id=1");
  const closed = await repository.save(1, 3, input({ expectedRevision: 3, state: 'closed' }));
  assert.ok(closed.operation?.closedAt);
  assert.equal(closed.operation?.normalizedAt, normalized.operation?.normalizedAt);
  assert.deepEqual(closed.events.map((event) => event.nextState), ['in_progress', 'pending', 'normalized', 'closed']);
  assert.deepEqual(closed.events.map((event) => event.actorId), [1, 3, 1, 3]);
  assert.deepEqual(closed.events.map((event) => event.occurredAt), closed.events.map((event) => event.occurredAt).sort());
  assert.equal(closed.events[1].snapshot.pendingReason, 'Acesso');
  assert.throws(() => h.sqlite.exec("UPDATE ticket_operation_events SET description='alterado'"), /immutable/);
  assert.throws(() => h.sqlite.exec('DELETE FROM ticket_operation_events'), /immutable/);
  const resumed = await repository.save(1, 1, input({ expectedRevision: 4, state: 'in_progress' }));
  assert.equal(resumed.operation?.normalizedAt, null);
  assert.equal(resumed.operation?.closedAt, null);
  assert.ok(resumed.events[3].snapshot.closedAt);
}));

void test('idempotent retries do not duplicate movements and mismatched intent/actor/ticket is rejected', async () => fixture(async (repository) => {
  const payload = input();
  await repository.save(1, 1, payload);
  const duplicate = await repository.save(1, 1, payload);
  assert.equal(duplicate.reused, true);
  assert.equal(duplicate.events.length, 1);
  assert.equal(duplicate.operation?.revision, 1);
  await assert.rejects(repository.save(1, 1, { ...payload, notes: 'outra intenção' }), { code: 'OPERATION_KEY_CONFLICT' });
  await assert.rejects(repository.save(1, 3, payload), { code: 'OPERATION_KEY_CONFLICT' });
  await assert.rejects(repository.save(2, 1, payload), { code: 'OPERATION_KEY_CONFLICT' });
}));

void test('concurrent first movements and updates reject stale revisions without lost history', async () => fixture(async (repository) => {
  const initial = await Promise.allSettled([repository.save(1, 1, input()), repository.save(1, 1, input())]);
  assert.equal(initial.filter((result) => result.status === 'fulfilled').length, 1);
  const updates = await Promise.allSettled([repository.save(1, 1, input({ expectedRevision: 1, notes: 'A' })), repository.save(1, 3, input({ expectedRevision: 1, notes: 'B' }))]);
  assert.equal(updates.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal((await repository.read(1)).events.length, 2);
  await assert.rejects(repository.save(1, 1, input()), { code: 'REVISION_CONFLICT' });
}));

void test('concurrent retries of the same operation commit exactly one event', async () => fixture(async (repository) => {
  const payload = input();
  const results = await Promise.all([repository.save(1, 1, payload), repository.save(1, 1, payload)]);
  assert.equal(results.filter((result) => result.reused).length, 1);
  assert.equal((await repository.read(1)).events.length, 1);
}));

void test('lost confirmation after commit is safely recovered with the original operation key', async () => fixture(async (repository) => {
  const read = repository.read.bind(repository);
  let calls = 0;
  repository.read = async (id) => {
    if (++calls === 2) throw new Error('synthetic lost confirmation');
    return read(id);
  };
  const payload = input();
  await assert.rejects(repository.save(1, 1, payload), /lost confirmation/);
  const recovered = await repository.save(1, 1, payload);
  assert.equal(recovered.reused, true);
  assert.equal(recovered.events.length, 1);
  assert.equal(recovered.operation?.revision, 1);
}));

void test('failed event insert rolls back the summary and retry is safe', async () => fixture(async (repository, h) => {
  const payload = input();
  h.failEvent = true;
  await assert.rejects(repository.save(1, 1, payload), /synthetic event failure/);
  assert.deepEqual(await repository.read(1), { operation: null, events: [] });
  await repository.save(1, 1, payload);
  const update = input({ expectedRevision: 1, state: 'pending', pendingReason: 'Aguardando acesso' });
  h.failEvent = true;
  await assert.rejects(repository.save(1, 1, update), /synthetic event failure/);
  assert.equal((await repository.read(1)).operation?.state, 'in_progress');
  assert.equal((await repository.save(1, 1, update)).events.length, 2);
}));

void test('integrity enforces known tickets, users and routes; rejects camera links and unconfirmed openings', async () => fixture(async (repository, h) => {
  await assert.rejects(repository.read(99), { code: 'TICKET_NOT_FOUND' });
  await assert.rejects(repository.save(99, 1, input()), { code: 'TICKET_NOT_FOUND' });
  for (const actor of [2, 99]) await assert.rejects(repository.save(1, actor, input()), { code: 'AUTH_FORBIDDEN' });
  for (const routeId of [2, 99]) await assert.rejects(repository.save(1, 1, input({ routeId })), { code: 'INVALID_ROUTE' });
  for (const state of ['uncertain', 'failed', 'pending']) {
    h.sqlite.prepare('UPDATE tickets SET result_state=? WHERE id=2').run(state);
    await assert.rejects(repository.save(2, 1, input()), { code: 'GLPI_OPEN_UNCONFIRMED' });
  }
  await repository.save(1, 1, input({ routeId: 1 }));
  for (const sql of ['DELETE FROM tickets WHERE id=1', 'DELETE FROM users WHERE id=1', 'DELETE FROM information WHERE id=1', 'UPDATE ticket_operations SET route_id=99', 'UPDATE ticket_operations SET updated_by=99']) assert.throws(() => h.sqlite.exec(sql), /FOREIGN KEY/);
  assert.throws(() => h.sqlite.exec("UPDATE ticket_operations SET state='pending', pending_reason=''"), /CHECK/);
  assert.equal(h.sqlite.prepare('PRAGMA foreign_key_check').all().length, 0);
  h.sqlite.exec('UPDATE users SET active=0 WHERE id=1');
  await assert.rejects(repository.save(1, 1, input({ expectedRevision: 1 })), { code: 'AUTH_FORBIDDEN' });
}));

void test('payload rejects forged actors/timestamps, invalid states, route IDs, revisions and excessive values', () => {
  for (const changes of [{ actorId: 3 }, { updatedAt: 'yesterday' }, { state: 'invented' }, { expectedRevision: -1 }, { routeId: '1' }, { operationKey: 'not-uuid' }, { notes: 'x'.repeat(10001) }]) assert.throws(() => parseOperationalUpdate(input(changes)), { code: 'INVALID_OPERATION' });
});

void test('HTTP handlers authorize operators, protect input/origin and conceal storage failures', async () => fixture(async (repository) => {
  const user = (role: AuthUser['role'], id = 1): AuthUser => ({ id, glpiUserId: 11, username: 'operator-a', name: 'Operador', role, active: true });
  const request = (payload = input(), options: { origin?: string; contentType?: string; cookie?: boolean } = {}) => new Request('https://lastro.invalid/api/tickets/1/operations', {
    method: 'PUT', headers: { 'Content-Type': options.contentType ?? 'application/json', ...(options.cookie === false ? {} : { Cookie: `opuslog_session=${'a'.repeat(43)}` }), ...(options.origin ? { Origin: options.origin } : {}) }, body: JSON.stringify(payload),
  });
  const api = (identity: AuthUser | null) => createTicketOperationHandlers(async () => identity, () => repository);
  assert.equal((await api(null).PUT(request(), '1')).status, 401);
  assert.equal((await api(user('operator')).PUT(request(input(), { cookie: false }), '1')).status, 401);
  assert.equal((await api(user('viewer', 2)).PUT(request(), '1')).status, 403);
  assert.equal((await api(user('operator')).PUT(request(input(), { origin: 'https://other.invalid' }), '1')).status, 403);
  assert.equal((await api(user('operator')).PUT(request(input(), { contentType: 'text/plain' }), '1')).status, 415);
  assert.equal((await api(user('operator')).PUT(request(), '0')).status, 400);
  assert.equal((await api(user('operator')).PUT(request(input({ actorId: 3 })), '1')).status, 400);
  assert.equal((await api(user('operator')).PUT(request(input({ notes: 'x'.repeat(66000) })), '1')).status, 413);
  const malformed = new Request('https://lastro.invalid/api/tickets/1/operations', { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: `opuslog_session=${'a'.repeat(43)}` }, body: '{' });
  assert.equal((await api(user('operator')).PUT(malformed, '1')).status, 400);
  const payload = input();
  const response = await api(user('operator')).PUT(request(payload), '1');
  assert.equal(response.status, 200);
  assert.equal(((await response.json()) as { events: { actorId: number }[] }).events[0].actorId, 1);
  assert.equal((await api(user('operator')).PUT(request(payload), '1')).status, 200);
  assert.equal((await api(user('viewer', 2)).GET(request(), '1')).status, 200);
  const broken = createTicketOperationHandlers(async () => user('operator'), () => { throw new Error('sensitive DB details'); });
  const failure = await broken.GET(request(), '1');
  assert.equal(failure.status, 503);
  assert.doesNotMatch(await failure.text(), /sensitive/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
}));
