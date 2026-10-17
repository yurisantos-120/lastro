import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  color: text('color').notNull(),
  scope: text('scope').notNull().default('general'),
  revision: integer('revision').notNull().default(1),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const information = sqliteTable(
  'information',
  {
    id: integer('id').primaryKey(),
    title: text('title').notNull(),
    categoryId: integer('category_id').notNull().references(() => categories.id),
    responsible: text('responsible').notNull(),
    validation: text('validation').notNull(),
    contact: text('contact').notNull(),
    notes: text('notes').notNull(),
    kind: text('kind').notNull().default('general'),
    detailsJson: text('details_json').notNull().default('{}'),
    revision: integer('revision').notNull().default(1),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_information_category_id').on(table.categoryId),
    index('idx_information_title').on(table.title),
  ],
);

export type TicketResultState = 'pending' | 'created' | 'failed' | 'uncertain';
export type UserRole = 'viewer' | 'operator' | 'admin';

export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey(),
    glpiUserId: integer('glpi_user_id').notNull(),
    name: text('name').notNull(),
    username: text('username').notNull(),
    role: text('role').$type<UserRole>().notNull().default('viewer'),
    active: integer('active').notNull().default(1),
    revision: integer('revision').notNull().default(1),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_users_glpi_user_id').on(table.glpiUserId),
    uniqueIndex('idx_users_username').on(table.username),
    check('users_glpi_user_id_check', sql`${table.glpiUserId} > 0`),
    check('users_name_check', sql`length(trim(${table.name})) > 0`),
    check(
      'users_username_normalized_check',
      sql`length(${table.username}) > 0 AND ${table.username} = lower(trim(${table.username}))`,
    ),
    check('users_role_check', sql`${table.role} IN ('viewer', 'operator', 'admin')`),
    check('users_active_check', sql`${table.active} IN (0, 1)`),
    check('users_revision_check', sql`${table.revision} >= 1`),
  ],
);

export const sessions = sqliteTable(
  'sessions',
  {
    id: integer('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    tokenHash: text('token_hash').notNull(),
    createdAt: text('created_at').notNull(),
    lastSeenAt: text('last_seen_at').notNull(),
    expiresAt: text('expires_at').notNull(),
    revokedAt: text('revoked_at'),
  },
  (table) => [
    uniqueIndex('idx_sessions_token_hash').on(table.tokenHash),
    index('idx_sessions_user_id').on(table.userId),
    index('idx_sessions_expires_at').on(table.expiresAt),
    check('sessions_token_hash_check', sql`length(${table.tokenHash}) > 0`),
  ],
);

export const authBootstrap = sqliteTable(
  'auth_bootstrap',
  {
    id: integer('id').primaryKey(),
    completedAt: text('completed_at'),
  },
  (table) => [check('auth_bootstrap_singleton_check', sql`${table.id} = 1`)],
);

export const tickets = sqliteTable(
  'tickets',
  {
    id: integer('id').primaryKey(),
    operationKey: text('operation_key').notNull(),
    glpiTicketId: integer('glpi_ticket_id'),
    title: text('title').notNull(),
    content: text('content').notNull(),
    status: integer('status'),
    resultState: text('result_state').$type<TicketResultState>().notNull().default('pending'),
    failureCode: text('failure_code'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    glpiCreatedAt: text('glpi_created_at'),
    lastSyncedAt: text('last_synced_at'),
    // Local OpusLog user ID for newly created tickets; legacy/system records may remain NULL.
    createdBy: integer('created_by'),
    revision: integer('revision').notNull().default(1),
  },
  (table) => [
    uniqueIndex('idx_tickets_operation_key').on(table.operationKey),
    uniqueIndex('idx_tickets_glpi_ticket_id').on(table.glpiTicketId),
    index('idx_tickets_created_at').on(table.createdAt),
    index('idx_tickets_result_state').on(table.resultState),
    check(
      'tickets_result_state_check',
      sql`${table.resultState} IN ('pending', 'created', 'failed', 'uncertain')`,
    ),
  ],
);

export type ImportBatchStatus = 'processing' | 'completed' | 'completed_with_errors' | 'failed';
export type ImportRecordStatus = 'pending' | 'inserted' | 'rejected' | 'ignored';

export const importBatches = sqliteTable(
  'import_batches',
  {
    id: text('id').primaryKey(),
    sourceManifestId: text('source_manifest_id').notNull(),
    manifestSha256: text('manifest_sha256').notNull(),
    status: text('status').$type<ImportBatchStatus>().notNull().default('processing'),
    createdAt: text('created_at').notNull(),
    completedAt: text('completed_at'),
    recordsProcessed: integer('records_processed').notNull().default(0),
    recordsInserted: integer('records_inserted').notNull().default(0),
    recordsRejected: integer('records_rejected').notNull().default(0),
    recordsIgnored: integer('records_ignored').notNull().default(0),
  },
  (table) => [
    index('idx_import_batches_status_created').on(table.status, table.createdAt),
    index('idx_import_batches_manifest_hash').on(table.manifestSha256),
    check('import_batches_manifest_id_check', sql`length(trim(${table.sourceManifestId})) BETWEEN 1 AND 160`),
    check('import_batches_manifest_sha256_check', sql`length(${table.manifestSha256}) = 64 AND ${table.manifestSha256} NOT GLOB '*[^0-9a-f]*'`),
    check('import_batches_status_check', sql`${table.status} IN ('processing', 'completed', 'completed_with_errors', 'failed')`),
    check('import_batches_counts_check', sql`${table.recordsProcessed} = ${table.recordsInserted} + ${table.recordsRejected} + ${table.recordsIgnored} AND ${table.recordsProcessed} >= 0`),
    check('import_batches_completion_check', sql`(${table.status} = 'processing' AND ${table.completedAt} IS NULL) OR (${table.status} <> 'processing' AND ${table.completedAt} IS NOT NULL)`),
  ],
);

export const importRecords = sqliteTable(
  'import_records',
  {
    id: integer('id').primaryKey(),
    batchId: text('batch_id').notNull().references(() => importBatches.id, { onDelete: 'restrict' }),
    informationId: integer('information_id').references(() => information.id, { onDelete: 'restrict' }),
    sourceFileId: text('source_file_id').notNull(),
    sourceFileName: text('source_file_name').notNull(),
    sourceFileSha256: text('source_file_sha256').notNull(),
    sourceSheet: text('source_sheet').notNull(),
    sourceRow: integer('source_row').notNull(),
    originKey: text('origin_key').notNull(),
    normalizedFingerprint: text('normalized_fingerprint').notNull(),
    status: text('status').$type<ImportRecordStatus>().notNull(),
    processedAt: text('processed_at'),
  },
  (table) => [
    uniqueIndex('idx_import_records_origin_key').on(table.originKey),
    uniqueIndex('idx_import_records_source_location').on(table.sourceFileId, table.sourceSheet, table.sourceRow),
    index('idx_import_records_batch_id').on(table.batchId),
    index('idx_import_records_information_id').on(table.informationId),
    index('idx_import_records_source_hash').on(table.sourceFileSha256),
    check('import_records_source_file_id_check', sql`length(trim(${table.sourceFileId})) BETWEEN 1 AND 160 AND instr(${table.sourceFileId}, '/') = 0 AND instr(${table.sourceFileId}, char(92)) = 0`),
    check('import_records_file_name_check', sql`length(trim(${table.sourceFileName})) BETWEEN 1 AND 255 AND instr(${table.sourceFileName}, '/') = 0 AND instr(${table.sourceFileName}, char(92)) = 0`),
    check('import_records_source_file_sha256_check', sql`length(${table.sourceFileSha256}) = 64 AND ${table.sourceFileSha256} NOT GLOB '*[^0-9a-f]*'`),
    check('import_records_source_sheet_check', sql`length(trim(${table.sourceSheet})) BETWEEN 1 AND 160`),
    check('import_records_source_row_check', sql`${table.sourceRow} BETWEEN 1 AND 10000000`),
    check('import_records_origin_key_check', sql`length(${table.originKey}) = 64 AND ${table.originKey} NOT GLOB '*[^0-9a-f]*'`),
    check('import_records_fingerprint_check', sql`length(${table.normalizedFingerprint}) = 64 AND ${table.normalizedFingerprint} NOT GLOB '*[^0-9a-f]*'`),
    check('import_records_status_check', sql`${table.status} IN ('pending', 'inserted', 'rejected', 'ignored')`),
    check('import_records_target_check', sql`(${table.status} = 'inserted' AND ${table.informationId} IS NOT NULL AND ${table.processedAt} IS NOT NULL) OR (${table.status} = 'pending' AND ${table.informationId} IS NULL AND ${table.processedAt} IS NULL) OR (${table.status} IN ('rejected', 'ignored') AND ${table.informationId} IS NULL AND ${table.processedAt} IS NOT NULL)`),
  ],
);
