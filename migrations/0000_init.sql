CREATE TABLE `threads` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text DEFAULT '新对话' NOT NULL,
	`persona` text DEFAULT 'professor' NOT NULL,
	`mode` text DEFAULT 'text' NOT NULL,
	`doc_id` text,
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

CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`hash` text NOT NULL UNIQUE,
	`r2_key` text NOT NULL,
	`file_ext` text,
	`markdown_r2_key` text,
	`translated_r2_key` text,
	`lang` text,
	`chunks` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'uploading' NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);

CREATE TABLE `user_documents` (
	`user_id` text NOT NULL,
	`doc_id` text NOT NULL REFERENCES `documents`(`id`),
	`title` text DEFAULT '新文档' NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	PRIMARY KEY (`user_id`, `doc_id`)
);

CREATE TABLE `chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`doc_id` text,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);

CREATE INDEX `idx_threads_user_id` ON `threads` (`user_id`);
CREATE INDEX `idx_messages_thread_id` ON `messages` (`thread_id`);
CREATE INDEX `idx_documents_hash` ON `documents` (`hash`);
CREATE INDEX `idx_user_documents_user_id` ON `user_documents` (`user_id`);
CREATE INDEX `idx_chunks_doc_id` ON `chunks` (`doc_id`);
