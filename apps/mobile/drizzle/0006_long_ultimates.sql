CREATE TABLE `trackers` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`template_id` text,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`sync_status` text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `trackers_user_position_idx` ON `trackers` (`user_id`,`deleted_at`,`position`);--> statement-breakpoint
CREATE INDEX `trackers_sync_idx` ON `trackers` (`sync_status`);--> statement-breakpoint
ALTER TABLE `flashcards` ADD `tracker_id` text;--> statement-breakpoint
ALTER TABLE `reminders` ADD `tracker_id` text;--> statement-breakpoint
ALTER TABLE `study_sessions` ADD `tracker_id` text;--> statement-breakpoint
ALTER TABLE `subjects` ADD `tracker_id` text;--> statement-breakpoint
CREATE INDEX `subjects_tracker_idx` ON `subjects` (`tracker_id`,`deleted_at`,`position`);