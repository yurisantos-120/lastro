CREATE TABLE `auth_bootstrap` (
	`id` integer PRIMARY KEY NOT NULL,
	`completed_at` text,
	CONSTRAINT "auth_bootstrap_singleton_check" CHECK("auth_bootstrap"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` integer PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "sessions_token_hash_check" CHECK(length("sessions"."token_hash") > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sessions_token_hash` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_sessions_user_id` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_sessions_expires_at` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'viewer' NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`password_reset_required` integer DEFAULT 1 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "users_name_check" CHECK(length(trim("users"."name")) > 0),
	CONSTRAINT "users_username_normalized_check" CHECK(length("users"."username") > 0 AND "users"."username" = lower(trim("users"."username"))),
	CONSTRAINT "users_password_hash_check" CHECK(length("users"."password_hash") > 0),
	CONSTRAINT "users_role_check" CHECK("users"."role" IN ('viewer', 'operator', 'admin')),
	CONSTRAINT "users_active_check" CHECK("users"."active" IN (0, 1)),
	CONSTRAINT "users_password_reset_required_check" CHECK("users"."password_reset_required" IN (0, 1)),
	CONSTRAINT "users_revision_check" CHECK("users"."revision" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_username` ON `users` (`username`);
--> statement-breakpoint
INSERT INTO `auth_bootstrap` (`id`, `completed_at`) VALUES (1, NULL);
