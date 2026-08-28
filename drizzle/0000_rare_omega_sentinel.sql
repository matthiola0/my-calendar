CREATE TABLE `day_entries` (
	`owner_id` text NOT NULL,
	`date` text NOT NULL,
	`activity` text DEFAULT '' NOT NULL,
	`reflection` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `date`)
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`date` text NOT NULL,
	`text` text NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_tasks_owner_date_position` ON `tasks` (`owner_id`,`date`,`position`);