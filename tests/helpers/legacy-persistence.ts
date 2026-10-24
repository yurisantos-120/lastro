import { dataWrite, explainDataWrite } from '../../db/data-write.ts';
import { DataStorageError } from '../../db/data-errors.ts';
import type { CategoryCreateInput, CategoryUpdateInput, RecordCreateInput, RecordUpdateInput } from '../../db/data-types.ts';

// Legacy CRUD adapters retained for persistence regression tests only.
// Runtime writes use DataOperations and its persistent idempotency ledger.

function insertedId(result: D1Result): number {
  const id = result.meta.last_row_id;
  if (result.meta.changes !== 1 || !Number.isSafeInteger(id) || id <= 0) {
    throw new DataStorageError('INSERT_FAILED');
  }
  return id;
}

export async function insertCategory(db: D1Database, data: CategoryCreateInput): Promise<number> {
  return insertedId(await dataWrite(db, 'POST', {kind:'category',data}, new Date().toISOString()).run());
}
export async function insertRecord(db: D1Database, data: RecordCreateInput): Promise<number> {
  const payload = {kind:'record' as const,data};
  const result = await dataWrite(db,'POST',payload,new Date().toISOString()).run();
  if (result.meta.changes === 0) await explainDataWrite(db,'POST',payload);
  return insertedId(result);
}
export async function updateCategoryRow(db: D1Database, data: CategoryUpdateInput): Promise<void> {
  const payload = {kind:'category' as const,data};
  const result = await dataWrite(db,'PUT',payload,new Date().toISOString()).run();
  if (result.meta.changes === 0) await explainDataWrite(db,'PUT',payload);
}
export async function updateRecordRow(db: D1Database, data: RecordUpdateInput): Promise<void> {
  const payload = {kind:'record' as const,data};
  const result = await dataWrite(db,'PUT',payload,new Date().toISOString()).run();
  if (result.meta.changes === 0) await explainDataWrite(db,'PUT',payload);
}
