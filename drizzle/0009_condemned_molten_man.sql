CREATE TABLE `leetcode_attempts` (
	`id` text NOT NULL,
	`owner_id` text NOT NULL,
	`problem_id` text NOT NULL,
	`task_id` text,
	`attempted_on` text NOT NULL,
	`status` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`attempt_number` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_leetcode_attempts_owner_problem_number` ON `leetcode_attempts` (`owner_id`,`problem_id`,`attempt_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_leetcode_attempts_owner_task` ON `leetcode_attempts` (`owner_id`,`task_id`);--> statement-breakpoint
CREATE INDEX `idx_leetcode_attempts_owner_date` ON `leetcode_attempts` (`owner_id`,`attempted_on`);--> statement-breakpoint
CREATE TABLE `leetcode_problems` (
	`id` text NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`difficulty` text DEFAULT 'medium' NOT NULL,
	`planned_date` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `idx_leetcode_problems_owner_planned` ON `leetcode_problems` (`owner_id`,`planned_date`);--> statement-breakpoint
ALTER TABLE `tasks` ADD `leetcode_problem_id` text;--> statement-breakpoint
CREATE INDEX `idx_tasks_owner_leetcode_date` ON `tasks` (`owner_id`,`leetcode_problem_id`,`date`);