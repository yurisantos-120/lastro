import { DataStorageError } from './data-errors.ts';
import type { CategoryCreateInput, CategoryUpdateInput, RecordCreateInput, RecordUpdateInput } from './data-types';

export async function ensureDatabase(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL, color TEXT NOT NULL, scope TEXT NOT NULL DEFAULT \'general\', revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS information (id INTEGER PRIMARY KEY NOT NULL, title TEXT NOT NULL, category_id INTEGER NOT NULL, responsible TEXT NOT NULL, validation TEXT NOT NULL, contact TEXT NOT NULL, notes TEXT NOT NULL, kind TEXT NOT NULL DEFAULT \'general\', details_json TEXT NOT NULL DEFAULT \'{}\', revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL, FOREIGN KEY (category_id) REFERENCES categories(id))'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_information_category_id ON information (category_id)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_information_title ON information (title)'),
  ]);

}

function insertedId(result: D1Result): number {
  const id = result.meta.last_row_id;
  if (result.meta.changes !== 1 || !Number.isSafeInteger(id) || id <= 0) {
    throw new DataStorageError('INSERT_FAILED');
  }
  return id;
}

export async function insertCategory(db: D1Database, data: CategoryCreateInput): Promise<number> {
  const now = new Date().toISOString();
  const result = await db.prepare('INSERT INTO categories (name, description, color, scope, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(data.name, data.description, data.color, data.scope, now, now).run();
  return insertedId(result);
}

export async function insertRecord(db: D1Database, data: RecordCreateInput): Promise<number> {
  const result = await db.prepare('INSERT INTO information (title, category_id, responsible, validation, contact, notes, kind, details_json, updated_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM categories WHERE id = ? AND scope = ?)')
    .bind(data.title, data.categoryId, data.responsible, data.validation, data.contact, data.notes, data.recordType, JSON.stringify(data.details), new Date().toISOString(), data.categoryId, data.recordType).run();
  if (result.meta.changes === 0) {
    const category = await db.prepare('SELECT scope FROM categories WHERE id = ?').bind(data.categoryId).first<{ scope: string }>();
    if (!category) throw new DataStorageError('CATEGORY_NOT_FOUND');
    throw new DataStorageError('CATEGORY_SCOPE_MISMATCH');
  }
  return insertedId(result);
}

export async function updateCategoryRow(db: D1Database, data: CategoryUpdateInput): Promise<void> {
  const result = await db.prepare('UPDATE categories SET name = ?, description = ?, color = ?, scope = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND revision = ? AND NOT EXISTS (SELECT 1 FROM information WHERE category_id = ? AND kind <> ?)')
    .bind(data.name, data.description, data.color, data.scope, new Date().toISOString(), data.id, data.revision, data.id, data.scope).run();
  if (result.meta.changes !== 0) return;
  const existing = await db.prepare('SELECT id, revision FROM categories WHERE id = ?').bind(data.id).first<{ id: number; revision: number }>();
  if (!existing) throw new DataStorageError('CATEGORY_NOT_FOUND_FOR_UPDATE');
  if (existing.revision !== data.revision) throw new DataStorageError('REVISION_CONFLICT');
  const incompatible = await db.prepare('SELECT 1 AS found FROM information WHERE category_id = ? AND kind <> ? LIMIT 1').bind(data.id, data.scope).first<{ found: number }>();
  if (incompatible) throw new DataStorageError('CATEGORY_SCOPE_CONFLICT');
  throw new DataStorageError('UPDATE_FAILED');
}

export async function updateRecordRow(db: D1Database, data: RecordUpdateInput): Promise<void> {
  const result = await db.prepare('UPDATE information SET title = ?, category_id = ?, responsible = ?, validation = ?, contact = ?, notes = ?, kind = ?, details_json = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND revision = ? AND EXISTS (SELECT 1 FROM categories WHERE id = ? AND scope = ?)')
    .bind(data.title, data.categoryId, data.responsible, data.validation, data.contact, data.notes, data.recordType, JSON.stringify(data.details), new Date().toISOString(), data.id, data.revision, data.categoryId, data.recordType).run();
  if (result.meta.changes !== 0) return;
  const existing = await db.prepare('SELECT id, revision FROM information WHERE id = ?').bind(data.id).first<{ id: number; revision: number }>();
  if (!existing) throw new DataStorageError('RECORD_NOT_FOUND');
  if (existing.revision !== data.revision) throw new DataStorageError('REVISION_CONFLICT');
  const category = await db.prepare('SELECT scope FROM categories WHERE id = ?').bind(data.categoryId).first<{ scope: string }>();
  if (!category) throw new DataStorageError('CATEGORY_NOT_FOUND_FOR_UPDATE');
  if (category.scope !== data.recordType) throw new DataStorageError('CATEGORY_SCOPE_MISMATCH');
  throw new DataStorageError('UPDATE_FAILED');
}
