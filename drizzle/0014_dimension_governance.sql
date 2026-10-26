CREATE TABLE `dimension_values` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`display_name` text NOT NULL,
	`normalized_key` text NOT NULL,
	`state_code` text,
	`status` text NOT NULL DEFAULT 'approved',
	`revision` integer NOT NULL DEFAULT 1,
	`created_by` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_by` integer NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `dimension_values_kind_check` CHECK(`kind` IN ('municipality','client','operational_region')),
	CONSTRAINT `dimension_values_status_check` CHECK(`status` IN ('approved','retired')),
	CONSTRAINT `dimension_values_name_check` CHECK(length(trim(`display_name`)) BETWEEN 1 AND 160),
	CONSTRAINT `dimension_values_revision_check` CHECK(`revision` >= 1),
	CONSTRAINT `dimension_values_municipality_state_check` CHECK((`kind`='municipality' AND `state_code` GLOB '[A-Z][A-Z]') OR (`kind`<>'municipality' AND `state_code` IS NULL))
);
--> statement-breakpoint
CREATE TABLE `dimension_name_keys` (
	`kind` text NOT NULL,
	`normalized_key` text NOT NULL,
	`value_id` text NOT NULL,
	`alias_id` text,
	`created_at` text NOT NULL,
	PRIMARY KEY(`kind`,`normalized_key`),
	FOREIGN KEY (`value_id`) REFERENCES `dimension_values`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `dimension_name_keys_kind_check` CHECK(`kind` IN ('municipality','client','operational_region')),
	CONSTRAINT `dimension_name_keys_key_check` CHECK(length(trim(`normalized_key`)) BETWEEN 1 AND 160)
);
--> statement-breakpoint
CREATE TABLE `dimension_aliases` (
	`id` text PRIMARY KEY NOT NULL,
	`value_id` text NOT NULL,
	`display_name` text NOT NULL,
	`normalized_key` text NOT NULL,
	`status` text NOT NULL DEFAULT 'approved',
	`revision` integer NOT NULL DEFAULT 1,
	`created_by` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_by` integer NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`value_id`) REFERENCES `dimension_values`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `dimension_aliases_status_check` CHECK(`status` IN ('approved','retired')),
	CONSTRAINT `dimension_aliases_name_check` CHECK(length(trim(`display_name`)) BETWEEN 1 AND 160),
	CONSTRAINT `dimension_aliases_revision_check` CHECK(`revision` >= 1)
);
--> statement-breakpoint
CREATE INDEX `idx_dimension_aliases_value` ON `dimension_aliases` (`value_id`,`status`);
--> statement-breakpoint
CREATE TABLE `dimension_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`proposed_name` text NOT NULL,
	`normalized_key` text NOT NULL,
	`state_code` text,
	`justification` text NOT NULL,
	`status` text NOT NULL DEFAULT 'submitted',
	`requester_id` integer NOT NULL,
	`submitted_at` text NOT NULL,
	`decided_by` integer,
	`decided_at` text,
	`decision_reason` text NOT NULL DEFAULT '',
	`value_id` text,
	`revision` integer NOT NULL DEFAULT 1,
	FOREIGN KEY (`requester_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`decided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`value_id`) REFERENCES `dimension_values`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `dimension_requests_kind_check` CHECK(`kind` IN ('municipality','client','operational_region')),
	CONSTRAINT `dimension_requests_status_check` CHECK(`status` IN ('submitted','approved','rejected','withdrawn')),
	CONSTRAINT `dimension_requests_name_check` CHECK(length(trim(`proposed_name`)) BETWEEN 1 AND 160),
	CONSTRAINT `dimension_requests_justification_check` CHECK(length(trim(`justification`)) BETWEEN 1 AND 1000),
	CONSTRAINT `dimension_requests_revision_check` CHECK(`revision` >= 1),
	CONSTRAINT `dimension_requests_decision_check` CHECK((`status`='submitted' AND `decided_by` IS NULL AND `decided_at` IS NULL AND `value_id` IS NULL) OR (`status`='approved' AND `decided_by` IS NOT NULL AND `decided_at` IS NOT NULL AND `value_id` IS NOT NULL AND length(trim(`decision_reason`))>0) OR (`status`='rejected' AND `decided_by` IS NOT NULL AND `decided_at` IS NOT NULL AND `value_id` IS NULL AND length(trim(`decision_reason`))>0) OR (`status`='withdrawn' AND `decided_by` IS NULL AND `decided_at` IS NULL AND `value_id` IS NULL))
);
--> statement-breakpoint
CREATE INDEX `idx_dimension_requests_requester` ON `dimension_requests` (`requester_id`,`submitted_at`,`id`);
--> statement-breakpoint
CREATE INDEX `idx_dimension_requests_status` ON `dimension_requests` (`status`,`submitted_at`,`id`);
--> statement-breakpoint
CREATE TABLE `dimension_request_events` (
	`id` integer PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`event_type` text NOT NULL,
	`actor_id` integer NOT NULL,
	`recorded_at` text NOT NULL,
	`revision` integer NOT NULL,
	`description` text NOT NULL DEFAULT '',
	`snapshot_json` text NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `dimension_requests`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `dimension_request_events_type_check` CHECK(`event_type` IN ('submitted','approved','rejected','withdrawn')),
	CONSTRAINT `dimension_request_events_revision_check` CHECK(`revision` >= 1),
	CONSTRAINT `dimension_request_events_json_check` CHECK(json_valid(`snapshot_json`))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_dimension_request_events_revision` ON `dimension_request_events` (`request_id`,`revision`);
--> statement-breakpoint
CREATE INDEX `idx_dimension_request_events_history` ON `dimension_request_events` (`request_id`,`recorded_at`,`id`);
--> statement-breakpoint
CREATE TABLE `dimension_operations` (
	`operation_key` text PRIMARY KEY NOT NULL,
	`actor_id` integer NOT NULL,
	`request_hash` text NOT NULL,
	`response_json` text NOT NULL,
	`recorded_at` text NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `dimension_operations_hash_check` CHECK(length(`request_hash`)=64 AND `request_hash` NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT `dimension_operations_response_check` CHECK(json_valid(`response_json`) AND length(`response_json`)<=131072)
);
--> statement-breakpoint
CREATE INDEX `idx_dimension_operations_actor_time` ON `dimension_operations` (`actor_id`,`recorded_at`);
