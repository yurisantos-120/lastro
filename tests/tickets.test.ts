import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import test from 'node:test';
import { D1TicketRepository } from '../db/ticket-storage.ts';
import { GlpiError } from '../services/glpi/glpi-errors.ts';
import type { GlpiTicketService } from '../services/glpi/glpi-ticket-service.ts';
import { TicketWorkflow } from '../services/tickets/ticket-workflow.ts';

interface D1ResultLike {
  success: true;
  meta: { changes: number; last_row_id: number };
  results?: unknown[];
}

class TicketD1Harness {
  readonly sqlite = new DatabaseSync(':memory:');

  prepare(sql: string) {
    let values: unknown[] = [];
    const statement = {
      bind: (...input: unknown[]) => {
        values = input;
        return statement;
      },
      run: async (): Promise<D1ResultLike> => {
        const result = this.sqlite.prepare(sql).run(...(values as SQLInputValue[]));
        return {
          success: true,
          meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) },
        };
      },
      first: async <T>() => this.sqlite.prepare(sql).get(...(values as SQLInputValue[])) as T | undefined ?? null,
      all: async <T>() => ({
        success: true as const,
        results: this.sqlite.prepare(sql).all(...(values as SQLInputValue[])) as T[],
      }),
    };
    return statement;
  }

  asD1(): D1Database {
    return this as unknown as D1Database;
  }

  close() {
    this.sqlite.close();
  }
}

const operationKey = '6a218a31-10a1-4d8c-92e2-6d84a75c0082';
const ticketInput = { operationKey, title: '[TESTE] Falha de rota', content: 'Descricao sintetica para validar o fluxo.' };

async function withRepository<T>(callback: (repository: D1TicketRepository, harness: TicketD1Harness) => Promise<T>) {
  const harness = new TicketD1Harness();
  try {
    harness.sqlite.exec(`
      CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE information (id INTEGER PRIMARY KEY, title TEXT NOT NULL);
      INSERT INTO categories (id, name) VALUES (31, 'existing category');
      INSERT INTO information (id, title) VALUES (47, 'existing record');
    `);
    const migration = readFileSync('drizzle/0004_noisy_rictor.sql', 'utf8')
      .replaceAll('--> statement-breakpoint', '');
    harness.sqlite.exec(migration);
    assert.equal(harness.sqlite.prepare('SELECT name FROM categories WHERE id = 31').get()?.name, 'existing category');
    assert.equal(harness.sqlite.prepare('SELECT title FROM information WHERE id = 47').get()?.title, 'existing record');
    return await callback(new D1TicketRepository(harness.asD1()), harness);
  } finally {
    harness.close();
  }
}

void test('persists the local operation before GLPI, then stores the GLPI ID with nullable authorship', async () => {
  await withRepository(async (repository, harness) => {
    let calls = 0;
    const workflow = new TicketWorkflow(repository, {
      createTicket: async () => { calls += 1; return { id: 45832 }; },
      getTicket: async () => { throw new Error('not used'); },
    } as unknown as GlpiTicketService);

    const result = await workflow.create(ticketInput);
    assert.equal(result.resultState, 'created');
    assert.equal(result.ticket.glpiTicketId, 45832);
    assert.equal(result.ticket.createdBy, null);
    assert.equal(calls, 1);
    assert.equal((await repository.list()).length, 1);
    assert.equal(harness.sqlite.prepare('SELECT result_state FROM tickets WHERE id = ?').get(result.ticket.id)?.result_state, 'created');
  });
});

void test('new authenticated ticket records local createdBy and leaves legacy ticket authorship unchanged', async () => {
  await withRepository(async (repository, harness) => {
    const legacy = await repository.createPending({
      operationKey: 'f335fbc3-2acd-45e1-8e67-0aa93d7d2481',
      title: 'Legacy local ticket',
      content: 'Existing record; keep nullable creator.',
    });
    await repository.markCreated(legacy.ticket.id, { id: 9001 });

    const workflow = new TicketWorkflow(repository, {
      createTicket: async () => ({ id: 9002 }),
      getTicket: async () => { throw new Error('not used'); },
    } as unknown as GlpiTicketService);
    const result = await workflow.create({
      ...ticketInput,
      operationKey: 'd8c99f95-45b2-4f44-a189-32f22b4c1c17',
    }, 73);

    assert.equal(result.ticket.createdBy, 73);
    assert.equal((await repository.getByGlpiId(9001))?.createdBy, null);
    assert.equal(harness.sqlite.prepare('SELECT COUNT(*) AS n FROM tickets').get()?.n, 2);
  });
});

void test('operation key makes repeated requests idempotent and never repeats a GLPI POST', async () => {
  await withRepository(async (repository) => {
    let calls = 0;
    const workflow = new TicketWorkflow(repository, {
      createTicket: async () => { calls += 1; return { id: 123 }; },
      getTicket: async () => { throw new Error('not used'); },
    } as unknown as GlpiTicketService);

    const first = await workflow.create(ticketInput);
    const second = await workflow.create(ticketInput);
    assert.equal(first.resultState, 'created');
    assert.equal(second.resultState, 'created');
    assert.equal(second.reused, true);
    assert.equal(calls, 1);
    assert.equal((await repository.list()).length, 1);
  });
});

void test('uncertain GLPI result is recorded and a duplicate request does not retry', async () => {
  await withRepository(async (repository) => {
    let calls = 0;
    const workflow = new TicketWorkflow(repository, {
      createTicket: async () => { calls += 1; throw new GlpiError('GLPI_TICKET_UNCERTAIN', 503); },
      getTicket: async () => { throw new Error('not used'); },
    } as unknown as GlpiTicketService);

    const first = await workflow.create(ticketInput);
    const duplicate = await workflow.create(ticketInput);
    assert.equal(first.resultState, 'uncertain');
    assert.equal(duplicate.resultState, 'uncertain');
    assert.match(duplicate.message, /Verifique antes/);
    assert.equal(calls, 1);
    assert.equal((await repository.list())[0]?.createdBy, null);
  });
});

void test('definite GLPI rejection is recorded as failed and can be retried only with a new key', async () => {
  await withRepository(async (repository) => {
    let calls = 0;
    const workflow = new TicketWorkflow(repository, {
      createTicket: async () => { calls += 1; throw new GlpiError('GLPI_AUTH_ERROR', 401); },
      getTicket: async () => { throw new Error('not used'); },
    } as unknown as GlpiTicketService);

    const first = await workflow.create(ticketInput);
    const retry = await workflow.create({ ...ticketInput, operationKey: '7a218a31-10a1-4d8c-92e2-6d84a75c0083' });
    assert.equal(first.resultState, 'failed');
    assert.equal(retry.resultState, 'failed');
    assert.equal(calls, 2);
    assert.equal((await repository.list()).length, 2);
  });
});

void test('details query GLPI on demand and synchronize ticket status into the local history', async () => {
  await withRepository(async (repository) => {
    await repository.createPending(ticketInput);
    await repository.markCreated(1, { id: 2468 });
    let calls = 0;
    const workflow = new TicketWorkflow(repository, {
      createTicket: async () => { throw new Error('not used'); },
      getTicket: async (id: number) => { calls += 1; return { id, title: 'Updated title', content: 'Updated content', status: 2, createdAt: '2026-10-05 10:00:00' }; },
    } as unknown as GlpiTicketService);

    const detail = await workflow.detail(2468);
    assert.equal(calls, 1);
    assert.equal(detail.sync.success, true);
    assert.equal(detail.ticket.title, 'Updated title');
    assert.equal(detail.ticket.status, 2);
    assert.ok(detail.ticket.lastSyncedAt);
  });
});

void test('detail sync preserves the diagnostic for a ticket reconciled after an uncertain create', async () => {
  await withRepository(async (repository, harness) => {
    const pending = await repository.createPending(ticketInput);
    await repository.markUncertain(pending.ticket.id, 'GLPI_TICKET_UNCERTAIN');
    harness.sqlite
      .prepare(`UPDATE tickets SET result_state = 'created', glpi_ticket_id = ? WHERE id = ?`)
      .run(2468, pending.ticket.id);

    const synced = await repository.syncFromGlpi({
      id: 2468,
      title: ticketInput.title,
      content: ticketInput.content,
      status: 2,
      createdAt: '2026-10-07 16:02:14',
    });

    assert.equal(synced?.resultState, 'created');
    assert.equal(synced?.failureCode, 'GLPI_TICKET_UNCERTAIN');
    assert.equal(synced?.status, 2);
    assert.ok(synced?.lastSyncedAt);
  });
});

void test('detail sync failure retains the last local ticket without polling', async () => {
  await withRepository(async (repository) => {
    await repository.createPending(ticketInput);
    await repository.markCreated(1, { id: 2468 });
    const workflow = new TicketWorkflow(repository, {
      createTicket: async () => { throw new Error('not used'); },
      getTicket: async () => { throw new GlpiError('GLPI_CONNECTION_ERROR'); },
    } as unknown as GlpiTicketService);

    const detail = await workflow.detail(2468);
    assert.equal(detail.sync.success, false);
    assert.equal(detail.ticket.glpiTicketId, 2468);
    assert.equal(detail.ticket.lastSyncedAt, null);
  });
});

void test('invalid operation key is rejected before local persistence or GLPI access', async () => {
  await withRepository(async (repository) => {
    let calls = 0;
    const workflow = new TicketWorkflow(repository, {
      createTicket: async () => { calls += 1; return { id: 1 }; },
      getTicket: async () => { throw new Error('not used'); },
    } as unknown as GlpiTicketService);

    await assert.rejects(workflow.create({ ...ticketInput, operationKey: 'bad-key' }), { code: 'GLPI_VALIDATION_ERROR' });
    assert.equal(calls, 0);
    assert.equal((await repository.list()).length, 0);
  });
});
