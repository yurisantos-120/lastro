// Writes synthetic fixtures only to a NEW copy of the successfully migrated backup.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync, backup } from 'node:sqlite';
import { createHash, randomBytes } from 'node:crypto';
import { D1Memory } from '../tests/helpers/d1-memory.ts';
import { D1TicketRepository } from '../db/ticket-storage.ts';
import { TicketWorkflow } from '../services/tickets/ticket-workflow.ts';
import { TicketOperationsRepository } from '../db/ticket-operations.ts';
import { TicketDashboardRepository } from '../db/ticket-dashboard.ts';
import { parseDashboardFilters } from '../services/tickets/dashboard.ts';
import { RfoRepository } from '../db/rfo.ts';
import { HandoffRepository } from '../db/handoffs.ts';
import { shiftConfig } from '../services/handoffs/handoffs.ts';
import { GlpiIntegrationRepository } from '../db/glpi-integration.ts';
import { GlpiIntegrationWorkflow } from '../services/glpi/integration-workflow.ts';
import type { GlpiTicketService } from '../services/glpi/glpi-ticket-service.ts';

const root = realpathSync(process.argv[2]);
assert.ok(
  existsSync(join(root, 'simulation-verification.json')),
  'Validate migrated copy before smoke',
);
const manifest = JSON.parse(
  readFileSync(join(root, 'manifest.json'), 'utf8').replace(/^\uFEFF/, ''),
);
assert.equal(manifest.kind, 'lastro-stage6-offline-raw-backup');
const main = manifest.files.find((file: { name: string }) =>
  file.name.endsWith('.sqlite'),
).name as string;
const source = join(
  root,
  'simulation-state/v3/d1/miniflare-D1DatabaseObject',
  main,
);
const target = join(root, `smoke-${crypto.randomUUID()}.sqlite`);
assert.notEqual(realpathSync(source), realpathSync(manifest.source));
const migrated = new DatabaseSync(source, { readOnly: true });
try {
  await backup(migrated, target);
} finally {
  migrated.close();
}
const sqlite = new DatabaseSync(target);
sqlite.exec('PRAGMA foreign_keys=ON');
const adapter = Object.create(D1Memory.prototype) as D1Memory;
Object.defineProperty(adapter, 'sqlite', { value: sqlite });
adapter.beforeRun = null;
const d1 = adapter.asD1(),
  now = new Date('2026-10-22T22:00:00.000Z');
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const priorTables = [
  'users',
  'sessions',
  'tickets',
  'categories',
  'information',
  'auth_bootstrap',
];
const prior = priorTables.map((table) => ({
  table,
  rows: sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all(),
}));
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw new Error('Network forbidden in isolated smoke');
};
const passed: string[] = [];
try {
  const maxGlpi = Number(
    sqlite
      .prepare('SELECT COALESCE(max(glpi_user_id),0) AS n FROM users')
      .get()!.n,
  );
  const actors = [0, 1, 2].map((offset) =>
    Number(
      sqlite
        .prepare(
          `INSERT INTO users(glpi_user_id,name,username,role,active,created_at,updated_at) VALUES(?,?,?,?,1,?,?) RETURNING id`,
        )
        .get(
          maxGlpi + 100 + offset,
          `Homologação isolada ${offset}`,
          `stage6-${crypto.randomUUID()}`,
          offset === 2 ? 'viewer' : 'operator',
          now.toISOString(),
          now.toISOString(),
        )!.id,
    ),
  );
  const token = randomBytes(32).toString('base64url');
  sqlite
    .prepare(
      'INSERT INTO sessions(user_id,token_hash,created_at,last_seen_at,expires_at) VALUES(?,?,?,?,?)',
    )
    .run(
      actors[0],
      hash(token),
      new Date().toISOString(),
      new Date().toISOString(),
      new Date(Date.now() + 86400000).toISOString(),
    );
  const remoteId = Number(
    sqlite
      .prepare(
        'SELECT COALESCE(max(glpi_ticket_id),0)+100000 AS n FROM tickets',
      )
      .get()!.n,
  );
  const remote = {
    id: remoteId,
    title: 'Homologação isolada etapa 6',
    content: 'Conteúdo sintético, sem operação externa',
    status: 2,
  };
  const tickets = new D1TicketRepository(d1);
  const creation = new TicketWorkflow(tickets, {
    createTicket: async () => ({ id: remoteId }),
  } as unknown as GlpiTicketService);
  const request = {
    operationKey: crypto.randomUUID(),
    title: remote.title,
    content: remote.content,
  };
  const created = await creation.create(request, actors[0]);
  assert.equal(created.resultState, 'created');
  const ticketId = created.ticket.id;
  assert.equal((await creation.create(request, actors[0])).reused, true);
  passed.push('creation-and-idempotency-mocked');
  const operations = new TicketOperationsRepository(d1, () => now);
  await operations.save(ticketId, actors[0], {
    operationKey: crypto.randomUUID(),
    expectedRevision: 0,
    state: 'in_progress',
  });
  await assert.rejects(
    operations.save(ticketId, actors[0], {
      operationKey: crypto.randomUUID(),
      expectedRevision: 1,
      state: 'pending',
    }),
  );
  await operations.save(ticketId, actors[0], {
    operationKey: crypto.randomUUID(),
    expectedRevision: 1,
    state: 'pending',
    pendingReason: 'Teste isolado de acesso',
    notes: 'Observação sintética',
  });
  const dashboard = new TicketDashboardRepository(d1);
  const filtered = await dashboard.query(
    parseDashboardFilters(new URLSearchParams(`glpiId=${remoteId}`)),
    'America/Sao_Paulo',
    now,
  );
  assert.equal(filtered.counts.pending, 1);
  assert.equal(filtered.items.length, 1);
  passed.push('operations-pending-history-and-dashboard');
  const rfo = new RfoRepository(d1, () => now);
  await rfo.save(ticketId, actors[0], {
    operationKey: crypto.randomUUID(),
    expectedRevision: 0,
    investigation: 'investigating',
    completion: 'pending',
    technicalDescription: 'Teste técnico isolado',
  });
  await operations.save(ticketId, actors[0], {
    operationKey: crypto.randomUUID(),
    expectedRevision: 2,
    state: 'normalized',
  });
  await rfo.save(ticketId, actors[0], {
    operationKey: crypto.randomUUID(),
    expectedRevision: 1,
    investigation: 'confirmed',
    completion: 'completed',
    cause: 'Causa sintética',
    technicalDescription: 'Descrição sintética',
    solution: 'Solução sintética',
  });
  assert.equal((await rfo.read(ticketId)).rfo?.completion, 'completed');
  passed.push('rfo-investigation-completion-revisions');
  const handoffs = new HandoffRepository(d1, shiftConfig(), () => now);
  const preview = await handoffs.preview();
  assert.ok(preview.items.some((item) => item.id === ticketId));
  const delivered = await handoffs.deliver(actors[0], {
    operationKey: crypto.randomUUID(),
    date: preview.period.date,
    shift: preview.period.shift,
    previewToken: preview.token,
    notes: 'Entrega sintética',
    guidance: '',
  });
  const savedSnapshot = JSON.stringify(delivered.handoff.items);
  await handoffs.receive(delivered.handoff.id, actors[1], crypto.randomUUID());
  passed.push('handoff-delivery-receipt-snapshot');
  const integration = new GlpiIntegrationWorkflow(
    new GlpiIntegrationRepository(d1),
    () => ({
      getTicket: async () => ({ ...remote }),
      updateTicket: async (_id, changes) => {
        Object.assign(remote, changes);
      },
      solveTicket: async () => {
        remote.status = 5;
        return 100001;
      },
      closeTicket: async () => {
        remote.status = 6;
      },
      findSolution: async () => 100001,
    }),
  );
  const integrate = async (action: string, extra = {}) => {
    const local = (await tickets.getByLocalId(ticketId))!;
    return integration.execute(ticketId, actors[0], {
      operationKey: crypto.randomUUID(),
      expectedRevision: local.revision,
      action,
      ...extra,
    });
  };
  assert.equal((await integrate('sync')).operation.state, 'confirmed');
  assert.equal(
    (
      await integrate('update', {
        title: remote.title,
        content: 'Informação sintética atualizada',
      })
    ).operation.state,
    'confirmed',
  );
  assert.equal(
    (await integrate('solution', { content: 'Solução sintética confirmada' }))
      .operation.state,
    'confirmed',
  );
  assert.equal((await tickets.getByLocalId(ticketId))?.status, 5);
  assert.equal((await integrate('close')).operation.state, 'confirmed');
  assert.equal((await tickets.getByLocalId(ticketId))?.status, 6);
  assert.equal(
    (await operations.read(ticketId)).operation?.state,
    'normalized',
  );
  assert.equal(
    JSON.stringify((await handoffs.get(delivered.handoff.id)).items),
    savedSnapshot,
  );
  passed.push(
    'glpi-sync-update-solution-close-mocked-with-preserved-local-state',
  );
  await assert.rejects(
    operations.save(ticketId, actors[2], {
      operationKey: crypto.randomUUID(),
      expectedRevision: 3,
      state: 'in_progress',
    }),
  );
  passed.push('viewer-write-denied');
  for (const { table, rows } of prior)
    for (const row of rows)
      assert.deepEqual(
        sqlite.prepare(`SELECT * FROM ${table} WHERE id=?`).get(row.id),
        row,
      );
  passed.push('all-preexisting-application-rows-unchanged-in-smoke-copy');
  assert.equal(sqlite.prepare('PRAGMA foreign_key_check').all().length, 0);
  assert.equal(
    sqlite.prepare('PRAGMA integrity_check').get()!.integrity_check,
    'ok',
  );
  writeFileSync(
    join(root, 'http-fixture.json'),
    JSON.stringify({
      token,
      ticketId,
      handoffId: delivered.handoff.id,
      smokeDatabase: target,
    }) + '\n',
    { flag: 'wx' },
  );
  writeFileSync(
    join(root, 'smoke-results.json'),
    JSON.stringify(
      {
        status: 'passed',
        passed,
        networkCalls: 0,
        syntheticFixturesOnly: true,
      },
      null,
      2,
    ) + '\n',
    { flag: 'wx' },
  );
  console.log(
    JSON.stringify(
      { status: 'passed', checks: passed, networkCalls: 0 },
      null,
      2,
    ),
  );
} finally {
  globalThis.fetch = originalFetch;
  sqlite.close();
}
