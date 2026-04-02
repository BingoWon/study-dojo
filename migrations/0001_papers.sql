CREATE TABLE `papers` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`r2_key` text NOT NULL,
	`chunks` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);

CREATE INDEX `idx_papers_user_id` ON `papers` (`user_id`);
