import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import test from 'node:test';
import { insertCategory, insertRecord, updateCategoryRow, updateRecordRow } from './helpers/legacy-persistence.ts';
import { queryCatalog } from '../db/catalog-pagination.ts';
import { DataStorageError } from '../db/data-errors.ts';
import { createDataHandlers } from '../app/api/data/handlers.ts';
import { D1Memory } from './helpers/d1-memory.ts';
import type { CategoryCreateInput, CategoryUpdateInput, RecordCreateInput, RecordUpdateInput } from '../db/data-types.ts';

interface StatementResult {
  success: true;
  meta: { changes: number; last_row_id: number };
  results?: unknown[] | null;
}

async function readCatalog(db: D1Database) {
  const categories = await queryCatalog(db, { resource: 'categories', page: 1, pageSize: 100, q: '' }) as { categories: unknown[] };
  const records = await queryCatalog(db, { resource: 'records', page: 1, pageSize: 100, q: '' }) as { records: unknown[] };
  return { categories: categories.categories, records: records.records };
}

class SqliteD1Harness {
  readonly sqlite = new DatabaseSync(':memory:');
  readonly preparedSql: string[] = [];
  private batchTail: Promise<void> = Promise.resolve();
  private failNextBatchAt: number | null = null;
  private failOnBatchNumber: number | null = null;
  private batchNumber = 0;

  constructor(migrated = true) {
    if (!migrated) return;
    for (const file of readdirSync('drizzle').filter((name) => /^000[0-3]_.+\.sql$/.test(name)).sort()) {
      this.sqlite.exec(readFileSync(`drizzle/${file}`, 'utf8').replaceAll('--> statement-breakpoint', ''));
    }
  }

  prepare(sql: string) {
    this.preparedSql.push(sql);
    let bindings: unknown[] = [];
    const statement = {
      bind: (...values: unknown[]) => {
        bindings = values;
        return statement;
      },
      run: async (): Promise<StatementResult> => {
        const prepared = this.sqlite.prepare(sql);
        if (prepared.columns().length) return {
          success: true,
          results: prepared.all(...(bindings as SQLInputValue[])),
          meta: { changes: 0, last_row_id: 0 },
        };
        const result = prepared.run(...(bindings as SQLInputValue[]));
        return {
          success: true,
          meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) },
        };
      },
      first: async <T>(): Promise<T | null> => {
        return (this.sqlite.prepare(sql).get(...(bindings as SQLInputValue[])) as T | undefined) ?? null;
      },
      all: async <T>(): Promise<{ success: true; results: T[] }> => {
        return { success: true, results: this.sqlite.prepare(sql).all(...(bindings as SQLInputValue[])) as T[] };
      },
    };
    return statement;
  }

  async batch(statements: Array<ReturnType<SqliteD1Harness['prepare']>>) {
    const previous = this.batchTail;
    let release = () => {};
    this.batchTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    this.batchNumber += 1;
    const shouldFail = this.batchNumber === this.failOnBatchNumber;
    const failureAt = shouldFail ? this.failNextBatchAt : null;
    if (shouldFail) {
      this.failOnBatchNumber = null;
      this.failNextBatchAt = null;
    }
    try {
      this.sqlite.exec('BEGIN IMMEDIATE');
      const results: StatementResult[] = [];
      for (const [index, statement] of statements.entries()) {
        if (index === failureAt) throw new Error('Simulated statement failure');
        results.push(await statement.run());
      }
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    } finally {
      release();
    }
  }

  failNextBatchAtStatement(index: number) {
    this.failNextBatchAt = index;
    this.failOnBatchNumber = this.batchNumber + 2;
  }

  asD1(): D1Database {
    return this as unknown as D1Database;
  }

  close() {
    this.sqlite.close();
  }
}

const category = (name: string): CategoryCreateInput => ({
  name,
  description: 'Categoria temporária do teste',
  color: '#336699',
  scope: 'vlan',
});

const vlanRecord = (categoryId: number, title: string): RecordCreateInput => ({
  title,
  categoryId,
  responsible: '',
  validation: '—',
  contact: '',
  notes: '',
  recordType: 'vlan',
  details: { vlanNumber: title, neighborhood: 'Teste' },
});

async function withDatabase(callback: (harness: SqliteD1Harness) => Promise<void>) {
  const harness = new SqliteD1Harness();
  try {
    await callback(harness);
  } finally {
    harness.close();
  }
}

async function addGeneralFixture(db: D1Database) {
  await readCatalog(db);
  const categoryId = await insertCategory(db, {
    name: 'Rotas de teste',
    description: 'Categoria criada explicitamente pelo teste',
    color: '#ff6b2c',
    scope: 'general',
  });
  const recordId = await insertRecord(db, {
    title: 'Rota de teste',
    categoryId,
    responsible: 'Equipe de teste',
    validation: '—',
    contact: '',
    notes: '',
    recordType: 'general',
    details: {},
  });
  return { categoryId, recordId };
}

void test('uses native integer primary keys for rapid category and record inserts', async () => {
  await withDatabase(async (harness) => {
    const db = harness.asD1();
    await readCatalog(db);

    const firstCategoryId = await insertCategory(db, category('VLAN A'));
    const secondCategoryId = await insertCategory(db, category('VLAN B'));
    const firstRecordId = await insertRecord(db, vlanRecord(firstCategoryId, '101'));
    const secondRecordId = await insertRecord(db, vlanRecord(secondCategoryId, '102'));

    assert.notEqual(firstCategoryId, secondCategoryId);
    assert.notEqual(firstRecordId, secondRecordId);
    assert.equal(harness.sqlite.prepare('SELECT COUNT(*) AS total FROM categories WHERE id IN (?, ?)').get(firstCategoryId, secondCategoryId)?.total, 2);
    assert.equal(harness.sqlite.prepare('SELECT COUNT(*) AS total FROM information WHERE id IN (?, ?)').get(firstRecordId, secondRecordId)?.total, 2);
  });
});

void test('repeated catalog reads execute SELECT only and create no records', async () => {
  await withDatabase(async (harness) => {
    const db = harness.asD1();
    await Promise.all([readCatalog(db), readCatalog(db), readCatalog(db)]);
    await readCatalog(db);

    assert.equal(harness.sqlite.prepare('SELECT COUNT(*) AS total FROM categories').get()?.total, 0);
    assert.equal(harness.sqlite.prepare('SELECT COUNT(*) AS total FROM information').get()?.total, 0);
    assert.equal(harness.preparedSql.length, 16);
    assert.ok(harness.preparedSql.every((sql) => /^SELECT\b/.test(sql)));
  });
});

void test('catalog reads preserve existing category and information rows', async () => {
  await withDatabase(async (harness) => {
    const db = harness.asD1();
    const { categoryId, recordId } = await addGeneralFixture(db);
    const beforeCategory = harness.sqlite.prepare('SELECT * FROM categories WHERE id = ?').get(categoryId);
    const beforeRecord = harness.sqlite.prepare('SELECT * FROM information WHERE id = ?').get(recordId);
    await readCatalog(db);

    assert.deepEqual(harness.sqlite.prepare('SELECT * FROM categories WHERE id = ?').get(categoryId), beforeCategory);
    assert.deepEqual(harness.sqlite.prepare('SELECT * FROM information WHERE id = ?').get(recordId), beforeRecord);
    assert.equal(harness.sqlite.prepare('SELECT COUNT(*) AS total FROM categories').get()?.total, 1);
    assert.equal(harness.sqlite.prepare('SELECT COUNT(*) AS total FROM information').get()?.total, 1);
  });
});

void test('manual category and information creation still works after migrations', async () => {
  await withDatabase(async (harness) => {
    const db = harness.asD1();
    await readCatalog(db);
    const categoryId = await insertCategory(db, { ...category('Categoria própria'), scope: 'general' });
    const recordId = await insertRecord(db, {
      title: 'Registro manual', categoryId, responsible: 'Operação', validation: '—', contact: '', notes: '',
      recordType: 'general', details: {},
    });
    await readCatalog(db);
    assert.equal(harness.sqlite.prepare('SELECT COUNT(*) AS total FROM categories').get()?.total, 1);
    assert.equal(harness.sqlite.prepare('SELECT COUNT(*) AS total FROM information').get()?.total, 1);
    assert.equal(harness.sqlite.prepare('SELECT title FROM information WHERE id = ?').get(recordId)?.title, 'Registro manual');
  });
});

void test('GET on a missing or legacy schema returns a controlled error without creating tables or changing rows', async () => {
  for (const legacy of [false, true]) {
    const harness = new SqliteD1Harness(false);
    try {
      if (legacy) {
        harness.sqlite.exec(readFileSync('drizzle/0000_blushing_kitty_pryde.sql', 'utf8').replaceAll('--> statement-breakpoint', ''));
        harness.sqlite.prepare("INSERT INTO categories (id,name,description,color,created_at,updated_at) VALUES (1,'Legada','Descrição','#123456','2026-10-01','2026-10-01')").run();
      }
      const beforeSchema = harness.sqlite.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name").all();
      const beforeRows = legacy ? harness.sqlite.prepare('SELECT * FROM categories').all() : [];
      const api = createDataHandlers({
        read: () => readCatalog(harness.asD1()),
        execute: async () => { throw new Error('unexpected write'); },
        recover: async () => null,
      }, 1);
      const response = await api.GET(new Request('http://local/api/data?resource=records'));
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), {
        error: 'Banco de dados desatualizado. Aplique as migrations pendentes.', code: 'SCHEMA_OUTDATED',
      });
      assert.deepEqual(harness.sqlite.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name").all(), beforeSchema);
      if (legacy) assert.deepEqual(harness.sqlite.prepare('SELECT * FROM categories').all(), beforeRows);
      assert.ok(harness.preparedSql.every((sql) => /^SELECT\b/.test(sql)));
    } finally { harness.close(); }
  }
});

void test('GET reads a migrated schema without DDL and preserves its records', async () => {
  await withDatabase(async (harness) => {
    const { categoryId, recordId } = await addGeneralFixture(harness.asD1());
    const beforeCategory = harness.sqlite.prepare('SELECT * FROM categories WHERE id=?').get(categoryId);
    const beforeRecord = harness.sqlite.prepare('SELECT * FROM information WHERE id=?').get(recordId);
    harness.preparedSql.length = 0;
    const api = createDataHandlers({
      read: () => readCatalog(harness.asD1()),
      execute: async () => { throw new Error('unexpected write'); },
      recover: async () => null,
    }, 1);
    const response = await api.GET(new Request('http://local/api/data?resource=records'));
    assert.equal(response.status, 200);
    const body = await response.json() as { categories: Array<{ id: number }>; records: Array<{ id: number }> };
    assert.deepEqual(body.categories.map((item) => item.id), [categoryId]);
    assert.deepEqual(body.records.map((item) => item.id), [recordId]);
    assert.equal(harness.preparedSql.length, 4);
    assert.ok(harness.preparedSql.every((sql) => /^SELECT\b/.test(sql)));
    assert.deepEqual(harness.sqlite.prepare('SELECT * FROM categories WHERE id=?').get(categoryId), beforeCategory);
    assert.deepEqual(harness.sqlite.prepare('SELECT * FROM information WHERE id=?').get(recordId), beforeRecord);
  });
});

void test('catalog reads also work on an isolated database with migrations through 0012', async () => {
  const harness = new D1Memory();
  try {
    assert.deepEqual(await readCatalog(harness.asD1()), { categories: [], records: [] });
    assert.equal(harness.sqlite.prepare('SELECT COUNT(*) AS n FROM data_operations').get()?.n, 0);
  } finally { harness.sqlite.close(); }
});

void test('keeps category scope changes compatible with linked records', async () => {
  await withDatabase(async (harness) => {
    const db = harness.asD1();
    await readCatalog(db);
    const { categoryId, recordId } = await addGeneralFixture(db);
    const update = {
      id: categoryId,
      revision: 1,
      name: 'Trechos de fibra',
      description: 'Categoria seed',
      color: '#ff6b2c',
      scope: 'vlan',
    } as CategoryUpdateInput;

    await assert.rejects(updateCategoryRow(db, update), (error: unknown) => error instanceof DataStorageError && error.code === 'CATEGORY_SCOPE_CONFLICT');
    await assert.rejects(updateRecordRow(db, { ...vlanRecord(categoryId, 'VLAN 20 — teste'), id: 99999, revision: 1 } as RecordUpdateInput), (error: unknown) => error instanceof DataStorageError && error.code === 'RECORD_NOT_FOUND');
    assert.equal(harness.sqlite.prepare('SELECT scope FROM categories WHERE id = ?').get(categoryId)?.scope, 'general');
    assert.equal(harness.sqlite.prepare('SELECT id FROM information WHERE id = ?').get(recordId)?.id, recordId);
  });
});

void test('persists valid category and record updates', async () => {
  await withDatabase(async (harness) => {
    const db = harness.asD1();
    await readCatalog(db);
    const { categoryId, recordId } = await addGeneralFixture(db);
    await updateCategoryRow(db, {
      id: categoryId,
      revision: 1,
      name: 'Rotas atualizadas',
      description: 'Descrição atualizada',
      color: '#123456',
      scope: 'general',
    });
    await updateRecordRow(db, {
      id: recordId,
      revision: 1,
      title: 'Rota atualizada',
      categoryId,
      responsible: 'Equipe NOC',
      validation: 'Designação atualizada',
      contact: 'Canal operacional',
      notes: 'Edição persistida',
      recordType: 'general',
      details: {},
    });

    assert.equal(harness.sqlite.prepare('SELECT name FROM categories WHERE id = ?').get(categoryId)?.name, 'Rotas atualizadas');
    assert.equal(harness.sqlite.prepare('SELECT title, notes FROM information WHERE id = ?').get(recordId)?.title, 'Rota atualizada');
    assert.equal(harness.sqlite.prepare('SELECT notes FROM information WHERE id = ?').get(recordId)?.notes, 'Edição persistida');
    assert.equal(harness.sqlite.prepare('SELECT revision FROM categories WHERE id = ?').get(categoryId)?.revision, 2);
    assert.equal(harness.sqlite.prepare('SELECT revision FROM information WHERE id = ?').get(recordId)?.revision, 2);
  });
});

void test('starts new rows at revision 1 and rejects stale record and category updates', async () => {
  await withDatabase(async (harness) => {
    const db = harness.asD1();
    await readCatalog(db);
    const categoryId = await insertCategory(db, category('VLAN C'));
    const recordId = await insertRecord(db, vlanRecord(categoryId, '103'));
    assert.equal(harness.sqlite.prepare('SELECT revision FROM categories WHERE id = ?').get(categoryId)?.revision, 1);
    assert.equal(harness.sqlite.prepare('SELECT revision FROM information WHERE id = ?').get(recordId)?.revision, 1);

    const categoryUpdate = { id: categoryId, revision: 1, name: 'VLAN C editada', description: 'Atualizada', color: '#336699', scope: 'vlan' } as CategoryUpdateInput;
    const recordUpdate = { ...vlanRecord(categoryId, 'VLAN 103 — atualizado'), id: recordId, revision: 1 } as RecordUpdateInput;
    await Promise.all([updateCategoryRow(db, categoryUpdate), updateRecordRow(db, recordUpdate)]);
    await assert.rejects(updateCategoryRow(db, { ...categoryUpdate, name: 'Categoria obsoleta' }), (error: unknown) => error instanceof DataStorageError && error.code === 'REVISION_CONFLICT');
    await assert.rejects(updateRecordRow(db, { ...recordUpdate, title: 'VLAN 103 — obsoleto', details: { vlanNumber: '103', neighborhood: 'Obsoleto' } }), (error: unknown) => error instanceof DataStorageError && error.code === 'REVISION_CONFLICT');

    assert.equal(harness.sqlite.prepare('SELECT name, revision FROM categories WHERE id = ?').get(categoryId)?.name, 'VLAN C editada');
    assert.equal(harness.sqlite.prepare('SELECT revision FROM categories WHERE id = ?').get(categoryId)?.revision, 2);
    assert.equal(harness.sqlite.prepare('SELECT title, revision FROM information WHERE id = ?').get(recordId)?.title, 'VLAN 103 — atualizado');
    assert.equal(harness.sqlite.prepare('SELECT revision FROM information WHERE id = ?').get(recordId)?.revision, 2);
  });
});

void test('persists expanded point connectivity details in details_json', async () => {
  await withDatabase(async (harness) => {
    const db = harness.asD1();
    await readCatalog(db);
    const categoryId = await insertCategory(db, { ...category('Pontos técnicos'), scope: 'point' });
    const recordId = await insertRecord(db, {
      title: 'Unidade de teste', categoryId, responsible: '', validation: '—', contact: '', notes: '', recordType: 'point',
      details: {
        location: 'Unidade de teste', partner: 'Parceiro', address: 'Rua de teste', provider: 'Provedor',
        onuIdentifier: 'ONU-123', macAddress: 'AA:BB:CC:DD:EE:FF', activationDate: '2026-10-08',
      },
    });
    const detailsJson = harness.sqlite.prepare('SELECT details_json FROM information WHERE id = ?').get(recordId)?.details_json;
    assert.deepEqual(JSON.parse(String(detailsJson)), {
      location: 'Unidade de teste', partner: 'Parceiro', address: 'Rua de teste', provider: 'Provedor',
      onuIdentifier: 'ONU-123', macAddress: 'AA:BB:CC:DD:EE:FF', activationDate: '2026-10-08',
    });
  });
});

void test('allows only one of two concurrent updates based on the same revision', async () => {
  await withDatabase(async (harness) => {
    const db = harness.asD1();
    await readCatalog(db);
    const { categoryId, recordId } = await addGeneralFixture(db);
    const categoryBase = { id: categoryId, revision: 1, description: 'Concorrência', color: '#ff6b2c', scope: 'general' } as CategoryUpdateInput;
    const recordBase = { id: recordId, revision: 1, categoryId, responsible: 'NOC', validation: '—', contact: '', notes: '', recordType: 'general', details: {} } as RecordUpdateInput;
    const categoryResults = await Promise.allSettled([
      updateCategoryRow(db, { ...categoryBase, name: 'Cliente A' }),
      updateCategoryRow(db, { ...categoryBase, name: 'Cliente B' }),
    ]);
    const recordResults = await Promise.allSettled([
      updateRecordRow(db, { ...recordBase, title: 'Cliente A' }),
      updateRecordRow(db, { ...recordBase, title: 'Cliente B' }),
    ]);
    for (const results of [categoryResults, recordResults]) {
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      const rejected = results.find((result) => result.status === 'rejected');
      assert.ok(rejected?.status === 'rejected' && rejected.reason instanceof DataStorageError && rejected.reason.code === 'REVISION_CONFLICT');
    }
    assert.equal(harness.sqlite.prepare('SELECT revision FROM categories WHERE id = 1').get()?.revision, 2);
    assert.equal(harness.sqlite.prepare('SELECT revision FROM information WHERE id = 1').get()?.revision, 2);
  });
});

void test('does not persist an insert rejected by a database constraint', async () => {
  await withDatabase(async (harness) => {
    const db = harness.asD1();
    await readCatalog(db);
    const invalidCategory = { ...category('Sem nome'), name: null } as unknown as CategoryCreateInput;
    await assert.rejects(insertCategory(db, invalidCategory));
    assert.equal(harness.sqlite.prepare('SELECT COUNT(*) AS total FROM categories').get()?.total, 0);
  });
});
