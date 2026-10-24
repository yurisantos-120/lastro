import assert from 'node:assert/strict';
import test from 'node:test';
import { D1Memory } from './helpers/d1-memory.ts';
import { HandoffRepository } from '../db/handoffs.ts';
import { createHandoffHandlers } from '../services/handoffs/handlers.ts';
import {
  parseDelivery,
  redactText,
  shiftConfig,
  shiftPeriod,
  suggestedPeriod,
} from '../services/handoffs/handoffs.ts';
import type { HandoffPreview } from '../services/handoffs/handoffs.ts';
import type { AuthUser } from '../services/auth/auth-types.ts';

const config = shiftConfig(),
  now = new Date('2026-10-22T22:00:00.000Z');
const payload = (
  preview: HandoffPreview,
  changes: Record<string, unknown> = {},
) => ({
  operationKey: crypto.randomUUID(),
  date: preview.period.date,
  shift: preview.period.shift,
  previewToken: preview.token,
  notes: 'Acesso combinado',
  guidance: 'Portaria lateral',
  ...changes,
});
async function fixture(
  action: (h: D1Memory, repo: HandoffRepository) => Promise<void>,
) {
  const h = new D1Memory();
  h.sqlite
    .exec(`INSERT INTO users (id,glpi_user_id,name,username,role,active,created_at,updated_at) VALUES
    (1,11,'Operador A','operator-a','operator',1,'2026-10-01','2026-10-01'),
    (2,12,'Operador B','operator-b','operator',1,'2026-10-01','2026-10-01'),
    (3,13,'Consulta','viewer','viewer',1,'2026-10-01','2026-10-01'),
    (4,14,'Admin','admin','admin',1,'2026-10-01','2026-10-01');`);
  for (let id = 1; id <= 6; id++) {
    h.sqlite
      .prepare(
        `INSERT INTO tickets (id,operation_key,glpi_ticket_id,title,content,status,result_state,created_at,updated_at) VALUES (?,?,?,?,?,?,'created',?,?)`,
      )
      .run(
        id,
        `t${id}`,
        100 + id,
        `Chamado ${id}`,
        'Conteúdo original',
        id === 5 ? 6 : 2,
        '2026-01-01T12:00:00Z',
        '2026-01-01T12:00:00Z',
      );
    const state =
      id === 1
        ? 'in_progress'
        : id === 2
          ? 'pending'
          : id === 6
            ? 'closed'
            : 'normalized';
    h.sqlite
      .prepare(`INSERT INTO ticket_operations (ticket_id,state,pending_reason,notes,guidance,responsible_organization,opened_at,updated_at,updated_by,revision,normalized_at,closed_at)
      VALUES (?,?,?,?,?,?,'2026-01-01T12:00:00Z','2026-10-22T12:00:00Z',1,1,?,?)`)
      .run(
        id,
        state,
        id === 2 ? 'Aguardando acesso' : '',
        `Observação ${id}`,
        'Entrada lateral',
        'Gerência A',
        state === 'normalized' ? '2026-10-22T12:00:00Z' : null,
        state === 'closed' ? '2026-10-22T13:00:00Z' : null,
      );
  }
  try {
    await action(h, new HandoffRepository(h.asD1(), config, () => now));
  } finally {
    h.sqlite.close();
  }
}

void test('configures complementary 12-hour shifts without generating individual schedules', () => {
  assert.deepEqual(config, {
    timeZone: 'America/Sao_Paulo',
    dayStart: '07:00',
    nightStart: '19:00',
    rotation: '12x36',
  });
  assert.equal(
    shiftConfig({
      NOC_DAY_SHIFT_START: '08:30',
      NOC_NIGHT_SHIFT_START: '20:30',
    }).dayStart,
    '08:30',
  );
  for (const env of [
    { NOC_DAY_SHIFT_START: '25:00' },
    { NOC_NIGHT_SHIFT_START: '18:00' },
    { NOC_TIME_ZONE: 'not-a-zone' },
  ])
    assert.throws(() => shiftConfig(env));
});
void test('night shift crosses midnight and boundary selection uses NOC civil time', () => {
  const night = shiftPeriod(config, '2026-10-21', 'night');
  assert.equal(night.startAt, '2026-10-21T22:00:00.000Z');
  assert.equal(night.endAt, '2026-10-22T10:00:00.000Z');
  assert.equal(
    suggestedPeriod(config, new Date('2026-10-22T10:00:00Z')).shift,
    'night',
  );
  assert.equal(
    suggestedPeriod(config, new Date('2026-10-22T22:00:00Z')).shift,
    'day',
  );
  assert.equal(
    suggestedPeriod(config, new Date('2026-10-22T09:59:59Z')).date,
    '2026-10-21',
  );
  assert.throws(() => shiftPeriod(config, '2026-02-30', 'day'));
  const dst = shiftConfig({ NOC_TIME_ZONE: 'America/New_York' });
  const period = shiftPeriod(dst, '2026-03-07', 'night');
  assert.equal(
    (Date.parse(period.endAt) - Date.parse(period.startAt)) / 3600000,
    11,
  );
});
void test('prepares all current required states, includes old incidents and excludes closed normalized calls', async () =>
  fixture(async (_h, repo) => {
    const preview = await repo.preview();
    assert.deepEqual(
      preview.items.map((item) => item.id),
      [1, 2, 3, 4],
    );
    assert.equal(preview.items[1].pendingReason, 'Aguardando acesso');
    assert.equal(preview.items[1].lastObservation, 'Observação 2');
    assert.equal(preview.items[1].responsibleOrganization, 'Gerência A');
    assert.equal(preview.items[1].guidance, 'Entrada lateral');
    await assert.rejects(repo.preview('2026-10-24', 'day'), {
      code: 'FUTURE_SHIFT',
    });
  }));
void test('delivery preserves snapshot, config, optional text and server actor/time without changing calls', async () =>
  fixture(async (h, repo) => {
    const before = h.sqlite.prepare('SELECT * FROM tickets ORDER BY id').all();
    const p = await repo.preview();
    const result = await repo.deliver(1, payload(p));
    assert.equal(result.handoff.deliveredBy, 1);
    assert.equal(result.handoff.deliveredAt, now.toISOString());
    assert.equal(result.handoff.receipt, null);
    assert.equal(result.handoff.notes, 'Acesso combinado');
    assert.deepEqual(
      h.sqlite.prepare('SELECT * FROM tickets ORDER BY id').all(),
      before,
    );
    h.sqlite.exec(
      "UPDATE ticket_operations SET notes='Nova observação',state='in_progress',revision=revision+1 WHERE ticket_id=2; UPDATE tickets SET title='Título novo',revision=revision+1 WHERE id=1;",
    );
    const stored = await repo.get(result.handoff.id);
    assert.equal(stored.items[0].title, 'Chamado 1');
    assert.equal(stored.items[1].state, 'pending');
    assert.equal(stored.items[1].lastObservation, 'Observação 2');
    assert.equal(stored.config.dayStart, '07:00');
  }));
void test('empty summary and optional notes are valid; no fictitious calls are created', async () =>
  fixture(async (h, repo) => {
    h.sqlite.exec(
      "UPDATE ticket_operations SET state='closed',closed_at='2026-10-22T13:00:00Z'",
    );
    const preview = await repo.preview();
    assert.equal(preview.items.length, 0);
    const saved = await repo.deliver(
      1,
      payload(preview, { notes: undefined, guidance: undefined }),
    );
    assert.equal(saved.handoff.notes, '');
    assert.equal(saved.handoff.guidance, '');
    assert.equal(
      h.sqlite.prepare('SELECT count(*) AS n FROM tickets').get()?.n,
      6,
    );
  }));
void test('changed preview or a concurrent source update cannot commit a stale snapshot', async () =>
  fixture(async (h, repo) => {
    const previous = await repo.preview();
    h.sqlite.exec(
      'UPDATE ticket_operations SET revision=revision+1 WHERE ticket_id=1',
    );
    await assert.rejects(repo.deliver(1, payload(previous)), {
      code: 'PREVIEW_CHANGED',
    });
    const latest = await repo.preview();
    let changed = false;
    h.beforeRun = (sql) => {
      if (!changed && sql.startsWith('INSERT INTO shift_handoffs')) {
        changed = true;
        h.sqlite.exec(
          'UPDATE ticket_operations SET revision=revision+1 WHERE ticket_id=2',
        );
      }
    };
    await assert.rejects(repo.deliver(1, payload(latest)), {
      code: 'DELIVERY_CONFLICT',
    });
    assert.equal(
      h.sqlite.prepare('SELECT count(*) AS n FROM shift_handoffs').get()?.n,
      0,
    );
  }));
void test('delivery duplicates reuse exactly one row and reject changed intent or operator', async () =>
  fixture(async (h, repo) => {
    const input = payload(await repo.preview());
    const first = await repo.deliver(1, input);
    const second = await repo.deliver(1, input);
    assert.equal(first.handoff.id, second.handoff.id);
    assert.equal(second.reused, true);
    await assert.rejects(
      repo.deliver(1, { ...input, notes: 'Outra intenção' }),
      { code: 'KEY_CONFLICT' },
    );
    await assert.rejects(repo.deliver(2, input), { code: 'KEY_CONFLICT' });
    assert.equal(
      h.sqlite.prepare('SELECT count(*) AS n FROM shift_handoffs').get()?.n,
      1,
    );
  }));
void test('concurrent delivery requests commit one handoff per period', async () =>
  fixture(async (_h, repo) => {
    const preview = await repo.preview(),
      input = payload(preview);
    const repeated = await Promise.all([
      repo.deliver(1, input),
      repo.deliver(1, input),
    ]);
    assert.equal(repeated.filter((r) => r.reused).length, 1);
    await assert.rejects(repo.deliver(2, payload(preview)), {
      code: 'DELIVERY_CONFLICT',
    });
  }));
void test('next operator receipt is independent and does not change ticket or snapshot state', async () =>
  fixture(async (h, repo) => {
    const saved = await repo.deliver(1, payload(await repo.preview()));
    await assert.rejects(
      repo.receive(saved.handoff.id, 1, crypto.randomUUID()),
      { code: 'SELF_RECEIPT' },
    );
    const before = h.sqlite
      .prepare('SELECT * FROM ticket_operations ORDER BY ticket_id')
      .all();
    const key = crypto.randomUUID(),
      received = await repo.receive(saved.handoff.id, 2, key);
    assert.equal(received.handoff.receipt?.receivedBy, 2);
    assert.equal(received.handoff.receipt?.receivedAt, now.toISOString());
    assert.deepEqual(received.handoff.items, saved.handoff.items);
    assert.deepEqual(
      h.sqlite
        .prepare('SELECT * FROM ticket_operations ORDER BY ticket_id')
        .all(),
      before,
    );
    assert.equal((await repo.receive(saved.handoff.id, 2, key)).reused, true);
    await assert.rejects(
      repo.receive(saved.handoff.id, 4, crypto.randomUUID()),
      { code: 'RECEIPT_CONFLICT' },
    );
    assert.equal((await repo.list()).available, null);
  }));
void test('concurrent distinct receivers cannot overwrite each other', async () =>
  fixture(async (_h, repo) => {
    const saved = await repo.deliver(1, payload(await repo.preview()));
    const results = await Promise.allSettled([
      repo.receive(saved.handoff.id, 2, crypto.randomUUID()),
      repo.receive(saved.handoff.id, 4, crypto.randomUUID()),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  }));

void test('different concurrent delivery keys cannot duplicate a shift and period', async () =>
  fixture(async (h, repo) => {
    const preview = await repo.preview();
    const results = await Promise.allSettled([
      repo.deliver(1, payload(preview)),
      repo.deliver(2, payload(preview)),
    ]);
    assert.equal(
      results.filter((result) => result.status === 'fulfilled').length,
      1,
    );
    assert.equal(
      h.sqlite.prepare('SELECT count(*) AS n FROM shift_handoffs').get()?.n,
      1,
    );
  }));

void test('lost receipt response reuses the existing confirmation without another receiver', async () =>
  fixture(async (h, repo) => {
    const delivered = await repo.deliver(1, payload(await repo.preview()));
    const get = repo.get.bind(repo);
    let reads = 0;
    repo.get = async (id) => {
      if (++reads === 2) throw new Error('receipt confirmation lost');
      return get(id);
    };
    const key = crypto.randomUUID();
    await assert.rejects(
      repo.receive(delivered.handoff.id, 2, key),
      /confirmation lost/,
    );
    const retry = await repo.receive(delivered.handoff.id, 2, key);
    assert.equal(retry.reused, true);
    assert.equal(
      h.sqlite.prepare('SELECT count(*) AS n FROM shift_receipts').get()?.n,
      1,
    );
  }));
void test('failed inserts roll back delivery/receipt and recovery after lost confirmation is idempotent', async () =>
  fixture(async (h, repo) => {
    const input = payload(await repo.preview());
    h.sqlite.exec(
      "CREATE TRIGGER fail_delivery AFTER INSERT ON shift_handoffs BEGIN SELECT RAISE(ABORT,'synthetic delivery failure'); END",
    );
    await assert.rejects(repo.deliver(1, input), /synthetic delivery failure/);
    assert.equal(
      h.sqlite.prepare('SELECT count(*) AS n FROM shift_handoffs').get()?.n,
      0,
    );
    h.sqlite.exec('DROP TRIGGER fail_delivery');
    const read = repo.get.bind(repo);
    let fail = true;
    repo.get = async (id) => {
      if (fail) {
        fail = false;
        throw new Error('lost confirmation');
      }
      return read(id);
    };
    await assert.rejects(repo.deliver(1, input), /lost confirmation/);
    const recovered = await repo.deliver(1, input);
    assert.equal(recovered.reused, true);
    h.sqlite.exec(
      "CREATE TRIGGER fail_receipt AFTER INSERT ON shift_receipts BEGIN SELECT RAISE(ABORT,'synthetic receipt failure'); END",
    );
    const key = crypto.randomUUID();
    await assert.rejects(
      repo.receive(recovered.handoff.id, 2, key),
      /synthetic receipt failure/,
    );
    assert.equal(
      h.sqlite.prepare('SELECT count(*) AS n FROM shift_receipts').get()?.n,
      0,
    );
    h.sqlite.exec('DROP TRIGGER fail_receipt');
    await repo.receive(recovered.handoff.id, 2, key);
    assert.equal(h.sqlite.prepare('PRAGMA foreign_key_check').all().length, 0);
  }));
void test('history is immutable and retains available older handoffs with paginated metadata', async () =>
  fixture(async (h, repo) => {
    const first = await repo.deliver(1, payload(await repo.preview()));
    const another = await repo.preview('2026-10-21', 'night');
    await repo.deliver(2, payload(another));
    assert.equal((await repo.list()).total, 2);
    assert.equal((await repo.list(2)).items.length, 0);
    assert.ok((await repo.list()).available);
    for (const sql of [
      "UPDATE shift_handoffs SET notes='edit'",
      'DELETE FROM shift_handoffs',
    ])
      assert.throws(() => h.sqlite.exec(sql), /immutable/);
    await repo.receive(first.handoff.id, 2, crypto.randomUUID());
    for (const sql of [
      "UPDATE shift_receipts SET received_name='edit'",
      'DELETE FROM shift_receipts',
    ])
      assert.throws(() => h.sqlite.exec(sql), /immutable/);
    assert.throws(
      () => h.sqlite.exec('DELETE FROM users WHERE id=1'),
      /FOREIGN KEY/,
    );
  }));
void test('summary omits recognizable credential material and rejects secrets or spoofed fields in delivery', async () =>
  fixture(async (h, repo) => {
    h.sqlite.exec(
      "UPDATE tickets SET title='password=hidden-value',revision=revision+1 WHERE id=1; UPDATE ticket_operations SET notes='Authorization: Bearer hidden-token',revision=revision+1 WHERE ticket_id=2",
    );
    const preview = await repo.preview();
    assert.doesNotMatch(JSON.stringify(preview), /hidden-value|hidden-token/);
    const saved = await repo.deliver(1, payload(preview));
    assert.doesNotMatch(
      JSON.stringify(saved.handoff),
      /hidden-value|hidden-token/,
    );
    for (const changes of [
      { notes: 'senha=secret-value' },
      { guidance: 'https://user:pass@example.invalid' },
      { deliveredBy: 2 },
      { deliveredAt: 'yesterday' },
    ])
      assert.throws(() => parseDelivery(payload(preview, changes)));
    assert.equal(redactText('Descrição comum'), 'Descrição comum');
  }));
void test('HTTP authorization, bounded bodies, origin and safe errors apply without browser identity', async () =>
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
      createHandoffHandlers(
        async () => identity,
        () => repo,
      );
    const req = (body?: unknown, origin?: string) =>
      new Request('https://lastro.invalid/api/handoffs', {
        method: body ? 'POST' : 'GET',
        headers: {
          Cookie: `opuslog_session=${'a'.repeat(43)}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(origin ? { Origin: origin } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    assert.equal((await api(null).list(req())).status, 401);
    assert.equal((await api(user('viewer')).list(req())).status, 200);
    assert.equal((await api(user('viewer', 3)).deliver(req({}))).status, 403);
    const input = payload(await repo.preview());
    assert.equal(
      (await api(user('operator')).deliver(req(input, 'https://other.invalid')))
        .status,
      403,
    );
    assert.equal(
      (await api(user('operator')).deliver(req({ ...input, deliveredBy: 2 })))
        .status,
      400,
    );
    assert.equal(
      (
        await api(user('operator')).deliver(
          req({ ...input, notes: 'x'.repeat(66000) }),
        )
      ).status,
      413,
    );
    const response = await api(user('operator')).deliver(req(input));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const saved = (await response.json()) as {
      handoff: { id: string; deliveredBy: number };
    };
    assert.equal(saved.handoff.deliveredBy, 1);
    assert.equal(
      (
        await api(user('operator', 2)).receive(
          req({ operationKey: crypto.randomUUID(), receivedBy: 4 }),
          saved.handoff.id,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await api(user('operator', 2)).receive(
          req({ operationKey: crypto.randomUUID() }),
          saved.handoff.id,
        )
      ).status,
      200,
    );
    const broken = createHandoffHandlers(
      async () => user('viewer'),
      () => {
        throw Error('secret database detail');
      },
    );
    const failure = await broken.list(req());
    assert.equal(failure.status, 503);
    assert.doesNotMatch(await failure.text(), /secret database detail/);
    await assert.rejects(repo.deliver(3, input), { code: 'FORBIDDEN' });
    await assert.rejects(
      repo.receive(saved.handoff.id, 99, crypto.randomUUID()),
      { code: 'FORBIDDEN' },
    );
  }));
