import type { ParsedDataPayload } from '../app/api/data/validation.ts';
import type { CategoryUpdateInput, RecordCreateInput, RecordUpdateInput } from './data-types.ts';
import type { DataMethod } from '../services/data/operations.ts';
import { DataStorageError } from './data-errors.ts';
import { pointDimensionFields, pointDimensionKey } from '../lib/point-dimensions.ts';

function storedDetails(data: RecordCreateInput): string {
  if (data.recordType !== 'point') return JSON.stringify(data.details);
  const details = { ...data.details };
  for (const field of pointDimensionFields) {
    const label = details[field] ?? '';
    if (label) details[`${field}Key`] = pointDimensionKey(label);
  }
  return JSON.stringify(details);
}

export function dataWrite(db: D1Database, method: DataMethod, payload: ParsedDataPayload, now: string, actorId?: number, reservedKey?: string): D1PreparedStatement {
  const gate = (actorId === undefined ? '1' : "EXISTS(SELECT 1 FROM users WHERE id=? AND active=1 AND role IN ('operator','admin'))") + (reservedKey ? " AND EXISTS(SELECT 1 FROM data_operations WHERE operation_key=? AND response_json='null')" : '');
  const actor: Array<string|number> = [...(actorId === undefined ? [] : [actorId]),...(reservedKey ? [reservedKey] : [])];
  if (payload.kind === 'category') {
    const d = payload.data as CategoryUpdateInput;
    return method === 'POST'
      ? db.prepare(`INSERT INTO categories(name,description,color,scope,created_at,updated_at) SELECT ?,?,?,?,?,? WHERE ${gate}`).bind(d.name,d.description,d.color,d.scope,now,now,...actor)
      : db.prepare(`UPDATE categories SET name=?,description=?,color=?,scope=?,updated_at=?,revision=revision+1 WHERE id=? AND revision=? AND NOT EXISTS(SELECT 1 FROM information WHERE category_id=? AND kind<>?) AND ${gate}`).bind(d.name,d.description,d.color,d.scope,now,d.id,d.revision,d.id,d.scope,...actor);
  }
  const d = payload.data as RecordUpdateInput;
  return method === 'POST'
    ? db.prepare(`INSERT INTO information(title,category_id,responsible,validation,contact,notes,kind,details_json,updated_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM categories WHERE id=? AND scope=?) AND ${gate}`).bind(d.title,d.categoryId,d.responsible,d.validation,d.contact,d.notes,d.recordType,storedDetails(d),now,d.categoryId,d.recordType,...actor)
    : db.prepare(`UPDATE information SET title=?,category_id=?,responsible=?,validation=?,contact=?,notes=?,kind=?,details_json=?,updated_at=?,revision=revision+1 WHERE id=? AND revision=? AND EXISTS(SELECT 1 FROM categories WHERE id=? AND scope=?) AND ${gate}`).bind(d.title,d.categoryId,d.responsible,d.validation,d.contact,d.notes,d.recordType,storedDetails(d),now,d.id,d.revision,d.categoryId,d.recordType,...actor);
}

// Used only after a failed conditional write; never mutates to diagnose an error.
export async function explainDataWrite(db: D1Database, method: DataMethod, payload: ParsedDataPayload): Promise<never> {
  if (method === 'PUT') {
    const d = payload.data as CategoryUpdateInput | RecordUpdateInput;
    const row = await db.prepare(`SELECT revision FROM ${payload.kind === 'category' ? 'categories' : 'information'} WHERE id=?`).bind(d.id).first<{revision:number}>();
    if (!row) throw new DataStorageError(payload.kind === 'category' ? 'CATEGORY_NOT_FOUND_FOR_UPDATE' : 'RECORD_NOT_FOUND');
    if (row.revision !== d.revision) throw new DataStorageError('REVISION_CONFLICT');
    if (payload.kind === 'category') {
      const incompatible = await db.prepare('SELECT 1 AS found FROM information WHERE category_id=? AND kind<>? LIMIT 1').bind(d.id,(d as CategoryUpdateInput).scope).first();
      if (incompatible) throw new DataStorageError('CATEGORY_SCOPE_CONFLICT');
    }
  }
  if (payload.kind === 'record') {
    const d = payload.data as RecordCreateInput;
    const category = await db.prepare('SELECT scope FROM categories WHERE id=?').bind(d.categoryId).first<{scope:string}>();
    if (!category) throw new DataStorageError('CATEGORY_NOT_FOUND');
    if (category.scope !== d.recordType) throw new DataStorageError('CATEGORY_SCOPE_MISMATCH');
  }
  throw new DataStorageError(method === 'POST' ? 'INSERT_FAILED' : 'UPDATE_FAILED');
}
