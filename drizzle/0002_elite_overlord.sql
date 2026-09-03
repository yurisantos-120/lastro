ALTER TABLE `categories` ADD `scope` text DEFAULT 'general' NOT NULL;--> statement-breakpoint
ALTER TABLE `information` ADD `kind` text DEFAULT 'general' NOT NULL;--> statement-breakpoint
ALTER TABLE `information` ADD `details_json` text DEFAULT '{}' NOT NULL;