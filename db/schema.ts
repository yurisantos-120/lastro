import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { OperationalState } from '../services/tickets/operations';

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
    index('idx_information_point_municipality_key').on(table.kind, sql`json_extract(${table.detailsJson}, '$.municipalityKey')`),
    index('idx_information_point_client_key').on(table.kind, sql`json_extract(${table.detailsJson}, '$.clientKey')`),
    index('idx_information_point_region_key').on(table.kind, sql`json_extract(${table.detailsJson}, '$.operationalRegionKey')`),
  ],
);

export type TicketResultState = 'pending' | 'created' | 'failed' | 'uncertain';

export const dataOperations = sqliteTable('data_operations', {
  operationKey: text('operation_key').primaryKey().notNull(),
  actorId: integer('actor_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  method: text('method').notNull(),
  kind: text('kind').notNull(),
  requestHash: text('request_hash').notNull(),
  responseJson: text('response_json').notNull(),
  recordedAt: text('recorded_at').notNull(),
}, (table) => [
  index('idx_data_operations_actor_time').on(table.actorId, table.recordedAt),
  check('data_operations_method_check', sql`${table.method} IN ('POST','PUT')`),
  check('data_operations_kind_check', sql`${table.kind} IN ('category','record')`),
  check('data_operations_hash_check', sql`length(${table.requestHash})=64 AND ${table.requestHash} NOT GLOB '*[^0-9a-f]*'`),
  check('data_operations_response_check', sql`json_valid(${table.responseJson}) AND length(${table.responseJson})<=131072`),
]);
export type DimensionKind = 'municipality' | 'client' | 'operational_region';
export const dimensionValues = sqliteTable('dimension_values', {
  id: text('id').primaryKey(), kind: text('kind').$type<DimensionKind>().notNull(), displayName: text('display_name').notNull(), normalizedKey: text('normalized_key').notNull(), stateCode: text('state_code'), status: text('status').$type<'approved'|'retired'>().notNull().default('approved'), revision: integer('revision').notNull().default(1), createdBy: integer('created_by').notNull().references(() => users.id, {onDelete:'restrict'}), createdAt: text('created_at').notNull(), updatedBy: integer('updated_by').notNull().references(() => users.id, {onDelete:'restrict'}), updatedAt: text('updated_at').notNull(),
}, table=>[index('idx_dimension_values_kind_name').on(table.kind,table.normalizedKey)]);
export const dimensionNameKeys = sqliteTable('dimension_name_keys', {
  kind:text('kind').$type<DimensionKind>().notNull(),normalizedKey:text('normalized_key').notNull(),valueId:text('value_id').notNull().references(()=>dimensionValues.id,{onDelete:'restrict'}),aliasId:text('alias_id'),createdAt:text('created_at').notNull(),
},table=>[uniqueIndex('idx_dimension_name_keys_identity').on(table.kind,table.normalizedKey)]);
export const dimensionAliases = sqliteTable('dimension_aliases', {
  id:text('id').primaryKey(),valueId:text('value_id').notNull().references(()=>dimensionValues.id,{onDelete:'restrict'}),displayName:text('display_name').notNull(),normalizedKey:text('normalized_key').notNull(),status:text('status').$type<'approved'|'retired'>().notNull().default('approved'),revision:integer('revision').notNull().default(1),createdBy:integer('created_by').notNull().references(()=>users.id,{onDelete:'restrict'}),createdAt:text('created_at').notNull(),updatedBy:integer('updated_by').notNull().references(()=>users.id,{onDelete:'restrict'}),updatedAt:text('updated_at').notNull(),
},table=>[index('idx_dimension_aliases_value').on(table.valueId,table.status)]);
export const dimensionRequests = sqliteTable('dimension_requests', {
  id:text('id').primaryKey(),kind:text('kind').$type<DimensionKind>().notNull(),proposedName:text('proposed_name').notNull(),normalizedKey:text('normalized_key').notNull(),stateCode:text('state_code'),justification:text('justification').notNull(),status:text('status').$type<'submitted'|'approved'|'rejected'|'withdrawn'>().notNull(),requesterId:integer('requester_id').notNull().references(()=>users.id,{onDelete:'restrict'}),submittedAt:text('submitted_at').notNull(),decidedBy:integer('decided_by').references(()=>users.id,{onDelete:'restrict'}),decidedAt:text('decided_at'),decisionReason:text('decision_reason').notNull().default(''),valueId:text('value_id').references(()=>dimensionValues.id,{onDelete:'restrict'}),revision:integer('revision').notNull().default(1),
},table=>[index('idx_dimension_requests_requester').on(table.requesterId,table.submittedAt),index('idx_dimension_requests_status').on(table.status,table.submittedAt)]);
export const dimensionRequestEvents = sqliteTable('dimension_request_events', {
  id:integer('id').primaryKey(),requestId:text('request_id').notNull().references(()=>dimensionRequests.id,{onDelete:'restrict'}),eventType:text('event_type').notNull(),actorId:integer('actor_id').notNull().references(()=>users.id,{onDelete:'restrict'}),recordedAt:text('recorded_at').notNull(),revision:integer('revision').notNull(),description:text('description').notNull().default(''),snapshotJson:text('snapshot_json').notNull(),
},table=>[uniqueIndex('idx_dimension_request_events_revision').on(table.requestId,table.revision),index('idx_dimension_request_events_history').on(table.requestId,table.recordedAt)]);
export const dimensionOperations = sqliteTable('dimension_operations', {
  operationKey:text('operation_key').primaryKey(),actorId:integer('actor_id').notNull().references(()=>users.id,{onDelete:'restrict'}),requestHash:text('request_hash').notNull(),responseJson:text('response_json').notNull(),recordedAt:text('recorded_at').notNull(),
},table=>[index('idx_dimension_operations_actor_time').on(table.actorId,table.recordedAt)]);
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
    creationFingerprint: text('creation_fingerprint'),
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

export const ticketOperations = sqliteTable('ticket_operations', {
  ticketId: integer('ticket_id').primaryKey().references(() => tickets.id, { onDelete: 'restrict' }),
  occurrenceType: text('occurrence_type').notNull().default(''),
  routeDescription: text('route_description').notNull().default(''),
  routeId: integer('route_id').references(() => information.id, { onDelete: 'restrict' }),
  responsibleOrganization: text('responsible_organization').notNull().default(''),
  state: text('state').$type<OperationalState>().notNull(),
  pendingReason: text('pending_reason').notNull().default(''),
  notes: text('notes').notNull().default(''),
  guidance: text('guidance').notNull().default(''),
  openedAt: text('opened_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  normalizedAt: text('normalized_at'),
  closedAt: text('closed_at'),
  updatedBy: integer('updated_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  revision: integer('revision').notNull(),
}, (table) => [
  index('idx_ticket_operations_state_updated').on(table.state, table.updatedAt),
  check('ticket_operations_state_check', sql`${table.state} IN ('in_progress', 'pending', 'normalized', 'closed')`),
  check('ticket_operations_pending_check', sql`${table.state} <> 'pending' OR length(trim(${table.pendingReason})) > 0`),
  check('ticket_operations_revision_check', sql`${table.revision} >= 1`),
  check('ticket_operations_dates_check', sql`(${table.state} <> 'normalized' OR ${table.normalizedAt} IS NOT NULL) AND ((${table.state} = 'closed' AND ${table.closedAt} IS NOT NULL) OR (${table.state} <> 'closed' AND ${table.closedAt} IS NULL))`),
]);

export const ticketOperationEvents = sqliteTable('ticket_operation_events', {
  id: integer('id').primaryKey(),
  ticketId: integer('ticket_id').notNull().references(() => ticketOperations.ticketId, { onDelete: 'restrict' }),
  operationKey: text('operation_key').notNull(),
  requestJson: text('request_json').notNull(),
  actorId: integer('actor_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  actorName: text('actor_name').notNull(),
  occurredAt: text('occurred_at').notNull(),
  type: text('type').$type<'initialized' | 'state_changed' | 'updated'>().notNull(),
  previousState: text('previous_state').$type<OperationalState>(),
  nextState: text('next_state').$type<OperationalState>().notNull(),
  description: text('description').notNull().default(''),
  snapshotJson: text('snapshot_json').notNull(),
  revision: integer('revision').notNull(),
}, (table) => [
  uniqueIndex('idx_ticket_operation_events_key').on(table.operationKey),
  uniqueIndex('idx_ticket_operation_events_revision').on(table.ticketId, table.revision),
  index('idx_ticket_operation_events_chronology').on(table.ticketId, table.occurredAt, table.id),
  check('ticket_operation_events_type_check', sql`${table.type} IN ('initialized', 'state_changed', 'updated')`),
  check('ticket_operation_events_state_check', sql`${table.nextState} IN ('in_progress', 'pending', 'normalized', 'closed') AND (${table.previousState} IS NULL OR ${table.previousState} IN ('in_progress', 'pending', 'normalized', 'closed'))`),
  check('ticket_operation_events_revision_check', sql`${table.revision} >= 1`),
]);

export const shiftHandoffs = sqliteTable('shift_handoffs', {
  id: text('id').primaryKey(),
  operationKey: text('operation_key').notNull(),
  requestHash: text('request_hash').notNull(),
  periodKey: text('period_key').notNull(),
  configJson: text('config_json').notNull(),
  periodJson: text('period_json').notNull(),
  snapshotJson: text('snapshot_json').notNull(),
  notes: text('notes').notNull().default(''),
  guidance: text('guidance').notNull().default(''),
  deliveredBy: integer('delivered_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  deliveredName: text('delivered_name').notNull(),
  deliveredAt: text('delivered_at').notNull(),
}, (table) => [
  uniqueIndex('idx_shift_handoffs_key').on(table.operationKey),
  uniqueIndex('idx_shift_handoffs_period').on(table.periodKey),
  index('idx_shift_handoffs_delivered').on(table.deliveredAt, table.id),
  check('shift_handoffs_json_check', sql`json_valid(${table.configJson}) AND json_valid(${table.periodJson}) AND json_valid(${table.snapshotJson})`),
]);

export const shiftReceipts = sqliteTable('shift_receipts', {
  handoffId: text('handoff_id').primaryKey().references(() => shiftHandoffs.id, { onDelete: 'restrict' }),
  operationKey: text('operation_key').notNull(),
  receivedBy: integer('received_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  receivedName: text('received_name').notNull(),
  receivedAt: text('received_at').notNull(),
}, (table) => [uniqueIndex('idx_shift_receipts_key').on(table.operationKey)]);

export const ticketRfos = sqliteTable('ticket_rfos', {
  ticketId: integer('ticket_id').primaryKey().references(() => tickets.id, { onDelete: 'restrict' }),
  glpiTicketId: integer('glpi_ticket_id').notNull(),
  investigation: text('investigation').notNull(),
  completion: text('completion').notNull(),
  cause: text('cause').notNull().default(''),
  technicalDescription: text('technical_description').notNull().default(''),
  solution: text('solution').notNull().default(''),
  responsibleTeam: text('responsible_team').notNull().default(''),
  notes: text('notes').notNull().default(''),
  normalizedAt: text('normalized_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  completedAt: text('completed_at'),
  updatedBy: integer('updated_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  revision: integer('revision').notNull(),
}, (table) => [
  index('idx_ticket_rfos_completion').on(table.completion, table.updatedAt),
  check('ticket_rfos_investigation_check', sql`${table.investigation} IN ('investigating', 'confirmed') AND (${table.investigation} <> 'confirmed' OR length(trim(${table.cause})) > 0)`),
  check('ticket_rfos_completion_check', sql`${table.completion} IN ('pending', 'completed') AND ((${table.completion} = 'pending' AND ${table.completedAt} IS NULL) OR (${table.completion} = 'completed' AND ${table.completedAt} IS NOT NULL AND ${table.normalizedAt} IS NOT NULL AND ${table.investigation} = 'confirmed' AND length(trim(${table.technicalDescription})) > 0 AND length(trim(${table.solution})) > 0))`),
  check('ticket_rfos_identity_check', sql`${table.glpiTicketId} > 0 AND ${table.revision} >= 1`),
]);
export const ticketRfoRevisions = sqliteTable('ticket_rfo_revisions', {
  id: integer('id').primaryKey(),
  ticketId: integer('ticket_id').notNull().references(() => ticketRfos.ticketId, { onDelete: 'restrict' }),
  operationKey: text('operation_key').notNull(),
  requestHash: text('request_hash').notNull(),
  actorId: integer('actor_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  actorName: text('actor_name').notNull(),
  recordedAt: text('recorded_at').notNull(),
  revision: integer('revision').notNull(),
  snapshotJson: text('snapshot_json').notNull(),
}, (table) => [
  uniqueIndex('idx_ticket_rfo_revisions_key').on(table.operationKey),
  uniqueIndex('idx_ticket_rfo_revisions_number').on(table.ticketId, table.revision),
  check('ticket_rfo_revisions_check', sql`${table.revision} >= 1 AND json_valid(${table.snapshotJson})`),
]);

export const glpiOperations = sqliteTable('glpi_operations', {
  id: text('id').primaryKey(),
  ticketId: integer('ticket_id').notNull().references(() => tickets.id, { onDelete: 'restrict' }),
  action: text('action').notNull(),
  requestJson: text('request_json').notNull(),
  actorId: integer('actor_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  updatedBy: integer('updated_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  state: text('state').notNull(),
  code: text('code').notNull().default(''),
  remoteId: integer('remote_id').notNull(),
  solutionId: integer('solution_id'),
  observationJson: text('observation_json').notNull().default('{}'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  revision: integer('revision').notNull().default(1),
}, (table) => [
  index('idx_glpi_operations_ticket').on(table.ticketId, table.createdAt, table.id),
  uniqueIndex('idx_glpi_operations_active').on(table.ticketId).where(sql`${table.state} IN ('pending', 'uncertain')`),
  check('glpi_operations_action_check', sql`${table.action} IN ('sync', 'update', 'solution', 'close', 'associate')`),
  check('glpi_operations_state_check', sql`${table.state} IN ('pending', 'uncertain', 'confirmed', 'failed')`),
  check('glpi_operations_valid_check', sql`${table.remoteId} > 0 AND ${table.revision} >= 1 AND json_valid(${table.requestJson}) AND json_valid(${table.observationJson})`),
]);
export const glpiOperationEvents = sqliteTable('glpi_operation_events', {
  id: integer('id').primaryKey(),
  operationId: text('operation_id').notNull().references(() => glpiOperations.id, { onDelete: 'restrict' }),
  actorId: integer('actor_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  recordedAt: text('recorded_at').notNull(),
  revision: integer('revision').notNull(),
  snapshotJson: text('snapshot_json').notNull(),
}, (table) => [
  uniqueIndex('idx_glpi_operation_events_revision').on(table.operationId, table.revision),
  check('glpi_operation_events_json_check', sql`json_valid(${table.snapshotJson})`),
]);

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
