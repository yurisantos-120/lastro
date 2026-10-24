CREATE TABLE `shift_handoffs` (
	`id` text PRIMARY KEY NOT NULL,
	`operation_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`period_key` text NOT NULL,
	`config_json` text NOT NULL,
	`period_json` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`guidance` text DEFAULT '' NOT NULL,
	`delivered_by` integer NOT NULL,
	`delivered_name` text NOT NULL,
	`delivered_at` text NOT NULL,
	FOREIGN KEY (`delivered_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "shift_handoffs_json_check" CHECK(json_valid("shift_handoffs"."config_json") AND json_valid("shift_handoffs"."period_json") AND json_valid("shift_handoffs"."snapshot_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_shift_handoffs_key` ON `shift_handoffs` (`operation_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_shift_handoffs_period` ON `shift_handoffs` (`period_key`);--> statement-breakpoint
CREATE INDEX `idx_shift_handoffs_delivered` ON `shift_handoffs` (`delivered_at`,`id`);--> statement-breakpoint
CREATE TABLE `shift_receipts` (
	`handoff_id` text PRIMARY KEY NOT NULL,
	`operation_key` text NOT NULL,
	`received_by` integer NOT NULL,
	`received_name` text NOT NULL,
	`received_at` text NOT NULL,
	FOREIGN KEY (`handoff_id`) REFERENCES `shift_handoffs`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`received_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_shift_receipts_key` ON `shift_receipts` (`operation_key`);
--> statement-breakpoint
CREATE TRIGGER `shift_handoffs_no_update` BEFORE UPDATE ON `shift_handoffs`
BEGIN SELECT RAISE(ABORT, 'Handoff history is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `shift_handoffs_no_delete` BEFORE DELETE ON `shift_handoffs`
BEGIN SELECT RAISE(ABORT, 'Handoff history is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `shift_receipts_no_update` BEFORE UPDATE ON `shift_receipts`
BEGIN SELECT RAISE(ABORT, 'Receipt history is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `shift_receipts_no_delete` BEFORE DELETE ON `shift_receipts`
BEGIN SELECT RAISE(ABORT, 'Receipt history is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `shift_receipts_distinct_actor` BEFORE INSERT ON `shift_receipts`
WHEN NEW.received_by = (SELECT delivered_by FROM shift_handoffs WHERE id=NEW.handoff_id)
BEGIN SELECT RAISE(ABORT, 'Receipt requires another operator'); END;
