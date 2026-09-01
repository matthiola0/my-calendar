CREATE TABLE `leetcode_lists` (
	`id` text NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `idx_leetcode_lists_owner_position` ON `leetcode_lists` (`owner_id`,`position`);--> statement-breakpoint
ALTER TABLE `leetcode_problems` ADD `list_id` text;--> statement-breakpoint
ALTER TABLE `leetcode_problems` ADD `list_position` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_leetcode_problems_owner_list_position` ON `leetcode_problems` (`owner_id`,`list_id`,`list_position`);