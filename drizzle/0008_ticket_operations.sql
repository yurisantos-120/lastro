CREATE TABLE `ticket_operation_events` (
	`id` integer PRIMARY KEY NOT NULL,
	`ticket_id` integer NOT NULL,
	`operation_key` text NOT NULL,
	`request_json` text NOT NULL,
	`actor_id` integer NOT NULL,
	`actor_name` text NOT NULL,
	`occurred_at` text NOT NULL,
	`type` text NOT NULL,
	`previous_state` text,
	`next_state` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`snapshot_json` text NOT NULL,
	`revision` integer NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `ticket_operations`(`ticket_id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ticket_operation_events_type_check" CHECK("ticket_operation_events"."type" IN ('initialized', 'state_changed', 'updated')),
	CONSTRAINT "ticket_operation_events_state_check" CHECK("ticket_operation_events"."next_state" IN ('in_progress', 'pending', 'normalized', 'closed') AND ("ticket_operation_events"."previous_state" IS NULL OR "ticket_operation_events"."previous_state" IN ('in_progress', 'pending', 'normalized', 'closed'))),
	CONSTRAINT "ticket_operation_events_revision_check" CHECK("ticket_operation_events"."revision" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ticket_operation_events_key` ON `ticket_operation_events` (`operation_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ticket_operation_events_revision` ON `ticket_operation_events` (`ticket_id`,`revision`);--> statement-breakpoint
CREATE INDEX `idx_ticket_operation_events_chronology` ON `ticket_operation_events` (`ticket_id`,`occurred_at`,`id`);--> statement-breakpoint
CREATE TABLE `ticket_operations` (
	`ticket_id` integer PRIMARY KEY NOT NULL,
	`occurrence_type` text DEFAULT '' NOT NULL,
	`route_description` text DEFAULT '' NOT NULL,
	`route_id` integer,
	`responsible_organization` text DEFAULT '' NOT NULL,
	`state` text NOT NULL,
	`pending_reason` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`guidance` text DEFAULT '' NOT NULL,
	`opened_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`normalized_at` text,
	`closed_at` text,
	`updated_by` integer NOT NULL,
	`revision` integer NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`route_id`) REFERENCES `information`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ticket_operations_state_check" CHECK("ticket_operations"."state" IN ('in_progress', 'pending', 'normalized', 'closed')),
	CONSTRAINT "ticket_operations_pending_check" CHECK("ticket_operations"."state" <> 'pending' OR length(trim("ticket_operations"."pending_reason")) > 0),
	CONSTRAINT "ticket_operations_revision_check" CHECK("ticket_operations"."revision" >= 1),
	CONSTRAINT "ticket_operations_dates_check" CHECK(("ticket_operations"."state" <> 'normalized' OR "ticket_operations"."normalized_at" IS NOT NULL) AND (("ticket_operations"."state" = 'closed' AND "ticket_operations"."closed_at" IS NOT NULL) OR ("ticket_operations"."state" <> 'closed' AND "ticket_operations"."closed_at" IS NULL)))
);
--> statement-breakpoint
CREATE INDEX `idx_ticket_operations_state_updated` ON `ticket_operations` (`state`,`updated_at`);
--> statement-breakpoint
-- Operational history is append-only. Corrections are new movements, never edits.
CREATE TRIGGER `ticket_operation_events_no_update` BEFORE UPDATE ON `ticket_operation_events`
BEGIN SELECT RAISE(ABORT, 'Operational history is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `ticket_operation_events_no_delete` BEFORE DELETE ON `ticket_operation_events`
BEGIN SELECT RAISE(ABORT, 'Operational history is immutable'); END;
