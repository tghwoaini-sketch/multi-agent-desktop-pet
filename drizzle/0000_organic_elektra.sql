CREATE TABLE `state_chunks` (
	`key` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`key`, `chunk_index`)
);
--> statement-breakpoint
CREATE TABLE `state_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`updated_at` text NOT NULL,
	`chunk_count` integer NOT NULL,
	`size_bytes` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `state_revision_chunks` (
	`revision_id` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`revision_id`, `chunk_index`)
);
--> statement-breakpoint
CREATE TABLE `state_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`saved_at` text NOT NULL,
	`chunk_count` integer NOT NULL,
	`size_bytes` integer NOT NULL
);
