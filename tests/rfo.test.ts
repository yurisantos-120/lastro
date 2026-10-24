import assert from 'node:assert/strict';
import test from 'node:test';
import { D1Memory } from './helpers/d1-memory.ts';
import { RfoRepository } from '../db/rfo.ts';
import { parseRfo } from '../services/rfo/rfo.ts';
import { createRfoHandlers } from '../services/rfo/handlers.ts';
import { TicketDashboardRepository } from '../db/ticket-dashboard.ts';
import { parseDashboardFilters } from '../services/tickets/dashboard.ts';
import { TicketOperationsRepository } from '../db/ticket-operations.ts';
import type { AuthUser } from '../services/auth/auth-types.ts';

const now = new Date('2026-10-22T14:00:00.000Z');
const input = (changes: Record<string, unknown> = {}) => ({
  operationKey: crypto.randomUUID(),
  expectedRevision: 0,
  investigation: 'investigating',
  completion: 'pending',
  cause: '',
  technicalDescription: 'Investigação de atenuação em andamento',
  solution: '',
  responsibleTeam: 'Equipe de transmissão',
  notes: '',
  ...changes,
});
async function fixture(
  action: (h: D1Memory, repo: RfoRepository) => Promise<void>,
) {
  const h = new D1Memory();
  h.sqlite
    .exec(`INSERT INTO users (id,glpi_user_id,name,username,role,active,created_at,updated_at) VALUES
    (1,11,'Operador A','operator-a','operator',1,'2026-10-01','2026-10-01'),
    (2,12,'Operador B','operator-b','operator',1,'2026-10-01','2026-10-01'),
    (3,13,'Admin','admin','admin',1,'2026-10-01','2026-10-01'),
    (4,14,'Consulta','viewer','viewer',1,'2026-10-01','2026-10-01');
    INSERT INTO tickets (id,operation_key,glpi_ticket_id,title,content,result_state,status,created_at,updated_at) VALUES
    (1,'legacy1',101,'Atenuação','Conteúdo anterior','created',2,'2026-10-01T12:00:00Z','2026-10-01T12:00:00Z'),
    (2,'legacy2',NULL,'Incerto','Anterior','uncertain',NULL,'2026-10-01T12:00:00Z','2026-10-01T12:00:00Z');
    INSERT INTO ticket_operations (ticket_id,state,opened_at,updated_at,updated_by,revision)
    VALUES (1,'in_progress','2026-10-01T12:00:00Z','2026-10-01T12:00:00Z',1,1);`);
  try {
    await action(h, new RfoRepository(h.asD1(), () => now));
  } finally {
    h.sqlite.close();
  }
}
const normalize = (h: D1Memory) =>
  h.sqlite.exec(
    "UPDATE ticket_operations SET state='normalized',normalized_at='2026-10-22T12:00:00Z',revision=revision+1 WHERE ticket_id=1",
  );
const completed = (changes: Record<string, unknown> = {}) =>
  input({
    investigation: 'confirmed',
    completion: 'completed',
    cause: 'Falha no módulo óptico',
    technicalDescription: 'Módulo apresentou degradação de potência',
    solution: 'Módulo substituído e enlace validado',
    ...changes,
  });

void test('legacy tickets have no fictitious RFO; starting an investigation needs no definitive cause or normalization', async () =>
  fixture(async (h, repo) => {
    const before = h.sqlite.prepare('SELECT * FROM tickets ORDER BY id').all();
    assert.deepEqual(await repo.read(1), {
      rfo: null,
      normalizationAvailable: null,
      revisions: [],
      page: 1,
      total: 0,
    });
    const saved = await repo.save(1, 1, input());
    assert.equal(saved.rfo?.investigation, 'investigating');
    assert.equal(saved.rfo?.completion, 'pending');
    assert.equal(saved.rfo?.cause, '');
    assert.equal(saved.rfo?.normalizedAt, null);
    assert.equal(saved.rfo?.glpiTicketId, 101);
    assert.equal(saved.rfo?.updatedBy, 1);
    assert.equal(saved.rfo?.updatedAt, now.toISOString());
    assert.equal(saved.revisions[0].actorName, 'Operador A');
    assert.deepEqual(saved.revisions[0].snapshot, saved.rfo);
    assert.deepEqual(
      h.sqlite.prepare('SELECT * FROM tickets ORDER BY id').all(),
      before,
    );
  }));
void test('confirmed cause is required only for confirmed investigation; completion requires solution and normalization', async () =>
  fixture(async (h, repo) => {
    await assert.rejects(
      repo.save(1, 1, input({ investigation: 'confirmed' })),
      { code: 'CAUSE_REQUIRED' },
    );
    await assert.rejects(repo.save(1, 1, input({ completion: 'completed' })), {
      code: 'RFO_INCOMPLETE',
    });
    await assert.rejects(repo.save(1, 1, completed()), {
      code: 'NORMALIZATION_REQUIRED',
    });
    normalize(h);
    const saved = await repo.save(1, 1, completed());
    assert.equal(saved.rfo?.completion, 'completed');
    assert.equal(saved.rfo?.normalizedAt, '2026-10-22T12:00:00.000Z');
    assert.equal(saved.rfo?.completedAt, now.toISOString());
    assert.equal(saved.rfo?.cause, 'Falha no módulo óptico');
  }));
void test('edits preserve every revision, server attribution and original creation time', async () =>
  fixture(async (h, repo) => {
    const first = await repo.save(1, 1, input());
    normalize(h);
    const second = await repo.save(
      1,
      2,
      completed({ expectedRevision: 1, notes: 'Validação concluída' }),
    );
    assert.equal(second.rfo?.createdAt, first.rfo?.createdAt);
    assert.equal(second.rfo?.revision, 2);
    assert.equal(second.revisions[0].actorId, 2);
    assert.equal(second.revisions[1].snapshot.investigation, 'investigating');
    assert.equal(second.revisions[1].snapshot.cause, '');
    assert.throws(
      () =>
        h.sqlite.exec("UPDATE ticket_rfo_revisions SET actor_name='Alterado'"),
      /immutable/,
    );
    assert.throws(
      () => h.sqlite.exec('DELETE FROM ticket_rfo_revisions'),
      /immutable/,
    );
    const reopened = await repo.save(1, 1, input({ expectedRevision: 2 }));
    assert.equal(reopened.rfo?.completion, 'pending');
    assert.equal(reopened.rfo?.completedAt, null);
    assert.ok(reopened.revisions[1].snapshot.completedAt);
  }));
void test('RFO does not block normalization or existing GLPI-confirmed closing policy', async () =>
  fixture(async (h, repo) => {
    await repo.save(1, 1, input());
    const operations = new TicketOperationsRepository(h.asD1(), () => now);
    await operations.save(1, 1, {
      operationKey: crypto.randomUUID(),
      expectedRevision: 1,
      state: 'normalized',
    });
    assert.equal((await repo.read(1)).rfo?.completion, 'pending');
    await assert.rejects(
      operations.save(1, 1, {
        operationKey: crypto.randomUUID(),
        expectedRevision: 2,
        state: 'closed',
      }),
      { code: 'GLPI_CLOSE_UNCONFIRMED' },
    );
    h.sqlite.exec(
      "UPDATE tickets SET status=6,last_synced_at='2026-10-22T14:00:00Z' WHERE id=1",
    );
    await operations.save(1, 1, {
      operationKey: crypto.randomUUID(),
      expectedRevision: 2,
      state: 'closed',
    });
    assert.equal((await repo.read(1)).rfo?.completion, 'pending');
    assert.equal(
      (await repo.save(1, 1, completed({ expectedRevision: 1 }))).rfo
        ?.completion,
      'completed',
    );
  }));
void test('idempotency reuses a revision and rejects another intent, ticket or actor', async () =>
  fixture(async (_h, repo) => {
    const payload = input();
    await repo.save(1, 1, payload);
    const retry = await repo.save(1, 1, payload);
    assert.equal(retry.reused, true);
    assert.equal(retry.total, 1);
    assert.equal(retry.rfo?.revision, 1);
    for (const [ticket, actor, body] of [
      [1, 2, payload],
      [2, 1, payload],
      [1, 1, { ...payload, notes: 'Outra intenção' }],
    ] as const)
      await assert.rejects(repo.save(ticket, actor, body), {
        code: 'KEY_CONFLICT',
      });
  }));
void test('concurrent initial creation and competing edits cannot lose history', async () =>
  fixture(async (_h, repo) => {
    const first = await Promise.allSettled([
      repo.save(1, 1, input()),
      repo.save(1, 2, input()),
    ]);
    assert.equal(first.filter((r) => r.status === 'fulfilled').length, 1);
    const edits = await Promise.allSettled([
      repo.save(1, 1, input({ expectedRevision: 1, notes: 'Versão A' })),
      repo.save(1, 2, input({ expectedRevision: 1, notes: 'Versão B' })),
    ]);
    assert.equal(edits.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal((await repo.read(1)).total, 2);
  }));
void test('concurrent identical requests commit exactly one revision', async () =>
  fixture(async (_h, repo) => {
    const payload = input();
    const results = await Promise.all([
      repo.save(1, 1, payload),
      repo.save(1, 1, payload),
    ]);
    assert.equal(results.filter((r) => r.reused).length, 1);
    assert.equal((await repo.read(1)).total, 1);
  }));
void test('revision insert failure rolls back both initial creation and update', async () =>
  fixture(async (h, repo) => {
    h.sqlite.exec(
      "CREATE TRIGGER fail_rfo AFTER INSERT ON ticket_rfo_revisions BEGIN SELECT RAISE(ABORT,'synthetic rfo failure'); END",
    );
    const initial = input();
    await assert.rejects(repo.save(1, 1, initial), /synthetic rfo failure/);
    assert.equal((await repo.read(1)).rfo, null);
    h.sqlite.exec('DROP TRIGGER fail_rfo');
    await repo.save(1, 1, initial);
    h.sqlite.exec(
      "CREATE TRIGGER fail_rfo AFTER INSERT ON ticket_rfo_revisions BEGIN SELECT RAISE(ABORT,'synthetic rfo failure'); END",
    );
    const edit = input({ expectedRevision: 1, notes: 'Esta revisão falhará' });
    await assert.rejects(repo.save(1, 1, edit), /synthetic rfo failure/);
    assert.equal((await repo.read(1)).rfo?.notes, '');
    assert.equal((await repo.read(1)).total, 1);
    h.sqlite.exec('DROP TRIGGER fail_rfo');
    assert.equal((await repo.save(1, 1, edit)).total, 2);
  }));
void test('lost confirmation after commit recovers the saved revision using the same key', async () =>
  fixture(async (_h, repo) => {
    const read = repo.read.bind(repo);
    let calls = 0;
    repo.read = async (id, page) => {
      if (++calls === 2) throw Error('response lost');
      return read(id, page);
    };
    const payload = input();
    await assert.rejects(repo.save(1, 1, payload), /response lost/);
    const retry = await repo.save(1, 1, payload);
    assert.equal(retry.reused, true);
    assert.equal(retry.total, 1);
  }));
void test('normalization changes concurrent with write invalidate the attempted revision', async () =>
  fixture(async (h, repo) => {
    normalize(h);
    let changed = false;
    h.beforeRun = (sql) => {
      if (!changed && sql.startsWith('INSERT INTO ticket_rfos')) {
        changed = true;
        h.sqlite.exec(
          'UPDATE ticket_operations SET revision=revision+1 WHERE ticket_id=1',
        );
      }
    };
    await assert.rejects(repo.save(1, 1, completed()), {
      code: 'REVISION_CONFLICT',
    });
    assert.equal((await repo.read(1)).total, 0);
  }));
void test('history pages remain ordered and contain all revisions exactly once', async () =>
  fixture(async (_h, repo) => {
    for (let revision = 0; revision < 25; revision++)
      await repo.save(
        1,
        1,
        input({ expectedRevision: revision, notes: `Versão ${revision + 1}` }),
      );
    const first = await repo.read(1),
      second = await repo.read(1, 2);
    assert.equal(first.total, 25);
    assert.equal(first.revisions.length, 20);
    assert.equal(second.revisions.length, 5);
    assert.equal(first.revisions[0].revision, 25);
    assert.equal(second.revisions.at(-1)?.revision, 1);
    assert.equal(
      new Set([...first.revisions, ...second.revisions].map((r) => r.id)).size,
      25,
    );
  }));
void test('authorization and FK checks reject inactive users, missing tickets and unconfirmed opening', async () =>
  fixture(async (h, repo) => {
    for (const actor of [4, 999])
      await assert.rejects(repo.save(1, actor, input()), { code: 'FORBIDDEN' });
    await assert.rejects(repo.save(2, 1, input()), {
      code: 'OPEN_UNCONFIRMED',
    });
    await assert.rejects(repo.read(999), { code: 'TICKET_NOT_FOUND' });
    await repo.save(1, 3, input());
    assert.throws(
      () => h.sqlite.exec('DELETE FROM tickets WHERE id=1'),
      /FOREIGN KEY/,
    );
    assert.throws(
      () => h.sqlite.exec('DELETE FROM users WHERE id=3'),
      /FOREIGN KEY/,
    );
    h.sqlite.exec('UPDATE users SET active=0 WHERE id=1');
    await assert.rejects(repo.save(1, 1, input({ expectedRevision: 1 })), {
      code: 'FORBIDDEN',
    });
    assert.equal(h.sqlite.prepare('PRAGMA foreign_key_check').all().length, 0);
  }));
void test('all text fields reject recognizable credentials and forged identity/timing without persisting them', async () =>
  fixture(async (h, repo) => {
    for (const field of [
      'cause',
      'technicalDescription',
      'solution',
      'responsibleTeam',
      'notes',
    ]) {
      await assert.rejects(
        repo.save(1, 1, input({ [field]: 'password=synthetic-secret' })),
        { code: 'INVALID_RFO_TEXT' },
      );
      await assert.rejects(
        repo.save(
          1,
          1,
          input({ [field]: 'https://user:pass@example.invalid' }),
        ),
        { code: 'INVALID_RFO_TEXT' },
      );
    }
    for (const extra of [
      { updatedBy: 2 },
      { createdAt: '2020-01-01' },
      { normalizedAt: now.toISOString() },
      { completedAt: now.toISOString() },
      { notes: 'x'.repeat(10001) },
    ])
      assert.throws(() => parseRfo(input(extra)));
    assert.equal(
      h.sqlite.prepare('SELECT count(*) AS n FROM ticket_rfos').get()?.n,
      0,
    );
  }));
void test('dashboard exposes pending/completed RFO without changing counts, and tolerates unprepared RFO schema', async () =>
  fixture(async (h, repo) => {
    const dashboard = new TicketDashboardRepository(h.asD1()),
      filters = parseDashboardFilters(new URLSearchParams());
    const before = await dashboard.query(filters, 'America/Sao_Paulo');
    assert.equal(before.items.find((i) => i.id === 1)?.rfoStatus, null);
    await repo.save(1, 1, input());
    const pending = await dashboard.query(filters, 'America/Sao_Paulo');
    assert.equal(pending.items.find((i) => i.id === 1)?.rfoStatus, 'pending');
    assert.deepEqual(pending.counts, before.counts);
    normalize(h);
    await repo.save(1, 1, completed({ expectedRevision: 1 }));
    assert.equal(
      (await dashboard.query(filters, 'America/Sao_Paulo')).items.find(
        (i) => i.id === 1,
      )?.rfoStatus,
      'completed',
    );
    h.sqlite.exec('DROP TABLE ticket_rfo_revisions; DROP TABLE ticket_rfos');
    const fallback = await dashboard.query(filters, 'America/Sao_Paulo');
    assert.equal(fallback.rfoAvailable, false);
    assert.equal(fallback.items.length, 2);
  }));
void test('HTTP guards validate roles, input/origin/body limits, pagination and conceal storage failures', async () =>
  fixture(async (_h, repo) => {
    const user = (role: AuthUser['role'], id = 1): AuthUser => ({
      id,
      glpiUserId: id,
      name: 'Operador',
      username: 'operador',
      role,
      active: true,
    });
    const api = (identity: AuthUser | null) =>
      createRfoHandlers(
        async () => identity,
        () => repo,
      );
    const req = (body?: unknown, origin?: string) =>
      new Request('https://lastro.invalid/api/tickets/1/rfo', {
        method: body ? 'PUT' : 'GET',
        headers: {
          Cookie: `opuslog_session=${'a'.repeat(43)}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(origin ? { Origin: origin } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    assert.equal((await api(null).GET(req(), '1')).status, 401);
    assert.equal(
      (await api(user('viewer', 4)).PUT(req(input()), '1')).status,
      403,
    );
    assert.equal(
      (
        await api(user('operator')).PUT(
          req(input(), 'https://other.invalid'),
          '1',
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await api(user('operator')).PUT(
          req(input({ notes: 'x'.repeat(66000) })),
          '1',
        )
      ).status,
      413,
    );
    assert.equal(
      (await api(user('operator')).PUT(req(input({ updatedBy: 2 })), '1'))
        .status,
      400,
    );
    const saved = await api(user('operator')).PUT(req(input()), '1');
    assert.equal(saved.status, 200);
    assert.equal(
      ((await saved.json()) as { rfo: { updatedBy: number } }).rfo.updatedBy,
      1,
    );
    assert.equal((await api(user('viewer', 4)).GET(req(), '1')).status, 200);
    assert.equal((await api(user('admin', 3)).GET(req(), 'bad')).status, 400);
    const invalidPage = new Request(
      'https://lastro.invalid/api/tickets/1/rfo?page=0',
      { headers: { Cookie: `opuslog_session=${'a'.repeat(43)}` } },
    );
    assert.equal((await api(user('viewer')).GET(invalidPage, '1')).status, 400);
    const broken = createRfoHandlers(
      async () => user('viewer'),
      () => {
        throw Error('secret SQL');
      },
    );
    const failure = await broken.GET(req(), '1');
    assert.equal(failure.status, 503);
    assert.doesNotMatch(await failure.text(), /secret SQL/);
    assert.equal(saved.headers.get('cache-control'), 'no-store');
  }));
