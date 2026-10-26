CREATE INDEX `idx_information_point_municipality_key` ON `information` (`kind`, json_extract(`details_json`, '$.municipalityKey'));
--> statement-breakpoint
CREATE INDEX `idx_information_point_client_key` ON `information` (`kind`, json_extract(`details_json`, '$.clientKey'));
--> statement-breakpoint
CREATE INDEX `idx_information_point_region_key` ON `information` (`kind`, json_extract(`details_json`, '$.operationalRegionKey'));
