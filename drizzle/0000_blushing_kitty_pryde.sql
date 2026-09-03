CREATE TABLE `categories` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`color` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `information` (
	`id` integer PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`category_id` integer NOT NULL,
	`responsible` text NOT NULL,
	`validation` text NOT NULL,
	`contact` text NOT NULL,
	`notes` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
