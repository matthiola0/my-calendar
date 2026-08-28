CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_rate_limits_window_start` ON `rate_limits` (`window_start`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_tasks` (
	`id` text NOT NULL,
	`owner_id` text NOT NULL,
	`date` text NOT NULL,
	`text` text NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `id`)
);
--> statement-breakpoint
INSERT INTO `__new_tasks`("id", "owner_id", "date", "text", "done", "position", "created_at", "updated_at") SELECT "id", "owner_id", "date", "text", "done", "position", "created_at", "updated_at" FROM `tasks`;--> statement-breakpoint
DROP TABLE `tasks`;--> statement-breakpoint
ALTER TABLE `__new_tasks` RENAME TO `tasks`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_tasks_owner_date_position` ON `tasks` (`owner_id`,`date`,`position`);--> statement-breakpoint
ALTER TABLE `day_entries` ADD `revision` text DEFAULT '' NOT NULL;--> statement-breakpoint
PRAGMA optimize;
