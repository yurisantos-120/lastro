CREATE TABLE `__new_users` (
	`id` integer PRIMARY KEY NOT NULL,
	`glpi_user_id` integer NOT NULL,
	`name` text NOT NULL,
	`username` text NOT NULL,
	`role` text DEFAULT 'viewer' NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "users_glpi_user_id_check" CHECK("__new_users"."glpi_user_id" > 0),
	CONSTRAINT "users_name_check" CHECK(length(trim("__new_users"."name")) > 0),
	CONSTRAINT "users_username_normalized_check" CHECK(length("__new_users"."username") > 0 AND "__new_users"."username" = lower(trim("__new_users"."username"))),
	CONSTRAINT "users_role_check" CHECK("__new_users"."role" IN ('viewer', 'operator', 'admin')),
	CONSTRAINT "users_active_check" CHECK("__new_users"."active" IN (0, 1)),
	CONSTRAINT "users_revision_check" CHECK("__new_users"."revision" >= 1)
);
--> statement-breakpoint
-- Existing local-password accounts cannot be mapped safely to GLPI identities.
-- NULL violates NOT NULL, intentionally aborting rather than inventing a GLPI ID.
INSERT INTO `__new_users`("id", "glpi_user_id", "name", "username", "role", "active", "revision", "created_at", "updated_at")
SELECT "id", NULL, "name", "username", "role", "active", "revision", "created_at", "updated_at" FROM `users`;
--> statement-breakpoint
DROP TABLE `users`;
--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_glpi_user_id` ON `users` (`glpi_user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_username` ON `users` (`username`);
