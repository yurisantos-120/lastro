CREATE TABLE `import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`source_manifest_id` text NOT NULL,
	`manifest_sha256` text NOT NULL,
	`status` text DEFAULT 'processing' NOT NULL,
	`created_at` text NOT NULL,
	`completed_at` text,
	`records_processed` integer DEFAULT 0 NOT NULL,
	`records_inserted` integer DEFAULT 0 NOT NULL,
	`records_rejected` integer DEFAULT 0 NOT NULL,
	`records_ignored` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "import_batches_manifest_id_check" CHECK(length(trim("import_batches"."source_manifest_id")) BETWEEN 1 AND 160),
	CONSTRAINT "import_batches_manifest_sha256_check" CHECK(length("import_batches"."manifest_sha256") = 64 AND "import_batches"."manifest_sha256" NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "import_batches_status_check" CHECK("import_batches"."status" IN ('processing', 'completed', 'completed_with_errors', 'failed')),
	CONSTRAINT "import_batches_counts_check" CHECK("import_batches"."records_processed" = "import_batches"."records_inserted" + "import_batches"."records_rejected" + "import_batches"."records_ignored" AND "import_batches"."records_processed" >= 0),
	CONSTRAINT "import_batches_completion_check" CHECK(("import_batches"."status" = 'processing' AND "import_batches"."completed_at" IS NULL) OR ("import_batches"."status" <> 'processing' AND "import_batches"."completed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `idx_import_batches_status_created` ON `import_batches` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_import_batches_manifest_hash` ON `import_batches` (`manifest_sha256`);--> statement-breakpoint
CREATE TABLE `import_records` (
	`id` integer PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`information_id` integer,
	`source_file_id` text NOT NULL,
	`source_file_name` text NOT NULL,
	`source_file_sha256` text NOT NULL,
	`source_sheet` text NOT NULL,
	`source_row` integer NOT NULL,
	`origin_key` text NOT NULL,
	`normalized_fingerprint` text NOT NULL,
	`status` text NOT NULL,
	`processed_at` text,
	FOREIGN KEY (`batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`information_id`) REFERENCES `information`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "import_records_source_file_id_check" CHECK(length(trim("import_records"."source_file_id")) BETWEEN 1 AND 160 AND instr("import_records"."source_file_id", '/') = 0 AND instr("import_records"."source_file_id", char(92)) = 0),
	CONSTRAINT "import_records_file_name_check" CHECK(length(trim("import_records"."source_file_name")) BETWEEN 1 AND 255 AND instr("import_records"."source_file_name", '/') = 0 AND instr("import_records"."source_file_name", char(92)) = 0),
	CONSTRAINT "import_records_source_file_sha256_check" CHECK(length("import_records"."source_file_sha256") = 64 AND "import_records"."source_file_sha256" NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "import_records_source_sheet_check" CHECK(length(trim("import_records"."source_sheet")) BETWEEN 1 AND 160),
	CONSTRAINT "import_records_source_row_check" CHECK("import_records"."source_row" BETWEEN 1 AND 10000000),
	CONSTRAINT "import_records_origin_key_check" CHECK(length("import_records"."origin_key") = 64 AND "import_records"."origin_key" NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "import_records_fingerprint_check" CHECK(length("import_records"."normalized_fingerprint") = 64 AND "import_records"."normalized_fingerprint" NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "import_records_status_check" CHECK("import_records"."status" IN ('pending', 'inserted', 'rejected', 'ignored')),
	CONSTRAINT "import_records_target_check" CHECK(("import_records"."status" = 'inserted' AND "import_records"."information_id" IS NOT NULL AND "import_records"."processed_at" IS NOT NULL) OR ("import_records"."status" = 'pending' AND "import_records"."information_id" IS NULL AND "import_records"."processed_at" IS NULL) OR ("import_records"."status" IN ('rejected', 'ignored') AND "import_records"."information_id" IS NULL AND "import_records"."processed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_import_records_origin_key` ON `import_records` (`origin_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_import_records_source_location` ON `import_records` (`source_file_id`,`source_sheet`,`source_row`);--> statement-breakpoint
CREATE INDEX `idx_import_records_batch_id` ON `import_records` (`batch_id`);--> statement-breakpoint
CREATE INDEX `idx_import_records_information_id` ON `import_records` (`information_id`);--> statement-breakpoint
CREATE INDEX `idx_import_records_source_hash` ON `import_records` (`source_file_sha256`);