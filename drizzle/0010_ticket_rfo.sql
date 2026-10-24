CREATE TABLE `ticket_rfo_revisions` (
	`id` integer PRIMARY KEY NOT NULL,
	`ticket_id` integer NOT NULL,
	`operation_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`actor_id` integer NOT NULL,
	`actor_name` text NOT NULL,
	`recorded_at` text NOT NULL,
	`revision` integer NOT NULL,
	`snapshot_json` text NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `ticket_rfos`(`ticket_id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ticket_rfo_revisions_check" CHECK("ticket_rfo_revisions"."revision" >= 1 AND json_valid("ticket_rfo_revisions"."snapshot_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ticket_rfo_revisions_key` ON `ticket_rfo_revisions` (`operation_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ticket_rfo_revisions_number` ON `ticket_rfo_revisions` (`ticket_id`,`revision`);--> statement-breakpoint
CREATE TABLE `ticket_rfos` (
	`ticket_id` integer PRIMARY KEY NOT NULL,
	`glpi_ticket_id` integer NOT NULL,
	`investigation` text NOT NULL,
	`completion` text NOT NULL,
	`cause` text DEFAULT '' NOT NULL,
	`technical_description` text DEFAULT '' NOT NULL,
	`solution` text DEFAULT '' NOT NULL,
	`responsible_team` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`normalized_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`completed_at` text,
	`updated_by` integer NOT NULL,
	`revision` integer NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ticket_rfos_investigation_check" CHECK("ticket_rfos"."investigation" IN ('investigating', 'confirmed') AND ("ticket_rfos"."investigation" <> 'confirmed' OR length(trim("ticket_rfos"."cause")) > 0)),
	CONSTRAINT "ticket_rfos_completion_check" CHECK("ticket_rfos"."completion" IN ('pending', 'completed') AND (("ticket_rfos"."completion" = 'pending' AND "ticket_rfos"."completed_at" IS NULL) OR ("ticket_rfos"."completion" = 'completed' AND "ticket_rfos"."completed_at" IS NOT NULL AND "ticket_rfos"."normalized_at" IS NOT NULL AND "ticket_rfos"."investigation" = 'confirmed' AND length(trim("ticket_rfos"."technical_description")) > 0 AND length(trim("ticket_rfos"."solution")) > 0))),
	CONSTRAINT "ticket_rfos_identity_check" CHECK("ticket_rfos"."glpi_ticket_id" > 0 AND "ticket_rfos"."revision" >= 1)
);
--> statement-breakpoint
CREATE INDEX `idx_ticket_rfos_completion` ON `ticket_rfos` (`completion`,`updated_at`);
--> statement-breakpoint
CREATE TRIGGER `ticket_rfo_revisions_no_update` BEFORE UPDATE ON `ticket_rfo_revisions`
BEGIN SELECT RAISE(ABORT, 'RFO history is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `ticket_rfo_revisions_no_delete` BEFORE DELETE ON `ticket_rfo_revisions`
BEGIN SELECT RAISE(ABORT, 'RFO history is immutable'); END;
