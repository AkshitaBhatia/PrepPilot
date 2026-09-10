CREATE TABLE `subtopics` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`topic_id` text NOT NULL,
	`name` text NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`completed_changed_at` integer,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`sync_status` text DEFAULT 'pending' NOT NULL,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `subtopics_topic_position_idx` ON `subtopics` (`topic_id`,`deleted_at`,`position`);--> statement-breakpoint
CREATE INDEX `subtopics_sync_idx` ON `subtopics` (`sync_status`);--> statement-breakpoint
CREATE INDEX `subtopics_user_completed_idx` ON `subtopics` (`user_id`,`deleted_at`,`completed`);--> statement-breakpoint
ALTER TABLE `topics` ADD `note` text;