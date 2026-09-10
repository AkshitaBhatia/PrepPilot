CREATE TABLE `study_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`subject_id` text,
	`chapter_id` text,
	`topic_id` text,
	`subject_name` text,
	`chapter_name` text,
	`topic_name` text,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`duration_seconds` integer DEFAULT 0 NOT NULL,
	`timer_mode` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`sync_status` text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `study_sessions_user_started_idx` ON `study_sessions` (`user_id`,`deleted_at`,`started_at`);--> statement-breakpoint
CREATE INDEX `study_sessions_subject_idx` ON `study_sessions` (`subject_id`);--> statement-breakpoint
CREATE INDEX `study_sessions_sync_idx` ON `study_sessions` (`sync_status`);--> statement-breakpoint
CREATE INDEX `study_sessions_status_idx` ON `study_sessions` (`user_id`,`status`);