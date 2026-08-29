ALTER TABLE `cycles` ADD `reward` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `cycle_id` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `phase_id` text;--> statement-breakpoint
CREATE INDEX `idx_tasks_owner_cycle_done` ON `tasks` (`owner_id`,`cycle_id`,`done`);