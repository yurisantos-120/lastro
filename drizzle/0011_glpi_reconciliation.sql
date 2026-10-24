CREATE TABLE `glpi_operation_events` (
	`id` integer PRIMARY KEY NOT NULL,
	`operation_id` text NOT NULL,
	`actor_id` integer NOT NULL,
	`recorded_at` text NOT NULL,
	`revision` integer NOT NULL,
	`snapshot_json` text NOT NULL,
	FOREIGN KEY (`operation_id`) REFERENCES `glpi_operations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "glpi_operation_events_json_check" CHECK(json_valid("glpi_operation_events"."snapshot_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_glpi_operation_events_revision` ON `glpi_operation_events` (`operation_id`,`revision`);--> statement-breakpoint
CREATE TABLE `glpi_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_id` integer NOT NULL,
	`action` text NOT NULL,
	`request_json` text NOT NULL,
	`actor_id` integer NOT NULL,
	`updated_by` integer NOT NULL,
	`state` text NOT NULL,
	`code` text DEFAULT '' NOT NULL,
	`remote_id` integer NOT NULL,
	`solution_id` integer,
	`observation_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "glpi_operations_action_check" CHECK("glpi_operations"."action" IN ('sync', 'update', 'solution', 'close', 'associate')),
	CONSTRAINT "glpi_operations_state_check" CHECK("glpi_operations"."state" IN ('pending', 'uncertain', 'confirmed', 'failed')),
	CONSTRAINT "glpi_operations_valid_check" CHECK("glpi_operations"."remote_id" > 0 AND "glpi_operations"."revision" >= 1 AND json_valid("glpi_operations"."request_json") AND json_valid("glpi_operations"."observation_json"))
);
--> statement-breakpoint
CREATE INDEX `idx_glpi_operations_ticket` ON `glpi_operations` (`ticket_id`,`created_at`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_glpi_operations_active` ON `glpi_operations` (`ticket_id`) WHERE "glpi_operations"."state" IN ('pending', 'uncertain');--> statement-breakpoint
ALTER TABLE `tickets` ADD `creation_fingerprint` text;--> statement-breakpoint
CREATE TRIGGER glpi_operations_insert_history AFTER INSERT ON glpi_operations BEGIN
  INSERT INTO glpi_operation_events(operation_id,actor_id,recorded_at,revision,snapshot_json)
  VALUES(NEW.id,NEW.updated_by,NEW.updated_at,NEW.revision,json_object('action',NEW.action,'state',NEW.state,'code',NEW.code,'remoteId',NEW.remote_id,'solutionId',NEW.solution_id,'request',json(NEW.request_json),'observation',json(NEW.observation_json), 'previousStatus',(SELECT status FROM tickets WHERE id=NEW.ticket_id),'previousCreationState',(SELECT result_state FROM tickets WHERE id=NEW.ticket_id),'previousFailureCode',(SELECT failure_code FROM tickets WHERE id=NEW.ticket_id)));
END;
--> statement-breakpoint
CREATE TRIGGER glpi_operations_update_history AFTER UPDATE ON glpi_operations BEGIN
  INSERT INTO glpi_operation_events(operation_id,actor_id,recorded_at,revision,snapshot_json)
  VALUES(NEW.id,NEW.updated_by,NEW.updated_at,NEW.revision,json_object('action',NEW.action,'state',NEW.state,'code',NEW.code,'remoteId',NEW.remote_id,'solutionId',NEW.solution_id,'request',json(NEW.request_json),'observation',json(NEW.observation_json)));
END;
--> statement-breakpoint
CREATE TRIGGER glpi_operation_events_no_update BEFORE UPDATE ON glpi_operation_events BEGIN SELECT RAISE(ABORT,'immutable integration history'); END;
--> statement-breakpoint
CREATE TRIGGER glpi_operation_events_no_delete BEFORE DELETE ON glpi_operation_events BEGIN SELECT RAISE(ABORT,'immutable integration history'); END;
--> statement-breakpoint
CREATE TRIGGER glpi_operations_identity BEFORE UPDATE ON glpi_operations
WHEN NEW.id<>OLD.id OR NEW.ticket_id<>OLD.ticket_id OR NEW.actor_id<>OLD.actor_id OR NEW.action<>OLD.action OR NEW.request_json<>OLD.request_json OR NEW.remote_id<>OLD.remote_id OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1 OR OLD.state IN ('confirmed','failed')
BEGIN SELECT RAISE(ABORT,'invalid integration transition'); END;
--> statement-breakpoint
CREATE TRIGGER tickets_creation_fingerprint_immutable BEFORE UPDATE OF creation_fingerprint ON tickets
WHEN NEW.creation_fingerprint IS NOT OLD.creation_fingerprint
BEGIN SELECT RAISE(ABORT,'immutable creation fingerprint'); END;

