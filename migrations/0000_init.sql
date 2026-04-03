CREATE TABLE `threads` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text DEFAULT '新对话' NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);

CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`role` text NOT NULL,
	`parts` text NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `threads`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `papers` (
	`id` text PRIMARY KEY NOT NULL,
	`hash` text NOT NULL UNIQUE,
	`r2_key` text NOT NULL,
	`markdown_r2_key` text,
	`chunks` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'processing' NOT NULL,
	`job_id` text,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);

CREATE TABLE `user_papers` (
	`user_id` text NOT NULL,
	`paper_id` text NOT NULL REFERENCES `papers`(`id`),
	`title` text DEFAULT '新论文' NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	PRIMARY KEY (`user_id`, `paper_id`)
);

CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`source` text,
	`paper_id` text,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);

CREATE INDEX `idx_threads_user_id` ON `threads` (`user_id`);
CREATE INDEX `idx_messages_thread_id` ON `messages` (`thread_id`);
CREATE INDEX `idx_papers_hash` ON `papers` (`hash`);
CREATE INDEX `idx_user_papers_user_id` ON `user_papers` (`user_id`);
CREATE INDEX `idx_documents_paper_id` ON `documents` (`paper_id`);
