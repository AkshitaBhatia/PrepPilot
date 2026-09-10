CREATE TABLE `reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`scheduled_at` integer NOT NULL,
	`repeat_rule` text DEFAULT 'none' NOT NULL,
	`subject_id` text,
	`chapter_id` text,
	`topic_id` text,
	`related_name` text,
	`enabled` integer DEFAULT true NOT NULL,
	`notification_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`sync_status` text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `reminders_user_time_idx` ON `reminders` (`user_id`,`deleted_at`,`scheduled_at`);--> statement-breakpoint
CREATE INDEX `reminders_sync_idx` ON `reminders` (`sync_status`);