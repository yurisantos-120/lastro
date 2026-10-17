import { recordKinds, type RecordCreateInput } from './data-types.ts';

export type ImportRecordOutcome = 'rejected' | 'ignored';
export type ImportBatchFinalStatus = 'completed' | 'completed_with_errors' | 'failed';

export interface CreateImportBatchInput {
  sourceManifestId: string;
  manifestSha256: string;
}

export interface ImportSourceLocation {
  batchId: string;
  sourceFileId: string;
  sourceFileName: string;
  sourceFileSha256: string;
  sourceSheet: string;
  sourceRow: number;
  normalizedFingerprint: string;
}

export interface ImportBatchRow {
  id: string;
  sourceManifestId: string;
  manifestSha256: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  recordsProcessed: number;
  recordsInserted: number;
  recordsRejected: number;
  recordsIgnored: number;
}

export interface ImportRecordRow {
  id: number;
  batchId: string;
  informationId: number | null;
  sourceFileId: string;
  sourceFileName: string;
  sourceFileSha256: string;
  sourceSheet: string;
  sourceRow: number;
  originKey: string;
  normalizedFingerprint: string;
  status: string;
  processedAt: string | null;
  fingerprintMatches: boolean;
  sourceFileHashMatches: boolean;
}

export type ImportedRecordResult =
  | { outcome: 'inserted'; informationId: number; originKey: string }
  | { outcome: 'already_processed'; record: ImportRecordRow };

export class ImportStorageError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = 'ImportStorageError';
    this.code = code;
  }
}

const uuidPattern = /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
const sha256Pattern = /^[\da-f]{64}$/i;
const sensitiveKeyPattern = /password|passwd|senha|token|secret|credential|credencial|pppoe|login|loguin/i;
const credentialAssignmentPattern = /\b(?:password|passwd|senha|token|secret|credential|credencial|pppoe|login|loguin)\s*[:=]\s*\S+/i;

function validateUuid(value: string): string {
  if (typeof value !== 'string' || !uuidPattern.test(value)) throw new ImportStorageError('INVALID_IDENTIFIER');
  return value.toLowerCase();
}

function validateSha256(value: string): string {
  if (typeof value !== 'string' || !sha256Pattern.test(value)) throw new ImportStorageError('INVALID_SHA256');
  return value.toLowerCase();
}

function validateLabel(value: string, max: number, code: string): string {
  if (typeof value !== 'string') throw new ImportStorageError(code);
  const normalized = value.normalize('NFC').trim();
  const containsControlCharacter = Array.from(normalized).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127;
  });
  if (!normalized || normalized.length > max || containsControlCharacter) {
    throw new ImportStorageError(code);
  }
  return normalized;
}

function validateSourceFileName(value: string): string {
  const name = validateLabel(value, 255, 'INVALID_SOURCE_METADATA');
  if (name === '.' || name === '..' || /[\\/]/.test(name)) throw new ImportStorageError('INVALID_SOURCE_METADATA');
  if (credentialAssignmentPattern.test(name)) throw new ImportStorageError('SENSITIVE_DATA_REJECTED');
  return name;
}

function validateSourceFileId(value: string): string {
  const id = validateLabel(value, 160, 'INVALID_SOURCE_METADATA');
  if (/[\\/]/.test(id) || credentialAssignmentPattern.test(id)) throw new ImportStorageError('INVALID_SOURCE_METADATA');
  return id;
}

function rejectSensitiveData(value: unknown): void {
  if (Array.isArray(value)) {
    for (const entry of value) rejectSensitiveData(entry);
    return;
  }
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string' && credentialAssignmentPattern.test(value)) {
      throw new ImportStorageError('SENSITIVE_DATA_REJECTED');
    }
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (sensitiveKeyPattern.test(key)) throw new ImportStorageError('SENSITIVE_DATA_REJECTED');
    rejectSensitiveData(entry);
  }
}

function validateRecord(data: RecordCreateInput): void {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new ImportStorageError('INVALID_RECORD');
  if (!Number.isSafeInteger(data.categoryId) || data.categoryId <= 0) throw new ImportStorageError('INVALID_RECORD');
  if (!recordKinds.includes(data.recordType)) throw new ImportStorageError('INVALID_RECORD');
  if (typeof data.title !== 'string' || !data.title.trim() || data.title.length > 240) throw new ImportStorageError('INVALID_RECORD');
  for (const value of [data.responsible, data.validation, data.contact, data.notes]) {
    if (typeof value !== 'string') throw new ImportStorageError('INVALID_RECORD');
  }
  if (!data.details || typeof data.details !== 'object' || Array.isArray(data.details)) throw new ImportStorageError('INVALID_RECORD');
  if (Object.values(data.details).some((value) => value !== undefined && typeof value !== 'string')) {
    throw new ImportStorageError('INVALID_RECORD');
  }
  rejectSensitiveData(data);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function validateSource(input: ImportSourceLocation) {
  const batchId = validateUuid(input.batchId);
  const sourceFileId = validateSourceFileId(input.sourceFileId);
  const sourceFileName = validateSourceFileName(input.sourceFileName);
  const sourceFileSha256 = validateSha256(input.sourceFileSha256);
  const sourceSheet = validateLabel(input.sourceSheet, 160, 'INVALID_SOURCE_METADATA');
  if (!Number.isSafeInteger(input.sourceRow) || input.sourceRow < 1 || input.sourceRow > 10_000_000) {
    throw new ImportStorageError('INVALID_SOURCE_METADATA');
  }
  const normalizedFingerprint = validateSha256(input.normalizedFingerprint);
  return { batchId, sourceFileId, sourceFileName, sourceFileSha256, sourceSheet, sourceRow: input.sourceRow, normalizedFingerprint };
}

async function makeOriginKey(sourceFileId: string, sourceSheet: string, sourceRow: number): Promise<string> {
  return sha256Hex(`lastro-import-origin-v1\u0000${sourceFileId}\u0000${sourceSheet}\u0000${sourceRow}`);
}

export async function createImportBatch(db: D1Database, input: CreateImportBatchInput): Promise<ImportBatchRow> {
  const sourceManifestId = validateLabel(input.sourceManifestId, 160, 'INVALID_MANIFEST_ID');
  if (/[\\/]/.test(sourceManifestId) || credentialAssignmentPattern.test(sourceManifestId)) {
    throw new ImportStorageError('INVALID_MANIFEST_ID');
  }
  const manifestSha256 = validateSha256(input.manifestSha256);
  const id = crypto.randomUUID().toLowerCase();
  const createdAt = new Date().toISOString();
  try {
    await db.prepare(`INSERT INTO import_batches (id, source_manifest_id, manifest_sha256, status, created_at)
      VALUES (?, ?, ?, 'processing', ?)`).bind(id, sourceManifestId, manifestSha256, createdAt).run();
  } catch {
    throw new ImportStorageError('IMPORT_BATCH_CREATE_FAILED');
  }
  const batch = await getImportBatch(db, id);
  if (!batch) throw new ImportStorageError('IMPORT_BATCH_CREATE_FAILED');
  return batch;
}

export async function getImportBatch(db: D1Database, batchId: string): Promise<ImportBatchRow | null> {
  const id = validateUuid(batchId);
  return db.prepare(`SELECT id, source_manifest_id AS sourceManifestId, manifest_sha256 AS manifestSha256,
      status, created_at AS createdAt, completed_at AS completedAt,
      records_processed AS recordsProcessed, records_inserted AS recordsInserted,
      records_rejected AS recordsRejected, records_ignored AS recordsIgnored
    FROM import_batches WHERE id = ?`).bind(id).first<ImportBatchRow>();
}

export async function findImportRecordBySource(db: D1Database, input: Omit<ImportSourceLocation, 'batchId' | 'sourceFileName'>) {
  const sourceFileId = validateSourceFileId(input.sourceFileId);
  const fileHash = validateSha256(input.sourceFileSha256);
  const sheet = validateLabel(input.sourceSheet, 160, 'INVALID_SOURCE_METADATA');
  if (!Number.isSafeInteger(input.sourceRow) || input.sourceRow < 1 || input.sourceRow > 10_000_000) {
    throw new ImportStorageError('INVALID_SOURCE_METADATA');
  }
  const fingerprint = validateSha256(input.normalizedFingerprint);
  const originKey = await makeOriginKey(sourceFileId, sheet, input.sourceRow);
  const record = await db.prepare(`SELECT id, batch_id AS batchId, information_id AS informationId,
      source_file_id AS sourceFileId, source_file_name AS sourceFileName, source_file_sha256 AS sourceFileSha256,
      source_sheet AS sourceSheet, source_row AS sourceRow, origin_key AS originKey,
      normalized_fingerprint AS normalizedFingerprint, status, processed_at AS processedAt
    FROM import_records WHERE origin_key = ?`).bind(originKey).first<Omit<ImportRecordRow, 'fingerprintMatches'>>();
  return record ? {
    ...record,
    fingerprintMatches: record.normalizedFingerprint === fingerprint,
    sourceFileHashMatches: record.sourceFileSha256 === fileHash,
  } : null;
}

function metadataInsertStatement(db: D1Database, source: ReturnType<typeof validateSource>, originKey: string, status: 'pending' | ImportRecordOutcome, processedAt: string | null) {
  return db.prepare(`INSERT OR IGNORE INTO import_records
      (batch_id, information_id, source_file_id, source_file_name, source_file_sha256, source_sheet, source_row,
       origin_key, normalized_fingerprint, status, processed_at)
    SELECT ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?
    FROM import_batches WHERE id = ? AND status = 'processing'`)
    .bind(source.batchId, source.sourceFileId, source.sourceFileName, source.sourceFileSha256, source.sourceSheet, source.sourceRow,
      originKey, source.normalizedFingerprint, status, processedAt, source.batchId);
}

async function existingOrThrow(db: D1Database, source: ReturnType<typeof validateSource>) {
  const existing = await findImportRecordBySource(db, source);
  if (existing) return { outcome: 'already_processed' as const, record: existing };
  const batch = await getImportBatch(db, source.batchId);
  if (!batch) throw new ImportStorageError('IMPORT_BATCH_NOT_FOUND');
  if (batch.status !== 'processing') throw new ImportStorageError('IMPORT_BATCH_NOT_PROCESSING');
  throw new ImportStorageError('IMPORT_ORIGIN_NOT_RECORDED');
}

export async function createImportedRecord(db: D1Database, sourceInput: ImportSourceLocation, data: RecordCreateInput): Promise<ImportedRecordResult> {
  const source = validateSource(sourceInput);
  validateRecord(data);
  const originKey = await makeOriginKey(source.sourceFileId, source.sourceSheet, source.sourceRow);
  const now = new Date().toISOString();
  const statements = [
    metadataInsertStatement(db, source, originKey, 'pending', null),
    db.prepare(`INSERT INTO information
        (title, category_id, responsible, validation, contact, notes, kind, details_json, updated_at)
      SELECT ?, CASE WHEN EXISTS (SELECT 1 FROM categories WHERE id = ? AND scope = ?) THEN ? ELSE NULL END,
        ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1`)
      .bind(data.title, data.categoryId, data.recordType, data.categoryId, data.responsible, data.validation,
        data.contact, data.notes, data.recordType, JSON.stringify(data.details), now),
    db.prepare(`UPDATE import_records SET information_id = last_insert_rowid(), status = 'inserted', processed_at = ?
      WHERE origin_key = ? AND batch_id = ? AND status = 'pending' AND changes() = 1`)
      .bind(now, originKey, source.batchId),
    db.prepare(`UPDATE import_batches SET records_processed = records_processed + 1,
        records_inserted = records_inserted + 1
      WHERE id = ? AND status = 'processing' AND changes() = 1`)
      .bind(source.batchId),
  ];
  let results: D1Result[];
  try {
    results = await db.batch(statements);
  } catch {
    throw new ImportStorageError('IMPORT_TRANSACTION_FAILED');
  }
  if (results[0]?.meta.changes !== 1) return existingOrThrow(db, source);
  if (results[1]?.meta.changes !== 1 || results[2]?.meta.changes !== 1 || results[3]?.meta.changes !== 1) {
    throw new ImportStorageError('IMPORT_TRANSACTION_INCOMPLETE');
  }
  const informationId = results[1].meta.last_row_id;
  if (!Number.isSafeInteger(informationId) || informationId <= 0) throw new ImportStorageError('IMPORT_TRANSACTION_INCOMPLETE');
  return { outcome: 'inserted', informationId, originKey };
}

export async function recordImportOutcome(db: D1Database, sourceInput: ImportSourceLocation, outcome: ImportRecordOutcome): Promise<ImportRecordRow | { outcome: 'already_processed'; record: ImportRecordRow }> {
  const source = validateSource(sourceInput);
  const originKey = await makeOriginKey(source.sourceFileId, source.sourceSheet, source.sourceRow);
  const processedAt = new Date().toISOString();
  let results: D1Result[];
  try {
    results = await db.batch([
      metadataInsertStatement(db, source, originKey, outcome, processedAt),
      db.prepare(`UPDATE import_batches SET records_processed = records_processed + 1,
          ${outcome === 'rejected' ? 'records_rejected' : 'records_ignored'} = ${outcome === 'rejected' ? 'records_rejected' : 'records_ignored'} + 1
        WHERE id = ? AND status = 'processing' AND changes() = 1`).bind(source.batchId),
    ]);
  } catch {
    throw new ImportStorageError('IMPORT_TRANSACTION_FAILED');
  }
  if (results[0]?.meta.changes !== 1) return existingOrThrow(db, source);
  if (results[1]?.meta.changes !== 1) throw new ImportStorageError('IMPORT_TRANSACTION_INCOMPLETE');
  const row = await findImportRecordBySource(db, source);
  if (!row) throw new ImportStorageError('IMPORT_TRANSACTION_INCOMPLETE');
  return row;
}

export async function completeImportBatch(db: D1Database, batchId: string): Promise<ImportBatchRow> {
  const id = validateUuid(batchId);
  const batch = await getImportBatch(db, id);
  if (!batch) throw new ImportStorageError('IMPORT_BATCH_NOT_FOUND');
  if (batch.status !== 'processing') throw new ImportStorageError('IMPORT_BATCH_NOT_PROCESSING');
  const status: ImportBatchFinalStatus = batch.recordsRejected > 0 ? 'completed_with_errors' : 'completed';
  const result = await db.prepare(`UPDATE import_batches SET status = ?, completed_at = ?
    WHERE id = ? AND status = 'processing' AND records_processed = records_inserted + records_rejected + records_ignored
      AND NOT EXISTS (SELECT 1 FROM import_records WHERE batch_id = ? AND status = 'pending')`)
    .bind(status, new Date().toISOString(), id, id).run();
  if (result.meta.changes !== 1) throw new ImportStorageError('IMPORT_BATCH_STATE_CONFLICT');
  const completed = await getImportBatch(db, id);
  if (!completed) throw new ImportStorageError('IMPORT_BATCH_NOT_FOUND');
  return completed;
}

export async function failImportBatch(db: D1Database, batchId: string): Promise<ImportBatchRow> {
  const id = validateUuid(batchId);
  const result = await db.prepare(`UPDATE import_batches SET status = 'failed', completed_at = ?
    WHERE id = ? AND status = 'processing'`).bind(new Date().toISOString(), id).run();
  if (result.meta.changes !== 1) {
    const batch = await getImportBatch(db, id);
    if (!batch) throw new ImportStorageError('IMPORT_BATCH_NOT_FOUND');
    throw new ImportStorageError('IMPORT_BATCH_STATE_CONFLICT');
  }
  const failed = await getImportBatch(db, id);
  if (!failed) throw new ImportStorageError('IMPORT_BATCH_NOT_FOUND');
  return failed;
}
