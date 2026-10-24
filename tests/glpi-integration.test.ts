import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { D1Memory } from './helpers/d1-memory.ts';
import { GlpiIntegrationRepository } from '../db/glpi-integration.ts';
import { GlpiIntegrationWorkflow } from '../services/glpi/integration-workflow.ts';
import { validateIntegration } from '../services/glpi/integration.ts';
import { createIntegrationHandlers } from '../services/glpi/integration-handlers.ts';
import { GlpiError } from '../services/glpi/glpi-errors.ts';
import { GlpiClient } from '../services/glpi/glpi-client.ts';
import { GlpiTicketService } from '../services/glpi/glpi-ticket-service.ts';
import { readGlpiConfig } from '../services/glpi/glpi-config.ts';
import {
  GlpiUserAuthClient,
  readGlpiUserAuthConfig,
} from '../services/glpi/glpi-user-auth.ts';
import { TicketWorkflow } from '../services/tickets/ticket-workflow.ts';
import type { AuthUser } from '../services/auth/auth-types.ts';

void test('solution pagination handles an exact full last page and rejects markers duplicated across pages', async () => {
  const key = crypto.randomUUID(),
    marker = `[LASTRO:${key}]`;
  for (const duplicate of [false, true]) {
    let pages = 0;
    const service = new GlpiTicketService(
      new GlpiClient(config, async (url) => {
        const path = requestUrl(url);
        if (path.endsWith('/initSession'))
          return Response.json({ session_token: 'session' });
        if (path.endsWith('/killSession')) return Response.json({});
        pages++;
        if (pages === 1)
          return Response.json(
            Array.from({ length: 100 }, (_, index) => ({
              id: 1000 + index,
              itemtype: 'Ticket',
              items_id: 101,
              content: index === 0 ? marker : 'Outra solução',
            })),
          );
        return duplicate
          ? Response.json([
              { id: 2000, itemtype: 'Ticket', items_id: 101, content: marker },
            ])
          : Response.json(['ERROR_RANGE_EXCEED_TOTAL', 'end'], { status: 400 });
      }),
    );
    if (duplicate) await assert.rejects(service.findSolution(101, key));
    else assert.equal(await service.findSolution(101, key), 1000);
    assert.equal(pages, 2);
  }
});

const requestUrl = (value: RequestInfo | URL) =>
  typeof value === 'string'
    ? value
    : value instanceof URL
      ? value.href
      : value.url;
const env = {
  GLPI_API_VERSION: 'v1',
  GLPI_BASE_URL: 'https://glpi.example.invalid/apirest.php',
  GLPI_USER_TOKEN: 'synthetic-only',
};
const config = readGlpiConfig(env);
const input = (action = 'sync', changes: Record<string, unknown> = {}) => ({
  operationKey: crypto.randomUUID(),
  action,
  expectedRevision: 1,
  ...changes,
});
void test('additive migration preserves existing records and creates no fictional integration history', () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec('PRAGMA foreign_keys=ON');
    for (const file of readdirSync('drizzle')
      .filter((file) => /^\d{4}_.+\.sql$/.test(file) && file < '0011_')
      .sort())
      sqlite.exec(
        readFileSync(`drizzle/${file}`, 'utf8').replaceAll(
          '--> statement-breakpoint',
          '',
        ),
      );
    sqlite.exec(
      "INSERT INTO tickets(id,operation_key,glpi_ticket_id,title,content,result_state,status,created_at,updated_at) VALUES(1,'existing',101,'Legado','Descrição preservada','created',2,'2026-01-01','2026-01-01')",
    );
    const before = sqlite.prepare('SELECT * FROM tickets').get();
    sqlite.exec(
      readFileSync('drizzle/0011_glpi_reconciliation.sql', 'utf8').replaceAll(
        '--> statement-breakpoint',
        '',
      ),
    );
    const after = sqlite.prepare('SELECT * FROM tickets').get()!;
    assert.equal(after.creation_fingerprint, null);
    delete after.creation_fingerprint;
    assert.deepEqual(after, before);
    assert.equal(
      sqlite.prepare('SELECT count(*) AS n FROM glpi_operations').get()?.n,
      0,
    );
    assert.equal(
      sqlite.prepare('SELECT count(*) AS n FROM glpi_operation_events').get()
        ?.n,
      0,
    );
  } finally {
    sqlite.close();
  }
});
const user: AuthUser = {
  id: 1,
  glpiUserId: 11,
  name: 'Operador',
  username: 'op',
  role: 'operator',
  active: true,
};
function setup() {
  // Keep isolated fixtures closeable even when a test throws.
  const h = new D1Memory();
  h.sqlite
    .exec(`INSERT INTO users(id,glpi_user_id,name,username,role,active,created_at,updated_at) VALUES
    (1,11,'Operador','op','operator',1,'2026-01-01','2026-01-01'),(2,12,'Consulta','read','viewer',1,'2026-01-01','2026-01-01'),(3,13,'Admin','admin','admin',1,'2026-01-01','2026-01-01');
    INSERT INTO tickets(id,operation_key,glpi_ticket_id,title,content,result_state,status,created_at,updated_at) VALUES
    (1,'old',101,'Falha de equipamento','Descrição','created',2,'2026-01-01','2026-01-01'),
    (2,'uncertain',NULL,'Incerto','Conteúdo','uncertain',NULL,'2026-01-01','2026-01-01');
    INSERT INTO ticket_operations(ticket_id,state,pending_reason,opened_at,updated_at,updated_by,revision) VALUES(1,'pending','Aguardando módulo','2026-01-01','2026-01-01',1,1);`);
  const repo = new GlpiIntegrationRepository(h.asD1());
  const calls: string[] = [];
  const remote = {
    id: 101,
    title: 'Falha de equipamento',
    content: 'Descrição',
    status: 2,
  };
  const api = {
    getTicket: async (id: number) => {
      calls.push('GET');
      return { ...remote, id };
    },
    updateTicket: async (
      _id: number,
      changes: { title: string; content: string },
    ) => {
      calls.push('PUT');
      Object.assign(remote, changes);
    },
    solveTicket: async () => {
      calls.push('POST solution');
      remote.status = 5;
      return 501;
    },
    closeTicket: async () => {
      calls.push('PUT close');
      remote.status = 6;
    },
    findSolution: async () => {
      calls.push('GET solution');
      return 501 as number | null;
    },
  };
  const workflow = new GlpiIntegrationWorkflow(repo, () => api);
  return { h, repo, calls, remote, api, workflow };
}

void test('D1 trigger-inclusive write counts preserve execution, confirmation and idempotency', async () => {
  const s = setup();
  s.h.includeTriggerChanges = true;
  try {
    const request = input();
    const saved = await s.workflow.execute(1, 1, request);
    assert.equal(saved.reused, false);
    assert.equal(saved.operation.state, 'confirmed');
    assert.equal((await s.repo.read(1)).events.length, 2);
    const replay = await s.workflow.execute(1, 1, request);
    assert.equal(replay.reused, true);
    assert.equal(replay.operation.state, 'confirmed');
    assert.equal((await s.repo.read(1)).events.length, 2);
    assert.equal((await s.repo.read(1)).ticket.status, s.remote.status);
  } finally {
    s.h.sqlite.close();
  }
});

void test('sync records chronology, official status and divergence without changing local operation or other modules', async () => {
  const s = setup();
  try {
    s.h.sqlite
      .exec(`INSERT INTO ticket_rfos(ticket_id,glpi_ticket_id,investigation,completion,created_at,updated_at,updated_by,revision) VALUES(1,101,'investigating','pending','2026-01-01','2026-01-01',1,1);
      INSERT INTO shift_handoffs(id,operation_key,request_hash,period_key,config_json,period_json,snapshot_json,delivered_by,delivered_name,delivered_at) VALUES('handoff','handoff','hash','period','{}','{}','{"tickets":[{"id":1,"status":2}]}',1,'Operador','2026-01-01');`);
    const priorRfo = s.h.sqlite.prepare('SELECT * FROM ticket_rfos').all(),
      priorHandoff = s.h.sqlite.prepare('SELECT * FROM shift_handoffs').all();
    const before = s.h.sqlite.prepare('SELECT * FROM ticket_operations').all();
    s.remote.status = 6;
    const saved = await s.workflow.execute(1, 1, input());
    assert.equal(saved.operation.state, 'confirmed');
    const read = await s.repo.read(1);
    assert.equal(read.ticket.status, 6);
    assert.ok(read.divergence);
    assert.ok(read.ticket.lastSyncedAt);
    assert.equal(read.events.length, 2);
    assert.deepEqual(
      s.h.sqlite.prepare('SELECT * FROM ticket_operations').all(),
      before,
    );
    assert.deepEqual(
      s.h.sqlite.prepare('SELECT * FROM ticket_rfos').all(),
      priorRfo,
    );
    assert.deepEqual(
      s.h.sqlite.prepare('SELECT * FROM shift_handoffs').all(),
      priorHandoff,
    );
    const events = s.h.sqlite
      .prepare('SELECT * FROM glpi_operation_events ORDER BY id')
      .all();
    assert.ok(String(events[0].recorded_at) <= String(events[1].recorded_at));
    assert.throws(
      () => s.h.sqlite.exec('UPDATE glpi_operation_events SET revision=99'),
      /immutable/,
    );
    assert.throws(
      () => s.h.sqlite.exec('DELETE FROM glpi_operation_events'),
      /immutable/,
    );
  } finally {
    s.h.sqlite.close();
  }
});
void test('solution confirms status 5 separately from official close; close needs a fresh solved ticket', async () => {
  const s = setup();
  try {
    const refused = await s.workflow.execute(1, 1, input('close'));
    assert.equal(refused.operation.code, 'NOT_SOLVED');
    assert.ok(!s.calls.includes('PUT close'));
    const solved = await s.workflow.execute(
      1,
      1,
      input('solution', { expectedRevision: 2, content: 'Módulo substituído' }),
    );
    assert.equal(solved.operation.state, 'confirmed');
    assert.equal((await s.repo.read(1)).ticket.status, 5);
    assert.equal(solved.operation.solutionId, 501);
    const closed = await s.workflow.execute(
      1,
      1,
      input('close', { expectedRevision: 3 }),
    );
    assert.equal(closed.operation.state, 'confirmed');
    assert.equal((await s.repo.read(1)).ticket.status, 6);
    assert.equal(
      s.h.sqlite.prepare('SELECT state FROM ticket_operations').get()?.state,
      'pending',
    );
  } finally {
    s.h.sqlite.close();
  }
});
void test('auto-close after solution is recognized only by the remote status 6', async () => {
  const s = setup();
  try {
    s.api.solveTicket = async () => {
      s.remote.status = 6;
      return 501;
    };
    const result = await s.workflow.execute(
      1,
      1,
      input('solution', { content: 'Serviço restabelecido' }),
    );
    assert.equal(result.operation.state, 'confirmed');
    assert.equal((await s.repo.read(1)).ticket.status, 6);
  } finally {
    s.h.sqlite.close();
  }
});
void test('confirmed updates require read-back matching the requested content; mismatches stay uncertain', async () => {
  const s = setup();
  try {
    const result = await s.workflow.execute(
      1,
      1,
      input('update', {
        title: 'Título revisto',
        content: 'Informação confirmada',
      }),
    );
    assert.equal(result.operation.state, 'confirmed');
    assert.equal((await s.repo.read(1)).ticket.title, 'Título revisto');
    s.api.updateTicket = async () => {
      s.calls.push('PUT');
    };
    const mismatch = await s.workflow.execute(
      1,
      1,
      input('update', {
        expectedRevision: 2,
        title: 'Outro título',
        content: 'Outra informação',
      }),
    );
    assert.equal(mismatch.operation.state, 'uncertain');
    await assert.rejects(
      s.workflow.execute(1, 1, input('sync', { expectedRevision: 3 })),
      /pendente/,
    );
  } finally {
    s.h.sqlite.close();
  }
});
void test('idempotency binds actor, ticket and payload; concurrent duplicate requests produce one external write', async () => {
  const s = setup();
  try {
    const request = input('solution', { content: 'Equipamento substituído' });
    const results = await Promise.all([
      s.workflow.execute(1, 1, request),
      s.workflow.execute(1, 1, request),
    ]);
    assert.equal(s.calls.filter((call) => call === 'POST solution').length, 1);
    assert.equal(results.filter((r) => r.reused).length, 1);
    const replay = await s.workflow.execute(1, 1, request);
    assert.equal(replay.reused, true);
    await assert.rejects(s.workflow.execute(1, 3, request), /outra intenção/);
    await assert.rejects(
      s.workflow.execute(1, 1, { ...request, content: 'Diferente' }),
      /outra intenção/,
    );
  } finally {
    s.h.sqlite.close();
  }
});
void test('different keys are serialized while a write is in flight', async () => {
  const s = setup();
  try {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    s.api.solveTicket = async () => {
      await gate;
      s.remote.status = 5;
      return 501;
    };
    const first = s.workflow.execute(
      1,
      1,
      input('solution', { content: 'Solução' }),
    );
    while (!(await s.repo.read(1)).active)
      await new Promise((resolve) => setTimeout(resolve, 0));
    await assert.rejects(
      s.workflow.execute(1, 1, input('solution', { content: 'Outra solução' })),
      /pendente/,
    );
    release();
    assert.equal((await first).operation.state, 'confirmed');
  } finally {
    s.h.sqlite.close();
  }
});
void test('lost solution response stays locked and reconciliation performs only reads with stable identity marker', async () => {
  const s = setup();
  try {
    s.api.solveTicket = async () => {
      s.calls.push('POST solution');
      s.remote.status = 5;
      throw new GlpiError('GLPI_TICKET_UNCERTAIN', 503);
    };
    const request = input('solution', { content: 'Reparo' });
    const result = await s.workflow.execute(1, 1, request);
    assert.equal(result.operation.state, 'uncertain');
    await s.workflow.execute(1, 1, request);
    assert.equal(s.calls.filter((c) => c === 'POST solution').length, 1);
    s.api.findSolution = async () => null;
    let reconciled = await s.workflow.reconcile(1, 1, result.operation.id);
    assert.equal(reconciled.operation.state, 'uncertain');
    s.api.findSolution = async () => 501;
    reconciled = await s.workflow.reconcile(1, 1, result.operation.id);
    assert.equal(reconciled.operation.state, 'confirmed');
    assert.equal(s.calls.filter((c) => c === 'POST solution').length, 1);
  } finally {
    s.h.sqlite.close();
  }
});
void test('a successful write followed by forbidden confirmation is uncertain, not a safe failure', async () => {
  const s = setup();
  try {
    let reads = 0;
    s.api.getTicket = async () => {
      if (++reads > 1) throw new GlpiError('GLPI_FORBIDDEN', 403);
      return { ...s.remote };
    };
    const result = await s.workflow.execute(
      1,
      1,
      input('solution', { content: 'Reparo' }),
    );
    assert.equal(result.operation.state, 'uncertain');
  } finally {
    s.h.sqlite.close();
  }
});
void test('close timeout never claims official closure; read reconciliation verifies status 6 without resending', async () => {
  const s = setup();
  try {
    s.remote.status = 5;
    s.api.closeTicket = async () => {
      s.calls.push('PUT close');
      throw new GlpiError('GLPI_TICKET_UNCERTAIN', 503);
    };
    const result = await s.workflow.execute(1, 1, input('close'));
    assert.equal(result.operation.state, 'uncertain');
    assert.equal((await s.repo.read(1)).ticket.status, 5);
    assert.equal(
      (await s.workflow.reconcile(1, 1, result.operation.id)).operation.state,
      'uncertain',
    );
    s.remote.status = 6;
    assert.equal(
      (await s.workflow.reconcile(1, 1, result.operation.id)).operation.state,
      'confirmed',
    );
    assert.equal(s.calls.filter((c) => c === 'PUT close').length, 1);
  } finally {
    s.h.sqlite.close();
  }
});
void test('network failure before dispatch and definite upstream denial are failures without fictional success', async () => {
  const s = setup();
  try {
    s.api.getTicket = async () => {
      throw new GlpiError('GLPI_CONNECTION_ERROR');
    };
    assert.equal(
      (await s.workflow.execute(1, 1, input())).operation.state,
      'failed',
    );
    assert.equal((await s.repo.read(1)).ticket.status, 2);
    s.api.getTicket = async () => ({ ...s.remote });
    s.api.solveTicket = async () => {
      throw new GlpiError('GLPI_FORBIDDEN', 403);
    };
    assert.equal(
      (await s.workflow.execute(1, 1, input('solution', { content: 'Reparo' })))
        .operation.state,
      'failed',
    );
  } finally {
    s.h.sqlite.close();
  }
});
void test('history failure rolls back reservation and prevents external dispatch', async () => {
  const s = setup();
  try {
    s.h.sqlite.exec(
      `CREATE TRIGGER fail_event BEFORE INSERT ON glpi_operation_events BEGIN SELECT RAISE(ABORT,'test'); END;`,
    );
    await assert.rejects(s.workflow.execute(1, 1, input()), /Nenhum envio/);
    assert.deepEqual(s.calls, []);
    assert.equal(
      s.h.sqlite.prepare('SELECT count(*) AS n FROM glpi_operations').get()?.n,
      0,
    );
  } finally {
    s.h.sqlite.close();
  }
});
void test('confirmation failure rolls back cache and event; pending reservation remains reconcilable', async () => {
  const s = setup();
  try {
    s.h.sqlite.exec(
      `CREATE TRIGGER fail_confirm BEFORE INSERT ON glpi_operation_events WHEN NEW.revision>1 BEGIN SELECT RAISE(ABORT,'test'); END;`,
    );
    const before = s.h.sqlite.prepare('SELECT * FROM tickets WHERE id=1').get();
    await assert.rejects(
      s.workflow.execute(1, 1, input('solution', { content: 'Reparo' })),
      /reconcilie/,
    );
    assert.deepEqual(
      s.h.sqlite.prepare('SELECT * FROM tickets WHERE id=1').get(),
      before,
    );
    const active = (await s.repo.read(1)).active!;
    assert.equal(active.state, 'pending');
    s.h.sqlite.exec('DROP TRIGGER fail_confirm');
    assert.equal(
      (await s.workflow.reconcile(1, 1, active.id)).operation.state,
      'confirmed',
    );
  } finally {
    s.h.sqlite.close();
  }
});
void test('operator cannot forge authorship, timestamps, credentials or administration rights', async () => {
  const s = setup();
  try {
    for (const changes of [
      { actorId: 3 },
      { updatedAt: '2030-01-01' },
      { content: 'password=unsafe', action: 'solution' },
      { action: 'close', status: 6 },
      { action: 'solution', content: '<script>token=x</script>' },
    ])
      assert.throws(() => validateIntegration(input('sync', changes)));
    await assert.rejects(s.workflow.execute(1, 2, input()), /autorizado/);
    await assert.rejects(
      s.workflow.execute(
        2,
        1,
        input('associate', {
          candidateId: 202,
          attestation: 'Conferido manualmente',
        }),
      ),
      /autorizado/,
    );
    await assert.rejects(s.workflow.execute(2, 1, input()), /abertura/);
    assert.deepEqual(s.calls, []);
  } finally {
    s.h.sqlite.close();
  }
});
void test('uncertain creation is associated only by explicit admin review and matching free remote ID', async () => {
  const s = setup();
  try {
    s.remote.title = 'Incerto';
    s.remote.content = 'Conteúdo';
    const result = await s.workflow.execute(
      2,
      3,
      input('associate', {
        candidateId: 202,
        attestation: 'Origem e horário conferidos no GLPI',
      }),
    );
    assert.equal(result.operation.state, 'confirmed');
    const read = await s.repo.read(2);
    assert.equal(read.ticket.glpiTicketId, 202);
    assert.equal(read.ticket.resultState, 'created');
    assert.equal(read.ticket.createdBy, null);
    assert.ok(read.events.length);
    assert.deepEqual(s.calls, ['GET']);
  } finally {
    s.h.sqlite.close();
  }
});
void test('creation association rejects mismatch, occupied GLPI ID and recently pending creation', async () => {
  const s = setup();
  try {
    const result = await s.workflow.execute(
      2,
      3,
      input('associate', { candidateId: 101, attestation: 'Revisão' }),
    );
    assert.equal(result.operation.state, 'failed');
    assert.equal((await s.repo.read(2)).ticket.glpiTicketId, null);
    s.h.sqlite
      .prepare(
        `UPDATE tickets SET result_state='pending',updated_at=? WHERE id=2`,
      )
      .run(new Date().toISOString());
    await assert.rejects(
      s.workflow.execute(
        2,
        3,
        input('associate', { candidateId: 202, attestation: 'Revisão' }),
      ),
      /dois minutos/,
    );
  } finally {
    s.h.sqlite.close();
  }
});
void test('concurrent reconciliation preserves one terminal confirmation and chronological history', async () => {
  const s = setup();
  try {
    s.api.solveTicket = async () => {
      throw new GlpiError('GLPI_TICKET_UNCERTAIN');
    };
    const result = await s.workflow.execute(
      1,
      1,
      input('solution', { content: 'Reparo' }),
    );
    s.remote.status = 5;
    const outcomes = await Promise.allSettled([
      s.workflow.reconcile(1, 1, result.operation.id),
      s.workflow.reconcile(1, 3, result.operation.id),
    ]);
    assert.ok(outcomes.some((r) => r.status === 'fulfilled'));
    assert.equal((await s.repo.get(result.operation.id))?.state, 'confirmed');
    assert.equal(
      s.h.sqlite
        .prepare(
          `SELECT count(*) AS n FROM glpi_operation_events WHERE revision=3`,
        )
        .get()?.n,
      1,
    );
  } finally {
    s.h.sqlite.close();
  }
});
void test('API guards, pagination, strict input and safe unavailable errors use local IDs', async () => {
  const s = setup();
  try {
    const headers = {
      cookie: `opuslog_session=${'a'.repeat(43)}`,
      'Content-Type': 'application/json',
    };
    const api = createIntegrationHandlers(
      async () => user,
      () => s.workflow,
    );
    const request = (
      body: unknown,
      url = 'https://lastro.example.invalid/api/tickets/1/integration',
    ) =>
      new Request(url, { method: 'POST', headers, body: JSON.stringify(body) });
    assert.equal(
      (
        await api.GET(
          new Request('https://lastro.example.invalid/?page=0', { headers }),
          '1',
        )
      ).status,
      400,
    );
    assert.equal(
      (await api.POST(request({ ...input(), actorId: 3 }), '1')).status,
      400,
    );
    assert.equal(
      (
        await api.POST(
          new Request('https://lastro.example.invalid/', {
            method: 'POST',
            headers: { ...headers, Origin: 'https://evil.invalid' },
            body: '{}',
          }),
          '1',
        )
      ).status,
      403,
    );
    assert.equal(
      (await api.POST(request({ large: 'x'.repeat(66000) }), '1')).status,
      413,
    );
    assert.equal(
      (
        await api.GET(
          new Request('https://lastro.example.invalid/', { headers }),
          '101',
        )
      ).status,
      404,
    );
    const viewer = createIntegrationHandlers(
      async () => ({ ...user, role: 'viewer' }),
      () => {
        throw new Error('must not call');
      },
    );
    assert.equal(
      (
        await viewer.GET(
          new Request('https://lastro.example.invalid/', { headers }),
          '1',
        )
      ).status,
      403,
    );
    const noauth = createIntegrationHandlers(
      async () => null,
      () => s.workflow,
    );
    assert.equal(
      (
        await noauth.GET(
          new Request('https://lastro.example.invalid/', { headers }),
          '1',
        )
      ).status,
      401,
    );
    const unavailable = createIntegrationHandlers(
      async () => user,
      () => {
        throw new Error('private SQL token');
      },
    );
    const response = await unavailable.GET(
      new Request('https://lastro.example.invalid/', { headers }),
      '1',
    );
    assert.equal(response.status, 503);
    assert.ok(!(await response.text()).includes('private SQL'));
    for (let i = 0; i < 22; i++)
      await s.workflow.execute(
        1,
        1,
        input('sync', { expectedRevision: 1 + i }),
      );
    const first = await s.repo.read(1, 1),
      second = await s.repo.read(1, 2);
    assert.equal(first.operations.length, 20);
    assert.equal(second.operations.length, 2);
    assert.equal(
      new Set([...first.operations, ...second.operations].map((o) => o.id))
        .size,
      22,
    );
  } finally {
    s.h.sqlite.close();
  }
});
void test('integration foreign keys and immutable request protect referential integrity', async () => {
  const s = setup();
  try {
    const result = await s.workflow.execute(1, 1, input());
    assert.throws(
      () => s.h.sqlite.exec('DELETE FROM tickets WHERE id=1'),
      /FOREIGN KEY/,
    );
    assert.throws(
      () => s.h.sqlite.exec('DELETE FROM users WHERE id=1'),
      /FOREIGN KEY/,
    );
    assert.throws(
      () =>
        s.h.sqlite
          .prepare(
            'UPDATE glpi_operations SET remote_id=202,revision=revision+1 WHERE id=?',
          )
          .run(result.operation.id),
      /invalid integration/,
    );
  } finally {
    s.h.sqlite.close();
  }
});
void test('creation replay compares initial payload and server actor before reusing the key', async () => {
  const s = setup();
  try {
    const workflow = new TicketWorkflow(s.repo.tickets, {
      createTicket: async () => ({ id: 202 }),
    } as unknown as GlpiTicketService);
    const request = {
      operationKey: crypto.randomUUID(),
      title: 'Novo',
      content: 'Detalhe',
    };
    await workflow.create(request, 1);
    await s.repo.tickets.syncFromGlpi({
      id: 202,
      title: 'Título remoto novo',
      content: 'Conteúdo editado no GLPI',
      status: 2,
    });
    await assert.rejects(workflow.create({ ...request, title: 'Alterado' }, 1));
    await assert.rejects(workflow.create(request, 3));
    assert.equal((await workflow.create(request, 1)).reused, true);
    assert.throws(
      () =>
        s.h.sqlite.exec(
          "UPDATE tickets SET creation_fingerprint='forged' WHERE glpi_ticket_id=202",
        ),
      /immutable/,
    );
  } finally {
    s.h.sqlite.close();
  }
});

void test('SEC01: HTTP variants and direct client construction reject before fetch; HTTPS and copied config remain legitimate', async () => {
  let calls = 0;
  const http: typeof fetch = async () => {
    calls++;
    return Response.json({ session_token: 'synthetic-session' });
  };
  for (const url of [
    'http://glpi.example.invalid/apirest.php',
    'HTTP://glpi.example.invalid/apirest.php',
    'http://127.0.0.1/apirest.php',
    'http:\\glpi.example.invalid\\apirest.php',
    ' https://user:pass@glpi.example.invalid/apirest.php',
  ]) {
    assert.throws(() => readGlpiConfig({ ...env, GLPI_BASE_URL: url }));
    assert.throws(() => readGlpiUserAuthConfig({ ...env, GLPI_BASE_URL: url }));
    assert.throws(() => new GlpiClient({ ...config, baseUrl: url }, http));
    assert.throws(
      () => new GlpiUserAuthClient({ ...config, baseUrl: url }, http),
    );
  }
  assert.equal(calls, 0);
  const mutable = { ...config };
  const client = new GlpiClient(mutable, async (url, options) => {
    assert.ok(requestUrl(url).startsWith('https:'));
    assert.equal(options?.redirect, 'manual');
    return http(url, options);
  });
  mutable.baseUrl = 'http://glpi.example.invalid/apirest.php';
  await client.initSession();
  assert.equal(calls, 1);
});
void test('private GLPI HTTP requires an exact pinned RFC1918 host and keeps corporate identity flow', async () => {
  const privateUrl = 'http://10.42.0.8:8080/glpi/apirest.php';
  const options = { ...env, GLPI_BASE_URL: privateUrl, GLPI_PRIVATE_HTTP_HOST: '10.42.0.8' };
  const technical = readGlpiConfig(options);
  const humanConfig = readGlpiUserAuthConfig(options);
  assert.equal(technical.baseUrl, privateUrl);
  assert.equal(humanConfig.baseUrl, privateUrl);
  assert.equal(technical.privateHttpHost, '10.42.0.8');
  assert.equal(humanConfig.privateHttpHost, '10.42.0.8');
  for (const host of [undefined, '10.42.0.9', '203.0.113.7', '127.0.0.1', '10.042.0.8']) {
    assert.throws(() => readGlpiConfig({ ...options, GLPI_PRIVATE_HTTP_HOST: host }));
    assert.throws(() => readGlpiUserAuthConfig({ ...options, GLPI_PRIVATE_HTTP_HOST: host }));
  }
  for (const url of [
    'http://203.0.113.7/glpi/apirest.php',
    'http://glpi.internal/glpi/apirest.php',
    'http://169.254.1.1/glpi/apirest.php',
    'http://[fc00::1]/glpi/apirest.php',
    'http://10.42.0.8@203.0.113.7/glpi/apirest.php',
    'http://10.42.0.8/glpi/apirest.php?next=1',
    'http:\\10.42.0.8\\glpi\\apirest.php',
  ]) {
    assert.throws(() => readGlpiConfig({ ...options, GLPI_BASE_URL: url }));
    assert.throws(() => readGlpiUserAuthConfig({ ...options, GLPI_BASE_URL: url }));
    assert.throws(() => new GlpiClient({ ...technical, baseUrl: url }));
    assert.throws(() => new GlpiUserAuthClient({ ...humanConfig, baseUrl: url }));
  }
  const calls: string[] = [];
  const responses = [
    Response.json({ session_token: 'synthetic-session' }),
    Response.json({ session: { glpiID: 8102, glpiname: 'Operator.Test', glpifirstname: 'Test', glpirealname: 'Operator' } }),
    Response.json({ success: true }),
  ];
  const human = new GlpiUserAuthClient(humanConfig, async (url, init) => {
    calls.push(requestUrl(url));
    assert.equal(init?.redirect, 'manual');
    return responses.shift()!;
  });
  assert.deepEqual(await human.authenticate('synthetic-user', 'synthetic-password'), {
    glpiUserId: 8102, username: 'Operator.Test', name: 'Test Operator',
  });
  assert.deepEqual(calls.map((url) => new URL(url).pathname.split('/').pop()), ['initSession', 'getFullSession', 'killSession']);
  const technicalCalls: string[] = [];
  const client = new GlpiClient(technical, async (url, init) => {
    technicalCalls.push(requestUrl(url));
    assert.equal(init?.redirect, 'manual');
    return Response.json({ session_token: 'synthetic-technical-session' });
  });
  assert.equal(await client.initSession(), 'synthetic-technical-session');
  assert.deepEqual(technicalCalls, [`${privateUrl}/initSession`]);
  let redirectCalls = 0;
  const redirect: typeof fetch = async () => {
    redirectCalls += 1;
    return new Response(null, { status: 302, headers: { Location: 'http://203.0.113.7/glpi/apirest.php' } });
  };
  await assert.rejects(new GlpiUserAuthClient(humanConfig, redirect).authenticate('synthetic-user', 'synthetic-password'));
  await assert.rejects(new GlpiClient(technical, redirect).initSession());
  assert.equal(redirectCalls, 2);
});
void test('explicit HTTP host permits one pinned non-private IP without changing GLPI identity flow', async () => {
  const baseUrl = 'http://203.0.113.7/glpi/apirest.php';
  const options = { ...env, GLPI_BASE_URL: baseUrl, GLPI_HTTP_HOST: '203.0.113.7' };
  const technical = readGlpiConfig(options);
  const humanConfig = readGlpiUserAuthConfig(options);
  assert.equal(technical.baseUrl, baseUrl);
  assert.equal(humanConfig.baseUrl, baseUrl);
  assert.equal(technical.httpHost, '203.0.113.7');
  assert.equal(humanConfig.httpHost, '203.0.113.7');

  for (const host of [undefined, '203.0.113.8', 'glpi.example.invalid', '127.0.0.1', '203.000.113.7']) {
    assert.throws(() => readGlpiConfig({ ...options, GLPI_HTTP_HOST: host }));
    assert.throws(() => readGlpiUserAuthConfig({ ...options, GLPI_HTTP_HOST: host }));
  }
  for (const url of [
    'http://203.0.113.8/glpi/apirest.php',
    'http://203.0.113.7@203.0.113.8/glpi/apirest.php',
    'http://203.0.113.7/glpi/apirest.php?next=1',
    'http:\\203.0.113.7\\glpi\\apirest.php',
  ]) {
    assert.throws(() => readGlpiConfig({ ...options, GLPI_BASE_URL: url }));
    assert.throws(() => readGlpiUserAuthConfig({ ...options, GLPI_BASE_URL: url }));
    assert.throws(() => new GlpiClient({ ...technical, baseUrl: url }));
    assert.throws(() => new GlpiUserAuthClient({ ...humanConfig, baseUrl: url }));
  }
  assert.throws(() => readGlpiConfig({ ...options, GLPI_PRIVATE_HTTP_HOST: '10.42.0.8' }));
  assert.throws(() => readGlpiUserAuthConfig({ ...options, GLPI_PRIVATE_HTTP_HOST: '10.42.0.8' }));

  const requests: Array<{ url: string; init: RequestInit }> = [];
  const responses = [
    Response.json({ session_token: 'synthetic-session' }),
    Response.json({ session: { glpiID: 8102, glpiname: 'Operator.Test' } }),
    Response.json({ success: true }),
  ];
  const client = new GlpiUserAuthClient(humanConfig, async (url, init) => {
    requests.push({ url: requestUrl(url), init: init ?? {} });
    return responses.shift()!;
  });
  assert.deepEqual(await client.authenticate('synthetic-user', 'synthetic-password'), {
    glpiUserId: 8102, username: 'Operator.Test', name: 'Operator.Test',
  });
  assert.deepEqual(requests.map((request) => request.url), [
    `${baseUrl}/initSession`, `${baseUrl}/getFullSession`, `${baseUrl}/killSession`,
  ]);
  assert.ok(new Headers(requests[0].init.headers).has('Authorization'));
  assert.equal(new Headers(requests[1].init.headers).has('Authorization'), false);
  assert.equal(new Headers(requests[2].init.headers).has('Authorization'), false);
  assert.ok(requests.every((request) => request.init.redirect === 'manual'));

  let calls = 0;
  const technicalClient = new GlpiClient(technical, async (url) => {
    calls++;
    assert.equal(requestUrl(url), `${baseUrl}/initSession`);
    return Response.json({ session_token: 'synthetic-technical-session' });
  });
  assert.equal(await technicalClient.initSession(), 'synthetic-technical-session');
  assert.equal(calls, 1);
});
void test('GLPI 9.5.4 PUT contract, solution payload/marker and read-only reconciliation are validated with mocked fetch', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const replies = [
    Response.json({ session_token: 'session' }),
    Response.json([{ 101: true }]),
    Response.json({}),
    Response.json({ session_token: 'session' }),
    Response.json({ id: 501 }),
    Response.json({}),
    Response.json({ session_token: 'session' }),
    Response.json([
      {
        id: 501,
        itemtype: 'Ticket',
        items_id: 101,
        content: '<p>[LASTRO:ab819a31-10a1-4d8c-92e2-6d84a75c0082]</p>',
      },
    ]),
    Response.json({}),
  ];
  const service = new GlpiTicketService(
    new GlpiClient(config, async (url, init) => {
      calls.push({ url: requestUrl(url), init });
      assert.ok(replies.length);
      return replies.shift()!;
    }),
  );
  await service.closeTicket(101);
  assert.equal(calls[1].init?.method, 'PUT');
  assert.deepEqual(JSON.parse(calls[1].init?.body as string), {
    input: { id: 101, status: 6 },
  });
  await service.solveTicket(
    101,
    'Troca <módulo>',
    'ab819a31-10a1-4d8c-92e2-6d84a75c0082',
  );
  const posted = JSON.parse(calls[4].init?.body as string);
  assert.equal(posted.input.itemtype, 'Ticket');
  assert.ok(posted.input.content.includes('&lt;módulo&gt;'));
  assert.ok(
    posted.input.content.includes(
      '[LASTRO:ab819a31-10a1-4d8c-92e2-6d84a75c0082]',
    ),
  );
  assert.equal(
    await service.findSolution(101, 'ab819a31-10a1-4d8c-92e2-6d84a75c0082'),
    501,
  );
  assert.ok(calls[7].url.endsWith('Ticket/101/ITILSolution?range=0-99'));
});
void test('writes treat 5xx, network loss, invalid JSON and false PUT acknowledgement as uncertain without retry', async () => {
  for (const reply of [
    () => Response.json({}, { status: 503 }),
    () => new Response('broken'),
    () => Response.json([{ 101: false }]),
    () => {
      throw new Error('lost');
    },
  ]) {
    let writes = 0;
    const service = new GlpiTicketService(
      new GlpiClient(config, async (url, init) => {
        if (requestUrl(url).endsWith('/initSession'))
          return Response.json({ session_token: 'session' });
        if (init?.method === 'PUT') {
          writes++;
          return reply();
        }
        return Response.json({});
      }),
    );
    await assert.rejects(
      service.closeTicket(101),
      (error: unknown) =>
        error instanceof GlpiError && error.code === 'GLPI_TICKET_UNCERTAIN',
    );
    assert.equal(writes, 1);
  }
});

void test('SEC01: human client copies HTTPS config and both clients reject downgrade redirects without following them', async () => {
  const mutable = readGlpiUserAuthConfig(env);
  let calls = 0;
  const http: typeof fetch = async (url, options) => {
    calls++;
    assert.ok(requestUrl(url).startsWith('https:'));
    assert.equal(options?.redirect, 'manual');
    return new Response(null, {
      status: 302,
      headers: { Location: 'http://glpi.example.invalid/apirest.php' },
    });
  };
  const human = new GlpiUserAuthClient(mutable, http);
  mutable.baseUrl = 'http://glpi.example.invalid/apirest.php';
  await assert.rejects(
    human.authenticate('synthetic-user', 'synthetic-password'),
  );
  assert.equal(calls, 1);
  await assert.rejects(new GlpiClient(config, http).initSession());
  assert.equal(calls, 2);
});
void test('write timeout is ambiguous and has no automatic retry', async () => {
  let writes = 0;
  const service = new GlpiTicketService(
    new GlpiClient(
      { ...config, ticketCreateTimeoutMs: 5 },
      async (url, options) => {
        if (requestUrl(url).endsWith('/initSession'))
          return Response.json({ session_token: 'session' });
        if (options?.method === 'PUT') {
          writes++;
          return new Promise<Response>((_resolve, reject) =>
            options.signal?.addEventListener('abort', () =>
              reject(new Error('timeout')),
            ),
          );
        }
        return Response.json({});
      },
    ),
  );
  await assert.rejects(
    service.closeTicket(101),
    (error: unknown) =>
      error instanceof GlpiError && error.code === 'GLPI_TICKET_UNCERTAIN',
  );
  assert.equal(writes, 1);
});
void test('remote edits block stale replacement, and cache-write failure rolls back the integration confirmation', async () => {
  const s = setup();
  try {
    s.remote.title = 'Alteração externa';
    const blocked = await s.workflow.execute(
      1,
      1,
      input('update', { title: 'Substituir', content: 'Substituir' }),
    );
    assert.equal(blocked.operation.code, 'REMOTE_CHANGED');
    assert.ok(!s.calls.includes('PUT'));
    s.h.sqlite.exec(
      `CREATE TRIGGER fail_cache BEFORE UPDATE ON tickets BEGIN SELECT RAISE(ABORT,'cache failure'); END;`,
    );
    await assert.rejects(
      s.workflow.execute(
        1,
        1,
        input('solution', { expectedRevision: 2, content: 'Reparo' }),
      ),
      /reconcilie/,
    );
    const operation = (await s.repo.read(1)).active!;
    assert.equal(operation.state, 'pending');
    assert.equal((await s.repo.read(1)).ticket.status, 2);
    s.h.sqlite.exec('DROP TRIGGER fail_cache');
    assert.equal(
      (await s.workflow.reconcile(1, 1, operation.id)).operation.state,
      'confirmed',
    );
  } finally {
    s.h.sqlite.close();
  }
});
void test('invalid IDs, unsupported status and credential-bearing solution are rejected without a write', async () => {
  let calls = 0;
  const service = new GlpiTicketService(
    new GlpiClient(config, async (url) => {
      calls++;
      return requestUrl(url).endsWith('/initSession')
        ? Response.json({ session_token: 'session' })
        : requestUrl(url).endsWith('/killSession')
          ? Response.json({})
          : Response.json({
              id: 101,
              name: 'Título',
              content: 'Texto',
              status: 99,
            });
    }),
  );
  await assert.rejects(service.closeTicket(-1));
  await assert.rejects(
    service.solveTicket(101, 'password=unsafe', crypto.randomUUID()),
  );
  assert.equal(calls, 0);
  await assert.rejects(
    service.getTicket(101),
    (error: unknown) =>
      error instanceof GlpiError && error.code === 'GLPI_INVALID_RESPONSE',
  );
});
