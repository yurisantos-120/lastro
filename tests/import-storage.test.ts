import assert from 'node:assert/strict';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import {
  completeImportBatch,
  createImportBatch,
  createImportedRecord,
  failImportBatch,
  findImportRecordBySource,
  getImportBatch,
  ImportStorageError,
  recordImportOutcome,
} from '../db/import-storage.ts';
import type { RecordCreateInput } from '../db/data-types.ts';

interface HarnessStatement {
  run(): Promise<{ success: true; meta: { changes: number; last_row_id: number } }>;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ success: true; results: T[] }>;
}

class SqliteD1Harness {
  private failAtStatement: number | null = null;
  private batchTail: Promise<void> = Promise.resolve();
  readonly sqlite: DatabaseSync;

  constructor(sqlite = new DatabaseSync(':memory:')) {
    this.sqlite = sqlite;
    this.sqlite.exec('PRAGMA foreign_keys = ON');
  }

  prepare(sql: string) {
    let bindings: unknown[] = [];
    const statement = {
      bind: (...values: unknown[]) => {
        bindings = values;
        return statement;
      },
      run: async () => {
        const result = this.sqlite.prepare(sql).run(...(bindings as SQLInputValue[]));
        return { success: true as const, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
      },
      first: async <T>() => (this.sqlite.prepare(sql).get(...(bindings as SQLInputValue[])) as T | undefined) ?? null,
      all: async <T>() => ({ success: true as const, results: this.sqlite.prepare(sql).all(...(bindings as SQLInputValue[])) as T[] }),
    };
    return statement;
  }

  async batch(statements: HarnessStatement[]) {
    const previousBatch = this.batchTail;
    let releaseBatch!: () => void;
    this.batchTail = new Promise<void>((resolve) => {
      releaseBatch = resolve;
    });
    await previousBatch;
    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      const results = [];
      for (const [index, statement] of statements.entries()) {
        if (this.failAtStatement === index) {
          this.failAtStatement = null;
          throw new Error('simulated statement failure');
        }
        results.push(await statement.run());
      }
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    } finally {
      releaseBatch();
    }
  }

  failNextBatchAt(statementIndex: number) {
    this.failAtStatement = statementIndex;
  }

  asD1(): D1Database {
    return this as unknown as D1Database;
  }

  close() {
    this.sqlite.close();
  }
}

const migrationFiles = readdirSync('drizzle').filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();
const migrationSql = (file: string) => readFileSync(`drizzle/${file}`, 'utf8').replaceAll('--> statement-breakpoint', '');

function applyMigrations(db: DatabaseSync, files = migrationFiles) {
  for (const file of files) db.exec(migrationSql(file));
}

function currentHarness() {
  const harness = new SqliteD1Harness();
  applyMigrations(harness.sqlite);
  const now = '2026-10-08T12:00:00.000Z';
  const categoryId = Number(harness.sqlite.prepare(`INSERT INTO categories (name, description, color, scope, created_at, updated_at)
    VALUES ('Pontos teste', 'Fixture', '#336699', 'point', ?, ?) RETURNING id`).get(now, now)?.id);
  harness.sqlite.prepare(`INSERT INTO information (title, category_id, responsible, validation, contact, notes, kind, details_json, updated_at)
    VALUES ('Registro preservado', ?, '', '—', '', '', 'point', '{}', ?)`).run(categoryId, now);
  return { harness, categoryId };
}

function point(categoryId: number, location = 'Unidade de teste'): RecordCreateInput {
  return {
    title: location,
    categoryId,
    responsible: '',
    validation: '—',
    contact: '',
    notes: '',
    recordType: 'point',
    details: { location, partner: 'Parceiro teste', address: 'Endereço sintético' },
  };
}

function source(batchId: string, row = 12, fingerprint = 'b'.repeat(64)) {
  return {
    batchId,
    sourceFileId: 'pontos-operacionais',
    sourceFileName: 'lote-teste.xlsx',
    sourceFileSha256: 'a'.repeat(64),
    sourceSheet: 'Pontos',
    sourceRow: row,
    normalizedFingerprint: fingerprint,
  };
}

async function createBatch(db: D1Database, suffix = 'a') {
  return createImportBatch(db, { sourceManifestId: `manifest-${suffix}`, manifestSha256: suffix.repeat(64) });
}

void test('single tracking migration preserves existing information and adds constrained tables', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  try {
    const migration = migrationFiles.find((file) => file.startsWith('0007_'));
    assert.ok(migration);
    applyMigrations(db, migrationFiles.filter((file) => file !== migration));
    const now = '2026-10-08T12:00:00.000Z';
    db.prepare(`INSERT INTO categories (id, name, description, color, scope, created_at, updated_at)
      VALUES (71, 'Preservada', 'Fixture', '#123456', 'general', ?, ?)`).run(now, now);
    db.prepare(`INSERT INTO information (id, title, category_id, responsible, validation, contact, notes, kind, details_json, updated_at)
      VALUES (91, 'Registro existente', 71, '', '—', '', '', 'general', '{}', ?)`).run(now);
    const before = db.prepare('SELECT id, title, category_id FROM information').get();
    db.exec(migrationSql(migration));
    assert.deepEqual(db.prepare('SELECT id, title, category_id FROM information').get(), before);
    assert.equal(db.prepare(`SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('import_batches','import_records')`).get()?.n, 2);
    const importRecordColumns = db.prepare('PRAGMA table_info(import_records)').all() as Array<{ name: string }>;
    assert.ok(importRecordColumns.some((column) => column.name === 'source_file_id'));
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
  } finally {
    db.close();
  }
});

void test('creates batch and atomically inserts a record with traceable source metadata', async () => {
  const { harness, categoryId } = currentHarness();
  try {
    const db = harness.asD1();
    const batch = await createBatch(db);
    assert.equal(batch.status, 'processing');
    const result = await createImportedRecord(db, source(batch.id), point(categoryId));
    assert.equal(result.outcome, 'inserted');
    if (result.outcome !== 'inserted') return;
    const origin = await findImportRecordBySource(db, {
      sourceFileId: 'pontos-operacionais', sourceFileSha256: 'a'.repeat(64), sourceSheet: 'Pontos', sourceRow: 12, normalizedFingerprint: 'b'.repeat(64),
    });
    assert.equal(origin?.informationId, result.informationId);
    assert.equal(origin?.status, 'inserted');
    assert.equal(origin?.fingerprintMatches, true);
    assert.deepEqual({ ...(await getImportBatch(db, batch.id)) }, {
      ...batch, recordsProcessed: 1, recordsInserted: 1, recordsRejected: 0, recordsIgnored: 0,
    });
    assert.equal(harness.sqlite.prepare('SELECT count(*) AS n FROM information').get()?.n, 2);
    assert.equal(harness.sqlite.prepare('SELECT count(*) AS n FROM import_records').get()?.n, 1);
  } finally {
    harness.close();
  }
});

void test('same source location in a different batch is ignored, including changed fingerprints', async () => {
  const { harness, categoryId } = currentHarness();
  try {
    const db = harness.asD1();
    const firstBatch = await createBatch(db, 'a');
    const secondBatch = await createBatch(db, 'c');
    const original = source(firstBatch.id);
    assert.equal((await createImportedRecord(db, original, point(categoryId))).outcome, 'inserted');
    const retry = await createImportedRecord(db, { ...original, batchId: secondBatch.id }, point(categoryId, 'Alteração não permitida'));
    assert.equal(retry.outcome, 'already_processed');
    if (retry.outcome === 'already_processed') {
      assert.equal(retry.record.batchId, firstBatch.id);
      assert.equal(retry.record.fingerprintMatches, true);
    }
    const changedFileRetry = await createImportedRecord(db, {
      ...original, batchId: secondBatch.id, sourceFileSha256: 'f'.repeat(64), normalizedFingerprint: 'c'.repeat(64),
    }, point(categoryId, 'Alteração de versão não permitida'));
    assert.equal(changedFileRetry.outcome, 'already_processed');
    if (changedFileRetry.outcome === 'already_processed') {
      assert.equal(changedFileRetry.record.fingerprintMatches, false);
      assert.equal(changedFileRetry.record.sourceFileHashMatches, false);
    }
    assert.equal(harness.sqlite.prepare('SELECT count(*) AS n FROM information').get()?.n, 2);
    assert.equal((await getImportBatch(db, secondBatch.id))?.recordsProcessed, 0);
  } finally {
    harness.close();
  }
});

void test('concurrent attempts for the same origin create only one destination record', async () => {
  const { harness, categoryId } = currentHarness();
  try {
    const db = harness.asD1();
    const batch = await createBatch(db);
    const origin = source(batch.id);
    const results = await Promise.all([
      createImportedRecord(db, origin, point(categoryId)),
      createImportedRecord(db, origin, point(categoryId, 'Tentativa concorrente')),
    ]);
    assert.deepEqual(results.map((result) => result.outcome).sort(), ['already_processed', 'inserted']);
    assert.equal(harness.sqlite.prepare('SELECT count(*) AS n FROM information').get()?.n, 2);
    assert.equal(harness.sqlite.prepare('SELECT count(*) AS n FROM import_records').get()?.n, 1);
    assert.equal((await getImportBatch(db, batch.id))?.recordsProcessed, 1);
  } finally {
    harness.close();
  }
});

void test('rejects credential-like fields before writing import metadata or operational data', async () => {
  const { harness, categoryId } = currentHarness();
  try {
    const db = harness.asD1();
    const batch = await createBatch(db);
    const unsafe = point(categoryId);
    unsafe.details = { ...unsafe.details, pppoePassword: 'should-not-be-persisted' };
    await assert.rejects(createImportedRecord(db, source(batch.id), unsafe), (error: unknown) =>
      error instanceof ImportStorageError && error.code === 'SENSITIVE_DATA_REJECTED');
    assert.equal(harness.sqlite.prepare('SELECT count(*) AS n FROM information').get()?.n, 1);
    assert.equal(harness.sqlite.prepare('SELECT count(*) AS n FROM import_records').get()?.n, 0);
  } finally {
    harness.close();
  }
});

void test('a failure within the D1 batch rolls back reservation, destination row, and counters', async () => {
  const { harness, categoryId } = currentHarness();
  try {
    const db = harness.asD1();
    const batch = await createBatch(db);
    harness.failNextBatchAt(2);
    await assert.rejects(createImportedRecord(db, source(batch.id), point(categoryId)), (error: unknown) =>
      error instanceof ImportStorageError && error.code === 'IMPORT_TRANSACTION_FAILED');
    assert.equal(harness.sqlite.prepare('SELECT count(*) AS n FROM information').get()?.n, 1);
    assert.equal(harness.sqlite.prepare('SELECT count(*) AS n FROM import_records').get()?.n, 0);
    assert.equal((await getImportBatch(db, batch.id))?.recordsProcessed, 0);
  } finally {
    harness.close();
  }
});

void test('rejected and ignored rows update counters once and finalize the batch safely', async () => {
  const { harness } = currentHarness();
  try {
    const db = harness.asD1();
    const batch = await createBatch(db);
    const rejected = source(batch.id, 20, 'd'.repeat(64));
    const row = await recordImportOutcome(db, rejected, 'rejected');
    assert.equal('status' in row && row.status, 'rejected');
    const retry = await recordImportOutcome(db, rejected, 'rejected');
    assert.equal('outcome' in retry && retry.outcome, 'already_processed');
    const ignored = source(batch.id, 21, 'e'.repeat(64));
    await recordImportOutcome(db, ignored, 'ignored');
    const completed = await completeImportBatch(db, batch.id);
    assert.equal(completed.status, 'completed_with_errors');
    assert.deepEqual([completed.recordsProcessed, completed.recordsRejected, completed.recordsIgnored], [2, 1, 1]);
    await assert.rejects(recordImportOutcome(db, source(batch.id, 22), 'ignored'), (error: unknown) =>
      error instanceof ImportStorageError && error.code === 'IMPORT_BATCH_NOT_PROCESSING');
    assert.equal(harness.sqlite.prepare('PRAGMA foreign_key_check').all().length, 0);
  } finally {
    harness.close();
  }
});

void test('failed batches are queryable and source names cannot be used as paths', async () => {
  const { harness } = currentHarness();
  try {
    const db = harness.asD1();
    const batch = await createBatch(db);
    await assert.rejects(createImportedRecord(db, { ...source(batch.id), sourceFileName: '..\\outside.xlsx' }, point(1)), (error: unknown) =>
      error instanceof ImportStorageError && error.code === 'INVALID_SOURCE_METADATA');
    const failed = await failImportBatch(db, batch.id);
    assert.equal(failed.status, 'failed');
    assert.ok(failed.completedAt);
    assert.equal((await getImportBatch(db, batch.id))?.status, 'failed');
  } finally {
    harness.close();
  }
});
