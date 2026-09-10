CREATE TABLE `flashcards` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`topic_id` text,
	`topic_name` text,
	`front` text NOT NULL,
	`back` text NOT NULL,
	`ease_factor` real DEFAULT 2.5 NOT NULL,
	`interval_days` integer DEFAULT 0 NOT NULL,
	`repetitions` integer DEFAULT 0 NOT NULL,
	`lapses` integer DEFAULT 0 NOT NULL,
	`due_at` integer NOT NULL,
	`last_reviewed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`sync_status` text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `flashcards_user_due_idx` ON `flashcards` (`user_id`,`deleted_at`,`due_at`);--> statement-breakpoint
CREATE INDEX `flashcards_topic_idx` ON `flashcards` (`topic_id`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `flashcards_sync_idx` ON `flashcards` (`sync_status`);