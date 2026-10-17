import { env } from 'cloudflare:workers';
import type { CategoryCreateInput, CategoryUpdateInput, RecordCreateInput, RecordUpdateInput, RecordDetails } from './data-types';
import { ensureDatabase as ensureDatabaseSchema, insertCategory, insertRecord, updateCategoryRow, updateRecordRow } from './persistence';

function database() {
  if (!env.DB) throw new Error('Banco de dados DB indisponível.');
  return env.DB;
}

export async function ensureDatabase() {
  const db = database();
  await ensureDatabaseSchema(db);
}

export async function readAll() {
  await ensureDatabase();
  const db = database();
  const [categories, records] = await Promise.all([
    db.prepare('SELECT id, name, description, color, scope, revision FROM categories ORDER BY created_at ASC').all(),
    db.prepare(`SELECT id, title, category_id AS categoryId, responsible, validation, contact, notes, kind, details_json AS detailsJson, revision, CASE WHEN datetime(updated_at) >= datetime('now', '-1 day') THEN 'Hoje' ELSE substr(updated_at, 1, 10) END AS updated FROM information ORDER BY updated_at DESC`).all(),
  ]);
  const normalizedRecords = records.results.map((row) => {
    const item = row as Record<string, unknown>;
    let details: RecordDetails = {};
    try {
      const parsed: unknown = JSON.parse(typeof item.detailsJson === 'string' ? item.detailsJson : '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        details = Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
      }
    } catch { details = {}; }
    const { detailsJson: _detailsJson, ...record } = item;
    return { ...record, details };
  });
  return { categories: categories.results, records: normalizedRecords };
}

export async function createCategory(data: CategoryCreateInput) {
  const db = database();
  await ensureDatabaseSchema(db);
  await insertCategory(db, data);
}

export async function updateCategory(data: CategoryUpdateInput) {
  const db = database();
  await ensureDatabaseSchema(db);
  await updateCategoryRow(db, data);
}

export async function createRecord(data: RecordCreateInput) {
  const db = database();
  await ensureDatabaseSchema(db);
  await insertRecord(db, data);
}

export async function updateRecord(data: RecordUpdateInput) {
  const db = database();
  await ensureDatabaseSchema(db);
  await updateRecordRow(db, data);
}
