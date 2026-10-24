CREATE TABLE `data_operations` (
	`operation_key` text PRIMARY KEY NOT NULL,
	`actor_id` integer NOT NULL,
	`method` text NOT NULL,
	`kind` text NOT NULL,
	`request_hash` text NOT NULL,
	`response_json` text NOT NULL,
	`recorded_at` text NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "data_operations_method_check" CHECK("data_operations"."method" IN ('POST','PUT')),
	CONSTRAINT "data_operations_kind_check" CHECK("data_operations"."kind" IN ('category','record')),
	CONSTRAINT "data_operations_hash_check" CHECK(length("data_operations"."request_hash")=64 AND "data_operations"."request_hash" NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "data_operations_response_check" CHECK(json_valid("data_operations"."response_json") AND length("data_operations"."response_json")<=131072)
);
--> statement-breakpoint
CREATE INDEX `idx_data_operations_actor_time` ON `data_operations` (`actor_id`,`recorded_at`);