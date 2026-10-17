CREATE TABLE `tickets` (
	`id` integer PRIMARY KEY NOT NULL,
	`operation_key` text NOT NULL,
	`glpi_ticket_id` integer,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`status` integer,
	`result_state` text DEFAULT 'pending' NOT NULL,
	`failure_code` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`glpi_created_at` text,
	`last_synced_at` text,
	`created_by` integer,
	`revision` integer DEFAULT 1 NOT NULL,
	CONSTRAINT "tickets_result_state_check" CHECK("tickets"."result_state" IN ('pending', 'created', 'failed', 'uncertain'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_tickets_operation_key` ON `tickets` (`operation_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_tickets_glpi_ticket_id` ON `tickets` (`glpi_ticket_id`);--> statement-breakpoint
CREATE INDEX `idx_tickets_created_at` ON `tickets` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_tickets_result_state` ON `tickets` (`result_state`);